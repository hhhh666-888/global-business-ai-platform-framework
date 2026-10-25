import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function tokenFor(privateKey, kid, issuer, roles, subject) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const payload = base64url(JSON.stringify({
    sub: subject,
    preferred_username: subject,
    iss: issuer,
    azp: 'gbap-web',
    iat: now,
    exp: now + 300,
    realm_access: { roles },
  }));
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

async function listen(server) {
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  return server.address().port;
}

async function requestJson(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json();
  return { response, body };
}

function seedCore(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE provider_registration (
      id TEXT PRIMARY KEY,
      component TEXT NOT NULL,
      version TEXT NOT NULL,
      integration_mode TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      environment_scope TEXT NOT NULL,
      organization_scope TEXT,
      workspace_scope TEXT,
      lifecycle_owner TEXT NOT NULL,
      replacement_class TEXT NOT NULL,
      replacement_evidence TEXT NOT NULL,
      secret_ref TEXT,
      egress_allowlist_json TEXT NOT NULL,
      timeout_ms INTEGER NOT NULL DEFAULT 3000,
      retry_count INTEGER NOT NULL DEFAULT 0,
      failure_mode TEXT NOT NULL DEFAULT 'DEGRADE',
      contract_version TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE external_mapping (
      id TEXT PRIMARY KEY,
      business_type TEXT NOT NULL,
      business_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      external_type TEXT NOT NULL,
      external_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE crm_business_state (
      business_type TEXT NOT NULL,
      business_id TEXT NOT NULL,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (business_type, business_id)
    );
    CREATE TABLE audit_event (
      id TEXT PRIMARY KEY,
      actor_subject TEXT NOT NULL,
      actor_username TEXT,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
  `);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO provider_registration(
    id,component,version,integration_mode,endpoint,environment_scope,lifecycle_owner,replacement_class,replacement_evidence,
    egress_allowlist_json,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'test-provider', 'test', '1', 'ADAPTER', 'http://127.0.0.1:9', 'local', 'test', 'REPLACEABLE', 'TEST', '[]', now, now,
  );
  const insertMapping = db.prepare('INSERT INTO external_mapping(id,business_type,business_id,provider_id,external_type,external_id,created_at) VALUES(?,?,?,?,?,?,?)');
  insertMapping.run(randomUUID(), 'Account', 'account-ec-1', 'test-provider', 'company', 'external-1', now);
  insertMapping.run(randomUUID(), 'Account', 'account-ec-2', 'test-provider', 'company', 'external-2', now);
  db.prepare("INSERT INTO crm_business_state(business_type,business_id,state_json,updated_at) VALUES('Account',?,?,?)")
    .run('account-ec-1', JSON.stringify({ commercialName: '员工已维护商业名称', industry: 'Manufacturing' }), now);
  db.close();
}

test('TOP500 research intake stays admin-only while employees can read enriched company research data', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'gbap-research-intake-'));
  const dbPath = join(work, 'substrate.db');
  seedCore(dbPath);

  const kid = 'research-intake-test-key';
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' });
  publicJwk.kid = kid;
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';

  const jwksServer = http.createServer((req, res) => {
    if (req.url === '/certs') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ keys: [publicJwk] }));
    }
    res.writeHead(404).end();
  });
  const jwksPort = await listen(jwksServer);
  const issuer = `http://127.0.0.1:${jwksPort}/realms/gbap`;

  process.env.DB_PATH = dbPath;
  process.env.CORS_ORIGIN = 'http://127.0.0.1:8080';
  process.env.OIDC_ISSUER = issuer;
  process.env.OIDC_ALLOWED_ISSUERS = issuer;
  process.env.OIDC_JWKS_URL_INTERNAL = `http://127.0.0.1:${jwksPort}/certs`;
  process.env.OIDC_CLIENT_ID = 'gbap-web';

  const nonce = Date.now();
  const { createResearchCompanyProfileHandler } = await import(`../research-company-profile.mjs?test=${nonce}`);
  const { createResearchIntakeNativeHandler } = await import(`../research-intake-native.mjs?test=${nonce}`);
  const profileHandler = createResearchCompanyProfileHandler();
  const intakeHandler = createResearchIntakeNativeHandler();
  const apiServer = http.createServer(async (req, res) => {
    if (await intakeHandler(req, res)) return;
    if (await profileHandler(req, res)) return;
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  const apiPort = await listen(apiServer);
  const base = `http://127.0.0.1:${apiPort}`;
  const adminToken = tokenFor(privateKey, kid, issuer, ['substrate-user', 'substrate-admin'], 'research-admin');
  const employeeToken = tokenFor(privateKey, kid, issuer, ['substrate-user'], 'research-employee');

  t.after(() => {
    apiServer.close();
    jwksServer.close();
    rmSync(work, { recursive: true, force: true });
  });

  const employeeWrite = await requestJson(`${base}/api/crm-native/research-company-profiles/account-ec-1`, employeeToken, {
    method: 'PATCH',
    body: JSON.stringify({ registrationCountry: 'EC', registrationType: 'RUC', registrationId: '0999999999001' }),
  });
  assert.equal(employeeWrite.response.status, 403);

  const adminWrite = await requestJson(`${base}/api/crm-native/research-company-profiles/account-ec-1`, adminToken, {
    method: 'PATCH',
    body: JSON.stringify({
      batchId: 'batch-test-1',
      registrationCountry: 'EC',
      registrationType: 'RUC',
      registrationId: '0999999999001',
      commercialName: '研究表商业名称不得覆盖',
      verificationGrade: 'A+',
      strategicValueScore: 92,
      researchRank: 1,
    }),
  });
  assert.equal(adminWrite.response.status, 200);
  assert.equal(adminWrite.body.profile.registrationId, '0999999999001');
  assert.equal(adminWrite.body.profile.commercialName, '员工已维护商业名称');
  assert.equal(adminWrite.body.profile.strategicValueScore, 92);
  assert.equal(adminWrite.body.changedFields.includes('commercialName'), false);
  assert.equal(adminWrite.body.changedFields.includes('registrationId'), true);

  const employeeRead = await requestJson(`${base}/api/crm-native/research-company-profiles`, employeeToken);
  assert.equal(employeeRead.response.status, 200);
  const visible = employeeRead.body.profiles.find((item) => item.businessId === 'account-ec-1');
  assert.equal(visible.registrationId, '0999999999001');
  assert.equal(visible.commercialName, '员工已维护商业名称');
  assert.equal(visible.verificationGrade, 'A+');

  const duplicateClaim = await requestJson(`${base}/api/crm-native/research-company-profiles/account-ec-2`, adminToken, {
    method: 'PATCH',
    body: JSON.stringify({
      batchId: 'batch-test-2',
      registrationCountry: 'EC',
      registrationType: 'RUC',
      registrationId: '0999999999001',
      researchRank: 2,
    }),
  });
  assert.equal(duplicateClaim.response.status, 409);
  assert.equal(duplicateClaim.body.error, 'registration_identity_already_claimed');

  const audit = await requestJson(`${base}/api/crm-native/research-company-profiles/account-ec-1/audit`, employeeToken);
  assert.equal(audit.response.status, 200);
  assert.ok(audit.body.changes.some((change) => change.field === 'registrationId' && change.batchId === 'batch-test-1'));
  assert.ok(audit.body.changes.some((change) => change.field === 'strategicValueScore' && change.newValue === 92));

  const dryRunAsEmployee = await requestJson(`${base}/api/crm-native/research-intake/dry-run`, employeeToken, {
    method: 'POST',
    body: JSON.stringify({
      schemaVersion: 'EC_TOP500_V46',
      sourceName: 'EC_TOP500_V46_20260915',
      rows: [{ rowNumber: 2, displayName: 'Empresa Uno', registrationCountry: 'EC', registrationType: 'RUC', registrationId: '0999999999001', researchRank: 1 }],
    }),
  });
  assert.equal(dryRunAsEmployee.response.status, 403);

  const dryRun = await requestJson(`${base}/api/crm-native/research-intake/dry-run`, adminToken, {
    method: 'POST',
    body: JSON.stringify({
      schemaVersion: 'EC_TOP500_V46',
      sourceName: 'EC_TOP500_V46_20260915',
      fileName: 'top500.csv',
      sourceDigest: 'a'.repeat(64),
      rows: [
        { rowNumber: 2, displayName: 'Empresa Uno', registrationCountry: 'EC', registrationType: 'RUC', registrationId: '0999999999001', researchRank: 1 },
        { rowNumber: 3, displayName: 'Empresa Nueva', registrationCountry: 'EC', registrationType: 'RUC', registrationId: '0999999999002', researchRank: 2 },
      ],
    }),
  });
  assert.equal(dryRun.response.status, 201);
  assert.equal(dryRun.body.status, 'DRY_RUN_READY');
  assert.equal(dryRun.body.summary.update, 1);
  assert.equal(dryRun.body.summary.create, 1);
  assert.equal(dryRun.body.summary.conflict, 0);
  assert.equal(dryRun.body.summary.protectedOperationalWriteCount, 0);

  const verifyDb = new DatabaseSync(dbPath, { readOnly: true });
  assert.equal(verifyDb.prepare("SELECT COUNT(*) AS count FROM crm_registration_identity WHERE registration_country='EC' AND registration_type='RUC' AND registration_id='0999999999001'").get().count, 1);
  assert.ok(verifyDb.prepare("SELECT COUNT(*) AS count FROM crm_research_profile_field_audit WHERE business_id='account-ec-1'").get().count >= 4);
  assert.equal(verifyDb.prepare("SELECT COUNT(*) AS count FROM crm_research_import_batch WHERE status='DRY_RUN_READY'").get().count, 1);
  verifyDb.close();
});
