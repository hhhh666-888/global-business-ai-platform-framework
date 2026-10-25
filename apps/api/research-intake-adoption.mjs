import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { createResearchIntakeExecutionHandler } from './research-intake-execution.mjs';
import {
  identityKey,
  planExactIdentityAdoptions,
  resolvedIdentityCoverage,
  shouldFailClosedLegacyAdoption,
} from './research-identity-adoption-core.mjs';

const DB_PATH = process.env.DB_PATH ?? '/data/substrate.db';
const PORT = Number(process.env.PORT ?? '8081');
const SUPPORTED_SCHEMA = 'EC_TOP500_V46';
const MAX_BODY_BYTES = 16 * 1024 * 1024;
const ACCOUNT_LIST_RETRIES = 3;

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS crm_research_account_catalog (
  business_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  website TEXT,
  linkedin_url TEXT,
  observed_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS idx_crm_research_account_catalog_name
  ON crm_research_account_catalog(display_name);
`);
const delegate = createResearchIntakeExecutionHandler();

function nowIso() { return new Date().toISOString(); }
function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
function canonicalAccountExists(businessId) {
  return Boolean(db.prepare("SELECT 1 FROM external_mapping WHERE business_type='Account' AND business_id=? LIMIT 1").get(businessId));
}
function parseJson(value) {
  try { return JSON.parse(value ?? '{}'); } catch { return {}; }
}
function decodeJwtPayload(header) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return {};
  const parts = header.slice(7).split('.');
  if (parts.length !== 3) return {};
  try {
    const raw = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = raw.padEnd(Math.ceil(raw.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch { return {}; }
}
function actorFromVerifiedRequest(req) {
  const claims = decodeJwtPayload(req.headers.authorization);
  const roles = Array.isArray(claims.realm_access?.roles) ? claims.realm_access.roles : [];
  return {
    subject: typeof claims.sub === 'string' ? claims.sub : 'unknown',
    username: typeof claims.preferred_username === 'string' ? claims.preferred_username : null,
    roles: new Set(roles),
  };
}
function recordAudit(actor, action, target, payload = {}) {
  if (!tableExists('audit_event')) return;
  db.prepare('INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)')
    .run(randomUUID(), actor.subject, actor.username, action, target, nowIso(), JSON.stringify(payload));
}
async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('request_body_too_large'), { httpStatus: 413 });
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
function parseCandidatePayload(body) {
  let input;
  try { input = JSON.parse(body.toString('utf8')); } catch { return null; }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (input.schemaVersion !== SUPPORTED_SCHEMA || !Array.isArray(input.rows) || input.rows.length < 1 || input.rows.length > 2000) return null;
  const seenRows = new Set();
  const seenIdentities = new Set();
  const seenRanks = new Set();
  const rows = [];
  for (const source of input.rows) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
    const rowNumber = Number(source.rowNumber);
    const displayName = typeof source.displayName === 'string' ? source.displayName.trim() : '';
    const country = typeof source.registrationCountry === 'string' ? source.registrationCountry.trim().toUpperCase() : '';
    const type = typeof source.registrationType === 'string' ? source.registrationType.trim().toUpperCase() : '';
    const rawId = typeof source.registrationId === 'string' ? source.registrationId : '';
    const registrationId = country === 'EC' && type === 'RUC' ? rawId.replace(/\.0$/, '').replace(/[^0-9]/g, '') : rawId.trim().toUpperCase();
    const rank = source.researchRank === null || source.researchRank === undefined ? null : Number(source.researchRank);
    if (!Number.isInteger(rowNumber) || rowNumber < 1 || !displayName || !/^[A-Z]{2}$/.test(country) || !type || !registrationId) return null;
    if (country === 'EC' && type === 'RUC' && !/^\d{13}$/.test(registrationId)) return null;
    if (rank !== null && (!Number.isInteger(rank) || rank < 1 || seenRanks.has(rank))) return null;
    const key = identityKey(country, type, registrationId);
    if (seenRows.has(rowNumber) || seenIdentities.has(key)) return null;
    seenRows.add(rowNumber);
    seenIdentities.add(key);
    if (rank !== null) seenRanks.add(rank);
    rows.push({
      rowNumber,
      displayName,
      registrationCountry: country,
      registrationType: type,
      registrationId,
      companySnapshot: source.companySnapshot && typeof source.companySnapshot === 'object' && !Array.isArray(source.companySnapshot)
        ? source.companySnapshot
        : {},
    });
  }
  return { rows };
}
function cacheCanonicalAccounts(records) {
  const normalized = (Array.isArray(records) ? records : []).filter((record) =>
    typeof record?.businessId === 'string' && record.businessId
    && typeof record?.displayName === 'string' && record.displayName.trim()
    && canonicalAccountExists(record.businessId));
  if (normalized.length === 0) return 0;
  const observedAt = nowIso();
  const upsert = db.prepare(`INSERT INTO crm_research_account_catalog(business_id,display_name,website,linkedin_url,observed_at)
    VALUES(?,?,?,?,?)
    ON CONFLICT(business_id) DO UPDATE SET
      display_name=excluded.display_name,website=excluded.website,linkedin_url=excluded.linkedin_url,observed_at=excluded.observed_at`);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const record of normalized) {
      upsert.run(
        record.businessId,
        record.displayName.trim(),
        typeof record.website === 'string' && record.website.trim() ? record.website.trim() : null,
        typeof record.linkedinUrl === 'string' && record.linkedinUrl.trim() ? record.linkedinUrl.trim() : null,
        observedAt,
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
  return normalized.length;
}
function cachedCanonicalAccounts() {
  const byBusinessId = new Map();
  for (const row of db.prepare(`SELECT c.business_id,c.display_name,c.website,c.linkedin_url
    FROM crm_research_account_catalog c
    WHERE EXISTS (
      SELECT 1 FROM external_mapping m
      WHERE m.business_type='Account' AND m.business_id=c.business_id
    )`).all()) {
    byBusinessId.set(row.business_id, {
      businessId: row.business_id,
      displayName: row.display_name,
      website: row.website ?? null,
      linkedinUrl: row.linkedin_url ?? null,
    });
  }
  if (tableExists('crm_business_state')) {
    for (const row of db.prepare("SELECT business_id,state_json FROM crm_business_state WHERE business_type='Account'").all()) {
      if (!canonicalAccountExists(row.business_id)) continue;
      const state = parseJson(row.state_json);
      const displayName = typeof state.displayName === 'string' ? state.displayName.trim() : '';
      if (!displayName || byBusinessId.has(row.business_id)) continue;
      byBusinessId.set(row.business_id, {
        businessId: row.business_id,
        displayName,
        website: typeof state.website === 'string' && state.website.trim() ? state.website.trim() : null,
        linkedinUrl: typeof state.linkedinUrl === 'string' && state.linkedinUrl.trim() ? state.linkedinUrl.trim() : null,
      });
    }
  }
  return [...byBusinessId.values()];
}
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function listCanonicalAccounts(req) {
  const headers = {
    'content-type': 'application/json',
    authorization: req.headers.authorization ?? '',
  };
  for (const key of ['x-gbap-organization', 'x-gbap-workspace']) {
    const value = req.headers[key];
    if (typeof value === 'string' && value) headers[key] = value;
  }
  let lastError = null;
  for (let attempt = 1; attempt <= ACCOUNT_LIST_RETRIES; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/api/capabilities/${encodeURIComponent('crm.v1.account.list')}/invoke`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ payload: { limit: 10000 } }),
        signal: AbortSignal.timeout(30_000),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(body.error ?? 'research_identity_adoption_account_list_unavailable');
        error.httpStatus = response.status;
        throw error;
      }
      const records = body?.result?.records;
      if (!Array.isArray(records)) throw Object.assign(new Error('research_identity_adoption_account_list_invalid'), { httpStatus: 503 });
      cacheCanonicalAccounts(records);
      return { accounts: records, source: 'LIVE_PROVIDER' };
    } catch (error) {
      lastError = error;
      if (attempt < ACCOUNT_LIST_RETRIES) await delay(attempt * 250);
    }
  }
  const cached = cachedCanonicalAccounts();
  if (cached.length > 0) {
    return {
      accounts: cached,
      source: 'LOCAL_CATALOG_FALLBACK',
      providerError: lastError instanceof Error ? lastError.message : 'provider_unavailable',
    };
  }
  throw lastError ?? Object.assign(new Error('research_identity_adoption_account_list_unavailable'), { httpStatus: 503 });
}
function currentIdentityMaps() {
  const canonicalBusinessIds = new Set(
    db.prepare("SELECT DISTINCT business_id FROM external_mapping WHERE business_type='Account'").all().map((row) => row.business_id),
  );
  const identityOwnerByKey = new Map();
  const identityKeyByBusinessId = new Map();
  if (tableExists('crm_registration_identity')) {
    for (const row of db.prepare('SELECT registration_country,registration_type,registration_id,business_id FROM crm_registration_identity').all()) {
      const key = identityKey(row.registration_country, row.registration_type, row.registration_id);
      identityOwnerByKey.set(key, row.business_id);
      identityKeyByBusinessId.set(row.business_id, key);
    }
  }
  const stateOwnersByKey = new Map();
  const stateIdentityKeyByBusinessId = new Map();
  if (tableExists('crm_business_state')) {
    for (const row of db.prepare("SELECT business_id,state_json FROM crm_business_state WHERE business_type='Account'").all()) {
      const state = parseJson(row.state_json);
      const country = typeof state.registrationCountry === 'string' ? state.registrationCountry.trim().toUpperCase() : '';
      const type = typeof state.registrationType === 'string' ? state.registrationType.trim().toUpperCase() : '';
      const rawId = typeof state.registrationId === 'string' ? state.registrationId : '';
      const registrationId = country === 'EC' && type === 'RUC' ? rawId.replace(/\.0$/, '').replace(/[^0-9]/g, '') : rawId.trim().toUpperCase();
      if (!country || !type || !registrationId) continue;
      const key = identityKey(country, type, registrationId);
      const owners = stateOwnersByKey.get(key) ?? [];
      owners.push(row.business_id);
      stateOwnersByKey.set(key, owners);
      stateIdentityKeyByBusinessId.set(row.business_id, key);
    }
  }
  return { canonicalBusinessIds, identityOwnerByKey, identityKeyByBusinessId, stateOwnersByKey, stateIdentityKeyByBusinessId };
}
function clearStaleStateIdentity(businessId, targetKey, timestamp) {
  if (canonicalAccountExists(businessId)) return false;
  const row = db.prepare("SELECT state_json FROM crm_business_state WHERE business_type='Account' AND business_id=?").get(businessId);
  if (!row) return false;
  const state = parseJson(row.state_json);
  const country = typeof state.registrationCountry === 'string' ? state.registrationCountry.trim().toUpperCase() : '';
  const type = typeof state.registrationType === 'string' ? state.registrationType.trim().toUpperCase() : '';
  const rawId = typeof state.registrationId === 'string' ? state.registrationId : '';
  const registrationId = country === 'EC' && type === 'RUC' ? rawId.replace(/\.0$/, '').replace(/[^0-9]/g, '') : rawId.trim().toUpperCase();
  if (identityKey(country, type, registrationId) !== targetKey) return false;
  delete state.registrationCountry;
  delete state.registrationType;
  delete state.registrationId;
  db.prepare("UPDATE crm_business_state SET state_json=?,updated_at=? WHERE business_type='Account' AND business_id=?")
    .run(JSON.stringify(state), timestamp, businessId);
  return true;
}
function applyPlans(actor, plans) {
  if (!plans.length) return { adopted: 0, orphanRegistryRebound: 0, staleStateCleared: 0 };
  const timestamp = nowIso();
  const summary = { adopted: 0, orphanRegistryRebound: 0, staleStateCleared: 0 };
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const plan of plans) {
      if (!canonicalAccountExists(plan.businessId)) throw Object.assign(new Error('research_identity_adoption_candidate_missing'), { httpStatus: 409 });
      const key = identityKey(plan.registrationCountry, plan.registrationType, plan.registrationId);
      const owner = db.prepare('SELECT business_id FROM crm_registration_identity WHERE registration_country=? AND registration_type=? AND registration_id=?').get(
        plan.registrationCountry, plan.registrationType, plan.registrationId,
      );
      if (owner && owner.business_id !== plan.businessId) {
        if (canonicalAccountExists(owner.business_id)) throw Object.assign(new Error('research_identity_adoption_identity_owned_by_existing_company'), { httpStatus: 409 });
        db.prepare('DELETE FROM crm_registration_identity WHERE registration_country=? AND registration_type=? AND registration_id=?')
          .run(plan.registrationCountry, plan.registrationType, plan.registrationId);
        summary.orphanRegistryRebound += 1;
      }
      const candidateIdentity = db.prepare('SELECT registration_country,registration_type,registration_id FROM crm_registration_identity WHERE business_id=?').get(plan.businessId);
      if (candidateIdentity) {
        const candidateKey = identityKey(candidateIdentity.registration_country, candidateIdentity.registration_type, candidateIdentity.registration_id);
        if (candidateKey !== key) throw Object.assign(new Error('research_identity_adoption_candidate_already_bound'), { httpStatus: 409 });
      }
      for (const staleBusinessId of plan.staleStateBusinessIds ?? []) {
        if (clearStaleStateIdentity(staleBusinessId, key, timestamp)) summary.staleStateCleared += 1;
      }
      db.prepare(`INSERT INTO crm_registration_identity(
        registration_country,registration_type,registration_id,business_id,first_import_batch_id,last_import_batch_id,created_at,updated_at
      ) VALUES(?,?,?,?,NULL,NULL,?,?)
      ON CONFLICT(registration_country,registration_type,registration_id) DO UPDATE SET
        business_id=excluded.business_id,updated_at=excluded.updated_at`).run(
        plan.registrationCountry, plan.registrationType, plan.registrationId, plan.businessId, timestamp, timestamp,
      );
      const currentRow = db.prepare("SELECT state_json FROM crm_business_state WHERE business_type='Account' AND business_id=?").get(plan.businessId);
      const state = parseJson(currentRow?.state_json);
      state.registrationCountry = plan.registrationCountry;
      state.registrationType = plan.registrationType;
      state.registrationId = plan.registrationId;
      if (!state.displayName) state.displayName = plan.displayName;
      db.prepare(`INSERT INTO crm_business_state(business_type,business_id,state_json,updated_at) VALUES('Account',?,?,?)
        ON CONFLICT(business_type,business_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`)
        .run(plan.businessId, JSON.stringify(state), timestamp);
      recordAudit(actor, 'crm.research_intake.identity_adopt', `Account:${plan.businessId}`, {
        rowNumber: plan.rowNumber,
        registrationCountry: plan.registrationCountry,
        registrationType: plan.registrationType,
        registrationId: plan.registrationId,
        reason: plan.reason,
        staleRegistryOwnerBusinessId: plan.staleRegistryOwnerBusinessId ?? null,
        mergePolicy: 'UNIQUE_EXACT_NAME_AND_PUBLIC_FINGERPRINT_ONLY',
      });
      summary.adopted += 1;
    }
    db.exec('COMMIT');
    return summary;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}
