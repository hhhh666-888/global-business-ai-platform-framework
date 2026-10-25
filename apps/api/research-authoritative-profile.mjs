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
const EXECUTION_CONFIRMATION = 'EXECUTE_TOP500_AUTHORITATIVE_PROFILE';
const CHUNK_SIZE = 100;
const SUPPORTED_SCHEMA = 'EC_TOP500_V46';
const SUPPORTED_SOURCE = 'EC_TOP500_V46_20260915';

const TOP500_V46_HEADERS = [
  '开发排名', 'GBAP价值评分', '开发优先级', '销售状态', '当前项目阶段', '销售负责人',
  '首次联系日期', '最后联系日期', '下次跟进日期', '客户反馈/关键异议', '数据核验等级', '公司名称',
  '商业名称', 'RUC', '私营企业核验', '官网', 'LinkedIn', '行业大类', '行业细分', '主营产品/服务',
  '为什么值得开发', '省/州', '城市', '主要工厂/运营地址', 'Google Maps核验链接', '公司电话',
  '公司邮箱', '公司WhatsApp', '法人/代表人', '法人/代表人职务', '首选业务决策人',
  '首选业务决策人联系方式', '工厂/运营负责人', '工厂/运营负责人联系方式', '工程/能源/维护负责人',
  '工程/能源联系方式', '采购负责人', '采购联系方式', '联系人核验状态', '推荐优先寻找职位',
  '2025营收USD', '员工人数', '规模等级', '规模判断依据', '工厂/主要场址数', '生产/运营时长',
  '工艺/运营特征', '主要耗电设备', '潜在用电等级', '潜在峰值负荷估算kW', '潜在月用电估算kWh',
  '能源估算置信度', '用电判断依据', '已知实际用电/能源数据', '实际用电数据来源', '供电/停电痛点',
  '现有发电机/备用电源', '现有光伏/储能', '屋顶/场地条件', '光伏机会', '储能机会', '发电机机会',
  '变压器/电气机会', '最佳匹配产品/方案', '建议首推切入点', '预计项目规模', '推荐开发渠道',
  '首封开发主题', '首次联系建议', '关键核验来源', '关键核验结论', '关键证据URL',
  '数据完整度/深挖状态', '核验日期', '下一步动作',
];
const PROTECTED_OPERATIONAL_HEADERS = new Set([
  '销售状态', '当前项目阶段', '销售负责人', '首次联系日期', '最后联系日期', '下次跟进日期', '客户反馈/关键异议',
]);
const AUTHORITATIVE_HEADERS = TOP500_V46_HEADERS.filter((header) => !PROTECTED_OPERATIONAL_HEADERS.has(header));
const AUTHORITATIVE_HEADER_SET = new Set(AUTHORITATIVE_HEADERS);
if (TOP500_V46_HEADERS.length !== 75 || AUTHORITATIVE_HEADERS.length !== 68 || AUTHORITATIVE_HEADER_SET.size !== 68) {
  throw new Error('TOP500_V46_AUTHORITATIVE_CONTRACT_INVALID');
}

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
db.exec(`
CREATE TABLE IF NOT EXISTS crm_research_authoritative_snapshot (
  batch_id TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  fields_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(batch_id,row_number)
) STRICT;
CREATE TABLE IF NOT EXISTS crm_research_authoritative_profile (
  account_business_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  schema_version TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_digest TEXT,
  fields_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS crm_research_authoritative_execution_item (
  batch_id TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  account_business_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  changed_field_count INTEGER NOT NULL DEFAULT 0,
  cleared_override_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(batch_id,row_number)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_crm_research_authoritative_execution_batch
  ON crm_research_authoritative_execution_item(batch_id,row_number);
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
async function readJson(req, maxBytes = 16 * 1024 * 1024) {
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
function validateFields(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError('invalid_authoritative_profile_fields', 400);
  const keys = Object.keys(input);
  if (keys.length !== AUTHORITATIVE_HEADERS.length) throw httpError('authoritative_profile_field_count_mismatch', 409, { expected: 68, actual: keys.length });
  const output = {};
  for (const header of AUTHORITATIVE_HEADERS) {
    if (!Object.prototype.hasOwnProperty.call(input, header)) throw httpError(`authoritative_profile_missing_field:${header}`, 409);
    const value = input[header];
    if (typeof value !== 'string' || value.length > 30_000) throw httpError(`invalid_authoritative_profile_field:${header}`, 400);
    output[header] = value.trim();
  }
  for (const key of keys) if (!AUTHORITATIVE_HEADER_SET.has(key)) throw httpError(`unsupported_authoritative_profile_field:${key}`, 400);
  return output;
}
function attachSnapshots(actor, batchId, input) {
  const batch = db.prepare('SELECT * FROM crm_research_import_batch WHERE id=?').get(batchId);
  if (!batch) throw httpError('research_import_batch_not_found', 404);
  if (!['DRY_RUN_READY', 'DRY_RUN_BLOCKED'].includes(batch.status)) throw httpError('research_authoritative_snapshot_batch_not_attachable', 409, { status: batch.status });
  if (!input || !Array.isArray(input.rows) || input.rows.length !== batch.row_count) {
    throw httpError('research_authoritative_snapshot_row_count_mismatch', 409, { expected: batch.row_count, actual: Array.isArray(input?.rows) ? input.rows.length : null });
  }
  const expected = new Set(db.prepare('SELECT row_number FROM crm_research_import_item WHERE batch_id=?').all(batchId).map((row) => row.row_number));
  const seen = new Set();
  const rows = input.rows.map((item) => {
    const rowNumber = Number(item?.rowNumber);
    if (!Number.isInteger(rowNumber) || !expected.has(rowNumber) || seen.has(rowNumber)) throw httpError('invalid_research_authoritative_snapshot_row', 409, { rowNumber });
    seen.add(rowNumber);
    return { rowNumber, fields: validateFields(item.fields) };
  });
  const timestamp = nowIso();
  db.exec('BEGIN IMMEDIATE');
  try {
    const upsert = db.prepare(`INSERT INTO crm_research_authoritative_snapshot(batch_id,row_number,fields_json,created_at,updated_at)
      VALUES(?,?,?,?,?) ON CONFLICT(batch_id,row_number) DO UPDATE SET fields_json=excluded.fields_json,updated_at=excluded.updated_at`);
    for (const row of rows) upsert.run(batchId, row.rowNumber, JSON.stringify(row.fields), timestamp, timestamp);
    const summary = JSON.parse(batch.summary_json ?? '{}');
    summary.authoritativeSnapshotCount = rows.length;
    summary.authoritativeFieldCount = AUTHORITATIVE_HEADERS.length;
    db.prepare('UPDATE crm_research_import_batch SET summary_json=?,updated_at=? WHERE id=?').run(JSON.stringify(summary), timestamp, batchId);
    recordAudit(actor, 'crm.research_intake.authoritative_snapshot.attach', `ResearchImportBatch:${batchId}`, { rowCount: rows.length, authoritativeFieldCount: 68, protectedOperationalWriteCount: 0 });
    db.exec('COMMIT');
    return { batchId, rowCount: rows.length, authoritativeFieldCount: 68 };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}
function parseNumberText(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = Number(text.replace(/[$,\s]/g, '').replace(/USD/gi, ''));
  return Number.isFinite(parsed) ? parsed : null;
}
function parseIntegerText(value) {
  const parsed = parseNumberText(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}
function normalizeRuc(value) { return String(value ?? '').replace(/\.0$/, '').replace(/[^0-9]/g, ''); }
function readAccountState(businessId) {
  const row = db.prepare("SELECT state_json FROM crm_business_state WHERE business_type='Account' AND business_id=?").get(businessId);
  if (!row?.state_json) return {};
  try { return JSON.parse(row.state_json); } catch { return {}; }
}
function sameJson(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function synchronizeAccountState(accountBusinessId, fields, timestamp) {
  const current = readAccountState(accountBusinessId);
  const next = { ...current };
  const normalized = {
    displayName: fields['公司名称'] || null,
    commercialName: fields['商业名称'] || null,
    registrationCountry: 'EC',
    registrationType: 'RUC',
    registrationId: normalizeRuc(fields.RUC),
    ownershipType: 'PRIVATE',
    verificationGrade: fields['数据核验等级'] || null,
    strategicValueScore: parseNumberText(fields['GBAP价值评分']),
    researchRank: parseIntegerText(fields['开发排名']),
    website: fields['官网'] || null,
    linkedinUrl: fields.LinkedIn || null,
    industry: fields['行业大类'] || null,
    primaryPhone: fields['公司电话'] || null,
    primaryEmail: fields['公司邮箱'] || null,
    annualRevenue: parseNumberText(fields['2025营收USD']),
    annualRevenueCurrency: fields['2025营收USD'] ? 'USD' : null,
    employeeCount: parseIntegerText(fields['员工人数']),
    source: SUPPORTED_SOURCE,
  };
  const changedStateFields = [];
  for (const [key, value] of Object.entries(normalized)) {
    if (!sameJson(next[key], value)) { next[key] = value; changedStateFields.push(key); }
  }
  let clearedOverrideCount = 0;
  if (next.profile75Overrides && typeof next.profile75Overrides === 'object' && !Array.isArray(next.profile75Overrides)) {
    const preserved = {};
    for (const [key, value] of Object.entries(next.profile75Overrides)) {
      if (PROTECTED_OPERATIONAL_HEADERS.has(key)) preserved[key] = value;
      else clearedOverrideCount += 1;
    }
    if (Object.keys(preserved).length) next.profile75Overrides = preserved;
    else delete next.profile75Overrides;
    if (clearedOverrideCount > 0) changedStateFields.push('profile75Overrides');
  }
  if (changedStateFields.length > 0) {
    db.prepare(`INSERT INTO crm_business_state(business_type,business_id,state_json,updated_at) VALUES('Account',?,?,?)
      ON CONFLICT(business_type,business_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`)
      .run(accountBusinessId, JSON.stringify(next), timestamp);
  }
  return { changedStateFields, clearedOverrideCount };
}
function reserveJournal(batchId, rowNumber, accountBusinessId) {
  const existing = db.prepare('SELECT * FROM crm_research_authoritative_execution_item WHERE batch_id=? AND row_number=?').get(batchId, rowNumber);
  if (existing) return existing;
  const timestamp = nowIso();
  db.prepare(`INSERT INTO crm_research_authoritative_execution_item(batch_id,row_number,account_business_id,status,attempt_count,created_at,updated_at)
    VALUES(?,?,?,'RESERVED',0,?,?)`).run(batchId, rowNumber, accountBusinessId, timestamp, timestamp);
  return db.prepare('SELECT * FROM crm_research_authoritative_execution_item WHERE batch_id=? AND row_number=?').get(batchId, rowNumber);
}
function markJournal(batchId, rowNumber, values) {
  const fields = []; const params = [];
  for (const [key, value] of Object.entries(values)) { fields.push(`${key}=?`); params.push(value); }
  fields.push('updated_at=?'); params.push(nowIso(), batchId, rowNumber);
  db.prepare(`UPDATE crm_research_authoritative_execution_item SET ${fields.join(',')} WHERE batch_id=? AND row_number=?`).run(...params);
}
function processRow(actor, batch, row) {
  const fields = validateFields(JSON.parse(row.fields_json));
  const journal = reserveJournal(batch.id, row.row_number, row.account_business_id);
  if (journal.status === 'COMPLETE') return;
  markJournal(batch.id, row.row_number, { status: 'RUNNING', attempt_count: journal.attempt_count + 1, error_code: null });
  const timestamp = nowIso();
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare('SELECT fields_json FROM crm_research_authoritative_profile WHERE account_business_id=?').get(row.account_business_id);
    let previous = {};
    try { previous = JSON.parse(existing?.fields_json ?? '{}'); } catch {}
    let changedFieldCount = 0;
    for (const header of AUTHORITATIVE_HEADERS) if (previous[header] !== fields[header]) changedFieldCount += 1;
    db.prepare(`INSERT INTO crm_research_authoritative_profile(account_business_id,batch_id,row_number,schema_version,source_name,source_digest,fields_json,updated_at)
      VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(account_business_id) DO UPDATE SET batch_id=excluded.batch_id,row_number=excluded.row_number,schema_version=excluded.schema_version,
        source_name=excluded.source_name,source_digest=excluded.source_digest,fields_json=excluded.fields_json,updated_at=excluded.updated_at`)
      .run(row.account_business_id, batch.id, row.row_number, batch.schema_version, batch.source_name, batch.source_digest, JSON.stringify(fields), timestamp);
    const stateSync = synchronizeAccountState(row.account_business_id, fields, timestamp);
    markJournal(batch.id, row.row_number, {
      status: 'COMPLETE',
      changed_field_count: changedFieldCount,
      cleared_override_count: stateSync.clearedOverrideCount,
      error_code: null,
    });
    recordAudit(actor, 'crm.research_authoritative_profile.sync', `Account:${row.account_business_id}`, {
      batchId: batch.id,
      rowNumber: row.row_number,
      authoritativeFieldCount: 68,
      changedFieldCount,
      changedStateFields: stateSync.changedStateFields,
      clearedOverrideCount: stateSync.clearedOverrideCount,
      mergePolicy: 'CSV_AUTHORITATIVE_OVERWRITE',
      protectedOperationalWriteCount: 0,
    });
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    markJournal(batch.id, row.row_number, { status: 'FAILED', error_code: error.httpStatus ? error.message : 'internal_error' });
    throw error;
  }
}
function summaryForBatch(batchId, totalRows) {
  const rows = db.prepare('SELECT status,changed_field_count,cleared_override_count FROM crm_research_authoritative_execution_item WHERE batch_id=?').all(batchId);
  const summary = { updated: 0, unchanged: 0, failed: 0, changedFields: 0, clearedOverrides: 0, authoritativeFieldCount: 68, protectedOperationalWriteCount: 0, completedAt: null };
  let done = 0;
  for (const row of rows) {
    if (row.status === 'COMPLETE') {
      done += 1;
      if (row.changed_field_count > 0 || row.cleared_override_count > 0) summary.updated += 1;
      else summary.unchanged += 1;
      summary.changedFields += Number(row.changed_field_count ?? 0);
      summary.clearedOverrides += Number(row.cleared_override_count ?? 0);
    } else if (row.status === 'FAILED') summary.failed += 1;
  }
  return { summary, remaining: Math.max(0, totalRows - done) };
}
function updateBatchSummary(batchId, authoritativeExecution) {
  const batch = db.prepare('SELECT summary_json FROM crm_research_import_batch WHERE id=?').get(batchId);
  let summary = {};
  try { summary = JSON.parse(batch?.summary_json ?? '{}'); } catch {}
  summary.authoritativeExecution = authoritativeExecution;
  db.prepare('UPDATE crm_research_import_batch SET summary_json=?,updated_at=? WHERE id=?').run(JSON.stringify(summary), nowIso(), batchId);
}
function executeBatch(actor, batchId, input) {
  if (input?.confirmation !== EXECUTION_CONFIRMATION) throw httpError('research_authoritative_execution_confirmation_required', 400);
  const batch = db.prepare('SELECT * FROM crm_research_import_batch WHERE id=?').get(batchId);
  if (!batch) throw httpError('research_import_batch_not_found', 404);
  if (batch.schema_version !== SUPPORTED_SCHEMA) throw httpError('unsupported_research_schema', 409);
  if (batch.status !== 'EXECUTED') throw httpError('research_authoritative_requires_completed_company_execution', 409, { status: batch.status });
  const snapshotCount = Number(db.prepare('SELECT COUNT(*) AS count FROM crm_research_authoritative_snapshot WHERE batch_id=?').get(batchId)?.count ?? 0);
  if (snapshotCount !== batch.row_count) throw httpError('research_authoritative_snapshot_incomplete', 409, { expected: batch.row_count, actual: snapshotCount });
  const companyComplete = Number(db.prepare("SELECT COUNT(*) AS count FROM crm_research_import_execution_item WHERE batch_id=? AND status='COMPLETE'").get(batchId)?.count ?? 0);
  if (companyComplete !== batch.row_count) throw httpError('research_authoritative_company_execution_incomplete', 409, { expected: batch.row_count, actual: companyComplete });
  const before = summaryForBatch(batchId, batch.row_count);
  if (before.remaining === 0) {
    const batchSummary = JSON.parse(batch.summary_json ?? '{}');
    before.summary.completedAt = batchSummary.authoritativeExecution?.completedAt ?? batch.updated_at ?? null;
    return { batchId, status: 'AUTHORITATIVE_EXECUTED', authoritativeExecution: before.summary, remaining: 0, hasMore: false, idempotent: true };
  }
  const rows = db.prepare(`
    SELECT s.row_number,s.fields_json,e.business_id AS account_business_id
    FROM crm_research_authoritative_snapshot s
    JOIN crm_research_import_execution_item e ON e.batch_id=s.batch_id AND e.row_number=s.row_number AND e.status='COMPLETE'
    LEFT JOIN crm_research_authoritative_execution_item x ON x.batch_id=s.batch_id AND x.row_number=s.row_number
    WHERE s.batch_id=? AND (x.status IS NULL OR x.status <> 'COMPLETE')
    ORDER BY s.row_number LIMIT ?
  `).all(batchId, CHUNK_SIZE);
  for (const row of rows) processRow(actor, batch, row);
  const after = summaryForBatch(batchId, batch.row_count);
  if (after.remaining === 0) after.summary.completedAt = nowIso();
  updateBatchSummary(batchId, after.summary);
  if (after.remaining === 0) recordAudit(actor, 'crm.research_authoritative_profile.execute', `ResearchImportBatch:${batchId}`, { authoritativeExecution: after.summary, mergePolicy: 'CSV_AUTHORITATIVE_OVERWRITE' });
  return {
    batchId,
    status: after.remaining === 0 ? 'AUTHORITATIVE_EXECUTED' : 'AUTHORITATIVE_EXECUTION_CONTINUE',
    authoritativeExecution: after.summary,
    remaining: after.remaining,
    hasMore: after.remaining > 0,
    idempotent: false,
    chunkSize: CHUNK_SIZE,
  };
}
function listProfiles() {
  return db.prepare('SELECT account_business_id,batch_id,row_number,schema_version,source_name,source_digest,fields_json,updated_at FROM crm_research_authoritative_profile ORDER BY updated_at DESC,account_business_id')
    .all().map((row) => {
      let fields = {};
      try { fields = JSON.parse(row.fields_json); } catch {}
      return {
        accountBusinessId: row.account_business_id,
        batchId: row.batch_id,
        rowNumber: row.row_number,
        schemaVersion: row.schema_version,
        sourceName: row.source_name,
        sourceDigest: row.source_digest ?? null,
        fields,
        updatedAt: row.updated_at,
      };
    });
}

export function createResearchAuthoritativeProfileHandler() {
  return async function researchAuthoritativeProfileHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const attachMatch = req.method === 'POST' ? url.pathname.match(/^\/api\/crm-native\/research-intake\/batches\/([^/]+)\/authoritative-snapshots$/) : null;
    const executeMatch = req.method === 'POST' ? url.pathname.match(/^\/api\/crm-native\/research-intake\/batches\/([^/]+)\/execute-authoritative$/) : null;
    const listRoute = req.method === 'GET' && url.pathname === '/api/crm-native/research-authoritative-profiles';
    const isOptions = req.method === 'OPTIONS' && (
      /^\/api\/crm-native\/research-intake\/batches\/[^/]+\/(authoritative-snapshots|execute-authoritative)$/.test(url.pathname)
      || url.pathname === '/api/crm-native/research-authoritative-profiles'
    );
    if (!attachMatch && !executeMatch && !listRoute && !isOptions) return false;
    if (isOptions) { json(res, 204, {}); return true; }
    try {
      const actor = await authenticate(req);
      requireUser(actor);
      if (listRoute) { json(res, 200, { profiles: listProfiles() }); return true; }
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
