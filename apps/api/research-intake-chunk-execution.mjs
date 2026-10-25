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
const EXECUTION_CONFIRMATION = 'EXECUTE_TOP500_RESEARCH_BATCH';
// Research rows perform identity reservation, provider mutation and field audit.
// Keep this bounded more conservatively than ordinary CSV transfer batches while
// preserving the same one-click automatic batching behavior for Super Admin.
const EXECUTION_CHUNK_SIZE = 25;

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
db.exec(`
CREATE TABLE IF NOT EXISTS crm_research_import_execution_item (
  batch_id TEXT NOT NULL REFERENCES crm_research_import_batch(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  business_id TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  provider_id TEXT,
  external_id TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (batch_id, row_number)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_crm_research_import_execution_batch
  ON crm_research_import_execution_item(batch_id, row_number);
`);

function nowIso() { return new Date().toISOString(); }
function responseHeaders(extra = {}) {
  return {
    'cache-control': 'no-store',
    'access-control-allow-origin': CORS_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type, x-gbap-organization, x-gbap-workspace',
    'access-control-allow-methods': 'POST,OPTIONS',
    ...extra,
  };
}
function json(res, status, body) {
  res.writeHead(status, responseHeaders({ 'content-type': 'application/json; charset=utf-8' }));
  res.end(status === 204 ? '' : JSON.stringify(body));
}
function httpError(message, status = 400, detail = null) {
  const error = new Error(message);
  error.httpStatus = status;
  error.detail = detail;
  return error;
}
async function readJson(req, maxBytes = 64 * 1024) {
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
  return { subject: claims.sub, username: claims.preferred_username ?? null, roles: new Set(Array.isArray(claims.realm_access?.roles) ? claims.realm_access.roles : []) };
}
function requireAdmin(actor) {
  if (!actor.roles.has('substrate-admin')) throw httpError('forbidden', 403);
}
function isBlank(value) { return value === undefined || value === null || value === ''; }
function tableExists(name) { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
function recordAudit(actor, action, target, payload = {}) {
  if (!tableExists('audit_event')) return;
  db.prepare('INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)').run(
    randomUUID(), actor.subject, actor.username, action, target, nowIso(), JSON.stringify(payload),
  );
}
function parseScope(req) {
  return {
    environment: SUBSTRATE_ENV,
    organization: req.headers['x-gbap-organization']?.toString() ?? null,
    workspace: req.headers['x-gbap-workspace']?.toString() ?? null,
  };
}
function providerScopeMatches(provider, scope) {
  return provider.enabled === 1
    && provider.environment_scope === scope.environment
    && (provider.organization_scope === null || provider.organization_scope === scope.organization)
    && (provider.workspace_scope === null || provider.workspace_scope === scope.workspace);
}
function resolveProvider(capability, scope) {
  return db.prepare(`
    SELECT p.*, b.capability, b.priority
    FROM capability_binding b
    JOIN provider_registration p ON p.id=b.provider_id
    WHERE b.capability=? AND b.enabled=1 AND p.enabled=1 AND p.environment_scope=?
      AND (p.organization_scope IS NULL OR p.organization_scope=?)
      AND (p.workspace_scope IS NULL OR p.workspace_scope=?)
    ORDER BY CASE WHEN p.workspace_scope IS NULL THEN 0 ELSE 1 END DESC,
      CASE WHEN p.organization_scope IS NULL THEN 0 ELSE 1 END DESC,
      b.priority DESC, p.id ASC LIMIT 1
  `).get(capability, scope.environment, scope.organization, scope.workspace);
}
function providerById(providerId, scope) {
  const provider = db.prepare('SELECT * FROM provider_registration WHERE id=?').get(providerId);
  return provider && providerScopeMatches(provider, scope) ? provider : null;
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
    signal: AbortSignal.timeout(Math.max(provider.timeout_ms ?? 3000, 15_000)),
  });
  const body = await response.json().catch(() => ({ error: 'invalid_provider_json' }));
  if (!response.ok) throw httpError('provider_unavailable', 503, { providerId: provider.id, upstreamStatus: response.status, upstreamError: body.error ?? null });
  return { providerId: provider.id, body };
}
function readBusinessState(businessId) {
  const row = db.prepare("SELECT state_json FROM crm_business_state WHERE business_type='Account' AND business_id=?").get(businessId);
  if (!row?.state_json) return {};
  try { return JSON.parse(row.state_json); } catch { return {}; }
}
function claimIdentity(businessId, row, batchId) {
  const current = readBusinessState(businessId);
  const identityParts = [current.registrationCountry, current.registrationType, current.registrationId].filter((value) => !isBlank(value));
  if (identityParts.length > 0 && (current.registrationCountry !== row.registration_country || current.registrationType !== row.registration_type || current.registrationId !== row.registration_id)) {
    throw httpError('company_registration_identity_conflict', 409, { businessId });
  }
  const timestamp = nowIso();
  db.exec('BEGIN IMMEDIATE');
  try {
    const owner = db.prepare('SELECT business_id FROM crm_registration_identity WHERE registration_country=? AND registration_type=? AND registration_id=?').get(row.registration_country, row.registration_type, row.registration_id);
    if (owner && owner.business_id !== businessId) throw httpError('registration_identity_already_claimed', 409, { businessId: owner.business_id });
    const companyIdentity = db.prepare('SELECT registration_country,registration_type,registration_id FROM crm_registration_identity WHERE business_id=?').get(businessId);
    if (companyIdentity && (companyIdentity.registration_country !== row.registration_country || companyIdentity.registration_type !== row.registration_type || companyIdentity.registration_id !== row.registration_id)) throw httpError('company_registration_identity_already_claimed', 409, { businessId });
    db.prepare(`INSERT INTO crm_registration_identity(
      registration_country,registration_type,registration_id,business_id,first_import_batch_id,last_import_batch_id,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(registration_country,registration_type,registration_id) DO UPDATE SET last_import_batch_id=excluded.last_import_batch_id,updated_at=excluded.updated_at`).run(
      row.registration_country, row.registration_type, row.registration_id, businessId, batchId, batchId, timestamp, timestamp,
    );
    db.exec('COMMIT');
  } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
}
function findBusinessMapping(providerId, businessId) {
  return db.prepare("SELECT * FROM external_mapping WHERE provider_id=? AND business_type='Account' AND business_id=? ORDER BY created_at DESC LIMIT 1").get(providerId, businessId);
}
function ensureBusinessMapping(actor, provider, businessId, record, batchId) {
  if (!record || typeof record.externalId !== 'string' || !record.externalId || typeof record.externalType !== 'string' || !record.externalType) throw httpError('provider_record_missing_external_identity', 502);
  const existing = findBusinessMapping(provider.id, businessId);
  if (existing) {
    if (existing.external_id !== record.externalId || existing.external_type !== record.externalType) throw httpError('business_id_mapping_conflict', 409);
    return existing;
  }
  const externalExisting = db.prepare('SELECT * FROM external_mapping WHERE provider_id=? AND external_type=? AND external_id=? ORDER BY created_at DESC LIMIT 1').get(provider.id, record.externalType, record.externalId);
  if (externalExisting && (externalExisting.business_type !== 'Account' || externalExisting.business_id !== businessId)) throw httpError('external_id_mapping_conflict', 409);
  const id = randomUUID();
  db.prepare('INSERT INTO external_mapping(id,business_type,business_id,provider_id,external_type,external_id,created_at) VALUES(?,?,?,?,?,?,?)').run(id, 'Account', businessId, provider.id, record.externalType, record.externalId, nowIso());
  recordAudit(actor, 'mapping.create', `mapping:${id}`, { businessType: 'Account', businessId, providerId: provider.id, source: 'research-import', batchId });
  return { provider_id: provider.id, external_id: record.externalId, external_type: record.externalType };
}
function parseSnapshot(row) {
  let snapshot;
  try { snapshot = JSON.parse(row.snapshot_json); } catch { throw httpError('research_import_snapshot_invalid', 409, { rowNumber: row.row_number }); }
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw httpError('research_import_snapshot_invalid', 409, { rowNumber: row.row_number });
  if (snapshot.registrationCountry !== row.registration_country || snapshot.registrationType !== row.registration_type || snapshot.registrationId !== row.registration_id) throw httpError('research_import_snapshot_identity_mismatch', 409, { rowNumber: row.row_number });
  return snapshot;
}
function nativeFillPatch(snapshot, current, isCreate) {
  const patch = {};
  if (isCreate || isBlank(current?.displayName)) patch.displayName = snapshot.displayName;
  if (!isBlank(snapshot.website) && (isCreate || isBlank(current?.website))) patch.website = snapshot.website;
  if (!isBlank(snapshot.linkedinUrl) && (isCreate || isBlank(current?.linkedinUrl))) patch.linkedinUrl = snapshot.linkedinUrl;
  if (snapshot.annualRevenue !== null && snapshot.annualRevenue !== undefined && (isCreate || current?.annualRevenue === null || current?.annualRevenue === undefined)) {
    patch.annualRevenue = snapshot.annualRevenue;
    patch.annualRevenueCurrency = snapshot.annualRevenueCurrency ?? 'USD';
  }
  return patch;
}
const RESEARCH_STATE_FIELDS = [
  'registrationCountry', 'registrationType', 'registrationId', 'commercialName', 'ownershipType', 'verificationGrade',
  'strategicValueScore', 'researchRank', 'industry', 'primaryPhone', 'primaryEmail', 'employeeCount', 'source',
  'website', 'linkedinUrl', 'annualRevenue', 'annualRevenueCurrency',
];
function writeResearchState(actor, businessId, batchId, snapshot) {
  const current = readBusinessState(businessId);
  const next = { ...current }; const changed = [];
  for (const key of RESEARCH_STATE_FIELDS) {
    const incoming = snapshot[key];
    if (incoming === undefined || incoming === null || incoming === '') continue;
    if (!isBlank(current[key]) && current[key] !== incoming) continue;
    if (current[key] !== incoming) { next[key] = incoming; changed.push(key); }
  }
  if (changed.length === 0) return [];
  const timestamp = nowIso();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`INSERT INTO crm_business_state(business_type,business_id,state_json,updated_at) VALUES('Account',?,?,?)
      ON CONFLICT(business_type,business_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`).run(businessId, JSON.stringify(next), timestamp);
    const audit = db.prepare(`INSERT INTO crm_research_profile_field_audit(
      id,business_id,batch_id,field_key,old_value_json,new_value_json,merge_policy,actor_subject,actor_username,occurred_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?)`);
    for (const field of changed) audit.run(randomUUID(), businessId, batchId, field, JSON.stringify(current[field] ?? null), JSON.stringify(next[field] ?? null), 'RESEARCH_FILL', actor.subject, actor.username, timestamp);
    db.exec('COMMIT');
  } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
  return changed;
}
function reserveExecutionItem(batchId, row) {
  const existing = db.prepare('SELECT * FROM crm_research_import_execution_item WHERE batch_id=? AND row_number=?').get(batchId, row.row_number);
  if (existing) return existing;
  const businessId = row.proposed_action === 'UPDATE' ? row.match_business_id : randomUUID();
  if (!businessId) throw httpError('research_import_update_missing_business_id', 409, { rowNumber: row.row_number });
  const timestamp = nowIso();
  db.prepare(`INSERT INTO crm_research_import_execution_item(batch_id,row_number,business_id,action,status,attempt_count,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?)`).run(batchId, row.row_number, businessId, row.proposed_action, 'RESERVED', 0, timestamp, timestamp);
  return db.prepare('SELECT * FROM crm_research_import_execution_item WHERE batch_id=? AND row_number=?').get(batchId, row.row_number);
}
function markExecutionItem(batchId, rowNumber, values) {
  const fields = []; const params = [];
  for (const [key, value] of Object.entries(values)) { fields.push(`${key}=?`); params.push(value); }
  fields.push('updated_at=?'); params.push(nowIso(), batchId, rowNumber);
  db.prepare(`UPDATE crm_research_import_execution_item SET ${fields.join(',')} WHERE batch_id=? AND row_number=?`).run(...params);
}
async function providerRecords(provider, actor, scope, cache) {
  if (cache.has(provider.id)) return cache.get(provider.id);
  const listed = await invokeProvider(provider, 'crm.v1.account.list', actor, scope, { limit: 10_000 });
  const records = Array.isArray(listed.body?.records) ? listed.body.records : [];
  const byId = new Map(records.filter((record) => record?.externalId).map((record) => [record.externalId, record]));
  cache.set(provider.id, byId);
  return byId;
}
async function executeRow(actor, scope, batchId, row, cache) {
  const reserved = reserveExecutionItem(batchId, row);
  if (reserved.status === 'COMPLETE') return { skipped: true, action: reserved.action };
  markExecutionItem(batchId, row.row_number, { status: 'RUNNING', attempt_count: reserved.attempt_count + 1, error_code: null });
  const businessId = reserved.business_id;
  claimIdentity(businessId, row, batchId);
  const snapshot = parseSnapshot(row);
  const isCreate = row.proposed_action === 'CREATE';
  let provider = null; let mapping; let currentRecord = null;
  if (isCreate) {
    provider = resolveProvider('crm.v1.account.create', scope);
    if (!provider) throw httpError('capability_unavailable', 503, { capability: 'crm.v1.account.create' });
    const created = await invokeProvider(provider, 'crm.v1.account.create', actor, scope, { businessId, displayName: snapshot.displayName });
    if (!created.body?.record) throw httpError('provider_record_missing', 502);
    mapping = ensureBusinessMapping(actor, provider, businessId, created.body.record, batchId);
    currentRecord = created.body.record;
    const records = await providerRecords(provider, actor, scope, cache).catch(() => new Map());
    records.set(mapping.external_id, currentRecord);
  } else {
    const existingMapping = db.prepare("SELECT * FROM external_mapping WHERE business_type='Account' AND business_id=? ORDER BY created_at DESC LIMIT 1").get(businessId);
    if (!existingMapping) throw httpError('operational_mapping_missing:Account', 409, { businessId });
    mapping = existingMapping;
    provider = providerById(existingMapping.provider_id, scope);
  }

  // The GBAP research state is the authoritative import result for the frozen
  // TOP500 fields. Persist it immediately after canonical account identity exists.
  // Optional provider-native website/LinkedIn/revenue synchronization must never
  // leave a company with only its name when the research snapshot was valid.
  const researchFields = writeResearchState(actor, businessId, batchId, snapshot);
  let nativeFields = [];
  let nativeSyncWarning = null;
  if (!provider) {
    nativeSyncWarning = 'mapped_provider_unavailable';
  } else {
    try {
      if (!currentRecord) {
        const records = await providerRecords(provider, actor, scope, cache);
        currentRecord = records.get(mapping.external_id) ?? null;
        if (!currentRecord) throw httpError('mapped_provider_record_missing', 409, { businessId, externalId: mapping.external_id });
      }
      const nativePatch = nativeFillPatch(snapshot, currentRecord, isCreate);
      nativeFields = Object.keys(nativePatch);
      if (nativeFields.length > 0) {
        const updated = await invokeProvider(provider, 'crm.ops.v1.account.update', actor, scope, { externalId: mapping.external_id, ...nativePatch });
        if (!updated.body?.record) throw httpError('provider_record_missing', 502);
        const records = await providerRecords(provider, actor, scope, cache).catch(() => new Map());
        records.set(mapping.external_id, updated.body.record);
      }
    } catch (error) {
      nativeSyncWarning = error.httpStatus ? error.message : 'internal_error';
      recordAudit(actor, 'crm.research_intake.native_sync_deferred', `Account:${businessId}`, {
        batchId,
        rowNumber: row.row_number,
        providerId: provider.id,
        errorCode: nativeSyncWarning,
        nativeFields,
      });
    }
  }

  const providerId = provider?.id ?? mapping.provider_id;
  markExecutionItem(batchId, row.row_number, { status: 'COMPLETE', provider_id: providerId, external_id: mapping.external_id, error_code: null });
  recordAudit(actor, 'crm.research_intake.execute_item', `Account:${businessId}`, {
    batchId,
    rowNumber: row.row_number,
    action: row.proposed_action,
    providerId,
    nativeFields,
    nativeSyncWarning,
    researchFields,
    protectedOperationalWriteCount: 0,
  });
  return { skipped: false, action: row.proposed_action };
}
function reserveChunk(batchId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const batch = db.prepare('SELECT * FROM crm_research_import_batch WHERE id=?').get(batchId);
    if (!batch) throw httpError('research_import_batch_not_found', 404);
    if (batch.status === 'EXECUTED') { db.exec('COMMIT'); return { batch, done: true }; }
    if (batch.status === 'DRY_RUN_BLOCKED') throw httpError('research_import_batch_blocked', 409);
    if (!['DRY_RUN_READY', 'EXECUTION_CONTINUE', 'EXECUTION_FAILED'].includes(batch.status)) throw httpError('research_import_batch_execution_in_progress', 409, { status: batch.status });
    db.prepare("UPDATE crm_research_import_batch SET status='EXECUTING',updated_at=? WHERE id=?").run(nowIso(), batchId);
    db.exec('COMMIT');
    return { batch, done: false };
  } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
}
function executionSummary(batchId) {
  const rows = db.prepare('SELECT action,status FROM crm_research_import_execution_item WHERE batch_id=?').all(batchId);
  const summary = { created: 0, updated: 0, skipped: 0, failed: 0, protectedOperationalWriteCount: 0, completedAt: null };
  for (const row of rows) {
    if (row.status === 'COMPLETE' && row.action === 'CREATE') summary.created += 1;
    else if (row.status === 'COMPLETE' && row.action === 'UPDATE') summary.updated += 1;
    else if (row.status === 'FAILED') summary.failed += 1;
  }
  return summary;
}
function updateBatchStatus(actor, batchId, status, summary, errorCode = null) {
  const batch = db.prepare('SELECT summary_json FROM crm_research_import_batch WHERE id=?').get(batchId);
  let existing = {};
  try { existing = JSON.parse(batch?.summary_json ?? '{}'); } catch {}
  const merged = { ...existing, execution: summary };
  db.prepare('UPDATE crm_research_import_batch SET status=?,updated_at=?,summary_json=? WHERE id=?').run(status, nowIso(), JSON.stringify(merged), batchId);
  if (status === 'EXECUTED' || status === 'EXECUTION_FAILED') recordAudit(actor, status === 'EXECUTED' ? 'crm.research_intake.execute' : 'crm.research_intake.execute_failed', `ResearchImportBatch:${batchId}`, { status, execution: summary, errorCode });
}
async function executeChunk(req, actor, batchId, input) {
  if (input?.confirmation !== EXECUTION_CONFIRMATION) throw httpError('research_import_execution_confirmation_required', 400);
  const reservation = reserveChunk(batchId);
  if (reservation.done) {
    const summary = executionSummary(batchId); summary.completedAt = reservation.batch.updated_at ?? null;
    return { batchId, status: 'EXECUTED', execution: summary, remaining: 0, hasMore: false, idempotent: true };
  }
  const totalRows = Number(reservation.batch.row_count ?? 0);
  const actualRows = Number(db.prepare('SELECT COUNT(*) AS count FROM crm_research_import_item WHERE batch_id=?').get(batchId)?.count ?? 0);
  if (actualRows !== totalRows) {
    const summary = executionSummary(batchId); summary.failed += 1;
    updateBatchStatus(actor, batchId, 'EXECUTION_FAILED', summary, 'research_import_batch_row_count_mismatch');
    throw httpError('research_import_batch_row_count_mismatch', 409);
  }
  const conflicts = Number(db.prepare("SELECT COUNT(*) AS count FROM crm_research_import_item WHERE batch_id=? AND proposed_action='CONFLICT'").get(batchId)?.count ?? 0);
  if (conflicts > 0) {
    const summary = executionSummary(batchId); summary.failed += 1;
    updateBatchStatus(actor, batchId, 'EXECUTION_FAILED', summary, 'research_import_batch_contains_conflict');
    throw httpError('research_import_batch_contains_conflict', 409);
  }
  const rows = db.prepare(`
    SELECT i.* FROM crm_research_import_item i
    LEFT JOIN crm_research_import_execution_item e ON e.batch_id=i.batch_id AND e.row_number=i.row_number
    WHERE i.batch_id=? AND (e.status IS NULL OR e.status <> 'COMPLETE')
    ORDER BY i.row_number LIMIT ?
  `).all(batchId, EXECUTION_CHUNK_SIZE);
  const scope = parseScope(req); const cache = new Map();
  for (const row of rows) {
    try { await executeRow(actor, scope, batchId, row, cache); }
    catch (error) {
      const item = db.prepare('SELECT * FROM crm_research_import_execution_item WHERE batch_id=? AND row_number=?').get(batchId, row.row_number);
      const code = error.httpStatus ? error.message : 'internal_error';
      if (item) markExecutionItem(batchId, row.row_number, { status: 'FAILED', error_code: code });
      const summary = executionSummary(batchId);
      updateBatchStatus(actor, batchId, 'EXECUTION_FAILED', summary, code);
      throw error;
    }
  }
  const completed = Number(db.prepare("SELECT COUNT(*) AS count FROM crm_research_import_execution_item WHERE batch_id=? AND status='COMPLETE'").get(batchId)?.count ?? 0);
  const remaining = Math.max(0, totalRows - completed);
  const summary = executionSummary(batchId);
  if (remaining === 0) {
    summary.completedAt = nowIso();
    updateBatchStatus(actor, batchId, 'EXECUTED', summary);
    return { batchId, status: 'EXECUTED', execution: summary, remaining: 0, hasMore: false, idempotent: false };
  }
  updateBatchStatus(actor, batchId, 'EXECUTION_CONTINUE', summary);
  return { batchId, status: 'EXECUTION_CONTINUE', execution: summary, remaining, hasMore: true, idempotent: false, chunkSize: EXECUTION_CHUNK_SIZE };
}

export function createResearchIntakeChunkExecutionHandler() {
  return async function researchIntakeChunkExecutionHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const executeMatch = req.method === 'POST' ? url.pathname.match(/^\/api\/crm-native\/research-intake\/batches\/([^/]+)\/execute$/) : null;
    const isOptions = req.method === 'OPTIONS' && /^\/api\/crm-native\/research-intake\/batches\/[^/]+\/execute$/.test(url.pathname);
    if (!executeMatch && !isOptions) return false;
    if (isOptions) { json(res, 204, {}); return true; }
    try {
      const actor = await authenticate(req); requireAdmin(actor);
      const result = await executeChunk(req, actor, decodeURIComponent(executeMatch[1]), await readJson(req));
      json(res, 200, result); return true;
    } catch (error) {
      json(res, error.httpStatus ?? 500, { error: error.httpStatus ? error.message : 'internal_error', ...(error.detail ? { detail: error.detail } : {}) });
      return true;
    }
  };
}
