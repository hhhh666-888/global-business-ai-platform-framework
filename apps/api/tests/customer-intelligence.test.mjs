import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import './research-intake-governance.test.mjs';

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function tokenFor(privateKey, kid, issuer, subject = 'ci-user', username = subject) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const payload = base64url(JSON.stringify({
    sub: subject,
    preferred_username: username,
    iss: issuer,
    azp: 'gbap-web',
    iat: now,
    exp: now + 300,
    realm_access: { roles: ['substrate-user'] },
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

test('customer intelligence PATCH persists profile and audit atomically and GET reads it back', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'gbap-customer-intelligence-'));
  const dbPath = join(work, 'substrate.db');
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
  seed.prepare('INSERT INTO external_mapping(id,business_type,business_id,provider_id,external_type,external_id,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(randomUUID(), 'Account', 'account-ci-1', 'test-provider', 'company', 'external-company-1', new Date().toISOString());
  seed.close();

  const kid = 'customer-intelligence-test-key';
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

  const { createCustomerIntelligenceHandler } = await import(`../customer-intelligence.mjs?test=${Date.now()}`);
  const handler = createCustomerIntelligenceHandler();
  const apiServer = http.createServer(async (req, res) => {
    if (await handler(req, res)) return;
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  const apiPort = await listen(apiServer);
  const token = tokenFor(privateKey, kid, issuer);
  const base = `http://127.0.0.1:${apiPort}`;

  t.after(() => {
    apiServer.close();
    jwksServer.close();
    rmSync(work, { recursive: true, force: true });
  });

  const firstPatch = {
    customerSegment: 'INDUSTRIAL',
    customerRoles: ['FACTORY'],
    monthlyConsumptionKwh: 850000,
    monthlyElectricityCost: 92000,
    electricityCostCurrency: 'USD',
    operatingHoursPerDay: 24,
    gridStability: 'FREQUENT_OUTAGE',
    projectNeeds: ['SOLAR', 'STORAGE'],
    keyEquipmentText: '注塑机 × 28；空压机 × 6',
  };

  const first = await requestJson(`${base}/api/crm-native/customer-intelligence/account-ci-1`, token, {
    method: 'PATCH',
    body: JSON.stringify(firstPatch),
  });
  assert.equal(first.response.status, 200);
  assert.equal(first.body.profile.businessId, 'account-ci-1');
  assert.equal(first.body.profile.monthlyConsumptionKwh, 850000);
  assert.deepEqual(first.body.profile.projectNeeds, ['SOLAR', 'STORAGE']);

  const collection = await requestJson(`${base}/api/crm-native/customer-intelligence`, token);
  assert.equal(collection.response.status, 200);
  assert.equal(collection.body.profiles.length, 1);
  assert.equal(collection.body.profiles[0].keyEquipmentText, '注塑机 × 28；空压机 × 6');

  const verifyDb = new DatabaseSync(dbPath, { readOnly: true });
  const row = verifyDb.prepare("SELECT state_json FROM crm_business_state WHERE business_type='Account' AND business_id=?").get('account-ci-1');
  const state = JSON.parse(row.state_json);
  assert.equal(state.monthlyElectricityCost, 92000);
  assert.equal(state.gridStability, 'FREQUENT_OUTAGE');
  assert.equal(verifyDb.prepare("SELECT COUNT(*) AS count FROM audit_event WHERE action='crm.customer_intelligence.update' AND target='Account:account-ci-1'").get().count, 1);
  verifyDb.close();

  const second = await requestJson(`${base}/api/crm-native/customer-intelligence/account-ci-1`, token, {
    method: 'PATCH',
    body: JSON.stringify({ monthlyConsumptionKwh: 910000, projectNeeds: ['SOLAR', 'STORAGE', 'MICROGRID'] }),
  });
  assert.equal(second.response.status, 200);
  assert.equal(second.body.profile.monthlyConsumptionKwh, 910000);
  assert.deepEqual(second.body.profile.projectNeeds, ['SOLAR', 'STORAGE', 'MICROGRID']);
  assert.equal(second.body.profile.monthlyElectricityCost, 92000);
});

test('user preferences persist per account and remain isolated across devices and actors', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'gbap-user-preferences-'));
  const dbPath = join(work, 'substrate.db');
  const seed = new DatabaseSync(dbPath);
  seed.exec(`
    PRAGMA journal_mode = WAL;
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
  seed.close();

  const kid = 'user-preferences-test-key';
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

  const { createUserPreferencesHandler } = await import(`../user-preferences.mjs?test=${Date.now()}`);
  const handler = createUserPreferencesHandler();
  const apiServer = http.createServer(async (req, res) => {
    if (await handler(req, res)) return;
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  const apiPort = await listen(apiServer);
  const base = `http://127.0.0.1:${apiPort}`;
  const ownerToken = tokenFor(privateKey, kid, issuer, 'preference-owner', 'preference.owner');
  const otherToken = tokenFor(privateKey, kid, issuer, 'preference-other', 'preference.other');
  const key = 'customer-company-table';
  const ownerValue = {
    version: 1,
    segment: 'INDUSTRIAL',
    visibleColumns: { INDUSTRIAL: ['公司名称', '城市', '销售负责人'] },
    columnWidths: { 公司名称: 336, 城市: 148 },
    savedViews: [{ id: 'ecuador-priority', name: '厄瓜多尔重点客户', columns: ['公司名称', '城市'] }],
  };

  t.after(() => {
    apiServer.close();
    jwksServer.close();
    rmSync(work, { recursive: true, force: true });
  });

  const missing = await requestJson(`${base}/api/user-preferences/${key}`, ownerToken);
  assert.equal(missing.response.status, 200);
  assert.equal(missing.body.preference, null);

  const written = await requestJson(`${base}/api/user-preferences/${key}`, ownerToken, {
    method: 'PUT',
    body: JSON.stringify({ value: ownerValue }),
  });
  assert.equal(written.response.status, 200);
  assert.deepEqual(written.body.preference.value, ownerValue);

  const sameAccountRead = await requestJson(`${base}/api/user-preferences/${key}`, ownerToken);
  assert.equal(sameAccountRead.response.status, 200);
  assert.deepEqual(sameAccountRead.body.preference.value, ownerValue);

  const otherAccountRead = await requestJson(`${base}/api/user-preferences/${key}`, otherToken);
  assert.equal(otherAccountRead.response.status, 200);
  assert.equal(otherAccountRead.body.preference, null);

  const otherValue = { version: 1, segment: 'CHANNEL', columnWidths: { 公司名称: 280 } };
  const otherWrite = await requestJson(`${base}/api/user-preferences/${key}`, otherToken, {
    method: 'PUT',
    body: JSON.stringify({ value: otherValue }),
  });
  assert.equal(otherWrite.response.status, 200);

  const ownerStillIsolated = await requestJson(`${base}/api/user-preferences/${key}`, ownerToken);
  assert.deepEqual(ownerStillIsolated.body.preference.value, ownerValue);

  const verifyDb = new DatabaseSync(dbPath, { readOnly: true });
  assert.equal(verifyDb.prepare('SELECT COUNT(*) AS count FROM ui_user_preference').get().count, 2);
  assert.equal(verifyDb.prepare("SELECT COUNT(*) AS count FROM audit_event WHERE action='ui.user_preference.update'").get().count, 2);
  verifyDb.close();
});
