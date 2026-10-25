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

const ROLE_KEYS = ['LEGAL_REP', 'BUSINESS_DECISION', 'PLANT_OPERATIONS', 'ENERGY_MAINTENANCE', 'PROCUREMENT', 'RECOMMENDED'];
const ROLE_STATUSES = ['OPEN', 'RESOLVED', 'DISMISSED'];
const MUTABLE_FIELDS = new Set(['roleTitleText', 'candidateName', 'candidateContactText', 'verificationNote', 'recommendedSearchText', 'source', 'status', 'resolvedContactBusinessId']);

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
db.exec(`
CREATE TABLE IF NOT EXISTS crm_target_role (
  business_id TEXT PRIMARY KEY,
  account_business_id TEXT NOT NULL,
  role_key TEXT NOT NULL,
  state_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(account_business_id, role_key)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_crm_target_role_account ON crm_target_role(account_business_id, updated_at DESC);
`);

function nowIso() { return new Date().toISOString(); }
function responseHeaders(extra = {}) {
  return {
    'cache-control': 'no-store',
    'access-control-allow-origin': CORS_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type, x-gbap-organization, x-gbap-workspace',
    'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
    ...extra,
  };
}
function json(res, status, body) {
  res.writeHead(status, responseHeaders({ 'content-type': 'application/json; charset=utf-8' }));
  res.end(status === 204 ? '' : JSON.stringify(body));
}
function httpError(message, status = 400, detail = null) { const error = new Error(message); error.httpStatus = status; error.detail = detail; return error; }
async function readJson(req, maxBytes = 256 * 1024) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > maxBytes) throw httpError('request_body_too_large', 413); chunks.push(chunk); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw httpError('invalid_json', 400); }
}
function decodeSegment(segment) { const pad = segment.length % 4 === 0 ? '' : '='.repeat(4 - (segment.length % 4)); return Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64'); }
async function getJwk(kid) { return getCachedJwk(kid, OIDC_JWKS_URL_INTERNAL); }
async function authenticate(req) {
  const header = req.headers.authorization ?? ''; if (!header.startsWith('Bearer ')) throw httpError('missing_bearer_token', 401);
  const parts = header.slice(7).split('.'); if (parts.length !== 3) throw httpError('invalid_jwt', 401);
  const [encodedHeader, encodedPayload, encodedSignature] = parts; let headerJson; let claims;
  try { headerJson = JSON.parse(decodeSegment(encodedHeader).toString('utf8')); claims = JSON.parse(decodeSegment(encodedPayload).toString('utf8')); } catch { throw httpError('invalid_jwt', 401); }
  if (headerJson.alg !== 'RS256' || typeof headerJson.kid !== 'string') throw httpError('unsupported_jwt', 401);
  const publicKey = createPublicKey({ key: await getJwk(headerJson.kid), format: 'jwk' });
  if (!verifySignature('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), publicKey, decodeSegment(encodedSignature))) throw httpError('invalid_signature', 401);
  const now = Math.floor(Date.now() / 1000); if (typeof claims.exp !== 'number' || claims.exp <= now) throw httpError('token_expired', 401);
  if (claims.nbf && claims.nbf > now + 30) throw httpError('token_not_yet_valid', 401);
  if (!OIDC_ALLOWED_ISSUERS.has(claims.iss)) throw httpError('invalid_issuer', 401);
  if (claims.azp && claims.azp !== OIDC_CLIENT_ID) throw httpError('invalid_authorized_party', 401);
  return { subject: claims.sub, username: claims.preferred_username ?? null, roles: new Set(Array.isArray(claims.realm_access?.roles) ? claims.realm_access.roles : []) };
}
function requireUser(actor) { if (!actor.roles.has('substrate-user') && !actor.roles.has('substrate-admin')) throw httpError('forbidden', 403); }
function tableExists(name) { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
function mappingExists(businessType, businessId) { return tableExists('external_mapping') && Boolean(db.prepare('SELECT 1 FROM external_mapping WHERE business_type=? AND business_id=? LIMIT 1').get(businessType, businessId)); }
function requiredText(value, label, max = 512) { if (typeof value !== 'string' || !value.trim() || value.length > max) throw httpError(`invalid_${label}`, 400); return value.trim(); }
function optionalText(value, label, max = 20_000) { if (value === undefined) return undefined; if (value === null || value === '') return null; if (typeof value !== 'string' || value.length > max) throw httpError(`invalid_${label}`, 400); return value.trim(); }
function enumValue(value, label, allowed, { required = false } = {}) {
  if ((value === undefined || value === null || value === '') && !required) return undefined;
  if (typeof value !== 'string') throw httpError(`invalid_${label}`, 400);
  const normalized = value.trim().toUpperCase(); if (!allowed.includes(normalized)) throw httpError(`invalid_${label}`, 400); return normalized;
}
function validatePatch(input, { create = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError('invalid_target_role_payload', 400);
  for (const key of Object.keys(input)) if (!['accountBusinessId', 'roleKey', ...MUTABLE_FIELDS].includes(key)) throw httpError(`unsupported_target_role_field:${key}`, 400);
  const patch = {};
  for (const key of ['roleTitleText', 'candidateName', 'candidateContactText', 'verificationNote', 'recommendedSearchText', 'source']) patch[key] = optionalText(input[key], key);
  patch.status = enumValue(input.status, 'target_role_status', ROLE_STATUSES) ?? (create ? 'OPEN' : undefined);
  if (input.resolvedContactBusinessId !== undefined) {
    const value = input.resolvedContactBusinessId;
    if (value === null || value === '') patch.resolvedContactBusinessId = null;
    else {
      patch.resolvedContactBusinessId = requiredText(value, 'resolved_contact_business_id', 255);
      if (!mappingExists('Contact', patch.resolvedContactBusinessId)) throw httpError('target_role_resolved_contact_not_found', 404);
    }
  }
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
}
function parseState(row) { try { return JSON.parse(row.state_json ?? '{}'); } catch { return {}; } }
function project(row) { return { businessId: row.business_id, accountBusinessId: row.account_business_id, roleKey: row.role_key, ...parseState(row), createdAt: row.created_at, updatedAt: row.updated_at }; }
function recordAudit(actor, action, target, payload = {}) {
  if (!tableExists('audit_event')) return;
  db.prepare('INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)').run(randomUUID(), actor.subject, actor.username, action, target, nowIso(), JSON.stringify(payload));
}
function createRole(actor, input) {
  const accountBusinessId = requiredText(input.accountBusinessId, 'account_business_id', 255); if (!mappingExists('Account', accountBusinessId)) throw httpError('customer_company_not_found', 404);
  const roleKey = enumValue(input.roleKey, 'target_role_key', ROLE_KEYS, { required: true }); const state = validatePatch(input, { create: true });
  const businessId = randomUUID(); const timestamp = nowIso();
  try { db.prepare('INSERT INTO crm_target_role(business_id,account_business_id,role_key,state_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(businessId, accountBusinessId, roleKey, JSON.stringify(state), actor.subject, timestamp, timestamp); }
  catch (error) { if (/UNIQUE constraint failed: crm_target_role\.account_business_id, crm_target_role\.role_key/.test(String(error?.message ?? ''))) throw httpError('target_role_already_exists', 409); throw error; }
  recordAudit(actor, 'crm.target_role.create', `TargetRole:${businessId}`, { accountBusinessId, roleKey, fields: Object.keys(state) });
  return project(db.prepare('SELECT * FROM crm_target_role WHERE business_id=?').get(businessId));
}
function updateRole(actor, businessId, input) {
  const row = db.prepare('SELECT * FROM crm_target_role WHERE business_id=?').get(businessId); if (!row) throw httpError('target_role_not_found', 404);
  const patch = validatePatch(input); if (Object.keys(patch).length === 0) return project(row);
  const current = parseState(row); const next = { ...current, ...patch };
  if (patch.resolvedContactBusinessId && patch.status === undefined) next.status = 'RESOLVED';
  db.prepare('UPDATE crm_target_role SET state_json=?,updated_at=? WHERE business_id=?').run(JSON.stringify(next), nowIso(), businessId);
  recordAudit(actor, 'crm.target_role.update', `TargetRole:${businessId}`, { accountBusinessId: row.account_business_id, roleKey: row.role_key, fields: Object.keys(patch) });
  return project(db.prepare('SELECT * FROM crm_target_role WHERE business_id=?').get(businessId));
}

export function createCrmTargetRoleHandler() {
  return async function crmTargetRoleHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const collection = url.pathname === '/api/crm-native/target-roles'; const itemMatch = url.pathname.match(/^\/api\/crm-native\/target-roles\/([^/]+)$/);
    if (!collection && !itemMatch) return false;
    if (req.method === 'OPTIONS') { json(res, 204, {}); return true; }
    try {
      const actor = await authenticate(req); requireUser(actor);
      if (collection && req.method === 'GET') {
        const accountBusinessId = requiredText(url.searchParams.get('accountBusinessId'), 'account_business_id', 255); if (!mappingExists('Account', accountBusinessId)) throw httpError('customer_company_not_found', 404);
        json(res, 200, { targetRoles: db.prepare('SELECT * FROM crm_target_role WHERE account_business_id=? ORDER BY role_key').all(accountBusinessId).map(project) }); return true;
      }
      if (collection && req.method === 'POST') { json(res, 201, { targetRole: createRole(actor, await readJson(req)) }); return true; }
      if (itemMatch && req.method === 'GET') { const row = db.prepare('SELECT * FROM crm_target_role WHERE business_id=?').get(decodeURIComponent(itemMatch[1])); if (!row) throw httpError('target_role_not_found', 404); json(res, 200, { targetRole: project(row) }); return true; }
      if (itemMatch && req.method === 'PATCH') { json(res, 200, { targetRole: updateRole(actor, decodeURIComponent(itemMatch[1]), await readJson(req)) }); return true; }
      json(res, 405, { error: 'method_not_allowed' }); return true;
    } catch (error) { json(res, error.httpStatus ?? 500, { error: error.httpStatus ? error.message : 'internal_error', ...(error.detail ? { detail: error.detail } : {}) }); return true; }
  };
}
