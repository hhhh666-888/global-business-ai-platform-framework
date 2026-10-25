import { getCachedJwk } from './jwks-cache.mjs';
import http from 'node:http';
import { createPublicKey, randomUUID, verify as verifySignature } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const PORT = Number(process.env.PORT ?? '8081');
const HOST = '0.0.0.0';
const DB_PATH = process.env.DB_PATH ?? '/data/substrate.db';
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:8080';
const OIDC_ISSUER = process.env.OIDC_ISSUER ?? 'http://localhost:8082/realms/gbap';
const OIDC_ALLOWED_ISSUERS = new Set((process.env.OIDC_ALLOWED_ISSUERS ?? OIDC_ISSUER).split(',').map((value) => value.trim()).filter(Boolean));
const OIDC_JWKS_URL_INTERNAL = process.env.OIDC_JWKS_URL_INTERNAL ?? 'http://keycloak:8080/realms/gbap/protocol/openid-connect/certs';
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID ?? 'gbap-web';
const SUBSTRATE_ENV = process.env.SUBSTRATE_ENV ?? 'local';
const CANONICAL_CRM_CONTRACT = 'gbap.crm.v1';

const CANONICAL_CRM_CAPABILITIES = new Set([
  'crm.v1.account.create',
  'crm.v1.account.list',
  'crm.v1.contact.create',
  'crm.v1.contact.list',
  'crm.v1.opportunity.create',
  'crm.v1.opportunity.list',
  'crm.v1.snapshot.export',
]);

const CANONICAL_CREATE_RULES = {
  'crm.v1.account.create': { businessType: 'Account', related: [] },
  'crm.v1.contact.create': { businessType: 'Contact', related: [] },
  'crm.v1.opportunity.create': {
    businessType: 'Opportunity',
    related: [
      { businessIdField: 'accountBusinessId', businessType: 'Account', externalIdField: 'accountExternalId', required: true },
    ],
  },
};

const CANONICAL_LIST_TYPES = {
  'crm.v1.account.list': 'Account',
  'crm.v1.contact.list': 'Contact',
  'crm.v1.opportunity.list': 'Opportunity',
};

const CRM_OPERATIONAL_CAPABILITIES = new Set([
  'crm.ops.v1.task.create',
  'crm.ops.v1.task.list',
  'crm.ops.v1.task.update',
  'crm.ops.v1.task.delete',
  'crm.ops.v1.note.create',
  'crm.ops.v1.note.list',
  'crm.ops.v1.note.update',
  'crm.ops.v1.note.delete',
  'crm.ops.v1.activity.list',
  'crm.ops.v1.account.delete',
  'crm.ops.v1.contact.update',
  'crm.ops.v1.contact.delete',
  'crm.ops.v1.opportunity.update',
  'crm.ops.v1.opportunity.delete',
]);
const RETIRED_CAPABILITY_PREFIXES = Object.freeze([
  'crm.ai.',
  'generative.',
  'ai.',
  'crm.ops.v1.email.',
  'crm.ops.v1.mail-calendar.',
  'crm.ops.v1.calendar.',
]);
const RETIRED_CAPABILITIES = new Set([
  'crm.meta.v1.record.communication',
  'crm.meta.v1.permission.check',
]);
function isRetiredCapability(capability) {
  return RETIRED_CAPABILITIES.has(capability) ||
    RETIRED_CAPABILITY_PREFIXES.some((prefix) => capability.startsWith(prefix));
}



const OPERATIONAL_CREATE_TYPES = {
  'crm.ops.v1.task.create': 'CrmTask',
  'crm.ops.v1.note.create': 'CrmNote',
};

const OPERATIONAL_UPDATE_TYPES = {
  'crm.ops.v1.task.update': 'CrmTask',
  'crm.ops.v1.note.update': 'CrmNote',
  'crm.ops.v1.contact.update': 'Contact',
  'crm.ops.v1.opportunity.update': 'Opportunity',
};

const OPERATIONAL_DELETE_TYPES = {
  'crm.ops.v1.account.delete': 'Account',
  'crm.ops.v1.contact.delete': 'Contact',
  'crm.ops.v1.opportunity.delete': 'Opportunity',
  'crm.ops.v1.task.delete': 'CrmTask',
  'crm.ops.v1.note.delete': 'CrmNote',
};

const OPERATIONAL_LIST_TYPES = {
  'crm.ops.v1.task.list': 'CrmTask',
  'crm.ops.v1.note.list': 'CrmNote',
};

