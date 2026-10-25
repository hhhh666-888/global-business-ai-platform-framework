import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

function b64(value) { return Buffer.from(value).toString('base64url'); }
function tokenFor(privateKey, kid, issuer) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const payload = b64(JSON.stringify({ sub: 'admin', preferred_username: 'admin', iss: issuer, azp: 'gbap-web', iat: now, exp: now + 300, realm_access: { roles: ['substrate-user', 'substrate-admin'] } }));
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
  return `${header}.${payload}.${signature}`;
}
async function listen(server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return server.address().port;
}
async function requestJson(url, token, body) {
  const response = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { response, payload: await response.json() };
}
function seedDatabase(dbPath, providerEndpoint) {
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
    CREATE TABLE capability_binding (capability TEXT NOT NULL, provider_id TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(capability, provider_id));
    CREATE TABLE external_mapping (id TEXT PRIMARY KEY, business_type TEXT NOT NULL, business_id TEXT NOT NULL, provider_id TEXT NOT NULL, external_type TEXT NOT NULL, external_id TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE crm_business_state (business_type TEXT NOT NULL, business_id TEXT NOT NULL, state_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (business_type, business_id));
    CREATE TABLE audit_event (id TEXT PRIMARY KEY, actor_subject TEXT NOT NULL, actor_username TEXT, action TEXT NOT NULL, target TEXT NOT NULL, occurred_at TEXT NOT NULL, payload_json TEXT NOT NULL);
    CREATE TABLE crm_registration_identity (
      registration_country TEXT NOT NULL, registration_type TEXT NOT NULL, registration_id TEXT NOT NULL, business_id TEXT NOT NULL UNIQUE,
      first_import_batch_id TEXT, last_import_batch_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (registration_country, registration_type, registration_id)
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
      reason TEXT, snapshot_json TEXT NOT NULL, PRIMARY KEY (batch_id, row_number),
      UNIQUE (batch_id, registration_country, registration_type, registration_id)
    );
    CREATE TABLE crm_research_profile_field_audit (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, batch_id TEXT, field_key TEXT NOT NULL,
      old_value_json TEXT NOT NULL, new_value_json TEXT NOT NULL, merge_policy TEXT NOT NULL,
      actor_subject TEXT NOT NULL, actor_username TEXT, occurred_at TEXT NOT NULL
    );
  `);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO provider_registration(
    id,component,version,integration_mode,endpoint,environment_scope,lifecycle_owner,replacement_class,replacement_evidence,
    egress_allowlist_json,timeout_ms,retry_count,failure_mode,contract_version,enabled,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'provider', 'test', '1', 'ADAPTER', providerEndpoint, 'local', 'test', 'REPLACEABLE', 'TEST', JSON.stringify(['127.0.0.1']), 3000, 0, 'DEGRADE', 'gbap.crm.v1', 1, now, now,
  );
  for (const capability of ['crm.v1.account.create', 'crm.v1.account.list', 'crm.ops.v1.account.update']) {
    db.prepare('INSERT INTO capability_binding(capability,provider_id,priority,enabled) VALUES(?,?,100,1)').run(capability, 'provider');
  }
  const batchId = randomUUID();
  db.prepare(`INSERT INTO crm_research_import_batch(id,schema_version,source_name,file_name,source_digest,row_count,status,actor_subject,actor_username,created_at,updated_at,summary_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(batchId, 'EC_TOP500_V46', 'EC_TOP500_V46_20260915', 'batch.csv', null, 1, 'DRY_RUN_READY', 'seed', 'seed', now, now, JSON.stringify({ create: 1, update: 0, conflict: 0, protectedOperationalWriteCount: 0 }));
  const snapshot = {
    displayName: 'Complete Research Company S.A.',
    commercialName: 'Complete Research',
    registrationCountry: 'EC', registrationType: 'RUC', registrationId: '0991234567001',
    ownershipType: 'PRIVATE', verificationGrade: 'A+', strategicValueScore: 96, researchRank: 7,
    website: 'https://example.com', linkedinUrl: 'https://www.linkedin.com/company/example',
    industry: '制造业', primaryPhone: '+593 4 000 0000', primaryEmail: 'info@example.com',
    annualRevenue: 12500000, annualRevenueCurrency: 'USD', employeeCount: 320, source: 'EC_TOP500_V46_20260915',
  };
  db.prepare(`INSERT INTO crm_research_import_item(batch_id,row_number,registration_country,registration_type,registration_id,display_name,research_rank,match_business_id,proposed_action,reason,snapshot_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(batchId, 2, 'EC', 'RUC', snapshot.registrationId, snapshot.displayName, snapshot.researchRank, null, 'CREATE', 'registration_identity_not_found', JSON.stringify(snapshot));
  db.close();
  return batchId;
}

test('provider-native metadata failure cannot leave an imported company with only its name', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'gbap-research-provider-sync-'));
  const dbPath = join(work, 'substrate.db');
  const companies = new Map();
  let updateCalls = 0;
  const providerServer = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const input = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    if (input.capability === 'crm.v1.account.create') {
      const record = { externalId: input.payload.businessId, externalType: 'company', displayName: input.payload.displayName, website: null, linkedinUrl: null, annualRevenue: null };
      companies.set(record.externalId, record);
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ record })); return;
    }
    if (input.capability === 'crm.v1.account.list') {
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ records: [...companies.values()] })); return;
    }
    if (input.capability === 'crm.ops.v1.account.update') {
      updateCalls += 1;
      res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'synthetic_native_sync_failure' })); return;
    }
    res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'unsupported_capability' }));
  });
  const providerPort = await listen(providerServer);
  const batchId = seedDatabase(dbPath, `http://127.0.0.1:${providerPort}`);

  const kid = 'provider-sync-key';
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' }); publicJwk.kid = kid; publicJwk.alg = 'RS256'; publicJwk.use = 'sig';
  const jwksServer = http.createServer((req, res) => {
    if (req.url === '/certs') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ keys: [publicJwk] })); return; }
    res.writeHead(404).end();
  });
  const jwksPort = await listen(jwksServer);
  const issuer = `http://127.0.0.1:${jwksPort}/realms/gbap`;
  Object.assign(process.env, { DB_PATH: dbPath, OIDC_ISSUER: issuer, OIDC_ALLOWED_ISSUERS: issuer, OIDC_JWKS_URL_INTERNAL: `http://127.0.0.1:${jwksPort}/certs`, OIDC_CLIENT_ID: 'gbap-web', SUBSTRATE_ENV: 'local' });

  const { createResearchIntakeChunkExecutionHandler } = await import(`../research-intake-chunk-execution.mjs?test=${Date.now()}`);
  const handler = createResearchIntakeChunkExecutionHandler();
  const apiServer = http.createServer(async (req, res) => { if (await handler(req, res)) return; res.writeHead(404).end(); });
  const apiPort = await listen(apiServer);
  const token = tokenFor(privateKey, kid, issuer);
  t.after(() => { apiServer.close(); providerServer.close(); jwksServer.close(); rmSync(work, { recursive: true, force: true }); });

  const executed = await requestJson(`http://127.0.0.1:${apiPort}/api/crm-native/research-intake/batches/${batchId}/execute`, token, { confirmation: 'EXECUTE_TOP500_RESEARCH_BATCH' });
  assert.equal(executed.response.status, 200, JSON.stringify(executed.payload));
  assert.equal(executed.payload.status, 'EXECUTED');
  assert.equal(executed.payload.execution.created, 1);
  assert.equal(executed.payload.execution.failed, 0);
  assert.equal(updateCalls, 1);

  const db = new DatabaseSync(dbPath);
  const execution = db.prepare('SELECT business_id,status,error_code FROM crm_research_import_execution_item WHERE batch_id=? AND row_number=2').get(batchId);
  assert.equal(execution.status, 'COMPLETE');
  assert.equal(execution.error_code, null);
  const state = JSON.parse(db.prepare("SELECT state_json FROM crm_business_state WHERE business_type='Account' AND business_id=?").get(execution.business_id).state_json);
  assert.deepEqual({
    registrationId: state.registrationId,
    researchRank: state.researchRank,
    strategicValueScore: state.strategicValueScore,
    verificationGrade: state.verificationGrade,
    industry: state.industry,
    primaryPhone: state.primaryPhone,
    primaryEmail: state.primaryEmail,
    website: state.website,
    linkedinUrl: state.linkedinUrl,
    annualRevenue: state.annualRevenue,
  }, {
    registrationId: '0991234567001',
    researchRank: 7,
    strategicValueScore: 96,
    verificationGrade: 'A+',
    industry: '制造业',
    primaryPhone: '+593 4 000 0000',
    primaryEmail: 'info@example.com',
    website: 'https://example.com',
    linkedinUrl: 'https://www.linkedin.com/company/example',
    annualRevenue: 12500000,
  });
  const warning = db.prepare("SELECT action FROM audit_event WHERE action='crm.research_intake.native_sync_deferred' LIMIT 1").get();
  assert.equal(warning?.action, 'crm.research_intake.native_sync_deferred');
  db.close();
});
