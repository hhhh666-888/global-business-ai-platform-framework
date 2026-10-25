import http from 'node:http';
import { readFileSync } from 'node:fs';

// Install the bounded Twenty-only rate-limit transport before loading the adapter.
// The transport also propagates itself through NODE_OPTIONS so the legacy CRM
// child process uses the same provider-boundary retry policy.
await import('./rate-limit-transport.mjs');

// Keep legacy CRM-only proofs independent from GBAP business storage.
// Mail/calendar deployments explicitly set GBAP_DB_PATH to a persistent mounted path.
// When it is absent, use an in-memory mapping store so the compatibility adapter can
// start and serve legacy CRM health/capabilities without requiring /data.
if (!process.env.GBAP_DB_PATH) process.env.GBAP_DB_PATH = ':memory:';

const PUBLIC_PORT = Number(process.env.PORT ?? '8091');
const EXTENDED_PORT = Number(process.env.TWENTY_ADAPTER_EXTENDED_PORT ?? '8093');
const TWENTY_URL = (process.env.TWENTY_URL ?? 'http://twenty-server:3000').replace(/\/$/, '');
const TOKEN_FILE = process.env.TWENTY_API_KEY_FILE ?? '/run/secrets/twenty-api-key';
const REQUEST_TIMEOUT_MS = Number(process.env.TWENTY_REQUEST_TIMEOUT_MS ?? '5000');
const RUNTIME_CAPABILITIES = new Set([
  'crm.meta.v1.schema',
  'crm.meta.v1.views',
  'crm.meta.v1.layouts',
  'crm.meta.v1.record.list',
  'crm.meta.v1.record.get',
  'crm.meta.v1.record.create',
  'crm.meta.v1.record.update',
  'crm.meta.v1.record.delete',
  'crm.meta.v1.record.restore',
  'crm.meta.v1.record.destroy',
]);

// Move the already accepted Stage 3.4 adapter behind the Stage 3.5 runtime front.
process.env.PORT = String(EXTENDED_PORT);
await import('./extended.mjs');
process.env.PORT = String(PUBLIC_PORT);

