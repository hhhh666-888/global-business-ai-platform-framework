import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

function base64url(value) { return Buffer.from(value).toString('base64url'); }
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
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(options.headers ?? {}) },
  });
  const body = await response.json();
  return { response, body };
}
function seedCore(dbPath, providerEndpoint) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE provider_registration (
      id TEXT PRIMARY KEY, component TEXT NOT NULL, version TEXT NOT NULL, integration_mode TEXT NOT NULL,
      endpoint TEXT NOT NULL, environment_scope TEXT NOT NULL, organization_scope TEXT, workspace_scope TEXT,
      lifecycle_owner TEXT NOT NULL, replacement_class TEXT NOT NULL, replacement_evidence TEXT NOT NULL,
      secret_ref TEXT, egress_allowlist_json TEXT NOT NULL, timeout_ms INTEGER NOT NULL DEFAULT 3000,
      retry_count INTEGER NOT NULL DEFAULT 0, failure_mode TEXT NOT NULL DEFAULT 'DEGRADE', contract_version TEXT,
      enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE capability_binding (
      capability TEXT NOT NULL, provider_id TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(capability, provider_id)
    );
    CREATE TABLE external_mapping (
      id TEXT PRIMARY KEY, business_type TEXT NOT NULL, business_id TEXT NOT NULL, provider_id TEXT NOT NULL,
      external_type TEXT NOT NULL, external_id TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE crm_business_state (
      business_type TEXT NOT NULL, business_id TEXT NOT NULL, state_json TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (business_type, business_id)
    );
    CREATE TABLE audit_event (
      id TEXT PRIMARY KEY, actor_subject TEXT NOT NULL, actor_username TEXT, action TEXT NOT NULL,
      target TEXT NOT NULL, occurred_at TEXT NOT NULL, payload_json TEXT NOT NULL
    );
  `);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO provider_registration(
    id,component,version,integration_mode,endpoint,environment_scope,lifecycle_owner,replacement_class,replacement_evidence,
    egress_allowlist_json,timeout_ms,retry_count,failure_mode,contract_version,enabled,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'test-provider', 'test', '1', 'ADAPTER', providerEndpoint, 'local', 'test', 'REPLACEABLE', 'TEST',
    JSON.stringify(['127.0.0.1']), 3000, 0, 'DEGRADE', 'gbap.crm.v1', 1, now, now,
  );
  for (const capability of ['crm.v1.account.create', 'crm.v1.account.list', 'crm.ops.v1.account.update']) {
    db.prepare('INSERT INTO capability_binding(capability,provider_id,priority,enabled) VALUES(?,?,?,1)').run(capability, 'test-provider', 100);
  }
  db.close();
}

test('TOP500 research execute is admin-only, fill-only, resumable and idempotent', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'gbap-research-execute-'));
  const dbPath = join(work, 'substrate.db');
  const companies = new Map();
  const providerCalls = [];
  const existingBusinessId = '8db55f72-0abf-4b16-9a71-bf4ae5da5b00';
  companies.set(existingBusinessId, {
    externalId: existingBusinessId,
    externalType: 'company',
    displayName: 'Existing Employee Company',
    website: null,
    linkedinUrl: null,
    annualRevenue: null,
    annualRevenueCurrency: null,
  });

  const providerServer = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/invoke') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    providerCalls.push({ capability: input.capability, payload: input.payload });
    if (input.capability === 'crm.v1.account.create') {
      const businessId = input.payload.businessId;
      const current = companies.get(businessId) ?? {};
      const record = {
        externalId: businessId,
        externalType: 'company',
        displayName: input.payload.displayName,
        website: current.website ?? null,
        linkedinUrl: current.linkedinUrl ?? null,
        annualRevenue: current.annualRevenue ?? null,
        annualRevenueCurrency: current.annualRevenueCurrency ?? null,
      };
      companies.set(businessId, record);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, record }));
      return;
    }
    if (input.capability === 'crm.v1.account.list') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, records: [...companies.values()] }));
      return;
    }
    if (input.capability === 'crm.ops.v1.account.update') {
      const current = companies.get(input.payload.externalId);
      if (!current) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'missing_company' }));
        return;
      }
      const record = {
        ...current,
        ...(input.payload.displayName !== undefined ? { displayName: input.payload.displayName } : {}),
        ...(input.payload.website !== undefined ? { website: input.payload.website } : {}),
        ...(input.payload.linkedinUrl !== undefined ? { linkedinUrl: input.payload.linkedinUrl } : {}),
        ...(input.payload.annualRevenue !== undefined ? { annualRevenue: input.payload.annualRevenue } : {}),
        ...(input.payload.annualRevenueCurrency !== undefined ? { annualRevenueCurrency: input.payload.annualRevenueCurrency } : {}),
      };
      companies.set(input.payload.externalId, record);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, record }));
      return;
    }
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'unsupported_capability' }));
  });
  const providerPort = await listen(providerServer);
  seedCore(dbPath, `http://127.0.0.1:${providerPort}`);

  const kid = 'research-execute-test-key';
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' });
  publicJwk.kid = kid;
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  const jwksServer = http.createServer((req, res) => {
    if (req.url === '/certs') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ keys: [publicJwk] }));
      return;
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
  process.env.SUBSTRATE_ENV = 'local';

  const { createResearchIntakeExecutionHandler } = await import(`../research-intake-execution.mjs?test=${Date.now()}`);
  const handler = createResearchIntakeExecutionHandler();
  const apiServer = http.createServer(async (req, res) => {
    if (await handler(req, res)) return;
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  const apiPort = await listen(apiServer);
  const base = `http://127.0.0.1:${apiPort}`;
  const adminToken = tokenFor(privateKey, kid, issuer, ['substrate-user', 'substrate-admin'], 'research-admin');
  const employeeToken = tokenFor(privateKey, kid, issuer, ['substrate-user'], 'research-employee');

  const setupDb = new DatabaseSync(dbPath);
  const now = new Date().toISOString();
  setupDb.prepare('INSERT INTO external_mapping(id,business_type,business_id,provider_id,external_type,external_id,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(randomUUID(), 'Account', existingBusinessId, 'test-provider', 'company', existingBusinessId, now);
  setupDb.prepare("INSERT INTO crm_business_state(business_type,business_id,state_json,updated_at) VALUES('Account',?,?,?)")
    .run(existingBusinessId, JSON.stringify({
      registrationCountry: 'EC', registrationType: 'RUC', registrationId: '0999999999001',
      industry: 'Employee Maintained Industry', primaryEmail: null,
    }), now);
  setupDb.prepare('INSERT INTO crm_registration_identity(registration_country,registration_type,registration_id,business_id,first_import_batch_id,last_import_batch_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .run('EC', 'RUC', '0999999999001', existingBusinessId, 'seed', 'seed', now, now);
  setupDb.close();

  t.after(async () => {
    apiServer.close();
    providerServer.close();
    jwksServer.close();
    rmSync(work, { recursive: true, force: true });
  });

  const dryRunPayload = {
    schemaVersion: 'EC_TOP500_V46',
    sourceName: 'EC_TOP500_V46_20260915',
    fileName: 'top500.csv',
    sourceDigest: 'b'.repeat(64),
    rows: [
      {
        rowNumber: 2,
        displayName: 'Existing Research Name',
        registrationCountry: 'EC', registrationType: 'RUC', registrationId: '0999999999001', researchRank: 1,
        companySnapshot: {
          displayName: 'Existing Research Name', commercialName: 'Existing Commercial', registrationCountry: 'EC', registrationType: 'RUC', registrationId: '0999999999001',
          ownershipType: 'PRIVATE', verificationGrade: 'A+', strategicValueScore: 95, researchRank: 1,
          website: 'https://existing.example', linkedinUrl: null, industry: 'Research Industry Must Not Override',
          primaryPhone: '+593111111111', primaryEmail: 'research-existing@example.com', annualRevenue: 1000000, annualRevenueCurrency: 'USD', employeeCount: 100, source: 'EC_TOP500_V46_20260915',
        },
      },
      {
        rowNumber: 3,
        displayName: 'New Research Company',
        registrationCountry: 'EC', registrationType: 'RUC', registrationId: '0999999999002', researchRank: 2,
        companySnapshot: {
          displayName: 'New Research Company', commercialName: 'New Commercial', registrationCountry: 'EC', registrationType: 'RUC', registrationId: '0999999999002',
          ownershipType: 'PRIVATE', verificationGrade: 'A', strategicValueScore: 91, researchRank: 2,
          website: 'https://new.example', linkedinUrl: 'https://linkedin.com/company/new', industry: 'Manufacturing',
          primaryPhone: '+593222222222', primaryEmail: 'new@example.com', annualRevenue: 2500000, annualRevenueCurrency: 'USD', employeeCount: 220, source: 'EC_TOP500_V46_20260915',
        },
      },
    ],
  };

  const employeeDryRun = await requestJson(`${base}/api/crm-native/research-intake/dry-run`, employeeToken, { method: 'POST', body: JSON.stringify(dryRunPayload) });
  assert.equal(employeeDryRun.response.status, 403);

  const dryRun = await requestJson(`${base}/api/crm-native/research-intake/dry-run`, adminToken, { method: 'POST', body: JSON.stringify(dryRunPayload) });
  assert.equal(dryRun.response.status, 201);
  assert.equal(dryRun.body.status, 'DRY_RUN_READY');
  assert.equal(dryRun.body.summary.create, 1);
  assert.equal(dryRun.body.summary.update, 1);
  assert.equal(dryRun.body.summary.protectedOperationalWriteCount, 0);

  const verifySnapshot = new DatabaseSync(dbPath, { readOnly: true });
  const savedSnapshot = JSON.parse(verifySnapshot.prepare('SELECT snapshot_json FROM crm_research_import_item WHERE batch_id=? AND row_number=3').get(dryRun.body.batchId).snapshot_json);
  assert.equal(savedSnapshot.website, 'https://new.example');
  assert.equal(savedSnapshot.industry, 'Manufacturing');
  assert.equal(Object.prototype.hasOwnProperty.call(savedSnapshot, 'salesStage'), false);
  verifySnapshot.close();

  const employeeExecute = await requestJson(`${base}/api/crm-native/research-intake/batches/${dryRun.body.batchId}/execute`, employeeToken, {
    method: 'POST', body: JSON.stringify({ confirmation: 'EXECUTE_TOP500_RESEARCH_BATCH' }),
  });
  assert.equal(employeeExecute.response.status, 403);

  const missingConfirmation = await requestJson(`${base}/api/crm-native/research-intake/batches/${dryRun.body.batchId}/execute`, adminToken, {
    method: 'POST', body: JSON.stringify({}),
  });
  assert.equal(missingConfirmation.response.status, 400);

  const executed = await requestJson(`${base}/api/crm-native/research-intake/batches/${dryRun.body.batchId}/execute`, adminToken, {
    method: 'POST', body: JSON.stringify({ confirmation: 'EXECUTE_TOP500_RESEARCH_BATCH' }),
  });
  assert.equal(executed.response.status, 200, JSON.stringify(executed.body));
  assert.equal(executed.body.status, 'EXECUTED');
  assert.equal(executed.body.execution.created, 1);
  assert.equal(executed.body.execution.updated, 1);
  assert.equal(executed.body.execution.failed, 0);
  assert.equal(executed.body.execution.protectedOperationalWriteCount, 0);

  const verifyDb = new DatabaseSync(dbPath, { readOnly: true });
  const newExecution = verifyDb.prepare("SELECT * FROM crm_research_import_execution_item WHERE batch_id=? AND action='CREATE'").get(dryRun.body.batchId);
  assert.equal(newExecution.status, 'COMPLETE');
  assert.equal(companies.has(newExecution.business_id), true);
  assert.equal(companies.get(newExecution.business_id).website, 'https://new.example');
  assert.equal(companies.get(newExecution.business_id).annualRevenue, 2500000);
  const newState = JSON.parse(verifyDb.prepare("SELECT state_json FROM crm_business_state WHERE business_type='Account' AND business_id=?").get(newExecution.business_id).state_json);
  assert.equal(newState.registrationId, '0999999999002');
  assert.equal(newState.industry, 'Manufacturing');
  assert.equal(newState.primaryEmail, 'new@example.com');
  const existingState = JSON.parse(verifyDb.prepare("SELECT state_json FROM crm_business_state WHERE business_type='Account' AND business_id=?").get(existingBusinessId).state_json);
  assert.equal(existingState.industry, 'Employee Maintained Industry');
  assert.equal(existingState.primaryEmail, 'research-existing@example.com');
  assert.equal(verifyDb.prepare("SELECT status FROM crm_research_import_batch WHERE id=?").get(dryRun.body.batchId).status, 'EXECUTED');
  assert.equal(verifyDb.prepare("SELECT COUNT(*) AS count FROM crm_registration_identity WHERE registration_country='EC' AND registration_type='RUC'").get().count, 2);
  assert.ok(verifyDb.prepare('SELECT COUNT(*) AS count FROM crm_research_profile_field_audit WHERE batch_id=?').get(dryRun.body.batchId).count > 0);
  verifyDb.close();

  const createCallsBeforeRetry = providerCalls.filter((call) => call.capability === 'crm.v1.account.create').length;
  const retried = await requestJson(`${base}/api/crm-native/research-intake/batches/${dryRun.body.batchId}/execute`, adminToken, {
    method: 'POST', body: JSON.stringify({ confirmation: 'EXECUTE_TOP500_RESEARCH_BATCH' }),
  });
  assert.equal(retried.response.status, 200);
  assert.equal(retried.body.status, 'EXECUTED');
  assert.equal(retried.body.idempotent, true);
  assert.equal(providerCalls.filter((call) => call.capability === 'crm.v1.account.create').length, createCallsBeforeRetry);
});
