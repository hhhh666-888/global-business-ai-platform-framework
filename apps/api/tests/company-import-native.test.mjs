import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createSign,
  generateKeyPairSync,
  randomUUID,
} from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const temp = mkdtempSync(join(tmpdir(), 'gbap-company-import-'));
const dbPath = join(temp, 'substrate.db');
const clientId = 'gbap-web';
const issuer = 'http://company-import-test-issuer';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'company-import-test-key';
jwk.alg = 'RS256';
jwk.use = 'sig';

const jwksServer = http.createServer((req, res) => {
  if (req.url === '/jwks') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ keys: [jwk] }));
    return;
  }
  res.writeHead(404);
  res.end();
});
jwksServer.listen(0, '127.0.0.1');
await once(jwksServer, 'listening');
const jwksAddress = jwksServer.address();
if (!jwksAddress || typeof jwksAddress === 'string') throw new Error('jwks_address_unavailable');

let providerCreateFailuresRemaining = 0;
const providerCreateBusinessIds = [];
const providerServer = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/invoke') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const invocation = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const { capability, payload = {} } = invocation;
  if (capability === 'crm.v1.account.create') {
    providerCreateBusinessIds.push(payload.businessId);
    if (providerCreateFailuresRemaining > 0) {
      providerCreateFailuresRemaining -= 1;
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'simulated_create_outage' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      record: {
        businessId: payload.businessId,
        businessType: 'Account',
        externalId: payload.businessId,
        externalType: 'Company',
        displayName: payload.displayName,
      },
    }));
    return;
  }
  if (capability === 'crm.ops.v1.account.update') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      record: {
        businessId: payload.businessId ?? null,
        businessType: 'Account',
        externalId: payload.externalId,
        externalType: 'Company',
        displayName: payload.displayName,
      },
    }));
    return;
  }
  res.writeHead(400, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: `unexpected_capability:${capability}` }));
});
providerServer.listen(0, '127.0.0.1');
await once(providerServer, 'listening');
const providerAddress = providerServer.address();
if (!providerAddress || typeof providerAddress === 'string') throw new Error('provider_address_unavailable');

process.env.DB_PATH = dbPath;
process.env.CORS_ORIGIN = 'http://localhost:8080';
process.env.OIDC_ISSUER = issuer;
process.env.OIDC_ALLOWED_ISSUERS = issuer;
process.env.OIDC_CLIENT_ID = clientId;
process.env.OIDC_JWKS_URL_INTERNAL = `http://127.0.0.1:${jwksAddress.port}/jwks`;
process.env.SUBSTRATE_ENV = 'local';

const seed = new DatabaseSync(dbPath);
seed.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE external_mapping (
  id TEXT PRIMARY KEY,
  business_type TEXT NOT NULL,
  business_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  external_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE crm_business_state (
  business_type TEXT NOT NULL,
  business_id TEXT NOT NULL,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(business_type,business_id)
) STRICT;
CREATE TABLE provider_registration (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  egress_allowlist_json TEXT NOT NULL,
  timeout_ms INTEGER,
  contract_version TEXT,
  enabled INTEGER NOT NULL,
  environment_scope TEXT NOT NULL,
  organization_scope TEXT,
  workspace_scope TEXT
) STRICT;
CREATE TABLE capability_binding (
  provider_id TEXT NOT NULL,
  capability TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1
) STRICT;
`);

const businessA = randomUUID();
const businessB = randomUUID();
const now = new Date().toISOString();
const insertMapping = seed.prepare('INSERT INTO external_mapping(id,business_type,business_id,provider_id,external_type,external_id,created_at) VALUES(?,?,?,?,?,?,?)');
insertMapping.run(randomUUID(), 'Account', businessA, 'offline-provider', 'Company', 'company-a', now);
insertMapping.run(randomUUID(), 'Account', businessB, 'offline-provider', 'Company', 'company-b', now);
seed.prepare(`INSERT INTO provider_registration(
  id,endpoint,egress_allowlist_json,timeout_ms,contract_version,enabled,environment_scope,organization_scope,workspace_scope
) VALUES(?,?,?,?,?,1,'local',NULL,NULL)`).run(
  'create-provider',
  `http://127.0.0.1:${providerAddress.port}`,
  JSON.stringify(['127.0.0.1']),
  1500,
  'gbap.crm.v1',
);
const insertCapability = seed.prepare('INSERT INTO capability_binding(provider_id,capability,priority,enabled) VALUES(?,?,200,1)');
insertCapability.run('create-provider', 'crm.v1.account.create');
insertCapability.run('create-provider', 'crm.ops.v1.account.update');
seed.close();