function forwardedRequest(req, body) {
  const forwarded = Readable.from([body]);
  forwarded.method = req.method;
  forwarded.url = req.url;
  forwarded.headers = req.headers;
  forwarded.socket = req.socket;
  return forwarded;
}
function jsonError(res, error) {
  const status = Number(error?.httpStatus ?? 500);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify({
    error: status < 500 ? error.message : 'research_identity_adoption_failed',
    ...(error?.detail ? { detail: error.detail } : {}),
  }));
}

export function createResearchIntakeAdoptionExecutionHandler() {
  return async function researchIntakeAdoptionExecutionHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const isDryRun = req.method === 'POST' && url.pathname === '/api/crm-native/research-intake/dry-run';
    if (!isDryRun) return delegate(req, res);

    let body;
    try {
      body = await readBody(req);
      const payload = parseCandidatePayload(body);
      if (!payload) return delegate(forwardedRequest(req, body), res);

      // Live provider discovery is attempted first and cached. Once observed, the
      // local catalog becomes a durable preflight fallback so transient provider
      // outages cannot erase TOP500 identity planning or batch creation.
      const accountCatalog = await listCanonicalAccounts(req);
      const accounts = accountCatalog.accounts;
      const actor = actorFromVerifiedRequest(req);
      if (!actor.roles.has('substrate-admin')) return delegate(forwardedRequest(req, body), res);

      const maps = currentIdentityMaps();
      const { plans, rejected } = planExactIdentityAdoptions({ rows: payload.rows, accounts, ...maps });
      const canonicalAccountCount = maps.canonicalBusinessIds.size;
      const covered = resolvedIdentityCoverage({ rows: payload.rows, plans, ...maps });

      // When a legacy CRM contains exactly the same number of canonical companies
      // as the incoming TOP500 file, all rows must resolve before any CREATE is
      // allowed. This remains fail-closed even when the local catalog is incomplete.
      if (shouldFailClosedLegacyAdoption({ rowCount: payload.rows.length, canonicalAccountCount, resolvedCoverage: covered })) {
        const rejectedReasons = rejected.reduce((summary, item) => {
          summary[item.reason] = (summary[item.reason] ?? 0) + 1;
          return summary;
        }, {});
        recordAudit(actor, 'crm.research_intake.identity_adoption_blocked', 'ResearchImport:TOP500', {
          rowCount: payload.rows.length,
          canonicalAccountCount,
          resolvedCoverage: covered,
          rejectedCount: rejected.length,
          rejectedReasons,
          accountCatalogSource: accountCatalog.source,
          accountCatalogCount: accounts.length,
          providerError: accountCatalog.providerError ?? null,
          mergePolicy: 'FAIL_CLOSED_FULL_LEGACY_COVERAGE_REQUIRED',
        });
        const error = new Error('research_identity_adoption_incomplete_legacy_coverage');
        error.httpStatus = 409;
        error.detail = {
          rowCount: payload.rows.length,
          canonicalAccountCount,
          resolvedCoverage: covered,
          rejectedCount: rejected.length,
          rejectedReasons,
          accountCatalogSource: accountCatalog.source,
          accountCatalogCount: accounts.length,
        };
        throw error;
      }

      const adoption = applyPlans(actor, plans);
      if (adoption.adopted > 0 || rejected.length > 0 || accountCatalog.source !== 'LIVE_PROVIDER') {
        recordAudit(actor, 'crm.research_intake.identity_adoption_preflight', 'ResearchImport:TOP500', {
          rowCount: payload.rows.length,
          canonicalAccountCount,
          resolvedCoverage: covered,
          adopted: adoption.adopted,
          orphanRegistryRebound: adoption.orphanRegistryRebound,
          staleStateCleared: adoption.staleStateCleared,
          rejectedCount: rejected.length,
          rejectedReasons: rejected.reduce((summary, item) => {
            summary[item.reason] = (summary[item.reason] ?? 0) + 1;
            return summary;
          }, {}),
          accountCatalogSource: accountCatalog.source,
          accountCatalogCount: accounts.length,
          providerError: accountCatalog.providerError ?? null,
          mergePolicy: 'UNIQUE_EXACT_NAME_AND_PUBLIC_FINGERPRINT_ONLY',
        });
      }
      return delegate(forwardedRequest(req, body), res);
    } catch (error) {
      jsonError(res, error);
      return true;
    }
  };
}
