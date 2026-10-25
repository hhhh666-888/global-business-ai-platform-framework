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

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS personal_calendar_event (
  id TEXT PRIMARY KEY,
  actor_subject TEXT NOT NULL,
  actor_username TEXT,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  full_day INTEGER NOT NULL DEFAULT 0,
  time_zone TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS idx_personal_calendar_actor_start
ON personal_calendar_event(actor_subject, starts_at, id);
`);

function nowIso() { return new Date().toISOString(); }
function responseHeaders(extra = {}) {
  return {
    'cache-control': 'no-store',
    'access-control-allow-origin': CORS_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    ...extra,
  };
}
function json(res, status, body) {
  res.writeHead(status, responseHeaders({ 'content-type': 'application/json; charset=utf-8' }));
  res.end(JSON.stringify(body));
}
function httpError(message, status = 400) {
  const error = new Error(message);
  error.httpStatus = status;
  return error;
}
async function readJson(req, maxBytes = 64 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw httpError('request_body_too_large', 413);
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
  return {
    subject: claims.sub,
    username: claims.preferred_username ?? null,
    roles: new Set(Array.isArray(claims.realm_access?.roles) ? claims.realm_access.roles : []),
  };
}
function requireUser(actor) {
  if (!actor.roles.has('substrate-user') && !actor.roles.has('substrate-admin')) throw httpError('forbidden', 403);
}
function cleanText(value, label, max, required = false) {
  if (value === undefined) return undefined;
  if (value === null || value === '') {
    if (required) throw httpError(`invalid_${label}`, 400);
    return null;
  }
  if (typeof value !== 'string' || value.length > max) throw httpError(`invalid_${label}`, 400);
  const text = value.trim();
  if (required && !text) throw httpError(`invalid_${label}`, 400);
  return text || null;
}
function iso(value, label) {
  if (typeof value !== 'string' || !value || Number.isNaN(Date.parse(value))) throw httpError(`invalid_${label}`, 400);
  return new Date(value).toISOString();
}
function eventView(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    location: row.location ?? null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    fullDay: Boolean(row.full_day),
    timeZone: row.time_zone ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
function audit(actor, action, eventId, payload = {}) {
  if (!tableExists('audit_event')) return;
  db.prepare(`INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)`).run(
    randomUUID(), actor.subject, actor.username, action, `CalendarEvent:${eventId}`, nowIso(), JSON.stringify(payload),
  );
}
function ownedEvent(actor, id) {
  const row = db.prepare('SELECT * FROM personal_calendar_event WHERE id=? AND actor_subject=?').get(id, actor.subject);
  if (!row) throw httpError('calendar_event_not_found', 404);
  return row;
}

export function createCalendarNativeHandler() {
  return async function calendarNativeHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const collection = url.pathname === '/api/calendar-events';
    const itemMatch = url.pathname.match(/^\/api\/calendar-events\/([^/]+)$/);
    if (!collection && !itemMatch) return false;
    if (req.method === 'OPTIONS') { res.writeHead(204, responseHeaders()); res.end(); return true; }

    try {
      const actor = await authenticate(req);
      requireUser(actor);

      if (collection && req.method === 'GET') {
        const rows = db.prepare('SELECT * FROM personal_calendar_event WHERE actor_subject=? ORDER BY starts_at ASC, id ASC').all(actor.subject);
        json(res, 200, { events: rows.map(eventView) });
        return true;
      }

      if (collection && req.method === 'POST') {
        const input = await readJson(req);
        const title = cleanText(input.title, 'calendar_title', 512, true);
        const startsAt = iso(input.startsAt, 'calendar_starts_at');
        const endsAt = iso(input.endsAt, 'calendar_ends_at');
        if (Date.parse(endsAt) <= Date.parse(startsAt)) throw httpError('calendar_end_must_follow_start', 400);
        const id = randomUUID();
        const timestamp = nowIso();
        const description = cleanText(input.description, 'calendar_description', 20_000) ?? null;
        const location = cleanText(input.location, 'calendar_location', 1024) ?? null;
        const timeZone = cleanText(input.timeZone, 'calendar_time_zone', 128) ?? null;
        const fullDay = Boolean(input.fullDay);
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare(`INSERT INTO personal_calendar_event(id,actor_subject,actor_username,title,description,location,starts_at,ends_at,full_day,time_zone,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
            id, actor.subject, actor.username, title, description, location, startsAt, endsAt, fullDay ? 1 : 0, timeZone, timestamp, timestamp,
          );
          audit(actor, 'calendar.event.create', id, { title, startsAt, endsAt, fullDay });
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        json(res, 201, { event: eventView(ownedEvent(actor, id)) });
        return true;
      }

      if (itemMatch && req.method === 'PATCH') {
        const id = decodeURIComponent(itemMatch[1]);
        const current = ownedEvent(actor, id);
        const input = await readJson(req);
        const title = input.title === undefined ? current.title : cleanText(input.title, 'calendar_title', 512, true);
        const startsAt = input.startsAt === undefined ? current.starts_at : iso(input.startsAt, 'calendar_starts_at');
        const endsAt = input.endsAt === undefined ? current.ends_at : iso(input.endsAt, 'calendar_ends_at');
        if (Date.parse(endsAt) <= Date.parse(startsAt)) throw httpError('calendar_end_must_follow_start', 400);
        const description = input.description === undefined ? current.description : (cleanText(input.description, 'calendar_description', 20_000) ?? null);
        const location = input.location === undefined ? current.location : (cleanText(input.location, 'calendar_location', 1024) ?? null);
        const timeZone = input.timeZone === undefined ? current.time_zone : (cleanText(input.timeZone, 'calendar_time_zone', 128) ?? null);
        const fullDay = input.fullDay === undefined ? Boolean(current.full_day) : Boolean(input.fullDay);
        const updatedAt = nowIso();
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare('UPDATE personal_calendar_event SET title=?,description=?,location=?,starts_at=?,ends_at=?,full_day=?,time_zone=?,updated_at=? WHERE id=? AND actor_subject=?').run(
            title, description, location, startsAt, endsAt, fullDay ? 1 : 0, timeZone, updatedAt, id, actor.subject,
          );
          audit(actor, 'calendar.event.update', id, { title, startsAt, endsAt, fullDay });
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        json(res, 200, { event: eventView(ownedEvent(actor, id)) });
        return true;
      }

      if (itemMatch && req.method === 'DELETE') {
        const id = decodeURIComponent(itemMatch[1]);
        ownedEvent(actor, id);
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare('DELETE FROM personal_calendar_event WHERE id=? AND actor_subject=?').run(id, actor.subject);
          audit(actor, 'calendar.event.delete', id);
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        json(res, 200, { removed: id });
        return true;
      }

      json(res, 405, { error: 'method_not_allowed' });
      return true;
    } catch (error) {
      const busy = String(error?.code ?? '').startsWith('SQLITE_BUSY') || String(error?.message ?? '').includes('database is locked');
      json(res, busy ? 503 : (error.httpStatus ?? 500), { error: busy ? 'calendar_busy' : (error.message ?? 'calendar_failed') });
      return true;
    }
  };
}
