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
const ROW_UPLOAD_LIMIT = 200;
const EXECUTION_CHUNK_SIZE = 25;
const MAX_JOB_ROWS = 50_000;
const ACCOUNT_LIST_RETRIES = 3;

const PROTECTED_FIELDS = new Set([
  '销售状态', '当前项目阶段', '销售负责人', '首次联系日期', '最后联系日期', '下次跟进日期', '客户反馈/关键异议',
]);

const STATE_FIELD_MAPPING = new Map([
  ['公司名称', ['displayName', 'text']],
  ['商业名称', ['commercialName', 'text']],
  ['数据核验等级', ['verificationGrade', 'text']],
  ['GBAP价值评分', ['strategicValueScore', 'number']],
  ['开发排名', ['researchRank', 'integer']],
  ['官网', ['website', 'text']],
  ['LinkedIn', ['linkedinUrl', 'text']],
  ['行业大类', ['industry', 'text']],
  ['公司电话', ['primaryPhone', 'text']],
  ['公司邮箱', ['primaryEmail', 'text']],
  ['2025营收USD', ['annualRevenue', 'number']],
  ['员工人数', ['employeeCount', 'integer']],
]);

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
db.exec(`
CREATE TABLE IF NOT EXISTS crm_company_import_job (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  source_digest TEXT,
  preset_id TEXT,
  default_country TEXT,
  default_registration_type TEXT,
  update_policy TEXT NOT NULL,
  import_mode TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  uploaded_rows INTEGER NOT NULL DEFAULT 0,
  mapped_field_count INTEGER NOT NULL DEFAULT 0,
  protected_field_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  actor_subject TEXT NOT NULL,
  actor_username TEXT,
  mapping_json TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS crm_company_import_row (
  job_id TEXT NOT NULL REFERENCES crm_company_import_job(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  registration_country TEXT NOT NULL,
  registration_type TEXT NOT NULL,
  registration_id TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  match_business_id TEXT,
  proposed_action TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'UPLOADED',
  business_id TEXT,
  provider_warning TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(job_id,row_number),
  UNIQUE(job_id,registration_country,registration_type,registration_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_crm_company_import_job_created ON crm_company_import_job(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_company_import_row_status ON crm_company_import_row(job_id,status,row_number);
CREATE INDEX IF NOT EXISTS idx_crm_company_import_row_identity ON crm_company_import_row(registration_country,registration_type,registration_id);

CREATE TABLE IF NOT EXISTS crm_research_account_catalog (
  business_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  website TEXT,
  linkedin_url TEXT,
  observed_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS idx_crm_research_account_catalog_name ON crm_research_account_catalog(display_name);

CREATE TABLE IF NOT EXISTS crm_registration_identity (
  registration_country TEXT NOT NULL,
  registration_type TEXT NOT NULL,
  registration_id TEXT NOT NULL,
  business_id TEXT NOT NULL UNIQUE,
  first_import_batch_id TEXT,
  last_import_batch_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(registration_country,registration_type,registration_id)
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
`);

