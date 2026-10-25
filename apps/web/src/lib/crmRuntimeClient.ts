import { api } from './gbapClient';

export type CrmRuntimeRelation = {
  type: string | null;
  targetObjectKey: string;
  sourceFieldKey: string;
  targetFieldKey: string | null;
};

export type CrmRuntimeField = {
  fieldKey: string;
  label: string;
  type: string;
  description: string | null;
  icon: string | null;
  active: boolean;
  system: boolean;
  uiEditable: boolean;
  nullable: boolean;
  unique: boolean;
  defaultValue: unknown;
  options: unknown;
  settings: unknown;
  relation: CrmRuntimeRelation | null;
};

export type CrmRuntimeObject = {
  custom?: boolean;
  objectKey: string;
  objectPluralKey: string;
  labelSingular: string;
  labelPlural: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  active: boolean;
  system: boolean;
  uiEditable: boolean;
  uiCreatable: boolean;
  searchable: boolean;
  openRecordIn: string;
  fields: CrmRuntimeField[];
};

export type CrmRuntimeViewField = { fieldKey: string; visible: boolean; position: number; size: number | null; aggregateOperation: string | null };
export type CrmRuntimeViewFilter = { fieldKey: string; operand: string; value: unknown; groupKey: string | null; position: number | null; subFieldName: string | null };
export type CrmRuntimeViewFilterGroup = { key: string; parentKey: string | null; operator: 'AND' | 'OR' | string; position: number | null };
export type CrmRuntimeViewSort = { fieldKey: string; direction: 'ASC' | 'DESC' | string; subFieldName: string | null };
export type CrmRuntimeViewGroup = { fieldValue: string; visible: boolean; position: number };

export type CrmRuntimeView = {
  viewKey: string;
  name: string;
  objectKey: string | null;
  type: 'TABLE' | 'KANBAN' | 'CALENDAR' | 'LIST' | string;
  icon: string | null;
  position: number;
  compact: boolean;
  visibility: string | null;
  scope?: 'PERSONAL' | 'WORKSPACE';
  owned?: boolean;
  editable?: boolean;
  anyFieldFilterValue: string | null;
  mainGroupByFieldKey: string | null;
  kanbanAggregateOperation: string | null;
  kanbanAggregateFieldKey: string | null;
  calendarFieldKey: string | null;
  calendarEndFieldKey: string | null;
  calendarLayout: string | null;
  hideEmptyGroups: boolean;
  fields: CrmRuntimeViewField[];
  filters: CrmRuntimeViewFilter[];
  filterGroups: CrmRuntimeViewFilterGroup[];
  sorts: CrmRuntimeViewSort[];
  groups: CrmRuntimeViewGroup[];
};

export type CrmRuntimeViewSpec = {
  objectKey: string;
  name: string;
  type: 'TABLE' | 'KANBAN' | 'CALENDAR' | 'LIST' | string;
  icon?: string;
  position?: number;
  compact?: boolean;
  scope?: 'PERSONAL' | 'WORKSPACE';
  anyFieldFilterValue?: string | null;
  mainGroupByFieldKey?: string | null;
  kanbanAggregateOperation?: string | null;
  kanbanAggregateFieldKey?: string | null;
  calendarFieldKey?: string | null;
  calendarEndFieldKey?: string | null;
  calendarLayout?: string | null;
  hideEmptyGroups?: boolean;
  fields?: CrmRuntimeViewField[];
  filters?: CrmRuntimeViewFilter[];
  filterGroups?: CrmRuntimeViewFilterGroup[];
  sorts?: CrmRuntimeViewSort[];
  groups?: CrmRuntimeViewGroup[];
};

export type CrmRuntimeWidget = {
  widgetKey: string;
  title: string;
  type: string;
  objectKey: string | null;
  position: unknown;
  conditionalDisplay: unknown;
  configuration: null | {
    type: string | null;
    fieldKey: string | null;
    aggregateFieldKey: string | null;
    groupByFieldKey: string | null;
    primaryAxisFieldKey: string | null;
    secondaryAxisFieldKey: string | null;
    viewKey: string | null;
    body: unknown;
    url: string | null;
    raw: Record<string, unknown>;
  };
};

export type CrmRuntimeLayout = {
  layoutKey: string;
  name: string;
  objectKey: string;
  type: string;
  firstTabPinned: boolean;
  tabs: Array<{
    tabKey: string;
    title: string;
    icon: string | null;
    position: number;
    layoutMode: string;
    widgets: CrmRuntimeWidget[];
  }>;
};

export type CrmRuntimeRecord = {
  businessId: string;
  objectKey: string;
  values: Record<string, unknown>;
  deleted: boolean;
};

export type CrmRuntimeFile = { id: string; fileName: string; mimeType: string; sizeBytes: number; createdBy: string; createdAt: string };
export type CrmRuntimeContext = {
  businessId: string;
  tasks: Array<{ businessId: string | null; title?: string; bodyMarkdown?: string | null; dueAt?: string | null; status?: string }>;
  notes: Array<{ businessId: string | null; title?: string; bodyMarkdown?: string | null; createdAt?: string | null }>;
  files: CrmRuntimeFile[];
};

export type CrmRuntimeMergePreview = {
  dryRun: true;
  mergeAllowed: true;
  survivorBusinessId: string;
  sourceBusinessIds: string[];
  conflicts: Array<{ fieldKey: string; chosenValue: unknown; candidates: unknown[] }>;
  providerPreview: unknown;
};

