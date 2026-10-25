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
const SUBSTRATE_ENV = process.env.SUBSTRATE_ENV ?? 'local';

const OPERATIONS = new Map([
  ['crm.ops.v1.account.update', { businessType: 'Account', fallbackCapability: 'crm.v1.account.list', mode: 'update' }],
  ['crm.ops.v1.account.delete', { businessType: 'Account', fallbackCapability: 'crm.v1.account.list', mode: 'delete' }],
  ['crm.ops.v1.contact.delete', { businessType: 'Contact', fallbackCapability: 'crm.v1.contact.list', mode: 'delete' }],
  ['crm.ops.v1.opportunity.delete', { businessType: 'Opportunity', fallbackCapability: 'crm.v1.opportunity.list', mode: 'delete' }],
  ['crm.ops.v1.task.delete', { businessType: 'CrmTask', fallbackCapability: 'crm.ops.v1.task.list', mode: 'delete' }],
  ['crm.ops.v1.note.delete', { businessType: 'CrmNote', fallbackCapability: 'crm.ops.v1.note.list', mode: 'delete' }],
]);

const ACCOUNT_SEMANTIC_FIELDS = new Set([
  'primaryEmail', 'primaryPhone', 'customerType', 'relationshipStatus', 'industry',
  'employeeCount', 'source', 'priority', 'notes',
]);
const ACCOUNT_NATIVE_FIELDS = new Set([
  'displayName', 'website', 'linkedinUrl', 'addressStreet1', 'addressStreet2',
  'addressCity', 'addressState', 'addressPostcode', 'addressCountry',
  'annualRevenue', 'annualRevenueCurrency',
]);
const CUSTOMER_TYPES = ['DISTRIBUTOR', 'EPC', 'FACTORY', 'END_USER', 'DEVELOPER', 'UTILITY', 'GOVERNMENT', 'OTHER'];
const RELATIONSHIP_STATES = ['PROSPECT', 'QUALIFIED', 'CUSTOMER', 'PARTNER', 'INACTIVE'];
const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'];

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 5000;');