// A process restart can interrupt a background job after a row is marked RUNNING.
// Convert those rows back to READY and the parent job to resumable PARTIAL_FAILED.
// Nothing is replayed automatically: an admin explicitly resumes/retries the job.
db.exec(`
UPDATE crm_company_import_row SET status='READY',updated_at=datetime('now') WHERE status='RUNNING';
UPDATE crm_company_import_job
SET status='PARTIAL_FAILED',completed_at=NULL,updated_at=datetime('now')
WHERE status='RUNNING';
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
async function readJson(req, maxBytes = 4 * 1024 * 1024) {
  let size = 0;
  const chunks = [];
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
  let headerJson;
  let claims;
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
function optionalText(value, max = 512) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) throw httpError('invalid_text', 400);
  return value.trim();
}
function parseJson(value, fallback = {}) {
  try { return JSON.parse(value ?? ''); }
  catch { return fallback; }
}
function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
function recordAudit(actor, action, target, payload = {}) {
  if (!tableExists('audit_event')) return;
  db.prepare('INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)')
    .run(randomUUID(), actor.subject, actor.username, action, target, nowIso(), JSON.stringify(payload));
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
  const raw = requiredText(value, 'registration_id', 160);
  const normalized = country === 'EC' && type === 'RUC'
    ? raw.replace(/\.0$/, '').replace(/[^0-9]/g, '')
    : raw.toUpperCase();
  if (country === 'EC' && type === 'RUC' && !/^\d{13}$/.test(normalized)) throw httpError('invalid_ec_ruc', 400);
  return normalized;
}
function normalizeName(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleUpperCase().replace(/[\s.,;:'"`()\[\]{}\-_]+/g, '');
}
function normalizeUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return `${url.hostname.toLocaleLowerCase()}${url.pathname.replace(/\/$/, '')}`;
  } catch {
    return text.toLocaleLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
}
function parseNumber(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = Number(text.replace(/[$,\s]/g, '').replace(/USD/gi, ''));
  return Number.isFinite(parsed) ? parsed : null;
}
function parseInteger(value) {
  const parsed = parseNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
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
  return db.prepare(`SELECT p.*,b.capability,b.priority FROM capability_binding b
    JOIN provider_registration p ON p.id=b.provider_id
    WHERE b.capability=? AND b.enabled=1 AND p.enabled=1 AND p.environment_scope=?
      AND (p.organization_scope IS NULL OR p.organization_scope=?)
      AND (p.workspace_scope IS NULL OR p.workspace_scope=?)
    ORDER BY CASE WHEN p.workspace_scope IS NULL THEN 0 ELSE 1 END DESC,
      CASE WHEN p.organization_scope IS NULL THEN 0 ELSE 1 END DESC,
      b.priority DESC,p.id ASC LIMIT 1`).get(capability, scope.environment, scope.organization, scope.workspace);
}
function providerById(providerId, scope) {
  const provider = db.prepare('SELECT * FROM provider_registration WHERE id=?').get(providerId);
  return provider && providerScopeMatches(provider, scope) ? provider : null;
}
async function invokeProvider(provider, capability, actor, scope, payload) {
  const endpoint = new URL(provider.endpoint);
  const allowlist = parseJson(provider.egress_allowlist_json, []);
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
  if (!response.ok) throw httpError('provider_unavailable', 503, {
    providerId: provider.id,
    upstreamStatus: response.status,
    upstreamError: body.error ?? null,
  });
  return { providerId: provider.id, body };
}
function canonicalAccountExists(businessId) {
  return Boolean(db.prepare("SELECT 1 FROM external_mapping WHERE business_type='Account' AND business_id=? LIMIT 1").get(businessId));
}
function canonicalAccountCount() {
  return Number(db.prepare("SELECT COUNT(DISTINCT business_id) count FROM external_mapping WHERE business_type='Account'").get()?.count ?? 0);
}
function readBusinessState(businessId) {
  const row = tableExists('crm_business_state')
    ? db.prepare("SELECT state_json FROM crm_business_state WHERE business_type='Account' AND business_id=?").get(businessId)
    : null;
  return parseJson(row?.state_json, {});
}
function saveBusinessState(businessId, state) {
  if (!tableExists('crm_business_state')) return;
  db.prepare(`INSERT INTO crm_business_state(business_type,business_id,state_json,updated_at) VALUES('Account',?,?,?)
    ON CONFLICT(business_type,business_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`)
    .run(businessId, JSON.stringify(state), nowIso());
}
function cacheCanonicalAccounts(records) {
  const timestamp = nowIso();
  const upsert = db.prepare(`INSERT INTO crm_research_account_catalog(business_id,display_name,website,linkedin_url,observed_at)
    VALUES(?,?,?,?,?) ON CONFLICT(business_id) DO UPDATE SET display_name=excluded.display_name,website=excluded.website,linkedin_url=excluded.linkedin_url,observed_at=excluded.observed_at`);
  for (const record of Array.isArray(records) ? records : []) {
    if (!record?.businessId || !record?.displayName || !canonicalAccountExists(record.businessId)) continue;
    upsert.run(record.businessId, String(record.displayName).trim(), optionalText(record.website, 2048), optionalText(record.linkedinUrl, 2048), timestamp);
  }
}
function cachedCanonicalAccounts() {
  const byId = new Map();
  for (const row of db.prepare(`SELECT c.business_id,c.display_name,c.website,c.linkedin_url FROM crm_research_account_catalog c
    WHERE EXISTS (SELECT 1 FROM external_mapping m WHERE m.business_type='Account' AND m.business_id=c.business_id)`).all()) {
    byId.set(row.business_id, {
      businessId: row.business_id,
      displayName: row.display_name,
      website: row.website,
      linkedinUrl: row.linkedin_url,
    });
  }
  if (tableExists('crm_business_state')) {
    for (const row of db.prepare("SELECT business_id,state_json FROM crm_business_state WHERE business_type='Account'").all()) {
      if (!canonicalAccountExists(row.business_id)) continue;
      const state = parseJson(row.state_json, {});
      if (!state.displayName || byId.has(row.business_id)) continue;
      byId.set(row.business_id, {
        businessId: row.business_id,
        displayName: state.displayName,
        website: state.website ?? null,
        linkedinUrl: state.linkedinUrl ?? null,
      });
    }
  }
  return [...byId.values()];
}
async function canonicalAccounts(actor, scope) {
  const provider = resolveProvider('crm.v1.account.list', scope);
  let lastError = null;
  if (provider) {
    for (let attempt = 1; attempt <= ACCOUNT_LIST_RETRIES; attempt += 1) {
      try {
        const listed = await invokeProvider(provider, 'crm.v1.account.list', actor, scope, { limit: 10_000 });
        const records = Array.isArray(listed.body?.records) ? listed.body.records : [];
        cacheCanonicalAccounts(records);
        return { records, source: 'LIVE_PROVIDER', providerError: null };
      } catch (error) {
        lastError = error;
        if (attempt < ACCOUNT_LIST_RETRIES) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
      }
    }
  }
  return {
    records: cachedCanonicalAccounts(),
    source: 'LOCAL_CATALOG',
    providerError: lastError instanceof Error ? lastError.message : provider ? 'provider_unavailable' : 'capability_unavailable',
  };
}
function fieldFingerprint(fields) {
  return { website: normalizeUrl(fields['官网']), linkedin: normalizeUrl(fields.LinkedIn) };
}
function compatibleFingerprint(fields, record) {
  const source = fieldFingerprint(fields);
  const targetWebsite = normalizeUrl(record?.website);
  const targetLinkedin = normalizeUrl(record?.linkedinUrl);
  if (source.website && targetWebsite && source.website !== targetWebsite) return false;
  if (source.linkedin && targetLinkedin && source.linkedin !== targetLinkedin) return false;
  return true;
}
function identityOwner(country, type, id) {
  return db.prepare('SELECT business_id FROM crm_registration_identity WHERE registration_country=? AND registration_type=? AND registration_id=?')
    .get(country, type, id)?.business_id ?? null;
}
function stateIdentityOwner(country, type, id) {
  if (!tableExists('crm_business_state')) return [];
  const matches = [];
  for (const row of db.prepare("SELECT business_id,state_json FROM crm_business_state WHERE business_type='Account'").all()) {
    const state = parseJson(row.state_json, {});
    if (String(state.registrationCountry ?? '').toUpperCase() !== country) continue;
    if (String(state.registrationType ?? '').toUpperCase() !== type) continue;
    const currentId = country === 'EC' && type === 'RUC'
      ? String(state.registrationId ?? '').replace(/\.0$/, '').replace(/[^0-9]/g, '')
      : String(state.registrationId ?? '').toUpperCase();
    if (currentId === id) matches.push(row.business_id);
  }
  return [...new Set(matches)];
}
function claimIdentity(businessId, row, jobId) {
  const owner = identityOwner(row.registration_country, row.registration_type, row.registration_id);
  if (owner && owner !== businessId && canonicalAccountExists(owner)) throw httpError('registration_identity_already_claimed', 409, { businessId: owner });
  if (owner && owner !== businessId && !canonicalAccountExists(owner)) {
    db.prepare('DELETE FROM crm_registration_identity WHERE registration_country=? AND registration_type=? AND registration_id=?')
      .run(row.registration_country, row.registration_type, row.registration_id);
  }
  const current = db.prepare('SELECT registration_country,registration_type,registration_id FROM crm_registration_identity WHERE business_id=?').get(businessId);
  if (current && (current.registration_country !== row.registration_country || current.registration_type !== row.registration_type || current.registration_id !== row.registration_id)) {
    throw httpError('company_registration_identity_already_claimed', 409);
  }
  const timestamp = nowIso();
  db.prepare(`INSERT INTO crm_registration_identity(registration_country,registration_type,registration_id,business_id,first_import_batch_id,last_import_batch_id,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(registration_country,registration_type,registration_id) DO UPDATE SET business_id=excluded.business_id,last_import_batch_id=excluded.last_import_batch_id,updated_at=excluded.updated_at`)
    .run(row.registration_country, row.registration_type, row.registration_id, businessId, jobId, jobId, timestamp, timestamp);
}
function findMappingByBusinessId(businessId) {
  return db.prepare("SELECT * FROM external_mapping WHERE business_type='Account' AND business_id=? ORDER BY created_at DESC LIMIT 1").get(businessId) ?? null;
}
function ensureBusinessMapping(actor, provider, businessId, record, jobId) {
  if (!record?.externalId || !record?.externalType) throw httpError('provider_record_missing_external_identity', 502);
  const existing = findMappingByBusinessId(businessId);
  if (existing) return existing;
  const conflict = db.prepare('SELECT * FROM external_mapping WHERE provider_id=? AND external_type=? AND external_id=?').get(provider.id, record.externalType, record.externalId);
  if (conflict && conflict.business_id !== businessId) throw httpError('external_id_mapping_conflict', 409);
  const id = randomUUID();
  db.prepare('INSERT INTO external_mapping(id,business_type,business_id,provider_id,external_type,external_id,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(id, 'Account', businessId, provider.id, record.externalType, record.externalId, nowIso());
  recordAudit(actor, 'mapping.create', `mapping:${id}`, {
    businessType: 'Account', businessId, providerId: provider.id, source: 'company-import', jobId,
  });
  return { provider_id: provider.id, external_id: record.externalId, external_type: record.externalType };
}
function applyAuthority(job, row, businessId) {
  const fields = parseJson(row.fields_json, {});
  const existing = db.prepare('SELECT fields_json FROM crm_research_authoritative_profile WHERE account_business_id=?').get(businessId);
  const previous = parseJson(existing?.fields_json, {});
  const next = { ...previous };
  let changed = 0;
  for (const [key, raw] of Object.entries(fields)) {
    if (PROTECTED_FIELDS.has(key)) continue;
    const incoming = String(raw ?? '').trim();
    if (job.update_policy === 'FILL_BLANK' && String(previous[key] ?? '').trim()) continue;
    if (String(previous[key] ?? '') !== incoming) {
      next[key] = incoming;
      changed += 1;
    }
  }
  db.prepare(`INSERT INTO crm_research_authoritative_profile(account_business_id,batch_id,row_number,schema_version,source_name,source_digest,fields_json,updated_at)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(account_business_id) DO UPDATE SET batch_id=excluded.batch_id,row_number=excluded.row_number,schema_version=excluded.schema_version,source_name=excluded.source_name,source_digest=excluded.source_digest,fields_json=excluded.fields_json,updated_at=excluded.updated_at`)
    .run(businessId, job.id, row.row_number, 'COMPANY_IMPORT_V1', job.preset_id ?? 'GENERIC', job.source_digest, JSON.stringify(next), nowIso());

  const state = readBusinessState(businessId);
  const stateNext = {
    ...state,
    displayName: row.display_name,
    registrationCountry: row.registration_country,
    registrationType: row.registration_type,
    registrationId: row.registration_id,
  };
  for (const [label, [stateKey, kind]] of STATE_FIELD_MAPPING) {
    if (!Object.prototype.hasOwnProperty.call(fields, label)) continue;
    const raw = String(fields[label] ?? '').trim();
    if (job.update_policy === 'FILL_BLANK' && stateNext[stateKey] !== undefined && stateNext[stateKey] !== null && stateNext[stateKey] !== '') continue;
    stateNext[stateKey] = kind === 'number' ? parseNumber(raw) : kind === 'integer' ? parseInteger(raw) : (raw || null);
  }
  saveBusinessState(businessId, stateNext);
  return changed;
}
function nativePatch(fields, displayName) {
  const patch = { displayName };
  if (fields['官网']) patch.website = fields['官网'];
  if (fields.LinkedIn) patch.linkedinUrl = fields.LinkedIn;
  const revenue = parseNumber(fields['2025营收USD']);
  if (revenue !== null) {
    patch.annualRevenue = revenue;
    patch.annualRevenueCurrency = 'USD';
  }
  return patch;
}
function projectJob(row) {
  return {
    id: row.id,
    fileName: row.file_name,
    sourceDigest: row.source_digest ?? null,
    presetId: row.preset_id ?? null,
    defaultCountry: row.default_country ?? null,
    defaultRegistrationType: row.default_registration_type ?? null,
    updatePolicy: row.update_policy,
    importMode: row.import_mode,
    rowCount: row.row_count,
    uploadedRows: row.uploaded_rows,
    mappedFieldCount: row.mapped_field_count,
    protectedFieldCount: row.protected_field_count,
    status: row.status,
    actorUsername: row.actor_username ?? null,
    mapping: parseJson(row.mapping_json, []),
    summary: parseJson(row.summary_json, {}),
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function jobById(jobId) {
  const row = db.prepare('SELECT * FROM crm_company_import_job WHERE id=?').get(jobId);
  if (!row) throw httpError('company_import_job_not_found', 404);
  return row;
}
function updateJobSummary(jobId) {
  const counts = Object.fromEntries(
    db.prepare('SELECT status,COUNT(*) count FROM crm_company_import_row WHERE job_id=? GROUP BY status').all(jobId)
      .map((row) => [row.status, Number(row.count)]),
  );
  const actionCounts = Object.fromEntries(
    db.prepare("SELECT COALESCE(proposed_action,'UNPLANNED') action,COUNT(*) count FROM crm_company_import_row WHERE job_id=? GROUP BY proposed_action").all(jobId)
      .map((row) => [row.action, Number(row.count)]),
  );
  const job = jobById(jobId);
  const summary = { ...parseJson(job.summary_json, {}), statusCounts: counts, actionCounts };
  db.prepare('UPDATE crm_company_import_job SET summary_json=?,updated_at=? WHERE id=?').run(JSON.stringify(summary), nowIso(), jobId);
  return summary;
}
function validateFieldMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError('invalid_company_import_fields', 400);
  const output = {};
  let protectedCount = 0;
  for (const [key, raw] of Object.entries(value)) {
    if (typeof key !== 'string' || !key.trim() || key.length > 160) throw httpError('invalid_company_import_field_key', 400);
    if (typeof raw !== 'string' || raw.length > 30_000) throw httpError(`invalid_company_import_field:${key}`, 400);
    if (PROTECTED_FIELDS.has(key.trim())) {
      protectedCount += 1;
      continue;
    }
    output[key.trim()] = raw.trim();
  }
  return { fields: output, protectedCount };
}
async function preflightJob(actor, scope, jobId) {
  const job = jobById(jobId);
  if (job.uploaded_rows !== job.row_count) throw httpError('company_import_upload_incomplete', 409, { expected: job.row_count, actual: job.uploaded_rows });
  if (!['UPLOADED', 'PREFLIGHT_READY', 'PREFLIGHT_BLOCKED'].includes(job.status)) throw httpError('company_import_job_not_preflightable', 409, { status: job.status });

  const catalog = await canonicalAccounts(actor, scope);
  const byName = new Map();
  for (const record of catalog.records) {
    const key = normalizeName(record.displayName);
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push(record);
    byName.set(key, list);
  }

  const rows = db.prepare('SELECT * FROM crm_company_import_row WHERE job_id=? ORDER BY row_number').all(jobId);
  let create = 0;
  let update = 0;
  let conflict = 0;
  let unchanged = 0;
  let adopted = 0;
  const timestamp = nowIso();
  db.exec('BEGIN IMMEDIATE');
  try {
    const write = db.prepare('UPDATE crm_company_import_row SET match_business_id=?,proposed_action=?,reason=?,status=?,error_code=NULL,updated_at=? WHERE job_id=? AND row_number=?');
    for (const row of rows) {
      const fields = parseJson(row.fields_json, {});
      const registry = identityOwner(row.registration_country, row.registration_type, row.registration_id);
      const stateMatches = stateIdentityOwner(row.registration_country, row.registration_type, row.registration_id).filter(canonicalAccountExists);
      let match = null;
      let action = 'CREATE';
      let reason = 'identity_not_found';

      if (registry && canonicalAccountExists(registry)) {
        match = registry;
        action = 'UPDATE';
        reason = 'registration_identity_match';
      } else if (stateMatches.length === 1) {
        match = stateMatches[0];
        action = 'UPDATE';
        reason = 'company_state_identity_match';
      } else if (stateMatches.length > 1) {
        action = 'CONFLICT';
        reason = 'multiple_companies_share_registration_identity';
      } else {
        const nameMatches = (byName.get(normalizeName(row.display_name)) ?? []).filter((record) => compatibleFingerprint(fields, record));
        if (nameMatches.length === 1) {
          match = nameMatches[0].businessId;
          action = 'UPDATE';
          reason = 'unique_exact_name_adoption';
          adopted += 1;
        } else if (nameMatches.length > 1) {
          action = 'CONFLICT';
          reason = 'ambiguous_exact_name_match';
        }
      }

      if (job.import_mode === 'CREATE_ONLY' && action === 'UPDATE') {
        action = 'SKIP';
        reason = 'update_disabled';
      }
      if (job.import_mode === 'UPDATE_ONLY' && action === 'CREATE') {
        action = 'SKIP';
        reason = 'create_disabled';
      }

      if (action === 'CREATE') create += 1;
      else if (action === 'UPDATE') update += 1;
      else if (action === 'CONFLICT') conflict += 1;
      else unchanged += 1;

      write.run(
        match,
        action,
        reason,
        action === 'CONFLICT' ? 'CONFLICT' : action === 'SKIP' ? 'SKIPPED' : 'READY',
        timestamp,
        jobId,
        row.row_number,
      );
    }

    const existingCount = canonicalAccountCount();
    const fullLegacyCoverageRequired = existingCount === rows.length && existingCount > 0;
    const legacyCoverageUnsafe = fullLegacyCoverageRequired && (create > 0 || conflict > 0);
    const blocked = conflict > 0 || legacyCoverageUnsafe;
    const summary = {
      total: rows.length,
      create,
      update,
      unchanged,
      conflict,
      adopted,
      accountCatalogSource: catalog.source,
      accountCatalogCount: catalog.records.length,
      providerWarning: catalog.providerError,
      fullLegacyCoverageRequired,
      legacyCoverageUnsafe,
    };
    db.prepare('UPDATE crm_company_import_job SET status=?,summary_json=?,updated_at=? WHERE id=?')
      .run(blocked ? 'PREFLIGHT_BLOCKED' : 'PREFLIGHT_READY', JSON.stringify(summary), timestamp, jobId);
    db.exec('COMMIT');
    recordAudit(actor, 'crm.company_import.preflight', `CompanyImportJob:${jobId}`, summary);
    return projectJob(jobById(jobId));
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

const backgroundJobs = new Set();
async function runImportJob(jobId, actor, scope) {
  if (backgroundJobs.has(jobId)) return;
  backgroundJobs.add(jobId);
  try {
    const job = jobById(jobId);
    if (!['PREFLIGHT_READY', 'RUNNING', 'PARTIAL_FAILED'].includes(job.status)) return;
    if (!job.started_at) {
      db.prepare("UPDATE crm_company_import_job SET status='RUNNING',started_at=?,completed_at=NULL,updated_at=? WHERE id=?")
        .run(nowIso(), nowIso(), jobId);
    } else {
      db.prepare("UPDATE crm_company_import_job SET status='RUNNING',completed_at=NULL,updated_at=? WHERE id=?")
        .run(nowIso(), jobId);
    }

    while (true) {
      // FAILED rows are intentionally excluded. They move back to READY only through
      // the explicit retry endpoint, preventing a persistent failure from spinning forever.
      const rows = db.prepare("SELECT * FROM crm_company_import_row WHERE job_id=? AND status='READY' ORDER BY row_number LIMIT ?")
        .all(jobId, EXECUTION_CHUNK_SIZE);
      if (!rows.length) break;

      for (const row of rows) {
        const fields = parseJson(row.fields_json, {});
        let businessId = row.match_business_id;
        try {
          db.prepare("UPDATE crm_company_import_row SET status='RUNNING',error_code=NULL,provider_warning=NULL,updated_at=? WHERE job_id=? AND row_number=?")
            .run(nowIso(), jobId, row.row_number);

          if (row.proposed_action === 'CREATE') {
            businessId = businessId || row.business_id || randomUUID();
            const provider = resolveProvider('crm.v1.account.create', scope);
            if (!provider) throw httpError('capability_unavailable', 503, { capability: 'crm.v1.account.create' });
            const created = await invokeProvider(provider, 'crm.v1.account.create', actor, scope, {
              businessId,
              displayName: row.display_name,
            });
            if (!created.body?.record) throw httpError('provider_record_missing', 502);
            ensureBusinessMapping(actor, provider, businessId, created.body.record, jobId);
            claimIdentity(businessId, row, jobId);
            applyAuthority(job, row, businessId);

            const patch = nativePatch(fields, row.display_name);
            if (Object.keys(patch).length > 1) {
              try {
                await invokeProvider(provider, 'crm.ops.v1.account.update', actor, scope, {
                  externalId: created.body.record.externalId,
                  ...patch,
                });
              } catch (error) {
                db.prepare('UPDATE crm_company_import_row SET provider_warning=? WHERE job_id=? AND row_number=?')
                  .run(error instanceof Error ? error.message : 'provider_sync_failed', jobId, row.row_number);
              }
            }
          } else if (row.proposed_action === 'UPDATE') {
            if (!businessId) throw httpError('company_import_update_missing_business_id', 409);

            // Local GBAP identity + authority is the import result. Provider/native
            // synchronization is strictly downstream best-effort for existing accounts.
            claimIdentity(businessId, row, jobId);
            applyAuthority(job, row, businessId);

            const mapping = findMappingByBusinessId(businessId);
            const provider = mapping ? providerById(mapping.provider_id, scope) : null;
            if (!provider || !mapping) {
              db.prepare('UPDATE crm_company_import_row SET provider_warning=? WHERE job_id=? AND row_number=?')
                .run('provider_mapping_unavailable', jobId, row.row_number);
            } else {
              try {
                await invokeProvider(provider, 'crm.ops.v1.account.update', actor, scope, {
                  externalId: mapping.external_id,
                  ...nativePatch(fields, row.display_name),
                });
              } catch (error) {
                db.prepare('UPDATE crm_company_import_row SET provider_warning=? WHERE job_id=? AND row_number=?')
                  .run(error instanceof Error ? error.message : 'provider_sync_failed', jobId, row.row_number);
              }
            }
          }

          db.prepare("UPDATE crm_company_import_row SET status='COMPLETE',business_id=?,updated_at=? WHERE job_id=? AND row_number=?")
            .run(businessId, nowIso(), jobId, row.row_number);
        } catch (error) {
          db.prepare("UPDATE crm_company_import_row SET status='FAILED',business_id=?,error_code=?,updated_at=? WHERE job_id=? AND row_number=?")
            .run(businessId, error instanceof Error ? error.message : 'company_import_row_failed', nowIso(), jobId, row.row_number);
        }
      }

      updateJobSummary(jobId);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const summary = updateJobSummary(jobId);
    const failed = Number(summary.statusCounts?.FAILED ?? 0);
    const ready = Number(summary.statusCounts?.READY ?? 0);
    const completedAt = nowIso();
    const finalStatus = failed > 0 || ready > 0 ? 'PARTIAL_FAILED' : 'COMPLETED';
    db.prepare('UPDATE crm_company_import_job SET status=?,completed_at=?,updated_at=? WHERE id=?')
      .run(finalStatus, completedAt, completedAt, jobId);
    recordAudit(actor, 'crm.company_import.complete', `CompanyImportJob:${jobId}`, {
      ...summary,
      failed,
      resumableReady: ready,
    });
  } finally {
    backgroundJobs.delete(jobId);
  }
}

export function createCompanyImportNativeHandler() {
  return async function handleCompanyImportNative(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (!url.pathname.startsWith('/api/crm-native/company-import')) return false;
    if (req.method === 'OPTIONS') {
      res.writeHead(204, responseHeaders());
      res.end();
      return true;
    }

    try {
      const actor = await authenticate(req);
      requireAdmin(actor);
      const scope = parseScope(req);

      if (req.method === 'POST' && url.pathname === '/api/crm-native/company-import/jobs') {
        const input = await readJson(req);
        const rowCount = Number(input.rowCount);
        if (!Number.isInteger(rowCount) || rowCount < 1 || rowCount > MAX_JOB_ROWS) {
          throw httpError('invalid_company_import_row_count', 400, { max: MAX_JOB_ROWS });
        }
        const mapping = Array.isArray(input.mapping) ? input.mapping : [];
        const mappedKeys = new Set(mapping.map((item) => item?.targetKey).filter((value) => typeof value === 'string' && value));
        const protectedCount = [...mappedKeys].filter((key) => PROTECTED_FIELDS.has(key)).length;
        const jobId = randomUUID();
        const timestamp = nowIso();
        db.prepare(`INSERT INTO crm_company_import_job(
          id,file_name,source_digest,preset_id,default_country,default_registration_type,update_policy,import_mode,row_count,
          uploaded_rows,mapped_field_count,protected_field_count,status,actor_subject,actor_username,mapping_json,summary_json,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,0,?,?,'UPLOADING',?,?,?,?,?,?)`).run(
          jobId,
          requiredText(input.fileName, 'file_name', 512),
          optionalText(input.sourceDigest, 128),
          optionalText(input.presetId, 128),
          optionalText(input.defaultCountry, 2)?.toUpperCase() ?? null,
          optionalText(input.defaultRegistrationType, 64)?.toUpperCase() ?? null,
          input.updatePolicy === 'FILL_BLANK' ? 'FILL_BLANK' : 'OVERWRITE_MAPPED',
          ['CREATE_ONLY', 'UPDATE_ONLY'].includes(input.importMode) ? input.importMode : 'UPSERT',
          rowCount,
          mappedKeys.size - protectedCount,
          protectedCount,
          actor.subject,
          actor.username,
          JSON.stringify(mapping),
          JSON.stringify({ total: rowCount, protectedCells: 0 }),
          timestamp,
          timestamp,
        );
        recordAudit(actor, 'crm.company_import.create', `CompanyImportJob:${jobId}`, {
          rowCount,
          mappedFieldCount: mappedKeys.size - protectedCount,
          protectedFieldCount: protectedCount,
        });
        json(res, 201, projectJob(jobById(jobId)));
        return true;
      }

      const rowsMatch = url.pathname.match(/^\/api\/crm-native\/company-import\/jobs\/([^/]+)\/rows$/);
      if (req.method === 'POST' && rowsMatch) {
        const jobId = decodeURIComponent(rowsMatch[1]);
        const job = jobById(jobId);
        if (job.actor_subject !== actor.subject) throw httpError('company_import_job_owner_mismatch', 403);
        if (job.status !== 'UPLOADING') throw httpError('company_import_job_not_uploading', 409, { status: job.status });
        const input = await readJson(req);
        if (!Array.isArray(input.rows) || input.rows.length < 1 || input.rows.length > ROW_UPLOAD_LIMIT) {
          throw httpError('invalid_company_import_row_chunk', 400, { max: ROW_UPLOAD_LIMIT });
        }

        const timestamp = nowIso();
        let protectedCellsInChunk = 0;
        db.exec('BEGIN IMMEDIATE');
        try {
          const insert = db.prepare(`INSERT INTO crm_company_import_row(
            job_id,row_number,display_name,registration_country,registration_type,registration_id,fields_json,status,created_at,updated_at
          ) VALUES(?,?,?,?,?,?,?,'UPLOADED',?,?)`);
          for (const raw of input.rows) {
            const rowNumber = Number(raw?.rowNumber);
            if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > MAX_JOB_ROWS + 1) throw httpError('invalid_company_import_row_number', 400);
            const displayName = requiredText(raw.displayName, 'display_name', 512);
            const country = normalizeCountry(raw.registrationCountry || job.default_country);
            const type = normalizeRegistrationType(raw.registrationType || job.default_registration_type);
            const registrationId = normalizeRegistrationId(raw.registrationId, country, type);
            const validated = validateFieldMap(raw.fields);
            protectedCellsInChunk += validated.protectedCount;
            insert.run(jobId, rowNumber, displayName, country, type, registrationId, JSON.stringify(validated.fields), timestamp, timestamp);
          }

          const count = Number(db.prepare('SELECT COUNT(*) count FROM crm_company_import_row WHERE job_id=?').get(jobId)?.count ?? 0);
          const status = count === job.row_count ? 'UPLOADED' : 'UPLOADING';
          const previousSummary = parseJson(job.summary_json, {});
          const summary = {
            ...previousSummary,
            protectedCells: Number(previousSummary.protectedCells ?? 0) + protectedCellsInChunk,
          };
          db.prepare('UPDATE crm_company_import_job SET uploaded_rows=?,status=?,summary_json=?,updated_at=? WHERE id=?')
            .run(count, status, JSON.stringify(summary), timestamp, jobId);
          db.exec('COMMIT');
          json(res, 200, projectJob(jobById(jobId)));
          return true;
        } catch (error) {
          try { db.exec('ROLLBACK'); } catch {}
          throw error;
        }
      }

      const preflightMatch = url.pathname.match(/^\/api\/crm-native\/company-import\/jobs\/([^/]+)\/preflight$/);
      if (req.method === 'POST' && preflightMatch) {
        json(res, 200, await preflightJob(actor, scope, decodeURIComponent(preflightMatch[1])));
        return true;
      }

      const startMatch = url.pathname.match(/^\/api\/crm-native\/company-import\/jobs\/([^/]+)\/start$/);
      if (req.method === 'POST' && startMatch) {
        const jobId = decodeURIComponent(startMatch[1]);
        const job = jobById(jobId);
        if (!['PREFLIGHT_READY', 'PARTIAL_FAILED'].includes(job.status)) throw httpError('company_import_job_not_startable', 409, { status: job.status });
        db.prepare("UPDATE crm_company_import_job SET status='RUNNING',started_at=COALESCE(started_at,?),completed_at=NULL,updated_at=? WHERE id=?")
          .run(nowIso(), nowIso(), jobId);
        setImmediate(() => { void runImportJob(jobId, { subject: actor.subject, username: actor.username }, scope); });
        json(res, 202, projectJob(jobById(jobId)));
        return true;
      }

      const retryMatch = url.pathname.match(/^\/api\/crm-native\/company-import\/jobs\/([^/]+)\/retry-failed$/);
      if (req.method === 'POST' && retryMatch) {
        const jobId = decodeURIComponent(retryMatch[1]);
        jobById(jobId);
        db.prepare("UPDATE crm_company_import_row SET status='READY',error_code=NULL WHERE job_id=? AND status IN ('FAILED','RUNNING')").run(jobId);
        db.prepare("UPDATE crm_company_import_job SET status='PARTIAL_FAILED',completed_at=NULL,updated_at=? WHERE id=?").run(nowIso(), jobId);
        setImmediate(() => { void runImportJob(jobId, { subject: actor.subject, username: actor.username }, scope); });
        json(res, 202, projectJob(jobById(jobId)));
        return true;
      }

      if (req.method === 'GET' && url.pathname === '/api/crm-native/company-import/jobs') {
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 20), 1), 100);
        const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0);
        const rows = db.prepare('SELECT * FROM crm_company_import_job ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
        const total = Number(db.prepare('SELECT COUNT(*) count FROM crm_company_import_job').get()?.count ?? 0);
        json(res, 200, { jobs: rows.map(projectJob), total, limit, offset });
        return true;
      }

      const jobMatch = url.pathname.match(/^\/api\/crm-native\/company-import\/jobs\/([^/]+)$/);
      if (req.method === 'GET' && jobMatch) {
        const jobId = decodeURIComponent(jobMatch[1]);
        const job = jobById(jobId);
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50), 1), 200);
        const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0);
        const status = url.searchParams.get('status');
        const rows = status
          ? db.prepare('SELECT * FROM crm_company_import_row WHERE job_id=? AND status=? ORDER BY row_number LIMIT ? OFFSET ?').all(jobId, status, limit, offset)
          : db.prepare('SELECT * FROM crm_company_import_row WHERE job_id=? ORDER BY row_number LIMIT ? OFFSET ?').all(jobId, limit, offset);
        json(res, 200, {
          job: projectJob(job),
          rows: rows.map((row) => ({
            rowNumber: row.row_number,
            displayName: row.display_name,
            registrationCountry: row.registration_country,
            registrationType: row.registration_type,
            registrationId: row.registration_id,
            proposedAction: row.proposed_action,
            reason: row.reason,
            status: row.status,
            businessId: row.business_id ?? row.match_business_id ?? null,
            providerWarning: row.provider_warning ?? null,
            errorCode: row.error_code ?? null,
          })),
          total: Number(db.prepare('SELECT COUNT(*) count FROM crm_company_import_row WHERE job_id=?').get(jobId)?.count ?? 0),
          limit,
          offset,
        });
        return true;
      }

      throw httpError('company_import_route_not_found', 404);
    } catch (error) {
      if (!res.headersSent) {
        json(res, error.httpStatus ?? 500, {
          error: error.message ?? 'company_import_failed',
          detail: error.detail ?? null,
        });
      }
      return true;
    }
  };
}
