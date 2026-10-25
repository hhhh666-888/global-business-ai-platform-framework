import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

function base64url(value) { return Buffer.from(value).toString('base64url'); }
function tokenFor(privateKey, kid, issuer, subject, username = subject) {
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
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(options.headers ?? {}) },
  });
  return { response, body: await response.json() };
}

test('internal calendar persists CRUD per actor without any mail provider connection', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'gbap-calendar-native-'));
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

  const kid = 'calendar-native-test-key';
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

  const { createCalendarNativeHandler } = await import(`../calendar-native.mjs?test=${Date.now()}`);
  const handler = createCalendarNativeHandler();
  const apiServer = http.createServer(async (req, res) => {
    if (await handler(req, res)) return;
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  const apiPort = await listen(apiServer);
  const base = `http://127.0.0.1:${apiPort}`;
  const ownerToken = tokenFor(privateKey, kid, issuer, 'calendar-owner', 'calendar.owner');
  const otherToken = tokenFor(privateKey, kid, issuer, 'calendar-other', 'calendar.other');

  t.after(() => {
    apiServer.close();
    jwksServer.close();
    rmSync(work, { recursive: true, force: true });
  });

  const created = await requestJson(`${base}/api/calendar-events`, ownerToken, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Ecuador customer call',
      description: 'Review factory load data',
      location: 'Meeting Room A',
      startsAt: '2026-09-15T01:00:00.000Z',
      endsAt: '2026-09-15T02:00:00.000Z',
      fullDay: false,
      timeZone: 'Asia/Shanghai',
    }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.event.title, 'Ecuador customer call');
  assert.equal(created.body.event.location, 'Meeting Room A');
  const eventId = created.body.event.id;

  const ownerList = await requestJson(`${base}/api/calendar-events`, ownerToken);
  assert.equal(ownerList.response.status, 200);
  assert.equal(ownerList.body.events.length, 1);
  assert.equal(ownerList.body.events[0].id, eventId);

  const otherList = await requestJson(`${base}/api/calendar-events`, otherToken);
  assert.equal(otherList.response.status, 200);
  assert.deepEqual(otherList.body.events, []);

  const forbiddenReadThroughUpdate = await requestJson(`${base}/api/calendar-events/${eventId}`, otherToken, {
    method: 'PATCH',
    body: JSON.stringify({ title: 'Should not work' }),
  });
  assert.equal(forbiddenReadThroughUpdate.response.status, 404);

  const updated = await requestJson(`${base}/api/calendar-events/${eventId}`, ownerToken, {
    method: 'PATCH',
    body: JSON.stringify({ title: 'Updated customer call', location: 'Online' }),
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.event.title, 'Updated customer call');
  assert.equal(updated.body.event.location, 'Online');

  const removed = await requestJson(`${base}/api/calendar-events/${eventId}`, ownerToken, { method: 'DELETE' });
  assert.equal(removed.response.status, 200);
  assert.equal(removed.body.removed, eventId);

  const afterDelete = await requestJson(`${base}/api/calendar-events`, ownerToken);
  assert.deepEqual(afterDelete.body.events, []);

  const verifyDb = new DatabaseSync(dbPath, { readOnly: true });
  const actions = verifyDb.prepare("SELECT action FROM audit_event WHERE actor_subject='calendar-owner' ORDER BY occurred_at, action").all().map((row) => row.action);
  assert.equal(actions.filter((action) => action === 'calendar.event.create').length, 1);
  assert.equal(actions.filter((action) => action === 'calendar.event.update').length, 1);
  assert.equal(actions.filter((action) => action === 'calendar.event.delete').length, 1);
  verifyDb.close();
});