const { createCompanyImportNativeHandler } = await import(`../company-import-native.mjs?test=${Date.now()}`);
const runtime = new DatabaseSync(dbPath);
const insertCatalog = runtime.prepare('INSERT INTO crm_research_account_catalog(business_id,display_name,website,linkedin_url,observed_at) VALUES(?,?,?,?,?)');
insertCatalog.run(businessA, 'ACME TEXTIL S.A.', 'https://www.acme.example.ec', null, now);
insertCatalog.run(businessB, 'INDUSTRIA TEXTIL EJEMPLO S.A.', 'http://www.textil-ejemplo.example.ec', null, now);

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}
function token() {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: jwk.kid }));
  const payload = base64url(JSON.stringify({
    iss: issuer,
    sub: 'company-import-test-admin',
    azp: clientId,
    preferred_username: 'ming',
    exp: Math.floor(Date.now() / 1000) + 3600,
    realm_access: { roles: ['substrate-admin', 'substrate-user'] },
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  signer.end();
  return `${header}.${payload}.${signer.sign(privateKey).toString('base64url')}`;
}
const bearer = token();

const handler = createCompanyImportNativeHandler();
const appServer = http.createServer(async (req, res) => {
  const handled = await handler(req, res);
  if (!handled && !res.headersSent) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  }
});
appServer.listen(0, '127.0.0.1');
await once(appServer, 'listening');
const appAddress = appServer.address();
if (!appAddress || typeof appAddress === 'string') throw new Error('app_address_unavailable');
const baseUrl = `http://127.0.0.1:${appAddress.port}`;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${bearer}`,
      'content-type': 'application/json',
      'x-gbap-organization': 'GBAP',
      'x-gbap-workspace': 'LOCAL-UAT',
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status}:${JSON.stringify(body)}`);
  return body;
}

const mapping = [
  { sourceHeader: 'Company', targetKey: '公司名称' },
  { sourceHeader: 'RUC', targetKey: '__registrationId' },
  { sourceHeader: 'Score', targetKey: 'GBAP价值评分' },
  { sourceHeader: 'Status', targetKey: '销售状态' },
];

async function waitForTerminalJob(jobId) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const detail = await request(`/api/crm-native/company-import/jobs/${jobId}?limit=20`);
    if (detail.job.status === 'COMPLETED' || detail.job.status === 'PARTIAL_FAILED') return detail;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('company_import_timeout');
}

async function createAndRun(scores) {
  const job = await request('/api/crm-native/company-import/jobs', {
    method: 'POST',
    body: JSON.stringify({
      fileName: 'ecuador-customers.csv',
      sourceDigest: null,
      presetId: 'gbap-ecuador-v46',
      defaultCountry: 'EC',
      defaultRegistrationType: 'RUC',
      updatePolicy: 'OVERWRITE_MAPPED',
      importMode: 'UPSERT',
      rowCount: 2,
      mapping,
    }),
  });

  await request(`/api/crm-native/company-import/jobs/${job.id}/rows`, {
    method: 'POST',
    body: JSON.stringify({ rows: [
      {
        rowNumber: 2,
        displayName: 'ACME TEXTIL S.A.',
        registrationCountry: 'EC',
        registrationType: 'RUC',
        registrationId: '1790012345001',
        fields: {
          '公司名称': 'ACME TEXTIL S.A.',
          'GBAP价值评分': scores[0],
          '销售状态': '已成交',
          '官网': 'https://www.acme.example.ec',
        },
      },
      {
        rowNumber: 3,
        displayName: 'INDUSTRIA TEXTIL EJEMPLO S.A.',
        registrationCountry: 'EC',
        registrationType: 'RUC',
        registrationId: '1790023456001',
        fields: {
          '公司名称': 'INDUSTRIA TEXTIL EJEMPLO S.A.',
          'GBAP价值评分': scores[1],
          '销售状态': '报价方案',
          '官网': 'http://www.textil-ejemplo.example.ec',
        },
      },
    ] }),
  });

  const preflight = await request(`/api/crm-native/company-import/jobs/${job.id}/preflight`, { method: 'POST', body: '{}' });
  assert.equal(preflight.status, 'PREFLIGHT_READY');
  assert.equal(preflight.summary.create, 0);
  assert.equal(preflight.summary.update, 2);
  assert.equal(preflight.summary.conflict, 0);
  assert.equal(preflight.summary.fullLegacyCoverageRequired, true);
  assert.equal(preflight.summary.legacyCoverageUnsafe, false);

  const started = await request(`/api/crm-native/company-import/jobs/${job.id}/start`, { method: 'POST', body: '{}' });
  assert.equal(started.status, 'RUNNING');
  return waitForTerminalJob(job.id);
}

