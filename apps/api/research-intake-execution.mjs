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
const MAX_DRY_RUN_ROWS = 2_000;
const SUPPORTED_SCHEMA = 'EC_TOP500_V46';
const SUPPORTED_SOURCE = 'EC_TOP500_V46_20260915';
const EXECUTION_CONFIRMATION = 'EXECUTE_TOP500_RESEARCH_BATCH';
const STALE_EXECUTION_MS = 15 * 60 * 1000;

const SAFE_SNAPSHOT_FIELDS = new Set([
  'displayName', 'commercialName', 'registrationCountry', 'registrationType', 'registrationId',
  'ownershipType', 'verificationGrade', 'strategicValueScore', 'researchRank', 'website', 'linkedinUrl',
  'industry', 'primaryPhone', 'primaryEmail', 'annualRevenue', 'annualRevenueCurrency', 'employeeCount', 'source',
]);
const RESEARCH_STATE_FIELDS = [
  'registrationCountry', 'registrationType', 'registrationId', 'commercialName', 'ownershipType', 'verificationGrade',
  'strategicValueScore', 'researchRank', 'industry', 'primaryPhone', 'primaryEmail', 'employeeCount', 'source',
];

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
db.exec(`
CREATE TABLE IF NOT EXISTS crm_registration_identity (
  registration_country TEXT NOT NULL,
  registration_type TEXT NOT NULL,
  registration_id TEXT NOT NULL,
  business_id TEXT NOT NULL UNIQUE,
  first_import_batch_id TEXT,
  last_import_batch_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (registration_country, registration_type, registration_id)
) STRICT;
CREATE TABLE IF NOT EXISTS crm_research_import_batch (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  source_name TEXT NOT NULL,
  file_name TEXT,
  source_digest TEXT,
  row_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  actor_subject TEXT NOT NULL,
  actor_username TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  summary_json TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS crm_research_import_item (
  batch_id TEXT NOT NULL REFERENCES crm_research_import_batch(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  registration_country TEXT NOT NULL,
  registration_type TEXT NOT NULL,
  registration_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  research_rank INTEGER,
  match_business_id TEXT,
  proposed_action TEXT NOT NULL,
  reason TEXT,
  snapshot_json TEXT NOT NULL,
  PRIMARY KEY (batch_id, row_number),
  UNIQUE (batch_id, registration_country, registration_type, registration_id)
) STRICT;
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
CREATE TABLE IF NOT EXISTS crm_research_profile_field_audit (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  batch_id TEXT,
  field_key TEXT NOT NULL,
  old_value_json TEXT NOT NULL,
  new_value_json TEXT NOT NULL,
  merge_policy TEXT NOT NULL,
  actor_subject TEXT NOT NULL,
  actor_username TEXT,
  occurred_at TEXT NOT NULL
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
async function readJson(req, maxBytes = 4 * 1024 * 1024) {
  let size = 0;
  const chunks = [];
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
  let headerJson;
  let claims;
  try {
    headerJson = JSON.parse(decodeSegment(encodedHeader).toString('utf8'));
    claims = JSON.parse(decodeSegment(encodedPayload).toString('utf8'));
  } catch {
    throw httpError('invalid_jwt', 401);
  }
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
function requireAdmin(actor) {
  if (!actor.roles.has('substrate-admin')) throw httpError('forbidden', 403);
}
function requiredText(value, label, max = 512) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw httpError(`invalid_${label}`, 400);
  return value.trim();
}
function optionalText(value, label, max = 1024) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) throw httpError(`invalid_${label}`, 400);
  return value.trim();
}
function nullableNumber(value, label, min, max, integer = false) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw httpError(`invalid_${label}`, 400);
  return value;
}
function positiveInteger(value, label, max = 1_000_000) {
  if (!Number.isInteger(value) || value < 1 || value > max) throw httpError(`invalid_${label}`, 400);
  return value;
}
function normalizeCountry(value) {
  const country = requiredText(value, 'registration_country', 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw httpError('invalid_registration_country', 400);
  return country;
}
function normalizeRegistrationType(value) {
  const type = requiredText(value, 'registration_type', 64).toUpperCase();
  if (!/^[A-Z0-9_-]+$/.test(type)) throw httpError('invalid_registration_type', 400);
  return type;
}
function normalizeRegistrationId(value, country, type) {
  const raw = requiredText(value, 'registration_id', 128);
  const normalized = country === 'EC' && type === 'RUC' ? raw.replace(/\.0$/, '').replace(/[^0-9]/g, '') : raw.toUpperCase();
  if (country === 'EC' && type === 'RUC' && !/^\d{13}$/.test(normalized)) throw httpError('invalid_ec_ruc', 400);
  return normalized;
}
function isBlank(value) { return value === undefined || value === null || value === ''; }
function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
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
    signal: AbortSignal.timeout(Math.max(provider.timeout_ms ?? 3000, 15_000)),
  });
  const body = await response.json().catch(() => ({ error: 'invalid_provider_json' }));
  if (!response.ok) throw httpError('provider_unavailable', 503, { providerId: provider.id, upstreamStatus: response.status, upstreamError: body.error ?? null });
  return { requestId, providerId: provider.id, body };
}
function validateSafeSnapshot(input, identity) {
  const source = input === undefined || input === null ? {} : input;
  if (typeof source !== 'object' || Array.isArray(source)) throw httpError('invalid_company_snapshot', 400);
  for (const key of Object.keys(source)) if (!SAFE_SNAPSHOT_FIELDS.has(key)) throw httpError(`unsupported_company_snapshot_field:${key}`, 400);
  const registrationCountry = normalizeCountry(source.registrationCountry ?? identity.registrationCountry);
  const registrationType = normalizeRegistrationType(source.registrationType ?? identity.registrationType);
  const registrationId = normalizeRegistrationId(source.registrationId ?? identity.registrationId, registrationCountry, registrationType);
  if (registrationCountry !== identity.registrationCountry || registrationType !== identity.registrationType || registrationId !== identity.registrationId) {
    throw httpError('company_snapshot_identity_mismatch', 409);
  }
  const researchRank = source.researchRank === undefined || source.researchRank === null
    ? identity.researchRank
    : nullableNumber(source.researchRank, 'company_snapshot_research_rank', 1, 1_000_000, true);
  if (identity.researchRank !== null && researchRank !== identity.researchRank) throw httpError('company_snapshot_rank_mismatch', 409);
  const annualRevenue = nullableNumber(source.annualRevenue, 'company_snapshot_annual_revenue', 0, Number.MAX_SAFE_INTEGER);
  const annualRevenueCurrency = optionalText(source.annualRevenueCurrency, 'company_snapshot_annual_revenue_currency', 3);
  return {
    displayName: requiredText(source.displayName ?? identity.displayName, 'company_snapshot_display_name', 512),
    commercialName: optionalText(source.commercialName, 'company_snapshot_commercial_name', 1024),
    registrationCountry,
    registrationType,
    registrationId,
    ownershipType: optionalText(source.ownershipType, 'company_snapshot_ownership_type', 128),
    verificationGrade: optionalText(source.verificationGrade, 'company_snapshot_verification_grade', 128),
    strategicValueScore: nullableNumber(source.strategicValueScore, 'company_snapshot_strategic_value_score', 0, 100),
    researchRank,
    website: optionalText(source.website, 'company_snapshot_website', 2048),
    linkedinUrl: optionalText(source.linkedinUrl, 'company_snapshot_linkedin_url', 2048),
    industry: optionalText(source.industry, 'company_snapshot_industry', 256),
    primaryPhone: optionalText(source.primaryPhone, 'company_snapshot_primary_phone', 128),
    primaryEmail: optionalText(source.primaryEmail, 'company_snapshot_primary_email', 512),
    annualRevenue,
    annualRevenueCurrency: annualRevenue === null ? null : (annualRevenueCurrency?.toUpperCase() ?? 'USD'),
    employeeCount: nullableNumber(source.employeeCount, 'company_snapshot_employee_count', 0, 10_000_000, true),
    source: optionalText(source.source, 'company_snapshot_source', 256) ?? SUPPORTED_SOURCE,
  };
}
function canonicalAccountExists(businessId) {
  return Boolean(db.prepare("SELECT 1 FROM external_mapping WHERE business_type='Account' AND business_id=? LIMIT 1").get(businessId));
}
function readBusinessState(businessId) {
  const row = db.prepare("SELECT state_json,updated_at FROM crm_business_state WHERE business_type='Account' AND business_id=?").get(businessId);
  if (!row?.state_json) return { state: {}, updatedAt: row?.updated_at ?? null };
  try { return { state: JSON.parse(row.state_json), updatedAt: row.updated_at ?? null }; }
  catch { return { state: {}, updatedAt: row.updated_at ?? null }; }
}
function loadStateIdentityMatches() {
  const matches = new Map();
  const rows = db.prepare("SELECT business_id,state_json FROM crm_business_state WHERE business_type='Account'").all();
  for (const row of rows) {
    let state = {};
    try { state = JSON.parse(row.state_json ?? '{}'); } catch {}
    const country = typeof state.registrationCountry === 'string' ? state.registrationCountry.trim().toUpperCase() : '';
    const type = typeof state.registrationType === 'string' ? state.registrationType.trim().toUpperCase() : '';
    const rawId = typeof state.registrationId === 'string' ? state.registrationId.trim() : '';
    if (!country || !type || !rawId) continue;
    const id = country === 'EC' && type === 'RUC' ? rawId.replace(/\.0$/, '').replace(/[^0-9]/g, '') : rawId.toUpperCase();
    if (!id) continue;
    const key = `${country}\u0000${type}\u0000${id}`;
    const existing = matches.get(key) ?? [];
    existing.push(row.business_id);
    matches.set(key, existing);
  }
  return matches;
}
function loadIdentityRegistry() {
  const registry = new Map();
  for (const row of db.prepare('SELECT registration_country,registration_type,registration_id,business_id FROM crm_registration_identity').all()) {
    registry.set(`${row.registration_country}\u0000${row.registration_type}\u0000${row.registration_id}`, row.business_id);
  }
  return registry;
}
function validateDryRunPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError('invalid_research_intake_payload', 400);
  const schemaVersion = requiredText(input.schemaVersion, 'schema_version', 64);
  if (schemaVersion !== SUPPORTED_SCHEMA) throw httpError('unsupported_research_schema', 400, { expected: SUPPORTED_SCHEMA, received: schemaVersion });
  const sourceName = requiredText(input.sourceName, 'source_name', 256);
  const fileName = optionalText(input.fileName, 'file_name', 512);
  const sourceDigest = optionalText(input.sourceDigest, 'source_digest', 128);
  if (sourceDigest && !/^[a-f0-9]{64}$/i.test(sourceDigest)) throw httpError('invalid_source_digest', 400);
  if (!Array.isArray(input.rows) || input.rows.length < 1 || input.rows.length > MAX_DRY_RUN_ROWS) throw httpError('invalid_research_rows', 400);
  const seenIdentity = new Set();
  const seenRank = new Map();
  const seenRowNumber = new Set();
  const rows = input.rows.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw httpError(`invalid_research_row:${index + 1}`, 400);
    const rowNumber = positiveInteger(row.rowNumber, 'row_number', 2_000_000);
    const displayName = requiredText(row.displayName, 'display_name', 512);
    const registrationCountry = normalizeCountry(row.registrationCountry);
    const registrationType = normalizeRegistrationType(row.registrationType);
    const registrationId = normalizeRegistrationId(row.registrationId, registrationCountry, registrationType);
    const researchRank = row.researchRank === null || row.researchRank === undefined ? null : positiveInteger(row.researchRank, 'research_rank', 1_000_000);
    const key = `${registrationCountry}\u0000${registrationType}\u0000${registrationId}`;
    if (seenIdentity.has(key)) throw httpError('duplicate_registration_identity_in_batch', 409, { rowNumber, registrationCountry, registrationType, registrationId });
    if (seenRowNumber.has(rowNumber)) throw httpError('duplicate_row_number_in_batch', 409, { rowNumber });
    if (researchRank !== null && seenRank.has(researchRank)) throw httpError('duplicate_research_rank_in_batch', 409, { rowNumber, researchRank, firstRowNumber: seenRank.get(researchRank) });
    seenIdentity.add(key);
    seenRowNumber.add(rowNumber);
    if (researchRank !== null) seenRank.set(researchRank, rowNumber);
    const identity = { rowNumber, displayName, registrationCountry, registrationType, registrationId, researchRank };
    return { ...identity, companySnapshot: validateSafeSnapshot(row.companySnapshot, identity) };
  });
  return { schemaVersion, sourceName, fileName, sourceDigest, rows };
}
function createDryRun(actor, payload) {
  const identityRegistry = loadIdentityRegistry();
  const stateMatches = loadStateIdentityMatches();
  const items = [];
  let createCount = 0;
  let updateCount = 0;
  let conflictCount = 0;
  for (const row of payload.rows) {
    const key = `${row.registrationCountry}\u0000${row.registrationType}\u0000${row.registrationId}`;
    const registryBusinessId = identityRegistry.get(key) ?? null;
    const stateBusinessIds = [...new Set(stateMatches.get(key) ?? [])];
    let matchBusinessId = registryBusinessId;
    let proposedAction = 'CREATE';
    let reason = 'registration_identity_not_found';
    if (registryBusinessId && !canonicalAccountExists(registryBusinessId)) {
      proposedAction = 'CONFLICT'; reason = 'identity_registry_points_to_missing_company'; conflictCount += 1;
    } else if (registryBusinessId && stateBusinessIds.some((businessId) => businessId !== registryBusinessId)) {
      proposedAction = 'CONFLICT'; reason = 'identity_registry_conflicts_with_company_state'; conflictCount += 1;
    } else if (stateBusinessIds.length > 1) {
      matchBusinessId = null; proposedAction = 'CONFLICT'; reason = 'multiple_companies_share_registration_identity'; conflictCount += 1;
    } else if (registryBusinessId) {
      proposedAction = 'UPDATE'; reason = 'registration_identity_registry_match'; updateCount += 1;
    } else if (stateBusinessIds.length === 1) {
      matchBusinessId = stateBusinessIds[0];
      if (!canonicalAccountExists(matchBusinessId)) {
        proposedAction = 'CONFLICT'; reason = 'company_state_identity_points_to_missing_company'; conflictCount += 1;
      } else {
        proposedAction = 'UPDATE'; reason = 'company_state_registration_identity_match'; updateCount += 1;
      }
    } else {
      createCount += 1;
    }
    items.push({ ...row, matchBusinessId, proposedAction, reason });
  }
  const batchId = randomUUID();
  const timestamp = nowIso();
  const status = conflictCount > 0 ? 'DRY_RUN_BLOCKED' : 'DRY_RUN_READY';
  const summary = { create: createCount, update: updateCount, conflict: conflictCount, protectedOperationalWriteCount: 0 };
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`INSERT INTO crm_research_import_batch(
      id,schema_version,source_name,file_name,source_digest,row_count,status,actor_subject,actor_username,created_at,updated_at,summary_json
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      batchId, payload.schemaVersion, payload.sourceName, payload.fileName, payload.sourceDigest, payload.rows.length,
      status, actor.subject, actor.username, timestamp, timestamp, JSON.stringify(summary),
    );
    const insertItem = db.prepare(`INSERT INTO crm_research_import_item(
      batch_id,row_number,registration_country,registration_type,registration_id,display_name,research_rank,match_business_id,proposed_action,reason,snapshot_json
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
    for (const item of items) {
      insertItem.run(
        batchId, item.rowNumber, item.registrationCountry, item.registrationType, item.registrationId,
        item.displayName, item.researchRank, item.matchBusinessId, item.proposedAction, item.reason, JSON.stringify(item.companySnapshot),
      );
    }
    recordAudit(actor, 'crm.research_intake.dry_run', `ResearchImportBatch:${batchId}`, { schemaVersion: payload.schemaVersion, rowCount: payload.rows.length, status, summary, safeCompanySnapshot: true });
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
  return { batchId, status, summary, items: items.map(({ companySnapshot: _snapshot, ...item }) => item) };
}
function readSummary(batch) {
  try { return JSON.parse(batch.summary_json ?? '{}'); } catch { return {}; }
}
function reserveBatch(batchId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const batch = db.prepare('SELECT * FROM crm_research_import_batch WHERE id=?').get(batchId);
    if (!batch) throw httpError('research_import_batch_not_found', 404);
    if (batch.status === 'EXECUTED') { db.exec('COMMIT'); return { batch, alreadyExecuted: true }; }
    if (batch.status === 'DRY_RUN_BLOCKED') throw httpError('research_import_batch_blocked', 409);
    if (!['DRY_RUN_READY', 'EXECUTION_FAILED', 'EXECUTING'].includes(batch.status)) throw httpError('research_import_batch_not_executable', 409, { status: batch.status });
    if (batch.status === 'EXECUTING') {
      const age = Date.now() - Date.parse(batch.updated_at);
      if (Number.isFinite(age) && age < STALE_EXECUTION_MS) throw httpError('research_import_batch_execution_in_progress', 409);
    }
    const timestamp = nowIso();
    db.prepare("UPDATE crm_research_import_batch SET status='EXECUTING',updated_at=? WHERE id=?").run(timestamp, batchId);
    db.exec('COMMIT');
    return { batch: { ...batch, status: 'EXECUTING', updated_at: timestamp }, alreadyExecuted: false };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}
function executionItem(batchId, row) {
  const existing = db.prepare('SELECT * FROM crm_research_import_execution_item WHERE batch_id=? AND row_number=?').get(batchId, row.row_number);
  if (existing) return existing;
  const businessId = row.proposed_action === 'UPDATE' ? row.match_business_id : randomUUID();
  if (!businessId) throw httpError('research_import_update_missing_business_id', 409, { rowNumber: row.row_number });
  const timestamp = nowIso();
  db.prepare(`INSERT INTO crm_research_import_execution_item(
    batch_id,row_number,business_id,action,status,attempt_count,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?)`).run(batchId, row.row_number, businessId, row.proposed_action, 'RESERVED', 0, timestamp, timestamp);
  return db.prepare('SELECT * FROM crm_research_import_execution_item WHERE batch_id=? AND row_number=?').get(batchId, row.row_number);
}
function claimIdentity(businessId, row, batchId) {
  const current = readBusinessState(businessId).state;
  const identityParts = [current.registrationCountry, current.registrationType, current.registrationId].filter((value) => !isBlank(value));
  if (identityParts.length > 0) {
    if (current.registrationCountry !== row.registration_country || current.registrationType !== row.registration_type || current.registrationId !== row.registration_id) {
      throw httpError('company_registration_identity_conflict', 409, { businessId });
    }
  }
  const timestamp = nowIso();
  db.exec('BEGIN IMMEDIATE');
  try {
    const owner = db.prepare('SELECT business_id FROM crm_registration_identity WHERE registration_country=? AND registration_type=? AND registration_id=?').get(
      row.registration_country, row.registration_type, row.registration_id,
    );
    if (owner && owner.business_id !== businessId) throw httpError('registration_identity_already_claimed', 409, { businessId: owner.business_id });
    const companyIdentity = db.prepare('SELECT registration_country,registration_type,registration_id FROM crm_registration_identity WHERE business_id=?').get(businessId);
    if (companyIdentity && (companyIdentity.registration_country !== row.registration_country || companyIdentity.registration_type !== row.registration_type || companyIdentity.registration_id !== row.registration_id)) {
      throw httpError('company_registration_identity_already_claimed', 409, { businessId });
    }
    db.prepare(`INSERT INTO crm_registration_identity(
      registration_country,registration_type,registration_id,business_id,first_import_batch_id,last_import_batch_id,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(registration_country,registration_type,registration_id) DO UPDATE SET
      last_import_batch_id=excluded.last_import_batch_id,updated_at=excluded.updated_at`).run(
      row.registration_country, row.registration_type, row.registration_id, businessId, batchId, batchId, timestamp, timestamp,
    );
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
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
  db.prepare('INSERT INTO external_mapping(id,business_type,business_id,provider_id,external_type,external_id,created_at) VALUES(?,?,?,?,?,?,?)').run(
    id, 'Account', businessId, provider.id, record.externalType, record.externalId, nowIso(),
  );
  recordAudit(actor, 'mapping.create', `mapping:${id}`, { businessType: 'Account', businessId, providerId: provider.id, externalType: record.externalType, externalId: record.externalId, source: 'research-import', batchId });
  return { id, business_type: 'Account', business_id: businessId, provider_id: provider.id, external_type: record.externalType, external_id: record.externalId };
}
function nativeFillPatch(snapshot, current, isCreate) {
  const patch = {};
  if (isCreate || isBlank(current?.displayName)) patch.displayName = snapshot.displayName;
  if (!isBlank(snapshot.website) && (isCreate || isBlank(current?.website))) patch.website = snapshot.website;
  if (!isBlank(snapshot.linkedinUrl) && (isCreate || isBlank(current?.linkedinUrl))) patch.linkedinUrl = snapshot.linkedinUrl;
  if (snapshot.annualRevenue !== null && (isCreate || current?.annualRevenue === null || current?.annualRevenue === undefined)) {
    patch.annualRevenue = snapshot.annualRevenue;
    patch.annualRevenueCurrency = snapshot.annualRevenueCurrency ?? 'USD';
  }
  return patch;
}
function writeResearchState(actor, businessId, batchId, snapshot) {
  const currentSnapshot = readBusinessState(businessId);
  const current = currentSnapshot.state;
  const next = { ...current };
  const changed = [];
  for (const key of RESEARCH_STATE_FIELDS) {
    const incoming = snapshot[key];
    if (incoming === undefined || incoming === null || incoming === '') continue;
    if (!isBlank(current[key]) && current[key] !== incoming) continue;
    if (current[key] !== incoming) { next[key] = incoming; changed.push(key); }
  }
  if (changed.length === 0) return { state: current, changedFields: [] };
  const timestamp = nowIso();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`INSERT INTO crm_business_state(business_type,business_id,state_json,updated_at) VALUES('Account',?,?,?)
      ON CONFLICT(business_type,business_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`).run(businessId, JSON.stringify(next), timestamp);
    const audit = db.prepare(`INSERT INTO crm_research_profile_field_audit(
      id,business_id,batch_id,field_key,old_value_json,new_value_json,merge_policy,actor_subject,actor_username,occurred_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?)`);
    for (const field of changed) {
      audit.run(randomUUID(), businessId, batchId, field, JSON.stringify(current[field] ?? null), JSON.stringify(next[field] ?? null), 'RESEARCH_FILL', actor.subject, actor.username, timestamp);
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
  return { state: next, changedFields: changed };
}
async function accountCacheForProvider(cache, provider, actor, scope) {
  if (cache.has(provider.id)) return cache.get(provider.id);
  const invoked = await invokeProvider(provider, 'crm.v1.account.list', actor, scope, { limit: 10_000 });
  const records = Array.isArray(invoked.body?.records) ? invoked.body.records : [];
  const byExternalId = new Map(records.filter((record) => record?.externalId).map((record) => [record.externalId, record]));
  cache.set(provider.id, byExternalId);
  return byExternalId;
}
function markExecutionAttempt(batchId, rowNumber, values) {
  const fields = [];
  const params = [];
  for (const [key, value] of Object.entries(values)) { fields.push(`${key}=?`); params.push(value); }
  fields.push('updated_at=?'); params.push(nowIso()); params.push(batchId, rowNumber);
  db.prepare(`UPDATE crm_research_import_execution_item SET ${fields.join(',')} WHERE batch_id=? AND row_number=?`).run(...params);
}
async function executeRow(actor, scope, batchId, row, cache) {
  const reserved = executionItem(batchId, row);
  if (reserved.status === 'COMPLETE') return { skipped: true, action: reserved.action, businessId: reserved.business_id };
  markExecutionAttempt(batchId, row.row_number, { status: 'RUNNING', attempt_count: reserved.attempt_count + 1, error_code: null });
  const businessId = reserved.business_id;
  claimIdentity(businessId, row, batchId);
  const snapshot = validateSafeSnapshot(JSON.parse(row.snapshot_json), {
    displayName: row.display_name,
    registrationCountry: row.registration_country,
    registrationType: row.registration_type,
    registrationId: row.registration_id,
    researchRank: row.research_rank ?? null,
  });
  let provider;
  let mapping;
  let currentRecord = null;
  const isCreate = row.proposed_action === 'CREATE';
  if (isCreate) {
    provider = resolveProvider('crm.v1.account.create', scope);
    if (!provider) throw httpError('capability_unavailable', 503, { capability: 'crm.v1.account.create' });
    const created = await invokeProvider(provider, 'crm.v1.account.create', actor, scope, { businessId, displayName: snapshot.displayName });
    if (!created.body?.record) throw httpError('provider_record_missing', 502);
    mapping = ensureBusinessMapping(actor, provider, businessId, created.body.record, batchId);
    currentRecord = created.body.record;
    const providerCache = await accountCacheForProvider(cache, provider, actor, scope).catch(() => new Map());
    providerCache.set(mapping.external_id, currentRecord);
  } else {
    const anyMapping = db.prepare("SELECT * FROM external_mapping WHERE business_type='Account' AND business_id=? ORDER BY created_at DESC LIMIT 1").get(businessId);
    if (!anyMapping) throw httpError('operational_mapping_missing:Account', 409, { businessId });
    provider = providerById(anyMapping.provider_id, scope);
    if (!provider) throw httpError('mapped_provider_unavailable', 503, { providerId: anyMapping.provider_id });
    mapping = anyMapping;
    const providerCache = await accountCacheForProvider(cache, provider, actor, scope);
    currentRecord = providerCache.get(mapping.external_id) ?? null;
    if (!currentRecord) throw httpError('mapped_provider_record_missing', 409, { businessId, externalId: mapping.external_id });
  }
  const nativePatch = nativeFillPatch(snapshot, currentRecord, isCreate);
  if (Object.keys(nativePatch).length > 0) {
    const updated = await invokeProvider(provider, 'crm.ops.v1.account.update', actor, scope, { externalId: mapping.external_id, ...nativePatch });
    if (!updated.body?.record) throw httpError('provider_record_missing', 502);
    const providerCache = await accountCacheForProvider(cache, provider, actor, scope).catch(() => new Map());
    providerCache.set(mapping.external_id, updated.body.record);
  }
  const researchState = writeResearchState(actor, businessId, batchId, snapshot);
  markExecutionAttempt(batchId, row.row_number, { status: 'COMPLETE', provider_id: provider.id, external_id: mapping.external_id, error_code: null });
  recordAudit(actor, 'crm.research_intake.execute_item', `Account:${businessId}`, {
    batchId, rowNumber: row.row_number, action: row.proposed_action, providerId: provider.id,
    nativeFields: Object.keys(nativePatch), researchFields: researchState.changedFields, protectedOperationalWriteCount: 0,
  });
  return { skipped: false, action: row.proposed_action, businessId };
}
function finishBatch(actor, batchId, status, executionSummary, errorCode = null) {
  const batch = db.prepare('SELECT summary_json FROM crm_research_import_batch WHERE id=?').get(batchId);
  const summary = { ...(batch ? (() => { try { return JSON.parse(batch.summary_json ?? '{}'); } catch { return {}; } })() : {}), execution: executionSummary };
  db.prepare('UPDATE crm_research_import_batch SET status=?,updated_at=?,summary_json=? WHERE id=?').run(status, nowIso(), JSON.stringify(summary), batchId);
  recordAudit(actor, status === 'EXECUTED' ? 'crm.research_intake.execute' : 'crm.research_intake.execute_failed', `ResearchImportBatch:${batchId}`, { status, execution: executionSummary, errorCode });
}
async function executeBatch(req, actor, batchId, input) {
  if (input?.confirmation !== EXECUTION_CONFIRMATION) throw httpError('research_import_execution_confirmation_required', 400);
  const reservation = reserveBatch(batchId);
  if (reservation.alreadyExecuted) return { batchId, status: 'EXECUTED', summary: readSummary(reservation.batch), idempotent: true };
  const rows = db.prepare('SELECT * FROM crm_research_import_item WHERE batch_id=? ORDER BY row_number').all(batchId);
  if (rows.length !== reservation.batch.row_count) {
    finishBatch(actor, batchId, 'EXECUTION_FAILED', { created: 0, updated: 0, skipped: 0, failed: 1, protectedOperationalWriteCount: 0, completedAt: null }, 'research_import_batch_row_count_mismatch');
    throw httpError('research_import_batch_row_count_mismatch', 409);
  }
  if (rows.some((row) => row.proposed_action === 'CONFLICT')) {
    finishBatch(actor, batchId, 'EXECUTION_FAILED', { created: 0, updated: 0, skipped: 0, failed: 1, protectedOperationalWriteCount: 0, completedAt: null }, 'research_import_batch_contains_conflict');
    throw httpError('research_import_batch_contains_conflict', 409);
  }
  const scope = parseScope(req);
  const cache = new Map();
  const counters = { created: 0, updated: 0, skipped: 0, failed: 0, protectedOperationalWriteCount: 0, completedAt: null };
  for (const row of rows) {
    try {
      const result = await executeRow(actor, scope, batchId, row, cache);
      if (result.skipped) counters.skipped += 1;
      else if (result.action === 'CREATE') counters.created += 1;
      else counters.updated += 1;
    } catch (error) {
      counters.failed += 1;
      const code = error.httpStatus ? error.message : 'internal_error';
      const item = db.prepare('SELECT * FROM crm_research_import_execution_item WHERE batch_id=? AND row_number=?').get(batchId, row.row_number);
      if (item) markExecutionAttempt(batchId, row.row_number, { status: 'FAILED', error_code: code });
      finishBatch(actor, batchId, 'EXECUTION_FAILED', counters, code);
      throw error;
    }
  }
  counters.completedAt = nowIso();
  finishBatch(actor, batchId, 'EXECUTED', counters);
  return { batchId, status: 'EXECUTED', execution: counters, idempotent: false };
}

export function createResearchIntakeExecutionHandler() {
  return async function researchIntakeExecutionHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const isEnhancedDryRun = req.method === 'POST' && url.pathname === '/api/crm-native/research-intake/dry-run';
    const executeMatch = req.method === 'POST' ? url.pathname.match(/^\/api\/crm-native\/research-intake\/batches\/([^/]+)\/execute$/) : null;
    const isOptions = req.method === 'OPTIONS' && (url.pathname === '/api/crm-native/research-intake/dry-run' || /^\/api\/crm-native\/research-intake\/batches\/[^/]+\/execute$/.test(url.pathname));
    if (!isEnhancedDryRun && !executeMatch && !isOptions) return false;
    if (isOptions) { json(res, 204, {}); return true; }
    try {
      const actor = await authenticate(req);
      requireAdmin(actor);
      if (isEnhancedDryRun) {
        const result = createDryRun(actor, validateDryRunPayload(await readJson(req)));
        json(res, 201, result);
        return true;
      }
      const batchId = decodeURIComponent(executeMatch[1]);
      const result = await executeBatch(req, actor, batchId, await readJson(req, 64 * 1024));
      json(res, 200, result);
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
