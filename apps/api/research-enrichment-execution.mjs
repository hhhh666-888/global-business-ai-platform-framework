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
const EXECUTION_CONFIRMATION = 'EXECUTE_TOP500_RESEARCH_ENRICHMENT';
const CHUNK_SIZE = 100;

const EVIDENCE_FIELDS = [
  'ownershipVerification', 'contactVerification', 'companyScaleBasis', 'energyEstimateConfidence',
  'energyEstimateBasis', 'actualEnergyDataSource', 'sourceTitle', 'statement', 'sourceUrl', 'verifiedAt',
];
const INTELLIGENCE_FIELDS = [
  'researchPriority', 'industrySegment', 'productsServices', 'researchRationale', 'companyWhatsapp', 'companyScale',
  'recommendedSolution', 'recommendedEntryPoint', 'estimatedProjectScale', 'recommendedChannel', 'firstOutreachSubject',
  'firstContactGuidance', 'researchCompleteness', 'researchNextAction',
];
const SALES_SIGNAL_FIELDS = ['solarOpportunity', 'storageOpportunity', 'generatorOpportunity', 'electricalOpportunity'];
const ENERGY_DISCOVERY_FIELDS = ['publicKnownEnergyData'];

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
db.exec(`
CREATE TABLE IF NOT EXISTS crm_research_enrichment_snapshot (
  batch_id TEXT NOT NULL REFERENCES crm_research_import_batch(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(batch_id,row_number)
) STRICT;
CREATE TABLE IF NOT EXISTS crm_research_evidence (
  business_id TEXT PRIMARY KEY,
  account_business_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  source_name TEXT NOT NULL,
  source_digest TEXT,
  evidence_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(batch_id,row_number)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_crm_research_evidence_account
ON crm_research_evidence(account_business_id,created_at DESC);
CREATE TABLE IF NOT EXISTS crm_research_intelligence (
  business_id TEXT PRIMARY KEY,
  account_business_id TEXT NOT NULL UNIQUE,
  state_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS crm_sales_signal (
  business_id TEXT PRIMARY KEY,
  account_business_id TEXT NOT NULL UNIQUE,
  state_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS crm_energy_discovery (
  business_id TEXT PRIMARY KEY,
  account_business_id TEXT NOT NULL UNIQUE,
  state_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS crm_research_enrichment_execution_item (
  batch_id TEXT NOT NULL REFERENCES crm_research_import_batch(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  account_business_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  evidence_business_id TEXT,
  changed_objects_json TEXT NOT NULL DEFAULT '[]',
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(batch_id,row_number)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_crm_research_enrichment_execution_batch
ON crm_research_enrichment_execution_item(batch_id,row_number);
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
async function readJson(req, maxBytes = 8 * 1024 * 1024) {
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
function requireUser(actor) {
  if (!actor.roles.has('substrate-user') && !actor.roles.has('substrate-admin')) throw httpError('forbidden', 403);
}
function requireAdmin(actor) { if (!actor.roles.has('substrate-admin')) throw httpError('forbidden', 403); }
function tableExists(name) { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
function recordAudit(actor, action, target, payload = {}) {
  if (!tableExists('audit_event')) return;
  db.prepare('INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)')
    .run(randomUUID(), actor.subject, actor.username, action, target, nowIso(), JSON.stringify(payload));
}
function optionalText(value, label, max = 30_000) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) throw httpError(`invalid_${label}`, 400);
  return value.trim() || null;
}
function pickFields(input, fields, prefix) {
  const output = {};
  for (const field of fields) output[field] = optionalText(input?.[field], `${prefix}_${field}`);
  return output;
}
function hasValue(value) { return value !== null && value !== undefined && value !== ''; }
function nonEmptyObject(input) { return Object.fromEntries(Object.entries(input).filter(([, value]) => hasValue(value))); }
function validateSnapshot(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError('invalid_research_enrichment_snapshot', 400);
  return {
    evidence: pickFields(input.evidence ?? {}, EVIDENCE_FIELDS, 'evidence'),
    intelligence: pickFields(input.intelligence ?? {}, INTELLIGENCE_FIELDS, 'intelligence'),
    salesSignal: pickFields(input.salesSignal ?? {}, SALES_SIGNAL_FIELDS, 'sales_signal'),
    energyDiscovery: pickFields(input.energyDiscovery ?? {}, ENERGY_DISCOVERY_FIELDS, 'energy_discovery'),
    source: optionalText(input.source, 'source', 512),
  };
}
function parseSummary(row) {
  try { return JSON.parse(row?.summary_json ?? '{}'); }
  catch { return {}; }
}
function attachSnapshots(actor, batchId, input) {
  const batch = db.prepare('SELECT * FROM crm_research_import_batch WHERE id=?').get(batchId);
  if (!batch) throw httpError('research_import_batch_not_found', 404);
  if (!['DRY_RUN_READY', 'DRY_RUN_BLOCKED'].includes(batch.status)) throw httpError('research_enrichment_snapshot_batch_not_attachable', 409, { status: batch.status });
  if (!input || !Array.isArray(input.rows) || input.rows.length !== batch.row_count) {
    throw httpError('research_enrichment_snapshot_row_count_mismatch', 409, { expected: batch.row_count, actual: Array.isArray(input?.rows) ? input.rows.length : null });
  }
  const expected = new Set(db.prepare('SELECT row_number FROM crm_research_import_item WHERE batch_id=?').all(batchId).map((row) => row.row_number));
  const seen = new Set();
  const rows = input.rows.map((item) => {
    const rowNumber = Number(item?.rowNumber);
    if (!Number.isInteger(rowNumber) || !expected.has(rowNumber) || seen.has(rowNumber)) throw httpError('invalid_research_enrichment_snapshot_row', 409, { rowNumber });
    seen.add(rowNumber);
    return { rowNumber, snapshot: validateSnapshot(item.enrichmentSnapshot ?? {}) };
  });
  const timestamp = nowIso();
  db.exec('BEGIN IMMEDIATE');
  try {
    const upsert = db.prepare(`
      INSERT INTO crm_research_enrichment_snapshot(batch_id,row_number,snapshot_json,created_at,updated_at)
      VALUES(?,?,?,?,?)
      ON CONFLICT(batch_id,row_number) DO UPDATE SET snapshot_json=excluded.snapshot_json,updated_at=excluded.updated_at
    `);
    let evidenceRows = 0; let salesSignalRows = 0; let energyDiscoveryRows = 0; let intelligenceRows = 0;
    for (const row of rows) {
      upsert.run(batchId, row.rowNumber, JSON.stringify(row.snapshot), timestamp, timestamp);
      if (Object.keys(nonEmptyObject(row.snapshot.evidence)).length) evidenceRows += 1;
      if (Object.keys(nonEmptyObject(row.snapshot.salesSignal)).length) salesSignalRows += 1;
      if (Object.keys(nonEmptyObject(row.snapshot.energyDiscovery)).length) energyDiscoveryRows += 1;
      if (Object.keys(nonEmptyObject(row.snapshot.intelligence)).length) intelligenceRows += 1;
    }
    const summary = {
      ...parseSummary(batch),
      enrichmentSnapshotCount: rows.length,
      evidenceSnapshotRows: evidenceRows,
      salesSignalSnapshotRows: salesSignalRows,
      energyDiscoverySnapshotRows: energyDiscoveryRows,
      researchIntelligenceSnapshotRows: intelligenceRows,
    };
    db.prepare('UPDATE crm_research_import_batch SET summary_json=?,updated_at=? WHERE id=?').run(JSON.stringify(summary), timestamp, batchId);
    recordAudit(actor, 'crm.research_intake.enrichment_snapshot.attach', `ResearchImportBatch:${batchId}`, { rowCount: rows.length, evidenceRows, salesSignalRows, energyDiscoveryRows, intelligenceRows });
    db.exec('COMMIT');
    return { batchId, rowCount: rows.length, evidenceRows, salesSignalRows, energyDiscoveryRows, intelligenceRows };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}
function parseState(row) {
  try { return JSON.parse(row?.state_json ?? '{}'); }
  catch { return {}; }
}
function sameValue(a, b) { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); }
function synchronizeResearchState(table, actor, accountBusinessId, incoming) {
  const existing = db.prepare(`SELECT * FROM ${table} WHERE account_business_id=?`).get(accountBusinessId);
  const current = parseState(existing);
  const next = { ...current };
  const fields = [];
  for (const [key, value] of Object.entries(incoming)) {
    const normalized = value ?? null;
    if (sameValue(current[key], normalized)) continue;
    next[key] = normalized;
    fields.push(key);
  }
  if (!existing) {
    if (!Object.values(incoming).some(hasValue)) return { changed: false, businessId: null, fields: [] };
    const businessId = randomUUID();
    const timestamp = nowIso();
    db.prepare(`INSERT INTO ${table}(business_id,account_business_id,state_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)`)
      .run(businessId, accountBusinessId, JSON.stringify(next), actor.subject, timestamp, timestamp);
    return { changed: true, businessId, fields: Object.keys(incoming) };
  }
  if (!fields.length) return { changed: false, businessId: existing.business_id, fields: [] };
  db.prepare(`UPDATE ${table} SET state_json=?,updated_at=? WHERE business_id=?`).run(JSON.stringify(next), nowIso(), existing.business_id);
  return { changed: true, businessId: existing.business_id, fields };
}
function appendEvidence(actor, batch, rowNumber, accountBusinessId, evidence) {
  const values = nonEmptyObject(evidence);
  if (!Object.keys(values).length) return { changed: false, businessId: null };
  const existing = db.prepare('SELECT business_id FROM crm_research_evidence WHERE batch_id=? AND row_number=?').get(batch.id, rowNumber);
  if (existing) return { changed: false, businessId: existing.business_id };
  const businessId = randomUUID();
  db.prepare(`INSERT INTO crm_research_evidence(
    business_id,account_business_id,batch_id,row_number,source_name,source_digest,evidence_json,created_by,created_at
  ) VALUES(?,?,?,?,?,?,?,?,?)`).run(
    businessId, accountBusinessId, batch.id, rowNumber, batch.source_name, batch.source_digest, JSON.stringify(values), actor.subject, nowIso(),
  );
  return { changed: true, businessId };
}
function reserveJournal(batchId, rowNumber, accountBusinessId) {
  const existing = db.prepare('SELECT * FROM crm_research_enrichment_execution_item WHERE batch_id=? AND row_number=?').get(batchId, rowNumber);
  if (existing) return existing;
  const timestamp = nowIso();
  db.prepare(`INSERT INTO crm_research_enrichment_execution_item(
    batch_id,row_number,account_business_id,status,attempt_count,changed_objects_json,created_at,updated_at
  ) VALUES(?,?,?,'RESERVED',0,'[]',?,?)`).run(batchId, rowNumber, accountBusinessId, timestamp, timestamp);
  return db.prepare('SELECT * FROM crm_research_enrichment_execution_item WHERE batch_id=? AND row_number=?').get(batchId, rowNumber);
}
function markJournal(batchId, rowNumber, values) {
  const fields = []; const params = [];
  for (const [key, value] of Object.entries(values)) { fields.push(`${key}=?`); params.push(value); }
  fields.push('updated_at=?'); params.push(nowIso(), batchId, rowNumber);
  db.prepare(`UPDATE crm_research_enrichment_execution_item SET ${fields.join(',')} WHERE batch_id=? AND row_number=?`).run(...params);
}
function processRow(actor, batch, row) {
  const snapshot = validateSnapshot(JSON.parse(row.snapshot_json));
  const journal = reserveJournal(batch.id, row.row_number, row.account_business_id);
  if (journal.status === 'COMPLETE') return;
  markJournal(batch.id, row.row_number, { status: 'RUNNING', attempt_count: journal.attempt_count + 1, error_code: null });
  db.exec('BEGIN IMMEDIATE');
  try {
    const changedObjects = [];
    const evidence = appendEvidence(actor, batch, row.row_number, row.account_business_id, snapshot.evidence);
    if (evidence.changed) changedObjects.push('EVIDENCE');
    const intelligence = synchronizeResearchState('crm_research_intelligence', actor, row.account_business_id, snapshot.intelligence);
    if (intelligence.changed) changedObjects.push('RESEARCH_INTELLIGENCE');
    const sales = synchronizeResearchState('crm_sales_signal', actor, row.account_business_id, snapshot.salesSignal);
    if (sales.changed) changedObjects.push('SALES_SIGNAL');
    const energy = synchronizeResearchState('crm_energy_discovery', actor, row.account_business_id, snapshot.energyDiscovery);
    if (energy.changed) changedObjects.push('ENERGY_DISCOVERY');
    recordAudit(actor, 'crm.research_intake.enrichment_execute_item', `Account:${row.account_business_id}`, {
      batchId: batch.id, rowNumber: row.row_number, changedObjects,
      intelligenceFields: intelligence.fields, salesSignalFields: sales.fields, energyDiscoveryFields: energy.fields,
      evidenceAppended: evidence.changed,
      mergePolicy: 'CSV_AUTHORITATIVE_OVERWRITE',
    });
    markJournal(batch.id, row.row_number, {
      status: 'COMPLETE', evidence_business_id: evidence.businessId, changed_objects_json: JSON.stringify(changedObjects), error_code: null,
    });
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    markJournal(batch.id, row.row_number, { status: 'FAILED', error_code: error.httpStatus ? error.message : 'internal_error' });
    throw error;
  }
}
function executionSummary(batchId) {
  const rows = db.prepare('SELECT status,changed_objects_json FROM crm_research_enrichment_execution_item WHERE batch_id=?').all(batchId);
  const summary = { evidenceAppended: 0, researchIntelligenceUpdated: 0, salesSignalsUpdated: 0, energyDiscoveryUpdated: 0, unchanged: 0, failed: 0, completedAt: null };
  for (const row of rows) {
    if (row.status === 'FAILED') { summary.failed += 1; continue; }
    if (row.status !== 'COMPLETE') continue;
    let changed = [];
    try { changed = JSON.parse(row.changed_objects_json); } catch {}
    if (!changed.length) summary.unchanged += 1;
    if (changed.includes('EVIDENCE')) summary.evidenceAppended += 1;
    if (changed.includes('RESEARCH_INTELLIGENCE')) summary.researchIntelligenceUpdated += 1;
    if (changed.includes('SALES_SIGNAL')) summary.salesSignalsUpdated += 1;
    if (changed.includes('ENERGY_DISCOVERY')) summary.energyDiscoveryUpdated += 1;
  }
  return summary;
}
function updateBatchSummary(batchId, enrichmentExecution) {
  const batch = db.prepare('SELECT summary_json FROM crm_research_import_batch WHERE id=?').get(batchId);
  const summary = { ...parseSummary(batch), enrichmentExecution };
  db.prepare('UPDATE crm_research_import_batch SET summary_json=?,updated_at=? WHERE id=?').run(JSON.stringify(summary), nowIso(), batchId);
}
function executeBatch(actor, batchId, input) {
  if (input?.confirmation !== EXECUTION_CONFIRMATION) throw httpError('research_enrichment_execution_confirmation_required', 400);
  const batch = db.prepare('SELECT * FROM crm_research_import_batch WHERE id=?').get(batchId);
  if (!batch) throw httpError('research_import_batch_not_found', 404);
  if (batch.status !== 'EXECUTED') throw httpError('research_enrichment_requires_completed_company_execution', 409);
  const batchSummary = parseSummary(batch);
  if (!batchSummary.siteExecution?.completedAt) throw httpError('research_enrichment_requires_completed_site_execution', 409);
  if (!batchSummary.contactExecution?.completedAt) throw httpError('research_enrichment_requires_completed_contact_execution', 409);
  const snapshotCount = Number(db.prepare('SELECT COUNT(*) AS count FROM crm_research_enrichment_snapshot WHERE batch_id=?').get(batchId)?.count ?? 0);
  if (snapshotCount !== batch.row_count) throw httpError('research_enrichment_snapshot_incomplete', 409, { expected: batch.row_count, actual: snapshotCount });
  const rows = db.prepare(`
    SELECT s.row_number,s.snapshot_json,e.business_id AS account_business_id
    FROM crm_research_enrichment_snapshot s
    JOIN crm_research_import_execution_item e ON e.batch_id=s.batch_id AND e.row_number=s.row_number AND e.status='COMPLETE'
    WHERE s.batch_id=? ORDER BY s.row_number
  `).all(batchId);
  const pending = rows.filter((row) => {
    const journal = db.prepare('SELECT status FROM crm_research_enrichment_execution_item WHERE batch_id=? AND row_number=?').get(batchId, row.row_number);
    return !journal || journal.status !== 'COMPLETE';
  });
  if (!pending.length) {
    const summary = executionSummary(batchId);
    summary.completedAt = batchSummary.enrichmentExecution?.completedAt ?? nowIso();
    updateBatchSummary(batchId, summary);
    return { batchId, status: 'ENRICHMENT_EXECUTED', enrichmentExecution: summary, remaining: 0, hasMore: false, idempotent: true };
  }
  const chunk = pending.slice(0, CHUNK_SIZE);
  for (const row of chunk) processRow(actor, batch, row);
  const remaining = pending.length - chunk.length;
  const summary = executionSummary(batchId);
  if (remaining === 0) summary.completedAt = nowIso();
  updateBatchSummary(batchId, summary);
  if (remaining === 0) recordAudit(actor, 'crm.research_intake.enrichment_execute', `ResearchImportBatch:${batchId}`, { enrichmentExecution: summary });
  return {
    batchId,
    status: remaining === 0 ? 'ENRICHMENT_EXECUTED' : 'ENRICHMENT_EXECUTION_CONTINUE',
    enrichmentExecution: summary,
    remaining,
    hasMore: remaining > 0,
    idempotent: false,
    chunkSize: CHUNK_SIZE,
  };
}
function viewState(row) {
  if (!row) return null;
  return { businessId: row.business_id, accountBusinessId: row.account_business_id, ...parseState(row), createdAt: row.created_at ?? null, updatedAt: row.updated_at ?? null };
}
function readEnrichment(accountBusinessId) {
  const evidence = db.prepare(`SELECT business_id,account_business_id,batch_id,row_number,source_name,source_digest,evidence_json,created_at
    FROM crm_research_evidence WHERE account_business_id=? ORDER BY created_at DESC`).all(accountBusinessId).map((row) => {
      let values = {}; try { values = JSON.parse(row.evidence_json); } catch {}
      return { businessId: row.business_id, accountBusinessId: row.account_business_id, batchId: row.batch_id, rowNumber: row.row_number, sourceName: row.source_name, sourceDigest: row.source_digest, ...values, createdAt: row.created_at };
    });
  return {
    accountBusinessId,
    evidence,
    researchIntelligence: viewState(db.prepare('SELECT * FROM crm_research_intelligence WHERE account_business_id=?').get(accountBusinessId)),
    salesSignal: viewState(db.prepare('SELECT * FROM crm_sales_signal WHERE account_business_id=?').get(accountBusinessId)),
    energyDiscovery: viewState(db.prepare('SELECT * FROM crm_energy_discovery WHERE account_business_id=?').get(accountBusinessId)),
  };
}

export function createResearchEnrichmentExecutionHandler() {
  return async function researchEnrichmentExecutionHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const attachMatch = req.method === 'POST' ? url.pathname.match(/^\/api\/crm-native\/research-intake\/batches\/([^/]+)\/enrichment-snapshots$/) : null;
    const executeMatch = req.method === 'POST' ? url.pathname.match(/^\/api\/crm-native\/research-intake\/batches\/([^/]+)\/execute-enrichment$/) : null;
    const readRoute = req.method === 'GET' && url.pathname === '/api/crm-native/research-enrichment';
    const isOptions = req.method === 'OPTIONS' && (
      /^\/api\/crm-native\/research-intake\/batches\/[^/]+\/(enrichment-snapshots|execute-enrichment)$/.test(url.pathname)
      || url.pathname === '/api/crm-native/research-enrichment'
    );
    if (!attachMatch && !executeMatch && !readRoute && !isOptions) return false;
    if (isOptions) { json(res, 204, {}); return true; }
    try {
      const actor = await authenticate(req);
      requireUser(actor);
      if (readRoute) {
        const accountBusinessId = url.searchParams.get('accountBusinessId')?.trim() ?? '';
        if (!accountBusinessId) throw httpError('account_business_id_required', 400);
        json(res, 200, readEnrichment(accountBusinessId));
        return true;
      }
      requireAdmin(actor);
      if (attachMatch) {
        json(res, 200, attachSnapshots(actor, decodeURIComponent(attachMatch[1]), await readJson(req)));
        return true;
      }
      json(res, 200, executeBatch(actor, decodeURIComponent(executeMatch[1]), await readJson(req, 64 * 1024)));
      return true;
    } catch (error) {
      json(res, error.httpStatus ?? 500, { error: error.httpStatus ? error.message : 'internal_error', ...(error.detail ? { detail: error.detail } : {}) });
      return true;
    }
  };
}
