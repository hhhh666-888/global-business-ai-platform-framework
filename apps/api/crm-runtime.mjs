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
const FALLBACK_CAPABILITY = 'crm.v1.account.list';
const META_CAPABILITIES = {
  schema: 'crm.meta.v1.schema',
  views: 'crm.meta.v1.views',
  layouts: 'crm.meta.v1.layouts',
};
const RECORD_CAPABILITIES = {
  list: 'crm.meta.v1.record.list',
  get: 'crm.meta.v1.record.get',
  create: 'crm.meta.v1.record.create',
  update: 'crm.meta.v1.record.update',
  delete: 'crm.meta.v1.record.delete',
  restore: 'crm.meta.v1.record.restore',
  destroy: 'crm.meta.v1.record.destroy',
};
const SYSTEM_AUDIT_FIELDS = new Set(['createdAt', 'updatedAt', 'deletedAt', 'createdBy', 'updatedBy']);
const NEVER_EXPOSE_FIELDS = new Set(['id', 'searchVector']);
const STANDARD_OBJECTS = new Map([
  ['company', { businessType: 'Account', externalType: 'company' }],
  ['person', { businessType: 'Contact', externalType: 'person' }],
  ['opportunity', { businessType: 'Opportunity', externalType: 'opportunity' }],
  ['task', { businessType: 'CrmTask', externalType: 'task' }],
  ['note', { businessType: 'CrmNote', externalType: 'note' }],
]);

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 5000;');

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': CORS_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type, x-gbap-organization, x-gbap-workspace',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  });
  res.end(JSON.stringify(body));
  return true;
}
function httpError(message, status = 400, detail = null) {
  const error = new Error(message);
  error.httpStatus = status;
  error.detail = detail;
  return error;
}
async function readJson(req, maxBytes = 1024 * 1024) {
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
function parseScope(req) {
  return {
    environment: SUBSTRATE_ENV,
    organization: req.headers['x-gbap-organization']?.toString() ?? null,
    workspace: req.headers['x-gbap-workspace']?.toString() ?? null,
  };
}
function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
function recordAudit(actor, action, target, payload = {}) {
  if (!tableExists('audit_event')) return;
  db.prepare('INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)').run(
    randomUUID(), actor.subject, actor.username, action, target, new Date().toISOString(), JSON.stringify(payload),
  );
}
function validateKey(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(value)) throw httpError(`invalid_${label}`, 400);
  return value;
}
function resolveProvider(capability, scope) {
  const query = `
    SELECT p.*, b.capability, b.priority
    FROM capability_binding b
    JOIN provider_registration p ON p.id=b.provider_id
    WHERE b.capability=? AND b.enabled=1 AND p.enabled=1 AND p.environment_scope=?
      AND (p.organization_scope IS NULL OR p.organization_scope=?)
      AND (p.workspace_scope IS NULL OR p.workspace_scope=?)
    ORDER BY CASE WHEN p.workspace_scope IS NULL THEN 0 ELSE 1 END DESC,
      CASE WHEN p.organization_scope IS NULL THEN 0 ELSE 1 END DESC,
      b.priority DESC, p.id ASC LIMIT 1`;
  return db.prepare(query).get(capability, scope.environment, scope.organization, scope.workspace)
    ?? db.prepare(query).get(FALLBACK_CAPABILITY, scope.environment, scope.organization, scope.workspace);
}
async function invokeProvider(provider, capability, actor, scope, payload = {}) {
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
  if (!response.ok) throw httpError('provider_unavailable', response.status === 403 ? 403 : 503, { providerId: provider.id, upstreamStatus: response.status, upstreamError: body.error ?? null });
  return body;
}
function objectIdentity(object) {
  const standard = STANDARD_OBJECTS.get(object.nameSingular);
  return standard ?? {
    businessType: `CrmDynamic:${object.nameSingular}`,
    externalType: `runtime:${object.nameSingular}`,
  };
}
function findBusinessMapping(providerId, businessType, businessId) {
  return db.prepare('SELECT * FROM external_mapping WHERE provider_id=? AND business_type=? AND business_id=? ORDER BY created_at DESC LIMIT 1').get(providerId, businessType, businessId);
}
function findExternalMapping(providerId, externalType, externalId) {
  return db.prepare('SELECT * FROM external_mapping WHERE provider_id=? AND external_type=? AND external_id=? ORDER BY created_at DESC LIMIT 1').get(providerId, externalType, externalId);
}
function ensureMapping(actor, provider, object, externalId, preferredBusinessId = null) {
  const identity = objectIdentity(object);
  const existing = findExternalMapping(provider.id, identity.externalType, externalId);
  if (existing) return existing;
  const businessId = preferredBusinessId ?? randomUUID();
  const collision = findBusinessMapping(provider.id, identity.businessType, businessId);
  if (collision) throw httpError('runtime_business_id_mapping_conflict', 409);
  const id = randomUUID();
  db.prepare('INSERT INTO external_mapping(id,business_type,business_id,provider_id,external_type,external_id,created_at) VALUES(?,?,?,?,?,?,?)').run(
    id, identity.businessType, businessId, provider.id, identity.externalType, externalId, new Date().toISOString(),
  );
  recordAudit(actor, 'crm.runtime.mapping.adopt', `mapping:${id}`, {
    objectKey: object.nameSingular,
    businessType: identity.businessType,
    businessId,
    providerId: provider.id,
    externalType: identity.externalType,
  });
  return { id, business_type: identity.businessType, business_id: businessId, provider_id: provider.id, external_type: identity.externalType, external_id: externalId };
}

