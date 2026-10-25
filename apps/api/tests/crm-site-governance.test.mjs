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
async function request(base, path, token, { method = 'GET', body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  return { response, payload };
}
function seedDatabase(dbPath, accountBusinessId) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE external_mapping (
      id TEXT PRIMARY KEY, business_type TEXT NOT NULL, business_id TEXT NOT NULL,
      provider_id TEXT NOT NULL, external_type TEXT NOT NULL, external_id TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE audit_event (
      id TEXT PRIMARY KEY, actor_subject TEXT NOT NULL, actor_username TEXT, action TEXT NOT NULL,
      target TEXT NOT NULL, occurred_at TEXT NOT NULL, payload_json TEXT NOT NULL
    );
  `);
  db.prepare('INSERT INTO external_mapping(id,business_type,business_id,provider_id,external_type,external_id,created_at) VALUES(?,?,?,?,?,?,?)').run(
    randomUUID(), 'Account', accountBusinessId, 'provider-test', 'company', accountBusinessId, new Date().toISOString(),
  );
  db.close();
}

test('Company Site is one-to-many, actor-governed and independently auditable', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'gbap-crm-site-'));
  const dbPath = join(work, 'substrate.db');
  const accountBusinessId = randomUUID();
  seedDatabase(dbPath, accountBusinessId);

  const kid = 'site-key';
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' });
  publicJwk.kid = kid; publicJwk.alg = 'RS256'; publicJwk.use = 'sig';
  const jwks = http.createServer((req, res) => {
    if (req.url === '/certs') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ keys: [publicJwk] })); return; }
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
  });

  const { createCrmSiteHandler } = await import(`../crm-site.mjs?test=${Date.now()}`);
  const handler = createCrmSiteHandler();
  const server = http.createServer(async (req, res) => { if (await handler(req, res)) return; res.writeHead(404).end(); });
  const port = await listen(server);
  const base = `http://127.0.0.1:${port}`;
  const employee = tokenFor(privateKey, kid, issuer, ['substrate-user'], 'employee-site');
  const outsider = tokenFor(privateKey, kid, issuer, [], 'outsider');

  t.after(() => { server.close(); jwks.close(); rmSync(work, { recursive: true, force: true }); });

  const first = await request(base, '/api/crm-native/sites', employee, {
    method: 'POST',
    body: {
      accountBusinessId,
      siteName: 'Quito Main Plant',
      siteKind: 'FACTORY',
      province: 'Pichincha',
      city: 'Quito',
      address: 'Parque Industrial Norte',
      reportedSiteCount: 3,
      keyEquipmentText: 'extrusion lines; compressors',
      estimatedPeakDemandKw: 1800,
      estimatedMonthlyConsumptionKwh: 620000,
      source: 'employee-discovery',
    },
  });
  assert.equal(first.response.status, 201, JSON.stringify(first.payload));
  assert.equal(first.payload.site.accountBusinessId, accountBusinessId);
  assert.equal(first.payload.site.siteName, 'Quito Main Plant');
  assert.equal(first.payload.site.estimatedPeakDemandKw, 1800);
  assert.match(first.payload.site.siteKey, /^ADDR:/);
  const firstSiteId = first.payload.site.businessId;
  const firstKey = first.payload.site.siteKey;

  const duplicate = await request(base, '/api/crm-native/sites', employee, {
    method: 'POST',
    body: { accountBusinessId, siteName: 'Same physical plant', province: 'Pichincha', city: 'Quito', address: 'Parque Industrial Norte' },
  });
  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.payload.error, 'site_identity_already_exists');

  const second = await request(base, '/api/crm-native/sites', employee, {
    method: 'POST',
    body: { accountBusinessId, siteName: 'Guayaquil Warehouse', siteKind: 'WAREHOUSE', googleMapsUrl: 'https://maps.google.com/example-warehouse' },
  });
  assert.equal(second.response.status, 201, JSON.stringify(second.payload));
  assert.notEqual(second.payload.site.businessId, firstSiteId);
  assert.match(second.payload.site.siteKey, /^MAP:/);

  const list = await request(base, `/api/crm-native/sites?accountBusinessId=${encodeURIComponent(accountBusinessId)}`, employee);
  assert.equal(list.response.status, 200);
  assert.equal(list.payload.sites.length, 2);

  const updated = await request(base, `/api/crm-native/sites/${firstSiteId}`, employee, {
    method: 'PATCH',
    body: { energyPainPoints: 'Frequent outages in dry season', roofSiteConditions: 'Large usable industrial roof' },
  });
  assert.equal(updated.response.status, 200, JSON.stringify(updated.payload));
  assert.equal(updated.payload.site.siteKey, firstKey);
  assert.equal(updated.payload.site.energyPainPoints, 'Frequent outages in dry season');
  assert.equal(updated.payload.site.estimatedMonthlyConsumptionKwh, 620000);

  const item = await request(base, `/api/crm-native/sites/${firstSiteId}`, employee);
  assert.equal(item.response.status, 200);
  assert.equal(item.payload.site.roofSiteConditions, 'Large usable industrial roof');

  const missingCompany = await request(base, '/api/crm-native/sites', employee, {
    method: 'POST', body: { accountBusinessId: randomUUID(), siteName: 'Orphan Site' },
  });
  assert.equal(missingCompany.response.status, 404);
  assert.equal(missingCompany.payload.error, 'customer_company_not_found');

  const denied = await request(base, `/api/crm-native/sites?accountBusinessId=${encodeURIComponent(accountBusinessId)}`, outsider);
  assert.equal(denied.response.status, 403);

  const db = new DatabaseSync(dbPath);
  const siteRows = db.prepare('SELECT COUNT(*) AS count FROM crm_site WHERE account_business_id=?').get(accountBusinessId);
  assert.equal(siteRows.count, 2);
  const audits = db.prepare("SELECT action FROM audit_event WHERE action IN ('crm.site.create','crm.site.update') ORDER BY occurred_at").all();
  assert.equal(audits.filter((row) => row.action === 'crm.site.create').length, 2);
  assert.equal(audits.filter((row) => row.action === 'crm.site.update').length, 1);
  db.close();
});
