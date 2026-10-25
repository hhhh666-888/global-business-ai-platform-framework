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
const STANDARD_OBJECTS = new Map([
  ['company', { businessType: 'Account', externalType: 'company' }],
  ['person', { businessType: 'Contact', externalType: 'person' }],
  ['opportunity', { businessType: 'Opportunity', externalType: 'opportunity' }],
]);

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 5000;');

function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': CORS_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type, x-gbap-organization, x-gbap-workspace',
    'access-control-allow-methods': 'GET,OPTIONS',
  });
  res.end(JSON.stringify(body));
}
function httpError(message, status = 400, detail = null) {
  const error = new Error(message);
  error.httpStatus = status;
  error.detail = detail;
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
  const parts = header.slice(7).split('.');
  if (parts.length !== 3) throw httpError('invalid_jwt', 401);
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const headerJson = JSON.parse(decodeSegment(encodedHeader).toString('utf8'));
  const claims = JSON.parse(decodeSegment(encodedPayload).toString('utf8'));
  if (headerJson.alg !== 'RS256' || typeof headerJson.kid !== 'string') throw httpError('unsupported_jwt', 401);
  const publicKey = createPublicKey({ key: await getJwk(headerJson.kid), format: 'jwk' });
  if (!verifySignature('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), publicKey, decodeSegment(encodedSignature))) {
    throw httpError('invalid_signature', 401);
  }
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
  if (![...actor.roles].some((role) => ['substrate-user', 'substrate-manager', 'substrate-admin'].includes(role))) {
    throw httpError('forbidden', 403);
  }
}
function parseScope(req) {
  return {
    environment: SUBSTRATE_ENV,
    organization: req.headers['x-gbap-organization']?.toString() ?? null,
    workspace: req.headers['x-gbap-workspace']?.toString() ?? null,
  };
}
function resolveProvider(capability, scope) {
  const query = `SELECT p.*,b.capability,b.priority FROM capability_binding b JOIN provider_registration p ON p.id=b.provider_id
    WHERE b.capability=? AND b.enabled=1 AND p.enabled=1 AND p.environment_scope=?
      AND (p.organization_scope IS NULL OR p.organization_scope=?) AND (p.workspace_scope IS NULL OR p.workspace_scope=?)
    ORDER BY CASE WHEN p.workspace_scope IS NULL THEN 0 ELSE 1 END DESC,
      CASE WHEN p.organization_scope IS NULL THEN 0 ELSE 1 END DESC,b.priority DESC,p.id ASC LIMIT 1`;
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
      },
    }),
    signal: AbortSignal.timeout(Math.max(provider.timeout_ms ?? 3000, 20_000)),
  });
  const body = await response.json().catch(() => ({ error: 'invalid_provider_json' }));
  if (!response.ok) {
    throw httpError(
      body.error ?? 'provider_unavailable',
      response.status === 403 ? 403 : response.status >= 400 && response.status < 500 ? 400 : 503,
      { upstreamStatus: response.status },
    );
  }
  return body;
}
function recordAudit(actor, action, target, payload = {}) {
  if (!tableExists('audit_event')) return;
  db.prepare('INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)').run(
    randomUUID(),
    actor.subject,
    actor.username,
    action,
    target,
    new Date().toISOString(),
    JSON.stringify(payload),
  );
}
function mappingFor(providerId, businessType, businessId) {
  return db.prepare('SELECT * FROM external_mapping WHERE provider_id=? AND business_type=? AND business_id=? ORDER BY created_at DESC LIMIT 1')
    .get(providerId, businessType, businessId) ?? null;
}
function containsTarget(record, mapping) {
  return (record?.targets ?? []).some((item) =>
    item.externalId === mapping.external_id && item.externalType === mapping.external_type
  );
}
function adoptOperational(provider, record, businessType) {
  if (!record?.externalId || !record?.externalType) return { ...record, businessId: null };
  let row = db.prepare('SELECT * FROM external_mapping WHERE provider_id=? AND external_type=? AND external_id=? LIMIT 1')
    .get(provider.id, record.externalType, record.externalId);
  if (!row) {
    const id = randomUUID();
    const businessId = randomUUID();
    db.prepare('INSERT INTO external_mapping(id,business_type,business_id,provider_id,external_type,external_id,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(id, businessType, businessId, provider.id, record.externalType, record.externalId, new Date().toISOString());
    row = { business_id: businessId };
  }
  const { externalId, externalType, targets, ...rest } = record;
  return { ...rest, businessId: row.business_id };
}

export function createCrmRuntimeCommunicationHandler() {
  return async function crmRuntimeCommunicationHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const match = url.pathname.match(/^\/api\/crm-runtime\/objects\/([^/]+)\/records\/([^/]+)\/context$/);
    if (!match || req.method !== 'GET') return false;

    const objectKey = decodeURIComponent(match[1]);
    const identity = STANDARD_OBJECTS.get(objectKey);
    if (!identity) return false;

    let actor;
    try {
      actor = await authenticate(req);
      requireUser(actor);
    } catch (error) {
      json(res, error.httpStatus ?? 401, { error: 'unauthorized', detail: error.message });
      return true;
    }

    const scope = parseScope(req);
    const provider = resolveProvider(FALLBACK_CAPABILITY, scope);
    if (!provider) {
      json(res, 503, { error: 'crm_runtime_unavailable' });
      return true;
    }

    const businessId = decodeURIComponent(match[2]);
    try {
      const target = mappingFor(provider.id, identity.businessType, businessId);
      if (!target || target.external_type !== identity.externalType) throw httpError('runtime_record_not_found', 404);

      const [tasksBody, notesBody] = await Promise.all([
        invokeProvider(provider, 'crm.ops.v1.task.list', actor, scope, { limit: 500 }).catch(() => ({ records: [] })),
        invokeProvider(provider, 'crm.ops.v1.note.list', actor, scope, { limit: 500 }).catch(() => ({ records: [] })),
      ]);
      const files = tableExists('crm_file')
        ? db.prepare('SELECT id,file_name AS fileName,mime_type AS mimeType,size_bytes AS sizeBytes,created_by AS createdBy,created_at AS createdAt FROM crm_file WHERE target_business_type=? AND target_business_id=? ORDER BY created_at DESC LIMIT 100')
          .all(identity.businessType, businessId)
        : [];

      json(res, 200, {
        businessId,
        tasks: (tasksBody.records ?? []).filter((record) => containsTarget(record, target)).map((record) => adoptOperational(provider, record, 'CrmTask')),
        notes: (notesBody.records ?? []).filter((record) => containsTarget(record, target)).map((record) => adoptOperational(provider, record, 'CrmNote')),
        files,
      });
      return true;
    } catch (error) {
      recordAudit(actor, 'crm.runtime.context.rejected', `${identity.businessType}:${businessId}`, { error: error.message });
      json(res, error.httpStatus ?? 500, (error.httpStatus ?? 500) >= 500 ? { error: 'crm_service_unavailable' } : { error: error.message, detail: error.detail ?? null });
      return true;
    }
  };
}