const OPERATIONAL_TARGET_TYPES = ['Account', 'Contact', 'Opportunity'];
const OPPORTUNITY_PIPELINE_STAGES = ['NEW', 'SCREENING', 'MEETING', 'PROPOSAL', 'CUSTOMER'];
const OPPORTUNITY_LIFECYCLE_STATES = ['OPEN', 'CLOSED_WON', 'CLOSED_LOST', 'CANCELLED'];

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS provider_registration (
  id TEXT PRIMARY KEY,
  component TEXT NOT NULL,
  version TEXT NOT NULL,
  integration_mode TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  environment_scope TEXT NOT NULL,
  organization_scope TEXT,
  workspace_scope TEXT,
  lifecycle_owner TEXT NOT NULL,
  replacement_class TEXT NOT NULL,
  replacement_evidence TEXT NOT NULL,
  secret_ref TEXT,
  egress_allowlist_json TEXT NOT NULL,
  timeout_ms INTEGER NOT NULL DEFAULT 3000,
  retry_count INTEGER NOT NULL DEFAULT 0,
  failure_mode TEXT NOT NULL DEFAULT 'DEGRADE',
  contract_version TEXT,
  upstream_product TEXT,
  upstream_version TEXT,
  upstream_commit TEXT,
  upstream_digest TEXT,
  adapter_revision TEXT,
  config_revision TEXT,
  schema_revision TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS capability_binding (
  capability TEXT NOT NULL,
  provider_id TEXT NOT NULL REFERENCES provider_registration(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (capability, provider_id)
) STRICT;

CREATE TABLE IF NOT EXISTS provider_health (
  provider_id TEXT PRIMARY KEY REFERENCES provider_registration(id) ON DELETE CASCADE,
  observed_status TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  latency_ms INTEGER,
  detail TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS external_mapping (
  id TEXT PRIMARY KEY,
  business_type TEXT NOT NULL,
  business_id TEXT NOT NULL,
  provider_id TEXT NOT NULL REFERENCES provider_registration(id) ON DELETE RESTRICT,
  external_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(provider_id, external_type, external_id),
  UNIQUE(business_type, business_id, provider_id, external_type)
) STRICT;

CREATE TABLE IF NOT EXISTS crm_business_state (
  business_type TEXT NOT NULL,
  business_id TEXT NOT NULL,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (business_type, business_id)
) STRICT;

CREATE TABLE IF NOT EXISTS audit_event (
  id TEXT PRIMARY KEY,
  actor_subject TEXT NOT NULL,
  actor_username TEXT,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('provider_registration', 'contract_version', 'TEXT');
ensureColumn('provider_registration', 'upstream_product', 'TEXT');
ensureColumn('provider_registration', 'upstream_version', 'TEXT');
ensureColumn('provider_registration', 'upstream_commit', 'TEXT');
ensureColumn('provider_registration', 'upstream_digest', 'TEXT');
ensureColumn('provider_registration', 'adapter_revision', 'TEXT');
ensureColumn('provider_registration', 'config_revision', 'TEXT');
ensureColumn('provider_registration', 'schema_revision', 'TEXT');

db.exec(`
CREATE TABLE IF NOT EXISTS replacement_evidence_transition (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES provider_registration(id) ON DELETE CASCADE,
  from_level TEXT NOT NULL,
  to_level TEXT NOT NULL,
  evidence_ref TEXT NOT NULL,
  evidence_digest TEXT NOT NULL,
  decision_ref TEXT,
  scope_json TEXT NOT NULL DEFAULT '{}',
  provenance_json TEXT NOT NULL DEFAULT '{}',
  actor_subject TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  UNIQUE(provider_id, to_level, evidence_ref, evidence_digest)
) STRICT;
`);
ensureColumn('replacement_evidence_transition', 'scope_json', "TEXT NOT NULL DEFAULT '{}'");
ensureColumn('replacement_evidence_transition', 'provenance_json', "TEXT NOT NULL DEFAULT '{}'");

const providerInsert = db.prepare(`
INSERT INTO provider_registration(
  id, component, version, integration_mode, endpoint,
  environment_scope, organization_scope, workspace_scope,
  lifecycle_owner, replacement_class, replacement_evidence,
  secret_ref, egress_allowlist_json, timeout_ms, retry_count,
  failure_mode, contract_version, upstream_product, upstream_version, upstream_commit, upstream_digest,
  adapter_revision, config_revision, schema_revision,
  enabled, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
`);
const bindingInsert = db.prepare(`
INSERT INTO capability_binding(capability, provider_id, priority, enabled)
VALUES (?, ?, ?, 1)
`);
const auditInsert = db.prepare(`
INSERT INTO audit_event(id, actor_subject, actor_username, action, target, occurred_at, payload_json)
VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function nowIso() {
  return new Date().toISOString();
}

function json(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': CORS_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type, x-gbap-organization, x-gbap-workspace',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

async function readJson(req, maxBytes = 64 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function decodeSegment(segment) {
  const pad = segment.length % 4 === 0 ? '' : '='.repeat(4 - (segment.length % 4));
  return Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

async function getJwk(kid) { return getCachedJwk(kid, OIDC_JWKS_URL_INTERNAL); }

async function authenticate(req) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) throw new Error('missing_bearer_token');
  const token = header.slice(7);
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('invalid_jwt');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const headerJson = JSON.parse(decodeSegment(encodedHeader).toString('utf8'));
  const claims = JSON.parse(decodeSegment(encodedPayload).toString('utf8'));
  if (headerJson.alg !== 'RS256' || typeof headerJson.kid !== 'string') throw new Error('unsupported_jwt');
  const jwk = await getJwk(headerJson.kid);
  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const valid = verifySignature(
    'RSA-SHA256',
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    publicKey,
    decodeSegment(encodedSignature),
  );
  if (!valid) throw new Error('invalid_signature');
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= now) throw new Error('token_expired');
  if (claims.nbf && claims.nbf > now + 30) throw new Error('token_not_yet_valid');
  if (!OIDC_ALLOWED_ISSUERS.has(claims.iss)) throw new Error('invalid_issuer');
  if (claims.azp && claims.azp !== OIDC_CLIENT_ID) throw new Error('invalid_authorized_party');
  const roles = new Set(Array.isArray(claims.realm_access?.roles) ? claims.realm_access.roles : []);
  return {
    subject: claims.sub,
    username: claims.preferred_username ?? null,
    roles,
  };
}

function requireRole(actor, role) {
  if (!actor.roles.has(role)) throw new Error('forbidden');
}
function validateString(value, label, max = 512) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`invalid_${label}`);
  return value.trim();
}

function optionalString(value, label, max = 512) {
  return value === undefined || value === null || value === '' ? null : validateString(value, label, max);
}

function validateEnum(value, label, allowed) {
  const text = validateString(value, label, 64);
  if (!allowed.includes(text)) throw new Error(`invalid_${label}`);
  return text;
}

function validateOptionalText(value, label, max = 20_000) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > max) throw new Error(`invalid_${label}`);
  return value;
}

function validateOptionalIsoDate(value, label) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const text = validateString(value, label, 64);
  if (Number.isNaN(Date.parse(text))) throw new Error(`invalid_${label}`);
  return new Date(text).toISOString();
}

function httpError(message, status = 400) {
  const error = new Error(message);
  error.httpStatus = status;
  return error;
}

function recordAudit(actor, action, target, payload = {}) {
  auditInsert.run(
    randomUUID(),
    actor.subject,
    actor.username,
    action,
    target,
    nowIso(),
    JSON.stringify(payload),
  );
}

function readBusinessState(businessType, businessId) {
  if (!businessId) return null;
  const row = db.prepare('SELECT state_json FROM crm_business_state WHERE business_type=? AND business_id=?').get(businessType, businessId);
  if (!row?.state_json) return null;
  try {
    return JSON.parse(row.state_json);
  } catch {
    return null;
  }
}

function upsertBusinessState(businessType, businessId, patch) {
  const current = readBusinessState(businessType, businessId) ?? {};
  const next = { ...current };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value !== undefined) next[key] = value;
  }
  db.prepare(`
    INSERT INTO crm_business_state(business_type,business_id,state_json,updated_at)
    VALUES(?,?,?,?)
    ON CONFLICT(business_type,business_id) DO UPDATE SET state_json=excluded.state_json, updated_at=excluded.updated_at
  `).run(businessType, businessId, JSON.stringify(next), nowIso());
  return next;
}

function providerView(row) {
  return {
    id: row.id,
    component: row.component,
    version: row.version,
    integrationMode: row.integration_mode,
    endpoint: row.endpoint,
    scope: {
      environment: row.environment_scope,
      organization: row.organization_scope,
      workspace: row.workspace_scope,
    },
    lifecycleOwner: row.lifecycle_owner,
    replacementClass: row.replacement_class,
    replacementEvidence: row.replacement_evidence,
    provenance: {
      contractVersion: row.contract_version ?? null,
      upstreamProduct: row.upstream_product ?? null,
      upstreamVersion: row.upstream_version ?? null,
      upstreamCommit: row.upstream_commit ?? null,
      upstreamImageDigest: row.upstream_digest ?? null,
      adapterRevision: row.adapter_revision ?? null,
      configRevision: row.config_revision ?? null,
      schemaRevision: row.schema_revision ?? null,
    },
    secretRef: row.secret_ref,
    egressAllowlist: JSON.parse(row.egress_allowlist_json),
    timeoutMs: row.timeout_ms,
    retryCount: row.retry_count,
    failureMode: row.failure_mode,
    enabled: Boolean(row.enabled),
    capabilities: db.prepare('SELECT capability, priority, enabled FROM capability_binding WHERE provider_id=? ORDER BY priority DESC, capability').all(row.id).map((item) => ({
      name: item.capability,
      priority: item.priority,
      enabled: Boolean(item.enabled),
    })),
    health: db.prepare('SELECT observed_status AS status, checked_at AS checkedAt, latency_ms AS latencyMs, detail FROM provider_health WHERE provider_id=?').get(row.id) ?? null,
  };
}

function listProviders() {
  return db.prepare('SELECT * FROM provider_registration ORDER BY component, id').all().map(providerView);
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
    SELECT p.*, b.capability, b.priority
    FROM capability_binding b
    JOIN provider_registration p ON p.id=b.provider_id
    WHERE b.capability=?
      AND b.enabled=1
      AND p.enabled=1
      AND p.environment_scope=?
      AND (p.organization_scope IS NULL OR p.organization_scope=?)
      AND (p.workspace_scope IS NULL OR p.workspace_scope=?)
    ORDER BY
      CASE WHEN p.workspace_scope IS NULL THEN 0 ELSE 1 END DESC,
      CASE WHEN p.organization_scope IS NULL THEN 0 ELSE 1 END DESC,
      b.priority DESC,
      p.id ASC
    LIMIT 1
  `).get(capability, scope.environment, scope.organization, scope.workspace);
}

async function invokeProvider(provider, capability, actor, scope, payload) {
  const endpoint = new URL(provider.endpoint);
  const allowlist = JSON.parse(provider.egress_allowlist_json);
  if (!allowlist.includes(endpoint.hostname)) throw new Error('egress_denied');
  const requestId = randomUUID();
  const body = JSON.stringify({
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
  });
  let lastError;
  for (let attempt = 0; attempt <= provider.retry_count; attempt += 1) {
    try {
      const response = await fetch(new URL('/invoke', endpoint), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-gbap-request-id': requestId },
        body,
        signal: AbortSignal.timeout(provider.timeout_ms),
      });
      const responseBody = await response.json().catch(() => ({ error: 'invalid_provider_json' }));
      if (!response.ok) {
        const providerCode =
          typeof responseBody?.error === 'string' &&
          /^[a-z0-9_.:-]{1,180}$/iu.test(responseBody.error.trim())
            ? responseBody.error.trim()
            : '';
        throw new Error(
          providerCode
            ? `provider_http_${response.status}:${providerCode}`
            : `provider_http_${response.status}`,
        );
      }
      return { requestId, providerId: provider.id, result: responseBody };
    } catch (error) {
      lastError = error;
      if (attempt >= provider.retry_count) break;
    }
  }
  throw lastError ?? new Error('provider_invoke_failed');
}

function findBusinessMapping(providerId, businessType, businessId) {
  return db.prepare(`
    SELECT * FROM external_mapping
    WHERE provider_id=? AND business_type=? AND business_id=?
    ORDER BY created_at DESC LIMIT 1
  `).get(providerId, businessType, businessId);
}

function findExternalMapping(providerId, externalType, externalId) {
  return db.prepare(`
    SELECT * FROM external_mapping
    WHERE provider_id=? AND external_type=? AND external_id=?
    ORDER BY created_at DESC LIMIT 1
  `).get(providerId, externalType, externalId);
}

function resolveBusinessRelation(provider, businessType, businessId, label) {
  if (businessId === null || businessId === '') return null;
  const normalized = validateString(businessId, label, 255);
  const mapping = findBusinessMapping(provider.id, businessType, normalized);
  if (!mapping) throw httpError(`operational_mapping_missing:${businessType}:${normalized}`, 409);
  return mapping.external_id;
}

function prepareCanonicalCrmPayload(provider, capability, input) {
  if (!CANONICAL_CRM_CAPABILITIES.has(capability)) return { payload: input, rule: null };
  if (provider.contract_version !== CANONICAL_CRM_CONTRACT) {
    throw httpError('canonical_contract_version_mismatch', 409);
  }

  if (CANONICAL_LIST_TYPES[capability]) {
    const payload = { ...(input ?? {}) };
    const limit = payload.limit === undefined ? 100 : Number(payload.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 10000) {
      throw httpError('invalid_canonical_list_limit', 400);
    }
    payload.limit = limit;

    if (capability === 'crm.v1.account.list') {
      if (payload.query !== undefined) {
        payload.query = validateString(payload.query, 'account_query', 512);
      }
      if (payload.businessIds !== undefined) {
        if (!Array.isArray(payload.businessIds) || payload.businessIds.length < 1 || payload.businessIds.length > 100) {
          throw httpError('invalid_account_business_ids', 400);
        }
        payload.externalIds = [...new Set(payload.businessIds.map((value) => {
          const businessId = validateString(value, 'account_business_id', 255);
          const mapping = findBusinessMapping(provider.id, 'Account', businessId);
          if (!mapping) throw httpError(`canonical_mapping_missing:Account:${businessId}`, 409);
          return mapping.external_id;
        }))];
        delete payload.businessIds;
      }
    }

    if (
      (capability === 'crm.v1.contact.list' || capability === 'crm.v1.opportunity.list') &&
      payload.accountBusinessId !== undefined
    ) {
      payload.accountExternalId = resolveBusinessRelation(
        provider,
        'Account',
        payload.accountBusinessId,
        'account_business_id',
      );
      delete payload.accountBusinessId;
    }

    return { payload, rule: null };
  }

  const rule = CANONICAL_CREATE_RULES[capability] ?? null;
  if (!rule) return { payload: input, rule: null };

  const businessId = validateString(input?.businessId, 'business_id', 255);
  const payload = { ...(input ?? {}) };

  if (capability === 'crm.v1.account.create') payload.displayName = validateString(payload.displayName, 'account_display_name', 512);
  if (capability === 'crm.v1.contact.create') payload.personName = validateString(payload.personName, 'contact_person_name', 512);
  if (capability === 'crm.v1.opportunity.create') {
    payload.nameSummary = validateString(payload.nameSummary, 'opportunity_name_summary', 512);
    payload.lifecycleState = validateEnum(payload.lifecycleState, 'opportunity_lifecycle_state', ['OPEN']);
  }

  for (const relation of rule.related) {
    const relatedBusinessId = payload[relation.businessIdField];
    if (!relatedBusinessId && relation.required) throw httpError(`canonical_relation_required:${relation.businessType}`, 409);
    if (!relatedBusinessId) continue;
    const mapping = findBusinessMapping(provider.id, relation.businessType, validateString(relatedBusinessId, relation.businessIdField, 255));
    if (!mapping) throw httpError(`canonical_mapping_missing:${relation.businessType}:${relatedBusinessId}`, 409);
    payload[relation.externalIdField] = mapping.external_id;
  }
  return { payload, rule: { ...rule, businessId } };
}

function resolveOperationalReadTargets(provider, inputTargets) {
  if (inputTargets === undefined) return [];
  if (!Array.isArray(inputTargets) || inputTargets.length > 250) {
    throw httpError('invalid_operational_read_targets', 400);
  }
  const seen = new Set();
  const resolved = [];
  for (const target of inputTargets) {
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
      throw httpError('invalid_operational_read_target', 400);
    }
    const businessType = validateEnum(
      target.businessType,
      'operational_read_target_business_type',
      OPERATIONAL_TARGET_TYPES,
    );
    const businessId = validateString(
      target.businessId,
      'operational_read_target_business_id',
      255,
    );
    const mapping = findBusinessMapping(provider.id, businessType, businessId);
    if (!mapping) {
      throw httpError(`operational_mapping_missing:${businessType}:${businessId}`, 409);
    }
    const key = `${mapping.external_type}:${mapping.external_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push({
      externalType: mapping.external_type,
      externalId: mapping.external_id,
    });
  }
  return resolved;
}

function resolveOperationalTargets(provider, inputTargets) {
  if (inputTargets === undefined) return undefined;
  if (!Array.isArray(inputTargets) || inputTargets.length > 20) throw new Error('invalid_operational_targets');
  return inputTargets.map((target) => {
    if (!target || typeof target !== 'object' || Array.isArray(target)) throw new Error('invalid_operational_target');
    const businessType = validateEnum(target.businessType, 'operational_target_business_type', OPERATIONAL_TARGET_TYPES);
    const businessId = validateString(target.businessId, 'operational_target_business_id', 255);
    const mapping = findBusinessMapping(provider.id, businessType, businessId);
    if (!mapping) throw httpError(`operational_mapping_missing:${businessType}:${businessId}`, 409);
    return { externalType: mapping.external_type, externalId: mapping.external_id };
  });
}

function prepareOperationalCrmPayload(provider, capability, input) {
  if (!CRM_OPERATIONAL_CAPABILITIES.has(capability)) return { payload: input, operationalRule: null };
  const payload = { ...(input ?? {}) };
  const createBusinessType = OPERATIONAL_CREATE_TYPES[capability];
  const updateBusinessType = OPERATIONAL_UPDATE_TYPES[capability];
  const deleteBusinessType = OPERATIONAL_DELETE_TYPES[capability];

  if (createBusinessType) {
    const businessId = validateString(payload.businessId, 'operational_business_id', 255);
    payload.title = validateString(payload.title, 'operational_title', 512);
    payload.bodyMarkdown = validateOptionalText(payload.bodyMarkdown, 'operational_body');
    payload.targets = resolveOperationalTargets(provider, payload.targets ?? []);
    if (createBusinessType === 'CrmTask') {
      payload.status = validateEnum(payload.status ?? 'TODO', 'task_status', ['TODO', 'DONE']);
      payload.dueAt = validateOptionalIsoDate(payload.dueAt, 'task_due_at');
    }
    return { payload, operationalRule: { mode: 'create', businessType: createBusinessType, businessId } };
  }

  if (deleteBusinessType) {
    const businessId = validateString(payload.businessId, 'operational_business_id', 255);
    const mapping = findBusinessMapping(provider.id, deleteBusinessType, businessId);
    if (!mapping) throw httpError(`operational_mapping_missing:${deleteBusinessType}:${businessId}`, 409);
    return {
      payload: {
        externalId: mapping.external_id,
        externalType: mapping.external_type,
      },
      operationalRule: {
        mode: 'delete',
        businessType: deleteBusinessType,
        businessId,
        mappingId: mapping.id,
      },
    };
  }

  if (capability === 'crm.ops.v1.activity.list') {
    const limit = payload.limit === undefined ? 100 : Number(payload.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw httpError('invalid_operational_activity_limit', 400);
    }
    payload.limit = limit;
    payload.targets = resolveOperationalReadTargets(provider, payload.targets ?? []);
    return {
      payload,
      operationalRule: {
        mode: 'list',
        targetFiltered: payload.targets.length > 0,
      },
    };
  }

  if (updateBusinessType) {
    const businessId = validateString(payload.businessId, 'operational_business_id', 255);
    const mapping = findBusinessMapping(provider.id, updateBusinessType, businessId);
    if (!mapping) throw httpError(`operational_mapping_missing:${updateBusinessType}:${businessId}`, 409);
    payload.externalId = mapping.external_id;
    payload.externalType = mapping.external_type;

    if (updateBusinessType === 'Contact') {
      if (payload.personName !== undefined) payload.personName = validateString(payload.personName, 'contact_person_name', 512);
      if (payload.email !== undefined) payload.email = payload.email === null || payload.email === '' ? null : validateString(payload.email, 'contact_email', 512);
      if (payload.accountBusinessId !== undefined) {
        payload.accountExternalId = resolveBusinessRelation(provider, 'Account', payload.accountBusinessId, 'contact_account_business_id');
      }
      delete payload.accountBusinessId;
      return { payload, operationalRule: { mode: 'update', businessType: updateBusinessType, businessId } };
    }

    if (updateBusinessType === 'Opportunity') {
      if (payload.nameSummary !== undefined) payload.nameSummary = validateString(payload.nameSummary, 'opportunity_name_summary', 512);
      if (payload.estimatedValue !== undefined && (typeof payload.estimatedValue !== 'number' || !Number.isFinite(payload.estimatedValue) || payload.estimatedValue < 0)) throw new Error('invalid_opportunity_estimated_value');
      if (payload.currencyCode !== undefined) payload.currencyCode = validateString(payload.currencyCode, 'opportunity_currency_code', 3).toUpperCase();
      if (payload.pipelineStage !== undefined) payload.pipelineStage = validateEnum(payload.pipelineStage, 'opportunity_pipeline_stage', OPPORTUNITY_PIPELINE_STAGES);
      if (payload.lifecycleState !== undefined) payload.lifecycleState = validateEnum(payload.lifecycleState, 'opportunity_lifecycle_state', OPPORTUNITY_LIFECYCLE_STATES);
      payload.nextStep = validateOptionalText(payload.nextStep, 'opportunity_next_step', 4000);
      if (payload.accountBusinessId !== undefined) {
        payload.accountExternalId = resolveBusinessRelation(provider, 'Account', payload.accountBusinessId, 'opportunity_account_business_id');
      }
      delete payload.accountBusinessId;
      return { payload, operationalRule: { mode: 'update', businessType: updateBusinessType, businessId } };
    }

    if (payload.title !== undefined) payload.title = validateString(payload.title, 'operational_title', 512);
    payload.bodyMarkdown = validateOptionalText(payload.bodyMarkdown, 'operational_body');
    if (updateBusinessType === 'CrmTask') {
      if (payload.status !== undefined) payload.status = validateEnum(payload.status, 'task_status', ['TODO', 'DONE']);
      payload.dueAt = validateOptionalIsoDate(payload.dueAt, 'task_due_at');
    }
    delete payload.targets;
    return { payload, operationalRule: { mode: 'update', businessType: updateBusinessType, businessId } };
  }

  return { payload, operationalRule: null };
}

function prepareCrmPayload(provider, capability, input) {
  if (CANONICAL_CRM_CAPABILITIES.has(capability)) return { ...prepareCanonicalCrmPayload(provider, capability, input), operationalRule: null };
  if (CRM_OPERATIONAL_CAPABILITIES.has(capability)) return { rule: null, ...prepareOperationalCrmPayload(provider, capability, input) };
  return { payload: input, rule: null, operationalRule: null };
}

function ensureBusinessMapping(actor, provider, businessType, businessId, record, source, contractVersion = null) {
  if (!record || typeof record.externalId !== 'string' || !record.externalId || typeof record.externalType !== 'string' || !record.externalType) {
    throw httpError('provider_record_missing_external_identity', 502);
  }
  const existing = findBusinessMapping(provider.id, businessType, businessId);
  if (existing) {
    if (existing.external_id !== record.externalId || existing.external_type !== record.externalType) throw httpError('business_id_mapping_conflict', 409);
    return existing;
  }
  const externalExisting = findExternalMapping(provider.id, record.externalType, record.externalId);
  if (externalExisting) {
    if (externalExisting.business_type !== businessType || externalExisting.business_id !== businessId) throw httpError('external_id_mapping_conflict', 409);
    return externalExisting;
  }
  const id = randomUUID();
  db.prepare(`INSERT INTO external_mapping(id,business_type,business_id,provider_id,external_type,external_id,created_at) VALUES(?,?,?,?,?,?,?)`).run(
    id, businessType, businessId, provider.id, record.externalType, record.externalId, nowIso(),
  );
  recordAudit(actor, 'mapping.create', `mapping:${id}`, {
    businessType,
    businessId,
    providerId: provider.id,
    externalType: record.externalType,
    externalId: record.externalId,
    source,
    ...(contractVersion ? { contractVersion } : {}),
  });
  return { id, business_type: businessType, business_id: businessId, provider_id: provider.id, external_type: record.externalType, external_id: record.externalId };
}

function ensureCanonicalMapping(actor, provider, businessType, businessId, record) {
  return ensureBusinessMapping(actor, provider, businessType, businessId, record, 'canonical-crm-contract', CANONICAL_CRM_CONTRACT);
}

function overlayCanonicalRelations(providerId, businessType, record) {
  if (!record || !record.accountExternalId || !['Contact', 'Opportunity'].includes(businessType)) return record;
  const accountMapping = findExternalMapping(providerId, 'company', record.accountExternalId);
  return { ...record, accountBusinessId: accountMapping?.business_id ?? null };
}

function overlayBusinessState(businessType, businessId, record) {
  if (!businessId || businessType !== 'Opportunity') return record;
  const state = readBusinessState(businessType, businessId);
  if (!state) return record;
  return {
    ...record,
    ...(state.lifecycleState ? { lifecycleState: state.lifecycleState } : {}),
    ...(Object.prototype.hasOwnProperty.call(state, 'nextStep') ? { nextStep: state.nextStep } : {}),
  };
}

function annotateCanonicalRecord(providerId, businessType, record) {
  if (!record || !record.externalId || !record.externalType) return record;
  const mapping = findExternalMapping(providerId, record.externalType, record.externalId);
  const businessId = mapping?.business_id ?? null;
  const related = overlayCanonicalRelations(providerId, businessType, record);
  return overlayBusinessState(businessType, businessId, { ...related, businessId, businessType });
}

function operationalBusinessTypeForRecord(record, fallback) {
  if (fallback) return fallback;
  if (record?.kind === 'TASK' || record?.externalType === 'task') return 'CrmTask';
  if (record?.kind === 'NOTE' || record?.externalType === 'note') return 'CrmNote';
  return null;
}

function reverseOperationalTargets(providerId, targets) {
  if (!Array.isArray(targets)) return [];
  const output = [];
  const seen = new Set();
  for (const target of targets) {
    if (!target?.externalType || !target?.externalId) continue;
    const mapping = findExternalMapping(providerId, target.externalType, target.externalId);
    if (!mapping || !OPERATIONAL_TARGET_TYPES.includes(mapping.business_type)) continue;
    const key = `${mapping.business_type}:${mapping.business_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({ businessType: mapping.business_type, businessId: mapping.business_id });
  }
  return output;
}

function annotateOperationalRecord(actor, provider, record, fallbackBusinessType = null, forcedBusinessId = null) {
  const businessType = operationalBusinessTypeForRecord(record, fallbackBusinessType);
  if (!businessType || !record?.externalId || !record?.externalType) throw httpError('operational_provider_record_missing_external_identity', 502);
  let mapping = findExternalMapping(provider.id, record.externalType, record.externalId);
  if (!mapping) {
    mapping = ensureBusinessMapping(
      actor,
      provider,
      businessType,
      forcedBusinessId ?? randomUUID(),
      record,
      forcedBusinessId ? 'crm-operational-create' : 'crm-operational-list-adoption',
    );
  }
  const { externalId, externalType, targets, ...businessRecord } = record;
  return {
    ...businessRecord,
    businessId: mapping.business_id,
    businessType,
    targets: reverseOperationalTargets(provider.id, targets),
  };
}

function finalizeCanonicalCrmResult(actor, provider, capability, prepared, invocation) {
  if (!CANONICAL_CRM_CAPABILITIES.has(capability)) return invocation;
  const responseBody = invocation.result;
  if (prepared.rule) {
    const mapping = ensureCanonicalMapping(actor, provider, prepared.rule.businessType, prepared.rule.businessId, responseBody?.record);
    if (capability === 'crm.v1.opportunity.create') {
      upsertBusinessState('Opportunity', prepared.rule.businessId, {
        lifecycleState: prepared.payload.lifecycleState,
        nextStep: prepared.payload.nextStep ?? null,
      });
    }
    responseBody.record = overlayBusinessState(prepared.rule.businessType, prepared.rule.businessId, {
      ...responseBody.record,
      businessId: prepared.rule.businessId,
      businessType: prepared.rule.businessType,
      mappingId: mapping.id,
    });
  }

  const listType = CANONICAL_LIST_TYPES[capability];
  if (listType && Array.isArray(responseBody?.records)) {
    responseBody.records = responseBody.records.map((record) => annotateCanonicalRecord(provider.id, listType, record));
  }

  if (capability === 'crm.v1.snapshot.export' && responseBody?.snapshot) {
    responseBody.snapshot.contractVersion = CANONICAL_CRM_CONTRACT;
    responseBody.snapshot.accounts = (responseBody.snapshot.accounts ?? []).map((record) => annotateCanonicalRecord(provider.id, 'Account', record));
    responseBody.snapshot.contacts = (responseBody.snapshot.contacts ?? []).map((record) => annotateCanonicalRecord(provider.id, 'Contact', record));
    responseBody.snapshot.opportunities = (responseBody.snapshot.opportunities ?? []).map((record) => annotateCanonicalRecord(provider.id, 'Opportunity', record));
  }
  return invocation;
}

function finalizeOperationalCrmResult(actor, provider, capability, prepared, invocation) {
  if (!CRM_OPERATIONAL_CAPABILITIES.has(capability)) return invocation;
  const responseBody = invocation.result;
  const operation = prepared.operationalRule;
  if (operation?.mode === 'delete' && responseBody?.deleted === true) {
    const removed = db.prepare(
      'DELETE FROM external_mapping WHERE id=? AND provider_id=? AND business_type=? AND business_id=?'
    ).run(operation.mappingId, provider.id, operation.businessType, operation.businessId);
    if (removed.changes !== 1) throw httpError('operational_mapping_delete_conflict', 409);
    if (operation.businessType === 'Opportunity') {
      db.prepare('DELETE FROM crm_business_state WHERE business_type=? AND business_id=?')
        .run('Opportunity', operation.businessId);
    }
    recordAudit(actor, 'crm.operational.mapping.delete', `mapping:${operation.mappingId}`, {
      capability,
      businessType: operation.businessType,
      businessId: operation.businessId,
      providerId: provider.id,
    });
  }

  if (operation && responseBody?.record) {
    if (operation.businessType === 'Opportunity') {
      if (prepared.payload.lifecycleState !== undefined || prepared.payload.nextStep !== undefined) {
        upsertBusinessState('Opportunity', operation.businessId, {
          lifecycleState: prepared.payload.lifecycleState,
          nextStep: prepared.payload.nextStep,
        });
      }
      responseBody.record = annotateCanonicalRecord(provider.id, 'Opportunity', responseBody.record);
    } else if (operation.businessType === 'Contact') {
      responseBody.record = annotateCanonicalRecord(provider.id, 'Contact', responseBody.record);
    } else {
      responseBody.record = annotateOperationalRecord(actor, provider, responseBody.record, operation.businessType, operation.businessId);
    }
  }
  const listType = OPERATIONAL_LIST_TYPES[capability];
  if (listType && Array.isArray(responseBody?.records)) {
    responseBody.records = responseBody.records.map((record) => annotateOperationalRecord(actor, provider, record, listType));
  }
  if (capability === 'crm.ops.v1.activity.list' && Array.isArray(responseBody?.records)) {
    responseBody.records = responseBody.records.map((record) => annotateOperationalRecord(actor, provider, record));
  }
  return invocation;
}

function finalizeCrmResult(actor, provider, capability, prepared, invocation) {
  if (CANONICAL_CRM_CAPABILITIES.has(capability)) return finalizeCanonicalCrmResult(actor, provider, capability, prepared, invocation);
  if (CRM_OPERATIONAL_CAPABILITIES.has(capability)) return finalizeOperationalCrmResult(actor, provider, capability, prepared, invocation);
  return invocation;
}

function evidenceHistory(providerId) {
  return db.prepare(`
    SELECT id, provider_id AS providerId, from_level AS fromLevel, to_level AS toLevel,
           evidence_ref AS evidenceRef, evidence_digest AS evidenceDigest,
           decision_ref AS decisionRef, scope_json AS scopeJson, provenance_json AS provenanceJson,
           actor_subject AS actorSubject, occurred_at AS occurredAt
    FROM replacement_evidence_transition
    WHERE provider_id=? ORDER BY occurred_at ASC, id ASC
  `).all(providerId).map((row) => ({
    id: row.id,
    providerId: row.providerId,
    fromLevel: row.fromLevel,
    toLevel: row.toLevel,
    evidenceRef: row.evidenceRef,
    evidenceDigest: row.evidenceDigest,
    decisionRef: row.decisionRef,
    scope: JSON.parse(row.scopeJson),
    provenance: JSON.parse(row.provenanceJson),
    actorSubject: row.actorSubject,
    occurredAt: row.occurredAt,
  }));
}

async function handle(req, res) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (url.pathname === '/healthz') {
    return json(res, 200, { status: 'ok', service: 'gbap-substrate-api', environment: SUBSTRATE_ENV, canonicalCrmContract: CANONICAL_CRM_CONTRACT });
  }

  let actor;
  try {
    actor = await authenticate(req);
  } catch (error) {
    return json(res, 401, { error: 'unauthorized', detail: error.message });
  }

  try {
    if (req.method === 'GET' && url.pathname === '/api/me') {
      return json(res, 200, { subject: actor.subject, username: actor.username, roles: [...actor.roles].sort() });
    }

    if (req.method === 'GET' && url.pathname === '/api/providers') {
      requireRole(actor, 'substrate-user');
      return json(res, 200, { providers: listProviders() });
    }

    if (req.method === 'POST' && url.pathname === '/api/providers') {
      requireRole(actor, 'substrate-admin');
      const input = await readJson(req);
      const id = validateString(input.id, 'provider_id', 128);
      const component = validateString(input.component, 'component', 128);
      const version = validateString(input.version, 'version', 128);
      const integrationMode = validateEnum(input.integrationMode, 'integration_mode', [
        'STANDARDS_DEPENDENCY', 'NATIVE_LIBRARY_REUSE', 'HEADLESS_PROVIDER', 'MANAGED_SERVICE',
        'OPERATOR_MANAGED_SERVICE', 'PROVIDER_MANAGED_SAAS', 'UI_EXTENSION_OR_EXTERNAL_ADMIN', 'INDEPENDENT_AGENT',
      ]);
      const endpoint = new URL(validateString(input.endpoint, 'endpoint', 1024));
      const lifecycleOwner = validateEnum(input.lifecycleOwner ?? 'GBAP_MANAGED', 'lifecycle_owner', ['GBAP_MANAGED', 'OPERATOR_MANAGED', 'PROVIDER_MANAGED', 'MIXED']);
      const replacementClass = validateEnum(input.replacementClass ?? 'R2', 'replacement_class', ['R1', 'R2', 'R3', 'R4']);
      const replacementEvidence = validateEnum(input.replacementEvidence ?? 'E0', 'replacement_evidence', ['E0', 'E1', 'E2', 'E3']);
      if (replacementEvidence !== 'E0') throw new Error('replacement_evidence_must_start_at_E0');
      const failureMode = validateEnum(input.failureMode ?? 'DEGRADE', 'failure_mode', ['DEGRADE', 'QUEUE_RETRY', 'FAIL_CLOSED', 'MANUAL_FALLBACK', 'HARD_STOP']);
      const egressAllowlist = Array.isArray(input.egressAllowlist) ? input.egressAllowlist.map((host) => validateString(host, 'egress_host', 253)) : [];
      if (!egressAllowlist.includes(endpoint.hostname)) throw new Error('endpoint_not_in_egress_allowlist');
      const timeoutMs = Number.isInteger(input.timeoutMs) && input.timeoutMs >= 100 && input.timeoutMs <= 180_000 ? input.timeoutMs : 3000;
      const retryCount = Number.isInteger(input.retryCount) && input.retryCount >= 0 && input.retryCount <= 3 ? input.retryCount : 0;
      const capabilities = Array.isArray(input.capabilities) ? input.capabilities : [];
      if (capabilities.length === 0 || capabilities.length > 64) throw new Error('invalid_capabilities');

      const provenance = input.provenance ?? {};
      const contractVersion = optionalString(provenance.contractVersion, 'contract_version', 128);
      const capabilityNames = capabilities.map((item) => typeof item?.name === 'string' ? item.name : '');
      const hasCanonicalCrm = capabilityNames.some((name) => name.startsWith('crm.v1.'));
      const hasRetiredCapability = capabilityNames.some((name) => isRetiredCapability(name));
      if (hasCanonicalCrm && contractVersion !== CANONICAL_CRM_CONTRACT) throw new Error('canonical_crm_provider_requires_contract_version');
      if (hasRetiredCapability) throw new Error('retired_capability_not_allowed');
      const upstreamProduct = optionalString(provenance.upstreamProduct, 'upstream_product', 128);
      const upstreamVersion = optionalString(provenance.upstreamVersion, 'upstream_version', 128);
      const upstreamCommit = optionalString(provenance.upstreamCommit, 'upstream_commit', 255);
      const upstreamImageDigest = optionalString(provenance.upstreamImageDigest ?? provenance.upstreamDigest, 'upstream_image_digest', 255);
      if (upstreamImageDigest && !/^sha256:[a-f0-9]{64}$/i.test(upstreamImageDigest)) throw new Error('invalid_upstream_image_digest');
      const adapterRevision = optionalString(provenance.adapterRevision, 'adapter_revision', 255);
      const configRevision = optionalString(provenance.configRevision, 'config_revision', 255);
      const schemaRevision = optionalString(provenance.schemaRevision, 'schema_revision', 255);
      if (hasCanonicalCrm && (!upstreamProduct || !upstreamVersion || !adapterRevision || (!upstreamCommit && !upstreamImageDigest))) {
        throw new Error('canonical_crm_provider_requires_provenance');
      }
      const createdAt = nowIso();

      db.exec('BEGIN IMMEDIATE');
      try {
        providerInsert.run(
          id,
          component,
          version,
          integrationMode,
          endpoint.toString().replace(/\/$/, ''),
          validateString(input.environmentScope ?? SUBSTRATE_ENV, 'environment_scope', 64),
          input.organizationScope ? validateString(input.organizationScope, 'organization_scope', 128) : null,
          input.workspaceScope ? validateString(input.workspaceScope, 'workspace_scope', 128) : null,
          lifecycleOwner,
          replacementClass,
          replacementEvidence,
          input.secretRef ? validateString(input.secretRef, 'secret_ref', 255) : null,
          JSON.stringify(egressAllowlist),
          timeoutMs,
          retryCount,
          failureMode,
          contractVersion,
          upstreamProduct,
          upstreamVersion,
          upstreamCommit,
          upstreamImageDigest,
          adapterRevision,
          configRevision,
          schemaRevision,
          createdAt,
          createdAt,
        );
        for (const capability of capabilities) {
          bindingInsert.run(validateString(capability.name, 'capability_name', 128), id, Number.isInteger(capability.priority) ? capability.priority : 100);
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      recordAudit(actor, 'provider.register', `provider:${id}`, { component, version, integrationMode, capabilities, provenance: { contractVersion, upstreamProduct, upstreamVersion, upstreamCommit, upstreamImageDigest, adapterRevision, configRevision, schemaRevision } });
      return json(res, 201, { provider: providerView(db.prepare('SELECT * FROM provider_registration WHERE id=?').get(id)) });
    }

    const statusMatch = url.pathname.match(/^\/api\/providers\/([^/]+)\/status$/);
    if (req.method === 'PATCH' && statusMatch) {
      requireRole(actor, 'substrate-admin');
      const providerId = decodeURIComponent(statusMatch[1]);
      const input = await readJson(req);
      if (typeof input.enabled !== 'boolean') throw new Error('invalid_enabled');
      const result = db.prepare('UPDATE provider_registration SET enabled=?, updated_at=? WHERE id=?').run(input.enabled ? 1 : 0, nowIso(), providerId);
      if (result.changes !== 1) return json(res, 404, { error: 'provider_not_found' });
      recordAudit(actor, input.enabled ? 'provider.enable' : 'provider.disable', `provider:${providerId}`, {});
      return json(res, 200, { provider: providerView(db.prepare('SELECT * FROM provider_registration WHERE id=?').get(providerId)) });
    }

    const evidenceMatch = url.pathname.match(/^\/api\/providers\/([^/]+)\/replacement-evidence$/);
    if (req.method === 'GET' && evidenceMatch) {
      requireRole(actor, 'substrate-user');
      const providerId = decodeURIComponent(evidenceMatch[1]);
      const provider = db.prepare('SELECT * FROM provider_registration WHERE id=?').get(providerId);
      if (!provider) return json(res, 404, { error: 'provider_not_found' });
      return json(res, 200, { providerId, currentLevel: provider.replacement_evidence, history: evidenceHistory(providerId) });
    }

    const advanceMatch = url.pathname.match(/^\/api\/providers\/([^/]+)\/replacement-evidence\/advance$/);
    if (req.method === 'POST' && advanceMatch) {
      requireRole(actor, 'substrate-admin');
      const providerId = decodeURIComponent(advanceMatch[1]);
      const provider = db.prepare('SELECT * FROM provider_registration WHERE id=?').get(providerId);
      if (!provider) return json(res, 404, { error: 'provider_not_found' });
      const input = await readJson(req);
      const toLevel = validateEnum(input.toLevel, 'replacement_evidence', ['E1', 'E2', 'E3']);
      const levels = ['E0', 'E1', 'E2', 'E3'];
      if (levels.indexOf(toLevel) !== levels.indexOf(provider.replacement_evidence) + 1) throw httpError('replacement_evidence_transition_must_be_stepwise', 409);
      const evidenceRef = validateString(input.evidenceRef, 'evidence_ref', 1024);
      const evidenceDigest = validateString(input.evidenceDigest, 'evidence_digest', 255);
      if (!/^sha256:[a-f0-9]{64}$/i.test(evidenceDigest)) throw new Error('invalid_evidence_digest');
      const decisionRef = optionalString(input.decisionRef, 'decision_ref', 1024);
      const scope = input.scope;
      if (!scope || typeof scope !== 'object' || Array.isArray(scope) || Object.keys(scope).length === 0) throw new Error('replacement_evidence_scope_required');
      const scopeJson = JSON.stringify(scope);
      if (scopeJson.length > 4096) throw new Error('replacement_evidence_scope_too_large');
      const provenanceSnapshot = providerView(provider).provenance;
      const provenanceJson = JSON.stringify(provenanceSnapshot);
      const id = randomUUID();
      const occurredAt = nowIso();
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(`
          INSERT INTO replacement_evidence_transition(
            id,provider_id,from_level,to_level,evidence_ref,evidence_digest,decision_ref,scope_json,provenance_json,actor_subject,occurred_at
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
        `).run(id, providerId, provider.replacement_evidence, toLevel, evidenceRef, evidenceDigest, decisionRef, scopeJson, provenanceJson, actor.subject, occurredAt);
        db.prepare('UPDATE provider_registration SET replacement_evidence=?, updated_at=? WHERE id=?').run(toLevel, occurredAt, providerId);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      recordAudit(actor, 'provider.replacement_evidence.advance', `provider:${providerId}`, {
        fromLevel: provider.replacement_evidence,
        toLevel,
        evidenceRef,
        evidenceDigest,
        decisionRef,
        scope,
        provenance: provenanceSnapshot,
      });
      return json(res, 200, { provider: providerView(db.prepare('SELECT * FROM provider_registration WHERE id=?').get(providerId)), transition: evidenceHistory(providerId).at(-1) });
    }

    const providerMatch = url.pathname.match(/^\/api\/providers\/([^/]+)$/);
    if (req.method === 'DELETE' && providerMatch) {
      requireRole(actor, 'substrate-admin');
      const providerId = decodeURIComponent(providerMatch[1]);
      const mappings = db.prepare('SELECT COUNT(*) AS count FROM external_mapping WHERE provider_id=?').get(providerId)?.count ?? 0;
      if (mappings > 0) return json(res, 409, { error: 'provider_has_durable_mappings', count: mappings });
      const result = db.prepare('DELETE FROM provider_registration WHERE id=?').run(providerId);
      if (result.changes !== 1) return json(res, 404, { error: 'provider_not_found' });
      recordAudit(actor, 'provider.unregister', `provider:${providerId}`, {});
      return json(res, 200, { removed: providerId });
    }

    const invokeMatch = url.pathname.match(/^\/api\/capabilities\/([^/]+)\/invoke$/);
    if (req.method === 'POST' && invokeMatch) {
      requireRole(actor, 'substrate-user');
      const capability = decodeURIComponent(invokeMatch[1]);
      if (isRetiredCapability(capability)) {
        return json(res, 404, { error: 'capability_not_found' });
      }
      const scope = parseScope(req);
      const provider = resolveProvider(capability, scope);
      if (!provider) return json(res, 503, { error: 'capability_unavailable', capability });
      const input = await readJson(req);
      try {
        const prepared = prepareCrmPayload(provider, capability, input.payload ?? input);
        const invocation = await invokeProvider(provider, capability, actor, scope, prepared.payload);
        return json(res, 200, finalizeCrmResult(actor, provider, capability, prepared, invocation));
      } catch (error) {
        if (error.httpStatus && error.httpStatus < 500) {
          recordAudit(actor, 'crm.boundary.rejected', `provider:${provider.id}`, { capability, error: error.message });
          return json(res, error.httpStatus, { error: error.message, capability, providerId: provider.id });
        }
        recordAudit(actor, 'provider.invoke.failed', `provider:${provider.id}`, { capability, error: error.message });
        return json(res, 503, { error: 'provider_unavailable', capability, providerId: provider.id });
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/mappings') {
      requireRole(actor, 'substrate-admin');
      const input = await readJson(req);
      const id = randomUUID();
      const businessType = validateString(input.businessType, 'business_type', 128);
      const businessId = validateString(input.businessId, 'business_id', 255);
      const providerId = validateString(input.providerId, 'provider_id', 128);
      const externalType = validateString(input.externalType, 'external_type', 128);
      const externalId = validateString(input.externalId, 'external_id', 255);
      db.prepare(`INSERT INTO external_mapping(id,business_type,business_id,provider_id,external_type,external_id,created_at) VALUES(?,?,?,?,?,?,?)`).run(id, businessType, businessId, providerId, externalType, externalId, nowIso());
      recordAudit(actor, 'mapping.create', `mapping:${id}`, { businessType, businessId, providerId, externalType, externalId });
      return json(res, 201, { id, businessType, businessId, providerId, externalType, externalId });
    }

    if (req.method === 'GET' && url.pathname === '/api/mappings') {
      requireRole(actor, 'substrate-user');
      return json(res, 200, { mappings: db.prepare('SELECT * FROM external_mapping ORDER BY created_at DESC').all() });
    }

    const mappingMatch = url.pathname.match(/^\/api\/mappings\/([^/]+)$/);
    if (req.method === 'DELETE' && mappingMatch) {
      requireRole(actor, 'substrate-admin');
      const mappingId = decodeURIComponent(mappingMatch[1]);
      const mapping = db.prepare('SELECT * FROM external_mapping WHERE id=?').get(mappingId);
      if (!mapping) return json(res, 404, { error: 'mapping_not_found' });
      const result = db.prepare('DELETE FROM external_mapping WHERE id=?').run(mappingId);
      if (result.changes !== 1) return json(res, 409, { error: 'mapping_delete_conflict' });
      recordAudit(actor, 'mapping.delete', `mapping:${mappingId}`, {
        businessType: mapping.business_type,
        businessId: mapping.business_id,
        providerId: mapping.provider_id,
        externalType: mapping.external_type,
        externalId: mapping.external_id,
      });
      return json(res, 200, {
        removed: mappingId,
        providerId: mapping.provider_id,
        businessType: mapping.business_type,
        businessId: mapping.business_id,
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/audit') {
      requireRole(actor, 'substrate-admin');
      const events = db.prepare('SELECT * FROM audit_event ORDER BY occurred_at DESC LIMIT 300').all().map((row) => ({ ...row, payload: JSON.parse(row.payload_json) }));
      return json(res, 200, { events });
    }

    return json(res, 404, { error: 'not_found' });
  } catch (error) {
    const status = error.message === 'forbidden' ? 403 : (error.httpStatus ?? 400);
    return json(res, status, { error: error.message });
  }
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => json(res, 500, { error: 'internal_error' }));
});

server.listen(PORT, HOST, () => {
  console.log(JSON.stringify({ event: 'substrate.api.started', port: PORT, dbPath: DB_PATH, issuer: OIDC_ISSUER, canonicalCrmContract: CANONICAL_CRM_CONTRACT }));
});
