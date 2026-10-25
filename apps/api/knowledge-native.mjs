import { getCachedJwk } from './jwks-cache.mjs';
import { createHash, createPublicKey, randomUUID, verify as verifySignature } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { publicIngestionDetail, publicIngestionCause, publicExtractionStatus } from './knowledge-status.mjs';

const DB_PATH = process.env.DB_PATH ?? '/data/substrate.db';
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:8080';
const OIDC_ISSUER = process.env.OIDC_ISSUER ?? 'http://localhost:8082/realms/gbap';
const OIDC_ALLOWED_ISSUERS = new Set((process.env.OIDC_ALLOWED_ISSUERS ?? OIDC_ISSUER).split(',').map((value) => value.trim()).filter(Boolean));
const OIDC_JWKS_URL_INTERNAL = process.env.OIDC_JWKS_URL_INTERNAL ?? 'http://keycloak:8080/realms/gbap/protocol/openid-connect/certs';
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID ?? 'gbap-web';
const SUBSTRATE_ENV = process.env.SUBSTRATE_ENV ?? 'local';
const KNOWLEDGE_CONTRACT = 'gbap.knowledge.v1';
const MAX_DOCUMENT_BYTES = Number(process.env.KNOWLEDGE_MAX_DOCUMENT_BYTES ?? process.env.KNOWLEDGE_POU_MAX_DOCUMENT_BYTES ?? 25 * 1024 * 1024);
const KNOWLEDGE_SOURCE_ROOT = process.env.KNOWLEDGE_SOURCE_ROOT ?? join(dirname(DB_PATH), 'knowledge-source');

