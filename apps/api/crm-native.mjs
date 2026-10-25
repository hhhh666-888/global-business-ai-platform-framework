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
const MAX_FILE_BYTES = Number(process.env.CRM_NATIVE_MAX_FILE_BYTES ?? 300 * 1024 * 1024);
const TARGET_TYPES = new Set(['Account', 'Contact', 'Opportunity']);
const VIEW_PAGES = new Set(['companies', 'people', 'opportunities', 'tasks', 'notes', 'files']);

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS crm_file (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content BLOB NOT NULL,
  target_business_type TEXT,
  target_business_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_crm_file_target
ON crm_file(target_business_type, target_business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_saved_view (
  id TEXT PRIMARY KEY,
  owner_subject TEXT NOT NULL,
  name TEXT NOT NULL,
  page_key TEXT NOT NULL,
  query_json TEXT NOT NULL,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_subject, name, page_key)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_crm_saved_view_owner
ON crm_saved_view(owner_subject, updated_at DESC);
`);

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

ensureColumn('crm_file', 'deleted_at', 'TEXT');
ensureColumn('crm_file', 'deleted_by', 'TEXT');
db.exec('CREATE INDEX IF NOT EXISTS idx_crm_file_deleted ON crm_file(deleted_at, created_at DESC)');

function nowIso() {
  return new Date().toISOString();
}

function responseHeaders(extra = {}) {
  return {
    'cache-control': 'no-store',
    'access-control-allow-origin': CORS_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type, x-gbap-organization, x-gbap-workspace',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    ...extra,
  };
}

function json(res, status, body) {
  res.writeHead(status, responseHeaders({ 'content-type': 'application/json; charset=utf-8' }));
  res.end(JSON.stringify(body));
}

async function readJson(req, maxBytes = Math.max(128 * 1024, Math.ceil(MAX_FILE_BYTES * 1.5))) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw httpError('request_body_too_large', 413);
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw httpError('invalid_json', 400);
  }
}

function validateString(value, label, max = 512) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw httpError(`invalid_${label}`, 400);
  return value.trim();
}

function optionalString(value, label, max = 512) {
  return value === undefined || value === null || value === '' ? null : validateString(value, label, max);
}

function httpError(message, status = 400) {
  const error = new Error(message);
  error.httpStatus = status;
  return error;
}

function decodeSegment(segment) {
  const pad = segment.length % 4 === 0 ? '' : '='.repeat(4 - (segment.length % 4));
  return Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

async function getJwk(kid) { return getCachedJwk(kid, OIDC_JWKS_URL_INTERNAL); }

async function authenticate(req) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) throw httpError('missing_bearer_token', 401);
  const token = header.slice(7);
  const parts = token.split('.');
  if (parts.length !== 3) throw httpError('invalid_jwt', 401);
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const headerJson = JSON.parse(decodeSegment(encodedHeader).toString('utf8'));
  const claims = JSON.parse(decodeSegment(encodedPayload).toString('utf8'));
  if (headerJson.alg !== 'RS256' || typeof headerJson.kid !== 'string') throw httpError('unsupported_jwt', 401);
  const jwk = await getJwk(headerJson.kid);
  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const valid = verifySignature('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), publicKey, decodeSegment(encodedSignature));
  if (!valid) throw httpError('invalid_signature', 401);
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

function requireAdmin(actor) {
  if (!actor.roles.has('substrate-admin')) throw httpError('forbidden', 403);
}

function recordAudit(actor, action, target, payload = {}) {
  try {
    db.prepare(`
      INSERT INTO audit_event(id, actor_subject, actor_username, action, target, occurred_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), actor.subject, actor.username, action, target, nowIso(), JSON.stringify(payload));
  } catch (error) {
    if (!String(error?.message ?? '').includes('no such table')) throw error;
  }
}

function validateTarget(input) {
  if (input === undefined || input === null) return { businessType: null, businessId: null };
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError('invalid_file_target', 400);
  const businessType = validateString(input.businessType, 'file_target_type', 64);
  const businessId = validateString(input.businessId, 'file_target_id', 255);
  if (!TARGET_TYPES.has(businessType)) throw httpError('invalid_file_target_type', 400);
  const exists = db.prepare('SELECT 1 FROM external_mapping WHERE business_type=? AND business_id=? LIMIT 1').get(businessType, businessId);
  if (!exists) throw httpError('file_target_not_found', 409);
  return { businessType, businessId };
}

