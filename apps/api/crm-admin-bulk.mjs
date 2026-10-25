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
const FALLBACK_CAPABILITY = 'crm.v1.account.list';
const MAX_BULK_RECORDS = 100;

const BUSINESS_TYPES = new Map([
  ['company', 'Account'],
  ['person', 'Contact'],
  ['opportunity', 'Opportunity'],
  ['task', 'CrmTask'],
  ['note', 'CrmNote'],
]);

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': CORS_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type, x-gbap-organization, x-gbap-workspace',
    'access-control-allow-methods': 'POST,OPTIONS',
  });
  res.end(JSON.stringify(body));
  return true;
}
function httpError(message, status = 400, detail = null) { const error = new Error(message); error.httpStatus = status; error.detail = detail; return error; }
async function readJson(req, maxBytes = 1024 * 1024) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > maxBytes) throw httpError('request_body_too_large', 413); chunks.push(chunk); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw httpError('invalid_json', 400); }
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
  return { subject: claims.sub, username: claims.preferred_username ?? null, roles: new Set(Array.isArray(claims.realm_access?.roles) ? claims.realm_access.roles : []) };
}
function requireAdmin(actor) { if (!actor.roles.has('substrate-admin')) throw httpError('forbidden', 403); }
function parseScope(req) { return { environment: SUBSTRATE_ENV, organization: req.headers['x-gbap-organization']?.toString() ?? null, workspace: req.headers['x-gbap-workspace']?.toString() ?? null }; }
function validateKey(value, label) { if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(value)) throw httpError(`invalid_${label}`, 400); return value; }
function tableExists(name) { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
function recordAudit(actor, action, target, payload = {}) {
  if (!tableExists('audit_event')) return;
  db.prepare('INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)').run(randomUUID(), actor.subject, actor.username, action, target, new Date().toISOString(), JSON.stringify(payload));
}
function resolveProvider(capability, scope) {
  const query = `SELECT p.*,b.capability,b.priority FROM capability_binding b JOIN provider_registration p ON p.id=b.provider_id
    WHERE b.capability=? AND b.enabled=1 AND p.enabled=1 AND p.environment_scope=?
      AND (p.organization_scope IS NULL OR p.organization_scope=?) AND (p.workspace_scope IS NULL OR p.workspace_scope=?)
    ORDER BY CASE WHEN p.workspace_scope IS NULL THEN 0 ELSE 1 END DESC, CASE WHEN p.organization_scope IS NULL THEN 0 ELSE 1 END DESC, b.priority DESC,p.id ASC LIMIT 1`;
  return db.prepare(query).get(capability, scope.environment, scope.organization, scope.workspace)
    ?? db.prepare(query).get(FALLBACK_CAPABILITY, scope.environment, scope.organization, scope.workspace);
}
async function invokeProvider(provider, capability, actor, scope, payload = {}) {
  const endpoint = new URL(provider.endpoint);
  const allowlist = JSON.parse(provider.egress_allowlist_json);
  if (!allowlist.includes(endpoint.hostname)) throw httpError('egress_denied', 503);
  const requestId = randomUUID();
  const response = await fetch(new URL('/invoke', endpoint), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-gbap-request-id': requestId },
    body: JSON.stringify({
      capability,
      payload,
      context: {
        requestId,
        actorSubject: actor.subject,
        actorUsername: actor.username,
        environment: scope.environment,
        organization: scope.organization,
        workspace: scope.workspace,
        contractVersion: provider.contract_version ?? null,
      },
    }),
    signal: AbortSignal.timeout(Math.max(provider.timeout_ms ?? 3000, 20_000)),
  });
  const body = await response.json().catch(() => ({ error: 'invalid_provider_json' }));
  if (!response.ok) throw httpError('provider_unavailable', response.status === 403 ? 403 : 503, { providerId: provider.id, upstreamStatus: response.status, upstreamError: body.error ?? null });
  return body;
}
function findMapping(providerId, businessType, businessId) {
  return db.prepare('SELECT * FROM external_mapping WHERE provider_id=? AND business_type=? AND business_id=? ORDER BY created_at DESC LIMIT 1').get(providerId, businessType, businessId) ?? null;
}
function removeMappingAndState(providerId, businessType, businessId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    if (businessType === 'Account' && tableExists('crm_registration_identity')) {
      db.prepare('DELETE FROM crm_registration_identity WHERE business_id=?').run(businessId);
    }
    if (tableExists('crm_business_state')) db.prepare('DELETE FROM crm_business_state WHERE business_type=? AND business_id=?').run(businessType, businessId);
    db.prepare('DELETE FROM external_mapping WHERE provider_id=? AND business_type=? AND business_id=?').run(providerId, businessType, businessId);
    db.exec('COMMIT');
  } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
}

