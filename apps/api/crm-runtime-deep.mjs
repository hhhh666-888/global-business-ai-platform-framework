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
const SUBSTRATE_ENV = process.env.SUBSTRATE_ENV ?? 'local';
const FALLBACK_CAPABILITY = 'crm.v1.account.list';

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS crm_runtime_view_binding (
  provider_id TEXT NOT NULL,
  provider_view_id TEXT NOT NULL,
  owner_subject TEXT NOT NULL,
  exposure_scope TEXT NOT NULL CHECK(exposure_scope IN ('PERSONAL','WORKSPACE')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(provider_id, provider_view_id)
) STRICT;
`);

function nowIso() { return new Date().toISOString(); }
function tableExists(name) { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'access-control-allow-origin': CORS_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type, x-gbap-organization, x-gbap-workspace',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  });
  res.end(JSON.stringify(body));
}
function httpError(message, status = 400, detail = null) { const error = new Error(message); error.httpStatus = status; error.detail = detail; return error; }
async function readJson(req, maxBytes = 1024 * 1024) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > maxBytes) throw httpError('request_body_too_large', 413); chunks.push(chunk); }
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw httpError('invalid_json', 400); }
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
  const headerJson = JSON.parse(decodeSegment(encodedHeader).toString('utf8'));
  const claims = JSON.parse(decodeSegment(encodedPayload).toString('utf8'));
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
  if (![...actor.roles].some((role) => ['substrate-user', 'substrate-manager', 'substrate-admin'].includes(role))) throw httpError('forbidden', 403);
}
function isManager(actor) { return actor.roles.has('substrate-manager') || actor.roles.has('substrate-admin'); }
function parseScope(req) { return { environment: SUBSTRATE_ENV, organization: req.headers['x-gbap-organization']?.toString() ?? null, workspace: req.headers['x-gbap-workspace']?.toString() ?? null }; }
function recordAudit(actor, action, target, payload = {}) {
  if (!tableExists('audit_event')) return;
  db.prepare('INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)').run(randomUUID(), actor.subject, actor.username, action, target, nowIso(), JSON.stringify(payload));
}
function resolveProvider(capability, scope) {
  const query = `SELECT p.*,b.capability,b.priority FROM capability_binding b JOIN provider_registration p ON p.id=b.provider_id
    WHERE b.capability=? AND b.enabled=1 AND p.enabled=1 AND p.environment_scope=?
      AND (p.organization_scope IS NULL OR p.organization_scope=?) AND (p.workspace_scope IS NULL OR p.workspace_scope=?)
    ORDER BY CASE WHEN p.workspace_scope IS NULL THEN 0 ELSE 1 END DESC, CASE WHEN p.organization_scope IS NULL THEN 0 ELSE 1 END DESC, b.priority DESC,p.id ASC LIMIT 1`;
  return db.prepare(query).get(capability, scope.environment, scope.organization, scope.workspace)
    ?? db.prepare(query).get(FALLBACK_CAPABILITY, scope.environment, scope.organization, scope.workspace);
}
async function invokeProvider(provider, capability, actor, scope, payload = {}, advanced = false) {
  const endpoint = new URL(provider.endpoint); const allowlist = JSON.parse(provider.egress_allowlist_json);
  if (!allowlist.includes(endpoint.hostname)) throw httpError('egress_denied', 503);
  const response = await fetch(new URL(advanced ? '/stage35/invoke' : '/invoke', endpoint), {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-gbap-request-id': randomUUID() },
    body: JSON.stringify({ capability, payload, context: { actorSubject: actor.subject, actorUsername: actor.username, environment: scope.environment, organization: scope.organization, workspace: scope.workspace } }),
    signal: AbortSignal.timeout(Math.max(provider.timeout_ms ?? 3000, 25_000)),
  });
  const body = await response.json().catch(() => ({ error: 'invalid_provider_json' }));
  if (!response.ok) {
    const status = response.status === 403 ? 403 : response.status >= 400 && response.status < 500 ? 400 : 503;
    throw httpError(body.error ?? 'provider_unavailable', status, { providerId: provider.id, upstreamStatus: response.status });
  }
  return body;
}
function publicKey(prefix, value) { return `${prefix}:${createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`; }
function viewPublicKey(id) { return publicKey('view', `provider-view:${id}`); }
function filterGroupPublicKey(id) { return publicKey('filter-group', id); }
function validateKey(value, label) { if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(value)) throw httpError(`invalid_${label}`, 400); return value; }
function activeObjects(schema) { return (schema.objects ?? []).filter((object) => object && object.isActive !== false && typeof object.nameSingular === 'string'); }
function runtimeObject(schema, key) { return activeObjects(schema).find((object) => object.nameSingular === key || object.namePlural === key) ?? null; }
async function rawSchema(provider, actor, scope) { const body = await invokeProvider(provider, 'crm.meta.v1.schema', actor, scope); return { objects: body.objects ?? body.schema?.objects ?? [] }; }
async function rawViews(provider, actor, scope) { const body = await invokeProvider(provider, 'crm.meta.v1.views', actor, scope); return body.views ?? []; }
function metadataMaps(schema) {
  const objects = activeObjects(schema), objectById = new Map(objects.map((object) => [object.id, object])), fieldById = new Map();
  for (const object of objects) for (const field of object.fieldsList ?? []) fieldById.set(field.id, { object, field });
  return { objects, objectById, fieldById };
}
function fieldKeyFor(fieldById, id) { return id ? fieldById.get(id)?.field?.name ?? null : null; }
function objectKeyFor(objectById, id) { return id ? objectById.get(id)?.nameSingular ?? null : null; }
function viewBinding(providerId, viewId) { return db.prepare('SELECT * FROM crm_runtime_view_binding WHERE provider_id=? AND provider_view_id=?').get(providerId, viewId) ?? null; }
function canSeeView(actor, providerId, view) { const binding = viewBinding(providerId, view.id); return !binding || binding.exposure_scope === 'WORKSPACE' || binding.owner_subject === actor.subject || isManager(actor); }
function canEditView(actor, providerId, view) { const binding = viewBinding(providerId, view.id); return binding ? binding.owner_subject === actor.subject || isManager(actor) : isManager(actor); }
function normalizeViews(actor, provider, views, schema) {
  const { objectById, fieldById } = metadataMaps(schema);
  return views.filter((view) => view?.isActive !== false && canSeeView(actor, provider.id, view)).map((view) => {
    const binding = viewBinding(provider.id, view.id);
    const groupKeyById = new Map((view.viewFilterGroups ?? []).filter((item) => !item?.deletedAt).map((item) => [item.id, filterGroupPublicKey(item.id)]));
    return {
      viewKey: viewPublicKey(view.id), name: view.name ?? 'View', objectKey: objectKeyFor(objectById, view.objectMetadataId), type: view.type ?? 'TABLE', icon: view.icon ?? null,
      position: view.position ?? 0, compact: Boolean(view.isCompact), visibility: view.visibility ?? null, scope: binding?.exposure_scope ?? 'WORKSPACE', owned: binding?.owner_subject === actor.subject,
      editable: canEditView(actor, provider.id, view), anyFieldFilterValue: view.anyFieldFilterValue ?? null,
      mainGroupByFieldKey: fieldKeyFor(fieldById, view.mainGroupByFieldMetadataId), kanbanAggregateOperation: view.kanbanAggregateOperation ?? null,
      kanbanAggregateFieldKey: fieldKeyFor(fieldById, view.kanbanAggregateOperationFieldMetadataId), calendarFieldKey: fieldKeyFor(fieldById, view.calendarFieldMetadataId),
      calendarEndFieldKey: fieldKeyFor(fieldById, view.calendarEndFieldMetadataId), calendarLayout: view.calendarLayout ?? null, hideEmptyGroups: Boolean(view.shouldHideEmptyGroups),
      fields: (view.viewFields ?? []).filter((item) => item?.isActive !== false && !item?.deletedAt).map((item) => ({ fieldKey: fieldKeyFor(fieldById, item.fieldMetadataId), visible: item.isVisible !== false, position: item.position ?? 0, size: item.size ?? null, aggregateOperation: item.aggregateOperation ?? null })).filter((item) => item.fieldKey),
      filters: (view.viewFilters ?? []).filter((item) => !item?.deletedAt).map((item) => ({ fieldKey: fieldKeyFor(fieldById, item.fieldMetadataId), operand: item.operand, value: item.value, groupKey: item.viewFilterGroupId ? groupKeyById.get(item.viewFilterGroupId) ?? null : null, position: item.positionInViewFilterGroup ?? null, subFieldName: item.subFieldName ?? null })).filter((item) => item.fieldKey),
      filterGroups: (view.viewFilterGroups ?? []).filter((item) => !item?.deletedAt).map((item) => ({ key: groupKeyById.get(item.id), parentKey: item.parentViewFilterGroupId ? groupKeyById.get(item.parentViewFilterGroupId) ?? null : null, operator: item.logicalOperator === 'OR' ? 'OR' : 'AND', position: item.positionInViewFilterGroup ?? null })),
      sorts: (view.viewSorts ?? []).filter((item) => !item?.deletedAt).map((item) => ({ fieldKey: fieldKeyFor(fieldById, item.fieldMetadataId), direction: item.direction, subFieldName: item.subFieldName ?? null })).filter((item) => item.fieldKey),
      groups: (view.viewGroups ?? []).filter((item) => !item?.deletedAt).map((item) => ({ fieldValue: item.fieldValue, visible: item.isVisible !== false, position: item.position ?? 0 })),
    };
  });
}
function findRawView(views, viewKey) { return views.find((view) => viewPublicKey(view.id) === viewKey) ?? null; }
function fieldByKey(object, key) { return (object.fieldsList ?? []).find((field) => field.name === key && field.isActive !== false) ?? null; }
function translateViewSpec(schema, input) {
  const object = runtimeObject(schema, validateKey(input.objectKey, 'runtime_object_key')); if (!object) throw httpError('runtime_object_not_found', 404);
  const fieldId = (key, label) => { if (!key) return null; const field = fieldByKey(object, validateKey(key, label)); if (!field?.id) throw httpError(`runtime_view_field_unknown:${key}`, 400); return field.id; };
  const filterGroups = (Array.isArray(input.filterGroups) ? input.filterGroups : []).map((item, index) => ({
    key: String(item.key ?? `group-${index}`), parentKey: item.parentKey ? String(item.parentKey) : null, operator: item.operator === 'OR' ? 'OR' : 'AND', position: Number.isFinite(Number(item.position)) ? Number(item.position) : index,
  }));
  const knownGroups = new Set(filterGroups.map((item) => item.key));
  for (const group of filterGroups) if (group.parentKey && !knownGroups.has(group.parentKey)) throw httpError('runtime_view_filter_group_parent_missing', 400);
  return {
    objectMetadataId: object.id, name: String(input.name ?? '').trim(), type: input.type ?? 'TABLE', icon: input.icon ?? 'IconList', position: Number(input.position ?? 0), compact: Boolean(input.compact),
    visibility: input.scope === 'PERSONAL' ? 'UNLISTED' : 'WORKSPACE', hideEmptyGroups: Boolean(input.hideEmptyGroups), anyFieldFilterValue: input.anyFieldFilterValue ?? null,
    mainGroupByFieldMetadataId: fieldId(input.mainGroupByFieldKey, 'view_group_field'), calendarFieldMetadataId: fieldId(input.calendarFieldKey, 'view_calendar_field'),
    calendarEndFieldMetadataId: fieldId(input.calendarEndFieldKey, 'view_calendar_end_field'), calendarLayout: input.calendarLayout ?? null,
    kanbanAggregateOperation: input.kanbanAggregateOperation ?? null, kanbanAggregateOperationFieldMetadataId: fieldId(input.kanbanAggregateFieldKey, 'view_aggregate_field'),
    fields: (Array.isArray(input.fields) ? input.fields : []).map((item, index) => ({ fieldMetadataId: fieldId(item.fieldKey, 'view_field'), visible: item.visible !== false, position: Number(item.position ?? index), size: Number(item.size ?? 180), aggregateOperation: item.aggregateOperation ?? null })),
    filterGroups,
    filters: (Array.isArray(input.filters) ? input.filters : []).map((item, index) => {
      const groupKey = item.groupKey ? String(item.groupKey) : null; if (groupKey && !knownGroups.has(groupKey)) throw httpError('runtime_view_filter_group_unknown', 400);
      return { fieldMetadataId: fieldId(item.fieldKey, 'view_filter_field'), operand: item.operand ?? 'IS', value: item.value ?? '', groupKey, position: Number(item.position ?? index), subFieldName: item.subFieldName ?? null };
    }),
    sorts: (Array.isArray(input.sorts) ? input.sorts : []).map((item) => ({ fieldMetadataId: fieldId(item.fieldKey, 'view_sort_field'), direction: item.direction === 'DESC' ? 'DESC' : 'ASC', subFieldName: item.subFieldName ?? null })),
    groups: (Array.isArray(input.groups) ? input.groups : []).map((item, index) => ({ fieldValue: String(item.fieldValue ?? ''), visible: item.visible !== false, position: Number(item.position ?? index) })),
  };
}
function upsertViewBinding(providerId, viewId, actor, exposure) {
  const existing = viewBinding(providerId, viewId);
  if (existing) db.prepare('UPDATE crm_runtime_view_binding SET exposure_scope=?,updated_at=? WHERE provider_id=? AND provider_view_id=?').run(exposure, nowIso(), providerId, viewId);
  else db.prepare('INSERT INTO crm_runtime_view_binding(provider_id,provider_view_id,owner_subject,exposure_scope,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(providerId, viewId, actor.subject, exposure, nowIso(), nowIso());
}
async function handleViews(req, res, url, actor, provider, scope) {
  if (url.pathname !== '/api/crm-runtime/views' && !url.pathname.startsWith('/api/crm-runtime/views/')) return false;
  const schema = await rawSchema(provider, actor, scope); const views = await rawViews(provider, actor, scope);
  if (req.method === 'GET' && url.pathname === '/api/crm-runtime/views') { json(res, 200, { views: normalizeViews(actor, provider, views, schema), deepViewConfig: true }); return true; }
  if (req.method === 'POST' && url.pathname === '/api/crm-runtime/views') {
    const input = await readJson(req); const exposure = input.scope === 'WORKSPACE' ? 'WORKSPACE' : 'PERSONAL'; if (exposure === 'WORKSPACE' && !isManager(actor)) throw httpError('workspace_view_requires_manager', 403);
    const translated = translateViewSpec(schema, { ...input, scope: exposure }); if (!translated.name) throw httpError('view_name_required', 400);
    const created = await invokeProvider(provider, 'crm.meta.v1.view.create', actor, scope, translated, true); const viewId = created.viewId; if (!viewId) throw httpError('provider_view_create_missing_id', 502);
    upsertViewBinding(provider.id, viewId, actor, exposure); recordAudit(actor, 'crm.runtime.view.create', `view:${viewPublicKey(viewId)}`, { objectKey: input.objectKey, name: input.name, scope: exposure });
    json(res, 201, { viewKey: viewPublicKey(viewId), scope: exposure }); return true;
  }
  const match = url.pathname.match(/^\/api\/crm-runtime\/views\/([^/]+)$/); if (!match) return false;
  const viewKey = decodeURIComponent(match[1]); const raw = findRawView(views, viewKey); if (!raw) throw httpError('runtime_view_not_found', 404); if (!canEditView(actor, provider.id, raw)) throw httpError('forbidden', 403);
  if (req.method === 'PATCH') {
    const input = await readJson(req); const binding = viewBinding(provider.id, raw.id); const exposure = input.scope ?? binding?.exposure_scope ?? 'WORKSPACE';
    if (exposure === 'WORKSPACE' && !isManager(actor) && binding?.exposure_scope !== 'WORKSPACE') throw httpError('workspace_view_requires_manager', 403);
    const translated = translateViewSpec(schema, { ...input, objectKey: input.objectKey ?? objectKeyFor(metadataMaps(schema).objectById, raw.objectMetadataId), scope: exposure, name: input.name ?? raw.name, type: input.type ?? raw.type, icon: input.icon ?? raw.icon, position: input.position ?? raw.position, compact: input.compact ?? raw.isCompact });
    translated.viewId = raw.id;
    translated.existing = {
      fieldIds: (raw.viewFields ?? []).filter((item) => !item?.deletedAt).map((item) => item.id).filter(Boolean),
      filterIds: (raw.viewFilters ?? []).filter((item) => !item?.deletedAt).map((item) => item.id).filter(Boolean),
      filterGroupIds: (raw.viewFilterGroups ?? []).filter((item) => !item?.deletedAt).map((item) => item.id).filter(Boolean),
      sortIds: (raw.viewSorts ?? []).filter((item) => !item?.deletedAt).map((item) => item.id).filter(Boolean),
      groupIds: (raw.viewGroups ?? []).filter((item) => !item?.deletedAt).map((item) => item.id).filter(Boolean),
    };
    await invokeProvider(provider, 'crm.meta.v1.view.update', actor, scope, translated, true); upsertViewBinding(provider.id, raw.id, actor, exposure);
    recordAudit(actor, 'crm.runtime.view.update', `view:${viewKey}`, { name: translated.name, scope: exposure, filterGroups: translated.filterGroups.length, groups: translated.groups.length });
    json(res, 200, { viewKey, scope: exposure }); return true;
  }
  if (req.method === 'DELETE') {
    await invokeProvider(provider, 'crm.meta.v1.view.delete', actor, scope, { viewId: raw.id }, true);
    db.prepare('DELETE FROM crm_runtime_view_binding WHERE provider_id=? AND provider_view_id=?').run(provider.id, raw.id);
    recordAudit(actor, 'crm.runtime.view.delete', `view:${viewKey}`, { name: raw.name }); json(res, 200, { removed: viewKey }); return true;
  }
  return false;
}
function mapping(providerId, businessId) { return db.prepare('SELECT * FROM external_mapping WHERE provider_id=? AND business_id=? ORDER BY created_at DESC LIMIT 1').get(providerId, businessId) ?? null; }
function isAuditField(key) { return ['id', 'createdAt', 'updatedAt', 'deletedAt', 'createdBy', 'updatedBy'].includes(key); }
function previewConflicts(records, survivorIndex) {
  const keys = new Set(records.flatMap((record) => Object.keys(record ?? {}).filter((key) => !isAuditField(key)))); const conflicts = [];
  for (const key of keys) {
    const values = records.map((record) => record?.[key] ?? null); const signatures = new Set(values.map((value) => JSON.stringify(value)));
    if (signatures.size > 1) conflicts.push({ fieldKey: key, chosenValue: values[survivorIndex] ?? null, candidates: values });
  }
  return conflicts;
}
async function handleMerge(req, res, url, actor, provider, scope) {
  const match = url.pathname.match(/^\/api\/crm-runtime\/objects\/([^/]+)\/merge$/); if (!match || req.method !== 'POST') return false;
  if (!isManager(actor)) throw httpError('merge_requires_manager', 403);
  const objectKey = validateKey(decodeURIComponent(match[1]), 'runtime_object_key'); const schema = await rawSchema(provider, actor, scope); const object = runtimeObject(schema, objectKey); if (!object) throw httpError('runtime_object_not_found', 404);
  const input = await readJson(req); const businessIds = [...new Set(Array.isArray(input.businessIds) ? input.businessIds.map(String) : [])]; if (businessIds.length < 2 || businessIds.length > 20) throw httpError('merge_requires_2_to_20_records', 400);
  const survivorBusinessId = String(input.survivorBusinessId ?? businessIds[0]); const survivorIndex = businessIds.indexOf(survivorBusinessId); if (survivorIndex < 0) throw httpError('merge_survivor_not_selected', 400);
  const mappings = businessIds.map((id) => mapping(provider.id, id)); if (mappings.some((item) => !item)) throw httpError('merge_mapping_missing', 409);
  const sourceBodies = await Promise.all(mappings.map((item) => invokeProvider(provider, 'crm.meta.v1.record.get', actor, scope, { objectPlural: object.namePlural, externalId: item.external_id }).catch(() => ({ record: null }))));
  const providerResult = await invokeProvider(provider, 'crm.meta.v1.record.merge', actor, scope, { objectPlural: object.namePlural, externalIds: mappings.map((item) => item.external_id), conflictPriorityIndex: survivorIndex, dryRun: Boolean(input.dryRun) }, true);
  const sourceRecords = sourceBodies.map((body) => body.record ?? null);
  if (input.dryRun) {
    json(res, 200, { dryRun: true, mergeAllowed: true, survivorBusinessId, sourceBusinessIds: businessIds, conflicts: previewConflicts(sourceRecords, survivorIndex), providerPreview: providerResult.providerPreview ?? null }); return true;
  }
  const mergedExternalId = providerResult.mergedExternalId; const survivor = mappings[survivorIndex]; const duplicateIds = businessIds.filter((id) => id !== survivorBusinessId);
  db.exec('BEGIN IMMEDIATE');
  try {
    if (mergedExternalId && survivor.external_id !== mergedExternalId) db.prepare('UPDATE external_mapping SET external_id=? WHERE id=?').run(mergedExternalId, survivor.id);
    for (const duplicateId of duplicateIds) {
      if (tableExists('crm_file')) db.prepare('UPDATE crm_file SET target_business_id=? WHERE target_business_id=?').run(survivorBusinessId, duplicateId);
      if (tableExists('crm_business_state')) db.prepare('DELETE FROM crm_business_state WHERE business_id=?').run(duplicateId);
      db.prepare('DELETE FROM external_mapping WHERE provider_id=? AND business_id=?').run(provider.id, duplicateId);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  recordAudit(actor, 'crm.runtime.record.merge', `${objectKey}:${survivorBusinessId}`, { mergedBusinessIds: duplicateIds, count: businessIds.length });
  json(res, 200, { merged: true, survivorBusinessId, mergedBusinessIds: duplicateIds }); return true;
}

export function createCrmRuntimeDeepHandler() {
  return async function crmRuntimeDeepHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const isViewRoute = url.pathname === '/api/crm-runtime/views' || url.pathname.startsWith('/api/crm-runtime/views/');
    const isMergeRoute = /^\/api\/crm-runtime\/objects\/[^/]+\/merge$/.test(url.pathname);
    if (!isViewRoute && !isMergeRoute) return false;
    if (req.method === 'OPTIONS') return false;
    let actor; try { actor = await authenticate(req); requireUser(actor); } catch (error) { json(res, error.httpStatus ?? 401, { error: 'unauthorized', detail: error.message }); return true; }
    const scope = parseScope(req); const provider = resolveProvider(isViewRoute ? 'crm.meta.v1.views' : 'crm.meta.v1.record.merge', scope); if (!provider) { json(res, 503, { error: 'crm_runtime_unavailable' }); return true; }
    try {
      if (await handleViews(req, res, url, actor, provider, scope)) return true;
      if (await handleMerge(req, res, url, actor, provider, scope)) return true;
      return false;
    } catch (error) {
      recordAudit(actor, 'crm.runtime.deep.rejected', `provider:${provider.id}`, { route: url.pathname, error: error.message });
      json(res, error.httpStatus ?? 500, (error.httpStatus ?? 500) >= 500 ? { error: 'crm_service_unavailable' } : { error: error.message, detail: error.detail ?? null }); return true;
    }
  };
}
