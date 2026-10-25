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

const SITE_KINDS = ['FACTORY', 'PLANT', 'WAREHOUSE', 'DATA_CENTER', 'MINE', 'FARM', 'COMMERCIAL_PARK', 'OFFICE', 'OTHER'];
const SITE_FIELDS = new Set([
  'siteName', 'siteKind', 'province', 'city', 'address', 'googleMapsUrl', 'reportedSiteCount',
  'siteAreaSqm', 'buildingAreaSqm', 'roofAreaSqm', 'availableLandSqm',
  'operatingProfile', 'operatingHoursPerDay', 'operatingDaysPerWeek', 'shiftsPerDay',
  'processOperatingCharacteristics', 'keyEquipmentText',
  'estimatedEnergyGrade', 'estimatedPeakDemandKw', 'estimatedMonthlyConsumptionKwh',
  'energyPainPoints', 'existingGeneratorBackup', 'existingSolarStorage', 'roofSiteConditions', 'source',
]);
const SITE_IDENTITY_FIELDS = new Set(['province', 'city', 'address', 'googleMapsUrl']);

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
CREATE INDEX IF NOT EXISTS idx_crm_site_account
  ON crm_site(account_business_id, updated_at DESC);
`);

function nowIso() { return new Date().toISOString(); }
function responseHeaders(extra = {}) {
  return {
    'cache-control': 'no-store',
    'access-control-allow-origin': CORS_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type, x-gbap-organization, x-gbap-workspace',
    'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
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
function tableExists(name) { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
function accountExists(businessId) {
  return tableExists('external_mapping') && Boolean(db.prepare("SELECT 1 FROM external_mapping WHERE business_type='Account' AND business_id=? LIMIT 1").get(businessId));
}
function requiredText(value, label, max = 512) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw httpError(`invalid_${label}`, 400);
  return value.trim();
}
function optionalText(value, label, max = 4000) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) throw httpError(`invalid_${label}`, 400);
  return value.trim();
}
function numberOrNull(value, label, max = 10_000_000_000_000) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) throw httpError(`invalid_${label}`, 400);
  return value;
}
function integerOrNull(value, label, max = 10_000_000) {
  const parsed = numberOrNull(value, label, max);
  if (parsed === undefined || parsed === null) return parsed;
  if (!Number.isInteger(parsed)) throw httpError(`invalid_${label}`, 400);
  return parsed;
}
function enumOrNull(value, label, allowed) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw httpError(`invalid_${label}`, 400);
  const normalized = value.trim().toUpperCase();
  if (!allowed.includes(normalized)) throw httpError(`invalid_${label}`, 400);
  return normalized;
}
function compactIdentityText(value) {
  return String(value ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}
export function deriveSiteKey(input, fallback = null) {
  const map = compactIdentityText(input?.googleMapsUrl).replace(/\/$/, '');
  if (map) return `MAP:${createHash('sha256').update(map).digest('hex').slice(0, 32)}`;
  const address = [input?.province, input?.city, input?.address].map(compactIdentityText).filter(Boolean).join('|');
  if (address) return `ADDR:${createHash('sha256').update(address).digest('hex').slice(0, 32)}`;
  return fallback ?? `SITE:${randomUUID()}`;
}
function validateSitePatch(input, { requireName = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError('invalid_site_payload', 400);
  for (const key of Object.keys(input)) {
    if (key === 'accountBusinessId') continue;
    if (!SITE_FIELDS.has(key)) throw httpError(`unsupported_site_field:${key}`, 400);
  }
  const patch = {
    siteName: requireName ? requiredText(input.siteName, 'site_name', 512) : optionalText(input.siteName, 'site_name', 512),
    siteKind: enumOrNull(input.siteKind, 'site_kind', SITE_KINDS),
    province: optionalText(input.province, 'province', 256),
    city: optionalText(input.city, 'city', 256),
    address: optionalText(input.address, 'address', 2048),
    googleMapsUrl: optionalText(input.googleMapsUrl, 'google_maps_url', 2048),
    reportedSiteCount: integerOrNull(input.reportedSiteCount, 'reported_site_count', 100_000),
    siteAreaSqm: numberOrNull(input.siteAreaSqm, 'site_area_sqm'),
    buildingAreaSqm: numberOrNull(input.buildingAreaSqm, 'building_area_sqm'),
    roofAreaSqm: numberOrNull(input.roofAreaSqm, 'roof_area_sqm'),
    availableLandSqm: numberOrNull(input.availableLandSqm, 'available_land_sqm'),
    operatingProfile: optionalText(input.operatingProfile, 'operating_profile', 2048),
    operatingHoursPerDay: numberOrNull(input.operatingHoursPerDay, 'operating_hours_per_day', 24),
    operatingDaysPerWeek: numberOrNull(input.operatingDaysPerWeek, 'operating_days_per_week', 7),
    shiftsPerDay: integerOrNull(input.shiftsPerDay, 'shifts_per_day', 12),
    processOperatingCharacteristics: optionalText(input.processOperatingCharacteristics, 'process_operating_characteristics', 20_000),
    keyEquipmentText: optionalText(input.keyEquipmentText, 'key_equipment_text', 20_000),
    estimatedEnergyGrade: optionalText(input.estimatedEnergyGrade, 'estimated_energy_grade', 256),
    estimatedPeakDemandKw: numberOrNull(input.estimatedPeakDemandKw, 'estimated_peak_demand_kw'),
    estimatedMonthlyConsumptionKwh: numberOrNull(input.estimatedMonthlyConsumptionKwh, 'estimated_monthly_consumption_kwh'),
    energyPainPoints: optionalText(input.energyPainPoints, 'energy_pain_points', 20_000),
    existingGeneratorBackup: optionalText(input.existingGeneratorBackup, 'existing_generator_backup', 20_000),
    existingSolarStorage: optionalText(input.existingSolarStorage, 'existing_solar_storage', 20_000),
    roofSiteConditions: optionalText(input.roofSiteConditions, 'roof_site_conditions', 20_000),
    source: optionalText(input.source, 'source', 256),
  };
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
}
function parseState(row) {
  try { return JSON.parse(row.state_json ?? '{}'); } catch { return {}; }
}
function projectSite(row) {
  return {
    businessId: row.business_id,
    accountBusinessId: row.account_business_id,
    siteKey: row.site_key,
    ...parseState(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function recordAudit(actor, action, target, payload = {}) {
  if (!tableExists('audit_event')) return;
  db.prepare('INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)').run(
    randomUUID(), actor.subject, actor.username, action, target, nowIso(), JSON.stringify(payload),
  );
}
function createSite(actor, input) {
  const accountBusinessId = requiredText(input.accountBusinessId, 'account_business_id', 255);
  if (!accountExists(accountBusinessId)) throw httpError('customer_company_not_found', 404);
  const state = validateSitePatch(input, { requireName: true });
  const siteKey = deriveSiteKey(state);
  const businessId = randomUUID();
  const timestamp = nowIso();
  try {
    db.prepare('INSERT INTO crm_site(business_id,account_business_id,site_key,state_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(
      businessId, accountBusinessId, siteKey, JSON.stringify(state), actor.subject, timestamp, timestamp,
    );
  } catch (error) {
    if (/UNIQUE constraint failed: crm_site\.account_business_id, crm_site\.site_key/.test(String(error?.message ?? ''))) throw httpError('site_identity_already_exists', 409);
    throw error;
  }
  recordAudit(actor, 'crm.site.create', `Site:${businessId}`, { accountBusinessId, siteKey, fields: Object.keys(state) });
  return projectSite(db.prepare('SELECT * FROM crm_site WHERE business_id=?').get(businessId));
}
function updateSite(actor, businessId, input) {
  const row = db.prepare('SELECT * FROM crm_site WHERE business_id=?').get(businessId);
  if (!row) throw httpError('site_not_found', 404);
  const patch = validateSitePatch(input);
  if (Object.keys(patch).length === 0) return projectSite(row);
  const current = parseState(row);
  const next = { ...current, ...patch };
  let siteKey = row.site_key;
  if ([...SITE_IDENTITY_FIELDS].some((field) => Object.prototype.hasOwnProperty.call(patch, field))) {
    siteKey = deriveSiteKey(next, row.site_key);
  }
  try {
    db.prepare('UPDATE crm_site SET site_key=?,state_json=?,updated_at=? WHERE business_id=?').run(siteKey, JSON.stringify(next), nowIso(), businessId);
  } catch (error) {
    if (/UNIQUE constraint failed: crm_site\.account_business_id, crm_site\.site_key/.test(String(error?.message ?? ''))) throw httpError('site_identity_already_exists', 409);
    throw error;
  }
  recordAudit(actor, 'crm.site.update', `Site:${businessId}`, { accountBusinessId: row.account_business_id, fields: Object.keys(patch) });
  return projectSite(db.prepare('SELECT * FROM crm_site WHERE business_id=?').get(businessId));
}

export function createCrmSiteHandler() {
  return async function crmSiteHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const collection = url.pathname === '/api/crm-native/sites';
    const itemMatch = url.pathname.match(/^\/api\/crm-native\/sites\/([^/]+)$/);
    if (!collection && !itemMatch) return false;
    if (req.method === 'OPTIONS') { json(res, 204, {}); return true; }
    try {
      const actor = await authenticate(req); requireUser(actor);
      if (collection && req.method === 'GET') {
        const accountBusinessId = requiredText(url.searchParams.get('accountBusinessId'), 'account_business_id', 255);
        if (!accountExists(accountBusinessId)) throw httpError('customer_company_not_found', 404);
        const rows = db.prepare('SELECT * FROM crm_site WHERE account_business_id=? ORDER BY updated_at DESC,business_id ASC').all(accountBusinessId);
        json(res, 200, { sites: rows.map(projectSite) }); return true;
      }
      if (collection && req.method === 'POST') {
        json(res, 201, { site: createSite(actor, await readJson(req)) }); return true;
      }
      if (itemMatch && req.method === 'GET') {
        const row = db.prepare('SELECT * FROM crm_site WHERE business_id=?').get(decodeURIComponent(itemMatch[1]));
        if (!row) throw httpError('site_not_found', 404);
        json(res, 200, { site: projectSite(row) }); return true;
      }
      if (itemMatch && req.method === 'PATCH') {
        json(res, 200, { site: updateSite(actor, decodeURIComponent(itemMatch[1]), await readJson(req)) }); return true;
      }
      json(res, 405, { error: 'method_not_allowed' }); return true;
    } catch (error) {
      json(res, error.httpStatus ?? 500, { error: error.httpStatus ? error.message : 'internal_error', ...(error.detail ? { detail: error.detail } : {}) });
      return true;
    }
  };
}