function nowIso() { return new Date().toISOString(); }
function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': CORS_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type, x-gbap-organization, x-gbap-workspace',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  });
  res.end(JSON.stringify(body));
}
function httpError(message, status = 400, detail = null) {
  const error = new Error(message);
  error.httpStatus = status;
  error.detail = detail;
  return error;
}
async function readJson(req, maxBytes = 128 * 1024) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw httpError('request_body_too_large', 413);
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
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
  const headerJson = JSON.parse(decodeSegment(encodedHeader).toString('utf8'));
  const claims = JSON.parse(decodeSegment(encodedPayload).toString('utf8'));
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
function validateString(value, label, max = 512) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw httpError(`invalid_${label}`, 400);
  return value.trim();
}
function optionalText(value, label, max = 4000) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) throw httpError(`invalid_${label}`, 400);
  return value.trim();
}
function enumOrNull(value, label, allowed) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const normalized = validateString(value, label, 64).toUpperCase();
  if (!allowed.includes(normalized)) throw httpError(`invalid_${label}`, 400);
  return normalized;
}
function parseScope(req) {
  return {
    environment: SUBSTRATE_ENV,
    organization: req.headers['x-gbap-organization']?.toString() ?? null,
    workspace: req.headers['x-gbap-workspace']?.toString() ?? null,
  };
}
function resolveProvider(capability, fallbackCapability, scope) {
  const query = `
    SELECT p.*, b.capability, b.priority
    FROM capability_binding b
    JOIN provider_registration p ON p.id=b.provider_id
    WHERE b.capability=? AND b.enabled=1 AND p.enabled=1 AND p.environment_scope=?
      AND (p.organization_scope IS NULL OR p.organization_scope=?)
      AND (p.workspace_scope IS NULL OR p.workspace_scope=?)
    ORDER BY CASE WHEN p.workspace_scope IS NULL THEN 0 ELSE 1 END DESC,
      CASE WHEN p.organization_scope IS NULL THEN 0 ELSE 1 END DESC,
      b.priority DESC, p.id ASC LIMIT 1`;
  return db.prepare(query).get(capability, scope.environment, scope.organization, scope.workspace)
    ?? db.prepare(query).get(fallbackCapability, scope.environment, scope.organization, scope.workspace);
}
function findBusinessMapping(providerId, businessType, businessId) {
  return db.prepare(`SELECT * FROM external_mapping WHERE provider_id=? AND business_type=? AND business_id=? ORDER BY created_at DESC LIMIT 1`).get(providerId, businessType, businessId);
}
function readBusinessState(businessType, businessId) {
  const row = db.prepare('SELECT state_json,updated_at FROM crm_business_state WHERE business_type=? AND business_id=?').get(businessType, businessId);
  if (!row?.state_json) return { state: {}, updatedAt: null };
  try { return { state: JSON.parse(row.state_json), updatedAt: row.updated_at ?? null }; }
  catch { return { state: {}, updatedAt: row.updated_at ?? null }; }
}
function upsertBusinessState(businessType, businessId, patch) {
  const current = readBusinessState(businessType, businessId).state;
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) next[key] = value;
  }
  const timestamp = nowIso();
  db.prepare(`INSERT INTO crm_business_state(business_type,business_id,state_json,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(business_type,business_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`).run(businessType, businessId, JSON.stringify(next), timestamp);
  return { state: next, updatedAt: timestamp };
}
function accountStateView(value) {
  const output = {};
  for (const key of ACCOUNT_SEMANTIC_FIELDS) if (Object.prototype.hasOwnProperty.call(value ?? {}, key)) output[key] = value[key];
  return output;
}
function validateAccountPatch(input) {
  const native = {};
  const semantic = {};
  if (input.displayName !== undefined) native.displayName = validateString(input.displayName, 'account_display_name', 512);
  for (const key of ['website', 'linkedinUrl', 'addressStreet1', 'addressStreet2', 'addressCity', 'addressState', 'addressPostcode', 'addressCountry']) {
    if (input[key] !== undefined) native[key] = optionalText(input[key], `account_${key}`, 1024);
  }
  if (input.annualRevenue !== undefined) {
    if (input.annualRevenue !== null && (typeof input.annualRevenue !== 'number' || !Number.isFinite(input.annualRevenue) || input.annualRevenue < 0)) throw httpError('invalid_account_annual_revenue', 400);
    native.annualRevenue = input.annualRevenue;
  }
  if (input.annualRevenueCurrency !== undefined) {
    const currency = optionalText(input.annualRevenueCurrency, 'account_annual_revenue_currency', 3);
    native.annualRevenueCurrency = currency ? currency.toUpperCase() : null;
  }
  semantic.primaryEmail = optionalText(input.primaryEmail, 'account_primary_email', 512);
  semantic.primaryPhone = optionalText(input.primaryPhone, 'account_primary_phone', 128);
  semantic.customerType = enumOrNull(input.customerType, 'account_customer_type', CUSTOMER_TYPES);
  semantic.relationshipStatus = enumOrNull(input.relationshipStatus, 'account_relationship_status', RELATIONSHIP_STATES);
  semantic.industry = optionalText(input.industry, 'account_industry', 256);
  if (input.employeeCount !== undefined) {
    if (input.employeeCount !== null && (!Number.isInteger(input.employeeCount) || input.employeeCount < 0 || input.employeeCount > 10_000_000)) throw httpError('invalid_account_employee_count', 400);
    semantic.employeeCount = input.employeeCount;
  }
  semantic.source = optionalText(input.source, 'account_source', 256);
  semantic.priority = enumOrNull(input.priority, 'account_priority', PRIORITIES);
  semantic.notes = optionalText(input.notes, 'account_notes', 20_000);
  return { native, semantic };
}
async function invokeProvider(provider, capability, actor, scope, payload) {
  const endpoint = new URL(provider.endpoint);
  const allowlist = JSON.parse(provider.egress_allowlist_json);
  if (!allowlist.includes(endpoint.hostname)) throw httpError('egress_denied', 503);
  const requestId = randomUUID();
  const response = await fetch(new URL('/invoke', endpoint), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-gbap-request-id': requestId },
    body: JSON.stringify({ capability, payload, context: { requestId, actorSubject: actor.subject, actorUsername: actor.username, environment: scope.environment, organization: scope.organization, workspace: scope.workspace, contractVersion: provider.contract_version ?? null } }),
    signal: AbortSignal.timeout(Math.max(provider.timeout_ms ?? 3000, 10_000)),
  });
  const body = await response.json().catch(() => ({ error: 'invalid_provider_json' }));
  if (!response.ok) throw httpError('provider_unavailable', 503, { providerId: provider.id, upstreamStatus: response.status, upstreamError: body.error ?? null });
  return { requestId, providerId: provider.id, body };
}
function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
function attachedFileCount(businessType, businessId) {
  if (!tableExists('crm_file')) return 0;
  return Number(db.prepare('SELECT COUNT(*) AS count FROM crm_file WHERE target_business_type=? AND target_business_id=?').get(businessType, businessId)?.count ?? 0);
}
function recordAudit(actor, action, target, payload = {}) {
  if (!tableExists('audit_event')) return;
  db.prepare(`INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)`).run(randomUUID(), actor.subject, actor.username, action, target, nowIso(), JSON.stringify(payload));
}
function removeMappingAndState(providerId, businessType, businessId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM crm_business_state WHERE business_type=? AND business_id=?').run(businessType, businessId);
    db.prepare('DELETE FROM external_mapping WHERE provider_id=? AND business_type=? AND business_id=?').run(providerId, businessType, businessId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

async function handleCompanyProfiles(req, res, url, actor) {
  if (req.method !== 'GET' || url.pathname !== '/api/crm-native/company-profiles') return false;
  const rows = db.prepare("SELECT business_id,state_json,updated_at FROM crm_business_state WHERE business_type='Account' ORDER BY updated_at DESC").all();
  const profiles = rows.map((row) => {
    let state = {};
    try { state = JSON.parse(row.state_json); } catch {}
    return { businessId: row.business_id, ...accountStateView(state), profileUpdatedAt: row.updated_at ?? null };
  });
  json(res, 200, { profiles });
  return true;
}

async function handleOperation(req, res, url, actor) {
  if (req.method !== 'POST') return false;
  const match = url.pathname.match(/^\/api\/capabilities\/([^/]+)\/invoke$/);
  if (!match) return false;
  const capability = decodeURIComponent(match[1]);
  const operation = OPERATIONS.get(capability);
  if (!operation) return false;
  const input = await readJson(req);
  const payload = input.payload ?? input;
  const businessId = validateString(payload.businessId, 'business_id', 255);
  const scope = parseScope(req);
  const provider = resolveProvider(capability, operation.fallbackCapability, scope);
  if (!provider) throw httpError('capability_unavailable', 503, { capability });
  const mapping = findBusinessMapping(provider.id, operation.businessType, businessId);
  if (!mapping) throw httpError(`operational_mapping_missing:${operation.businessType}:${businessId}`, 409);

  if (operation.mode === 'update') {
    const { native, semantic } = validateAccountPatch(payload);
    const invoked = await invokeProvider(provider, capability, actor, scope, { externalId: mapping.external_id, ...native });
    const semanticPatch = Object.fromEntries(Object.entries(semantic).filter(([, value]) => value !== undefined));
    const state = Object.keys(semanticPatch).length > 0 ? upsertBusinessState('Account', businessId, semanticPatch) : readBusinessState('Account', businessId);
    const record = invoked.body?.record;
    if (!record) throw httpError('provider_record_missing', 502);
    recordAudit(actor, 'crm.account.update', `Account:${businessId}`, { providerId: provider.id, fields: [...Object.keys(native), ...Object.keys(semanticPatch)] });
    return json(res, 200, { requestId: invoked.requestId, providerId: provider.id, result: { ...invoked.body, record: { ...record, businessId, businessType: 'Account', ...accountStateView(state.state), profileUpdatedAt: state.updatedAt } } });
  }

  const files = attachedFileCount(operation.businessType, businessId);
  if (files > 0) throw httpError('record_has_attached_files', 409, { files });
  const invoked = await invokeProvider(provider, capability, actor, scope, { externalId: mapping.external_id });
  if (invoked.body?.deleted === false) throw httpError('record_has_related_records', 409, invoked.body.blockers ?? {});
  removeMappingAndState(provider.id, operation.businessType, businessId);
  recordAudit(actor, `crm.${operation.businessType.toLowerCase()}.delete`, `${operation.businessType}:${businessId}`, { providerId: provider.id, externalType: mapping.external_type });
  return json(res, 200, { requestId: invoked.requestId, providerId: provider.id, result: { ...invoked.body, deleted: true, businessId, businessType: operation.businessType } });
}

export function createCrmRecordLifecycleHandler() {
  return async function crmRecordLifecycleHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const isProfileRoute = url.pathname === '/api/crm-native/company-profiles';
    const capabilityMatch = url.pathname.match(/^\/api\/capabilities\/([^/]+)\/invoke$/);
    const isLifecycleCapability = Boolean(capabilityMatch && OPERATIONS.has(decodeURIComponent(capabilityMatch[1])));
    if (!isProfileRoute && !isLifecycleCapability) return false;
    if (req.method === 'OPTIONS') { json(res, 204, {}); return true; }
    try {
      const actor = await authenticate(req);
      requireUser(actor);
      if (await handleCompanyProfiles(req, res, url, actor)) return true;
      if (await handleOperation(req, res, url, actor)) return true;
      json(res, 404, { error: 'not_found' });
      return true;
    } catch (error) {
      json(res, error.httpStatus ?? 500, {
        error: error.httpStatus ? error.message : 'internal_error',
        ...(error.detail ? { detail: error.detail } : {}),
      });
      return true;
    }
  };
}
