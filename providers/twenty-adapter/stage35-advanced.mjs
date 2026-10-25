import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const TWENTY_URL = (process.env.TWENTY_URL ?? 'http://twenty-server:3000').replace(/\/$/, '');
const TOKEN_FILE = process.env.TWENTY_API_KEY_FILE ?? '/run/secrets/twenty-api-key';
const REQUEST_TIMEOUT_MS = Number(process.env.TWENTY_REQUEST_TIMEOUT_MS ?? '5000');
const VIEW_TYPES = new Set(['TABLE', 'LIST', 'KANBAN', 'CALENDAR']);
const CALENDAR_LAYOUTS = new Set(['DAY', 'WEEK', 'MONTH']);
const KANBAN_AGGREGATES = new Set(['AVG', 'COUNT', 'MAX', 'MIN', 'SUM']);

export const STAGE35_ADVANCED_CAPABILITIES = new Set([
  'crm.meta.v1.view.create',
  'crm.meta.v1.view.update',
  'crm.meta.v1.view.delete',
  'crm.meta.v1.record.merge',
]);

function apiKey() {
  const token = readFileSync(TOKEN_FILE, 'utf8').trim();
  if (!token) throw new Error('twenty_api_key_missing');
  return token;
}
function safeUuid(value, label) {
  const text = String(value ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) throw new Error(`invalid_${label}`);
  return text;
}
function safeObjectName(value, label = 'object_name') {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(value)) throw new Error(`invalid_${label}`);
  return value;
}
function pascal(value) { const input = safeObjectName(value, 'object_plural'); return input.slice(0, 1).toUpperCase() + input.slice(1); }
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
  if (!response.ok || (Array.isArray(body.errors) && body.errors.length > 0)) {
    const detail = Array.isArray(body.errors) ? body.errors.map((item) => item?.message ?? item?.extensions?.code).filter(Boolean).join('|') : '';
    const error = new Error(`twenty_graphql_${response.status}${detail ? `:${detail}` : ''}`); error.status = response.status; error.body = body; throw error;
  }
  return body.data ?? {};
}
async function rest(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${TWENTY_URL}${path}`, {
    method,
    headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${apiKey()}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(Math.max(REQUEST_TIMEOUT_MS, 20_000)),
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch { throw new Error(`twenty_rest_invalid_json_${response.status}`); }
  if (!response.ok) {
    const detail = Array.isArray(payload?.messages) ? payload.messages.filter(Boolean).join('|') : (payload?.message ?? payload?.error ?? '');
    const error = new Error(`twenty_rest_${response.status}${detail ? `:${detail}` : ''}`); error.status = response.status; error.body = payload; throw error;
  }
  return payload;
}
function validateFilterGroupGraph(payload) {
  const groups = Array.isArray(payload?.filterGroups) ? payload.filterGroups : [];
  const keys = groups.map((group, index) => String(group?.key ?? `group-${index}`));
  if (new Set(keys).size !== keys.length) throw new Error('view_filter_group_duplicate_key');
  const parentByKey = new Map();
  for (const [index, group] of groups.entries()) {
    const key = keys[index];
    const parentKey = group?.parentKey ? String(group.parentKey) : null;
    if (parentKey && !keys.includes(parentKey)) throw new Error('view_filter_group_parent_missing');
    if (parentKey === key) throw new Error('view_filter_group_cycle');
    parentByKey.set(key, parentKey);
  }
  for (const key of keys) {
    const seen = new Set([key]);
    let cursor = parentByKey.get(key);
    while (cursor) {
      if (seen.has(cursor)) throw new Error('view_filter_group_cycle');
      seen.add(cursor);
      cursor = parentByKey.get(cursor);
    }
  }
}
function validateViewPayload(payload) {
  const type = String(payload?.type ?? 'TABLE').toUpperCase();
  if (!VIEW_TYPES.has(type)) throw new Error('unsupported_view_type');
  if (type === 'KANBAN' && !payload?.mainGroupByFieldMetadataId) throw new Error('kanban_group_field_required');
  if (type === 'CALENDAR' && !payload?.calendarFieldMetadataId) throw new Error('calendar_field_required');
  if (payload?.calendarLayout && !CALENDAR_LAYOUTS.has(String(payload.calendarLayout).toUpperCase())) throw new Error('invalid_calendar_layout');
  if (payload?.kanbanAggregateOperation && !KANBAN_AGGREGATES.has(String(payload.kanbanAggregateOperation).toUpperCase())) throw new Error('invalid_kanban_aggregate_operation');
  if (payload?.kanbanAggregateOperation && payload.kanbanAggregateOperation !== 'COUNT' && !payload?.kanbanAggregateOperationFieldMetadataId) throw new Error('kanban_aggregate_field_required');
  validateFilterGroupGraph(payload);
  return type;
}
function sharedViewInput(payload) {
  const name = String(payload?.name ?? '').trim();
  if (!name) throw new Error('view_name_required');
  const type = validateViewPayload(payload);
  const input = {
    name,
    type,
    icon: String(payload?.icon ?? 'IconList'),
    isCompact: Boolean(payload?.compact),
    shouldHideEmptyGroups: Boolean(payload?.hideEmptyGroups),
    visibility: payload?.visibility ?? 'WORKSPACE',
  };
  if (payload?.anyFieldFilterValue !== undefined) input.anyFieldFilterValue = payload.anyFieldFilterValue || null;
  if (payload?.mainGroupByFieldMetadataId) input.mainGroupByFieldMetadataId = safeUuid(payload.mainGroupByFieldMetadataId, 'group_field_metadata_id');
  else if (payload?.mainGroupByFieldMetadataId === null) input.mainGroupByFieldMetadataId = null;
  if (payload?.calendarFieldMetadataId) input.calendarFieldMetadataId = safeUuid(payload.calendarFieldMetadataId, 'calendar_field_metadata_id');
  else if (payload?.calendarFieldMetadataId === null) input.calendarFieldMetadataId = null;
  if (payload?.calendarEndFieldMetadataId) input.calendarEndFieldMetadataId = safeUuid(payload.calendarEndFieldMetadataId, 'calendar_end_field_metadata_id');
  else if (payload?.calendarEndFieldMetadataId === null) input.calendarEndFieldMetadataId = null;
  if (type === 'CALENDAR') input.calendarLayout = String(payload?.calendarLayout ?? 'MONTH').toUpperCase();
  else if (payload?.calendarLayout) input.calendarLayout = String(payload.calendarLayout).toUpperCase();
  if (payload?.kanbanAggregateOperation) input.kanbanAggregateOperation = String(payload.kanbanAggregateOperation).toUpperCase();
  if (payload?.kanbanAggregateOperationFieldMetadataId) input.kanbanAggregateOperationFieldMetadataId = safeUuid(payload.kanbanAggregateOperationFieldMetadataId, 'aggregate_field_metadata_id');
  else if (payload?.kanbanAggregateOperationFieldMetadataId === null) input.kanbanAggregateOperationFieldMetadataId = null;
  return input;
}
function createViewInput(payload) {
  return { ...sharedViewInput(payload), objectMetadataId: safeUuid(payload?.objectMetadataId, 'object_metadata_id'), position: Number.isFinite(Number(payload?.position)) ? Number(payload.position) : 0 };
}
function updateViewInput(payload, viewId) {
  return { id: viewId, ...sharedViewInput(payload) };
}
function childId(value, label) { return value ? safeUuid(value, label) : randomUUID(); }
async function createFilterGroups(viewId, payload) {
  const groups = Array.isArray(payload?.filterGroups) ? payload.filterGroups : [];
  validateFilterGroupGraph(payload);
  const remaining = [...groups];
  const providerByClientKey = new Map();
  let safety = groups.length + 1;
  while (remaining.length > 0 && safety-- > 0) {
    let progressed = false;
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const group = remaining[index];
      const clientKey = String(group.key ?? `group-${index}`);
      const parentClientKey = group.parentKey ? String(group.parentKey) : null;
      if (parentClientKey && !providerByClientKey.has(parentClientKey)) continue;
      const id = childId(group.id, 'view_filter_group_id');
      const input = {
        id,
        viewId,
        logicalOperator: group.operator === 'OR' ? 'OR' : 'AND',
        positionInViewFilterGroup: Number.isFinite(Number(group.position)) ? Number(group.position) : null,
        ...(parentClientKey ? { parentViewFilterGroupId: providerByClientKey.get(parentClientKey) } : {}),
      };
      const data = await graphql('/metadata', 'mutation CreateViewFilterGroup($input:CreateViewFilterGroupInput!){createViewFilterGroup(input:$input){id logicalOperator parentViewFilterGroupId positionInViewFilterGroup}}', { input });
      providerByClientKey.set(clientKey, data?.createViewFilterGroup?.id ?? id);
      remaining.splice(index, 1);
      progressed = true;
    }
    if (!progressed) throw new Error('view_filter_group_parent_cycle_or_missing');
  }
  if (remaining.length) throw new Error('view_filter_group_resolution_failed');
  return providerByClientKey;
}
async function currentViewFields(viewId) {
  const data = await graphql('/metadata', 'query ViewFieldsForReconciliation{getViews{id viewFields{id fieldMetadataId isVisible position size aggregateOperation viewFieldGroupId deletedAt}}}');
  const view = (Array.isArray(data?.getViews) ? data.getViews : []).find((item) => item?.id === viewId);
  return (Array.isArray(view?.viewFields) ? view.viewFields : []).filter((item) => item?.id && item?.fieldMetadataId && !item?.deletedAt);
}
async function reconcileViewFields(viewId, payload) {
  const requested = Array.isArray(payload?.fields) ? payload.fields : [];
  const existing = await currentViewFields(viewId);
  const availableByField = new Map();
  for (const field of existing) {
    const fieldMetadataId = String(field.fieldMetadataId);
    const matches = availableByField.get(fieldMetadataId) ?? [];
    matches.push(field);
    availableByField.set(fieldMetadataId, matches);
  }
  const retainedIds = new Set();
  for (const [index, field] of requested.entries()) {
    const fieldMetadataId = safeUuid(field.fieldMetadataId, 'field_metadata_id');
    const matches = availableByField.get(fieldMetadataId) ?? [];
    const nativeField = field.id
      ? existing.find((item) => item.id === safeUuid(field.id, 'view_field_id'))
      : matches.shift();
    const isVisible = field.visible !== false;
    const position = Number.isFinite(Number(field.position)) ? Number(field.position) : index;
    const size = Number.isFinite(Number(field.size)) ? Number(field.size) : 180;
    if (nativeField?.id) {
      retainedIds.add(nativeField.id);
      const update = { isVisible, position, size };
      if (field.aggregateOperation) update.aggregateOperation = field.aggregateOperation;
      await graphql('/metadata', 'mutation UpdateViewField($input:UpdateViewFieldInput!){updateViewField(input:$input){id fieldMetadataId viewId isVisible position size aggregateOperation}}', {
        input: { id: safeUuid(nativeField.id, 'view_field_id'), update },
      });
      continue;
    }
    const input = {
      ...(field.id ? { id: safeUuid(field.id, 'view_field_id') } : {}),
      viewId,
      fieldMetadataId,
      isVisible,
      position,
      size,
      ...(field.aggregateOperation ? { aggregateOperation: field.aggregateOperation } : {}),
    };
    const data = await graphql('/metadata', 'mutation CreateViewField($input:CreateViewFieldInput!){createViewField(input:$input){id fieldMetadataId viewId isVisible position size aggregateOperation}}', { input });
    const createdId = data?.createViewField?.id;
    if (createdId) retainedIds.add(createdId);
  }
  for (const nativeField of existing) {
    if (retainedIds.has(nativeField.id) || nativeField.isVisible === false) continue;
    await graphql('/metadata', 'mutation UpdateViewField($input:UpdateViewFieldInput!){updateViewField(input:$input){id isVisible}}', {
      input: { id: safeUuid(nativeField.id, 'view_field_id'), update: { isVisible: false } },
    });
  }
}
async function currentViewGroups(viewId) {
  const data = await graphql('/metadata', 'query ViewGroupsForReconciliation{getViews{id viewGroups{id fieldValue isVisible position deletedAt}}}');
  const view = (Array.isArray(data?.getViews) ? data.getViews : []).find((item) => item?.id === viewId);
  return (Array.isArray(view?.viewGroups) ? view.viewGroups : []).filter((item) => item?.id && !item?.deletedAt);
}
async function reconcileViewGroups(viewId, payload) {
  const requested = Array.isArray(payload?.groups) ? payload.groups : [];
  if (requested.length === 0) return;
  const existing = await currentViewGroups(viewId);
  const availableByValue = new Map();
  for (const group of existing) {
    const fieldValue = String(group.fieldValue ?? '');
    const matches = availableByValue.get(fieldValue) ?? [];
    matches.push(group);
    availableByValue.set(fieldValue, matches);
  }
  for (const [index, group] of requested.entries()) {
    const fieldValue = String(group.fieldValue ?? '');
    const isVisible = group.visible !== false;
    const position = Number.isFinite(Number(group.position)) ? Number(group.position) : index;
    const matches = availableByValue.get(fieldValue) ?? [];
    const nativeGroup = group.id
      ? existing.find((item) => item.id === safeUuid(group.id, 'view_group_id'))
      : matches.shift();
    if (nativeGroup?.id) {
      await graphql('/metadata', 'mutation UpdateViewGroup($input:UpdateViewGroupInput!){updateViewGroup(input:$input){id fieldValue isVisible position viewId}}', {
        input: { id: safeUuid(nativeGroup.id, 'view_group_id'), update: { isVisible, position } },
      });
      continue;
    }
    await graphql('/metadata', 'mutation CreateViewGroup($input:CreateViewGroupInput!){createViewGroup(input:$input){id fieldValue isVisible position viewId}}', { input: {
      ...(group.id ? { id: safeUuid(group.id, 'view_group_id') } : {}),
      viewId,
      fieldValue,
      isVisible,
      position,
    } });
  }
}
async function createViewChildren(viewId, payload) {
  const filterGroupIds = await createFilterGroups(viewId, payload);
  await reconcileViewFields(viewId, payload);
  for (const [index, filter] of (Array.isArray(payload?.filters) ? payload.filters : []).entries()) {
    const groupId = filter.groupKey ? filterGroupIds.get(String(filter.groupKey)) : null;
    if (filter.groupKey && !groupId) throw new Error('view_filter_group_mapping_missing');
    await graphql('/metadata', 'mutation CreateViewFilter($input:CreateViewFilterInput!){createViewFilter(input:$input){id fieldMetadataId operand value viewId viewFilterGroupId}}', { input: {
      ...(filter.id ? { id: safeUuid(filter.id, 'view_filter_id') } : {}),
      viewId,
      fieldMetadataId: safeUuid(filter.fieldMetadataId, 'filter_field_metadata_id'),
      operand: filter.operand ?? 'IS',
      value: filter.value ?? '',
      positionInViewFilterGroup: Number.isFinite(Number(filter.position)) ? Number(filter.position) : index,
      ...(groupId ? { viewFilterGroupId: groupId } : {}),
      ...(filter.subFieldName ? { subFieldName: String(filter.subFieldName) } : {}),
    } });
  }
  for (const sort of (Array.isArray(payload?.sorts) ? payload.sorts : [])) {
    await graphql('/metadata', 'mutation CreateViewSort($input:CreateViewSortInput!){createViewSort(input:$input){id fieldMetadataId direction viewId}}', { input: {
      ...(sort.id ? { id: safeUuid(sort.id, 'view_sort_id') } : {}),
      viewId,
      fieldMetadataId: safeUuid(sort.fieldMetadataId, 'sort_field_metadata_id'),
      direction: sort.direction === 'DESC' ? 'DESC' : 'ASC',
      ...(sort.subFieldName ? { subFieldName: String(sort.subFieldName) } : {}),
    } });
  }
  await reconcileViewGroups(viewId, payload);
}
async function createNativeView(payload) {
  const view = await rest('/rest/metadata/views', { method: 'POST', body: createViewInput(payload) });
  if (!view?.id) throw new Error('twenty_view_create_missing_id');
  try { await createViewChildren(view.id, payload); }
  catch (error) { await rest(`/rest/metadata/views/${view.id}`, { method: 'DELETE' }).catch(() => {}); throw error; }
  return { viewId: view.id, view };
}
async function destroyChildren(existing = {}, { preserveViewGroups = false, preserveViewFields = false } = {}) {
  for (const id of existing.filterIds ?? []) await graphql('/metadata', 'mutation DestroyViewFilter($input:DestroyViewFilterInput!){destroyViewFilter(input:$input){id}}', { input: { id: safeUuid(id, 'view_filter_id') } });
  for (const id of existing.sortIds ?? []) await graphql('/metadata', 'mutation DestroyViewSort($input:DestroyViewSortInput!){destroyViewSort(input:$input)}', { input: { id: safeUuid(id, 'view_sort_id') } });
  if (!preserveViewFields) {
    for (const id of existing.fieldIds ?? []) await graphql('/metadata', 'mutation DestroyViewField($input:DestroyViewFieldInput!){destroyViewField(input:$input){id}}', { input: { id: safeUuid(id, 'view_field_id') } });
  }
  if (!preserveViewGroups) {
    for (const id of existing.groupIds ?? []) await graphql('/metadata', 'mutation DestroyViewGroup($input:DestroyViewGroupInput!){destroyViewGroup(input:$input){id}}', { input: { id: safeUuid(id, 'view_group_id') } });
  }
  for (const id of existing.filterGroupIds ?? []) await graphql('/metadata', 'mutation DestroyViewFilterGroup($id:String!){destroyViewFilterGroup(id:$id)}', { id: safeUuid(id, 'view_filter_group_id') });
}
async function updateNativeView(payload) {
  const viewId = safeUuid(payload?.viewId, 'view_id');
  const input = updateViewInput(payload, viewId);
  await rest(`/rest/metadata/views/${viewId}`, { method: 'PATCH', body: input });
  const preserveViewGroups = String(payload?.type ?? '').toUpperCase() === 'KANBAN';
  await destroyChildren(payload?.existing ?? {}, { preserveViewGroups, preserveViewFields: true });
  try {
    await createViewChildren(viewId, payload);
  } catch (error) {
    error.message = `twenty_view_children_rebuild_failed:${error.message}`;
    throw error;
  }
  return { viewId };
}
async function deleteNativeView(payload) {
  const viewId = safeUuid(payload?.viewId, 'view_id');
  const data = await rest(`/rest/metadata/views/${viewId}`, { method: 'DELETE' });
  return { deleted: data?.success === true, viewId };
}
async function mergeRecords(payload) {
  const objectPlural = safeObjectName(payload?.objectPlural, 'object_plural');
  const ids = Array.isArray(payload?.externalIds) ? payload.externalIds.map((id) => safeUuid(id, 'external_id')) : [];
  if (ids.length < 2 || ids.length > 20) throw new Error('merge_requires_2_to_20_records');
  const priority = Number.isInteger(payload?.conflictPriorityIndex) ? payload.conflictPriorityIndex : 0;
  if (priority < 0 || priority >= ids.length) throw new Error('invalid_conflict_priority_index');
  const dryRun = Boolean(payload?.dryRun);
  const resolver = `merge${pascal(objectPlural)}`;
  const data = await graphql('/graphql', `mutation MergeRecords($ids:[UUID!]!,$conflictPriorityIndex:Int!,$dryRun:Boolean){${resolver}(ids:$ids,conflictPriorityIndex:$conflictPriorityIndex,dryRun:$dryRun){id createdAt updatedAt}}`, { ids, conflictPriorityIndex: priority, dryRun });
  const record = data?.[resolver]; if (!record?.id) throw new Error('twenty_merge_response_missing_record');
  return { mergedExternalId: record.id, dryRun, providerPreview: { createdAt: record.createdAt ?? null, updatedAt: record.updatedAt ?? null } };
}

export async function invokeStage35Advanced(capability, payload) {
  switch (capability) {
    case 'crm.meta.v1.view.create': return createNativeView(payload);
    case 'crm.meta.v1.view.update': return updateNativeView(payload);
    case 'crm.meta.v1.view.delete': return deleteNativeView(payload);
    case 'crm.meta.v1.record.merge': return mergeRecords(payload);
    default: throw new Error(`unsupported_stage35_advanced_capability:${capability}`);
  }
}
