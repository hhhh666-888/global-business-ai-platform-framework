import { getCachedJwk } from './jwks-cache.mjs';
import { createHash, createPublicKey, randomUUID, verify as verifySignature } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const DB_PATH = process.env.DB_PATH ?? '/data/substrate.db';
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:8080';
const OIDC_ISSUER = process.env.OIDC_ISSUER ?? 'http://localhost:8082/realms/gbap';
const OIDC_ALLOWED_ISSUERS = new Set((process.env.OIDC_ALLOWED_ISSUERS ?? OIDC_ISSUER).split(',').map((value) => value.trim()).filter(Boolean));
const OIDC_JWKS_URL_INTERNAL = process.env.OIDC_JWKS_URL_INTERNAL ?? 'http://keycloak:8080/realms/gbap/protocol/openid-connect/certs';
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID ?? 'gbap-web';
const SITE_EXECUTION_CONFIRMATION = 'EXECUTE_TOP500_RESEARCH_SITES';
const SITE_CHUNK_SIZE = 60;
const SUPPORTED_SOURCE = 'EC_TOP500_V46_20260915';

const SITE_SNAPSHOT_FIELDS = new Set([
  'province', 'city', 'address', 'googleMapsUrl', 'reportedSiteCount', 'operatingProfile',
  'processOperatingCharacteristics', 'keyEquipmentText', 'estimatedEnergyGrade',
  'estimatedPeakDemandKw', 'estimatedMonthlyConsumptionKwh', 'energyPainPoints',
  'existingGeneratorBackup', 'existingSolarStorage', 'roofSiteConditions', 'source',
]);
const SITE_AUTHORITATIVE_FIELDS = [
  'province', 'city', 'address', 'googleMapsUrl', 'reportedSiteCount', 'operatingProfile',
  'processOperatingCharacteristics', 'keyEquipmentText', 'estimatedEnergyGrade',
  'estimatedPeakDemandKw', 'estimatedMonthlyConsumptionKwh', 'energyPainPoints',
  'existingGeneratorBackup', 'existingSolarStorage', 'roofSiteConditions', 'source',
];

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
db.exec(`
CREATE TABLE IF NOT EXISTS crm_site (
  business_id TEXT PRIMARY KEY,
  account_business_id TEXT NOT NULL,
  site_key TEXT NOT NULL,
  state_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(account_business_id, site_key)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_crm_site_account ON crm_site(account_business_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS crm_research_site_snapshot (
  batch_id TEXT NOT NULL REFERENCES crm_research_import_batch(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (batch_id, row_number)
) STRICT;

CREATE TABLE IF NOT EXISTS crm_research_site_execution_item (
  batch_id TEXT NOT NULL REFERENCES crm_research_import_batch(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  site_business_id TEXT,
  site_key TEXT,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (batch_id, row_number)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_crm_research_site_execution_batch
  ON crm_research_site_execution_item(batch_id, row_number);
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
  let size = 0; const chunks = [];
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
function tableExists(name) { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
function recordAudit(actor, action, target, payload = {}) {
  if (!tableExists('audit_event')) return;
  db.prepare('INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)').run(
    randomUUID(), actor.subject, actor.username, action, target, nowIso(), JSON.stringify(payload),
  );
}
function optionalText(value, label, max = 20_000) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) throw httpError(`invalid_${label}`, 400);
  return value.trim() || null;
}
function optionalTextOrNumber(value, label, max = 20_000) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw httpError(`invalid_${label}`, 400);
    return value;
  }
  if (typeof value !== 'string' || value.length > max) throw httpError(`invalid_${label}`, 400);
  return value.trim() || null;
}
function positiveInteger(value, label, max = 2_000_000) {
  if (!Number.isInteger(value) || value < 1 || value > max) throw httpError(`invalid_${label}`, 400);
  return value;
}
function validateSiteSnapshot(input) {
  const source = input === undefined || input === null ? {} : input;
  if (typeof source !== 'object' || Array.isArray(source)) throw httpError('invalid_site_snapshot', 400);
  for (const key of Object.keys(source)) if (!SITE_SNAPSHOT_FIELDS.has(key)) throw httpError(`unsupported_site_snapshot_field:${key}`, 400);
  return {
    province: optionalText(source.province, 'site_snapshot_province', 256),
    city: optionalText(source.city, 'site_snapshot_city', 256),
    address: optionalText(source.address, 'site_snapshot_address', 2048),
    googleMapsUrl: optionalText(source.googleMapsUrl, 'site_snapshot_google_maps_url', 2048),
    reportedSiteCount: optionalTextOrNumber(source.reportedSiteCount, 'site_snapshot_reported_site_count', 2048),
    operatingProfile: optionalText(source.operatingProfile, 'site_snapshot_operating_profile', 2048),
    processOperatingCharacteristics: optionalText(source.processOperatingCharacteristics, 'site_snapshot_process_operating_characteristics'),
    keyEquipmentText: optionalText(source.keyEquipmentText, 'site_snapshot_key_equipment_text'),
    estimatedEnergyGrade: optionalText(source.estimatedEnergyGrade, 'site_snapshot_estimated_energy_grade', 256),
    estimatedPeakDemandKw: optionalTextOrNumber(source.estimatedPeakDemandKw, 'site_snapshot_estimated_peak_demand_kw', 2048),
    estimatedMonthlyConsumptionKwh: optionalTextOrNumber(source.estimatedMonthlyConsumptionKwh, 'site_snapshot_estimated_monthly_consumption_kwh', 2048),
    energyPainPoints: optionalText(source.energyPainPoints, 'site_snapshot_energy_pain_points'),
    existingGeneratorBackup: optionalText(source.existingGeneratorBackup, 'site_snapshot_existing_generator_backup'),
    existingSolarStorage: optionalText(source.existingSolarStorage, 'site_snapshot_existing_solar_storage'),
    roofSiteConditions: optionalText(source.roofSiteConditions, 'site_snapshot_roof_site_conditions'),
    source: optionalText(source.source, 'site_snapshot_source', 256) ?? SUPPORTED_SOURCE,
  };
}
function parseSummary(row) {
  try { return JSON.parse(row?.summary_json ?? '{}'); } catch { return {}; }
}
function compact(value) { return String(value ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' '); }
function deriveResearchSiteKey(snapshot) {
  const map = compact(snapshot.googleMapsUrl).replace(/\/$/, '');
  if (map) return `MAP:${createHash('sha256').update(map).digest('hex').slice(0, 32)}`;
  const address = compact(snapshot.address);
  if (!address) return null;
  const identity = [compact(snapshot.province), compact(snapshot.city), address].filter(Boolean).join('|');
  return `ADDR:${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`;
}
function parseState(row) {
  try { return JSON.parse(row?.state_json ?? '{}'); } catch { return {}; }
}
function sameValue(a, b) { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); }
function synchronizeResearchSiteState(current, snapshot, displayName) {
  const next = { ...current };
  const changed = [];
  if (!next.siteName) { next.siteName = `${displayName} 主要工厂/运营场址`; changed.push('siteName'); }
  for (const field of SITE_AUTHORITATIVE_FIELDS) {
    const incoming = snapshot[field] ?? null;
    if (sameValue(current[field], incoming)) continue;
    next[field] = incoming;
    changed.push(field);
  }
  return { next, changed };
}
function attachSiteSnapshots(actor, batchId, input) {
  const batch = db.prepare('SELECT * FROM crm_research_import_batch WHERE id=?').get(batchId);
  if (!batch) throw httpError('research_import_batch_not_found', 404);
  if (!['DRY_RUN_READY', 'DRY_RUN_BLOCKED'].includes(batch.status)) throw httpError('research_site_snapshot_batch_not_attachable', 409, { status: batch.status });
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.sites)) throw httpError('invalid_site_snapshot_payload', 400);
  if (input.sites.length !== batch.row_count) throw httpError('site_snapshot_row_count_mismatch', 409, { expected: batch.row_count, received: input.sites.length });
  const expectedRows = new Set(db.prepare('SELECT row_number FROM crm_research_import_item WHERE batch_id=?').all(batchId).map((row) => row.row_number));
  const seen = new Set();
  const sites = input.sites.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw httpError('invalid_site_snapshot_item', 400);
    const rowNumber = positiveInteger(item.rowNumber, 'site_snapshot_row_number');
    if (!expectedRows.has(rowNumber)) throw httpError('site_snapshot_unknown_row', 409, { rowNumber });
    if (seen.has(rowNumber)) throw httpError('duplicate_site_snapshot_row', 409, { rowNumber });
    seen.add(rowNumber);
    return { rowNumber, snapshot: validateSiteSnapshot(item.siteSnapshot) };
  });
  const timestamp = nowIso();
  db.exec('BEGIN IMMEDIATE');
  try {
    const upsert = db.prepare(`INSERT INTO crm_research_site_snapshot(batch_id,row_number,snapshot_json,created_at,updated_at)
      VALUES(?,?,?,?,?) ON CONFLICT(batch_id,row_number) DO UPDATE SET snapshot_json=excluded.snapshot_json,updated_at=excluded.updated_at`);
    let identified = 0;
    for (const item of sites) {
      if (deriveResearchSiteKey(item.snapshot)) identified += 1;
      upsert.run(batchId, item.rowNumber, JSON.stringify(item.snapshot), timestamp, timestamp);
    }
    const summary = { ...parseSummary(batch), siteSnapshotCount: sites.length, siteIdentifiedCount: identified };
    db.prepare('UPDATE crm_research_import_batch SET summary_json=?,updated_at=? WHERE id=?').run(JSON.stringify(summary), timestamp, batchId);
    recordAudit(actor, 'crm.research_intake.site_snapshot.attach', `ResearchImportBatch:${batchId}`, { rowCount: sites.length, identifiedCount: identified });
    db.exec('COMMIT');
    return { batchId, rowCount: sites.length, identifiedCount: identified };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}
function markExecution(batchId, rowNumber, values) {
  const fields = []; const params = [];
  for (const [key, value] of Object.entries(values)) { fields.push(`${key}=?`); params.push(value); }
  fields.push('updated_at=?'); params.push(nowIso(), batchId, rowNumber);
  db.prepare(`UPDATE crm_research_site_execution_item SET ${fields.join(',')} WHERE batch_id=? AND row_number=?`).run(...params);
}
function reserveExecution(batchId, rowNumber) {
  const existing = db.prepare('SELECT * FROM crm_research_site_execution_item WHERE batch_id=? AND row_number=?').get(batchId, rowNumber);
  if (existing) return existing;
  const timestamp = nowIso();
  db.prepare(`INSERT INTO crm_research_site_execution_item(batch_id,row_number,action,status,attempt_count,created_at,updated_at)
    VALUES(?,?,'PENDING','RESERVED',0,?,?)`).run(batchId, rowNumber, timestamp, timestamp);
  return db.prepare('SELECT * FROM crm_research_site_execution_item WHERE batch_id=? AND row_number=?').get(batchId, rowNumber);
}
function siteExecutionSummary(batchId, totalRows) {
  const rows = db.prepare('SELECT action,status FROM crm_research_site_execution_item WHERE batch_id=?').all(batchId);
  const summary = { created: 0, updated: 0, unchanged: 0, skippedNoIdentity: 0, failed: 0, completedAt: null };
  let done = 0;
  for (const row of rows) {
    if (row.status === 'COMPLETE') {
      done += 1;
      if (row.action === 'CREATE') summary.created += 1;
      else if (row.action === 'UPDATE') summary.updated += 1;
      else summary.unchanged += 1;
    } else if (row.status === 'SKIPPED') {
      done += 1; summary.skippedNoIdentity += 1;
    } else if (row.status === 'FAILED') summary.failed += 1;
  }
  return { summary, remaining: Math.max(0, totalRows - done) };
}
function updateBatchSiteSummary(batchId, execution) {
  const batch = db.prepare('SELECT summary_json FROM crm_research_import_batch WHERE id=?').get(batchId);
  const summary = { ...parseSummary(batch), siteExecution: execution };
  db.prepare('UPDATE crm_research_import_batch SET summary_json=?,updated_at=? WHERE id=?').run(JSON.stringify(summary), nowIso(), batchId);
}
function executeSiteRow(actor, batchId, row) {
  const journal = reserveExecution(batchId, row.row_number);
  if (journal.status === 'COMPLETE' || journal.status === 'SKIPPED') return;
  markExecution(batchId, row.row_number, { status: 'RUNNING', attempt_count: journal.attempt_count + 1, error_code: null });
  const snapshot = validateSiteSnapshot(JSON.parse(row.snapshot_json));
  const siteKey = deriveResearchSiteKey(snapshot);
  if (!siteKey) {
    markExecution(batchId, row.row_number, { status: 'SKIPPED', action: 'NO_SITE_IDENTITY', site_key: null, site_business_id: null, error_code: null });
    recordAudit(actor, 'crm.research_intake.site_execute_item', `Account:${row.account_business_id}`, { batchId, rowNumber: row.row_number, action: 'SKIP_NO_SITE_IDENTITY' });
    return;
  }
  if (!row.account_business_id) throw httpError('research_site_company_execution_missing', 409, { rowNumber: row.row_number });
  const existing = db.prepare('SELECT * FROM crm_site WHERE account_business_id=? AND site_key=?').get(row.account_business_id, siteKey);
  if (existing) {
    const current = parseState(existing);
    const { next, changed } = synchronizeResearchSiteState(current, snapshot, row.display_name);
    if (changed.length > 0) {
      db.prepare('UPDATE crm_site SET state_json=?,updated_at=? WHERE business_id=?').run(JSON.stringify(next), nowIso(), existing.business_id);
      markExecution(batchId, row.row_number, { status: 'COMPLETE', action: 'UPDATE', site_key: siteKey, site_business_id: existing.business_id, error_code: null });
      recordAudit(actor, 'crm.research_intake.site_execute_item', `Site:${existing.business_id}`, { batchId, rowNumber: row.row_number, action: 'UPDATE', fields: changed, mergePolicy: 'CSV_AUTHORITATIVE_OVERWRITE' });
    } else {
      markExecution(batchId, row.row_number, { status: 'COMPLETE', action: 'NO_CHANGE', site_key: siteKey, site_business_id: existing.business_id, error_code: null });
      recordAudit(actor, 'crm.research_intake.site_execute_item', `Site:${existing.business_id}`, { batchId, rowNumber: row.row_number, action: 'NO_CHANGE' });
    }
    return;
  }
  const businessId = randomUUID();
  const { next, changed } = synchronizeResearchSiteState({}, snapshot, row.display_name);
  const timestamp = nowIso();
  db.prepare('INSERT INTO crm_site(business_id,account_business_id,site_key,state_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(
    businessId, row.account_business_id, siteKey, JSON.stringify(next), actor.subject, timestamp, timestamp,
  );
  markExecution(batchId, row.row_number, { status: 'COMPLETE', action: 'CREATE', site_key: siteKey, site_business_id: businessId, error_code: null });
  recordAudit(actor, 'crm.research_intake.site_execute_item', `Site:${businessId}`, { batchId, rowNumber: row.row_number, action: 'CREATE', fields: changed, mergePolicy: 'CSV_AUTHORITATIVE_OVERWRITE' });
}
function executeSites(actor, batchId, input) {
  if (input?.confirmation !== SITE_EXECUTION_CONFIRMATION) throw httpError('research_site_execution_confirmation_required', 400);
  const batch = db.prepare('SELECT * FROM crm_research_import_batch WHERE id=?').get(batchId);
  if (!batch) throw httpError('research_import_batch_not_found', 404);
  if (batch.status !== 'EXECUTED') throw httpError('research_site_requires_completed_company_execution', 409, { status: batch.status });
  const snapshotCount = Number(db.prepare('SELECT COUNT(*) AS count FROM crm_research_site_snapshot WHERE batch_id=?').get(batchId)?.count ?? 0);
  if (snapshotCount !== batch.row_count) throw httpError('research_site_snapshot_incomplete', 409, { expected: batch.row_count, actual: snapshotCount });
  const companyComplete = Number(db.prepare("SELECT COUNT(*) AS count FROM crm_research_import_execution_item WHERE batch_id=? AND status='COMPLETE'").get(batchId)?.count ?? 0);
  if (companyComplete !== batch.row_count) throw httpError('research_site_company_execution_incomplete', 409, { expected: batch.row_count, actual: companyComplete });

  const before = siteExecutionSummary(batchId, batch.row_count);
  if (before.remaining === 0) {
    before.summary.completedAt = parseSummary(batch)?.siteExecution?.completedAt ?? batch.updated_at ?? null;
    return { batchId, status: 'SITE_EXECUTED', siteExecution: before.summary, remaining: 0, hasMore: false, idempotent: true };
  }

  const rows = db.prepare(`
    SELECT s.row_number,s.snapshot_json,i.display_name,e.business_id AS account_business_id
    FROM crm_research_site_snapshot s
    JOIN crm_research_import_item i ON i.batch_id=s.batch_id AND i.row_number=s.row_number
    JOIN crm_research_import_execution_item e ON e.batch_id=s.batch_id AND e.row_number=s.row_number AND e.status='COMPLETE'
    LEFT JOIN crm_research_site_execution_item x ON x.batch_id=s.batch_id AND x.row_number=s.row_number
    WHERE s.batch_id=? AND (x.status IS NULL OR x.status NOT IN ('COMPLETE','SKIPPED'))
    ORDER BY s.row_number LIMIT ?
  `).all(batchId, SITE_CHUNK_SIZE);

  for (const row of rows) {
    try { executeSiteRow(actor, batchId, row); }
    catch (error) {
      const journal = db.prepare('SELECT 1 FROM crm_research_site_execution_item WHERE batch_id=? AND row_number=?').get(batchId, row.row_number);
      if (journal) markExecution(batchId, row.row_number, { status: 'FAILED', error_code: error.httpStatus ? error.message : 'internal_error' });
      const failed = siteExecutionSummary(batchId, batch.row_count);
      updateBatchSiteSummary(batchId, failed.summary);
      throw error;
    }
  }

  const after = siteExecutionSummary(batchId, batch.row_count);
  if (after.remaining === 0) after.summary.completedAt = nowIso();
  updateBatchSiteSummary(batchId, after.summary);
  const status = after.remaining === 0 ? 'SITE_EXECUTED' : 'SITE_EXECUTION_CONTINUE';
  if (after.remaining === 0) recordAudit(actor, 'crm.research_intake.site_execute', `ResearchImportBatch:${batchId}`, { status, siteExecution: after.summary });
  return { batchId, status, siteExecution: after.summary, remaining: after.remaining, hasMore: after.remaining > 0, idempotent: false, chunkSize: SITE_CHUNK_SIZE };
}

export function createResearchSiteExecutionHandler() {
  return async function researchSiteExecutionHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const attachMatch = req.method === 'POST' ? url.pathname.match(/^\/api\/crm-native\/research-intake\/batches\/([^/]+)\/site-snapshots$/) : null;
    const executeMatch = req.method === 'POST' ? url.pathname.match(/^\/api\/crm-native\/research-intake\/batches\/([^/]+)\/execute-sites$/) : null;
    const isOptions = req.method === 'OPTIONS' && /^\/api\/crm-native\/research-intake\/batches\/[^/]+\/(site-snapshots|execute-sites)$/.test(url.pathname);
    if (!attachMatch && !executeMatch && !isOptions) return false;
    if (isOptions) { json(res, 204, {}); return true; }
    try {
      const actor = await authenticate(req); requireAdmin(actor);
      if (attachMatch) {
        json(res, 200, attachSiteSnapshots(actor, decodeURIComponent(attachMatch[1]), await readJson(req)));
        return true;
      }
      json(res, 200, executeSites(actor, decodeURIComponent(executeMatch[1]), await readJson(req, 64 * 1024)));
      return true;
    } catch (error) {
      json(res, error.httpStatus ?? 500, { error: error.httpStatus ? error.message : 'internal_error', ...(error.detail ? { detail: error.detail } : {}) });
      return true;
    }
  };
}
