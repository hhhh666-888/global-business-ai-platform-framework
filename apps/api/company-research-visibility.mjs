import { getCachedJwk } from './jwks-cache.mjs';
import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const DB_PATH = process.env.DB_PATH ?? '/data/substrate.db';
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:8080';
const OIDC_ISSUER = process.env.OIDC_ISSUER ?? 'http://localhost:8082/realms/gbap';
const OIDC_ALLOWED_ISSUERS = new Set((process.env.OIDC_ALLOWED_ISSUERS ?? OIDC_ISSUER).split(',').map((value) => value.trim()).filter(Boolean));
const OIDC_JWKS_URL_INTERNAL = process.env.OIDC_JWKS_URL_INTERNAL ?? 'http://keycloak:8080/realms/gbap/protocol/openid-connect/certs';
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID ?? 'gbap-web';

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');

function responseHeaders(extra = {}) {
  return {
    'cache-control': 'no-store',
    'access-control-allow-origin': CORS_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET,OPTIONS',
    ...extra,
  };
}
function json(res, status, body) {
  res.writeHead(status, responseHeaders({ 'content-type': 'application/json; charset=utf-8' }));
  res.end(status === 204 ? '' : JSON.stringify(body));
}
function httpError(message, status = 400) { const error = new Error(message); error.httpStatus = status; return error; }
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
  try { headerJson = JSON.parse(decodeSegment(encodedHeader).toString('utf8')); claims = JSON.parse(decodeSegment(encodedPayload).toString('utf8')); }
  catch { throw httpError('invalid_jwt', 401); }
  if (headerJson.alg !== 'RS256' || typeof headerJson.kid !== 'string') throw httpError('unsupported_jwt', 401);
  const publicKey = createPublicKey({ key: await getJwk(headerJson.kid), format: 'jwk' });
  if (!verifySignature('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), publicKey, decodeSegment(encodedSignature))) throw httpError('invalid_signature', 401);
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= now) throw httpError('token_expired', 401);
  if (claims.nbf && claims.nbf > now + 30) throw httpError('token_not_yet_valid', 401);
  if (!OIDC_ALLOWED_ISSUERS.has(claims.iss)) throw httpError('invalid_issuer', 401);
  if (claims.azp && claims.azp !== OIDC_CLIENT_ID) throw httpError('invalid_authorized_party', 401);
  return { roles: new Set(Array.isArray(claims.realm_access?.roles) ? claims.realm_access.roles : []) };
}
function requireUser(actor) {
  if (!actor.roles.has('substrate-user') && !actor.roles.has('substrate-admin')) throw httpError('forbidden', 403);
}
function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
function rowsIfTable(name, sql) { return tableExists(name) ? db.prepare(sql).all() : []; }
function parseJson(value) { try { return JSON.parse(value ?? '{}'); } catch { return {}; } }
function pushGrouped(map, key, value) {
  const current = map.get(key) ?? [];
  current.push(value);
  map.set(key, current);
}
function projectSite(row) {
  const state = parseJson(row.state_json);
  return {
    businessId: row.business_id,
    siteName: state.siteName ?? null,
    siteKind: state.siteKind ?? null,
    province: state.province ?? null,
    city: state.city ?? null,
    address: state.address ?? null,
    googleMapsUrl: state.googleMapsUrl ?? null,
    reportedSiteCount: state.reportedSiteCount ?? null,
    operatingProfile: state.operatingProfile ?? null,
    processOperatingCharacteristics: state.processOperatingCharacteristics ?? null,
    keyEquipmentText: state.keyEquipmentText ?? null,
    estimatedEnergyGrade: state.estimatedEnergyGrade ?? null,
    estimatedPeakDemandKw: state.estimatedPeakDemandKw ?? null,
    estimatedMonthlyConsumptionKwh: state.estimatedMonthlyConsumptionKwh ?? null,
    energyPainPoints: state.energyPainPoints ?? null,
    existingGeneratorBackup: state.existingGeneratorBackup ?? null,
    existingSolarStorage: state.existingSolarStorage ?? null,
    roofSiteConditions: state.roofSiteConditions ?? null,
    source: state.source ?? null,
    updatedAt: row.updated_at,
  };
}
function projectTargetRole(row) {
  const state = parseJson(row.state_json);
  return {
    businessId: row.business_id,
    roleKey: row.role_key,
    roleTitleText: state.roleTitleText ?? null,
    candidateName: state.candidateName ?? null,
    candidateContactText: state.candidateContactText ?? null,
    verificationNote: state.verificationNote ?? null,
    recommendedSearchText: state.recommendedSearchText ?? null,
    status: state.status ?? 'OPEN',
    resolvedContactBusinessId: state.resolvedContactBusinessId ?? null,
    source: state.source ?? null,
    updatedAt: row.updated_at,
  };
}
function projectEvidence(row) {
  const state = parseJson(row.evidence_json);
  return {
    businessId: row.business_id,
    sourceName: row.source_name,
    ownershipVerification: state.ownershipVerification ?? null,
    contactVerification: state.contactVerification ?? null,
    companyScaleBasis: state.companyScaleBasis ?? null,
    energyEstimateConfidence: state.energyEstimateConfidence ?? null,
    energyEstimateBasis: state.energyEstimateBasis ?? null,
    actualEnergyDataSource: state.actualEnergyDataSource ?? null,
    sourceTitle: state.sourceTitle ?? null,
    statement: state.statement ?? null,
    sourceUrl: state.sourceUrl ?? null,
    verifiedAt: state.verifiedAt ?? null,
    createdAt: row.created_at,
  };
}
function projectState(row) {
  if (!row) return null;
  return { ...parseJson(row.state_json), updatedAt: row.updated_at };
}
function buildInsights() {
  if (!tableExists('external_mapping')) return [];
  const accounts = db.prepare("SELECT DISTINCT business_id FROM external_mapping WHERE business_type='Account'").all().map((row) => row.business_id);
  const accountSet = new Set(accounts);
  const sites = new Map();
  for (const row of rowsIfTable('crm_site', 'SELECT * FROM crm_site ORDER BY updated_at DESC,business_id ASC')) if (accountSet.has(row.account_business_id)) pushGrouped(sites, row.account_business_id, projectSite(row));
  const targetRoles = new Map();
  for (const row of rowsIfTable('crm_target_role', 'SELECT * FROM crm_target_role ORDER BY role_key,business_id')) if (accountSet.has(row.account_business_id)) pushGrouped(targetRoles, row.account_business_id, projectTargetRole(row));
  const evidence = new Map();
  for (const row of rowsIfTable('crm_research_evidence', 'SELECT * FROM crm_research_evidence ORDER BY created_at DESC,business_id DESC')) if (accountSet.has(row.account_business_id)) pushGrouped(evidence, row.account_business_id, projectEvidence(row));
  const intelligence = new Map(rowsIfTable('crm_research_intelligence', 'SELECT * FROM crm_research_intelligence').map((row) => [row.account_business_id, projectState(row)]));
  const salesSignals = new Map(rowsIfTable('crm_sales_signal', 'SELECT * FROM crm_sales_signal').map((row) => [row.account_business_id, projectState(row)]));
  const energyDiscovery = new Map(rowsIfTable('crm_energy_discovery', 'SELECT * FROM crm_energy_discovery').map((row) => [row.account_business_id, projectState(row)]));

  return accounts.flatMap((accountBusinessId) => {
    const accountSites = sites.get(accountBusinessId) ?? [];
    const accountRoles = targetRoles.get(accountBusinessId) ?? [];
    const accountEvidence = evidence.get(accountBusinessId) ?? [];
    const researchIntelligence = intelligence.get(accountBusinessId) ?? null;
    const salesSignal = salesSignals.get(accountBusinessId) ?? null;
    const energy = energyDiscovery.get(accountBusinessId) ?? null;
    if (!accountSites.length && !accountRoles.length && !accountEvidence.length && !researchIntelligence && !salesSignal && !energy) return [];
    return [{
      accountBusinessId,
      siteCount: accountSites.length,
      primarySite: accountSites[0] ?? null,
      targetRoles: accountRoles,
      openTargetRoleCount: accountRoles.filter((item) => item.status === 'OPEN').length,
      resolvedTargetRoleCount: accountRoles.filter((item) => item.status === 'RESOLVED' || item.resolvedContactBusinessId).length,
      evidenceCount: accountEvidence.length,
      evidence: accountEvidence,
      latestEvidence: accountEvidence[0] ?? null,
      researchIntelligence,
      salesSignal,
      energyDiscovery: energy,
    }];
  });
}

export function createCompanyResearchVisibilityHandler() {
  return async function companyResearchVisibilityHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const route = url.pathname === '/api/crm-native/company-research-insights';
    if (!route) return false;
    if (req.method === 'OPTIONS') { json(res, 204, {}); return true; }
    try {
      const actor = await authenticate(req); requireUser(actor);
      if (req.method !== 'GET') { json(res, 405, { error: 'method_not_allowed' }); return true; }
      json(res, 200, { insights: buildInsights() });
      return true;
    } catch (error) {
      json(res, error.httpStatus ?? 500, { error: error.httpStatus ? error.message : 'internal_error' });
      return true;
    }
  };
}