export function createCrmAdminBulkHandler() {
  return async function crmAdminBulkHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname !== '/api/crm-admin/bulk-delete') return false;
    if (req.method === 'OPTIONS') { json(res, 204, {}); return true; }
    if (req.method !== 'POST') { json(res, 405, { error: 'method_not_allowed' }); return true; }

    let actor;
    try { actor = await authenticate(req); requireAdmin(actor); }
    catch (error) { json(res, error.httpStatus ?? 401, { error: error.message ?? 'unauthorized' }); return true; }

    try {
      const input = await readJson(req);
      const objectKey = validateKey(input.objectKey, 'object_key');
      const mode = input.mode === 'destroy' ? 'destroy' : input.mode === 'soft-delete' ? 'soft-delete' : null;
      if (!mode) throw httpError('invalid_bulk_delete_mode', 400);
      const businessIds = [...new Set(Array.isArray(input.businessIds) ? input.businessIds.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()) : [])];
      if (businessIds.length < 1 || businessIds.length > MAX_BULK_RECORDS) throw httpError(`bulk_delete_requires_1_to_${MAX_BULK_RECORDS}_records`, 400);

      const scope = parseScope(req);
      const capability = mode === 'destroy' ? 'crm.meta.v1.record.destroy' : 'crm.meta.v1.record.delete';
      const provider = resolveProvider(capability, scope);
      if (!provider) throw httpError('crm_runtime_unavailable', 503);
      const schemaBody = await invokeProvider(provider, 'crm.meta.v1.schema', actor, scope, {});
      const objects = Array.isArray(schemaBody.objects) ? schemaBody.objects : Array.isArray(schemaBody.schema?.objects) ? schemaBody.schema.objects : [];
      const object = objects.find((candidate) => candidate?.isActive !== false && (candidate.nameSingular === objectKey || candidate.namePlural === objectKey));
      if (!object?.nameSingular || !object?.namePlural) throw httpError('runtime_object_not_found', 404);
      const businessType = BUSINESS_TYPES.get(object.nameSingular) ?? `CrmDynamic:${object.nameSingular}`;

      const succeeded = [];
      const failed = [];
      for (const businessId of businessIds) {
        try {
          const mapping = findMapping(provider.id, businessType, businessId);
          if (!mapping) throw httpError('runtime_record_not_found', 404);
          if (tableExists('crm_file')) {
            const attachments = Number(db.prepare('SELECT COUNT(*) AS count FROM crm_file WHERE target_business_type=? AND target_business_id=?').get(businessType, businessId)?.count ?? 0);
            if (attachments > 0) throw httpError(mode === 'destroy' ? 'runtime_destroy_has_gbap_attachments' : 'runtime_delete_has_gbap_attachments', 409, { attachments });
          }
          await invokeProvider(provider, capability, actor, scope, { objectSingular: object.nameSingular, objectPlural: object.namePlural, externalId: mapping.external_id });
          if (mode === 'destroy') removeMappingAndState(provider.id, businessType, businessId);
          succeeded.push(businessId);
        } catch (error) {
          failed.push({ businessId, error: error.message ?? 'bulk_delete_failed' });
        }
      }
      recordAudit(actor, `crm.admin.bulk_${mode === 'destroy' ? 'destroy' : 'soft_delete'}`, `${object.nameSingular}:bulk`, { requested: businessIds.length, succeeded: succeeded.length, failed: failed.length, businessIds: succeeded });
      json(res, failed.length > 0 && succeeded.length === 0 ? 409 : 200, { objectKey: object.nameSingular, mode, total: businessIds.length, succeeded, failed });
      return true;
    } catch (error) {
      recordAudit(actor, 'crm.admin.bulk_delete.rejected', 'crm-admin:bulk-delete', { error: error.message });
      json(res, error.httpStatus ?? 500, { error: error.message ?? 'internal_error', detail: error.detail ?? null });
      return true;
    }
  };
}
