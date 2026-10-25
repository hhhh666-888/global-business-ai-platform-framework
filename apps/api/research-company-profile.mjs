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

const PROFILE_FIELDS = new Set([
  'primaryEmail', 'primaryPhone', 'customerType', 'relationshipStatus', 'industry', 'employeeCount', 'source', 'priority', 'notes',
  'registrationCountry', 'registrationType', 'registrationId', 'commercialName', 'ownershipType', 'verificationGrade',
  'strategicValueScore', 'researchRank', 'parentAccountBusinessId', 'accountOwnerUserId',
  'website', 'linkedinUrl', 'annualRevenue', 'annualRevenueCurrency',
]);
const RESEARCH_MUTABLE_FIELDS = new Set([
  'registrationCountry', 'registrationType', 'registrationId', 'commercialName', 'ownershipType', 'verificationGrade',
  'strategicValueScore', 'researchRank', 'parentAccountBusinessId',
]);

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

CREATE INDEX IF NOT EXISTS idx_crm_research_profile_field_audit_business
  ON crm_research_profile_field_audit(business_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_research_profile_field_audit_batch
  ON crm_research_profile_field_audit(batch_id, occurred_at DESC);
`);

function nowIso() { return new Date().toISOString(); }
function responseHeaders(extra = {}) {
  return {
    'cache-control': 'no-store',
    'access-control-allow-origin': CORS_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type, x-gbap-organization, x-gbap-workspace',
    'access-control-allow-methods': 'GET,PATCH,OPTIONS',
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
async function readJson(req, maxBytes = 256 * 1024) {
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
function requireUser(actor) {
  if (!actor.roles.has('substrate-user') && !actor.roles.has('substrate-admin')) throw httpError('forbidden', 403);
}
function requireAdmin(actor) {
  if (!actor.roles.has('substrate-admin')) throw httpError('forbidden', 403);
}
function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
function accountExists(businessId) {
  if (!tableExists('external_mapping')) return false;
  return Boolean(db.prepare("SELECT 1 FROM external_mapping WHERE business_type='Account' AND business_id=? LIMIT 1").get(businessId));
}
function readState(businessId) {
  if (!tableExists('crm_business_state')) return { state: {}, updatedAt: null };
  const row = db.prepare("SELECT state_json,updated_at FROM crm_business_state WHERE business_type='Account' AND business_id=?").get(businessId);
  if (!row?.state_json) return { state: {}, updatedAt: row?.updated_at ?? null };
  try { return { state: JSON.parse(row.state_json), updatedAt: row.updated_at ?? null }; }
  catch { return { state: {}, updatedAt: row.updated_at ?? null }; }
}
function projectProfile(businessId, state, updatedAt) {
  const profile = { businessId };
  for (const key of PROFILE_FIELDS) if (Object.prototype.hasOwnProperty.call(state ?? {}, key)) profile[key] = state[key];
  profile.profileUpdatedAt = updatedAt ?? null;
  return profile;
}
function optionalText(value, label, max = 1024) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) throw httpError(`invalid_${label}`, 400);
  return value.trim();
}
function normalizeCountry(value) {
  const text = optionalText(value, 'registration_country', 2);
  if (text === undefined || text === null) return text;
  const normalized = text.toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) throw httpError('invalid_registration_country', 400);
  return normalized;
}
function normalizeRegistrationType(value) {
  const text = optionalText(value, 'registration_type', 64);
  if (text === undefined || text === null) return text;
  const normalized = text.toUpperCase();
  if (!/^[A-Z0-9_-]+$/.test(normalized)) throw httpError('invalid_registration_type', 400);
  return normalized;
}
function normalizeRegistrationId(value, country, type) {
  const text = optionalText(value, 'registration_id', 128);
  if (text === undefined || text === null) return text;
  const normalized = country === 'EC' && type === 'RUC' ? text.replace(/\.0$/, '').replace(/[^0-9]/g, '') : text.toUpperCase();
  if (country === 'EC' && type === 'RUC' && !/^\d{13}$/.test(normalized)) throw httpError('invalid_ec_ruc', 400);
  return normalized;
}
function nullableNumber(value, label, min, max, integer = false) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw httpError(`invalid_${label}`, 400);
  return value;
}
function validateResearchPatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError('invalid_research_company_profile', 400);
  for (const key of Object.keys(input)) {
    if (key === 'batchId') continue;
    if (!RESEARCH_MUTABLE_FIELDS.has(key)) throw httpError(`unsupported_research_company_field:${key}`, 400);
  }
  const registrationCountry = normalizeCountry(input.registrationCountry);
  const registrationType = normalizeRegistrationType(input.registrationType);
  const registrationId = normalizeRegistrationId(input.registrationId, registrationCountry, registrationType);
  const identityValues = [registrationCountry, registrationType, registrationId];
  const identityTouched = identityValues.some((value) => value !== undefined);
  if (identityTouched) {
    const present = identityValues.filter((value) => value !== undefined && value !== null).length;
    if (present !== 3) throw httpError('registration_identity_requires_country_type_id', 400);
  }
  return {
    batchId: optionalText(input.batchId, 'batch_id', 128) ?? null,
    patch: Object.fromEntries(Object.entries({
      registrationCountry,
      registrationType,
      registrationId,
      commercialName: optionalText(input.commercialName, 'commercial_name', 1024),
      ownershipType: optionalText(input.ownershipType, 'ownership_type', 128),
      verificationGrade: optionalText(input.verificationGrade, 'verification_grade', 128),
      strategicValueScore: nullableNumber(input.strategicValueScore, 'strategic_value_score', 0, 100),
      researchRank: nullableNumber(input.researchRank, 'research_rank', 1, 1_000_000, true),
      parentAccountBusinessId: optionalText(input.parentAccountBusinessId, 'parent_account_business_id', 255),
    }).filter(([, value]) => value !== undefined)),
  };
}
function recordAudit(actor, action, target, payload = {}) {
  if (!tableExists('audit_event')) return;
  db.prepare('INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)').run(
    randomUUID(), actor.subject, actor.username, action, target, nowIso(), JSON.stringify(payload),
  );
}
function claimRegistrationIdentity(businessId, currentState, patch, batchId, timestamp) {
  const country = Object.prototype.hasOwnProperty.call(patch, 'registrationCountry') ? patch.registrationCountry : currentState.registrationCountry;
  const type = Object.prototype.hasOwnProperty.call(patch, 'registrationType') ? patch.registrationType : currentState.registrationType;
  const id = Object.prototype.hasOwnProperty.call(patch, 'registrationId') ? patch.registrationId : currentState.registrationId;
  if (!country && !type && !id) return;
  if (!country || !type || !id) throw httpError('registration_identity_incomplete', 409);

  const identityOwner = db.prepare('SELECT business_id FROM crm_registration_identity WHERE registration_country=? AND registration_type=? AND registration_id=?').get(country, type, id);
  if (identityOwner && identityOwner.business_id !== businessId) throw httpError('registration_identity_already_claimed', 409, { businessId: identityOwner.business_id });
  const companyIdentity = db.prepare('SELECT registration_country,registration_type,registration_id FROM crm_registration_identity WHERE business_id=?').get(businessId);
  if (companyIdentity && (companyIdentity.registration_country !== country || companyIdentity.registration_type !== type || companyIdentity.registration_id !== id)) {
    throw httpError('company_registration_identity_already_claimed', 409, { registrationCountry: companyIdentity.registration_country, registrationType: companyIdentity.registration_type, registrationId: companyIdentity.registration_id });
  }
  db.prepare(`INSERT INTO crm_registration_identity(
    registration_country,registration_type,registration_id,business_id,first_import_batch_id,last_import_batch_id,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?)
  ON CONFLICT(registration_country,registration_type,registration_id) DO UPDATE SET
    last_import_batch_id=COALESCE(excluded.last_import_batch_id,crm_registration_identity.last_import_batch_id),updated_at=excluded.updated_at`).run(
    country, type, id, businessId, batchId, batchId, timestamp, timestamp,
  );
}
function writeFieldAudit(actor, businessId, batchId, oldState, nextState, changedFields, timestamp) {
  const statement = db.prepare(`INSERT INTO crm_research_profile_field_audit(
    id,business_id,batch_id,field_key,old_value_json,new_value_json,merge_policy,actor_subject,actor_username,occurred_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?)`);
  for (const field of changedFields) {
    statement.run(
      randomUUID(), businessId, batchId, field, JSON.stringify(oldState[field] ?? null), JSON.stringify(nextState[field] ?? null),
      'RESEARCH_FILL', actor.subject, actor.username, timestamp,
    );
  }
}
function updateResearchProfile(actor, businessId, input) {
  if (!accountExists(businessId)) throw httpError('customer_company_not_found', 404);
  const { batchId, patch } = validateResearchPatch(input);
  if (patch.parentAccountBusinessId && !accountExists(patch.parentAccountBusinessId)) throw httpError('parent_customer_company_not_found', 409);
  const currentSnapshot = readState(businessId);
  const current = currentSnapshot.state;
  const next = { ...current };
  const changedFields = [];
  for (const [key, incoming] of Object.entries(patch)) {
    const existing = current[key];
    // Research imports are fill-only. Once a value is non-empty, any different
    // research value (including null) is ignored and requires explicit user action.
    const existingIsEmpty = existing === undefined || existing === null || existing === '';
    if (!existingIsEmpty && incoming !== existing) continue;
    if (incoming !== existing) {
      next[key] = incoming;
      changedFields.push(key);
    }
  }
  const timestamp = nowIso();
  db.exec('BEGIN IMMEDIATE');
  try {
    claimRegistrationIdentity(businessId, current, next, batchId, timestamp);
    if (changedFields.length > 0) {
      db.prepare(`INSERT INTO crm_business_state(business_type,business_id,state_json,updated_at) VALUES('Account',?,?,?)
        ON CONFLICT(business_type,business_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`).run(businessId, JSON.stringify(next), timestamp);
      writeFieldAudit(actor, businessId, batchId, current, next, changedFields, timestamp);
    }
    recordAudit(actor, 'crm.research_company_profile.update', `Account:${businessId}`, { batchId, changedFields, mergePolicy: 'RESEARCH_FILL' });
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
  return { profile: projectProfile(businessId, next, changedFields.length > 0 ? timestamp : currentSnapshot.updatedAt), changedFields };
}
function listProfiles() {
  if (!tableExists('crm_business_state')) return [];
  return db.prepare("SELECT business_id,state_json,updated_at FROM crm_business_state WHERE business_type='Account' ORDER BY updated_at DESC").all().map((row) => {
    let state = {};
    try { state = JSON.parse(row.state_json ?? '{}'); } catch {}
    return projectProfile(row.business_id, state, row.updated_at ?? null);
  });
}
function listFieldAudit(businessId, limit) {
  return db.prepare(`SELECT id,business_id,batch_id,field_key,old_value_json,new_value_json,merge_policy,actor_subject,actor_username,occurred_at
    FROM crm_research_profile_field_audit WHERE business_id=? ORDER BY occurred_at DESC,id DESC LIMIT ?`).all(businessId, limit).map((row) => ({
      id: row.id,
      businessId: row.business_id,
      batchId: row.batch_id ?? null,
      field: row.field_key,
      oldValue: JSON.parse(row.old_value_json),
      newValue: JSON.parse(row.new_value_json),
      mergePolicy: row.merge_policy,
      actorSubject: row.actor_subject,
      actorUsername: row.actor_username ?? null,
      occurredAt: row.occurred_at,
    }));
}

export function createResearchCompanyProfileHandler() {
  return async function researchCompanyProfileHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const collectionRoute = url.pathname === '/api/crm-native/research-company-profiles';
    const itemMatch = url.pathname.match(/^\/api\/crm-native\/research-company-profiles\/([^/]+)$/);
    const auditMatch = url.pathname.match(/^\/api\/crm-native\/research-company-profiles\/([^/]+)\/audit$/);
    if (!collectionRoute && !itemMatch && !auditMatch) return false;
    if (req.method === 'OPTIONS') { json(res, 204, {}); return true; }
    try {
      const actor = await authenticate(req);
      requireUser(actor);
      if (collectionRoute && req.method === 'GET') {
        json(res, 200, { profiles: listProfiles() });
        return true;
      }
      if (auditMatch && req.method === 'GET') {
        const businessId = decodeURIComponent(auditMatch[1]);
        const requested = Number(url.searchParams.get('limit') ?? '100');
        const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 500) : 100;
        json(res, 200, { changes: listFieldAudit(businessId, limit) });
        return true;
      }
      if (itemMatch && req.method === 'PATCH') {
        requireAdmin(actor);
        const businessId = decodeURIComponent(itemMatch[1]);
        json(res, 200, updateResearchProfile(actor, businessId, await readJson(req)));
        return true;
      }
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
