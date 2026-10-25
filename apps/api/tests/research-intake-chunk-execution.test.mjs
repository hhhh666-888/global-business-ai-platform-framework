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
  const payload = b64(JSON.stringify({ sub: subject, preferred_username: subject, iss: issuer, azp: 'gbap-web', iat: now, exp: now + 300, realm_access: { roles } }));
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
  return `${header}.${payload}.${signature}`;
}
async function listen(server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return server.address().port;
}
async function requestJson(url, token, body) {
  const response = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json();
  return { response, payload };
}
function seedDatabase(dbPath, providerEndpoint, rows = 26) {
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
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(batchId, 'EC_TOP500_V46', 'EC_TOP500_V46_20260915', 'batch.csv', null, rows, 'DRY_RUN_READY', 'seed', 'seed', now, now, JSON.stringify({ create: rows, update: 0, conflict: 0, protectedOperationalWriteCount: 0 }));
  const insert = db.prepare(`INSERT INTO crm_research_import_item(batch_id,row_number,registration_country,registration_type,registration_id,display_name,research_rank,match_business_id,proposed_action,reason,snapshot_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
  for (let index = 0; index < rows; index += 1) {
    const rowNumber = index + 2;
    const ruc = `09999999${String(index).padStart(5, '0')}`.slice(0, 13);
    const snapshot = {
      displayName: `Chunk Company ${index + 1}`, commercialName: null,
      registrationCountry: 'EC', registrationType: 'RUC', registrationId: ruc,
      ownershipType: 'PRIVATE', verificationGrade: 'A', strategicValueScore: 90, researchRank: index + 1,
      website: null, linkedinUrl: null, industry: 'Manufacturing', primaryPhone: null, primaryEmail: null,
      annualRevenue: null, annualRevenueCurrency: null, employeeCount: null, source: 'EC_TOP500_V46_20260915',
    };
    insert.run(batchId, rowNumber, 'EC', 'RUC', ruc, snapshot.displayName, index + 1, null, 'CREATE', 'registration_identity_not_found', JSON.stringify(snapshot));
  }
  db.close();
  return batchId;
}

test('research execution is server-chunked, admin-only and resumable', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'gbap-research-chunk-'));
  const dbPath = join(work, 'substrate.db');
  const companies = new Map();
  let createCalls = 0;
  const providerServer = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const input = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    if (input.capability === 'crm.v1.account.create') {
      createCalls += 1;
      const record = { externalId: input.payload.businessId, externalType: 'company', displayName: input.payload.displayName, website: null, linkedinUrl: null, annualRevenue: null };
      companies.set(record.externalId, record);
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ record })); return;
    }
    if (input.capability === 'crm.v1.account.list') {
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ records: [...companies.values()] })); return;
    }
    if (input.capability === 'crm.ops.v1.account.update') {
      const current = companies.get(input.payload.externalId);
      const record = { ...current, ...input.payload, externalId: input.payload.externalId, externalType: 'company' };
      companies.set(record.externalId, record);
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ record })); return;
    }
    res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'unsupported_capability' }));
  });
  const providerPort = await listen(providerServer);
  const batchId = seedDatabase(dbPath, `http://127.0.0.1:${providerPort}`, 26);

  const kid = 'chunk-key';
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
  const base = `http://127.0.0.1:${apiPort}`;
  const admin = tokenFor(privateKey, kid, issuer, ['substrate-user', 'substrate-admin'], 'admin');
  const employee = tokenFor(privateKey, kid, issuer, ['substrate-user'], 'employee');
  const body = { confirmation: 'EXECUTE_TOP500_RESEARCH_BATCH' };

  t.after(() => { apiServer.close(); providerServer.close(); jwksServer.close(); rmSync(work, { recursive: true, force: true }); });

  const denied = await requestJson(`${base}/api/crm-native/research-intake/batches/${batchId}/execute`, employee, body);
  assert.equal(denied.response.status, 403);

  const first = await requestJson(`${base}/api/crm-native/research-intake/batches/${batchId}/execute`, admin, body);
  assert.equal(first.response.status, 200, JSON.stringify(first.payload));
  assert.equal(first.payload.status, 'EXECUTION_CONTINUE');
  assert.equal(first.payload.hasMore, true);
  assert.equal(first.payload.remaining, 1);
  assert.equal(first.payload.execution.created, 25);
  assert.equal(createCalls, 25);

  const second = await requestJson(`${base}/api/crm-native/research-intake/batches/${batchId}/execute`, admin, body);
  assert.equal(second.response.status, 200, JSON.stringify(second.payload));
  assert.equal(second.payload.status, 'EXECUTED');
  assert.equal(second.payload.remaining, 0);
  assert.equal(second.payload.execution.created, 26);
  assert.equal(createCalls, 26);

  const retry = await requestJson(`${base}/api/crm-native/research-intake/batches/${batchId}/execute`, admin, body);
  assert.equal(retry.response.status, 200);
  assert.equal(retry.payload.status, 'EXECUTED');
  assert.equal(retry.payload.idempotent, true);
  assert.equal(createCalls, 26);
});
