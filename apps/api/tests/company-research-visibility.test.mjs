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
async function getJson(base, path, token) {
  const response = await fetch(`${base}${path}`, { headers: { authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}
function seed(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE external_mapping (
      id TEXT PRIMARY KEY, business_type TEXT NOT NULL, business_id TEXT NOT NULL, provider_id TEXT NOT NULL,
      external_type TEXT NOT NULL, external_id TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE crm_site (
      business_id TEXT PRIMARY KEY, account_business_id TEXT NOT NULL, site_key TEXT NOT NULL, state_json TEXT NOT NULL,
      created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(account_business_id,site_key)
    );
    CREATE TABLE crm_target_role (
      business_id TEXT PRIMARY KEY, account_business_id TEXT NOT NULL, role_key TEXT NOT NULL, state_json TEXT NOT NULL,
      created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(account_business_id,role_key)
    );
    CREATE TABLE crm_research_evidence (
      business_id TEXT PRIMARY KEY, account_business_id TEXT NOT NULL, batch_id TEXT NOT NULL, row_number INTEGER NOT NULL,
      source_name TEXT NOT NULL, source_digest TEXT, evidence_json TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(batch_id,row_number)
    );
    CREATE TABLE crm_research_intelligence (
      business_id TEXT PRIMARY KEY, account_business_id TEXT NOT NULL UNIQUE, state_json TEXT NOT NULL,
      created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE crm_sales_signal (
      business_id TEXT PRIMARY KEY, account_business_id TEXT NOT NULL UNIQUE, state_json TEXT NOT NULL,
      created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE crm_energy_discovery (
      business_id TEXT PRIMARY KEY, account_business_id TEXT NOT NULL UNIQUE, state_json TEXT NOT NULL,
      created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `);
  const now = new Date().toISOString();
  const account1 = randomUUID();
  const account2 = randomUUID();
  for (const account of [account1, account2]) {
    db.prepare("INSERT INTO external_mapping(id,business_type,business_id,provider_id,external_type,external_id,created_at) VALUES(?,?,?,?,?,?,?)")
      .run(randomUUID(), 'Account', account, 'provider', 'company', account, now);
  }
  db.prepare('INSERT INTO crm_site(business_id,account_business_id,site_key,state_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run(randomUUID(), account1, 'ADDR:test-site', JSON.stringify({ siteName: 'Quito Main Plant', province: 'Pichincha', city: 'Quito', address: 'Industrial Zone', estimatedMonthlyConsumptionKwh: 620000, estimatedPeakDemandKw: 1800, energyPainPoints: 'Frequent dry-season outages', keyEquipmentText: 'extrusion lines' }), 'research', now, now);
  db.prepare('INSERT INTO crm_target_role(business_id,account_business_id,role_key,state_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run(randomUUID(), account1, 'ENERGY_MAINTENANCE', JSON.stringify({ roleTitleText: 'Energy Manager', candidateName: 'Ana Example', verificationNote: 'Needs second confirmation', status: 'OPEN' }), 'research', now, now);
  db.prepare('INSERT INTO crm_research_evidence(business_id,account_business_id,batch_id,row_number,source_name,source_digest,evidence_json,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(randomUUID(), account1, randomUUID(), 2, 'EC_TOP500_V46_20260915', 'digest', JSON.stringify({ sourceTitle: 'Official website', statement: 'Factory operation publicly verified', verifiedAt: '2026-09-15', sourceUrl: 'https://example.com/evidence' }), 'research', now);
  db.prepare('INSERT INTO crm_research_intelligence(business_id,account_business_id,state_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run(randomUUID(), account1, JSON.stringify({ researchPriority: 'P1', researchCompleteness: 'Deep researched', recommendedSolution: 'PV + ESS + backup', recommendedEntryPoint: 'Confirm 12-month load data', researchNextAction: 'Find energy manager direct contact' }), 'research', now, now);
  db.prepare('INSERT INTO crm_sales_signal(business_id,account_business_id,state_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run(randomUUID(), account1, JSON.stringify({ solarOpportunity: 'High', storageOpportunity: 'High', generatorOpportunity: 'Medium', electricalOpportunity: 'Medium' }), 'research', now, now);
  db.prepare('INSERT INTO crm_energy_discovery(business_id,account_business_id,state_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run(randomUUID(), account1, JSON.stringify({ publicKnownEnergyData: 'Public record indicates high industrial electricity demand' }), 'research', now, now);
  db.close();
  return { account1, account2 };
}

test('employee research visibility aggregates canonical research objects without N+1 API reads', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'gbap-company-research-view-'));
  const dbPath = join(work, 'substrate.db');
  const { account1, account2 } = seed(dbPath);
  const kid = 'company-research-view-key';
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' }); publicJwk.kid = kid; publicJwk.alg = 'RS256'; publicJwk.use = 'sig';
  const jwks = http.createServer((req, res) => {
    if (req.url === '/certs') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ keys: [publicJwk] })); return; }
    res.writeHead(404).end();
  });
  const jwksPort = await listen(jwks);
  const issuer = `http://127.0.0.1:${jwksPort}/realms/gbap`;
  Object.assign(process.env, { DB_PATH: dbPath, OIDC_ISSUER: issuer, OIDC_ALLOWED_ISSUERS: issuer, OIDC_JWKS_URL_INTERNAL: `http://127.0.0.1:${jwksPort}/certs`, OIDC_CLIENT_ID: 'gbap-web' });

  const { createCompanyResearchVisibilityHandler } = await import(`../company-research-visibility.mjs?test=${Date.now()}`);
  const handler = createCompanyResearchVisibilityHandler();
  const api = http.createServer(async (req, res) => { if (await handler(req, res)) return; res.writeHead(404).end(); });
  const apiPort = await listen(api);
  const base = `http://127.0.0.1:${apiPort}`;
  const employee = tokenFor(privateKey, kid, issuer, ['substrate-user'], 'employee');
  const outsider = tokenFor(privateKey, kid, issuer, [], 'outsider');
  t.after(() => { api.close(); jwks.close(); rmSync(work, { recursive: true, force: true }); });

  const denied = await getJson(base, '/api/crm-native/company-research-insights', outsider);
  assert.equal(denied.response.status, 403);

  const result = await getJson(base, '/api/crm-native/company-research-insights', employee);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.insights.length, 1, 'account without any research objects is omitted from compact payload');
  const insight = result.payload.insights[0];
  assert.equal(insight.accountBusinessId, account1);
  assert.notEqual(insight.accountBusinessId, account2);
  assert.equal(insight.siteCount, 1);
  assert.equal(insight.primarySite.siteName, 'Quito Main Plant');
  assert.equal(insight.primarySite.estimatedMonthlyConsumptionKwh, 620000);
  assert.equal(insight.primarySite.estimatedPeakDemandKw, 1800);
  assert.equal(insight.openTargetRoleCount, 1);
  assert.equal(insight.targetRoles[0].candidateName, 'Ana Example');
  assert.equal(insight.evidenceCount, 1);
  assert.equal(insight.evidence.length, 1);
  assert.equal(insight.evidence[0].statement, 'Factory operation publicly verified');
  assert.equal(insight.latestEvidence.statement, 'Factory operation publicly verified');
  assert.equal(insight.researchIntelligence.researchPriority, 'P1');
  assert.equal(insight.researchIntelligence.researchNextAction, 'Find energy manager direct contact');
  assert.equal(insight.salesSignal.solarOpportunity, 'High');
  assert.equal(insight.salesSignal.storageOpportunity, 'High');
  assert.equal(insight.energyDiscovery.publicKnownEnergyData, 'Public record indicates high industrial electricity demand');
});
