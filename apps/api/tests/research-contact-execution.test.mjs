import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

function b64(value) { return Buffer.from(value).toString('base64url'); }
function tokenFor(privateKey, kid, issuer, roles, subject) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const payload = b64(JSON.stringify({
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
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}
async function request(base, path, token, { method = 'POST', body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}
async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function seed(dbPath, providerEndpoint, rowCount = 26) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE audit_event (
      id TEXT PRIMARY KEY, actor_subject TEXT NOT NULL, actor_username TEXT, action TEXT NOT NULL,
      target TEXT NOT NULL, occurred_at TEXT NOT NULL, payload_json TEXT NOT NULL
    );
    CREATE TABLE provider_registration (
      id TEXT PRIMARY KEY, component TEXT NOT NULL, version TEXT NOT NULL, integration_mode TEXT NOT NULL,
      endpoint TEXT NOT NULL, environment_scope TEXT NOT NULL, organization_scope TEXT, workspace_scope TEXT,
      lifecycle_owner TEXT NOT NULL, replacement_class TEXT NOT NULL, replacement_evidence TEXT NOT NULL,
      secret_ref TEXT, egress_allowlist_json TEXT NOT NULL, timeout_ms INTEGER NOT NULL DEFAULT 3000,
      retry_count INTEGER NOT NULL DEFAULT 0, failure_mode TEXT NOT NULL DEFAULT 'DEGRADE', contract_version TEXT,
      upstream_product TEXT, upstream_version TEXT, upstream_commit TEXT, upstream_digest TEXT,
      adapter_revision TEXT, config_revision TEXT, schema_revision TEXT, enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE capability_binding (
      capability TEXT NOT NULL, provider_id TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 100,
      enabled INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(capability, provider_id)
    );
    CREATE TABLE external_mapping (
      id TEXT PRIMARY KEY, business_type TEXT NOT NULL, business_id TEXT NOT NULL, provider_id TEXT NOT NULL,
      external_type TEXT NOT NULL, external_id TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(provider_id, external_type, external_id),
      UNIQUE(business_type, business_id, provider_id, external_type)
    );
    CREATE TABLE crm_research_import_batch (
      id TEXT PRIMARY KEY, schema_version TEXT NOT NULL, source_name TEXT NOT NULL, file_name TEXT, source_digest TEXT,
      row_count INTEGER NOT NULL, status TEXT NOT NULL, actor_subject TEXT NOT NULL, actor_username TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, summary_json TEXT NOT NULL
    );
    CREATE TABLE crm_research_import_item (
      batch_id TEXT NOT NULL REFERENCES crm_research_import_batch(id) ON DELETE CASCADE, row_number INTEGER NOT NULL,
      registration_country TEXT NOT NULL, registration_type TEXT NOT NULL, registration_id TEXT NOT NULL,
      display_name TEXT NOT NULL, research_rank INTEGER, match_business_id TEXT, proposed_action TEXT NOT NULL,
      reason TEXT, snapshot_json TEXT NOT NULL, PRIMARY KEY(batch_id,row_number)
    );
    CREATE TABLE crm_research_import_execution_item (
      batch_id TEXT NOT NULL REFERENCES crm_research_import_batch(id) ON DELETE CASCADE, row_number INTEGER NOT NULL,
      business_id TEXT NOT NULL, action TEXT NOT NULL, status TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0,
      provider_id TEXT, external_id TEXT, error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY(batch_id,row_number)
    );
  `);
  const providerId = 'test-contact-provider';
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO provider_registration(
    id,component,version,integration_mode,endpoint,environment_scope,organization_scope,workspace_scope,
    lifecycle_owner,replacement_class,replacement_evidence,secret_ref,egress_allowlist_json,timeout_ms,retry_count,
    failure_mode,contract_version,enabled,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    providerId, 'test-contact', '1', 'HTTP', providerEndpoint, 'local', null, null,
    'test', 'REPLACEABLE', 'test', null, JSON.stringify(['127.0.0.1']), 3000, 0,
    'DEGRADE', 'gbap.crm.v1', 1, now, now,
  );
  for (const capability of ['crm.v1.contact.create', 'crm.v1.contact.list', 'crm.ops.v1.contact.update']) {
    db.prepare('INSERT INTO capability_binding(capability,provider_id,priority,enabled) VALUES(?,?,100,1)')
      .run(capability, providerId);
  }
  const batchId = randomUUID();
  db.prepare(`INSERT INTO crm_research_import_batch(
    id,schema_version,source_name,file_name,source_digest,row_count,status,actor_subject,actor_username,created_at,updated_at,summary_json
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    batchId,
    'EC_TOP500_V46',
    'EC_TOP500_V46_20260915',
    'contact-test.csv',
    null,
    rowCount,
    'DRY_RUN_READY',
    'seed',
    'seed',
    now,
    now,
    JSON.stringify({ create: rowCount, update: 0, conflict: 0, protectedOperationalWriteCount: 0 }),
  );
  const insertItem = db.prepare(`INSERT INTO crm_research_import_item(
    batch_id,row_number,registration_country,registration_type,registration_id,display_name,research_rank,match_business_id,proposed_action,reason,snapshot_json
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
  const insertExec = db.prepare(`INSERT INTO crm_research_import_execution_item(
    batch_id,row_number,business_id,action,status,attempt_count,provider_id,external_id,error_code,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
  const accountBusinessIds = [];
  for (let index = 0; index < rowCount; index += 1) {
    const rowNumber = index + 2;
    const accountBusinessId = randomUUID();
    accountBusinessIds.push(accountBusinessId);
    const registrationId = `09981111${String(index).padStart(5, '0')}`.slice(0, 13);
    const externalId = `company-${index + 1}`;
    insertItem.run(
      batchId, rowNumber, 'EC', 'RUC', registrationId, `Research Company ${index + 1}`, index + 1,
      null, 'CREATE', 'test', JSON.stringify({ displayName: `Research Company ${index + 1}` }),
    );
    insertExec.run(batchId, rowNumber, accountBusinessId, 'CREATE', 'COMPLETE', 1, providerId, externalId, null, now, now);
    db.prepare('INSERT INTO external_mapping(id,business_type,business_id,provider_id,external_type,external_id,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(randomUUID(), 'Account', accountBusinessId, providerId, 'company', externalId, now);
  }
  db.close();
  return { batchId, accountBusinessIds, providerId };
}

test('TOP500 Research Contact execution is conservative, resumable and provider-idempotent', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'gbap-research-contact-'));
  const dbPath = join(work, 'substrate.db');
  const people = new Map();
  const createBusinessIds = [];
  let failFirstCreateResponse = true;

  const provider = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/invoke') {
      res.writeHead(404).end();
      return;
    }
    const input = await readJson(req);
    const capability = input.capability;
    const payload = input.payload ?? {};
    if (capability === 'crm.v1.contact.list') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ records: [...people.values()] }));
      return;
    }
    if (capability === 'crm.v1.contact.create') {
      createBusinessIds.push(payload.businessId);
      const previous = people.get(payload.businessId) ?? {};
      const record = {
        externalId: payload.businessId,
        externalType: 'person',
        personName: payload.personName,
        email: payload.email ?? null,
        phone: previous.phone ?? null,
        jobTitle: previous.jobTitle ?? null,
        linkedinUrl: previous.linkedinUrl ?? null,
        accountExternalId: payload.accountExternalId ?? null,
        updatedAt: new Date().toISOString(),
      };
      people.set(payload.businessId, record);
      if (failFirstCreateResponse) {
        failFirstCreateResponse = false;
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'simulated_response_loss_after_upsert' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ record }));
      return;
    }
    if (capability === 'crm.ops.v1.contact.update') {
      const current = people.get(payload.externalId);
      if (!current) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'person_not_found' }));
        return;
      }
      const record = { ...current, ...payload, externalId: current.externalId, externalType: 'person' };
      delete record.businessId;
      people.set(current.externalId, record);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ record }));
      return;
    }
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: `unsupported:${capability}` }));
  });
  const providerPort = await listen(provider);
  const { batchId, accountBusinessIds } = seed(dbPath, `http://127.0.0.1:${providerPort}`, 26);

  const kid = 'research-contact-key';
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' });
  publicJwk.kid = kid;
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  const jwks = http.createServer((req, res) => {
    if (req.url === '/certs') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ keys: [publicJwk] }));
      return;
    }
    res.writeHead(404).end();
  });
  const jwksPort = await listen(jwks);
  const issuer = `http://127.0.0.1:${jwksPort}/realms/gbap`;
  Object.assign(process.env, {
    DB_PATH: dbPath,
    OIDC_ISSUER: issuer,
    OIDC_ALLOWED_ISSUERS: issuer,
    OIDC_JWKS_URL_INTERNAL: `http://127.0.0.1:${jwksPort}/certs`,
    OIDC_CLIENT_ID: 'gbap-web',
    SUBSTRATE_ENV: 'local',
  });

  const stamp = Date.now();
  const { createResearchContactExecutionHandler } = await import(`../research-contact-execution.mjs?test=${stamp}`);
  const { createCrmTargetRoleHandler } = await import(`../crm-target-role.mjs?test=${stamp}`);
  const researchHandler = createResearchContactExecutionHandler();
  const targetRoleHandler = createCrmTargetRoleHandler();
  const api = http.createServer(async (req, res) => {
    if (await researchHandler(req, res)) return;
    if (await targetRoleHandler(req, res)) return;
    res.writeHead(404).end();
  });
  const apiPort = await listen(api);
  const base = `http://127.0.0.1:${apiPort}`;
  const admin = tokenFor(privateKey, kid, issuer, ['substrate-user', 'substrate-admin'], 'admin');
  const employee = tokenFor(privateKey, kid, issuer, ['substrate-user'], 'employee');
  t.after(() => {
    api.close();
    jwks.close();
    provider.close();
    rmSync(work, { recursive: true, force: true });
  });

  const contacts = Array.from({ length: 26 }, (_, index) => ({
    rowNumber: index + 2,
    contactSnapshot: {
      candidates: [{
        roleKey: 'LEGAL_REP',
        personText: index === 25 ? 'Historic Person Example' : `Current Person ${index + 1}`,
        titleText: 'Representante Legal',
        contactText: null,
        verificationText: index === 25 ? '历史记录；需二次确认，不得作为当前联系人' : null,
        source: 'EC_TOP500_V46_20260915',
      }],
      recommendedSearchText: index === 25 ? 'Jefe de Energía / Mantenimiento' : null,
      verificationText: index === 25 ? '历史记录；需二次确认，不得作为当前联系人' : null,
      source: 'EC_TOP500_V46_20260915',
    },
  }));

  const deniedAttach = await request(base, `/api/crm-native/research-intake/batches/${batchId}/contact-snapshots`, employee, { body: { contacts } });
  assert.equal(deniedAttach.response.status, 403);

  const attached = await request(base, `/api/crm-native/research-intake/batches/${batchId}/contact-snapshots`, admin, { body: { contacts } });
  assert.equal(attached.response.status, 200, JSON.stringify(attached.payload));
  assert.equal(attached.payload.rowCount, 26);
  assert.equal(attached.payload.namedCandidateCount, 26);

  const readyDb = new DatabaseSync(dbPath);
  const currentSummary = JSON.parse(readyDb.prepare('SELECT summary_json FROM crm_research_import_batch WHERE id=?').get(batchId).summary_json);
  const siteCompletedAt = new Date().toISOString();
  readyDb.prepare("UPDATE crm_research_import_batch SET status='EXECUTED',summary_json=?,updated_at=? WHERE id=?").run(
    JSON.stringify({
      ...currentSummary,
      siteExecution: { created: 26, updated: 0, unchanged: 0, skippedNoIdentity: 0, failed: 0, completedAt: siteCompletedAt },
    }),
    siteCompletedAt,
    batchId,
  );
  readyDb.close();

  const deniedExecute = await request(base, `/api/crm-native/research-intake/batches/${batchId}/execute-contacts`, employee, {
    body: { confirmation: 'EXECUTE_TOP500_RESEARCH_CONTACTS' },
  });
  assert.equal(deniedExecute.response.status, 403);

  const first = await request(base, `/api/crm-native/research-intake/batches/${batchId}/execute-contacts`, admin, {
    body: { confirmation: 'EXECUTE_TOP500_RESEARCH_CONTACTS' },
  });
  assert.equal(first.response.status, 503, JSON.stringify(first.payload));
  assert.equal(people.size, 1, 'provider already contains the first person despite response loss');

  const afterFailureDb = new DatabaseSync(dbPath);
  const failedJournal = afterFailureDb.prepare(`
    SELECT contact_business_id,status,attempt_count FROM crm_research_contact_execution_item
    WHERE batch_id=? AND row_number=2 AND role_key='LEGAL_REP'
  `).get(batchId);
  afterFailureDb.close();
  assert.equal(failedJournal.status, 'FAILED');
  assert.equal(failedJournal.attempt_count, 1);
  assert.ok(failedJournal.contact_business_id, 'GBAP contact businessId must be reserved before provider invocation');
  assert.equal([...people.keys()][0], failedJournal.contact_business_id);

  const second = await request(base, `/api/crm-native/research-intake/batches/${batchId}/execute-contacts`, admin, {
    body: { confirmation: 'EXECUTE_TOP500_RESEARCH_CONTACTS' },
  });
  assert.equal(second.response.status, 200, JSON.stringify(second.payload));
  assert.equal(second.payload.status, 'CONTACT_EXECUTION_CONTINUE');
  assert.equal(second.payload.remaining, 2);
  assert.equal(second.payload.contactExecution.existingContactsLinked, 1);
  assert.equal(second.payload.contactExecution.contactsCreated, 24);

  const third = await request(base, `/api/crm-native/research-intake/batches/${batchId}/execute-contacts`, admin, {
    body: { confirmation: 'EXECUTE_TOP500_RESEARCH_CONTACTS' },
  });
  assert.equal(third.response.status, 200, JSON.stringify(third.payload));
  assert.equal(third.payload.status, 'CONTACT_EXECUTED');
  assert.equal(third.payload.hasMore, false);
  assert.equal(third.payload.remaining, 0);
  assert.equal(third.payload.contactExecution.contactsCreated, 24);
  assert.equal(third.payload.contactExecution.existingContactsLinked, 1);
  assert.equal(third.payload.contactExecution.targetRolesOnly, 2);
  assert.equal(third.payload.contactExecution.conflicts, 0);
  assert.equal(third.payload.contactExecution.failed, 0);

  const retry = await request(base, `/api/crm-native/research-intake/batches/${batchId}/execute-contacts`, admin, {
    body: { confirmation: 'EXECUTE_TOP500_RESEARCH_CONTACTS' },
  });
  assert.equal(retry.response.status, 200);
  assert.equal(retry.payload.idempotent, true);
  assert.equal(people.size, 25, 'retry must not duplicate provider people');
  assert.equal(createBusinessIds.filter((id) => id === failedJournal.contact_business_id).length, 1, 'retry recovered by listing the already-created provider person');

  const employeeRoles = await request(
    base,
    `/api/crm-native/target-roles?accountBusinessId=${encodeURIComponent(accountBusinessIds[25])}`,
    employee,
    { method: 'GET' },
  );
  assert.equal(employeeRoles.response.status, 200, JSON.stringify(employeeRoles.payload));
  assert.equal(employeeRoles.payload.targetRoles.length, 2);
  const roleKeys = employeeRoles.payload.targetRoles.map((item) => item.roleKey).sort();
  assert.deepEqual(roleKeys, ['LEGAL_REP', 'RECOMMENDED']);
  const legalRole = employeeRoles.payload.targetRoles.find((item) => item.roleKey === 'LEGAL_REP');
  assert.equal(legalRole.status, 'OPEN');
  assert.equal(legalRole.resolvedContactBusinessId, null);

  const verifyDb = new DatabaseSync(dbPath);
  const contactMappings = verifyDb.prepare("SELECT COUNT(*) AS count FROM external_mapping WHERE business_type='Contact'").get();
  assert.equal(contactMappings.count, 25);
  const targetRoles = verifyDb.prepare('SELECT COUNT(*) AS count FROM crm_target_role').get();
  assert.equal(targetRoles.count, 27);
  const completedJournal = verifyDb.prepare("SELECT COUNT(*) AS count FROM crm_research_contact_execution_item WHERE batch_id=? AND status IN ('COMPLETE','TARGET_ROLE_ONLY')").get(batchId);
  assert.equal(completedJournal.count, 27);
  const contactAudits = verifyDb.prepare("SELECT COUNT(*) AS count FROM audit_event WHERE action='crm.research_intake.contact_execute_item'").get();
  assert.equal(contactAudits.count, 26);
  verifyDb.close();
});