export async function getCrmRuntimeSchema(refresh = false) {
  const suffix = refresh ? '?refresh=1' : '';
  return api<{ providerNeutral: true; objects: CrmRuntimeObject[] }>(`/api/crm-runtime/schema${suffix}`);
}
export async function getCrmRuntimeViews() { return api<{ views: CrmRuntimeView[]; deepViewConfig?: boolean }>('/api/crm-runtime/views'); }
export async function createCrmRuntimeView(spec: CrmRuntimeViewSpec) {
  return api<{ viewKey: string; scope: 'PERSONAL' | 'WORKSPACE' }>('/api/crm-runtime/views', { method: 'POST', body: JSON.stringify(spec) });
}
export async function updateCrmRuntimeView(viewKey: string, spec: CrmRuntimeViewSpec) {
  return api<{ viewKey: string; scope: 'PERSONAL' | 'WORKSPACE' }>(`/api/crm-runtime/views/${encodeURIComponent(viewKey)}`, { method: 'PATCH', body: JSON.stringify(spec) });
}
export async function deleteCrmRuntimeView(viewKey: string) {
  return api<{ removed: string }>(`/api/crm-runtime/views/${encodeURIComponent(viewKey)}`, { method: 'DELETE' });
}
export async function getCrmRuntimeLayouts() { return api<{ layouts: CrmRuntimeLayout[] }>('/api/crm-runtime/layouts'); }
export async function listCrmRuntimeRecords(objectKey: string, options: { limit?: number; deleted?: boolean } = {}) {
  const params = new URLSearchParams();
  params.set('limit', String(options.limit ?? 300));
  if (options.deleted) params.set('deleted', '1');
  return api<{ objectKey: string; records: CrmRuntimeRecord[] }>(`/api/crm-runtime/objects/${encodeURIComponent(objectKey)}/records?${params.toString()}`);
}
export async function getCrmRuntimeRecord(objectKey: string, businessId: string) {
  return api<{ record: CrmRuntimeRecord }>(`/api/crm-runtime/objects/${encodeURIComponent(objectKey)}/records/${encodeURIComponent(businessId)}`);
}
export async function createCrmRuntimeRecord(objectKey: string, fields: Record<string, unknown>) {
  return api<{ record: CrmRuntimeRecord }>(`/api/crm-runtime/objects/${encodeURIComponent(objectKey)}/records`, { method: 'POST', body: JSON.stringify({ fields }) });
}
export async function updateCrmRuntimeRecord(objectKey: string, businessId: string, fields: Record<string, unknown>) {
  return api<{ record: CrmRuntimeRecord }>(`/api/crm-runtime/objects/${encodeURIComponent(objectKey)}/records/${encodeURIComponent(businessId)}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
}
export async function softDeleteCrmRuntimeRecord(objectKey: string, businessId: string) {
  return api<{ deleted: true; businessId: string; recoverable: true }>(`/api/crm-runtime/objects/${encodeURIComponent(objectKey)}/records/${encodeURIComponent(businessId)}`, { method: 'DELETE' });
}
export async function restoreCrmRuntimeRecord(objectKey: string, businessId: string) {
  return api<{ record: CrmRuntimeRecord }>(`/api/crm-runtime/objects/${encodeURIComponent(objectKey)}/records/${encodeURIComponent(businessId)}/restore`, { method: 'POST', body: '{}' });
}
export async function destroyCrmRuntimeRecord(objectKey: string, businessId: string) {
  return api<{ destroyed: true; businessId: string }>(`/api/crm-runtime/objects/${encodeURIComponent(objectKey)}/records/${encodeURIComponent(businessId)}/destroy`, { method: 'POST', body: '{}' });
}
export async function previewCrmRuntimeMerge(objectKey: string, businessIds: string[], survivorBusinessId: string) {
  return api<CrmRuntimeMergePreview>(`/api/crm-runtime/objects/${encodeURIComponent(objectKey)}/merge`, {
    method: 'POST', body: JSON.stringify({ businessIds, survivorBusinessId, dryRun: true }),
  });
}
export async function mergeCrmRuntimeRecords(objectKey: string, businessIds: string[], survivorBusinessId: string) {
  return api<{ merged: true; survivorBusinessId: string; mergedBusinessIds: string[] }>(`/api/crm-runtime/objects/${encodeURIComponent(objectKey)}/merge`, {
    method: 'POST', body: JSON.stringify({ businessIds, survivorBusinessId, dryRun: false }),
  });
}
export async function getCrmRuntimeContext(objectKey: string, businessId: string) {
  return api<CrmRuntimeContext>(`/api/crm-runtime/objects/${encodeURIComponent(objectKey)}/records/${encodeURIComponent(businessId)}/context`);
}
function bytesToBase64(bytes: Uint8Array) {
  let binary = ''; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  return btoa(binary);
}
export async function uploadCrmRuntimeFile(objectKey: string, businessId: string, file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return api<{ file: CrmRuntimeFile }>(`/api/crm-runtime/objects/${encodeURIComponent(objectKey)}/records/${encodeURIComponent(businessId)}/files`, {
    method: 'POST', body: JSON.stringify({ fileName: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, contentBase64: bytesToBase64(bytes) }),
  });
}