const schemaCache = new Map();
async function providerSchema(provider, actor, scope, force = false) {
  const key = `${provider.id}:${scope.organization ?? ''}:${scope.workspace ?? ''}`;
  const cached = schemaCache.get(key);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
  const body = await invokeProvider(provider, META_CAPABILITIES.schema, actor, scope, {});
  const objects = Array.isArray(body.objects) ? body.objects : Array.isArray(body.schema?.objects) ? body.schema.objects : [];
  const value = { objects };
  schemaCache.set(key, { value, expiresAt: Date.now() + 30_000 });
  return value;
}
function activeObjects(schema) {
  return schema.objects.filter((object) => object && object.isActive !== false && typeof object.nameSingular === 'string' && typeof object.namePlural === 'string');
}
function runtimeObject(schema, key) {
  return activeObjects(schema).find((object) => object.nameSingular === key || object.namePlural === key) ?? null;
}
function fieldRelation(field, objectById) {
  const relation = field.relation ?? null;
  if (!relation) return null;
  const target = relation.targetObjectMetadata ?? objectById.get(relation.targetObjectMetadataId) ?? null;
  if (!target?.nameSingular) return null;
  return {
    type: relation.type ?? null,
    targetObjectKey: target.nameSingular,
    sourceFieldKey: relation.sourceFieldMetadata?.name ?? field.name,
    targetFieldKey: relation.targetFieldMetadata?.name ?? null,
  };
}
function normalizeSchema(rawSchema) {
  const objects = activeObjects(rawSchema);
  const objectById = new Map(objects.map((object) => [object.id, object]));
  return objects.map((object) => ({
    objectKey: object.nameSingular,
    objectPluralKey: object.namePlural,
    labelSingular: object.labelSingular || object.nameSingular,
    labelPlural: object.labelPlural || object.namePlural,
    description: object.description ?? null,
    icon: object.icon ?? null,
    color: object.color ?? null,
    active: object.isActive !== false,
    system: Boolean(object.isSystem),
    custom: object.isCustom === true,
    uiEditable: object.isUIEditable !== false,
    uiCreatable: object.isUICreatable !== false,
    searchable: object.isSearchable !== false,
    openRecordIn: object.openRecordIn ?? 'USER_CHOICE',
    fields: (Array.isArray(object.fieldsList) ? object.fieldsList : []).filter((field) => field?.isActive !== false && !NEVER_EXPOSE_FIELDS.has(field?.name)).map((field) => ({
      fieldKey: field.name,
      label: field.label || field.name,
      type: field.type,
      description: field.description ?? null,
      icon: field.icon ?? null,
      active: field.isActive !== false,
      system: Boolean(field.isSystem),
      uiEditable: field.isUIEditable !== false && !field.isSystem && !SYSTEM_AUDIT_FIELDS.has(field.name),
      nullable: field.isNullable !== false,
      unique: Boolean(field.isUnique),
      defaultValue: field.defaultValue ?? null,
      options: field.options ?? null,
      settings: field.settings ?? null,
      relation: fieldRelation(field, objectById),
    })),
  }));
}
function metadataMaps(rawSchema) {
  const objects = activeObjects(rawSchema);
  const objectById = new Map(objects.map((object) => [object.id, object]));
  const fieldById = new Map();
  for (const object of objects) for (const field of object.fieldsList ?? []) fieldById.set(field.id, { object, field });
  return { objects, objectById, fieldById };
}
function fieldKeyFor(fieldById, id) { return id ? fieldById.get(id)?.field?.name ?? null : null; }
function objectKeyFor(objectById, id) { return id ? objectById.get(id)?.nameSingular ?? null : null; }
function normalizeViews(rawViews, rawSchema) {
  const { objectById, fieldById } = metadataMaps(rawSchema);
  return (Array.isArray(rawViews) ? rawViews : []).filter((view) => view?.isActive !== false).map((view) => ({
    viewKey: view.id ? `provider-view:${view.id}` : `view:${view.name}`,
    name: view.name ?? 'View',
    objectKey: objectKeyFor(objectById, view.objectMetadataId),
    type: view.type ?? 'TABLE',
    icon: view.icon ?? null,
    position: view.position ?? 0,
    compact: Boolean(view.isCompact),
    visibility: view.visibility ?? null,
    anyFieldFilterValue: view.anyFieldFilterValue ?? null,
    mainGroupByFieldKey: fieldKeyFor(fieldById, view.mainGroupByFieldMetadataId),
    kanbanAggregateOperation: view.kanbanAggregateOperation ?? null,
    kanbanAggregateFieldKey: fieldKeyFor(fieldById, view.kanbanAggregateOperationFieldMetadataId),
    calendarFieldKey: fieldKeyFor(fieldById, view.calendarFieldMetadataId),
    calendarEndFieldKey: fieldKeyFor(fieldById, view.calendarEndFieldMetadataId),
    calendarLayout: view.calendarLayout ?? null,
    hideEmptyGroups: Boolean(view.shouldHideEmptyGroups),
    fields: (view.viewFields ?? []).filter((item) => item?.isActive !== false && !item?.deletedAt).map((item) => ({
      fieldKey: fieldKeyFor(fieldById, item.fieldMetadataId), visible: item.isVisible !== false, position: item.position ?? 0, size: item.size ?? null, aggregateOperation: item.aggregateOperation ?? null,
    })).filter((item) => item.fieldKey),
    filters: (view.viewFilters ?? []).filter((item) => !item?.deletedAt).map((item) => ({
      fieldKey: fieldKeyFor(fieldById, item.fieldMetadataId), operand: item.operand, value: item.value, groupKey: item.viewFilterGroupId ?? null, position: item.positionInViewFilterGroup ?? null, subFieldName: item.subFieldName ?? null,
    })).filter((item) => item.fieldKey),
    filterGroups: (view.viewFilterGroups ?? []).filter((item) => !item?.deletedAt).map((item) => ({ key: item.id, parentKey: item.parentViewFilterGroupId ?? null, operator: item.logicalOperator, position: item.positionInViewFilterGroup ?? null })),
    sorts: (view.viewSorts ?? []).filter((item) => !item?.deletedAt).map((item) => ({ fieldKey: fieldKeyFor(fieldById, item.fieldMetadataId), direction: item.direction, subFieldName: item.subFieldName ?? null })).filter((item) => item.fieldKey),
    groups: (view.viewGroups ?? []).filter((item) => !item?.deletedAt).map((item) => ({ fieldValue: item.fieldValue, visible: item.isVisible !== false, position: item.position ?? 0 })),
  }));
}
function normalizeLayouts(rawLayouts, rawSchema) {
  const { objectById, fieldById } = metadataMaps(rawSchema);
  const fieldFromConfig = (config, key) => fieldKeyFor(fieldById, config?.[key]);
  return (Array.isArray(rawLayouts) ? rawLayouts : []).map((layout) => ({
    layoutKey: layout.id ? `provider-layout:${layout.id}` : `layout:${layout.name}`,
    name: layout.name ?? 'Record Page',
    objectKey: objectKeyFor(objectById, layout.objectMetadataId),
    type: layout.type ?? 'RECORD_PAGE',
    firstTabPinned: Boolean(layout.isFirstTabPinned),
    tabs: (layout.tabs ?? []).filter((tab) => tab?.isActive !== false).sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0)).map((tab) => ({
      tabKey: tab.id ? `provider-tab:${tab.id}` : `tab:${tab.title}`,
      title: tab.title ?? 'Tab', icon: tab.icon ?? null, position: tab.position ?? 0, layoutMode: tab.layoutMode ?? 'GRID',
      widgets: (tab.widgets ?? []).filter((widget) => widget?.isActive !== false && !widget?.deletedAt).map((widget) => ({
        widgetKey: widget.id ? `provider-widget:${widget.id}` : `widget:${widget.title}`,
        title: widget.title ?? '',
        type: widget.type,
        objectKey: objectKeyFor(objectById, widget.objectMetadataId),
        position: widget.position ?? widget.gridPosition ?? null,
        conditionalDisplay: widget.conditionalDisplay ?? null,
        configuration: widget.configuration ? {
          type: widget.configuration.configurationType ?? widget.configuration.__typename ?? null,
          fieldKey: fieldFromConfig(widget.configuration, 'fieldMetadataId'),
          aggregateFieldKey: fieldFromConfig(widget.configuration, 'aggregateFieldMetadataId'),
          groupByFieldKey: fieldFromConfig(widget.configuration, 'groupByFieldMetadataId'),
          primaryAxisFieldKey: fieldFromConfig(widget.configuration, 'primaryAxisGroupByFieldMetadataId'),
          secondaryAxisFieldKey: fieldFromConfig(widget.configuration, 'secondaryAxisGroupByFieldMetadataId'),
          viewKey: widget.configuration.viewId ? `provider-view:${widget.configuration.viewId}` : null,
          body: widget.configuration.body ?? null,
          url: widget.configuration.url ?? null,
          raw: Object.fromEntries(Object.entries(widget.configuration).filter(([key]) => !key.toLowerCase().includes('metadataid') && key !== 'viewId')),
        } : null,
      })),
    })),
  })).filter((layout) => layout.objectKey);
}
function fieldDefinition(object, key) { return (object.fieldsList ?? []).find((field) => field.name === key && field.isActive !== false) ?? null; }
function relationTargetObject(rawSchema, field) {
  const targetId = field?.relation?.targetObjectMetadata?.id ?? field?.relationTargetObjectMetadataId;
  return activeObjects(rawSchema).find((object) => object.id === targetId) ?? null;
}
function mappingForRecord(actor, provider, object, record) {
  if (!record || typeof record.id !== 'string' || !record.id) throw httpError('runtime_provider_record_missing_id', 502);
  return ensureMapping(actor, provider, object, record.id);
}
function safeComposite(value) {
  if (value === undefined) return undefined;
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.map(safeComposite);
  if (typeof value === 'object') {
    const output = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === 'id' || key.endsWith('Id') || key === 'workspaceId' || key === 'userWorkspaceId' || key === 'workspaceMemberId') continue;
      output[key] = safeComposite(child);
    }
    return output;
  }
  return String(value);
}
function runtimeRecord(actor, provider, rawSchema, object, record) {
  const mapping = mappingForRecord(actor, provider, object, record);
  const values = {};
  for (const field of object.fieldsList ?? []) {
    if (field.isActive === false || NEVER_EXPOSE_FIELDS.has(field.name)) continue;
    if (field.type === 'RELATION' || field.relation) {
      const targetObject = relationTargetObject(rawSchema, field);
      if (!targetObject) continue;
      const externalId = record[`${field.name}Id`] ?? record[field.name]?.id ?? null;
      if (typeof externalId === 'string' && externalId) {
        const related = ensureMapping(actor, provider, targetObject, externalId);
        values[field.name] = { businessId: related.business_id, objectKey: targetObject.nameSingular };
      }
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(record, field.name)) values[field.name] = safeComposite(record[field.name]);
  }
  for (const key of SYSTEM_AUDIT_FIELDS) if (Object.prototype.hasOwnProperty.call(record, key)) values[key] = safeComposite(record[key]);
  return {
    businessId: mapping.business_id,
    objectKey: object.nameSingular,
    values,
    deleted: Boolean(record.deletedAt),
  };
}
function translateWriteFields(provider, rawSchema, object, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError('runtime_fields_required', 400);
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    validateKey(key, 'runtime_field_key');
    const field = fieldDefinition(object, key);
    if (!field) throw httpError(`runtime_field_unknown:${key}`, 400);
    if (field.isSystem || field.isUIEditable === false || SYSTEM_AUDIT_FIELDS.has(field.name)) throw httpError(`runtime_field_read_only:${key}`, 403);
    if (field.relation || field.type === 'RELATION') {
      if (value === null || value === '') { output[`${field.name}Id`] = null; continue; }
      const businessId = typeof value === 'string' ? value : value?.businessId;
      if (typeof businessId !== 'string' || !businessId) throw httpError(`runtime_relation_business_id_required:${key}`, 400);
      const targetObject = relationTargetObject(rawSchema, field);
      if (!targetObject) throw httpError(`runtime_relation_target_missing:${key}`, 409);
      const identity = objectIdentity(targetObject);
      const mapping = findBusinessMapping(provider.id, identity.businessType, businessId);
      if (!mapping) throw httpError(`runtime_relation_mapping_missing:${key}`, 409);
      output[`${field.name}Id`] = mapping.external_id;
      continue;
    }
    output[field.name] = value;
  }
  return output;
}
function removeMapping(providerId, object, businessId) {
  const identity = objectIdentity(object);
  db.prepare('DELETE FROM external_mapping WHERE provider_id=? AND business_type=? AND business_id=?').run(providerId, identity.businessType, businessId);
  if (tableExists('crm_business_state')) db.prepare('DELETE FROM crm_business_state WHERE business_type=? AND business_id=?').run(identity.businessType, businessId);
}
function providerPayloadObject(object) { return { objectSingular: object.nameSingular, objectPlural: object.namePlural }; }