mkdirSync(dirname(DB_PATH), { recursive: true });
mkdirSync(KNOWLEDGE_SOURCE_ROOT, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS knowledge_collection (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  classification TEXT NOT NULL,
  visibility TEXT NOT NULL,
  owner_subject TEXT NOT NULL,
  organization_scope TEXT,
  workspace_scope TEXT,
  provider_state TEXT NOT NULL DEFAULT 'PENDING',
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS knowledge_acl (
  collection_id TEXT NOT NULL REFERENCES knowledge_collection(id) ON DELETE CASCADE,
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  permission TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(collection_id, principal_type, principal_id, permission)
) STRICT;

CREATE TABLE IF NOT EXISTS knowledge_document (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES knowledge_collection(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_filename TEXT,
  source_locator TEXT,
  classification TEXT NOT NULL,
  visibility TEXT NOT NULL,
  owner_subject TEXT NOT NULL,
  ingestion_state TEXT NOT NULL,
  cleanup_state TEXT NOT NULL DEFAULT 'NONE',
  current_version_id TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS knowledge_document_version (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES knowledge_document(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content_checksum TEXT NOT NULL,
  source_filename TEXT,
  source_locator TEXT,
  media_type TEXT,
  byte_size INTEGER NOT NULL,
  storage_path TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(document_id, version)
) STRICT;

CREATE TABLE IF NOT EXISTS knowledge_retired_index (
  version_id TEXT NOT NULL REFERENCES knowledge_document_version(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  collection_external_id TEXT NOT NULL,
  document_external_id TEXT NOT NULL,
  cleaned_at TEXT,
  PRIMARY KEY (version_id, provider_id, collection_external_id, document_external_id)
) STRICT;

CREATE TABLE IF NOT EXISTS knowledge_business_link (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES knowledge_document(id) ON DELETE CASCADE,
  business_type TEXT NOT NULL,
  business_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(document_id, business_type, business_id)
) STRICT;

CREATE TABLE IF NOT EXISTS knowledge_ingestion_run (
  id TEXT PRIMARY KEY,
  document_version_id TEXT NOT NULL REFERENCES knowledge_document_version(id) ON DELETE CASCADE,
  provider_id TEXT,
  status TEXT NOT NULL,
  detail TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS idx_knowledge_collection_owner ON knowledge_collection(owner_subject, archived_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_document_collection ON knowledge_document(collection_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_business_link_business ON knowledge_business_link(business_type, business_id);
`);

function ensureColumn(table, name, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((column) => column.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}
ensureColumn('knowledge_document', 'cleanup_state', "TEXT NOT NULL DEFAULT 'NONE'");
ensureColumn('knowledge_document_version', 'storage_path', 'TEXT');
ensureColumn('knowledge_ingestion_run', 'poll_error_count', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('knowledge_ingestion_run', 'last_polled_at', 'TEXT');

const INGESTION_TIMEOUT_MS = Number(process.env.KNOWLEDGE_INGESTION_TIMEOUT_MS ?? 60 * 60 * 1000);
const MAX_POLL_ERRORS = Number(process.env.KNOWLEDGE_MAX_POLL_ERRORS ?? 6);
if (!Number.isSafeInteger(INGESTION_TIMEOUT_MS) || INGESTION_TIMEOUT_MS < 1000) throw new Error('invalid_knowledge_ingestion_timeout');
if (!Number.isSafeInteger(MAX_POLL_ERRORS) || MAX_POLL_ERRORS < 1) throw new Error('invalid_knowledge_max_poll_errors');

function nowIso() { return new Date().toISOString(); }
function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': CORS_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type, x-gbap-organization, x-gbap-workspace',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  });
  res.end(status === 204 ? '' : JSON.stringify(body));
}
function httpError(message, status = 400) { const error = new Error(message); error.httpStatus = status; return error; }
async function readJson(req, maxBytes = MAX_DOCUMENT_BYTES * 1.45 + 128 * 1024) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw httpError('request_body_too_large', 413);
    chunks.push(chunk);
  }
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
  let headerJson; let claims;
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
  return { subject: claims.sub, username: claims.preferred_username ?? null, roles: new Set(Array.isArray(claims.realm_access?.roles) ? claims.realm_access.roles : []) };
}
function requireUser(actor) {
  if (!actor.roles.has('substrate-user') && !actor.roles.has('substrate-admin')) throw httpError('forbidden', 403);
}
function requireKnowledgeManager(actor) {
  if (!actor.roles.has('substrate-manager') && !actor.roles.has('substrate-admin')) throw httpError('forbidden', 403);
}
function validateKnowledgeSecurityPair(classification, visibility) {
  if (['CONFIDENTIAL', 'RESTRICTED'].includes(classification) && visibility === 'INTERNAL') {
    throw httpError('knowledge_sensitive_visibility_requires_restricted', 400);
  }
}
function publicKnowledgeFailure(error) {
  const message = String(error?.message ?? error ?? '');
  if (message.includes('knowledge_provider_unavailable')) return 'knowledge_provider_unavailable';
  if (message.includes('knowledge_collection_provider_mapping_missing')) return 'knowledge_collection_provider_mapping_missing';
  if (message.includes('knowledge_provider_mapping_missing')) return 'knowledge_provider_mapping_missing';
  return 'knowledge_provider_operation_failed';
}
function publicKnowledgeHttpError(error) {
  const status = Number(error?.httpStatus ?? 500);
  const message = String(error?.message ?? '');
  if (!error?.httpStatus) return { status: 500, error: 'knowledge_internal_error' };
  if (status >= 500 && !/^knowledge_/u.test(message)) {
    return { status, error: 'knowledge_provider_operation_failed' };
  }
  return { status, error: message || 'knowledge_request_failed' };
}
function validateString(value, label, max = 512) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw httpError(`invalid_${label}`, 400);
  return value.trim();
}
function optionalString(value, label, max = 2048) {
  return value === undefined || value === null || value === '' ? null : validateString(value, label, max);
}
function validateEnum(value, label, allowed) {
  const text = validateString(value, label, 64);
  if (!allowed.includes(text)) throw httpError(`invalid_${label}`, 400);
  return text;
}
function parseScope(req) {
  return {
    environment: SUBSTRATE_ENV,
    organization: req.headers['x-gbap-organization']?.toString() ?? null,
    workspace: req.headers['x-gbap-workspace']?.toString() ?? null,
  };
}
function tableExists(name) { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
function audit(actor, action, target, payload = {}) {
  if (!tableExists('audit_event')) return;
  db.prepare('INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)').run(
    randomUUID(), actor.subject, actor.username, action, target, nowIso(), JSON.stringify(payload),
  );
}
function resolveProvider(capability, scope) {
  if (!tableExists('provider_registration') || !tableExists('capability_binding')) return null;
  return db.prepare(`
    SELECT p.*, b.capability, b.priority
    FROM capability_binding b JOIN provider_registration p ON p.id=b.provider_id
    WHERE b.capability=? AND b.enabled=1 AND p.enabled=1 AND p.environment_scope=?
      AND (p.organization_scope IS NULL OR p.organization_scope=?)
      AND (p.workspace_scope IS NULL OR p.workspace_scope=?)
    ORDER BY CASE WHEN p.workspace_scope IS NULL THEN 0 ELSE 1 END DESC,
      CASE WHEN p.organization_scope IS NULL THEN 0 ELSE 1 END DESC,
      b.priority DESC, p.id ASC LIMIT 1
  `).get(capability, scope.environment, scope.organization, scope.workspace);
}
function readProviderToken(provider) {
  if (!provider?.secret_ref) return null;
  if (!existsSync(provider.secret_ref)) throw httpError('provider_secret_unavailable', 503);
  const token = readFileSync(provider.secret_ref, 'utf8').trim();
  if (!token) throw httpError('provider_secret_empty', 503);
  return token;
}
async function invokeContractProvider(provider, expectedContract, unavailableError, capability, actor, scope, payload, { includeActorIdentity = true } = {}) {
  if (provider.contract_version !== expectedContract) throw httpError(`${expectedContract.replaceAll('.', '_')}_contract_version_mismatch`, 409);
  const endpoint = new URL(provider.endpoint);
  const allowlist = JSON.parse(provider.egress_allowlist_json);
  if (!Array.isArray(allowlist) || !allowlist.includes(endpoint.hostname)) throw httpError('egress_denied', 503);
  const requestId = randomUUID();
  const token = readProviderToken(provider);
  const headers = { 'content-type': 'application/json', 'x-gbap-request-id': requestId };
  if (token) headers['x-gbap-provider-token'] = token;
  const context = {
    requestId,
    environment: scope.environment,
    organization: scope.organization,
    workspace: scope.workspace,
    contractVersion: expectedContract,
  };
  if (includeActorIdentity) {
    context.actorSubject = actor.subject;
    context.actorUsername = actor.username;
  }
  const body = JSON.stringify({ capability, payload, context });
  let lastError;
  for (let attempt = 0; attempt <= provider.retry_count; attempt += 1) {
    try {
      const response = await fetch(new URL('/invoke', endpoint), { method: 'POST', headers, body, signal: AbortSignal.timeout(provider.timeout_ms) });
      const responseBody = await response.json().catch(() => ({ error: 'invalid_provider_json' }));
      if (!response.ok) throw httpError(responseBody?.error ?? `provider_http_${response.status}`, response.status === 404 ? 404 : (response.status >= 500 ? 503 : 502));
      return { requestId, providerId: provider.id, result: responseBody };
    } catch (error) {
      lastError = error;
      if (attempt >= provider.retry_count) break;
    }
  }
  if (lastError?.httpStatus) throw lastError;
  throw httpError(unavailableError, 503);
}
function invokeProvider(provider, capability, actor, scope, payload) {
  return invokeContractProvider(provider, KNOWLEDGE_CONTRACT, 'knowledge_provider_unavailable', capability, actor, scope, payload);
}
function mappingForBusiness(providerId, businessType, businessId) {
  if (!tableExists('external_mapping')) return null;
  return db.prepare('SELECT * FROM external_mapping WHERE provider_id=? AND business_type=? AND business_id=? ORDER BY created_at DESC LIMIT 1').get(providerId, businessType, businessId);
}
function mappingForExternal(providerId, externalType, externalId) {
  if (!tableExists('external_mapping')) return null;
  return db.prepare('SELECT * FROM external_mapping WHERE provider_id=? AND external_type=? AND external_id=? ORDER BY created_at DESC LIMIT 1').get(providerId, externalType, externalId);
}
function ensureMapping(actor, provider, businessType, businessId, externalType, externalId) {
  if (!tableExists('external_mapping')) throw httpError('provider_mapping_table_unavailable', 503);
  const current = mappingForBusiness(provider.id, businessType, businessId);
  if (current) {
    if (current.external_type !== externalType || current.external_id !== externalId) throw httpError('knowledge_mapping_conflict', 409);
    return current;
  }
  const reverse = mappingForExternal(provider.id, externalType, externalId);
  if (reverse && (reverse.business_type !== businessType || reverse.business_id !== businessId)) throw httpError('knowledge_external_mapping_conflict', 409);
  const id = randomUUID();
  db.prepare('INSERT INTO external_mapping(id,business_type,business_id,provider_id,external_type,external_id,created_at) VALUES(?,?,?,?,?,?,?)').run(id, businessType, businessId, provider.id, externalType, externalId, nowIso());
  audit(actor, 'knowledge.mapping.create', `mapping:${id}`, { providerId: provider.id, businessType, businessId, externalType });
  return { id, business_type: businessType, business_id: businessId, provider_id: provider.id, external_type: externalType, external_id: externalId };
}
function sourcePath(documentId, versionId) {
  return join(KNOWLEDGE_SOURCE_ROOT, documentId, `${versionId}.bin`);
}
function persistSource(documentId, versionId, bytes) {
  const directory = join(KNOWLEDGE_SOURCE_ROOT, documentId);
  mkdirSync(directory, { recursive: true });
  const finalPath = sourcePath(documentId, versionId);
  const temporaryPath = `${finalPath}.tmp-${randomUUID()}`;
  writeFileSync(temporaryPath, bytes, { mode: 0o600 });
  renameSync(temporaryPath, finalPath);
  return finalPath;
}
function removeStoredSource(path) {
  if (!path) return;
  try { unlinkSync(path); } catch {}
}
function currentVersion(document) {
  if (!document?.current_version_id) return null;
  return db.prepare('SELECT * FROM knowledge_document_version WHERE id=? AND document_id=?').get(document.current_version_id, document.id);
}
function verifiedSourceBytes(document, versionId = null) {
  const version = versionId ? db.prepare('SELECT * FROM knowledge_document_version WHERE id=? AND document_id=?').get(versionId, document.id) : currentVersion(document);
  if (versionId && !version) throw httpError('knowledge_version_not_found', 404);
  if (!version?.storage_path || !existsSync(version.storage_path)) throw httpError('knowledge_source_unavailable', 503);
  const bytes = readFileSync(version.storage_path);
  const checksum = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (checksum !== version.content_checksum || bytes.length !== version.byte_size) throw httpError('knowledge_source_integrity_failed', 503);
  return { bytes, version };
}
function replaceMapping(actor, provider, businessType, businessId, externalType, externalId) {
  if (!tableExists('external_mapping')) throw httpError('provider_mapping_table_unavailable', 503);
  const reverse = mappingForExternal(provider.id, externalType, externalId);
  if (reverse && (reverse.business_type !== businessType || reverse.business_id !== businessId)) throw httpError('knowledge_external_mapping_conflict', 409);
  const current = mappingForBusiness(provider.id, businessType, businessId);
  if (!current) return ensureMapping(actor, provider, businessType, businessId, externalType, externalId);
  db.prepare('UPDATE external_mapping SET external_type=?,external_id=? WHERE id=?').run(externalType, externalId, current.id);
  audit(actor, 'knowledge.mapping.replace', `mapping:${current.id}`, { providerId: provider.id, businessType, businessId, externalType });
  return { ...current, external_type: externalType, external_id: externalId };
}
function collectionView(row) {
  return { id: row.id, name: row.name, description: row.description, classification: row.classification, visibility: row.visibility, providerState: row.provider_state, archivedAt: row.archived_at, createdAt: row.created_at, updatedAt: row.updated_at };
}
function versionView(row) {
  return row ? { id: row.id, documentId: row.document_id, version: row.version, contentChecksum: row.content_checksum, sourceFilename: row.source_filename, sourceLocator: row.source_locator, mediaType: row.media_type, byteSize: row.byte_size, sourceStored: Boolean(row.storage_path && existsSync(row.storage_path)), createdAt: row.created_at } : null;
}
function documentView(row) {
  if (!row) return null;
  const version = currentVersion(row);
  return { id: row.id, collectionId: row.collection_id, title: row.title, sourceType: row.source_type, sourceFilename: row.source_filename, sourceLocator: row.source_locator, classification: row.classification, visibility: row.visibility, ingestionState: row.ingestion_state, cleanupState: row.cleanup_state ?? 'NONE', currentVersionId: row.current_version_id, currentVersion: versionView(version), archivedAt: row.archived_at, createdAt: row.created_at, updatedAt: row.updated_at };
}
function canReadCollection(actor, collection) {
  if (!collection || collection.archived_at) return false;
  if (actor.roles.has('substrate-admin') || collection.owner_subject === actor.subject || collection.visibility === 'INTERNAL') return true;
  if (collection.visibility !== 'RESTRICTED') return false;
  const rows = db.prepare('SELECT principal_type,principal_id,permission FROM knowledge_acl WHERE collection_id=?').all(collection.id);
  return rows.some((item) => item.permission === 'READ' && ((item.principal_type === 'SUBJECT' && item.principal_id === actor.subject) || (item.principal_type === 'ROLE' && actor.roles.has(item.principal_id))));
}
function canWriteCollection(actor, collection) { return Boolean(collection) && !collection.archived_at && (actor.roles.has('substrate-admin') || collection.owner_subject === actor.subject); }
function canReadDocument(actor, document, collection) {
  if (!document || document.archived_at || !canReadCollection(actor, collection)) return false;
  if (actor.roles.has('substrate-admin') || collection.owner_subject === actor.subject || document.owner_subject === actor.subject) return true;
  if (document.visibility === 'PRIVATE') return false;
  if (document.visibility === 'INTERNAL') return true;
  return document.visibility === 'RESTRICTED' && collection.visibility === 'RESTRICTED';
}
function getCollection(id) { return db.prepare('SELECT * FROM knowledge_collection WHERE id=?').get(id); }
function getDocument(id) { return db.prepare('SELECT * FROM knowledge_document WHERE id=?').get(id); }
function requireReadableCollection(actor, id) { const row = getCollection(id); if (!row) throw httpError('knowledge_collection_not_found', 404); if (!canReadCollection(actor, row)) throw httpError('forbidden', 403); return row; }
function requireWritableCollection(actor, id) { const row = getCollection(id); if (!row) throw httpError('knowledge_collection_not_found', 404); if (!canWriteCollection(actor, row)) throw httpError('forbidden', 403); return row; }
function requireReadableDocument(actor, id) {
  const document = getDocument(id);
  if (!document) throw httpError('knowledge_document_not_found', 404);
  const collection = getCollection(document.collection_id);
  if (!canReadDocument(actor, document, collection)) throw httpError('forbidden', 403);
  return { document, collection };
}
function requireWritableDocument(actor, id) {
  const document = getDocument(id);
  if (!document) throw httpError('knowledge_document_not_found', 404);
  const collection = requireWritableCollection(actor, document.collection_id);
  return { document, collection };
}
function normalizeProviderRecord(record, expectedType) {
  if (!record || typeof record.externalId !== 'string' || !record.externalId) throw httpError('provider_record_missing_external_id', 502);
  return { externalId: record.externalId, externalType: typeof record.externalType === 'string' && record.externalType ? record.externalType : expectedType };
}
function decodeDocumentContent(input) {
  const encoded = validateString(input.contentBase64, 'content_base64', Math.ceil(MAX_DOCUMENT_BYTES * 4 / 3) + 16);
  let buffer;
  try { buffer = Buffer.from(encoded, 'base64'); } catch { throw httpError('invalid_content_base64', 400); }
  if (!buffer.length || buffer.length > MAX_DOCUMENT_BYTES) throw httpError('invalid_document_size', buffer.length > MAX_DOCUMENT_BYTES ? 413 : 400);
  const canonical = buffer.toString('base64').replace(/=+$/u, '');
  if (canonical !== encoded.replace(/\s+/gu, '').replace(/=+$/u, '')) throw httpError('invalid_content_base64', 400);
  return buffer;
}
function updateIngestionState(documentId, versionId, runId, state, detail = null, finished = false) {
  const current = getDocument(documentId);
  if (!current || current.archived_at || current.current_version_id !== versionId || latestIngestionRun(versionId)?.id !== runId) return current;
  const at = nowIso();
  db.prepare('UPDATE knowledge_document SET ingestion_state=?, updated_at=? WHERE id=? AND current_version_id=? AND archived_at IS NULL').run(state, at, documentId, versionId);
  db.prepare('UPDATE knowledge_ingestion_run SET status=?, detail=?, finished_at=? WHERE id=?').run(state, detail, finished ? at : null, runId);
  return db.prepare('SELECT * FROM knowledge_document WHERE id=?').get(documentId);
}

function completeIngestion(actor, provider, documentId, versionId, runId, record, state) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = getDocument(documentId);
    if (!current || current.archived_at || current.current_version_id !== versionId || latestIngestionRun(versionId)?.id !== runId) throw httpError('knowledge_version_conflict', 409);
    const run = latestIngestionRun(versionId);
    if (current.ingestion_state === 'FAILED' && run.detail === 'knowledge_processing_timeout') throw httpError('knowledge_processing_timeout', 409);
    replaceMapping(actor, provider, 'KnowledgeDocument', documentId, record.externalType, record.externalId);
    updateIngestionState(documentId, versionId, runId, state);
    db.exec('COMMIT');
  } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
}

export async function searchKnowledge(actor, scope, input, auditAction = 'knowledge.search') {
  const query = validateString(input.query, 'knowledge_query', 4000);
  const requested = Array.isArray(input.collectionIds) ? input.collectionIds.map((id) => validateString(id, 'knowledge_collection_id', 255)) : [];
  const allReadable = db.prepare('SELECT * FROM knowledge_collection WHERE archived_at IS NULL').all().filter((row) => canReadCollection(actor, row));
  const byId = new Map(allReadable.map((row) => [row.id, row]));
  const selected = requested.length ? requested.map((id) => {
    const row = byId.get(id);
    if (!row) throw httpError('forbidden_or_collection_not_found', 403);
    return row;
  }) : allReadable;
  if (!selected.length) return { query, results: [], providerId: null, collectionIds: [] };

  const provider = resolveProvider('knowledge.v1.search', scope);
  if (!provider) throw httpError('knowledge_provider_unavailable', 503);
  const providerCollectionIds = selected.map((collection) => {
    const mapping = mappingForBusiness(provider.id, 'KnowledgeCollection', collection.id);
    if (!mapping) throw httpError(`knowledge_collection_provider_mapping_missing:${collection.id}`, 409);
    return mapping.external_id;
  });
  const topK = Number.isInteger(input.topK) && input.topK >= 1 && input.topK <= 50 ? input.topK : 10;
  const minimumScore = typeof input.minimumScore === 'number' && Number.isFinite(input.minimumScore) ? input.minimumScore : null;
  const invocation = await invokeProvider(provider, 'knowledge.v1.search', actor, scope, { query, providerCollectionIds, topK, minimumScore });
  const allowedCollectionIds = new Set(selected.map((item) => item.id));
  const results = [];
  for (const item of Array.isArray(invocation.result?.results) ? invocation.result.results : []) {
    if (!item?.documentExternalId) continue;
    const mapping = mappingForExternal(provider.id, item.documentExternalType ?? 'document', item.documentExternalId);
    if (!mapping || mapping.business_type !== 'KnowledgeDocument') continue;
    const document = getDocument(mapping.business_id);
    if (!document || document.archived_at || document.ingestion_state !== 'READY' || !allowedCollectionIds.has(document.collection_id)) continue;
    const collection = byId.get(document.collection_id);
    if (!collection || !canReadDocument(actor, document, collection)) continue;
    const opaqueChunkId = item.chunkExternalId ? `chunk:${createHash('sha256').update(`${provider.id}:${item.chunkExternalId}`).digest('hex').slice(0, 32)}` : null;
    results.push({
      knowledgeDocumentId: document.id,
      knowledgeDocumentVersionId: document.current_version_id,
      collectionId: document.collection_id,
      chunkId: opaqueChunkId,
      text: typeof item.text === 'string' ? item.text : '',
      score: typeof item.score === 'number' ? item.score : null,
      page: item.page ?? null,
      section: item.section ?? null,
      sourceTitle: document.title,
      contractVersion: KNOWLEDGE_CONTRACT,
    });
    if (results.length >= topK) break;
  }
  audit(actor, auditAction, 'KnowledgeSearch', { providerId: provider.id, collectionIds: selected.map((item) => item.id), resultCount: results.length });
  return { query, results, providerId: provider.id, collectionIds: selected.map((item) => item.id) };
}

const KNOWLEDGE_RECONCILER_ACTOR = Object.freeze({
  subject: 'system:knowledge-ingestion-reconciler',
  username: 'knowledge-ingestion-reconciler',
  roles: new Set(['substrate-admin']),
});

function latestIngestionRun(documentVersionId) {
  if (!documentVersionId) return null;
  return db.prepare('SELECT * FROM knowledge_ingestion_run WHERE document_version_id=? ORDER BY started_at DESC,rowid DESC LIMIT 1').get(documentVersionId) ?? null;
}

function writeReconciledIngestionState(document, state, detail, expectedRunId) {
  const current = getDocument(document.id);
  const run = latestIngestionRun(document.current_version_id);
  // A user can archive/retry a document while a provider request is in flight.
  // An old poll must never overwrite a newer attempt or resurrect an archive.
  if (!current || current.archived_at || current.current_version_id !== document.current_version_id
    || !['PENDING', 'INDEXING'].includes(current.ingestion_state)
    || (expectedRunId && run?.id !== expectedRunId)) return false;
  const at = nowIso();
  db.prepare('UPDATE knowledge_document SET ingestion_state=?,updated_at=? WHERE id=?').run(state, at, document.id);
  if (!run) return true;
  db.prepare('UPDATE knowledge_ingestion_run SET last_polled_at=?,poll_error_count=0 WHERE id=?').run(at, run.id);
  if (['READY', 'FAILED', 'CANCELLED'].includes(state)) {
    db.prepare('UPDATE knowledge_ingestion_run SET status=?,detail=?,finished_at=? WHERE id=?').run(state, detail ?? null, at, run.id);
  } else {
    db.prepare('UPDATE knowledge_ingestion_run SET status=?,detail=?,finished_at=NULL WHERE id=?').run(state, detail ?? null, run.id);
  }
  return true;
}

function recordKnowledgePollError(document, run, error) {
  const count = (run?.poll_error_count ?? 0) + 1;
  const failed = count >= MAX_POLL_ERRORS;
  const detail = `${failed ? 'knowledge_status_failed:' : 'knowledge_status_retry:'}${String(error?.message ?? 'unknown').slice(0, 1000)}`;
  if (!writeReconciledIngestionState(document, failed ? 'FAILED' : 'INDEXING', detail, run?.id)) return false;
  if (run) db.prepare('UPDATE knowledge_ingestion_run SET poll_error_count=? WHERE id=?').run(count, run.id);
  if (failed) audit(KNOWLEDGE_RECONCILER_ACTOR, 'knowledge.document.background_status_failed', `KnowledgeDocument:${document.id}`, { attempts: count });
  return failed;
}

export async function reconcileKnowledgeIngestionBatch({ limit = 12 } = {}) {
  const boundedLimit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 50)) : 12;
  const requiredTables = [
    'knowledge_document',
    'knowledge_collection',
    'knowledge_ingestion_run',
    'provider_registration',
    'capability_binding',
    'external_mapping',
  ];
  if (requiredTables.some((name) => !tableExists(name))) {
    return { scanned: 0, indexing: 0, ready: 0, failed: 0, skipped: 0, errors: 0 };
  }
  const rows = db.prepare(`
    SELECT d.*, c.organization_scope, c.workspace_scope
    FROM knowledge_document d
    JOIN knowledge_collection c ON c.id=d.collection_id
    WHERE d.archived_at IS NULL
      AND c.archived_at IS NULL
      AND d.ingestion_state IN ('PENDING','INDEXING')
    ORDER BY d.updated_at ASC
    LIMIT ?
  `).all(boundedLimit);

  const stats = { scanned: rows.length, indexing: 0, ready: 0, failed: 0, skipped: 0, errors: 0 };
  for (const document of rows) {
    if (documentMutations.has(document.id)) { stats.skipped += 1; continue; }
    const run = latestIngestionRun(document.current_version_id);
    const startedAt = Date.parse(run?.started_at ?? document.created_at);
    if (Number.isFinite(startedAt) && Date.now() - startedAt >= INGESTION_TIMEOUT_MS) {
      if (writeReconciledIngestionState(document, 'FAILED', 'knowledge_processing_timeout', run?.id)) {
        audit(KNOWLEDGE_RECONCILER_ACTOR, 'knowledge.document.background_timeout', `KnowledgeDocument:${document.id}`, { timeoutMs: INGESTION_TIMEOUT_MS });
        stats.failed += 1;
      } else stats.skipped += 1;
      continue;
    }
    const scope = {
      environment: SUBSTRATE_ENV,
      organization: document.organization_scope ?? null,
      workspace: document.workspace_scope ?? null,
    };
    const provider = resolveProvider('knowledge.v1.document.status', scope);
    if (!provider) {
      if (recordKnowledgePollError(document, run, new Error('knowledge_provider_unavailable'))) stats.failed += 1;
      stats.errors += 1;
      continue;
    }
    const collectionMapping = mappingForBusiness(provider.id, 'KnowledgeCollection', document.collection_id);
    const documentMapping = mappingForBusiness(provider.id, 'KnowledgeDocument', document.id);
    if (!collectionMapping || !documentMapping) {
      writeReconciledIngestionState(document, 'FAILED', 'knowledge_provider_mapping_missing', run?.id);
      stats.failed += 1;
      continue;
    }

    try {
      const invocation = await invokeProvider(provider, 'knowledge.v1.document.status', KNOWLEDGE_RECONCILER_ACTOR, scope, {
        providerCollectionId: collectionMapping.external_id,
        providerDocumentId: documentMapping.external_id,
      });

      const current = getDocument(document.id);
      if (!current || current.archived_at || current.current_version_id !== document.current_version_id
        || !['PENDING', 'INDEXING'].includes(current.ingestion_state)
        || latestIngestionRun(document.current_version_id)?.id !== run?.id) {
        stats.skipped += 1;
        continue;
      }

      if (invocation.result?.record?.externalId) {
        const record = normalizeProviderRecord(invocation.result.record, 'document');
        if (record.externalId !== documentMapping.external_id || record.externalType !== documentMapping.external_type) {
          replaceMapping(
            KNOWLEDGE_RECONCILER_ACTOR,
            provider,
            'KnowledgeDocument',
            document.id,
            record.externalType,
            record.externalId,
          );
          audit(KNOWLEDGE_RECONCILER_ACTOR, 'knowledge.document.background_mapping_reconciled', `KnowledgeDocument:${document.id}`, {
            providerId: provider.id,
            previousExternalId: documentMapping.external_id,
            nextExternalId: record.externalId,
            extractor: invocation.result?.extraction ?? null,
          });
        }
      }

      const state = ['READY', 'INDEXING', 'FAILED', 'CANCELLED'].includes(invocation.result?.state)
        ? invocation.result.state
        : 'INDEXING';
      writeReconciledIngestionState(document, state, invocation.result?.detail ?? null, run?.id);
      if (state === 'READY') stats.ready += 1;
      else if (state === 'FAILED' || state === 'CANCELLED') stats.failed += 1;
      else stats.indexing += 1;
    } catch (error) {
      if (error?.httpStatus === 404) {
        writeReconciledIngestionState(document, 'FAILED', 'provider_document_not_found', run?.id);
        stats.failed += 1;
        continue;
      }
      if (recordKnowledgePollError(document, run, error)) stats.failed += 1;
      stats.errors += 1;
    }
  }
  return stats;
}

const documentMutations = new Set();
async function cleanRetiredIndexes(documentId, actor, scope) {
  const rows = db.prepare('SELECT r.* FROM knowledge_retired_index r JOIN knowledge_document_version v ON v.id=r.version_id WHERE v.document_id=? AND r.cleaned_at IS NULL').all(documentId);
  for (const row of rows) {
    const provider = resolveProvider('knowledge.v1.document.remove', scope);
    if (!provider || provider.id !== row.provider_id) throw httpError('knowledge_provider_unavailable', 503);
    try { await invokeProvider(provider, 'knowledge.v1.document.remove', actor, scope, { providerCollectionId: row.collection_external_id, providerDocumentId: row.document_external_id }); }
    catch (error) { if (!/404|not_found/u.test(String(error.message))) throw error; }
    db.prepare('UPDATE knowledge_retired_index SET cleaned_at=? WHERE version_id=? AND provider_id=? AND collection_external_id=? AND document_external_id=?').run(nowIso(), row.version_id, row.provider_id, row.collection_external_id, row.document_external_id);
    audit(actor, 'knowledge.document.retired_index_cleaned', `KnowledgeDocument:${documentId}`, { versionId: row.version_id });
  }
}

export function createKnowledgeNativeHandler() {
  return async function knowledgeNativeHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (!url.pathname.startsWith('/api/knowledge/')) return false;
    if (req.method === 'OPTIONS') { json(res, 204, {}); return true; }
    let mutationKey = null;
    try {
      const actor = await authenticate(req); requireUser(actor); const scope = parseScope(req);
      const mutationMatch = url.pathname.match(/^\/api\/knowledge\/documents\/([^/]+)(?:\/(?:versions|retry|links))?$/);
      if (mutationMatch && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        mutationKey = decodeURIComponent(mutationMatch[1]);
        if (documentMutations.has(mutationKey)) { mutationKey = null; throw httpError('knowledge_document_update_in_progress', 409); }
        documentMutations.add(mutationKey);
      }

      if (req.method === 'GET' && url.pathname === '/api/knowledge/health') {
        const provider = resolveProvider('knowledge.v1.health', scope);
        if (!provider) throw httpError('knowledge_provider_unavailable', 503);
        const invocation = await invokeProvider(provider, 'knowledge.v1.health', actor, scope, {});
        json(res, 200, { state: invocation.result?.state ?? (invocation.result?.ok ? 'READY' : 'UNKNOWN'), contractVersion: KNOWLEDGE_CONTRACT }); return true;
      }

      if (req.method === 'GET' && url.pathname === '/api/knowledge/collections') {
        const rows = db.prepare('SELECT * FROM knowledge_collection WHERE archived_at IS NULL ORDER BY updated_at DESC').all().filter((row) => canReadCollection(actor, row));
        json(res, 200, { collections: rows.map((row) => ({ ...collectionView(row), canManage: canWriteCollection(actor, row) })) }); return true;
      }

      if (req.method === 'POST' && url.pathname === '/api/knowledge/collections') {
        requireKnowledgeManager(actor);
        const input = await readJson(req, 128 * 1024);
        const id = randomUUID(); const at = nowIso();
        const name = validateString(input.name, 'knowledge_collection_name', 255);
        const description = optionalString(input.description, 'knowledge_collection_description', 4000);
        const classification = validateEnum(input.classification ?? 'INTERNAL', 'knowledge_classification', ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']);
        const visibility = validateEnum(input.visibility ?? 'INTERNAL', 'knowledge_visibility', ['INTERNAL', 'PRIVATE', 'RESTRICTED']);
        validateKnowledgeSecurityPair(classification, visibility);
        db.prepare('INSERT INTO knowledge_collection(id,name,description,classification,visibility,owner_subject,organization_scope,workspace_scope,provider_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id, name, description, classification, visibility, actor.subject, scope.organization, scope.workspace, 'PENDING', at, at);
        const provider = resolveProvider('knowledge.v1.collection.create', scope);
        if (!provider) {
          db.prepare("UPDATE knowledge_collection SET provider_state='UNAVAILABLE',updated_at=? WHERE id=?").run(nowIso(), id);
          audit(actor, 'knowledge.collection.provider_unavailable', `KnowledgeCollection:${id}`);
          json(res, 202, { collection: collectionView(getCollection(id)), providerError: 'knowledge_provider_unavailable' }); return true;
        }
        try {
          const invocation = await invokeProvider(provider, 'knowledge.v1.collection.create', actor, scope, { knowledgeCollectionId: id, name, description, classification });
          const record = normalizeProviderRecord(invocation.result?.record, 'dataset');
          ensureMapping(actor, provider, 'KnowledgeCollection', id, record.externalType, record.externalId);
          db.prepare("UPDATE knowledge_collection SET provider_state='READY',updated_at=? WHERE id=?").run(nowIso(), id);
          audit(actor, 'knowledge.collection.create', `KnowledgeCollection:${id}`, { providerId: provider.id, classification, visibility });
          json(res, 201, { collection: collectionView(getCollection(id)) }); return true;
        } catch (error) {
          db.prepare("UPDATE knowledge_collection SET provider_state='FAILED',updated_at=? WHERE id=?").run(nowIso(), id);
          audit(actor, 'knowledge.collection.provider_failed', `KnowledgeCollection:${id}`, { error: error.message });
          json(res, 202, { collection: collectionView(getCollection(id)), providerError: publicKnowledgeFailure(error) }); return true;
        }
      }

      const collectionMatch = url.pathname.match(/^\/api\/knowledge\/collections\/([^/]+)$/);
      if (req.method === 'GET' && collectionMatch) {
        const collection = requireReadableCollection(actor, decodeURIComponent(collectionMatch[1]));
        const acl = canWriteCollection(actor, collection) ? db.prepare('SELECT principal_type,principal_id,permission,created_at FROM knowledge_acl WHERE collection_id=? ORDER BY principal_type,principal_id').all(collection.id).map((row) => ({ principalType: row.principal_type, principalId: row.principal_id, permission: row.permission, createdAt: row.created_at })) : [];
        const counts = db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN ingestion_state='READY' THEN 1 ELSE 0 END) AS ready,SUM(CASE WHEN ingestion_state IN ('PENDING','INDEXING') THEN 1 ELSE 0 END) AS processing,SUM(CASE WHEN ingestion_state='FAILED' THEN 1 ELSE 0 END) AS failed FROM knowledge_document WHERE collection_id=? AND archived_at IS NULL").get(collection.id);
        json(res, 200, { collection: { ...collectionView(collection), canManage: canWriteCollection(actor, collection) }, acl, documentCounts: { total: Number(counts.total ?? 0), ready: Number(counts.ready ?? 0), processing: Number(counts.processing ?? 0), failed: Number(counts.failed ?? 0) } }); return true;
      }

      if (req.method === 'PATCH' && collectionMatch) {
        const collection = requireWritableCollection(actor, decodeURIComponent(collectionMatch[1]));
        const input = await readJson(req, 128 * 1024);
        const name = input.name === undefined ? collection.name : validateString(input.name, 'knowledge_collection_name', 255);
        const description = input.description === undefined ? collection.description : optionalString(input.description, 'knowledge_collection_description', 4000);
        const classification = input.classification === undefined ? collection.classification : validateEnum(input.classification, 'knowledge_classification', ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']);
        const visibility = input.visibility === undefined ? collection.visibility : validateEnum(input.visibility, 'knowledge_visibility', ['INTERNAL', 'PRIVATE', 'RESTRICTED']);
        validateKnowledgeSecurityPair(classification, visibility);
        let providerError = null;
        let providerState = collection.provider_state;
        const provider = resolveProvider('knowledge.v1.collection.update', scope);
        const mapping = provider ? mappingForBusiness(provider.id, 'KnowledgeCollection', collection.id) : null;
        if (provider && mapping && (name !== collection.name || description !== collection.description)) {
          try {
            await invokeProvider(provider, 'knowledge.v1.collection.update', actor, scope, { providerCollectionId: mapping.external_id, name, description });
            providerState = 'READY';
          } catch (error) {
            providerState = 'FAILED'; providerError = publicKnowledgeFailure(error);
          }
        }
        db.prepare('UPDATE knowledge_collection SET name=?,description=?,classification=?,visibility=?,provider_state=?,updated_at=? WHERE id=?').run(name, description, classification, visibility, providerState, nowIso(), collection.id);
        audit(actor, 'knowledge.collection.update', `KnowledgeCollection:${collection.id}`, { classification, visibility, providerError });
        json(res, providerError ? 202 : 200, { collection: collectionView(getCollection(collection.id)), providerError }); return true;
      }

      const collectionRetryMatch = url.pathname.match(/^\/api\/knowledge\/collections\/([^/]+)\/retry$/);
      if (req.method === 'POST' && collectionRetryMatch) {
        const collection = requireWritableCollection(actor, decodeURIComponent(collectionRetryMatch[1]));
        const provider = resolveProvider('knowledge.v1.collection.create', scope);
        if (!provider) throw httpError('knowledge_provider_unavailable', 503);
        const existing = mappingForBusiness(provider.id, 'KnowledgeCollection', collection.id);
        try {
          if (existing) {
            const listed = await invokeProvider(provider, 'knowledge.v1.collection.list', actor, scope, {});
            const records = Array.isArray(listed.result?.records) ? listed.result.records : [];
            const live = records.some((record) => record?.externalType === existing.external_type && record?.externalId === existing.external_id);
            if (live) {
              db.prepare("UPDATE knowledge_collection SET provider_state='READY',updated_at=? WHERE id=?").run(nowIso(), collection.id);
              audit(actor, 'knowledge.collection.retry_reconciled', `KnowledgeCollection:${collection.id}`, { providerId: provider.id });
              json(res, 200, { collection: collectionView(getCollection(collection.id)), reconciled: true }); return true;
            }
          }
          const invocation = await invokeProvider(provider, 'knowledge.v1.collection.create', actor, scope, { knowledgeCollectionId: collection.id, name: collection.name, description: collection.description, classification: collection.classification });
          const record = normalizeProviderRecord(invocation.result?.record, 'dataset');
          replaceMapping(actor, provider, 'KnowledgeCollection', collection.id, record.externalType, record.externalId);
          db.prepare("UPDATE knowledge_collection SET provider_state='READY',updated_at=? WHERE id=?").run(nowIso(), collection.id);
          audit(actor, existing ? 'knowledge.collection.retry_recreated' : 'knowledge.collection.retry', `KnowledgeCollection:${collection.id}`, { providerId: provider.id, previousExternalId: existing?.external_id ?? null, externalId: record.externalId });
          json(res, 200, { collection: collectionView(getCollection(collection.id)), recreated: Boolean(existing) }); return true;
        } catch (error) {
          db.prepare("UPDATE knowledge_collection SET provider_state='FAILED',updated_at=? WHERE id=?").run(nowIso(), collection.id);
          audit(actor, 'knowledge.collection.retry_failed', `KnowledgeCollection:${collection.id}`, { error: error.message });
          throw error;
        }
      }

      const collectionAclMatch = url.pathname.match(/^\/api\/knowledge\/collections\/([^/]+)\/acl$/);
      if (req.method === 'GET' && collectionAclMatch) {
        const collection = requireWritableCollection(actor, decodeURIComponent(collectionAclMatch[1]));
        const entries = db.prepare('SELECT principal_type,principal_id,permission,created_at FROM knowledge_acl WHERE collection_id=? ORDER BY principal_type,principal_id').all(collection.id).map((row) => ({ principalType: row.principal_type, principalId: row.principal_id, permission: row.permission, createdAt: row.created_at }));
        json(res, 200, { entries }); return true;
      }
      if (req.method === 'PUT' && collectionAclMatch) {
        const collection = requireWritableCollection(actor, decodeURIComponent(collectionAclMatch[1]));
        const input = await readJson(req, 128 * 1024);
        if (!Array.isArray(input.entries) || input.entries.length > 100) throw httpError('invalid_knowledge_acl_entries', 400);
        const entries = input.entries.map((entry) => ({
          principalType: validateEnum(entry?.principalType, 'knowledge_acl_principal_type', ['SUBJECT', 'ROLE']),
          principalId: validateString(entry?.principalId, 'knowledge_acl_principal_id', 255),
          permission: validateEnum(entry?.permission ?? 'READ', 'knowledge_acl_permission', ['READ']),
        }));
        const unique = new Set(entries.map((entry) => `${entry.principalType}:${entry.principalId}:${entry.permission}`));
        if (unique.size !== entries.length) throw httpError('duplicate_knowledge_acl_entry', 409);
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare('DELETE FROM knowledge_acl WHERE collection_id=?').run(collection.id);
          const insert = db.prepare('INSERT INTO knowledge_acl(collection_id,principal_type,principal_id,permission,created_at) VALUES(?,?,?,?,?)');
          const at = nowIso();
          for (const entry of entries) insert.run(collection.id, entry.principalType, entry.principalId, entry.permission, at);
          db.exec('COMMIT');
        } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
        audit(actor, 'knowledge.collection.acl.replace', `KnowledgeCollection:${collection.id}`, { entryCount: entries.length });
        json(res, 200, { entries }); return true;
      }

      if (req.method === 'DELETE' && collectionMatch) {
        const collection = requireWritableCollection(actor, decodeURIComponent(collectionMatch[1]));
        const activeDocuments = db.prepare('SELECT COUNT(*) AS n FROM knowledge_document WHERE collection_id=? AND archived_at IS NULL').get(collection.id).n;
        if (Number(activeDocuments) > 0) throw httpError('knowledge_collection_not_empty', 409);
        const provider = resolveProvider('knowledge.v1.collection.archive', scope);
        if (!provider) throw httpError('knowledge_provider_unavailable', 503);
        const mapping = mappingForBusiness(provider.id, 'KnowledgeCollection', collection.id);
        if (mapping) {
          try {
            await invokeProvider(provider, 'knowledge.v1.collection.archive', actor, scope, { providerCollectionId: mapping.external_id });
          } catch (error) {
            db.prepare("UPDATE knowledge_collection SET provider_state='CLEANUP_FAILED',updated_at=? WHERE id=?").run(nowIso(), collection.id);
            audit(actor, 'knowledge.collection.archive_failed', `KnowledgeCollection:${collection.id}`, { error: error.message });
            throw error;
          }
        }
        const at = nowIso();
        db.prepare("UPDATE knowledge_collection SET archived_at=?,provider_state='ARCHIVED',updated_at=? WHERE id=?").run(at, at, collection.id);
        audit(actor, 'knowledge.collection.archive', `KnowledgeCollection:${collection.id}`);
        json(res, 200, { archived: true, collection: collectionView(getCollection(collection.id)) }); return true;
      }

      if (req.method === 'GET' && url.pathname === '/api/knowledge/documents') {
        const requestedCollectionId = url.searchParams.get('collectionId');
        const collections = db.prepare('SELECT * FROM knowledge_collection WHERE archived_at IS NULL').all().filter((row) => canReadCollection(actor, row));
        const readable = new Map(collections.map((row) => [row.id, row]));
        if (requestedCollectionId && !readable.has(requestedCollectionId)) throw httpError('forbidden_or_collection_not_found', 403);
        const rows = requestedCollectionId
          ? db.prepare('SELECT * FROM knowledge_document WHERE archived_at IS NULL AND collection_id=? ORDER BY updated_at DESC').all(requestedCollectionId)
          : db.prepare('SELECT * FROM knowledge_document WHERE archived_at IS NULL ORDER BY updated_at DESC').all();
        const documents = rows
          .filter((row) => canReadDocument(actor, row, readable.get(row.collection_id)))
          .map((row) => ({ ...documentView(row), canManage: canWriteCollection(actor, readable.get(row.collection_id)) }));
        json(res, 200, { documents }); return true;
      }

      if (req.method === 'POST' && url.pathname === '/api/knowledge/documents') {
        const input = await readJson(req);
        const collection = requireWritableCollection(actor, validateString(input.collectionId, 'knowledge_collection_id', 255));
        const bytes = decodeDocumentContent(input);
        const documentId = randomUUID(); const versionId = randomUUID(); const runId = randomUUID(); const at = nowIso();
        const title = validateString(input.title, 'knowledge_document_title', 512);
        const sourceType = validateEnum(input.sourceType ?? 'UPLOAD', 'knowledge_source_type', ['UPLOAD', 'WEB', 'GENERATED', 'CONNECTOR', 'REFERENCE']);
        const sourceFilename = optionalString(input.sourceFilename, 'knowledge_source_filename', 512);
        const sourceLocator = optionalString(input.sourceLocator, 'knowledge_source_locator', 4096);
        const mediaType = optionalString(input.mediaType, 'knowledge_media_type', 255) ?? 'application/octet-stream';
        const checksum = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
        const duplicate = db.prepare('SELECT d.id FROM knowledge_document d JOIN knowledge_document_version v ON v.document_id=d.id WHERE d.collection_id=? AND d.archived_at IS NULL AND v.content_checksum=? LIMIT 1').get(collection.id, checksum);
        if (duplicate) throw httpError(`knowledge_duplicate_document:${duplicate.id}`, 409);
        const classification = validateEnum(input.classification ?? collection.classification, 'knowledge_classification', ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']);
        const visibility = validateEnum(input.visibility ?? collection.visibility, 'knowledge_visibility', ['INTERNAL', 'PRIVATE', 'RESTRICTED']);
        validateKnowledgeSecurityPair(classification, visibility);
        const storagePath = persistSource(documentId, versionId, bytes);
        const provider = resolveProvider('knowledge.v1.document.ingest', scope);
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare('INSERT INTO knowledge_document(id,collection_id,title,source_type,source_filename,source_locator,classification,visibility,owner_subject,ingestion_state,cleanup_state,current_version_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(documentId, collection.id, title, sourceType, sourceFilename, sourceLocator, classification, visibility, actor.subject, 'PENDING', 'NONE', versionId, at, at);
          db.prepare('INSERT INTO knowledge_document_version(id,document_id,version,content_checksum,source_filename,source_locator,media_type,byte_size,storage_path,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(versionId, documentId, 1, checksum, sourceFilename, sourceLocator, mediaType, bytes.length, storagePath, at);
          db.prepare('INSERT INTO knowledge_ingestion_run(id,document_version_id,provider_id,status,detail,started_at) VALUES(?,?,?,?,?,?)').run(runId, versionId, provider?.id ?? null, provider ? 'PENDING' : 'FAILED', provider ? null : 'knowledge_provider_unavailable', at);
          db.exec('COMMIT');
        } catch (error) {
          try { db.exec('ROLLBACK'); } catch {}
          removeStoredSource(storagePath);
          throw error;
        }
        if (!provider) {
          updateIngestionState(documentId, versionId, runId, 'FAILED', 'knowledge_provider_unavailable', true);
          audit(actor, 'knowledge.document.provider_unavailable', `KnowledgeDocument:${documentId}`, { collectionId: collection.id, checksum, byteSize: bytes.length });
          json(res, 202, { document: { ...documentView(getDocument(documentId)), canManage: true }, ingestionRunId: runId, providerError: 'knowledge_provider_unavailable' }); return true;
        }
        const collectionMapping = mappingForBusiness(provider.id, 'KnowledgeCollection', collection.id);
        if (!collectionMapping) {
          updateIngestionState(documentId, versionId, runId, 'FAILED', 'knowledge_collection_provider_mapping_missing', true);
          audit(actor, 'knowledge.document.collection_mapping_missing', `KnowledgeDocument:${documentId}`, { collectionId: collection.id, providerId: provider.id });
          json(res, 202, { document: { ...documentView(getDocument(documentId)), canManage: true }, ingestionRunId: runId, providerError: 'knowledge_collection_provider_mapping_missing' }); return true;
        }
        try {
          const invocation = await invokeProvider(provider, 'knowledge.v1.document.ingest', actor, scope, {
            knowledgeDocumentId: documentId,
            knowledgeDocumentVersionId: versionId,
            providerCollectionId: collectionMapping.external_id,
            title,
            sourceFilename: sourceFilename ?? `${documentId}.bin`,
            mediaType,
            contentBase64: bytes.toString('base64'),
            checksum,
          });
          const record = normalizeProviderRecord(invocation.result?.record, 'document');
          completeIngestion(actor, provider, documentId, versionId, runId, record, invocation.result?.state === 'READY' ? 'READY' : 'INDEXING');
          audit(actor, 'knowledge.document.ingest', `KnowledgeDocument:${documentId}`, { collectionId: collection.id, providerId: provider.id, checksum, byteSize: bytes.length });
          json(res, 201, { document: { ...documentView(getDocument(documentId)), canManage: true }, ingestionRunId: runId }); return true;
        } catch (error) {
          updateIngestionState(documentId, versionId, runId, 'FAILED', error.message, true);
          audit(actor, 'knowledge.document.ingest_failed', `KnowledgeDocument:${documentId}`, { providerId: provider.id, error: error.message });
          json(res, 202, { document: { ...documentView(getDocument(documentId)), canManage: true }, ingestionRunId: runId, providerError: publicKnowledgeFailure(error) }); return true;
        }
      }

      const versionsMatch = url.pathname.match(/^\/api\/knowledge\/documents\/([^/]+)\/versions$/);
      if (req.method === 'POST' && versionsMatch) {
        const { document, collection } = requireWritableDocument(actor, decodeURIComponent(versionsMatch[1]));
        const input = await readJson(req);
        if (input.expectedVersionId !== document.current_version_id) throw httpError('knowledge_version_conflict', 409);
        if (['PENDING', 'INDEXING'].includes(document.ingestion_state)) throw httpError('knowledge_document_update_in_progress', 409);
        const bytes = decodeDocumentContent(input);
        const sourceFilename = validateString(input.sourceFilename, 'knowledge_source_filename', 512);
        const mediaType = optionalString(input.mediaType, 'knowledge_media_type', 255) ?? 'application/octet-stream';
        const checksum = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
        if (currentVersion(document)?.content_checksum === checksum) throw httpError('knowledge_version_unchanged', 409);
        const provider = resolveProvider('knowledge.v1.document.ingest', scope);
        const collectionMapping = provider ? mappingForBusiness(provider.id, 'KnowledgeCollection', collection.id) : null;
        const previousMappings = db.prepare("SELECT * FROM external_mapping WHERE business_type='KnowledgeDocument' AND business_id=?").all(document.id);
        const retiredMappings = previousMappings.map(mapping => { const collectionMap = mappingForBusiness(mapping.provider_id, 'KnowledgeCollection', collection.id); if (!collectionMap) throw httpError('knowledge_collection_provider_mapping_missing', 409); return { mapping, collectionMap }; });
        const versionId = randomUUID(); const runId = randomUUID(); const at = nowIso();
        const storagePath = persistSource(document.id, versionId, bytes);
        db.exec('BEGIN IMMEDIATE');
        try {
          const current = getDocument(document.id);
          if (current?.archived_at || current?.current_version_id !== input.expectedVersionId) throw httpError('knowledge_version_conflict', 409);
          const nextVersion = db.prepare('SELECT COALESCE(MAX(version),0)+1 AS value FROM knowledge_document_version WHERE document_id=?').get(document.id).value;
          db.prepare('INSERT INTO knowledge_document_version(id,document_id,version,content_checksum,source_filename,media_type,byte_size,storage_path,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(versionId, document.id, nextVersion, checksum, sourceFilename, mediaType, bytes.length, storagePath, at);
          db.prepare("UPDATE knowledge_document SET current_version_id=?,source_filename=?,source_type='UPLOAD',source_locator=NULL,ingestion_state='PENDING',updated_at=? WHERE id=?").run(versionId, sourceFilename, at, document.id);
          db.prepare("INSERT INTO knowledge_ingestion_run(id,document_version_id,provider_id,status,started_at) VALUES(?,?,?,'PENDING',?)").run(runId, versionId, provider?.id ?? null, at);
          for (const { mapping, collectionMap } of retiredMappings) {
            db.prepare('INSERT OR IGNORE INTO knowledge_retired_index(version_id,provider_id,collection_external_id,document_external_id) VALUES(?,?,?,?)').run(document.current_version_id, mapping.provider_id, collectionMap.external_id, mapping.external_id);
          }
          // Remove every old mapping immediately. A failed cleanup must never cause
          // old chunks to be cited as the newly committed canonical version.
          db.prepare("DELETE FROM external_mapping WHERE business_type='KnowledgeDocument' AND business_id=?").run(document.id);
          db.exec('COMMIT');
        } catch (error) { try { db.exec('ROLLBACK'); } catch {} removeStoredSource(storagePath); throw error; }
        audit(actor, 'knowledge.document.version.create', `KnowledgeDocument:${document.id}`, { versionId, previousVersionId: document.current_version_id, checksum, byteSize: bytes.length });
        try {
          if (!provider) throw httpError('knowledge_provider_unavailable', 503);
          if (!collectionMapping) throw httpError('knowledge_collection_provider_mapping_missing', 409);
          await cleanRetiredIndexes(document.id, actor, scope);
          const invocation = await invokeProvider(provider, 'knowledge.v1.document.ingest', actor, scope, {
            knowledgeDocumentId: document.id, knowledgeDocumentVersionId: versionId,
            providerCollectionId: collectionMapping.external_id, title: document.title,
            sourceFilename, mediaType, contentBase64: bytes.toString('base64'), checksum,
          });
          const record = normalizeProviderRecord(invocation.result?.record, 'document');
          const current = getDocument(document.id);
          if (current?.archived_at || current?.current_version_id !== versionId) throw httpError('knowledge_version_conflict', 409);
          completeIngestion(actor, provider, document.id, versionId, runId, record, invocation.result?.state === 'READY' ? 'READY' : 'INDEXING');
          json(res, 201, { document: { ...documentView(getDocument(document.id)), canManage: true }, ingestionRunId: runId });
        } catch (error) {
          updateIngestionState(document.id, versionId, runId, 'FAILED', error.message, true);
          audit(actor, 'knowledge.document.version.ingest_failed', `KnowledgeDocument:${document.id}`, { versionId, error: error.message });
          json(res, 202, { document: { ...documentView(getDocument(document.id)), canManage: true }, ingestionRunId: runId, providerError: publicKnowledgeFailure(error) });
        }
        return true;
      }

      const documentMatch = url.pathname.match(/^\/api\/knowledge\/documents\/([^/]+)$/);
      if (req.method === 'GET' && documentMatch) {
        const { document, collection } = requireReadableDocument(actor, decodeURIComponent(documentMatch[1]));
        const versions = db.prepare('SELECT * FROM knowledge_document_version WHERE document_id=? ORDER BY version DESC').all(document.id).map(versionView);
        const links = db.prepare('SELECT id,business_type,business_id,created_at FROM knowledge_business_link WHERE document_id=? ORDER BY business_type,business_id').all(document.id).map((row) => ({ id: row.id, businessType: row.business_type, businessId: row.business_id, createdAt: row.created_at }));
        const ingestionRuns = db.prepare('SELECT id,status,detail,started_at,finished_at FROM knowledge_ingestion_run WHERE document_version_id IN (SELECT id FROM knowledge_document_version WHERE document_id=?) ORDER BY started_at DESC,rowid DESC LIMIT 20').all(document.id).map((row) => ({ id: row.id, status: row.status, detail: publicIngestionDetail(row.detail), cause: publicIngestionCause(row.detail), startedAt: row.started_at, finishedAt: row.finished_at }));
        json(res, 200, { document: documentView(document), collection: collectionView(collection), canManage: canWriteCollection(actor, collection), versions, links, ingestionRuns }); return true;
      }

      const sourceMatch = url.pathname.match(/^\/api\/knowledge\/documents\/([^/]+)\/source$/);
      if (req.method === 'GET' && sourceMatch) {
        const { document } = requireReadableDocument(actor, decodeURIComponent(sourceMatch[1]));
        const { bytes, version } = verifiedSourceBytes(document, url.searchParams.get('versionId'));
        const filename = version.source_filename ?? document.source_filename ?? `${document.id}.bin`;
        res.writeHead(200, {
          'content-type': version.media_type ?? 'application/octet-stream',
          'content-length': String(bytes.length),
          'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          'cache-control': 'private, no-store',
          'access-control-allow-origin': CORS_ORIGIN,
        });
        res.end(bytes); return true;
      }

      const linksMatch = url.pathname.match(/^\/api\/knowledge\/documents\/([^/]+)\/links$/);
      if (req.method === 'PUT' && linksMatch) {
        const { document } = requireWritableDocument(actor, decodeURIComponent(linksMatch[1]));
        const input = await readJson(req, 128 * 1024);
        if (!Array.isArray(input.links) || input.links.length > 50) throw httpError('invalid_knowledge_business_links', 400);
        const allowedTypes = ['Account', 'Contact', 'Opportunity', 'Site', 'Product', 'Project', 'Case', 'Country', 'Market', 'Solution'];
        const links = input.links.map((link) => ({ businessType: validateEnum(link?.businessType, 'knowledge_business_type', allowedTypes), businessId: validateString(link?.businessId, 'knowledge_business_id', 255) }));
        const unique = new Set(links.map((link) => `${link.businessType}:${link.businessId}`));
        if (unique.size !== links.length) throw httpError('duplicate_knowledge_business_link', 409);
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare('DELETE FROM knowledge_business_link WHERE document_id=?').run(document.id);
          const insert = db.prepare('INSERT INTO knowledge_business_link(id,document_id,business_type,business_id,created_at) VALUES(?,?,?,?,?)');
          const at = nowIso();
          for (const link of links) insert.run(randomUUID(), document.id, link.businessType, link.businessId, at);
          db.exec('COMMIT');
        } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
        audit(actor, 'knowledge.document.links.replace', `KnowledgeDocument:${document.id}`, { linkCount: links.length });
        json(res, 200, { links }); return true;
      }

      const retryMatch = url.pathname.match(/^\/api\/knowledge\/documents\/([^/]+)\/retry$/);
      if (req.method === 'POST' && retryMatch) {
        const { document, collection } = requireWritableDocument(actor, decodeURIComponent(retryMatch[1]));
        const { bytes, version } = verifiedSourceBytes(document);
        const provider = resolveProvider('knowledge.v1.document.ingest', scope);
        if (!provider) throw httpError('knowledge_provider_unavailable', 503);
        const collectionMapping = mappingForBusiness(provider.id, 'KnowledgeCollection', collection.id);
        if (!collectionMapping) throw httpError('knowledge_collection_provider_mapping_missing', 409);
        await cleanRetiredIndexes(document.id, actor, scope);
        const runId = randomUUID(); const at = nowIso();
        db.prepare('INSERT INTO knowledge_ingestion_run(id,document_version_id,provider_id,status,started_at) VALUES(?,?,?,?,?)').run(runId, version.id, provider.id, 'PENDING', at);
        try {
          const existing = mappingForBusiness(provider.id, 'KnowledgeDocument', document.id);
          if (existing) {
            try {
              const status = await invokeProvider(provider, 'knowledge.v1.document.status', actor, scope, { providerCollectionId: collectionMapping.external_id, providerDocumentId: existing.external_id });
              if (status.result?.record?.externalId) {
                const reconciledRecord = normalizeProviderRecord(status.result.record, 'document');
                if (reconciledRecord.externalId !== existing.external_id || reconciledRecord.externalType !== existing.external_type) {
                  replaceMapping(actor, provider, 'KnowledgeDocument', document.id, reconciledRecord.externalType, reconciledRecord.externalId);
                }
              }
              if (status.result?.state === 'READY') {
                updateIngestionState(document.id, version.id, runId, 'READY', status.result?.detail ?? null, true);
                audit(actor, 'knowledge.document.retry_reconciled', `KnowledgeDocument:${document.id}`, { providerId: provider.id });
                json(res, 200, { document: documentView(getDocument(document.id)), ingestionRunId: runId, reconciled: true }); return true;
              }
              if (status.result?.state === 'INDEXING' && (status.result?.record?.externalId || status.result?.qualityFallbackTriggered === true)) {
                updateIngestionState(document.id, version.id, runId, 'INDEXING', status.result?.detail ?? null, false);
                audit(actor, 'knowledge.document.retry_reconciled_indexing', `KnowledgeDocument:${document.id}`, {
                  providerId: provider.id,
                  previousExternalId: existing.external_id,
                  nextExternalId: status.result?.record?.externalId ?? existing.external_id,
                  chunkCount: status.result?.chunkCount ?? null,
                  tokenCount: status.result?.tokenCount ?? null,
                  extractor: status.result?.extraction ?? null,
                });
                json(res, 200, { document: documentView(getDocument(document.id)), ingestionRunId: runId, reconciled: true }); return true;
              }
              await invokeProvider(provider, 'knowledge.v1.document.remove', actor, scope, { providerCollectionId: collectionMapping.external_id, providerDocumentId: existing.external_id });
            } catch (error) {
              if (!String(error.message).match(/404|not_found/u)) throw error;
            }
          }
          const invocation = await invokeProvider(provider, 'knowledge.v1.document.ingest', actor, scope, {
            knowledgeDocumentId: document.id,
            knowledgeDocumentVersionId: version.id,
            providerCollectionId: collectionMapping.external_id,
            title: document.title,
            sourceFilename: version.source_filename ?? document.source_filename ?? `${document.id}.bin`,
            mediaType: version.media_type ?? 'application/octet-stream',
            contentBase64: bytes.toString('base64'),
            checksum: version.content_checksum,
          });
          const record = normalizeProviderRecord(invocation.result?.record, 'document');
          completeIngestion(actor, provider, document.id, version.id, runId, record, invocation.result?.state === 'READY' ? 'READY' : 'INDEXING');
          audit(actor, 'knowledge.document.retry', `KnowledgeDocument:${document.id}`, { providerId: provider.id });
          json(res, 200, { document: documentView(getDocument(document.id)), ingestionRunId: runId }); return true;
        } catch (error) {
          updateIngestionState(document.id, version.id, runId, 'FAILED', error.message, true);
          audit(actor, 'knowledge.document.retry_failed', `KnowledgeDocument:${document.id}`, { providerId: provider.id, error: error.message });
          throw error;
        }
      }

      if (req.method === 'DELETE' && documentMatch) {
        const { document, collection } = requireWritableDocument(actor, decodeURIComponent(documentMatch[1]));
        const provider = resolveProvider('knowledge.v1.document.remove', scope);
        if (!provider) {
          db.prepare("UPDATE knowledge_document SET cleanup_state='FAILED',updated_at=? WHERE id=?").run(nowIso(), document.id);
          throw httpError('knowledge_provider_unavailable', 503);
        }
        const collectionMapping = mappingForBusiness(provider.id, 'KnowledgeCollection', collection.id);
        await cleanRetiredIndexes(document.id, actor, scope);
        const documentMapping = mappingForBusiness(provider.id, 'KnowledgeDocument', document.id);
        if (documentMapping && collectionMapping) {
          try {
            await invokeProvider(provider, 'knowledge.v1.document.remove', actor, scope, { providerCollectionId: collectionMapping.external_id, providerDocumentId: documentMapping.external_id });
          } catch (error) {
            db.prepare("UPDATE knowledge_document SET cleanup_state='FAILED',updated_at=? WHERE id=?").run(nowIso(), document.id);
            audit(actor, 'knowledge.document.archive_failed', `KnowledgeDocument:${document.id}`, { error: error.message });
            throw error;
          }
        }
        const at = nowIso();
        db.prepare("UPDATE knowledge_document SET archived_at=?,ingestion_state='ARCHIVED',cleanup_state=?,updated_at=? WHERE id=?").run(at, documentMapping ? 'CLEAN' : 'NO_MAPPING', at, document.id);
        audit(actor, 'knowledge.document.archive', `KnowledgeDocument:${document.id}`, { providerId: provider.id });
        json(res, 200, { archived: true, document: documentView(getDocument(document.id)) }); return true;
      }

      const statusMatch = url.pathname.match(/^\/api\/knowledge\/documents\/([^/]+)\/status$/);
      if (req.method === 'GET' && statusMatch) {
        const documentId = decodeURIComponent(statusMatch[1]); const { document, collection } = requireReadableDocument(actor, documentId);
        const expectedRun = latestIngestionRun(document.current_version_id);
        if (document.ingestion_state === 'FAILED' && expectedRun?.detail?.startsWith('knowledge_processing_timeout')) {
          json(res, 200, { document: { ...documentView(document), canManage: canWriteCollection(actor, collection) }, providerStatus: { state: 'FAILED', detail: 'PROCESSING_TIMEOUT', chunkCount: null, tokenCount: null } });
          return true;
        }
        const provider = resolveProvider('knowledge.v1.document.status', scope);
        if (!provider) throw httpError('knowledge_provider_unavailable', 503);
        const collectionMapping = mappingForBusiness(provider.id, 'KnowledgeCollection', collection.id);
        const documentMapping = mappingForBusiness(provider.id, 'KnowledgeDocument', document.id);
        if (!collectionMapping || !documentMapping) throw httpError('knowledge_provider_mapping_missing', 409);
        const invocation = await invokeProvider(provider, 'knowledge.v1.document.status', actor, scope, { providerCollectionId: collectionMapping.external_id, providerDocumentId: documentMapping.external_id });
        const current = getDocument(document.id);
        if (!current || current.archived_at) throw httpError('knowledge_document_not_found', 404);
        if (current.current_version_id !== document.current_version_id || current.ingestion_state !== document.ingestion_state
          || latestIngestionRun(document.current_version_id)?.id !== expectedRun?.id) {
          json(res, 200, { document: { ...documentView(current), canManage: canWriteCollection(actor, collection) }, providerStatus: { state: current.ingestion_state, detail: null, chunkCount: null, tokenCount: null } });
          return true;
        }
        if (invocation.result?.record?.externalId) {
          const reconciledRecord = normalizeProviderRecord(invocation.result.record, 'document');
          if (reconciledRecord.externalId !== documentMapping.external_id || reconciledRecord.externalType !== documentMapping.external_type) {
            replaceMapping(actor, provider, 'KnowledgeDocument', document.id, reconciledRecord.externalType, reconciledRecord.externalId);
            audit(actor, 'knowledge.document.provider_mapping_reconciled', `KnowledgeDocument:${document.id}`, {
              providerId: provider.id,
              previousExternalId: documentMapping.external_id,
              nextExternalId: reconciledRecord.externalId,
              extractor: invocation.result?.extraction ?? null,
            });
          }
        }
        const state = ['READY', 'INDEXING', 'FAILED', 'CANCELLED'].includes(invocation.result?.state) ? invocation.result.state : document.ingestion_state;
        const at = nowIso();
        db.prepare('UPDATE knowledge_document SET ingestion_state=?,updated_at=? WHERE id=?').run(state, at, document.id);
        const latestRun = db.prepare('SELECT id FROM knowledge_ingestion_run WHERE document_version_id=? ORDER BY started_at DESC,rowid DESC LIMIT 1').get(document.current_version_id);
        if (latestRun) {
          db.prepare('UPDATE knowledge_ingestion_run SET last_polled_at=?,poll_error_count=0 WHERE id=?').run(at, latestRun.id);
          if (['READY', 'FAILED', 'CANCELLED'].includes(state)) {
            db.prepare('UPDATE knowledge_ingestion_run SET status=?,detail=?,finished_at=? WHERE id=?').run(state, invocation.result?.detail ?? null, at, latestRun.id);
          } else {
            db.prepare('UPDATE knowledge_ingestion_run SET status=?,detail=?,finished_at=NULL WHERE id=?').run(state, invocation.result?.detail ?? null, latestRun.id);
          }
        }
        json(res, 200, {
          document: { ...documentView(getDocument(document.id)), canManage: canWriteCollection(actor, collection) },
          providerStatus: {
            state,
            detail: publicIngestionDetail(invocation.result?.detail),
            chunkCount: invocation.result?.chunkCount ?? null,
            tokenCount: invocation.result?.tokenCount ?? null,
            extraction: publicExtractionStatus(invocation.result?.extraction),
          },
        }); return true;
      }

      if (req.method === 'POST' && url.pathname === '/api/knowledge/search') {
        const input = await readJson(req, 256 * 1024);
        const retrieval = await searchKnowledge(actor, scope, input);
        json(res, 200, { query: retrieval.query, results: retrieval.results }); return true;
      }

      json(res, 404, { error: 'not_found' }); return true;
    } catch (error) {
      const publicError = publicKnowledgeHttpError(error);
      json(res, publicError.status, { error: publicError.error });
      return true;
    } finally { if (mutationKey) documentMutations.delete(mutationKey); }
  };
}