async function createNewCompanyJob({ displayName, ruc, score = '91' }) {
  const job = await request('/api/crm-native/company-import/jobs', {
    method: 'POST',
    body: JSON.stringify({
      fileName: 'ecuador-new-company.csv',
      sourceDigest: null,
      presetId: 'gbap-ecuador-v46',
      defaultCountry: 'EC',
      defaultRegistrationType: 'RUC',
      updatePolicy: 'OVERWRITE_MAPPED',
      importMode: 'UPSERT',
      rowCount: 1,
      mapping,
    }),
  });
  await request(`/api/crm-native/company-import/jobs/${job.id}/rows`, {
    method: 'POST',
    body: JSON.stringify({ rows: [{
      rowNumber: 2,
      displayName,
      registrationCountry: 'EC',
      registrationType: 'RUC',
      registrationId: ruc,
      fields: {
        '公司名称': displayName,
        'GBAP价值评分': score,
      },
    }] }),
  });
  const preflight = await request(`/api/crm-native/company-import/jobs/${job.id}/preflight`, { method: 'POST', body: '{}' });
  assert.equal(preflight.status, 'PREFLIGHT_READY');
  assert.equal(preflight.summary.create, 1);
  assert.equal(preflight.summary.update, 0);
  assert.equal(preflight.summary.conflict, 0);
  return job;
}