function fileView(row) {
  return {
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    target: row.target_business_type && row.target_business_id ? { businessType: row.target_business_type, businessId: row.target_business_id } : null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    deletedAt: row.deleted_at ?? null,
    deletedBy: row.deleted_by ?? null,
  };
}

function savedView(row) {
  let query = {};
  try { query = JSON.parse(row.query_json); } catch {}
  return {
    id: row.id,
    name: row.name,
    pageKey: row.page_key,
    query,
    favorite: Boolean(row.is_favorite),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const FILE_SELECT = 'id,file_name,mime_type,size_bytes,target_business_type,target_business_id,created_by,created_at,deleted_at,deleted_by';

async function handleFiles(req, res, url, actor) {
  if (req.method === 'GET' && url.pathname === '/api/crm-native/files') {
    const businessType = url.searchParams.get('businessType');
    const businessId = url.searchParams.get('businessId');
    let rows;
    if (businessType !== null || businessId !== null) {
      if (!TARGET_TYPES.has(businessType)) throw httpError('invalid_file_target_type', 400);
      const id = validateString(businessId, 'file_target_id', 255);
      rows = db.prepare(`SELECT ${FILE_SELECT} FROM crm_file WHERE deleted_at IS NULL AND target_business_type=? AND target_business_id=? ORDER BY created_at DESC LIMIT 500`).all(businessType, id);
    } else {
      rows = db.prepare(`SELECT ${FILE_SELECT} FROM crm_file WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 500`).all();
    }
    json(res, 200, { files: rows.map(fileView), maxFileBytes: MAX_FILE_BYTES });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/crm-native/files/recycle') {
    const rows = actor.roles.has('substrate-admin')
      ? db.prepare(`SELECT ${FILE_SELECT} FROM crm_file WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 500`).all()
      : db.prepare(`SELECT ${FILE_SELECT} FROM crm_file WHERE deleted_at IS NOT NULL AND created_by=? ORDER BY deleted_at DESC LIMIT 500`).all(actor.subject);
    json(res, 200, { files: rows.map(fileView) });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/crm-native/files') {
    const input = await readJson(req);
    const fileName = validateString(input.fileName, 'file_name', 255).replace(/[\r\n]/g, ' ');
    const mimeType = optionalString(input.mimeType, 'mime_type', 128) ?? 'application/octet-stream';
    const target = validateTarget(input.target);
    if (typeof input.contentBase64 !== 'string' || !input.contentBase64) throw httpError('file_content_required', 400);
    let content;
    try { content = Buffer.from(input.contentBase64, 'base64'); } catch { throw httpError('invalid_file_content', 400); }
    if (content.length === 0 || content.length > MAX_FILE_BYTES) throw httpError('file_size_out_of_range', 413);
    if (Number.isInteger(input.sizeBytes) && input.sizeBytes !== content.length) throw httpError('file_size_mismatch', 400);
    const id = randomUUID();
    const createdAt = nowIso();
    db.prepare(`INSERT INTO crm_file(id,file_name,mime_type,size_bytes,content,target_business_type,target_business_id,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)`).run(
      id, fileName, mimeType, content.length, content, target.businessType, target.businessId, actor.subject, createdAt,
    );
    recordAudit(actor, 'crm.file.create', `crm-file:${id}`, { fileName, mimeType, sizeBytes: content.length, target });
    json(res, 201, { file: fileView({ id, file_name: fileName, mime_type: mimeType, size_bytes: content.length, target_business_type: target.businessType, target_business_id: target.businessId, created_by: actor.subject, created_at: createdAt, deleted_at: null, deleted_by: null }) });
    return true;
  }

  const restoreMatch = url.pathname.match(/^\/api\/crm-native\/files\/([^/]+)\/restore$/);
  if (req.method === 'POST' && restoreMatch) {
    const id = decodeURIComponent(restoreMatch[1]);
    const row = db.prepare(`SELECT ${FILE_SELECT} FROM crm_file WHERE id=? AND deleted_at IS NOT NULL`).get(id);
    if (!row) throw httpError('file_not_found', 404);
    if (row.created_by !== actor.subject && !actor.roles.has('substrate-admin')) throw httpError('forbidden', 403);
    db.prepare('UPDATE crm_file SET deleted_at=NULL, deleted_by=NULL WHERE id=?').run(id);
    recordAudit(actor, 'crm.file.restore', `crm-file:${id}`, { fileName: row.file_name, sizeBytes: row.size_bytes });
    json(res, 200, { file: fileView({ ...row, deleted_at: null, deleted_by: null }) });
    return true;
  }

  const destroyMatch = url.pathname.match(/^\/api\/crm-native\/files\/([^/]+)\/destroy$/);
  if (req.method === 'POST' && destroyMatch) {
    requireAdmin(actor);
    const id = decodeURIComponent(destroyMatch[1]);
    const row = db.prepare(`SELECT ${FILE_SELECT} FROM crm_file WHERE id=? AND deleted_at IS NOT NULL`).get(id);
    if (!row) throw httpError('file_not_found', 404);
    db.prepare('DELETE FROM crm_file WHERE id=?').run(id);
    recordAudit(actor, 'crm.file.destroy', `crm-file:${id}`, { fileName: row.file_name, sizeBytes: row.size_bytes });
    json(res, 200, { destroyed: id });
    return true;
  }

  const contentMatch = url.pathname.match(/^\/api\/crm-native\/files\/([^/]+)\/content$/);
  if (req.method === 'GET' && contentMatch) {
    const id = decodeURIComponent(contentMatch[1]);
    const row = db.prepare('SELECT file_name,mime_type,size_bytes,content FROM crm_file WHERE id=? AND deleted_at IS NULL').get(id);
    if (!row) throw httpError('file_not_found', 404);
    // HTTP headers need an ASCII fallback and RFC 5987 for Unicode filenames.
    const safeName = String(row.file_name).replace(/[^\x20-\x7e]|["\\]/g, '_');
    const encodedName = encodeURIComponent(row.file_name).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    res.writeHead(200, responseHeaders({
      'content-type': row.mime_type,
      'content-length': String(row.size_bytes),
      'content-disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`,
    }));
    res.end(row.content);
    recordAudit(actor, 'crm.file.download', `crm-file:${id}`, { sizeBytes: row.size_bytes });
    return true;
  }

  const deleteMatch = url.pathname.match(/^\/api\/crm-native\/files\/([^/]+)$/);
  if (req.method === 'DELETE' && deleteMatch) {
    const id = decodeURIComponent(deleteMatch[1]);
    const row = db.prepare(`SELECT ${FILE_SELECT} FROM crm_file WHERE id=? AND deleted_at IS NULL`).get(id);
    if (!row) throw httpError('file_not_found', 404);
    if (row.created_by !== actor.subject && !actor.roles.has('substrate-admin')) throw httpError('forbidden', 403);
    const deletedAt = nowIso();
    db.prepare('UPDATE crm_file SET deleted_at=?, deleted_by=? WHERE id=?').run(deletedAt, actor.subject, id);
    recordAudit(actor, 'crm.file.soft_delete', `crm-file:${id}`, { fileName: row.file_name, sizeBytes: row.size_bytes });
    json(res, 200, { removed: id, softDeleted: true });
    return true;
  }

  return false;
}

async function handleViews(req, res, url, actor) {
  if (req.method === 'GET' && url.pathname === '/api/crm-native/views') {
    const rows = db.prepare('SELECT * FROM crm_saved_view WHERE owner_subject=? ORDER BY is_favorite DESC, updated_at DESC').all(actor.subject);
    json(res, 200, { views: rows.map(savedView), maxFileBytes: MAX_FILE_BYTES });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/crm-native/views') {
    const input = await readJson(req, 128 * 1024);
    const name = validateString(input.name, 'saved_view_name', 120);
    const pageKey = validateString(input.pageKey, 'saved_view_page', 64);
    if (!VIEW_PAGES.has(pageKey)) throw httpError('invalid_saved_view_page', 400);
    const query = input.query && typeof input.query === 'object' && !Array.isArray(input.query) ? input.query : {};
    const queryJson = JSON.stringify(query);
    if (queryJson.length > 16_000) throw httpError('saved_view_query_too_large', 400);
    const favorite = input.favorite === true;
    const id = randomUUID();
    const timestamp = nowIso();
    try {
      db.prepare(`INSERT INTO crm_saved_view(id,owner_subject,name,page_key,query_json,is_favorite,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`).run(
        id, actor.subject, name, pageKey, queryJson, favorite ? 1 : 0, timestamp, timestamp,
      );
    } catch (error) {
      if (String(error?.message ?? '').includes('UNIQUE')) throw httpError('saved_view_name_conflict', 409);
      throw error;
    }
    recordAudit(actor, 'crm.saved_view.create', `saved-view:${id}`, { name, pageKey, favorite });
    json(res, 201, { view: { id, name, pageKey, query, favorite, createdAt: timestamp, updatedAt: timestamp } });
    return true;
  }

  const match = url.pathname.match(/^\/api\/crm-native\/views\/([^/]+)$/);
  if (match && (req.method === 'PATCH' || req.method === 'DELETE')) {
    const id = decodeURIComponent(match[1]);
    const existing = db.prepare('SELECT * FROM crm_saved_view WHERE id=? AND owner_subject=?').get(id, actor.subject);
    if (!existing) throw httpError('saved_view_not_found', 404);

    if (req.method === 'DELETE') {
      db.prepare('DELETE FROM crm_saved_view WHERE id=? AND owner_subject=?').run(id, actor.subject);
      recordAudit(actor, 'crm.saved_view.delete', `saved-view:${id}`, { name: existing.name, pageKey: existing.page_key });
      json(res, 200, { removed: id });
      return true;
    }

    const input = await readJson(req, 128 * 1024);
    const name = input.name === undefined ? existing.name : validateString(input.name, 'saved_view_name', 120);
    const query = input.query === undefined ? JSON.parse(existing.query_json) : (input.query && typeof input.query === 'object' && !Array.isArray(input.query) ? input.query : {});
    const queryJson = JSON.stringify(query);
    if (queryJson.length > 16_000) throw httpError('saved_view_query_too_large', 400);
    const favorite = input.favorite === undefined ? Boolean(existing.is_favorite) : input.favorite === true;
    const timestamp = nowIso();
    try {
      db.prepare('UPDATE crm_saved_view SET name=?,query_json=?,is_favorite=?,updated_at=? WHERE id=? AND owner_subject=?').run(name, queryJson, favorite ? 1 : 0, timestamp, id, actor.subject);
    } catch (error) {
      if (String(error?.message ?? '').includes('UNIQUE')) throw httpError('saved_view_name_conflict', 409);
      throw error;
    }
    recordAudit(actor, 'crm.saved_view.update', `saved-view:${id}`, { name, pageKey: existing.page_key, favorite });
    json(res, 200, { view: { id, name, pageKey: existing.page_key, query, favorite, createdAt: existing.created_at, updatedAt: timestamp } });
    return true;
  }

  return false;
}

export function createCrmNativeHandler() {
  return async function crmNativeHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (!url.pathname.startsWith('/api/crm-native/')) return false;
    if (req.method === 'OPTIONS') {
      json(res, 204, {});
      return true;
    }
    try {
      const actor = await authenticate(req);
      requireUser(actor);
      if (await handleFiles(req, res, url, actor)) return true;
      if (await handleViews(req, res, url, actor)) return true;
      json(res, 404, { error: 'not_found' });
      return true;
    } catch (error) {
      // writeHead can set file headers before failing. A file length on a short
      // JSON error response would leave the browser waiting for missing bytes.
      if (res.headersSent) { res.destroy(); return true; }
      res.removeHeader('content-length');
      res.removeHeader('content-disposition');
      json(res, error.httpStatus ?? 500, { error: error.httpStatus ? error.message : 'internal_error' });
      return true;
    }
  };
}
