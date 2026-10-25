import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

function base64url(value) { return Buffer.from(value).toString('base64url'); }
function tokenFor(privateKey, kid, issuer) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const payload = base64url(JSON.stringify({ sub: 'trade-user', preferred_username: 'trade.user', iss: issuer, azp: 'gbap-web', iat: now, exp: now + 300, realm_access: { roles: ['substrate-user'] } }));
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
  return `${header}.${payload}.${signature}`;
}
async function listen(server) {
  await new Promise((resolvePromise, rejectPromise) => { server.once('error', rejectPromise); server.listen(0, '127.0.0.1', resolvePromise); });
  return server.address().port;
}
async function requestJson(url, token, options = {}) {
  const response = await fetch(url, { ...options, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(options.headers ?? {}) } });
  return { response, body: await response.json() };
}

test('opportunity trade stage PATCH persists GBAP profile and audit and GET reads it back', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'gbap-opportunity-profile-'));
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
    .run(randomUUID(), 'Opportunity', 'opportunity-trade-1', 'test-provider', 'opportunity', 'external-opportunity-1', new Date().toISOString());
  seed.close();

  const kid = 'opportunity-profile-test-key';
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' });
  publicJwk.kid = kid;
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  const jwksServer = http.createServer((req, res) => {
    if (req.url === '/certs') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ keys: [publicJwk] })); return; }
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

  const { createOpportunityProfileHandler, FOREIGN_TRADE_STAGES } = await import(`../opportunity-profile.mjs?test=${Date.now()}`);
  assert.deepEqual(FOREIGN_TRADE_STAGES, ['NEW', 'CONTACTED', 'QUALIFYING', 'NEEDS_CONFIRMED', 'TECHNICAL_SAMPLE', 'QUOTATION', 'NEGOTIATION', 'DECISION', 'ORDER_PENDING', 'ON_HOLD', 'ORDER_CONFIRMED']);
  const handler = createOpportunityProfileHandler();
  const apiServer = http.createServer(async (req, res) => {
    if (await handler(req, res)) return;
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  const apiPort = await listen(apiServer);
  const token = tokenFor(privateKey, kid, issuer);
  const base = `http://127.0.0.1:${apiPort}`;

  t.after(() => { apiServer.close(); jwksServer.close(); rmSync(work, { recursive: true, force: true }); });

  const first = await requestJson(`${base}/api/crm-native/opportunity-profiles/opportunity-trade-1`, token, { method: 'PATCH', body: JSON.stringify({ tradeStage: 'NEGOTIATION' }) });
  assert.equal(first.response.status, 200);
  assert.equal(first.body.profile.businessId, 'opportunity-trade-1');
  assert.equal(first.body.profile.tradeStage, 'NEGOTIATION');

  const collection = await requestJson(`${base}/api/crm-native/opportunity-profiles`, token);
  assert.equal(collection.response.status, 200);
  assert.equal(collection.body.profiles.length, 1);
  assert.equal(collection.body.profiles[0].tradeStage, 'NEGOTIATION');

  const verifyDb = new DatabaseSync(dbPath, { readOnly: true });
  const state = JSON.parse(verifyDb.prepare("SELECT state_json FROM crm_business_state WHERE business_type='Opportunity' AND business_id=?").get('opportunity-trade-1').state_json);
  assert.equal(state.tradeStage, 'NEGOTIATION');
  const audit = verifyDb.prepare("SELECT payload_json FROM audit_event WHERE action='crm.opportunity.trade_stage.update' AND target='Opportunity:opportunity-trade-1'").get();
  assert.equal(JSON.parse(audit.payload_json).tradeStage, 'NEGOTIATION');
  verifyDb.close();

  const second = await requestJson(`${base}/api/crm-native/opportunity-profiles/opportunity-trade-1`, token, { method: 'PATCH', body: JSON.stringify({ tradeStage: 'ORDER_PENDING' }) });
  assert.equal(second.response.status, 200);
  assert.equal(second.body.profile.tradeStage, 'ORDER_PENDING');

  const invalid = await requestJson(`${base}/api/crm-native/opportunity-profiles/opportunity-trade-1`, token, { method: 'PATCH', body: JSON.stringify({ tradeStage: 'UNKNOWN_PROVIDER_STAGE' }) });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.error, 'invalid_trade_stage');
});
