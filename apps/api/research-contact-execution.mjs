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
const EXECUTION_CONFIRMATION = 'EXECUTE_TOP500_RESEARCH_CONTACTS';
const CONTACT_CHUNK_SIZE = 25;
const ROLE_KEYS = ['LEGAL_REP', 'BUSINESS_DECISION', 'PLANT_OPERATIONS', 'ENERGY_MAINTENANCE', 'PROCUREMENT', 'RECOMMENDED'];
const ROLE_LABELS = {
  LEGAL_REP: '法人/代表人',
  BUSINESS_DECISION: '首选业务决策人',
  PLANT_OPERATIONS: '工厂/运营负责人',
  ENERGY_MAINTENANCE: '工程/能源/维护负责人',
  PROCUREMENT: '采购负责人',
  RECOMMENDED: '推荐优先寻找职位',
};
const PERSON_RISK = /(历史|需.{0,12}(确认|核验|终核|回读)|二次确认|非部门负责人|技术入口|现任岗位仍建议|任职时效|职级存在差异|现任.*未公开|公司法人代表链|^\d{4}\s|文件：|目录未标更新时间)/i;
const CHANNEL_RISK = /(招聘|人才|内部转接|非采购|非.*专线|非.*邮箱|HR|人力|供应商注册|Quiero ser proveedor)/i;
const GENERIC_EMAIL_LOCAL = /^(info|contacto|contact|ventas|compras|seleccion|talento|talentohumano|rrhh|hr|proveedor|proveedores|suministros|servicio|atencion)$/i;

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
db.exec(`
CREATE TABLE IF NOT EXISTS crm_target_role (
  business_id TEXT PRIMARY KEY,
  account_business_id TEXT NOT NULL,
  role_key TEXT NOT NULL,
  state_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(account_business_id, role_key)
) STRICT;
CREATE TABLE IF NOT EXISTS crm_research_contact_snapshot (
  batch_id TEXT NOT NULL REFERENCES crm_research_import_batch(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(batch_id,row_number)
) STRICT;
CREATE TABLE IF NOT EXISTS crm_research_contact_execution_item (
  batch_id TEXT NOT NULL REFERENCES crm_research_import_batch(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  role_key TEXT NOT NULL,
  contact_business_id TEXT,
  target_role_business_id TEXT,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  provider_id TEXT,
  external_id TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(batch_id,row_number,role_key)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_crm_research_contact_execution_batch
ON crm_research_contact_execution_item(batch_id,row_number,role_key);
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
async function readJson(req, maxBytes = 8 * 1024 * 1024) {
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
function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
function recordAudit(actor, action, target, payload = {}) {
  if (!tableExists('audit_event')) return;
  db.prepare('INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)')
    .run(randomUUID(), actor.subject, actor.username, action, target, nowIso(), JSON.stringify(payload));
}
function optionalText(value, label, max = 30_000) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) throw httpError(`invalid_${label}`, 400);
  return value.trim();
}
function normalizeName(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function parsePersonText(raw, fallbackTitle = null) {
  const text = optionalText(raw, 'research_person_text') ?? '';
  if (!text) return { raw: '', name: null, jobTitle: fallbackTitle, ambiguous: false, risky: false };
  const ambiguous = /；/.test(text) || (/\b(?:y|and)\b/i.test(text) && (text.match(/｜/g) ?? []).length > 1);
  const first = text.split('；')[0].trim();
  let namePart = first;
  let titlePart = fallbackTitle;
  const pipeIndex = first.indexOf('｜');
  const dashMatch = first.match(/\s[—–-]\s/);
  if (pipeIndex >= 0) {
    namePart = first.slice(0, pipeIndex).trim();
    titlePart = first.slice(pipeIndex + 1).trim();
  } else if (dashMatch?.index !== undefined) {
    namePart = first.slice(0, dashMatch.index).trim();
    titlePart = first.slice(dashMatch.index + dashMatch[0].length).trim();
  }
  namePart = namePart.replace(/（.*$/, '').replace(/,\s*(MBA|MSc|PhD)\.?$/i, '').trim();
  titlePart = titlePart ? titlePart.replace(/（.*$/, '').trim() : null;
  const looksCompany = /(S\.?A\.?S?\.?|CIA\.?|GRUPO|SERVICES|CORPORACION|CORPORACIÓN)/i.test(namePart);
  const hasLetter = /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(namePart);
  const words = namePart.split(/\s+/).filter(Boolean);
  const risky = PERSON_RISK.test(text) || looksCompany || !hasLetter || words.length < 2 || namePart.length > 140;
  return { raw: text, name: risky ? null : namePart, jobTitle: titlePart || null, ambiguous, risky };
}
function roleGap(verificationText, roleKey) {
  if (roleKey === 'LEGAL_REP' || roleKey === 'RECOMMENDED') return false;
  const label = ROLE_LABELS[roleKey];
  const v43 = String(verificationText ?? '').match(/v43\s*TOP100决策链剩余缺口：([^；。]*)/i);
  if (v43) return v43[1].includes(label);
  const v42 = String(verificationText ?? '').match(/v42\s*TOP100决策链状态：仍未获得同时满足[^=]*=([^；。]*)/i);
  return Boolean(v42?.[1]?.includes(label));
}
function candidateNameMentionedPositive(name, verificationText) {
  const normalized = String(verificationText ?? '');
  const tokens = name.split(/\s+/).filter((token) => token.length >= 4);
  const mentioned = tokens.some((token) => normalized.toLocaleLowerCase().includes(token.toLocaleLowerCase()));
  return mentioned && /(当前|2026|官网|官方|公开|确认|交叉)/.test(normalized);
}
function classifyCandidate(roleKey, candidate) {
  const parsed = parsePersonText(candidate.personText, candidate.titleText);
  if (!parsed.name || parsed.ambiguous) {
    return {
      ...parsed,
      personVerified: false,
      roleVerified: false,
      reason: parsed.ambiguous ? 'multiple_or_ambiguous_people' : 'person_not_safe_for_contact',
    };
  }
  const verification = candidate.verificationText ?? '';
  if (roleKey === 'LEGAL_REP') {
    const verified = !PERSON_RISK.test(`${parsed.raw} ${verification}`);
    return {
      ...parsed,
      personVerified: verified,
      roleVerified: verified,
      reason: verified ? 'clean_public_legal_representative' : 'legal_representative_needs_recheck',
    };
  }
  const gap = roleGap(verification, roleKey);
  const label = ROLE_LABELS[roleKey];
  const officialSpecific = verification.includes(`v41：${label}已补充；公司官网`)
    || (verification.includes(`v41补充：${parsed.name}`) && /公司官网/.test(verification));
  const fourComplete = /v42\s*TOP100四类决策链均已有实名入口/.test(verification);
  const positiveMention = candidateNameMentionedPositive(parsed.name, verification);
  const personVerified = !gap && (officialSpecific || fourComplete || positiveMention);
  const nameIndex = verification.indexOf(parsed.name);
  const nearbyVerification = nameIndex >= 0
    ? verification.slice(Math.max(0, nameIndex - 80), nameIndex + 180)
    : verification;
  const roleVerified = personVerified && !/(技术入口|非部门负责人|职责范围需确认|具体厂区需确认|决策权限)/.test(`${parsed.raw} ${nearbyVerification}`);
  return {
    ...parsed,
    personVerified,
    roleVerified,
    reason: personVerified
      ? (roleVerified ? 'named_current_role_supported' : 'named_current_person_role_scope_open')
      : (gap ? 'role_still_unverified' : 'insufficient_current_person_evidence'),
  };
}
function safeDirectChannels(raw) {
  const text = optionalText(raw, 'candidate_contact_text') ?? '';
  if (!text || CHANNEL_RISK.test(text)) return { email: null, phone: null, linkedinUrl: null };
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  let email = emailMatch?.[0] ?? null;
  if (email && GENERIC_EMAIL_LOCAL.test(email.split('@')[0])) email = null;
  const linkedinMatch = text.match(/https?:\/\/(?:[a-z]{2}\.)?linkedin\.com\/in\/[^\s；,)]+/i);
  const phoneMatch = text.match(/\+?\d[\d\s().-]{6,}\d/);
  return { email, phone: phoneMatch?.[0]?.trim() ?? null, linkedinUrl: linkedinMatch?.[0] ?? null };
}
function validateSnapshot(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError('invalid_contact_snapshot', 400);
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  if (candidates.length > 5) throw httpError('too_many_research_contact_candidates', 400);
  const seen = new Set();
  const normalizedCandidates = candidates.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw httpError('invalid_research_contact_candidate', 400);
    const roleKey = String(item.roleKey ?? '').trim().toUpperCase();
    if (!ROLE_KEYS.includes(roleKey) || roleKey === 'RECOMMENDED' || seen.has(roleKey)) throw httpError('invalid_research_contact_role', 400);
    seen.add(roleKey);
    return {
      roleKey,
      personText: optionalText(item.personText, 'person_text'),
      titleText: optionalText(item.titleText, 'title_text'),
      contactText: optionalText(item.contactText, 'contact_text'),
      verificationText: optionalText(item.verificationText, 'verification_text'),
      source: optionalText(item.source, 'source', 512),
    };
  });
  return {
    candidates: normalizedCandidates,
    recommendedSearchText: optionalText(input.recommendedSearchText, 'recommended_search_text'),
    verificationText: optionalText(input.verificationText, 'verification_text'),
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
  if (!['DRY_RUN_READY', 'DRY_RUN_BLOCKED'].includes(batch.status)) {
    throw httpError('research_contact_snapshot_batch_not_attachable', 409, { status: batch.status });
  }
  if (!input || !Array.isArray(input.contacts) || input.contacts.length !== batch.row_count) {
    throw httpError('contact_snapshot_row_count_mismatch', 409, {
      expected: batch.row_count,
      actual: Array.isArray(input?.contacts) ? input.contacts.length : null,
    });
  }
  const expected = new Set(
    db.prepare('SELECT row_number FROM crm_research_import_item WHERE batch_id=?').all(batchId).map((row) => row.row_number),
  );
  const seen = new Set();
  const rows = input.contacts.map((item) => {
    if (!item || typeof item !== 'object') throw httpError('invalid_contact_snapshot_item', 400);
    const rowNumber = Number(item.rowNumber);
    if (!Number.isInteger(rowNumber) || !expected.has(rowNumber) || seen.has(rowNumber)) {
      throw httpError('invalid_contact_snapshot_row', 409, { rowNumber });
    }
    seen.add(rowNumber);
    return { rowNumber, snapshot: validateSnapshot(item.contactSnapshot ?? {}) };
  });
  const timestamp = nowIso();
  db.exec('BEGIN IMMEDIATE');
  try {
    const upsert = db.prepare(`
      INSERT INTO crm_research_contact_snapshot(batch_id,row_number,snapshot_json,created_at,updated_at)
      VALUES(?,?,?,?,?)
      ON CONFLICT(batch_id,row_number) DO UPDATE SET snapshot_json=excluded.snapshot_json,updated_at=excluded.updated_at
    `);
    let namedCandidates = 0;
    for (const row of rows) {
      namedCandidates += row.snapshot.candidates.filter((item) => item.personText).length;
      upsert.run(batchId, row.rowNumber, JSON.stringify(row.snapshot), timestamp, timestamp);
    }
    const summary = { ...parseSummary(batch), contactSnapshotCount: rows.length, namedCandidateCount: namedCandidates };
    db.prepare('UPDATE crm_research_import_batch SET summary_json=?,updated_at=? WHERE id=?')
      .run(JSON.stringify(summary), timestamp, batchId);
    recordAudit(actor, 'crm.research_intake.contact_snapshot.attach', `ResearchImportBatch:${batchId}`, {
      rowCount: rows.length,
      namedCandidateCount: namedCandidates,
    });
    db.exec('COMMIT');
    return { batchId, rowCount: rows.length, namedCandidateCount: namedCandidates };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
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
  return db.prepare(`
    SELECT p.*,b.capability,b.priority
    FROM capability_binding b
    JOIN provider_registration p ON p.id=b.provider_id
    WHERE b.capability=? AND b.enabled=1 AND p.enabled=1 AND p.environment_scope=?
      AND (p.organization_scope IS NULL OR p.organization_scope=?)
      AND (p.workspace_scope IS NULL OR p.workspace_scope=?)
    ORDER BY CASE WHEN p.workspace_scope IS NULL THEN 0 ELSE 1 END DESC,
      CASE WHEN p.organization_scope IS NULL THEN 0 ELSE 1 END DESC,
      b.priority DESC,p.id ASC LIMIT 1
  `).get(capability, scope.environment, scope.organization, scope.workspace);
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
  if (!response.ok) {
    throw httpError('provider_unavailable', 503, {
      providerId: provider.id,
      upstreamStatus: response.status,
      upstreamError: body.error ?? null,
    });
  }
  return { providerId: provider.id, body };
}
function accountMapping(providerId, accountBusinessId) {
  return db.prepare("SELECT * FROM external_mapping WHERE provider_id=? AND business_type='Account' AND business_id=? ORDER BY created_at DESC LIMIT 1")
    .get(providerId, accountBusinessId);
}
function mappingByExternal(providerId, externalId) {
  return db.prepare("SELECT * FROM external_mapping WHERE provider_id=? AND external_type='person' AND external_id=? ORDER BY created_at DESC LIMIT 1")
    .get(providerId, externalId);
}
function ensureContactMapping(actor, providerId, businessId, record, batchId) {
  if (!record?.externalId) throw httpError('provider_record_missing_external_identity', 502);
  const byBusiness = db.prepare("SELECT * FROM external_mapping WHERE provider_id=? AND business_type='Contact' AND business_id=? ORDER BY created_at DESC LIMIT 1")
    .get(providerId, businessId);
  if (byBusiness) {
    if (byBusiness.external_id !== record.externalId) throw httpError('contact_business_mapping_conflict', 409);
    return byBusiness;
  }
  const byExternal = mappingByExternal(providerId, record.externalId);
  if (byExternal && (byExternal.business_type !== 'Contact' || byExternal.business_id !== businessId)) {
    throw httpError('contact_external_mapping_conflict', 409);
  }
  const id = randomUUID();
  db.prepare('INSERT INTO external_mapping(id,business_type,business_id,provider_id,external_type,external_id,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(id, 'Contact', businessId, providerId, 'person', record.externalId, nowIso());
  recordAudit(actor, 'mapping.create', `mapping:${id}`, {
    businessType: 'Contact', businessId, providerId, source: 'research-import', batchId,
  });
  return { provider_id: providerId, business_id: businessId, external_id: record.externalId };
}
function upsertTargetRole(actor, accountBusinessId, roleKey, state) {
  const existing = db.prepare('SELECT * FROM crm_target_role WHERE account_business_id=? AND role_key=?')
    .get(accountBusinessId, roleKey);
  const timestamp = nowIso();
  if (!existing) {
    const businessId = randomUUID();
    db.prepare('INSERT INTO crm_target_role(business_id,account_business_id,role_key,state_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(businessId, accountBusinessId, roleKey, JSON.stringify(state), actor.subject, timestamp, timestamp);
    recordAudit(actor, 'crm.target_role.create', `TargetRole:${businessId}`, {
      accountBusinessId, roleKey, source: 'research-import',
    });
    return businessId;
  }
  let current = {};
  try { current = JSON.parse(existing.state_json); } catch {}
  const next = { ...current };
  for (const [key, value] of Object.entries(state)) {
    if ((next[key] === undefined || next[key] === null || next[key] === '') && value !== undefined && value !== null && value !== '') {
      next[key] = value;
    }
  }
  if (state.resolvedContactBusinessId && !current.resolvedContactBusinessId) {
    next.resolvedContactBusinessId = state.resolvedContactBusinessId;
    if (state.status === 'RESOLVED') next.status = 'RESOLVED';
  }
  db.prepare('UPDATE crm_target_role SET state_json=?,updated_at=? WHERE business_id=?')
    .run(JSON.stringify(next), timestamp, existing.business_id);
  return existing.business_id;
}
function reserveJournal(batchId, rowNumber, roleKey) {
  const existing = db.prepare('SELECT * FROM crm_research_contact_execution_item WHERE batch_id=? AND row_number=? AND role_key=?')
    .get(batchId, rowNumber, roleKey);
  if (existing) return existing;
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO crm_research_contact_execution_item(batch_id,row_number,role_key,action,status,attempt_count,created_at,updated_at)
    VALUES(?,?,?,'PENDING','RESERVED',0,?,?)
  `).run(batchId, rowNumber, roleKey, timestamp, timestamp);
  return db.prepare('SELECT * FROM crm_research_contact_execution_item WHERE batch_id=? AND row_number=? AND role_key=?')
    .get(batchId, rowNumber, roleKey);
}
function markJournal(batchId, rowNumber, roleKey, values) {
  const fields = [];
  const params = [];
  for (const [key, value] of Object.entries(values)) {
    fields.push(`${key}=?`);
    params.push(value);
  }
  fields.push('updated_at=?');
  params.push(nowIso(), batchId, rowNumber, roleKey);
  db.prepare(`UPDATE crm_research_contact_execution_item SET ${fields.join(',')} WHERE batch_id=? AND row_number=? AND role_key=?`)
    .run(...params);
}
async function listProviderContacts(provider, actor, scope, cache) {
  if (cache.has(provider.id)) return cache.get(provider.id);
  const result = await invokeProvider(provider, 'crm.v1.contact.list', actor, scope, { limit: 10_000 });
  const records = Array.isArray(result.body?.records) ? result.body.records : [];
  cache.set(provider.id, records);
  return records;
}
function fillPatch(current, candidate, accountExternalId) {
  const patch = {};
  const channels = safeDirectChannels(candidate.contactText);
  if (!current?.accountExternalId && accountExternalId) patch.accountExternalId = accountExternalId;
  if (!current?.jobTitle && candidate.parsed.jobTitle) patch.jobTitle = candidate.parsed.jobTitle;
  if (!current?.email && channels.email) patch.email = channels.email;
  if (!current?.phone && channels.phone) patch.phone = channels.phone;
  if (!current?.linkedinUrl && channels.linkedinUrl) patch.linkedinUrl = channels.linkedinUrl;
  return patch;
}
async function executeCandidate(req, actor, batchId, row, roleKey, rawCandidate, cache) {
  const journal = reserveJournal(batchId, row.row_number, roleKey);
  if (['COMPLETE', 'TARGET_ROLE_ONLY', 'CONFLICT', 'SKIPPED'].includes(journal.status)) return;
  markJournal(batchId, row.row_number, roleKey, {
    status: 'RUNNING',
    attempt_count: journal.attempt_count + 1,
    error_code: null,
  });

  const classification = classifyCandidate(roleKey, rawCandidate);
  const baseRoleState = {
    roleTitleText: classification.jobTitle || ROLE_LABELS[roleKey],
    candidateName: classification.name || optionalText(rawCandidate.personText, 'candidate_name'),
    candidateContactText: optionalText(rawCandidate.contactText, 'candidate_contact_text'),
    verificationNote: optionalText(rawCandidate.verificationText, 'verification_text'),
    recommendedSearchText: null,
    source: optionalText(rawCandidate.source, 'source', 512),
    status: 'OPEN',
    resolvedContactBusinessId: null,
    researchDecision: classification.reason,
  };
  let targetRoleBusinessId = upsertTargetRole(actor, row.account_business_id, roleKey, baseRoleState);

  if (!classification.personVerified) {
    markJournal(batchId, row.row_number, roleKey, {
      status: 'TARGET_ROLE_ONLY',
      action: 'TARGET_ROLE_ONLY',
      target_role_business_id: targetRoleBusinessId,
      contact_business_id: null,
      provider_id: null,
      external_id: null,
      error_code: null,
    });
    recordAudit(actor, 'crm.research_intake.contact_execute_item', `Account:${row.account_business_id}`, {
      batchId, rowNumber: row.row_number, roleKey, action: 'TARGET_ROLE_ONLY', reason: classification.reason,
    });
    return;
  }

  const scope = parseScope(req);
  const provider = resolveProvider('crm.v1.contact.create', scope);
  if (!provider) throw httpError('capability_unavailable', 503, { capability: 'crm.v1.contact.create' });
  const updateBinding = db.prepare('SELECT 1 FROM capability_binding WHERE capability=? AND provider_id=? AND enabled=1')
    .get('crm.ops.v1.contact.update', provider.id);
  if (!updateBinding) throw httpError('contact_update_capability_unavailable_for_provider', 503, { providerId: provider.id });
  const account = accountMapping(provider.id, row.account_business_id);
  if (!account) {
    throw httpError('research_contact_account_mapping_missing', 409, {
      accountBusinessId: row.account_business_id,
      providerId: provider.id,
    });
  }

  const contacts = await listProviderContacts(provider, actor, scope, cache);
  const matches = contacts.filter((item) => (
    normalizeName(item.personName) === normalizeName(classification.name)
    && item.accountExternalId === account.external_id
  ));
  if (matches.length > 1) {
    markJournal(batchId, row.row_number, roleKey, {
      status: 'CONFLICT',
      action: 'CONTACT_CONFLICT',
      target_role_business_id: targetRoleBusinessId,
      error_code: 'multiple_matching_contacts',
    });
    return;
  }

  let contactBusinessId = journal.contact_business_id || null;
  let current = matches[0] ?? null;
  let mapping = current ? mappingByExternal(provider.id, current.externalId) : null;
  if (mapping?.business_type === 'Contact') contactBusinessId = mapping.business_id;
  if (!contactBusinessId) contactBusinessId = randomUUID();

  // Persist the GBAP businessId before touching the provider. If the provider
  // creates/upserts the person but the request fails before GBAP mapping is
  // persisted, a retry must reuse this exact UUID so provider idempotency holds.
  markJournal(batchId, row.row_number, roleKey, {
    contact_business_id: contactBusinessId,
    target_role_business_id: targetRoleBusinessId,
    provider_id: provider.id,
  });

  if (!current) {
    const channels = safeDirectChannels(rawCandidate.contactText);
    const created = await invokeProvider(provider, 'crm.v1.contact.create', actor, scope, {
      businessId: contactBusinessId,
      personName: classification.name,
      email: channels.email,
      accountExternalId: account.external_id,
    });
    current = created.body?.record;
    if (!current) throw httpError('provider_record_missing', 502);
    mapping = ensureContactMapping(actor, provider.id, contactBusinessId, current, batchId);
    contacts.push(current);
  } else if (!mapping) {
    mapping = ensureContactMapping(actor, provider.id, contactBusinessId, current, batchId);
  }

  const patch = fillPatch(current, { ...rawCandidate, parsed: classification }, account.external_id);
  if (Object.keys(patch).length > 0) {
    const updated = await invokeProvider(provider, 'crm.ops.v1.contact.update', actor, scope, {
      externalId: current.externalId,
      ...patch,
    });
    if (updated.body?.record) Object.assign(current, updated.body.record);
  }

  targetRoleBusinessId = upsertTargetRole(actor, row.account_business_id, roleKey, {
    resolvedContactBusinessId: contactBusinessId,
    status: classification.roleVerified ? 'RESOLVED' : 'OPEN',
  });
  markJournal(batchId, row.row_number, roleKey, {
    status: 'COMPLETE',
    action: matches.length ? 'LINK_EXISTING_CONTACT' : 'CREATE_CONTACT',
    contact_business_id: contactBusinessId,
    target_role_business_id: targetRoleBusinessId,
    provider_id: provider.id,
    external_id: current.externalId,
    error_code: null,
  });
  recordAudit(actor, 'crm.research_intake.contact_execute_item', `Contact:${contactBusinessId}`, {
    batchId,
    rowNumber: row.row_number,
    roleKey,
    action: matches.length ? 'LINK_EXISTING_CONTACT' : 'CREATE_CONTACT',
    roleResolved: classification.roleVerified,
    fields: Object.keys(patch),
  });
}
function executeRecommended(actor, batchId, row, snapshot) {
  if (!snapshot.recommendedSearchText) return;
  const roleKey = 'RECOMMENDED';
  const journal = reserveJournal(batchId, row.row_number, roleKey);
  if (['COMPLETE', 'TARGET_ROLE_ONLY'].includes(journal.status)) return;
  const targetRoleBusinessId = upsertTargetRole(actor, row.account_business_id, roleKey, {
    roleTitleText: '推荐优先寻找职位',
    candidateName: null,
    candidateContactText: null,
    verificationNote: snapshot.verificationText,
    recommendedSearchText: snapshot.recommendedSearchText,
    source: snapshot.source,
    status: 'OPEN',
    resolvedContactBusinessId: null,
  });
  markJournal(batchId, row.row_number, roleKey, {
    status: 'TARGET_ROLE_ONLY',
    action: 'TARGET_ROLE_ONLY',
    target_role_business_id: targetRoleBusinessId,
    error_code: null,
  });
}
function executionSummary(batchId) {
  const rows = db.prepare('SELECT action,status FROM crm_research_contact_execution_item WHERE batch_id=?').all(batchId);
  const summary = {
    contactsCreated: 0,
    existingContactsLinked: 0,
    targetRolesOnly: 0,
    conflicts: 0,
    failed: 0,
    completedAt: null,
  };
  for (const row of rows) {
    if (row.status === 'COMPLETE' && row.action === 'CREATE_CONTACT') summary.contactsCreated += 1;
    else if (row.status === 'COMPLETE' && row.action === 'LINK_EXISTING_CONTACT') summary.existingContactsLinked += 1;
    else if (row.status === 'TARGET_ROLE_ONLY') summary.targetRolesOnly += 1;
    else if (row.status === 'CONFLICT') summary.conflicts += 1;
    else if (row.status === 'FAILED') summary.failed += 1;
  }
  return summary;
}
function updateBatchSummary(batchId, contactExecution) {
  const batch = db.prepare('SELECT summary_json FROM crm_research_import_batch WHERE id=?').get(batchId);
  const summary = { ...parseSummary(batch), contactExecution };
  db.prepare('UPDATE crm_research_import_batch SET summary_json=?,updated_at=? WHERE id=?')
    .run(JSON.stringify(summary), nowIso(), batchId);
}
async function executeContacts(req, actor, batchId, input) {
  if (input?.confirmation !== EXECUTION_CONFIRMATION) throw httpError('research_contact_execution_confirmation_required', 400);
  const batch = db.prepare('SELECT * FROM crm_research_import_batch WHERE id=?').get(batchId);
  if (!batch) throw httpError('research_import_batch_not_found', 404);
  if (batch.status !== 'EXECUTED') throw httpError('research_contact_requires_completed_company_execution', 409);
  const batchSummary = parseSummary(batch);
  if (!batchSummary.siteExecution?.completedAt) throw httpError('research_contact_requires_completed_site_execution', 409);
  const snapshotCount = Number(db.prepare('SELECT COUNT(*) AS count FROM crm_research_contact_snapshot WHERE batch_id=?').get(batchId)?.count ?? 0);
  if (snapshotCount !== batch.row_count) {
    throw httpError('research_contact_snapshot_incomplete', 409, { expected: batch.row_count, actual: snapshotCount });
  }
  const rows = db.prepare(`
    SELECT s.row_number,s.snapshot_json,i.display_name,e.business_id AS account_business_id
    FROM crm_research_contact_snapshot s
    JOIN crm_research_import_item i ON i.batch_id=s.batch_id AND i.row_number=s.row_number
    JOIN crm_research_import_execution_item e
      ON e.batch_id=s.batch_id AND e.row_number=s.row_number AND e.status='COMPLETE'
    WHERE s.batch_id=?
    ORDER BY s.row_number
  `).all(batchId);

  const work = [];
  for (const row of rows) {
    const snapshot = validateSnapshot(JSON.parse(row.snapshot_json));
    for (const candidate of snapshot.candidates) {
      work.push({ row, snapshot, roleKey: candidate.roleKey, candidate });
    }
    if (snapshot.recommendedSearchText) work.push({ row, snapshot, roleKey: 'RECOMMENDED', candidate: null });
  }
  const pending = work.filter((item) => {
    const journal = db.prepare('SELECT status FROM crm_research_contact_execution_item WHERE batch_id=? AND row_number=? AND role_key=?')
      .get(batchId, item.row.row_number, item.roleKey);
    return !journal || !['COMPLETE', 'TARGET_ROLE_ONLY', 'CONFLICT', 'SKIPPED'].includes(journal.status);
  });
  if (pending.length === 0) {
    const summary = executionSummary(batchId);
    summary.completedAt = batchSummary.contactExecution?.completedAt ?? nowIso();
    updateBatchSummary(batchId, summary);
    return {
      batchId,
      status: 'CONTACT_EXECUTED',
      contactExecution: summary,
      remaining: 0,
      hasMore: false,
      idempotent: true,
    };
  }

  const cache = new Map();
  const chunk = pending.slice(0, CONTACT_CHUNK_SIZE);
  for (const item of chunk) {
    try {
      if (item.roleKey === 'RECOMMENDED') executeRecommended(actor, batchId, item.row, item.snapshot);
      else await executeCandidate(req, actor, batchId, item.row, item.roleKey, item.candidate, cache);
    } catch (error) {
      const journal = db.prepare('SELECT 1 FROM crm_research_contact_execution_item WHERE batch_id=? AND row_number=? AND role_key=?')
        .get(batchId, item.row.row_number, item.roleKey);
      if (journal) {
        markJournal(batchId, item.row.row_number, item.roleKey, {
          status: 'FAILED',
          error_code: error.httpStatus ? error.message : 'internal_error',
        });
      }
      const summary = executionSummary(batchId);
      updateBatchSummary(batchId, summary);
      throw error;
    }
  }

  const remaining = pending.length - chunk.length;
  const summary = executionSummary(batchId);
  if (remaining === 0) summary.completedAt = nowIso();
  updateBatchSummary(batchId, summary);
  if (remaining === 0) {
    recordAudit(actor, 'crm.research_intake.contact_execute', `ResearchImportBatch:${batchId}`, { contactExecution: summary });
  }
  return {
    batchId,
    status: remaining === 0 ? 'CONTACT_EXECUTED' : 'CONTACT_EXECUTION_CONTINUE',
    contactExecution: summary,
    remaining,
    hasMore: remaining > 0,
    idempotent: false,
    chunkSize: CONTACT_CHUNK_SIZE,
  };
}

export function createResearchContactExecutionHandler() {
  return async function researchContactExecutionHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const attachMatch = req.method === 'POST'
      ? url.pathname.match(/^\/api\/crm-native\/research-intake\/batches\/([^/]+)\/contact-snapshots$/)
      : null;
    const executeMatch = req.method === 'POST'
      ? url.pathname.match(/^\/api\/crm-native\/research-intake\/batches\/([^/]+)\/execute-contacts$/)
      : null;
    const isOptions = req.method === 'OPTIONS'
      && /^\/api\/crm-native\/research-intake\/batches\/[^/]+\/(contact-snapshots|execute-contacts)$/.test(url.pathname);
    if (!attachMatch && !executeMatch && !isOptions) return false;
    if (isOptions) {
      json(res, 204, {});
      return true;
    }
    try {
      const actor = await authenticate(req);
      requireAdmin(actor);
      if (attachMatch) {
        json(res, 200, attachSnapshots(actor, decodeURIComponent(attachMatch[1]), await readJson(req)));
        return true;
      }
      json(res, 200, await executeContacts(req, actor, decodeURIComponent(executeMatch[1]), await readJson(req, 64 * 1024)));
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
