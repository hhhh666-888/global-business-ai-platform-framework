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
const MAX_DRY_RUN_ROWS = 2_000;
const SUPPORTED_SCHEMA = 'EC_TOP500_V46';

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

CREATE INDEX IF NOT EXISTS idx_crm_research_import_batch_created_at
  ON crm_research_import_batch(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_research_import_item_identity
  ON crm_research_import_item(registration_country, registration_type, registration_id);
`);

function nowIso() { return new Date().toISOString(); }
function responseHeaders(extra = {}) {
  return {
    'cache-control': 'no-store',
    'access-control-allow-origin': CORS_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type, x-gbap-organization, x-gbap-workspace',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
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
async function readJson(req, maxBytes = 2 * 1024 * 1024) {
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
function optionalText(value, label, max = 512) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) throw httpError(`invalid_${label}`, 400);
  return value.trim();
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
function canonicalAccountExists(businessId) {
  return Boolean(db.prepare("SELECT 1 FROM external_mapping WHERE business_type='Account' AND business_id=? LIMIT 1").get(businessId));
}
function parseState(row) {
  try { return JSON.parse(row.state_json ?? '{}'); }
  catch { return {}; }
}
function loadStateIdentityMatches() {
  const matches = new Map();
  const rows = db.prepare("SELECT business_id,state_json FROM crm_business_state WHERE business_type='Account'").all();
  for (const row of rows) {
    const state = parseState(row);
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
function recordAudit(actor, action, target, payload = {}) {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='audit_event'").get();
  if (!exists) return;
  db.prepare('INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)').run(
    randomUUID(), actor.subject, actor.username, action, target, nowIso(), JSON.stringify(payload),
  );
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
    return { rowNumber, displayName, registrationCountry, registrationType, registrationId, researchRank };
  });
  return { schemaVersion, sourceName, fileName, sourceDigest, rows };
}
function projectBatch(row) {
  let summary = {};
  try { summary = JSON.parse(row.summary_json ?? '{}'); } catch {}
  return {
    id: row.id,
    schemaVersion: row.schema_version,
    sourceName: row.source_name,
    fileName: row.file_name ?? null,
    sourceDigest: row.source_digest ?? null,
    rowCount: row.row_count,
    status: row.status,
    actorSubject: row.actor_subject,
    actorUsername: row.actor_username ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    summary,
  };
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
      proposedAction = 'CONFLICT';
      reason = 'identity_registry_points_to_missing_company';
      conflictCount += 1;
    } else if (registryBusinessId && stateBusinessIds.some((businessId) => businessId !== registryBusinessId)) {
      proposedAction = 'CONFLICT';
      reason = 'identity_registry_conflicts_with_company_state';
      conflictCount += 1;
    } else if (stateBusinessIds.length > 1) {
      matchBusinessId = null;
      proposedAction = 'CONFLICT';
      reason = 'multiple_companies_share_registration_identity';
      conflictCount += 1;
    } else if (registryBusinessId) {
      proposedAction = 'UPDATE';
      reason = 'registration_identity_registry_match';
      updateCount += 1;
    } else if (stateBusinessIds.length === 1) {
      matchBusinessId = stateBusinessIds[0];
      if (!canonicalAccountExists(matchBusinessId)) {
        proposedAction = 'CONFLICT';
        reason = 'company_state_identity_points_to_missing_company';
        conflictCount += 1;
      } else {
        proposedAction = 'UPDATE';
        reason = 'company_state_registration_identity_match';
        updateCount += 1;
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
        item.displayName, item.researchRank, item.matchBusinessId, item.proposedAction, item.reason,
        JSON.stringify({ displayName: item.displayName, researchRank: item.researchRank }),
      );
    }
    recordAudit(actor, 'crm.research_intake.dry_run', `ResearchImportBatch:${batchId}`, { schemaVersion: payload.schemaVersion, rowCount: payload.rows.length, status, summary });
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }

  return { batchId, status, summary, items };
}

async function handleDryRun(req, res, actor) {
  const payload = validateDryRunPayload(await readJson(req));
  const result = createDryRun(actor, payload);
  json(res, 201, result);
}
function handleListBatches(req, res, url) {
  const requested = Number(url.searchParams.get('limit') ?? '50');
  const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 200) : 50;
  const rows = db.prepare('SELECT * FROM crm_research_import_batch ORDER BY created_at DESC LIMIT ?').all(limit);
  json(res, 200, { batches: rows.map(projectBatch) });
}
function handleBatchDetail(req, res, batchId) {
  const batch = db.prepare('SELECT * FROM crm_research_import_batch WHERE id=?').get(batchId);
  if (!batch) throw httpError('research_import_batch_not_found', 404);
  const items = db.prepare(`SELECT row_number,registration_country,registration_type,registration_id,display_name,research_rank,match_business_id,proposed_action,reason
    FROM crm_research_import_item WHERE batch_id=? ORDER BY row_number`).all(batchId).map((row) => ({
      rowNumber: row.row_number,
      registrationCountry: row.registration_country,
      registrationType: row.registration_type,
      registrationId: row.registration_id,
      displayName: row.display_name,
      researchRank: row.research_rank ?? null,
      matchBusinessId: row.match_business_id ?? null,
      proposedAction: row.proposed_action,
      reason: row.reason ?? null,
    }));
  json(res, 200, { batch: projectBatch(batch), items });
}

export function createResearchIntakeNativeHandler() {
  return async function researchIntakeNativeHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const isCollection = url.pathname === '/api/crm-native/research-intake/batches';
    const isDryRun = url.pathname === '/api/crm-native/research-intake/dry-run';
    const detailMatch = url.pathname.match(/^\/api\/crm-native\/research-intake\/batches\/([^/]+)$/);
    if (!isCollection && !isDryRun && !detailMatch) return false;
    if (req.method === 'OPTIONS') { json(res, 204, {}); return true; }
    try {
      const actor = await authenticate(req);
      requireAdmin(actor);
      if (isDryRun && req.method === 'POST') { await handleDryRun(req, res, actor); return true; }
      if (isCollection && req.method === 'GET') { handleListBatches(req, res, url); return true; }
      if (detailMatch && req.method === 'GET') { handleBatchDetail(req, res, decodeURIComponent(detailMatch[1])); return true; }
      json(res, 405, { error: 'method_not_allowed' });
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
