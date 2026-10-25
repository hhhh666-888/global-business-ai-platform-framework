import { getCachedJwk } from './jwks-cache.mjs';
import { createPublicKey, randomUUID, verify as verifySignature } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const DB_PATH = process.env.DB_PATH ?? '/data/substrate.db';
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:8080';
const OIDC_ISSUER = process.env.OIDC_ISSUER ?? 'http://localhost:8082/realms/gbap';
const OIDC_ALLOWED_ISSUERS = new Set((process.env.OIDC_ALLOWED_ISSUERS ?? OIDC_ISSUER).split(',').map((value) => value.trim()).filter(Boolean));
const OIDC_JWKS_URL_INTERNAL = process.env.OIDC_JWKS_URL_INTERNAL ?? 'http://keycloak:8080/realms/gbap/protocol/openid-connect/certs';
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID ?? 'gbap-web';
const MAX_PREFERENCE_BYTES = 512 * 1024;
const PREFERENCE_KEY = /^[a-z0-9][a-z0-9._-]{0,119}$/i;

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS ui_user_preference (
  owner_subject TEXT NOT NULL,
  preference_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(owner_subject, preference_key)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_ui_user_preference_owner_updated
ON ui_user_preference(owner_subject, updated_at DESC);
`);

function nowIso() { return new Date().toISOString(); }
function responseHeaders(extra = {}) {
  return {
    'cache-control': 'no-store',
    'access-control-allow-origin': CORS_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET,PUT,DELETE,OPTIONS',
    ...extra,
  };
}
function json(res, status, body) {
  res.writeHead(status, responseHeaders({ 'content-type': 'application/json; charset=utf-8' }));
  res.end(status === 204 ? '' : JSON.stringify(body));
}
function httpError(message, status = 400) {
  const error = new Error(message);
  error.httpStatus = status;
  return error;
}
async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_PREFERENCE_BYTES + 4096) throw httpError('request_body_too_large', 413);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw httpError('invalid_json', 400); }
}
function decodeSegment(segment) {
  const pad = segment.length % 4 === 0 ? '' : '='.repeat(4 - (segment.length % 4));
  return Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}
async function getJwk(kid) { return getCachedJwk(kid, OIDC_JWKS_URL_INTERNAL); }
async function authenticate(req) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) throw httpError('missing_bearer_token', 401);
  const parts = header.slice(7).split('.');
  if (parts.length !== 3) throw httpError('invalid_jwt', 401);
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  let headerJson;
  let claims;
  try {
    headerJson = JSON.parse(decodeSegment(encodedHeader).toString('utf8'));
    claims = JSON.parse(decodeSegment(encodedPayload).toString('utf8'));
  } catch { throw httpError('invalid_jwt', 401); }
  if (headerJson.alg !== 'RS256' || typeof headerJson.kid !== 'string') throw httpError('unsupported_jwt', 401);
  const publicKey = createPublicKey({ key: await getJwk(headerJson.kid), format: 'jwk' });
  if (!verifySignature('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), publicKey, decodeSegment(encodedSignature))) throw httpError('invalid_signature', 401);
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= now) throw httpError('token_expired', 401);
  if (claims.nbf && claims.nbf > now + 30) throw httpError('token_not_yet_valid', 401);
  if (!OIDC_ALLOWED_ISSUERS.has(claims.iss)) throw httpError('invalid_issuer', 401);
  if (claims.azp && claims.azp !== OIDC_CLIENT_ID) throw httpError('invalid_authorized_party', 401);
  if (typeof claims.sub !== 'string' || !claims.sub.trim()) throw httpError('invalid_subject', 401);
  return {
    subject: claims.sub,
    username: claims.preferred_username ?? null,
    roles: new Set(Array.isArray(claims.realm_access?.roles) ? claims.realm_access.roles : []),
  };
}
function requireUser(actor) {
  if (!actor.roles.has('substrate-user') && !actor.roles.has('substrate-admin')) throw httpError('forbidden', 403);
}
function validatePreferenceKey(raw) {
  let value;
  try { value = decodeURIComponent(raw); } catch { throw httpError('invalid_preference_key', 400); }
  if (!PREFERENCE_KEY.test(value)) throw httpError('invalid_preference_key', 400);
  return value;
}
function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
function audit(actor, action, key, payload = {}) {
  if (!tableExists('audit_event')) return;
  db.prepare(`INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)`).run(
    randomUUID(), actor.subject, actor.username, action, `UserPreference:${key}`, nowIso(), JSON.stringify(payload),
  );
}
function preferenceView(key, row) {
  if (!row) return null;
  let value = null;
  try { value = JSON.parse(row.value_json); } catch {}
  return { key, value, updatedAt: row.updated_at };
}
function isBusyError(error) {
  return error?.errcode === 5 || error?.errstr === 'database is locked' || /database is (locked|busy)/i.test(String(error?.message ?? ''));
}

export function createUserPreferencesHandler() {
  return async function userPreferencesHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const match = url.pathname.match(/^\/api\/user-preferences\/([^/]+)$/);
    if (!match) return false;
    if (req.method === 'OPTIONS') { json(res, 204, {}); return true; }

    try {
      const actor = await authenticate(req);
      requireUser(actor);
      const key = validatePreferenceKey(match[1]);

      if (req.method === 'GET') {
        const row = db.prepare('SELECT value_json,updated_at FROM ui_user_preference WHERE owner_subject=? AND preference_key=?').get(actor.subject, key);
        json(res, 200, { preference: preferenceView(key, row) });
        return true;
      }

      if (req.method === 'PUT') {
        const input = await readJson(req);
        if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.prototype.hasOwnProperty.call(input, 'value')) throw httpError('preference_value_required', 400);
        const valueJson = JSON.stringify(input.value);
        if (valueJson === undefined || Buffer.byteLength(valueJson, 'utf8') > MAX_PREFERENCE_BYTES) throw httpError('preference_value_too_large', 400);
        const updatedAt = nowIso();
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare(`INSERT INTO ui_user_preference(owner_subject,preference_key,value_json,updated_at) VALUES(?,?,?,?)
            ON CONFLICT(owner_subject,preference_key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at`).run(actor.subject, key, valueJson, updatedAt);
          audit(actor, 'ui.user_preference.update', key, { bytes: Buffer.byteLength(valueJson, 'utf8') });
          db.exec('COMMIT');
        } catch (error) {
          try { db.exec('ROLLBACK'); } catch {}
          throw error;
        }
        json(res, 200, { preference: { key, value: input.value, updatedAt } });
        return true;
      }

      if (req.method === 'DELETE') {
        const result = db.prepare('DELETE FROM ui_user_preference WHERE owner_subject=? AND preference_key=?').run(actor.subject, key);
        if (result.changes > 0) audit(actor, 'ui.user_preference.delete', key);
        json(res, 200, { removed: result.changes > 0 });
        return true;
      }

      json(res, 405, { error: 'method_not_allowed' });
      return true;
    } catch (error) {
      if (isBusyError(error)) {
        json(res, 503, { error: 'user_preferences_temporarily_busy' });
        return true;
      }
      json(res, error.httpStatus ?? 500, { error: error.httpStatus ? error.message : 'internal_error' });
      return true;
    }
  };
}