async function handleMetadata(req, res, url, actor, provider, scope) {
  const rawSchema = await providerSchema(provider, actor, scope, url.searchParams.get('refresh') === '1');
  if (req.method === 'GET' && url.pathname === '/api/crm-runtime/schema') {
    return json(res, 200, { providerNeutral: true, objects: normalizeSchema(rawSchema) });
  }
  if (req.method === 'GET' && url.pathname === '/api/crm-runtime/views') {
    const body = await invokeProvider(provider, META_CAPABILITIES.views, actor, scope, {});
    return json(res, 200, { views: normalizeViews(body.views ?? [], rawSchema) });
  }
  if (req.method === 'GET' && url.pathname === '/api/crm-runtime/layouts') {
    const body = await invokeProvider(provider, META_CAPABILITIES.layouts, actor, scope, {});
    return json(res, 200, { layouts: normalizeLayouts(body.layouts ?? [], rawSchema) });
  }
  return false;
}
async function handleRecords(req, res, url, actor, provider, scope) {
  const match = url.pathname.match(/^\/api\/crm-runtime\/objects\/([^/]+)\/records(?:\/([^/]+))?(?:\/(restore|destroy))?$/);
  if (!match) return false;
  const objectKey = validateKey(decodeURIComponent(match[1]), 'runtime_object_key');
  const businessId = match[2] ? decodeURIComponent(match[2]) : null;
  const action = match[3] ?? null;
  const rawSchema = await providerSchema(provider, actor, scope);
  const object = runtimeObject(rawSchema, objectKey);
  if (!object) throw httpError('runtime_object_not_found', 404);
  const identity = objectIdentity(object);

  if (req.method === 'GET' && !businessId) {
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? 100) || 100));
    const deleted = url.searchParams.get('deleted') === '1';
    const body = await invokeProvider(provider, RECORD_CAPABILITIES.list, actor, scope, { ...providerPayloadObject(object), limit, deleted });
    const records = (body.records ?? []).map((record) => runtimeRecord(actor, provider, rawSchema, object, record));
    return json(res, 200, { objectKey: object.nameSingular, records });
  }

  if (req.method === 'GET' && businessId && !action) {
    const mapping = findBusinessMapping(provider.id, identity.businessType, businessId);
    if (!mapping) throw httpError('runtime_record_not_found', 404);
    const body = await invokeProvider(provider, RECORD_CAPABILITIES.get, actor, scope, { ...providerPayloadObject(object), externalId: mapping.external_id });
    return json(res, 200, { record: runtimeRecord(actor, provider, rawSchema, object, body.record) });
  }

  if (req.method === 'POST' && !businessId) {
    if (object.isUICreatable === false || object.isSystem) throw httpError('runtime_object_create_forbidden', 403);
    const input = await readJson(req);
    const preferredBusinessId = typeof input.businessId === 'string' && input.businessId ? input.businessId : randomUUID();
    const fields = translateWriteFields(provider, rawSchema, object, input.fields ?? {});
    const body = await invokeProvider(provider, RECORD_CAPABILITIES.create, actor, scope, { ...providerPayloadObject(object), fields });
    if (!body.record?.id) throw httpError('runtime_provider_create_missing_record', 502);
    ensureMapping(actor, provider, object, body.record.id, preferredBusinessId);
    recordAudit(actor, 'crm.runtime.record.create', `${identity.businessType}:${preferredBusinessId}`, { objectKey: object.nameSingular });
    return json(res, 201, { record: runtimeRecord(actor, provider, rawSchema, object, body.record) });
  }

  if (req.method === 'PATCH' && businessId && !action) {
    if (object.isUIEditable === false || object.isSystem) throw httpError('runtime_object_update_forbidden', 403);
    const mapping = findBusinessMapping(provider.id, identity.businessType, businessId);
    if (!mapping) throw httpError('runtime_record_not_found', 404);
    const input = await readJson(req);
    const fields = translateWriteFields(provider, rawSchema, object, input.fields ?? input);
    const body = await invokeProvider(provider, RECORD_CAPABILITIES.update, actor, scope, { ...providerPayloadObject(object), externalId: mapping.external_id, fields });
    recordAudit(actor, 'crm.runtime.record.update', `${identity.businessType}:${businessId}`, { objectKey: object.nameSingular, fields: Object.keys(fields) });
    return json(res, 200, { record: runtimeRecord(actor, provider, rawSchema, object, body.record) });
  }

  if (req.method === 'DELETE' && businessId && !action) {
    const mapping = findBusinessMapping(provider.id, identity.businessType, businessId);
    if (!mapping) throw httpError('runtime_record_not_found', 404);
    await invokeProvider(provider, RECORD_CAPABILITIES.delete, actor, scope, { ...providerPayloadObject(object), externalId: mapping.external_id });
    recordAudit(actor, 'crm.runtime.record.soft_delete', `${identity.businessType}:${businessId}`, { objectKey: object.nameSingular });
    return json(res, 200, { deleted: true, businessId, recoverable: true });
  }

  if (req.method === 'POST' && businessId && action === 'restore') {
    const mapping = findBusinessMapping(provider.id, identity.businessType, businessId);
    if (!mapping) throw httpError('runtime_record_not_found', 404);
    const body = await invokeProvider(provider, RECORD_CAPABILITIES.restore, actor, scope, { ...providerPayloadObject(object), externalId: mapping.external_id });
    recordAudit(actor, 'crm.runtime.record.restore', `${identity.businessType}:${businessId}`, { objectKey: object.nameSingular });
    return json(res, 200, { record: runtimeRecord(actor, provider, rawSchema, object, body.record) });
  }

  if (req.method === 'POST' && businessId && action === 'destroy') {
    requireAdmin(actor);
    const mapping = findBusinessMapping(provider.id, identity.businessType, businessId);
    if (!mapping) throw httpError('runtime_record_not_found', 404);
    await invokeProvider(provider, RECORD_CAPABILITIES.destroy, actor, scope, { ...providerPayloadObject(object), externalId: mapping.external_id });
    removeMapping(provider.id, object, businessId);
    recordAudit(actor, 'crm.runtime.record.destroy', `${identity.businessType}:${businessId}`, { objectKey: object.nameSingular });
    return json(res, 200, { destroyed: true, businessId });
  }
  return false;
}