try {
  const first = await createAndRun(['98', '97']);
  assert.equal(first.job.status, 'COMPLETED');
  assert.equal(first.rows.length, 2);
  assert.equal(first.rows.every((row) => row.status === 'COMPLETE'), true);
  assert.equal(first.rows.every((row) => row.providerWarning === 'provider_mapping_unavailable'), true);

  const identityA = runtime.prepare('SELECT * FROM crm_registration_identity WHERE registration_country=? AND registration_type=? AND registration_id=?').get('EC', 'RUC', '1790012345001');
  const identityB = runtime.prepare('SELECT * FROM crm_registration_identity WHERE registration_country=? AND registration_type=? AND registration_id=?').get('EC', 'RUC', '1790023456001');
  assert.equal(identityA.business_id, businessA);
  assert.equal(identityB.business_id, businessB);

  const profileA1 = JSON.parse(runtime.prepare('SELECT fields_json FROM crm_research_authoritative_profile WHERE account_business_id=?').get(businessA).fields_json);
  const profileB1 = JSON.parse(runtime.prepare('SELECT fields_json FROM crm_research_authoritative_profile WHERE account_business_id=?').get(businessB).fields_json);
  assert.equal(profileA1['GBAP价值评分'], '98');
  assert.equal(profileB1['GBAP价值评分'], '97');
  assert.equal(Object.prototype.hasOwnProperty.call(profileA1, '销售状态'), false);

  const stateA1 = JSON.parse(runtime.prepare("SELECT state_json FROM crm_business_state WHERE business_type='Account' AND business_id=?").get(businessA).state_json);
  assert.equal(stateA1.registrationId, '1790012345001');
  assert.equal(stateA1.strategicValueScore, 98);
  assert.equal(Object.prototype.hasOwnProperty.call(stateA1, 'relationshipStatus'), false);

  const second = await createAndRun(['88', '']);
  assert.equal(second.job.status, 'COMPLETED');
  assert.equal(second.job.summary.update, 2);

  const profileA2 = JSON.parse(runtime.prepare('SELECT fields_json FROM crm_research_authoritative_profile WHERE account_business_id=?').get(businessA).fields_json);
  const profileB2 = JSON.parse(runtime.prepare('SELECT fields_json FROM crm_research_authoritative_profile WHERE account_business_id=?').get(businessB).fields_json);
  assert.equal(profileA2['GBAP价值评分'], '88');
  assert.equal(profileB2['GBAP价值评分'], '');

  const stateA2 = JSON.parse(runtime.prepare("SELECT state_json FROM crm_business_state WHERE business_type='Account' AND business_id=?").get(businessA).state_json);
  const stateB2 = JSON.parse(runtime.prepare("SELECT state_json FROM crm_business_state WHERE business_type='Account' AND business_id=?").get(businessB).state_json);
  assert.equal(stateA2.strategicValueScore, 88);
  assert.equal(stateB2.strategicValueScore, null);

  const createCallsBeforeSuccess = providerCreateBusinessIds.length;
  const newJob = await createNewCompanyJob({ displayName: 'NUEVA INDUSTRIA ECUADOR S.A.', ruc: '1790034567001', score: '93' });
  const newStarted = await request(`/api/crm-native/company-import/jobs/${newJob.id}/start`, { method: 'POST', body: '{}' });
  assert.equal(newStarted.status, 'RUNNING');
  const newComplete = await waitForTerminalJob(newJob.id);
  assert.equal(newComplete.job.status, 'COMPLETED');
  assert.equal(newComplete.rows[0].status, 'COMPLETE');
  assert.equal(providerCreateBusinessIds.length, createCallsBeforeSuccess + 1);
  const newBusinessId = newComplete.rows[0].businessId;
  assert.match(newBusinessId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.equal(providerCreateBusinessIds.at(-1), newBusinessId);
  const newMapping = runtime.prepare("SELECT * FROM external_mapping WHERE business_type='Account' AND business_id=?").get(newBusinessId);
  assert.equal(newMapping.provider_id, 'create-provider');
  assert.equal(newMapping.external_id, newBusinessId);
  const newIdentity = runtime.prepare('SELECT * FROM crm_registration_identity WHERE registration_country=? AND registration_type=? AND registration_id=?').get('EC', 'RUC', '1790034567001');
  assert.equal(newIdentity.business_id, newBusinessId);

  const retryCallsBefore = providerCreateBusinessIds.length;
  providerCreateFailuresRemaining = 1;
  const retryJob = await createNewCompanyJob({ displayName: 'RECOVERY INDUSTRIA S.A.', ruc: '1790045678001', score: '92' });
  await request(`/api/crm-native/company-import/jobs/${retryJob.id}/start`, { method: 'POST', body: '{}' });
  const failed = await waitForTerminalJob(retryJob.id);
  assert.equal(failed.job.status, 'PARTIAL_FAILED');
  assert.equal(failed.rows[0].status, 'FAILED');
  assert.equal(failed.rows[0].errorCode, 'provider_unavailable');
  const failedBusinessId = failed.rows[0].businessId;
  assert.match(failedBusinessId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.equal(providerCreateBusinessIds.length, retryCallsBefore + 1);
  assert.equal(providerCreateBusinessIds.at(-1), failedBusinessId);

  const retryAccepted = await request(`/api/crm-native/company-import/jobs/${retryJob.id}/retry-failed`, { method: 'POST', body: '{}' });
  assert.equal(['PARTIAL_FAILED', 'RUNNING'].includes(retryAccepted.status), true);
  const recovered = await waitForTerminalJob(retryJob.id);
  assert.equal(recovered.job.status, 'COMPLETED');
  assert.equal(recovered.rows[0].status, 'COMPLETE');
  assert.equal(recovered.rows[0].businessId, failedBusinessId);
  assert.equal(providerCreateBusinessIds.length, retryCallsBefore + 2);
  assert.equal(providerCreateBusinessIds.at(-1), failedBusinessId);
  const retryMapping = runtime.prepare("SELECT * FROM external_mapping WHERE business_type='Account' AND business_id=?").get(failedBusinessId);
  assert.equal(retryMapping.provider_id, 'create-provider');
  assert.equal(retryMapping.external_id, failedBusinessId);
  assert.equal(runtime.prepare("SELECT COUNT(*) count FROM external_mapping WHERE business_type='Account' AND business_id=?").get(failedBusinessId).count, 1);
  const retryIdentity = runtime.prepare('SELECT * FROM crm_registration_identity WHERE registration_country=? AND registration_type=? AND registration_id=?').get('EC', 'RUC', '1790045678001');
  assert.equal(retryIdentity.business_id, failedBusinessId);

  console.log('PASS company import native runtime');
} finally {
  runtime.close();
  appServer.close();
  providerServer.close();
  jwksServer.close();
  rmSync(temp, { recursive: true, force: true });
}