function apiKey() {
  const token = readFileSync(TOKEN_FILE, 'utf8').trim();
  if (!token) throw new Error('twenty_api_key_missing');
  return token;
}
function boundedLimit(value) { return Number.isInteger(value) && value > 0 && value <= 500 ? value : 100; }
function safeObjectName(value, label = 'object_name') {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(value)) throw new Error(`invalid_${label}`);
  return value;
}
function pascal(value) {
  const input = safeObjectName(value, 'object_singular');
  return input.slice(0, 1).toUpperCase() + input.slice(1);
}
async function readBody(req, maxBytes = 1024 * 1024) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > maxBytes) throw new Error('request_body_too_large'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function providerFetch(path, { method = 'GET', body } = {}) {
  const headers = { accept: 'application/json', authorization: `Bearer ${apiKey()}` };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${TWENTY_URL}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(Math.max(REQUEST_TIMEOUT_MS, 15_000)),
  });
  const text = await response.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { rawText: text.slice(0, 2000) }; }
  if (!response.ok) {
    const error = new Error(`twenty_http_${response.status}`); error.status = response.status; error.body = parsed; throw error;
  }
  return parsed;
}
async function graphql(path, query, variables = {}) {
  const response = await fetch(`${TWENTY_URL}${path}`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(Math.max(REQUEST_TIMEOUT_MS, 20_000)),
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { throw new Error(`twenty_graphql_invalid_json_${response.status}`); }
  if (!response.ok || (Array.isArray(body.errors) && body.errors.length)) {
    const detail = Array.isArray(body.errors) ? body.errors.map((item) => item?.message ?? item?.extensions?.code).filter(Boolean).join('|') : '';
    const error = new Error(`twenty_graphql_${response.status}${detail ? `:${detail}` : ''}`); error.status = response.status; error.body = body; throw error;
  }
  return body.data ?? {};
}
function findRecordWithId(value, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return null;
  if (Array.isArray(value)) { for (const item of value) { const found = findRecordWithId(item, depth + 1); if (found) return found; } return null; }
  if (typeof value !== 'object') return null;
  if (typeof value.id === 'string' && value.id) return value;
  for (const child of Object.values(value)) { const found = findRecordWithId(child, depth + 1); if (found) return found; }
  return null;
}
function listRecords(raw, key) {
  const candidates = [raw?.data?.[key], raw?.[key], raw?.data?.data?.[key]];
  return candidates.find(Array.isArray) ?? [];
}

const OBJECT_METADATA_QUERY = `
query ObjectMetadataItems {
  currentWorkspace { workspaceCustomApplication { id } }
  objects(paging: { first: 1000 }) {
    edges {
      node {
        id universalIdentifier nameSingular namePlural labelSingular labelPlural color description icon
        isRemote isActive isSystem isUIEditable isUICreatable createdAt updatedAt
        labelIdentifierFieldMetadataId imageIdentifierFieldMetadataId applicationId shortcut isLabelSyncedWithName isSearchable openRecordIn duplicateCriteria
        searchFieldMetadataList { id fieldMetadataId tsVectorFieldMetadataId position createdAt updatedAt }
        indexMetadataList {
          id createdAt updatedAt name indexWhereClause indexType isUnique isCustom
          indexFieldMetadataList { id fieldMetadataId subFieldName createdAt updatedAt order }
        }
        fieldsList {
          id universalIdentifier type name label description icon isActive isSystem isUIEditable isNullable isUnique
          createdAt updatedAt defaultValue options settings isLabelSyncedWithName morphId applicationId
          relation {
            type
            sourceObjectMetadata { id nameSingular namePlural }
            targetObjectMetadata { id nameSingular namePlural }
            sourceFieldMetadata { id name }
            targetFieldMetadata { id name }
          }
          morphRelations {
            type
            sourceObjectMetadata { id nameSingular namePlural }
            targetObjectMetadata { id nameSingular namePlural }
            sourceFieldMetadata { id name }
            targetFieldMetadata { id name }
          }
        }
      }
    }
  }
}`;

const VIEW_QUERY = `
query FindAllViews {
  getViews {
    id name objectMetadataId type key icon position isCompact
    kanbanAggregateOperation kanbanAggregateOperationFieldMetadataId mainGroupByFieldMetadataId shouldHideEmptyGroups kanbanColumnWidth
    anyFieldFilterValue calendarFieldMetadataId calendarEndFieldMetadataId calendarLayout visibility createdByUserWorkspaceId isActive
    viewFields { id fieldMetadataId viewId isVisible position size aggregateOperation viewFieldGroupId isActive createdAt updatedAt deletedAt }
    viewFieldGroups { id name position isVisible viewId createdAt updatedAt isActive deletedAt viewFields { id fieldMetadataId isVisible size position aggregateOperation viewFieldGroupId isActive deletedAt } }
    viewFilters { id fieldMetadataId operand value viewFilterGroupId positionInViewFilterGroup subFieldName relationTargetFieldMetadataId viewId createdAt updatedAt deletedAt }
    viewFilterGroups { id parentViewFilterGroupId logicalOperator positionInViewFilterGroup viewId createdAt updatedAt deletedAt }
    viewSorts { id fieldMetadataId direction subFieldName viewId createdAt deletedAt updatedAt }
    viewGroups { id isVisible fieldValue position viewId createdAt updatedAt deletedAt }
  }
}`;

const BASIC_VIEW_QUERY = `
query FindAllViews {
  getViews {
    id name objectMetadataId type icon position isCompact mainGroupByFieldMetadataId anyFieldFilterValue isActive
    viewFields { id fieldMetadataId isVisible position size }
    viewFilters { id fieldMetadataId operand value }
    viewSorts { id fieldMetadataId direction }
  }
}`;

const LAYOUT_QUERY = `
query FindAllRecordPageLayouts {
  getPageLayouts(pageLayoutType: RECORD_PAGE) {
    id applicationId name objectMetadataId type universalIdentifier isSystemSideEffect isFirstTabPinned defaultTabToFocusOnMobileAndSidePanelId createdAt updatedAt
    tabs {
      id applicationId universalIdentifier isSystemSideEffect title icon position layoutMode pageLayoutId isActive createdAt updatedAt
      widgets {
        id applicationId universalIdentifier isSystemSideEffect title type objectMetadataId createdAt updatedAt isActive deletedAt conditionalDisplay conditionalAvailabilityExpression
        gridPosition { column columnSpan row rowSpan }
        position {
          ... on PageLayoutWidgetGridPosition { layoutMode row column rowSpan columnSpan }
          ... on PageLayoutWidgetVerticalListPosition { layoutMode index }
          ... on PageLayoutWidgetCanvasPosition { layoutMode }
        }
        configuration {
          __typename
          ... on FieldConfiguration { configurationType fieldDisplayMode fieldMetadataId viewId nestedRelationFieldMetadataId isUIEditable }
          ... on FieldsConfiguration { configurationType viewId newFieldDefaultVisibility shouldAllowUserToSeeHiddenFields }
          ... on RecordTableConfiguration { configurationType viewId recordLimit isUIEditable }
          ... on IframeConfiguration { configurationType url }
          ... on StandaloneRichTextConfiguration { configurationType body { blocknote markdown } }
          ... on AggregateChartConfiguration { configurationType aggregateFieldMetadataId aggregateOperation label description filter prefix suffix }
          ... on PieChartConfiguration { configurationType aggregateFieldMetadataId aggregateOperation groupByFieldMetadataId groupBySubFieldName dateGranularity displayLegend description filter }
          ... on BarChartConfiguration { configurationType aggregateFieldMetadataId aggregateOperation primaryAxisGroupByFieldMetadataId secondaryAxisGroupByFieldMetadataId description filter }
          ... on LineChartConfiguration { configurationType aggregateFieldMetadataId aggregateOperation primaryAxisGroupByFieldMetadataId secondaryAxisGroupByFieldMetadataId description filter }
          ... on CalendarConfiguration { configurationType }
          ... on EmailsConfiguration { configurationType }
          ... on EmailThreadConfiguration { configurationType }
          ... on FilesConfiguration { configurationType }
          ... on NotesConfiguration { configurationType }
          ... on TasksConfiguration { configurationType }
          ... on TimelineConfiguration { configurationType }
          ... on ViewConfiguration { configurationType }
          ... on FieldRichTextConfiguration { configurationType }
          ... on WorkflowConfiguration { configurationType }
          ... on WorkflowRunConfiguration { configurationType }
          ... on WorkflowVersionConfiguration { configurationType }
        }
        pageLayoutTabId
      }
    }
  }
}`;

const BASIC_LAYOUT_QUERY = `
query FindAllRecordPageLayouts {
  getPageLayouts(pageLayoutType: RECORD_PAGE) {
    id name objectMetadataId type isFirstTabPinned
    tabs { id title icon position layoutMode isActive widgets { id title type objectMetadataId isActive } }
  }
}`;

async function metadataSchema() {
  const data = await graphql('/metadata', OBJECT_METADATA_QUERY);
  // Twenty v2.41 removed Object/Field.isCustom. Match its frontend's
  // application ownership rule while preserving the GBAP adapter contract.
  // isSystem is a separate flag: standard business objects can be non-system.
  const customApplicationId = data.currentWorkspace?.workspaceCustomApplication?.id;
  const isCustom = item => typeof customApplicationId === 'string'
    && customApplicationId.length > 0 && item.applicationId === customApplicationId;
  return { objects: (data.objects?.edges ?? []).map((edge) => edge?.node).filter(Boolean).map(object => ({
    ...object,
    isCustom: isCustom(object),
    fieldsList: (object.fieldsList ?? []).map(field => ({ ...field, isCustom: isCustom(field) })),
  })) };
}
async function metadataViews() {
  try { const data = await graphql('/metadata', VIEW_QUERY); return { views: Array.isArray(data.getViews) ? data.getViews : [] }; }
  catch (error) {
    console.warn(JSON.stringify({ event: 'twenty.adapter.runtime_view_query_fallback', detail: error.message }));
    const data = await graphql('/metadata', BASIC_VIEW_QUERY);
    return { views: Array.isArray(data.getViews) ? data.getViews : [] };
  }
}
async function metadataLayouts() {
  try { const data = await graphql('/metadata', LAYOUT_QUERY); return { layouts: Array.isArray(data.getPageLayouts) ? data.getPageLayouts : [] }; }
  catch (error) {
    console.warn(JSON.stringify({ event: 'twenty.adapter.runtime_layout_query_fallback', detail: error.message }));
    try { const data = await graphql('/metadata', BASIC_LAYOUT_QUERY); return { layouts: Array.isArray(data.getPageLayouts) ? data.getPageLayouts : [], reduced: true }; }
    catch (fallbackError) {
      console.warn(JSON.stringify({ event: 'twenty.adapter.runtime_layout_unavailable', detail: fallbackError.message }));
      return { layouts: [], reduced: true, warning: 'record_page_layout_metadata_unavailable' };
    }
  }
}
async function recordList(payload) {
  const objectPlural = safeObjectName(payload?.objectPlural, 'object_plural');
  const limit = boundedLimit(payload?.limit);
  if (payload?.deleted) {
    const data = await graphql('/graphql', `query DeletedRecords($first:Int!){${objectPlural}(first:$first,filter:{and:[{deletedAt:{is:NOT_NULL}},{or:[{deletedAt:{is:NULL}},{deletedAt:{is:NOT_NULL}}]}]}){edges{node{id createdAt updatedAt deletedAt}}}}`, { first: limit });
    return { records: (data?.[objectPlural]?.edges ?? []).map((edge) => edge?.node).filter(Boolean), deletedListing: true };
  }
  const raw = await providerFetch(`/rest/${objectPlural}?limit=${limit}`);
  return { records: listRecords(raw, objectPlural) };
}
async function recordGet(payload) {
  const objectPlural = safeObjectName(payload?.objectPlural, 'object_plural');
  const externalId = String(payload?.externalId ?? '').trim();
  if (!externalId) throw new Error('external_id_required');
  const raw = await providerFetch(`/rest/${objectPlural}/${encodeURIComponent(externalId)}`);
  const record = findRecordWithId(raw); if (!record) throw new Error('twenty_get_response_missing_record'); return { record };
}
async function recordCreate(payload) {
  const objectPlural = safeObjectName(payload?.objectPlural, 'object_plural');
  const raw = await providerFetch(`/rest/${objectPlural}`, { method: 'POST', body: payload?.fields ?? {} });
  const record = findRecordWithId(raw); if (!record) throw new Error('twenty_create_response_missing_record'); return { record };
}
async function recordUpdate(payload) {
  const objectPlural = safeObjectName(payload?.objectPlural, 'object_plural');
  const externalId = String(payload?.externalId ?? '').trim(); if (!externalId) throw new Error('external_id_required');
  const fields = payload?.fields && typeof payload.fields === 'object' ? payload.fields : {};
  if (Object.keys(fields).length === 0) return recordGet(payload);
  const raw = await providerFetch(`/rest/${objectPlural}/${encodeURIComponent(externalId)}`, { method: 'PATCH', body: fields });
  const record = findRecordWithId(raw); if (!record) throw new Error('twenty_update_response_missing_record'); return { record };
}
async function recordDelete(payload) {
  const objectSingular = safeObjectName(payload?.objectSingular, 'object_singular');
  const objectPlural = safeObjectName(payload?.objectPlural, 'object_plural');
  const externalId = String(payload?.externalId ?? '').trim(); if (!externalId) throw new Error('external_id_required');
  const resolver = `delete${pascal(objectPlural)}`;
  const filterType = `${pascal(objectSingular)}FilterInput`;
  const data = await graphql('/graphql', `mutation DeleteRecord($filter:${filterType}!){${resolver}(filter:$filter){id createdAt updatedAt deletedAt}}`, { filter: { id: { in: [externalId] } } });
  const record = Array.isArray(data?.[resolver]) ? data[resolver].find((item) => item?.id === externalId) : null;
  if (!record?.id || !record?.deletedAt) throw new Error('twenty_soft_delete_response_missing_record');
  return { deleted: true, externalId: record.id };
}
async function recordRestore(payload) {
  const objectSingular = safeObjectName(payload?.objectSingular, 'object_singular');
  const externalId = String(payload?.externalId ?? '').trim(); if (!externalId) throw new Error('external_id_required');
  const resolver = `restore${pascal(objectSingular)}`;
  const data = await graphql('/graphql', `mutation RestoreRecord($id:UUID!){${resolver}(id:$id){id createdAt updatedAt deletedAt}}`, { id: externalId });
  const record = data?.[resolver]; if (!record?.id) throw new Error('twenty_restore_response_missing_record');
  try { return await recordGet(payload); } catch { return { record }; }
}
async function recordDestroy(payload) {
  const objectSingular = safeObjectName(payload?.objectSingular, 'object_singular');
  const externalId = String(payload?.externalId ?? '').trim(); if (!externalId) throw new Error('external_id_required');
  const resolver = `destroy${pascal(objectSingular)}`;
  const data = await graphql('/graphql', `mutation DestroyRecord($id:UUID!){${resolver}(id:$id){id}}`, { id: externalId });
  return { destroyed: true, externalId: data?.[resolver]?.id ?? externalId };
}
async function invokeRuntime(capability, payload) {
  switch (capability) {
    case 'crm.meta.v1.schema': return metadataSchema();
    case 'crm.meta.v1.views': return metadataViews();
    case 'crm.meta.v1.layouts': return metadataLayouts();
    case 'crm.meta.v1.record.list': return recordList(payload);
    case 'crm.meta.v1.record.get': return recordGet(payload);
    case 'crm.meta.v1.record.create': return recordCreate(payload);
    case 'crm.meta.v1.record.update': return recordUpdate(payload);
    case 'crm.meta.v1.record.delete': return recordDelete(payload);
    case 'crm.meta.v1.record.restore': return recordRestore(payload);
    case 'crm.meta.v1.record.destroy': return recordDestroy(payload);
    default: throw new Error(`unsupported_runtime_capability:${capability}`);
  }
}

async function proxyAcceptedAdapter(req, res, body = null) {
  const buffer = body ?? await readBody(req);
  const response = await fetch(`http://127.0.0.1:${EXTENDED_PORT}${req.url}`, {
    method: req.method,
    headers: { 'content-type': req.headers['content-type'] ?? 'application/json', accept: req.headers.accept ?? 'application/json' },
    body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : buffer,
    signal: AbortSignal.timeout(Math.max(REQUEST_TIMEOUT_MS, 20_000)),
  });
  const responseBody = Buffer.from(await response.arrayBuffer());
  res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(responseBody);
}

const runtimeFront = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      const response = await fetch(`http://127.0.0.1:${EXTENDED_PORT}/health`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(Math.max(REQUEST_TIMEOUT_MS, 10_000)) });
      const accepted = await response.json();
      return sendJson(res, response.ok ? 200 : response.status, { ...accepted, stage35Runtime: true, metadataDrivenCrm: true });
    }
    if (req.method === 'POST' && req.url === '/invoke') {
      const bodyBuffer = await readBody(req);
      let input;
      try { input = JSON.parse(bodyBuffer.toString('utf8')); } catch { return sendJson(res, 400, { error: 'invalid_json' }); }
      if (!RUNTIME_CAPABILITIES.has(input?.capability)) return proxyAcceptedAdapter(req, res, bodyBuffer);
      try {
        const result = await invokeRuntime(input.capability, input.payload ?? {});
        return sendJson(res, 200, { ok: true, provider: 'twenty', capability: input.capability, ...result });
      } catch (error) {
        console.error(JSON.stringify({ event: 'twenty.adapter.runtime_failed', capability: input?.capability ?? null, detail: error.message, upstreamStatus: error.status ?? null }));
        const status = error.status === 403 ? 403 : error.status && error.status >= 400 && error.status < 500 ? 400 : 502;
        return sendJson(res, status, { ok: false, provider: 'twenty', error: error.message, upstreamStatus: error.status ?? null });
      }
    }
    return proxyAcceptedAdapter(req, res);
  } catch (error) {
    return sendJson(res, 502, { error: 'stage35_runtime_front_unavailable', detail: error.message });
  }
});

runtimeFront.listen(PUBLIC_PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({ event: 'twenty.adapter.stage35_runtime_started', port: PUBLIC_PORT, acceptedAdapterPort: EXTENDED_PORT, twentyUrl: TWENTY_URL }));
});