export function createCrmRuntimeHandler() {
  return async function crmRuntimeHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (!url.pathname.startsWith('/api/crm-runtime/')) return false;
    if (req.method === 'OPTIONS') { json(res, 204, {}); return true; }
    let actor;
    try { actor = await authenticate(req); requireUser(actor); }
    catch (error) { json(res, error.httpStatus ?? 401, { error: 'unauthorized', detail: error.message }); return true; }
    const scope = parseScope(req);
    const requestedCapability = url.pathname === '/api/crm-runtime/schema' ? META_CAPABILITIES.schema
      : url.pathname === '/api/crm-runtime/views' ? META_CAPABILITIES.views
        : url.pathname === '/api/crm-runtime/layouts' ? META_CAPABILITIES.layouts : RECORD_CAPABILITIES.list;
    const provider = resolveProvider(requestedCapability, scope);
    if (!provider) { json(res, 503, { error: 'crm_runtime_unavailable' }); return true; }
    try {
      if (await handleMetadata(req, res, url, actor, provider, scope)) return true;
      if (await handleRecords(req, res, url, actor, provider, scope)) return true;
      json(res, 404, { error: 'crm_runtime_route_not_found' });
      return true;
    } catch (error) {
      const status = error.httpStatus ?? 500;
      recordAudit(actor, 'crm.runtime.rejected', `provider:${provider.id}`, { route: url.pathname, error: error.message });
      json(res, status, status >= 500 ? { error: 'crm_service_unavailable' } : { error: error.message, detail: error.detail ?? null });
      return true;
    }
  };
}
