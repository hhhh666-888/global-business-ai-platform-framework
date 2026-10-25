import { csvCell as csvEscape } from '../lib/csvCell';
import { dateTimeLocalValue, richTextMarkdown } from '../lib/recordFieldValues';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GbapSession } from '../hooks/useGbapSession';
import {
  createCrmRuntimeRecord,
  createCrmRuntimeView,
  deleteCrmRuntimeView,
  destroyCrmRuntimeRecord,
  getCrmRuntimeContext,
  getCrmRuntimeLayouts,
  getCrmRuntimeSchema,
  getCrmRuntimeViews,
  listCrmRuntimeRecords,
  mergeCrmRuntimeRecords,
  previewCrmRuntimeMerge,
  restoreCrmRuntimeRecord,
  softDeleteCrmRuntimeRecord,
  updateCrmRuntimeRecord,
  updateCrmRuntimeView,
  uploadCrmRuntimeFile,
  type CrmRuntimeContext,
  type CrmRuntimeField,
  type CrmRuntimeLayout,
  type CrmRuntimeMergePreview,
  type CrmRuntimeObject,
  type CrmRuntimeRecord,
  type CrmRuntimeView,
  type CrmRuntimeViewFilterGroup,
  type CrmRuntimeWidget,
} from '../lib/crmRuntimeClient';
import { createNote, createTask, deleteCrmFile, downloadCrmFile } from '../lib/gbapClient';
import { CrmRuntimeFieldInput } from './CrmRuntimeFieldInput';
import './crm-runtime-workspace.css';
import './crm-runtime-v2.css';

type Props = { customOnly?: boolean; session: GbapSession; onNavigate: (target: 'tasks' | 'notes' | 'files' | 'calendar' | 'workflows') => void };
type ViewFieldDraft = { fieldKey: string; visible: boolean; size: number };
type FilterDraft = { fieldKey: string; operand: string; value: string; groupKey: string | null };
type FilterGroupDraft = { key: string; parentKey: string | null; operator: 'AND' | 'OR'; position: number };
type SortDraft = { fieldKey: string; direction: 'ASC' | 'DESC' };
type GroupDraft = { fieldValue: string; visible: boolean; position: number };
type ViewDraft = {
  name: string;
  type: string;
  scope: 'PERSONAL' | 'WORKSPACE';
  fields: ViewFieldDraft[];
  anyFieldFilterValue: string;
  filterGroups: FilterGroupDraft[];
  filters: FilterDraft[];
  sorts: SortDraft[];
  groupField: string;
  hideEmptyGroups: boolean;
  groups: GroupDraft[];
  kanbanAggregateOperation: string;
  kanbanAggregateField: string;
  calendarField: string;
  calendarEndField: string;
  calendarLayout: string;
};
type ImportReport = { row: number; status: 'created' | 'updated' | 'failed'; detail: string };
type ImportState = { fileName: string; headers: string[]; rows: string[][]; mapping: Record<string, string>; report: ImportReport[] } | null;

const AUDIT_KEYS = new Set(['createdAt', 'updatedAt', 'deletedAt', 'createdBy', 'updatedBy']);
const FILTER_OPERANDS = ['IS', 'IS_NOT', 'CONTAINS', 'DOES_NOT_CONTAIN', 'IS_EMPTY', 'IS_NOT_EMPTY', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN_OR_EQUAL'];
const STANDARD_TARGET: Record<string, 'Account' | 'Contact' | 'Opportunity'> = { company: 'Account', person: 'Contact', opportunity: 'Opportunity' };
const VIEW_TYPE_LABELS: Record<string, string> = { TABLE: '表格', KANBAN: '看板', CALENDAR: '日历', LIST: '列表' };
const FILTER_OPERAND_LABELS: Record<string, string> = {
  IS: '等于', IS_NOT: '不等于', CONTAINS: '包含', DOES_NOT_CONTAIN: '不包含', IS_EMPTY: '为空', IS_NOT_EMPTY: '不为空', GREATER_THAN_OR_EQUAL: '大于或等于', LESS_THAN_OR_EQUAL: '小于或等于',
};
function viewTypeLabel(value: string) { return VIEW_TYPE_LABELS[value] ?? '视图'; }
function filterOperandLabel(value: string) { return FILTER_OPERAND_LABELS[value] ?? value; }
function importStatusLabel(value: ImportReport['status']) { return value === 'created' ? '新增' : value === 'updated' ? '更新' : '失败'; }
function contextFocusLabel(value?: string) {
  if (!value || value === 'TIMELINE') return '活动与协作';
  if (value === 'TASKS') return '任务';
  if (value === 'NOTES') return '笔记';
  if (value === 'FILES') return '文件';
  if (value === 'CALENDAR') return '日历';
  return '业务信息';
}

function errorMessage(cause: unknown, fallback: string) {
  const error = cause as { status?: number; body?: { error?: string; detail?: { attachments?: number } } };
  if (error.status === 401) return '登录状态已失效，请重新登录。';
  if (error.status === 403) return '当前账号没有执行此操作的权限。';
  if (error.status === 409 && error.body?.error === 'runtime_destroy_has_gbap_attachments') return `该记录仍有 ${error.body.detail?.attachments ?? 0} 个文件，永久销毁已阻止。`;
  if (error.status === 409) return '当前操作被记录关系或治理规则阻止。';
  return fallback;
}
function fieldOptions(field?: CrmRuntimeField) {
  return (Array.isArray(field?.options) ? field!.options : []).map((item) => typeof item === 'string' ? { label: item, value: item } : {
    label: String((item as { label?: unknown }).label ?? (item as { value?: unknown }).value ?? ''),
    value: String((item as { value?: unknown }).value ?? (item as { label?: unknown }).label ?? ''),
  }).filter((item) => item.value);
}
function objectValue(value: unknown) { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function fullName(value: unknown) { const row = objectValue(value); return [row.firstName, row.lastName].filter(Boolean).join(' '); }
function display(field: CrmRuntimeField | undefined, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field?.relation) return '已关联';
  const row = objectValue(value);
  switch (field?.type) {
    case 'FULL_NAME': return fullName(value) || '—';
    case 'EMAILS': return `${row.primaryEmail ?? '—'}${Array.isArray(row.additionalEmails) && row.additionalEmails.length ? ` +${row.additionalEmails.length}` : ''}`;
    case 'PHONES': return `${row.primaryPhoneCallingCode ?? ''}${row.primaryPhoneNumber ?? '—'}${Array.isArray(row.additionalPhones) && row.additionalPhones.length ? ` +${row.additionalPhones.length}` : ''}`;
    case 'LINKS': case 'DOMAIN': return `${row.primaryLinkUrl ?? '—'}${Array.isArray(row.secondaryLinks) && row.secondaryLinks.length ? ` +${row.secondaryLinks.length}` : ''}`;
    case 'CURRENCY': return row.amountMicros == null ? '—' : `${row.currencyCode ?? ''} ${(Number(row.amountMicros) / 1_000_000).toLocaleString('zh-CN')}`.trim();
    case 'ADDRESS': return [row.addressCountry, row.addressState, row.addressCity, row.addressStreet1].filter(Boolean).join(' · ') || '—';
    case 'BOOLEAN': return value ? '是' : '否';
    case 'MULTI_SELECT': return Array.isArray(value) ? value.join('、') : String(value);
    case 'DATE_TIME': return dateTimeLocalValue(value).replace('T', ' ') || '—';
    case 'RICH_TEXT': return richTextMarkdown(value) || '—';
    default: return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}
function labelField(object: CrmRuntimeObject) { return object.fields.find((field) => ['name', 'title'].includes(field.fieldKey)) ?? object.fields.find((field) => !field.system && ['TEXT', 'FULL_NAME'].includes(field.type)) ?? object.fields[0]; }
function titleOf(object: CrmRuntimeObject, record: CrmRuntimeRecord) { const field = labelField(object); return field ? display(field, record.values[field.fieldKey]) : record.businessId.slice(0, 8); }
function filterMatches(record: CrmRuntimeRecord, filter: FilterDraft | CrmRuntimeView['filters'][number]) {
  const value = record.values[filter.fieldKey]; const expected = filter.value;
  switch (filter.operand) {
    case 'IS_EMPTY': return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    case 'IS_NOT_EMPTY': return !(value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0));
    case 'CONTAINS': return String(value ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    case 'DOES_NOT_CONTAIN': return !String(value ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    case 'IS_NOT': return String(value ?? '') !== String(expected ?? '');
    case 'GREATER_THAN_OR_EQUAL': return Number(value) >= Number(expected);
    case 'LESS_THAN_OR_EQUAL': return Number(value) <= Number(expected);
    default: return String(value ?? '') === String(expected ?? '');
  }
}
function applyViewFilters(record: CrmRuntimeRecord, view: CrmRuntimeView | null) {
  if (!view || view.filters.length === 0) return true;
  const groups = new Map(view.filterGroups.map((group) => [group.key, group]));
  const filtersByGroup = new Map<string | null, CrmRuntimeView['filters']>();
  for (const filter of view.filters) { const list = filtersByGroup.get(filter.groupKey ?? null) ?? []; list.push(filter); filtersByGroup.set(filter.groupKey ?? null, list); }
  const childrenByParent = new Map<string | null, CrmRuntimeViewFilterGroup[]>();
  for (const group of view.filterGroups) { const list = childrenByParent.get(group.parentKey ?? null) ?? []; list.push(group); childrenByParent.set(group.parentKey ?? null, list); }
  const evaluateGroup = (key: string): boolean => {
    const group = groups.get(key); if (!group) return true;
    const values = [
      ...(filtersByGroup.get(key) ?? []).map((filter) => filterMatches(record, filter)),
      ...(childrenByParent.get(key) ?? []).map((child) => evaluateGroup(child.key)),
    ];
    if (values.length === 0) return true;
    return group.operator === 'OR' ? values.some(Boolean) : values.every(Boolean);
  };
  const rootValues = [
    ...(filtersByGroup.get(null) ?? []).map((filter) => filterMatches(record, filter)),
    ...(childrenByParent.get(null) ?? []).map((group) => evaluateGroup(group.key)),
  ];
  return rootValues.every(Boolean);
}
function visibleFields(object: CrmRuntimeObject, view: CrmRuntimeView | null) {
  const map = new Map(object.fields.map((field) => [field.fieldKey, field]));
  if (view?.fields?.length) return view.fields.filter((item) => item.visible).sort((a, b) => a.position - b.position).map((item) => map.get(item.fieldKey)).filter(Boolean) as CrmRuntimeField[];
  return object.fields.filter((field) => field.active && !field.system).slice(0, 12);
}
function applyView(records: CrmRuntimeRecord[], object: CrmRuntimeObject, view: CrmRuntimeView | null, search: string) {
  const needle = search.trim().toLowerCase();
  let output = records.filter((record) => applyViewFilters(record, view));
  if (needle) output = output.filter((record) => object.fields.some((field) => display(field, record.values[field.fieldKey]).toLowerCase().includes(needle)));
  if (view?.sorts?.length) output = [...output].sort((a, b) => {
    for (const sort of view.sorts) { const result = String(a.values[sort.fieldKey] ?? '').localeCompare(String(b.values[sort.fieldKey] ?? ''), 'zh-CN', { numeric: true }); if (result) return sort.direction === 'DESC' ? -result : result; }
    return 0;
  });
  return output;
}
function newFilterGroupKey() { return `fg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function emptyViewDraft(object: CrmRuntimeObject, isManager: boolean): ViewDraft {
  return {
    name: `${object.labelPlural}视图`, type: 'TABLE', scope: isManager ? 'WORKSPACE' : 'PERSONAL',
    fields: object.fields.filter((field) => field.active && !field.system).slice(0, 8).map((field) => ({ fieldKey: field.fieldKey, visible: true, size: 180 })),
    anyFieldFilterValue: '', filterGroups: [], filters: [], sorts: [], groupField: '', hideEmptyGroups: false, groups: [], kanbanAggregateOperation: '', kanbanAggregateField: '', calendarField: '', calendarEndField: '', calendarLayout: '',
  };
}
function draftFromView(object: CrmRuntimeObject, view: CrmRuntimeView): ViewDraft {
  return {
    name: view.name, type: view.type, scope: view.scope ?? 'WORKSPACE',
    fields: view.fields.length ? [...view.fields].sort((a, b) => a.position - b.position).map((field) => ({ fieldKey: field.fieldKey, visible: field.visible, size: field.size ?? 180 })) : object.fields.filter((field) => !field.system).map((field) => ({ fieldKey: field.fieldKey, visible: true, size: 180 })),
    anyFieldFilterValue: view.anyFieldFilterValue ?? '',
    filterGroups: view.filterGroups.map((group, position) => ({ key: group.key, parentKey: group.parentKey, operator: group.operator === 'OR' ? 'OR' : 'AND', position: group.position ?? position })),
    filters: view.filters.map((filter) => ({ fieldKey: filter.fieldKey, operand: filter.operand, value: typeof filter.value === 'string' ? filter.value : JSON.stringify(filter.value ?? ''), groupKey: filter.groupKey })),
    sorts: view.sorts.map((sort) => ({ fieldKey: sort.fieldKey, direction: sort.direction === 'DESC' ? 'DESC' : 'ASC' })),
    groupField: view.mainGroupByFieldKey ?? '', hideEmptyGroups: view.hideEmptyGroups, groups: [...view.groups].sort((a, b) => a.position - b.position).map((group, position) => ({ ...group, position })),
    kanbanAggregateOperation: view.kanbanAggregateOperation ?? '', kanbanAggregateField: view.kanbanAggregateFieldKey ?? '', calendarField: view.calendarFieldKey ?? '', calendarEndField: view.calendarEndFieldKey ?? '', calendarLayout: view.calendarLayout ?? '',
  };
}
function viewSpec(object: CrmRuntimeObject, draft: ViewDraft) {
  return {
    objectKey: object.objectKey, name: draft.name, type: draft.type, scope: draft.scope, anyFieldFilterValue: draft.anyFieldFilterValue || null,
    mainGroupByFieldKey: draft.type === 'KANBAN' ? draft.groupField || null : null, hideEmptyGroups: draft.hideEmptyGroups,
    kanbanAggregateOperation: draft.type === 'KANBAN' ? draft.kanbanAggregateOperation || null : null, kanbanAggregateFieldKey: draft.type === 'KANBAN' ? draft.kanbanAggregateField || null : null,
    calendarFieldKey: draft.type === 'CALENDAR' ? draft.calendarField || null : null, calendarEndFieldKey: draft.type === 'CALENDAR' ? draft.calendarEndField || null : null, calendarLayout: draft.type === 'CALENDAR' ? draft.calendarLayout || null : null,
    fields: draft.fields.map((field, position) => ({ fieldKey: field.fieldKey, visible: field.visible, position, size: field.size, aggregateOperation: null })),
    filterGroups: draft.filterGroups.map((group, position) => ({ key: group.key, parentKey: group.parentKey, operator: group.operator, position })),
    filters: draft.filters.filter((filter) => filter.fieldKey).map((filter, position) => ({ fieldKey: filter.fieldKey, operand: filter.operand, value: filter.value, groupKey: filter.groupKey, position, subFieldName: null })),
    sorts: draft.sorts.filter((sort) => sort.fieldKey).map((sort) => ({ fieldKey: sort.fieldKey, direction: sort.direction, subFieldName: null })),
    groups: draft.type === 'KANBAN' ? draft.groups.map((group, position) => ({ fieldValue: group.fieldValue, visible: group.visible, position })) : [],
  };
}
function toCsv(records: CrmRuntimeRecord[], object: CrmRuntimeObject) {
  const fields = object.fields.filter((field) => field.active && !AUDIT_KEYS.has(field.fieldKey));
  return [['businessId', ...fields.map((field) => field.fieldKey)].map(csvEscape).join(','), ...records.map((record) => [record.businessId, ...fields.map((field) => { const value = record.values[field.fieldKey]; return csvEscape(typeof value === 'object' ? JSON.stringify(value ?? null) : String(value ?? '')); })].join(','))].join('\r\n');
}
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) { if (ch === '\"' && text[i + 1] === '\"') { cell += '\"'; i += 1; } else if (ch === '\"') quoted = false; else cell += ch; }
    else if (ch === '\"') quoted = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; } else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  return rows.filter((item) => item.some((value) => value !== ''));
}
function importValue(field: CrmRuntimeField, raw: string): unknown {
  if (raw === '') return field.nullable ? null : '';
  if (field.relation) return { businessId: raw, objectKey: field.relation.targetObjectKey };
  if (['NUMBER', 'RATING'].includes(field.type)) return Number(raw);
  if (field.type === 'BOOLEAN') return ['true', '1', 'yes', '是'].includes(raw.toLowerCase());
  if (field.type === 'MULTI_SELECT') return raw.split(/[;,|]/).map((value) => value.trim()).filter(Boolean);
  if (['RAW_JSON', 'JSON', 'FULL_NAME', 'EMAILS', 'PHONES', 'LINKS', 'DOMAIN', 'ADDRESS', 'CURRENCY'].includes(field.type)) {
    try { return JSON.parse(raw); } catch {
      if (field.type === 'FULL_NAME') { const [firstName, ...rest] = raw.split(' '); return { firstName, lastName: rest.join(' ') }; }
      if (field.type === 'EMAILS') return { primaryEmail: raw, additionalEmails: [] };
      if (field.type === 'PHONES') return { primaryPhoneNumber: raw, primaryPhoneCountryCode: '', primaryPhoneCallingCode: '', additionalPhones: [] };
      if (field.type === 'LINKS' || field.type === 'DOMAIN') return { primaryLinkUrl: raw, primaryLinkLabel: '', secondaryLinks: [] };
    }
  }
  return raw;
}
function comparable(value: unknown) { return typeof value === 'object' ? JSON.stringify(value ?? null) : String(value ?? ''); }

export function CrmRuntimeWorkspaceV2({ session, onNavigate, customOnly = false }: Props) {
  const [objects, setObjects] = useState<CrmRuntimeObject[]>([]); const [views, setViews] = useState<CrmRuntimeView[]>([]); const [layouts, setLayouts] = useState<CrmRuntimeLayout[]>([]);
  const [objectKey, setObjectKey] = useState(customOnly ? '' : 'company'); const [viewKey, setViewKey] = useState(''); const [records, setRecords] = useState<CrmRuntimeRecord[]>([]); const [deleted, setDeleted] = useState(false);
  const [search, setSearch] = useState(''); const [selected, setSelected] = useState<CrmRuntimeRecord | null>(null); const [checked, setChecked] = useState<Set<string>>(new Set());
  const [editingRecord, setEditingRecord] = useState<'create' | 'edit' | null>(null); const [form, setForm] = useState<Record<string, unknown>>({});
  const [viewDraft, setViewDraft] = useState<ViewDraft | null>(null); const [editingViewKey, setEditingViewKey] = useState<string | null>(null);
  const [context, setContext] = useState<CrmRuntimeContext | null>(null); const [activeTab, setActiveTab] = useState(''); const [mergePreview, setMergePreview] = useState<CrmRuntimeMergePreview | null>(null);
  const [importState, setImportState] = useState<ImportState>(null); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const roles = session.identity?.roles ?? []; const isAdmin = roles.includes('substrate-admin'); const isManager = isAdmin || roles.includes('substrate-manager');
  const object = useMemo(() => objects.find((item) => item.objectKey === objectKey) ?? objects[0] ?? null, [objects, objectKey]);
  const objectViews = useMemo(() => object ? views.filter((item) => item.objectKey === object.objectKey).sort((a, b) => a.position - b.position) : [], [views, object]);
  const view = useMemo(() => objectViews.find((item) => item.viewKey === viewKey) ?? objectViews[0] ?? null, [objectViews, viewKey]);
  const layout = useMemo(() => object ? layouts.find((item) => item.objectKey === object.objectKey) ?? null : null, [layouts, object]);
  const displayed = useMemo(() => object ? applyView(records, object, view, search) : [], [records, object, view, search]);
  const tableFields = useMemo(() => object ? visibleFields(object, view) : [], [object, view]);

  const loadMetadata = useCallback(async (refresh = false) => {
    if (session.status !== 'authenticated') return; setLoading(true); setError(null);
    try {
      const [schema, viewData, layoutData] = await Promise.all([getCrmRuntimeSchema(refresh), getCrmRuntimeViews(), getCrmRuntimeLayouts()]);
      const usable = schema.objects.filter((item) => item.active && !item.system && (!customOnly || item.custom === true) && !['view', 'viewField'].includes(item.objectKey)); setObjects(usable); setViews(viewData.views); setLayouts(layoutData.layouts);
      setObjectKey((current) => usable.some((item) => item.objectKey === current) ? current : usable.find((item) => item.objectKey === 'company')?.objectKey ?? usable[0]?.objectKey ?? '');
    } catch (cause) { setError(errorMessage(cause, '业务结构加载失败。')); } finally { setLoading(false); }
  }, [session.status, customOnly]);
  const loadRecords = useCallback(async () => {
    if (session.status !== 'authenticated' || !objectKey) return; setLoading(true); setError(null);
    try { const data = await listCrmRuntimeRecords(objectKey, { limit: 500, deleted }); setRecords(data.records); setChecked(new Set()); setSelected((current) => current ? data.records.find((item) => item.businessId === current.businessId) ?? null : null); }
    catch (cause) { setError(errorMessage(cause, '记录加载失败。')); } finally { setLoading(false); }
  }, [session.status, objectKey, deleted]);
  const loadContext = useCallback(async () => {
    if (!object || !selected || deleted) { setContext(null); return; }
    try { setContext(await getCrmRuntimeContext(object.objectKey, selected.businessId)); } catch { setContext(null); }
  }, [object, selected, deleted]);
  useEffect(() => { void loadMetadata(); }, [loadMetadata]); useEffect(() => { void loadRecords(); }, [loadRecords]); useEffect(() => { void loadContext(); }, [loadContext]);
  useEffect(() => { setViewKey(objectViews[0]?.viewKey ?? ''); setSelected(null); setChecked(new Set()); setEditingRecord(null); setViewDraft(null); setMergePreview(null); }, [objectKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveRecord = async (event: React.FormEvent) => {
    event.preventDefault(); if (!object || busy) return; setBusy(true); setError(null);
    try {
      const editable = new Set(object.fields.filter((field) => field.uiEditable && !field.system).map((field) => field.fieldKey)); const payload = Object.fromEntries(Object.entries(form).filter(([key]) => editable.has(key)));
      if (editingRecord === 'create') await createCrmRuntimeRecord(object.objectKey, payload); else if (selected) await updateCrmRuntimeRecord(object.objectKey, selected.businessId, payload);
      setEditingRecord(null); setNotice('记录已保存。'); await loadRecords();
    } catch (cause) { setError(errorMessage(cause, '记录保存失败。')); } finally { setBusy(false); }
  };
  const saveView = async () => {
    if (!object || !viewDraft) return; setBusy(true); setError(null);
    try { const spec = viewSpec(object, viewDraft); const result = editingViewKey ? await updateCrmRuntimeView(editingViewKey, spec) : await createCrmRuntimeView(spec); await loadMetadata(true); setViewKey(result.viewKey); setViewDraft(null); setEditingViewKey(null); setNotice('业务视图已保存。'); }
    catch (cause) { setError(errorMessage(cause, '视图保存失败。')); } finally { setBusy(false); }
  };
  const removeView = async () => {
    if (!editingViewKey || !window.confirm('删除当前视图？')) return; setBusy(true);
    try { await deleteCrmRuntimeView(editingViewKey); await loadMetadata(true); setViewDraft(null); setEditingViewKey(null); setNotice('视图已删除。'); }
    catch (cause) { setError(errorMessage(cause, '视图删除失败。')); } finally { setBusy(false); }
  };
  const requestMergePreview = async () => {
    if (!object || !isManager || checked.size < 2) return; const ids = [...checked]; const survivor = selected && checked.has(selected.businessId) ? selected.businessId : ids[0]; setBusy(true); setError(null);
    try { setMergePreview(await previewCrmRuntimeMerge(object.objectKey, ids, survivor)); } catch (cause) { setError(errorMessage(cause, '合并预览失败。')); } finally { setBusy(false); }
  };
  const commitMerge = async () => {
    if (!object || !mergePreview) return; setBusy(true);
    try { await mergeCrmRuntimeRecords(object.objectKey, mergePreview.sourceBusinessIds, mergePreview.survivorBusinessId); setMergePreview(null); setSelected(null); await loadRecords(); setNotice('重复记录已合并。'); }
    catch (cause) { setError(errorMessage(cause, '合并失败。')); } finally { setBusy(false); }
  };
  const bulkDelete = async () => { if (!object || checked.size === 0 || !window.confirm(`将 ${checked.size} 条记录移入回收站？`)) return; setBusy(true); try { for (const id of checked) await softDeleteCrmRuntimeRecord(object.objectKey, id); await loadRecords(); } catch (cause) { setError(errorMessage(cause, '批量删除失败。')); } finally { setBusy(false); } };
  const moveKanban = async (record: CrmRuntimeRecord, field: CrmRuntimeField, value: string) => { if (!object) return; setBusy(true); try { await updateCrmRuntimeRecord(object.objectKey, record.businessId, { [field.fieldKey]: value }); await loadRecords(); } catch (cause) { setError(errorMessage(cause, '阶段移动失败。')); } finally { setBusy(false); } };
  const exportCsv = () => { if (!object) return; const blob = new Blob(['\ufeff', toCsv(displayed, object)], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${object.objectPluralKey}-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const chooseCsv = async (file?: File) => { if (!file || !object) return; const matrix = parseCsv(await file.text()); if (matrix.length < 2) { setError('CSV 至少需要表头和一行数据。'); return; } const headers = matrix[0]; const mapping: Record<string, string> = {}; for (const header of headers) { if (header === 'businessId') mapping[header] = 'businessId'; else { const field = object.fields.find((item) => item.uiEditable && !item.system && (item.fieldKey === header || item.label === header)); if (field) mapping[header] = field.fieldKey; } } setImportState({ fileName: file.name, headers, rows: matrix.slice(1), mapping, report: [] }); };
  const runImport = async () => {
    if (!object || !importState) return; setBusy(true); const report: ImportReport[] = []; const fields = new Map(object.fields.map((field) => [field.fieldKey, field])); const uniqueFields = object.fields.filter((field) => field.unique && field.uiEditable && !field.system);
    try {
      const current = await listCrmRuntimeRecords(object.objectKey, { limit: 500 });
      for (let rowIndex = 0; rowIndex < importState.rows.slice(0, 500).length; rowIndex += 1) {
        const row = importState.rows[rowIndex]; const payload: Record<string, unknown> = {}; let businessId = '';
        importState.headers.forEach((header, index) => { const key = importState.mapping[header]; if (key === 'businessId') businessId = row[index] ?? ''; else { const field = fields.get(key); if (key && field) payload[key] = importValue(field, row[index] ?? ''); } });
        try {
          let target = businessId ? current.records.find((item) => item.businessId === businessId) : undefined;
          if (businessId && !target) throw new Error('记录 ID 不存在');
          if (!target) target = current.records.find((item) => uniqueFields.some((field) => payload[field.fieldKey] !== undefined && comparable(item.values[field.fieldKey]) === comparable(payload[field.fieldKey])));
          if (target) { await updateCrmRuntimeRecord(object.objectKey, target.businessId, payload); report.push({ row: rowIndex + 2, status: 'updated', detail: target.businessId }); }
          else { const created = await createCrmRuntimeRecord(object.objectKey, payload); report.push({ row: rowIndex + 2, status: 'created', detail: created.record.businessId }); }
        } catch (cause) { report.push({ row: rowIndex + 2, status: 'failed', detail: cause instanceof Error ? cause.message : '导入失败' }); }
      }
      setImportState((state) => state ? { ...state, report } : state); await loadRecords(); setNotice(`CSV 导入完成：新增 ${report.filter((item) => item.status === 'created').length}，更新 ${report.filter((item) => item.status === 'updated').length}，失败 ${report.filter((item) => item.status === 'failed').length}。`);
    } finally { setBusy(false); }
  };

  if (session.status !== 'authenticated') return <div className="real-empty">登录后可使用业务数据中心。</div>;
  return <section className="rtw-shell rtw-v2">
    <aside className="rtw-objects"><div className="rtw-brand"><strong>业务分类</strong><button onClick={() => void loadMetadata(true)}>刷新</button></div>{objects.map((item) => <button key={item.objectKey} className={item.objectKey === object?.objectKey ? 'active' : ''} onClick={() => { setObjectKey(item.objectKey); setDeleted(false); }}><span>{item.labelPlural}</span></button>)}</aside>
    <main className="rtw-main">
      <header className="rtw-head"><div><h2>{object?.labelPlural ?? (customOnly ? '自定义业务' : '业务数据中心')}</h2><p>集中查看和维护业务记录、关联关系、常用视图、客户上下文与协作信息。</p></div><div className="rtw-head-actions"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索当前分类…"/><button onClick={exportCsv}>导出 CSV</button>{!customOnly && <label className="rtw-file-button">导入 CSV<input type="file" accept=".csv,text/csv" hidden onChange={(event) => void chooseCsv(event.target.files?.[0])}/></label>}<button onClick={() => setDeleted((value) => !value)}>{deleted ? '返回记录' : '回收站'}</button>{!deleted && object?.uiCreatable && <button onClick={() => { setForm({}); setEditingRecord('create'); }}>+ 新建</button>}</div></header>
      {error && <div className="real-error">{error}</div>}{notice && <div className="real-success">{notice}</div>}
      {customOnly && !loading && !object && !error && <div className="real-empty">还没有可用的自定义业务分类。请在系统设置中打开“客户字段与分类”，创建项目等业务分类后刷新。</div>}
      {importState && object && <ImportPanel state={importState} setState={setImportState} object={object} busy={busy} onRun={runImport}/>} 
      {!deleted && object && <>
        <div className="rtw-viewbar"><div className="rtw-view-tabs">{objectViews.map((item) => <button key={item.viewKey} className={view?.viewKey === item.viewKey ? 'active' : ''} onClick={() => setViewKey(item.viewKey)}><span>{item.name}</span><small>{viewTypeLabel(item.type)} · {item.scope === 'PERSONAL' ? '个人视图' : '共享视图'}</small></button>)}</div><div className="rtw-view-actions"><button onClick={() => { setEditingViewKey(null); setViewDraft(emptyViewDraft(object, isManager)); }}>+ 新建视图</button>{view?.editable && <button onClick={() => { setEditingViewKey(view.viewKey); setViewDraft(draftFromView(object, view)); }}>编辑视图</button>}</div></div>
        {viewDraft && <ViewEditor draft={viewDraft} setDraft={setViewDraft} object={object} isManager={isManager} current={editingViewKey ? view : null} busy={busy} onSave={saveView} onDelete={removeView} onClose={() => { setViewDraft(null); setEditingViewKey(null); }}/>} 
        {editingRecord && <RecordEditor object={object} form={form} setForm={setForm} busy={busy} mode={editingRecord} onSave={saveRecord} onClose={() => setEditingRecord(null)}/>} 
        <BulkBar checked={checked} object={object} isManager={isManager} onClear={() => setChecked(new Set())} onDelete={bulkDelete} onMerge={requestMergePreview} onUpdate={async (field, value) => { setBusy(true); try { for (const id of checked) await updateCrmRuntimeRecord(object.objectKey, id, { [field.fieldKey]: value }); await loadRecords(); } catch (cause) { setError(errorMessage(cause, '批量更新失败。')); } finally { setBusy(false); } }}/>
        <RecordList object={object} view={view} fields={tableFields} records={displayed} loading={loading} selected={selected} checked={checked} setChecked={setChecked} onSelect={(record) => { setSelected(record); setEditingRecord(null); }} onMoveKanban={moveKanban}/>
        {selected && <RecordDetail object={object} record={selected} layout={layout} objects={objects} records={records} context={context} activeTab={activeTab} setActiveTab={setActiveTab} busy={busy} onEdit={() => { setForm({ ...selected.values }); setEditingRecord('edit'); }} onDelete={async () => { if (!window.confirm('移入回收站？之后可以恢复。')) return; setBusy(true); try { await softDeleteCrmRuntimeRecord(object.objectKey, selected.businessId); setSelected(null); await loadRecords(); } catch (cause) { setError(errorMessage(cause, '删除失败。')); } finally { setBusy(false); } }} onContextReload={loadContext} onNavigate={onNavigate}/>} 
      </>}
      {deleted && object && <Recycle object={object} records={displayed} isAdmin={isAdmin} onRestore={async (record) => { setBusy(true); try { await restoreCrmRuntimeRecord(object.objectKey, record.businessId); await loadRecords(); } catch (cause) { setError(errorMessage(cause, '恢复失败。')); } finally { setBusy(false); } }} onDestroy={async (record) => { if (!isAdmin || !window.confirm('永久销毁不可恢复，确认继续？')) return; setBusy(true); try { await destroyCrmRuntimeRecord(object.objectKey, record.businessId); await loadRecords(); } catch (cause) { setError(errorMessage(cause, '永久销毁失败。')); } finally { setBusy(false); } }}/>} 
      {mergePreview && object && <MergePreviewPanel object={object} records={records} preview={mergePreview} busy={busy} onCancel={() => setMergePreview(null)} onCommit={commitMerge}/>} 
    </main>
  </section>;
}

function RecordEditor({ object, form, setForm, busy, mode, onSave, onClose }: { object: CrmRuntimeObject; form: Record<string, unknown>; setForm: React.Dispatch<React.SetStateAction<Record<string, unknown>>>; busy: boolean; mode: 'create' | 'edit'; onSave: (event: React.FormEvent) => void; onClose: () => void }) {
  const fields = object.fields.filter((field) => field.uiEditable && !field.system);
  return <form className="rtw-editor" onSubmit={onSave}><header><strong>{mode === 'create' ? `新建${object.labelSingular}` : `编辑${object.labelSingular}`}</strong><button type="button" onClick={onClose}>关闭</button></header><div className="rtw-form-grid">{fields.map((field) => <CrmRuntimeFieldInput key={field.fieldKey} field={field} value={form[field.fieldKey]} onChange={(value) => setForm((current) => ({ ...current, [field.fieldKey]: value }))}/>)}</div><footer><button type="submit" disabled={busy}>{busy ? '保存中' : '保存'}</button></footer></form>;
}
function RecordList({ object, view, fields, records, loading, selected, checked, setChecked, onSelect, onMoveKanban }: { object: CrmRuntimeObject; view: CrmRuntimeView | null; fields: CrmRuntimeField[]; records: CrmRuntimeRecord[]; loading: boolean; selected: CrmRuntimeRecord | null; checked: Set<string>; setChecked: React.Dispatch<React.SetStateAction<Set<string>>>; onSelect: (record: CrmRuntimeRecord) => void; onMoveKanban: (record: CrmRuntimeRecord, field: CrmRuntimeField, value: string) => Promise<void> }) {
  const toggle = (id: string) => setChecked((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  if (view?.type === 'KANBAN' && view.mainGroupByFieldKey) {
    const field = object.fields.find((item) => item.fieldKey === view.mainGroupByFieldKey); const configured = fieldOptions(field); const groupMeta = new Map(view.groups.map((group) => [group.fieldValue, group]));
    const values = [...new Set([...configured.map((item) => item.value), ...records.map((record) => String(record.values[view.mainGroupByFieldKey!] ?? '未分组'))])].filter((value) => groupMeta.get(value)?.visible !== false).sort((a, b) => (groupMeta.get(a)?.position ?? 999) - (groupMeta.get(b)?.position ?? 999));
    return <div className="rtw-kanban">{values.map((value) => <section key={value}><header><strong>{configured.find((item) => item.value === value)?.label ?? value}</strong><span>{records.filter((record) => String(record.values[view.mainGroupByFieldKey!] ?? '未分组') === value).length}</span></header>{records.filter((record) => String(record.values[view.mainGroupByFieldKey!] ?? '未分组') === value).map((record) => <div className={`rtw-card ${selected?.businessId === record.businessId ? 'selected' : ''}`} key={record.businessId}><input type="checkbox" checked={checked.has(record.businessId)} onChange={() => toggle(record.businessId)}/><button onClick={() => onSelect(record)}><strong>{titleOf(object, record)}</strong></button>{field && configured.length > 0 && <select value={String(record.values[field.fieldKey] ?? '')} onChange={(event) => void onMoveKanban(record, field, event.target.value)}>{configured.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>}</div>)}</section>)}</div>;
  }
  if (view?.type === 'CALENDAR' && view.calendarFieldKey) {
    const rows = records.map((record) => ({ record, date: new Date(String(record.values[view.calendarFieldKey!] ?? '')) })).filter((item) => !Number.isNaN(item.date.getTime())).sort((a, b) => a.date.getTime() - b.date.getTime());
    return <div className="rtw-calendar">{rows.map(({ record, date }) => <div key={record.businessId}><input type="checkbox" checked={checked.has(record.businessId)} onChange={() => toggle(record.businessId)}/><button onClick={() => onSelect(record)}><time>{date.toLocaleString('zh-CN')}</time><strong>{titleOf(object, record)}</strong>{view.calendarEndFieldKey && record.values[view.calendarEndFieldKey] ? <small>至 {new Date(String(record.values[view.calendarEndFieldKey])).toLocaleString('zh-CN')}</small> : null}</button></div>)}</div>;
  }
  return <div className="rtw-table-wrap"><table className="rtw-table"><thead><tr><th><input type="checkbox" checked={records.length > 0 && records.every((record) => checked.has(record.businessId))} onChange={(event) => setChecked(event.target.checked ? new Set(records.map((record) => record.businessId)) : new Set())}/></th>{fields.map((field) => <th key={field.fieldKey} style={{ minWidth: view?.fields.find((item) => item.fieldKey === field.fieldKey)?.size ?? 120 }}>{field.label}</th>)}<th/></tr></thead><tbody>{records.map((record) => <tr key={record.businessId} className={selected?.businessId === record.businessId ? 'selected' : ''}><td><input type="checkbox" checked={checked.has(record.businessId)} onChange={() => toggle(record.businessId)}/></td>{fields.map((field) => <td key={field.fieldKey}>{display(field, record.values[field.fieldKey])}</td>)}<td><button onClick={() => onSelect(record)}>打开</button></td></tr>)}{!loading && records.length === 0 && <tr><td colSpan={fields.length + 2}>暂无记录。</td></tr>}</tbody></table></div>;
}
function BulkBar({ checked, object, isManager, onClear, onDelete, onMerge, onUpdate }: { checked: Set<string>; object: CrmRuntimeObject; isManager: boolean; onClear: () => void; onDelete: () => void; onMerge: () => void; onUpdate: (field: CrmRuntimeField, value: unknown) => Promise<void> }) {
  const [fieldKey, setFieldKey] = useState(''); const [value, setValue] = useState<unknown>(''); if (checked.size === 0) return null; const editable = object.fields.filter((field) => field.uiEditable && !field.system); const field = editable.find((item) => item.fieldKey === fieldKey);
  return <form className="rtw-bulk" onSubmit={(event) => { event.preventDefault(); if (field) void onUpdate(field, value); }}><strong>已选择 {checked.size} 条</strong><select aria-label="选择批量更新字段" value={fieldKey} onChange={(event) => { setFieldKey(event.target.value); setValue(''); }}><option value="">批量字段…</option>{editable.map((item) => <option key={item.fieldKey} value={item.fieldKey}>{item.label}</option>)}</select>{field && <div className="rtw-bulk-input"><CrmRuntimeFieldInput field={field} value={value} onChange={setValue}/></div>}<button type="submit" disabled={!field}>批量更新</button><button type="button" onClick={onDelete}>批量删除</button>{isManager && checked.size >= 2 && <button type="button" onClick={onMerge}>合并预览</button>}<button type="button" onClick={onClear}>取消选择</button></form>;
}
function ViewEditor({ draft, setDraft, object, isManager, current, busy, onSave, onDelete, onClose }: { draft: ViewDraft; setDraft: React.Dispatch<React.SetStateAction<ViewDraft | null>>; object: CrmRuntimeObject; isManager: boolean; current: CrmRuntimeView | null; busy: boolean; onSave: () => void; onDelete: () => void; onClose: () => void }) {
  const patch = (next: Partial<ViewDraft>) => setDraft((value) => value ? { ...value, ...next } : value);
  const groupField = object.fields.find((field) => field.fieldKey === draft.groupField);
  const configuredGroups = fieldOptions(groupField);
  const configuredLabel = new Map(configuredGroups.map((item) => [item.value, item.label]));
  const knownDraftValues = new Set(draft.groups.map((group) => group.fieldValue));
  const orderedGroups = [
    ...[...draft.groups].sort((a, b) => a.position - b.position),
    ...configuredGroups.filter((item) => !knownDraftValues.has(item.value)).map((item, index) => ({ fieldValue: item.value, visible: true, position: draft.groups.length + index })),
  ].map((group, position) => ({ ...group, position }));
  const syncGroups = (fieldKey: string) => {
    const field = object.fields.find((item) => item.fieldKey === fieldKey);
    const previous = new Map(draft.groups.map((group) => [group.fieldValue, group]));
    const groups = fieldOptions(field).map((item, index) => previous.get(item.value) ?? { fieldValue: item.value, visible: true, position: index }).sort((a, b) => a.position - b.position).map((item, position) => ({ ...item, position }));
    patch({ groupField: fieldKey, groups });
  };
  const invalidKanban = draft.type === 'KANBAN' && (!draft.groupField || (draft.kanbanAggregateOperation !== '' && draft.kanbanAggregateOperation !== 'COUNT' && !draft.kanbanAggregateField));
  const invalidCalendar = draft.type === 'CALENDAR' && !draft.calendarField;
  const invalidView = !draft.name.trim() || invalidKanban || invalidCalendar;
  return <section className="rtw-editor rtw-view-editor-v2"><header><div><strong>{current ? '编辑视图' : '新建视图'}</strong><small>配置字段、宽度、筛选组合、排序、看板和日历展示方式。</small></div><button onClick={onClose}>关闭</button></header>
    <div className="rtw-grid"><label>名称<input value={draft.name} onChange={(event) => patch({ name: event.target.value })}/></label><label>视图类型<select value={draft.type} onChange={(event) => patch({ type: event.target.value })}><option value="TABLE">表格</option><option value="KANBAN">看板</option><option value="CALENDAR">日历</option><option value="LIST">列表</option></select></label><label>范围<select value={draft.scope} onChange={(event) => patch({ scope: event.target.value as ViewDraft['scope'] })}><option value="PERSONAL">仅自己</option>{isManager && <option value="WORKSPACE">整个工作区</option>}</select></label><label>视图内搜索<input value={draft.anyFieldFilterValue} onChange={(event) => patch({ anyFieldFilterValue: event.target.value })}/></label></div>
    {draft.type === 'KANBAN' && <fieldset className="rtw-deep-config"><legend>看板</legend><label>分组字段<select value={draft.groupField} onChange={(event) => syncGroups(event.target.value)}><option value="">选择…</option>{object.fields.filter((field) => ['SELECT','RATING','BOOLEAN'].includes(field.type)).map((field) => <option key={field.fieldKey} value={field.fieldKey}>{field.label}</option>)}</select></label><label><input type="checkbox" checked={draft.hideEmptyGroups} onChange={(event) => patch({ hideEmptyGroups: event.target.checked })}/>隐藏空分组</label><label>汇总方式<select value={draft.kanbanAggregateOperation} onChange={(event) => patch({ kanbanAggregateOperation: event.target.value })}><option value="">无</option><option value="COUNT">计数</option><option value="SUM">求和</option><option value="AVG">平均值</option><option value="MIN">最小值</option><option value="MAX">最大值</option></select></label><label>汇总字段<select value={draft.kanbanAggregateField} onChange={(event) => patch({ kanbanAggregateField: event.target.value })}><option value="">无</option>{object.fields.filter((field) => ['NUMBER','CURRENCY','RATING'].includes(field.type)).map((field) => <option key={field.fieldKey} value={field.fieldKey}>{field.label}</option>)}</select></label><div className="rtw-group-list">{orderedGroups.map((group, index) => <div key={group.fieldValue}><label><input type="checkbox" checked={group.visible} onChange={(event) => patch({ groups: orderedGroups.map((item) => item.fieldValue === group.fieldValue ? { ...item, visible: event.target.checked } : item) })}/>{configuredLabel.get(group.fieldValue) ?? group.fieldValue}</label><button disabled={index === 0} onClick={() => { if (index === 0) return; const next = [...orderedGroups]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; patch({ groups: next.map((item, position) => ({ ...item, position })) }); }}>↑</button><button disabled={index >= orderedGroups.length - 1} onClick={() => { if (index >= orderedGroups.length - 1) return; const next = [...orderedGroups]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; patch({ groups: next.map((item, position) => ({ ...item, position })) }); }}>↓</button></div>)}</div>{invalidKanban && <small>看板必须选择分组字段；求和、平均值、最小值或最大值还需要选择汇总字段。</small>}</fieldset>}
    {draft.type === 'CALENDAR' && <fieldset className="rtw-deep-config"><legend>日历</legend><label>开始字段<select value={draft.calendarField} onChange={(event) => patch({ calendarField: event.target.value })}><option value="">选择…</option>{object.fields.filter((field) => ['DATE','DATE_TIME'].includes(field.type)).map((field) => <option key={field.fieldKey} value={field.fieldKey}>{field.label}</option>)}</select></label><label>结束字段<select value={draft.calendarEndField} onChange={(event) => patch({ calendarEndField: event.target.value })}><option value="">无</option>{object.fields.filter((field) => ['DATE','DATE_TIME'].includes(field.type)).map((field) => <option key={field.fieldKey} value={field.fieldKey}>{field.label}</option>)}</select></label><label>布局<select value={draft.calendarLayout} onChange={(event) => patch({ calendarLayout: event.target.value })}><option value="">默认（月）</option><option value="MONTH">月</option><option value="WEEK">周</option><option value="DAY">日</option></select></label>{invalidCalendar && <small>日历视图必须选择开始时间字段。</small>}</fieldset>}
    <fieldset className="rtw-deep-fields"><legend>字段 / 顺序 / 宽度</legend>{draft.fields.map((item, index) => { const field = object.fields.find((candidate) => candidate.fieldKey === item.fieldKey); return <div key={item.fieldKey}><label><input type="checkbox" checked={item.visible} onChange={(event) => patch({ fields: draft.fields.map((value, i) => i === index ? { ...value, visible: event.target.checked } : value) })}/>{field?.label ?? item.fieldKey}</label><input type="number" min={80} max={600} value={item.size} onChange={(event) => patch({ fields: draft.fields.map((value, i) => i === index ? { ...value, size: Number(event.target.value) || 180 } : value) })}/><button onClick={() => { if (index === 0) return; const next = [...draft.fields]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; patch({ fields: next }); }}>↑</button><button onClick={() => { if (index >= draft.fields.length - 1) return; const next = [...draft.fields]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; patch({ fields: next }); }}>↓</button></div>; })}</fieldset>
    <FilterGroupEditor draft={draft} patch={patch}/><FilterEditor draft={draft} patch={patch} fields={object.fields}/><SortEditor rows={draft.sorts} fields={object.fields} onChange={(sorts) => patch({ sorts })}/>
    <footer><button disabled={busy || invalidView} onClick={onSave}>{busy ? '保存中' : '保存视图'}</button>{current?.editable && <button className="danger" onClick={onDelete}>删除视图</button>}</footer>
  </section>;
}
function FilterGroupEditor({ draft, patch }: { draft: ViewDraft; patch: (next: Partial<ViewDraft>) => void }) {
  return <fieldset className="rtw-rules"><legend>条件组合（全部 / 任一，可嵌套）</legend>{draft.filterGroups.map((group, index) => <div key={group.key} className="rtw-filter-group-row"><code>{group.key.slice(-8)}</code><select value={group.operator} onChange={(event) => patch({ filterGroups: draft.filterGroups.map((item, i) => i === index ? { ...item, operator: event.target.value as 'AND' | 'OR' } : item) })}><option value="AND">全部满足</option><option value="OR">任一满足</option></select><select value={group.parentKey ?? ''} onChange={(event) => patch({ filterGroups: draft.filterGroups.map((item, i) => i === index ? { ...item, parentKey: event.target.value || null } : item) })}><option value="">根级</option>{draft.filterGroups.filter((item) => item.key !== group.key).map((item) => <option key={item.key} value={item.key}>{item.key.slice(-8)} · {item.operator === 'OR' ? '任一满足' : '全部满足'}</option>)}</select><button onClick={() => patch({ filterGroups: draft.filterGroups.filter((_, i) => i !== index), filters: draft.filters.map((filter) => filter.groupKey === group.key ? { ...filter, groupKey: null } : filter) })}>移除</button></div>)}<button onClick={() => patch({ filterGroups: [...draft.filterGroups, { key: newFilterGroupKey(), parentKey: null, operator: 'AND', position: draft.filterGroups.length }] })}>+ 条件组合</button></fieldset>;
}
function FilterEditor({ draft, patch, fields }: { draft: ViewDraft; patch: (next: Partial<ViewDraft>) => void; fields: CrmRuntimeField[] }) {
  return <fieldset className="rtw-rules"><legend>筛选条件</legend>{draft.filters.map((row, index) => <div key={index} className="rtw-filter-row-v2"><select value={row.groupKey ?? ''} onChange={(event) => patch({ filters: draft.filters.map((item, i) => i === index ? { ...item, groupKey: event.target.value || null } : item) })}><option value="">根级（全部满足）</option>{draft.filterGroups.map((group) => <option key={group.key} value={group.key}>{group.key.slice(-8)} · {group.operator === 'OR' ? '任一满足' : '全部满足'}</option>)}</select><select value={row.fieldKey} onChange={(event) => patch({ filters: draft.filters.map((item, i) => i === index ? { ...item, fieldKey: event.target.value } : item) })}><option value="">字段…</option>{fields.map((field) => <option key={field.fieldKey} value={field.fieldKey}>{field.label}</option>)}</select><select value={row.operand} onChange={(event) => patch({ filters: draft.filters.map((item, i) => i === index ? { ...item, operand: event.target.value } : item) })}>{FILTER_OPERANDS.map((operand) => <option key={operand} value={operand}>{filterOperandLabel(operand)}</option>)}</select><input value={row.value} onChange={(event) => patch({ filters: draft.filters.map((item, i) => i === index ? { ...item, value: event.target.value } : item) })}/><button onClick={() => patch({ filters: draft.filters.filter((_, i) => i !== index) })}>移除</button></div>)}<button onClick={() => patch({ filters: [...draft.filters, { fieldKey: '', operand: 'IS', value: '', groupKey: null }] })}>+ 筛选条件</button></fieldset>;
}
function SortEditor({ rows, fields, onChange }: { rows: SortDraft[]; fields: CrmRuntimeField[]; onChange: (rows: SortDraft[]) => void }) { return <fieldset className="rtw-rules"><legend>排序</legend>{rows.map((row, index) => <div key={index}><select value={row.fieldKey} onChange={(event) => onChange(rows.map((item, i) => i === index ? { ...item, fieldKey: event.target.value } : item))}><option value="">字段…</option>{fields.map((field) => <option key={field.fieldKey} value={field.fieldKey}>{field.label}</option>)}</select><select value={row.direction} onChange={(event) => onChange(rows.map((item, i) => i === index ? { ...item, direction: event.target.value as 'ASC' | 'DESC' } : item))}><option value="ASC">升序</option><option value="DESC">降序</option></select><button onClick={() => onChange(rows.filter((_, i) => i !== index))}>移除</button></div>)}<button onClick={() => onChange([...rows, { fieldKey: '', direction: 'ASC' }])}>+ 排序</button></fieldset>; }
function ImportPanel({ state, setState, object, busy, onRun }: { state: NonNullable<ImportState>; setState: React.Dispatch<React.SetStateAction<ImportState>>; object: CrmRuntimeObject; busy: boolean; onRun: () => void }) {
  const editable = object.fields.filter((field) => field.uiEditable && !field.system); return <section className="rtw-import"><header><div><strong>导入 {state.fileName}</strong><small>{state.rows.length} 行 · 记录 ID 或唯一字段匹配时自动更新，否则新增</small></div><button onClick={() => setState(null)}>关闭</button></header><div className="rtw-mapping">{state.headers.map((header) => <label key={header}><span>{header === 'businessId' ? '记录 ID' : header}</span><select value={state.mapping[header] ?? ''} onChange={(event) => setState((current) => current ? { ...current, mapping: { ...current.mapping, [header]: event.target.value } } : current)}><option value="">忽略</option>{header === 'businessId' && <option value="businessId">记录 ID（更新键）</option>}{editable.map((field) => <option key={field.fieldKey} value={field.fieldKey}>{field.label}{field.unique ? ' · 唯一字段' : ''}</option>)}</select></label>)}</div><button disabled={busy || !Object.values(state.mapping).some(Boolean)} onClick={onRun}>{busy ? '处理中' : '开始导入'}</button>{state.report.length > 0 && <div className="rtw-import-report">{state.report.map((item) => <div key={`${item.row}-${item.detail}`} className={item.status}><span>第 {item.row} 行</span><strong>{importStatusLabel(item.status)}</strong><small>{item.detail}</small></div>)}</div>}</section>;
}
function MergePreviewPanel({ object, records, preview, busy, onCancel, onCommit }: { object: CrmRuntimeObject; records: CrmRuntimeRecord[]; preview: CrmRuntimeMergePreview; busy: boolean; onCancel: () => void; onCommit: () => void }) {
  const survivor = records.find((record) => record.businessId === preview.survivorBusinessId); return <div className="rtw-modal-backdrop"><section className="rtw-merge-preview"><header><div><strong>重复记录合并预览</strong><small>当前仅预览，不会修改任何记录。</small></div><button onClick={onCancel}>关闭</button></header><p>将合并 <strong>{preview.sourceBusinessIds.length}</strong> 条记录，保留：<strong>{survivor ? titleOf(object, survivor) : '当前主记录'}</strong></p><h4>冲突字段</h4>{preview.conflicts.length === 0 ? <p>预览未发现字段冲突。</p> : <div className="rtw-conflicts">{preview.conflicts.map((conflict) => <div key={conflict.fieldKey}><strong>{object.fields.find((field) => field.fieldKey === conflict.fieldKey)?.label ?? conflict.fieldKey}</strong><span>保留值：{typeof conflict.chosenValue === 'object' ? JSON.stringify(conflict.chosenValue) : String(conflict.chosenValue ?? '—')}</span><small>{conflict.candidates.map((value) => typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')).join(' | ')}</small></div>)}</div>}<footer><button onClick={onCancel}>取消</button><button className="danger" disabled={busy} onClick={onCommit}>{busy ? '合并中' : '确认合并'}</button></footer></section></div>;
}
function Recycle({ object, records, isAdmin, onRestore, onDestroy }: { object: CrmRuntimeObject; records: CrmRuntimeRecord[]; isAdmin: boolean; onRestore: (record: CrmRuntimeRecord) => void; onDestroy: (record: CrmRuntimeRecord) => void }) { return <section className="rtw-recycle"><h3>回收站</h3>{records.map((record) => <div key={record.businessId}><span><strong>{titleOf(object, record)}</strong></span><button onClick={() => onRestore(record)}>恢复</button>{isAdmin && <button className="danger" onClick={() => onDestroy(record)}>永久销毁</button>}</div>)}{records.length === 0 && <p>回收站为空。</p>}</section>; }
function RecordDetail({ object, record, layout, objects, records, context, activeTab, setActiveTab, busy, onEdit, onDelete, onContextReload, onNavigate }: { object: CrmRuntimeObject; record: CrmRuntimeRecord; layout: CrmRuntimeLayout | null; objects: CrmRuntimeObject[]; records: CrmRuntimeRecord[]; context: CrmRuntimeContext | null; activeTab: string; setActiveTab: (value: string) => void; busy: boolean; onEdit: () => void; onDelete: () => Promise<void>; onContextReload: () => Promise<void>; onNavigate: Props['onNavigate'] }) {
  const tabs = layout?.tabs ?? []; const tab = tabs.find((item) => item.tabKey === activeTab) ?? tabs[0]; useEffect(() => { if (tabs.length && !activeTab) setActiveTab(tabs[0].tabKey); }, [tabs, activeTab, setActiveTab]);
  return <section className="rtw-detail"><header><div><span>{object.labelSingular}</span><h3>{titleOf(object, record)}</h3><small>记录编号 · {record.businessId.slice(0, 8)}</small></div><div><button onClick={onEdit}>编辑</button><button className="danger" disabled={busy} onClick={() => void onDelete()}>移入回收站</button></div></header>{tabs.length > 0 && <nav>{tabs.map((item) => <button key={item.tabKey} className={tab?.tabKey === item.tabKey ? 'active' : ''} onClick={() => setActiveTab(item.tabKey)}>{item.title}</button>)}</nav>}<div className="rtw-widgets">{tab?.widgets?.length ? tab.widgets.map((widget) => <Widget key={widget.widgetKey} widget={widget} object={object} record={record} objects={objects} records={records} context={context} onContextReload={onContextReload} onNavigate={onNavigate}/>) : <><FieldsWidget object={object} record={record}/><ContextWidget object={object} record={record} context={context} onContextReload={onContextReload} onNavigate={onNavigate}/><RelatedWidget object={object} record={record} objects={objects}/></>}</div></section>;
}
function FieldsWidget({ object, record }: { object: CrmRuntimeObject; record: CrmRuntimeRecord }) { return <article className="rtw-widget"><h4>业务信息</h4><div className="rtw-properties">{object.fields.filter((field) => field.active && !AUDIT_KEYS.has(field.fieldKey)).map((field) => <div key={field.fieldKey}><span>{field.label}</span><strong>{display(field, record.values[field.fieldKey])}</strong></div>)}</div><details><summary>变更信息</summary><div className="rtw-properties">{object.fields.filter((field) => AUDIT_KEYS.has(field.fieldKey)).map((field) => <div key={field.fieldKey}><span>{field.label}</span><strong>{display(field, record.values[field.fieldKey])}</strong></div>)}</div></details></article>; }
function Widget({ widget, object, record, objects, records, context, onContextReload, onNavigate }: { widget: CrmRuntimeWidget; object: CrmRuntimeObject; record: CrmRuntimeRecord; objects: CrmRuntimeObject[]; records: CrmRuntimeRecord[]; context: CrmRuntimeContext | null; onContextReload: () => Promise<void>; onNavigate: Props['onNavigate'] }) {
  const type = String(widget.configuration?.type ?? widget.type);
  if (['FIELDS','FIELD','FIELD_RICH_TEXT'].some((token) => type.includes(token))) return <FieldsWidget object={object} record={record}/>;
  if (['EMAILS','EMAIL_THREAD'].includes(type)) return null;
  if (['TASKS','NOTES','FILES','CALENDAR','TIMELINE'].includes(type)) return <ContextWidget object={object} record={record} context={context} onContextReload={onContextReload} onNavigate={onNavigate} focus={type}/>;
  if (['AGGREGATE_CHART','PIE_CHART','BAR_CHART','LINE_CHART'].includes(type)) return <ChartWidget widget={widget} object={object} records={records}/>;
  if (type === 'RECORD_TABLE' || type === 'VIEW') return <RelatedWidget object={object} record={record} objects={objects}/>;
  if (type === 'STANDALONE_RICH_TEXT') return <article className="rtw-widget"><h4>{widget.title || '说明'}</h4><p>{String((widget.configuration?.body as { markdown?: string })?.markdown ?? '')}</p></article>;
  if (type === 'IFRAME') return <article className="rtw-widget"><h4>{widget.title || '嵌入'}</h4>{widget.configuration?.url ? <a href={widget.configuration.url} target="_blank" rel="noreferrer">打开外部内容</a> : <p>暂未配置可打开的外部内容。</p>}</article>;
  if (type.includes('WORKFLOW')) return <article className="rtw-widget"><h4>{widget.title || '自动化'}</h4><button onClick={() => onNavigate('workflows')}>打开自动化中心</button></article>;
  return <article className="rtw-widget"><h4>{widget.title || '业务模块'}</h4><p>该模块已配置，但当前记录没有可展示的业务内容。</p></article>;
}
function ChartWidget({ widget, object, records }: { widget: CrmRuntimeWidget; object: CrmRuntimeObject; records: CrmRuntimeRecord[] }) { const config = widget.configuration; const groupKey = config?.groupByFieldKey ?? config?.primaryAxisFieldKey; const aggregateKey = config?.aggregateFieldKey; if (!groupKey) return <article className="rtw-widget"><h4>{widget.title || '指标'}</h4><div className="rtw-metric">{records.length}</div><small>{object.labelPlural}记录数</small></article>; const groups = new Map<string, number>(); for (const record of records) { const key = String(record.values[groupKey] ?? '未分组'); const value = aggregateKey ? Number(record.values[aggregateKey] ?? 0) : 1; groups.set(key, (groups.get(key) ?? 0) + (Number.isFinite(value) ? value : 0)); } const max = Math.max(1, ...groups.values()); return <article className="rtw-widget"><h4>{widget.title || '图表'}</h4><div className="rtw-chart">{[...groups.entries()].slice(0, 20).map(([key, value]) => <div key={key}><span>{key}</span><i style={{ width: `${Math.max(4, value / max * 100)}%` }}/><strong>{value.toLocaleString('zh-CN')}</strong></div>)}</div></article>; }
function RelatedWidget({ object, record, objects }: { object: CrmRuntimeObject; record: CrmRuntimeRecord; objects: CrmRuntimeObject[] }) {
  const [related, setRelated] = useState<Array<{ object: CrmRuntimeObject; records: CrmRuntimeRecord[] }>>([]); useEffect(() => { let cancelled = false; void (async () => { const result: Array<{ object: CrmRuntimeObject; records: CrmRuntimeRecord[] }> = []; for (const candidate of objects) { const relationFields = candidate.fields.filter((field) => field.relation?.targetObjectKey === object.objectKey); if (!relationFields.length) continue; try { const data = await listCrmRuntimeRecords(candidate.objectKey, { limit: 200 }); const matches = data.records.filter((item) => relationFields.some((field) => objectValue(item.values[field.fieldKey]).businessId === record.businessId)); if (matches.length) result.push({ object: candidate, records: matches }); } catch {} } if (!cancelled) setRelated(result); })(); return () => { cancelled = true; }; }, [object.objectKey, record.businessId, objects]); return <article className="rtw-widget"><h4>关联记录</h4>{related.flatMap((group) => group.records.map((item) => <div className="rtw-related" key={`${group.object.objectKey}:${item.businessId}`}><span>{group.object.labelSingular}</span><strong>{titleOf(group.object, item)}</strong></div>))}{related.length === 0 && <p>暂无反向关联记录。</p>}</article>;
}
function ContextWidget({ object, record, context, onContextReload, onNavigate, focus }: { object: CrmRuntimeObject; record: CrmRuntimeRecord; context: CrmRuntimeContext | null; onContextReload: () => Promise<void>; onNavigate: Props['onNavigate']; focus?: string }) {
  const [task, setTask] = useState(''); const [note, setNote] = useState(''); const targetType = STANDARD_TARGET[object.objectKey]; const showGeneral = !focus || focus === 'TIMELINE';
  return <article className="rtw-widget"><h4>{contextFocusLabel(focus)}</h4>{(showGeneral || focus === 'TASKS') && <section><div className="rtw-widget-title"><strong>任务</strong><button onClick={() => onNavigate('tasks')}>全部任务</button></div>{context?.tasks.map((item) => <div className="rtw-related" key={item.businessId ?? item.title}><span>{item.status ?? '任务'}</span><strong>{item.title ?? '任务'}</strong></div>)}{targetType && <div className="rtw-inline-create"><input value={task} onChange={(event) => setTask(event.target.value)} placeholder="新建关联任务"/><button disabled={!task.trim()} onClick={() => void (async () => { await createTask({ title: task, targets: [{ businessType: targetType, businessId: record.businessId }] }); setTask(''); await onContextReload(); })()}>添加</button></div>}</section>}{(showGeneral || focus === 'NOTES') && <section><div className="rtw-widget-title"><strong>笔记</strong><button onClick={() => onNavigate('notes')}>全部笔记</button></div>{context?.notes.map((item) => <div className="rtw-related" key={item.businessId ?? item.title}><span>笔记</span><strong>{item.title ?? '笔记'}</strong></div>)}{targetType && <div className="rtw-inline-create"><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="新建关联笔记"/><button disabled={!note.trim()} onClick={() => void (async () => { await createNote({ title: note, targets: [{ businessType: targetType, businessId: record.businessId }] }); setNote(''); await onContextReload(); })()}>添加</button></div>}</section>}{(showGeneral || focus === 'FILES') && <section><div className="rtw-widget-title"><strong>文件</strong><button onClick={() => onNavigate('files')}>文件中心</button></div>{context?.files.map((file) => <div className="rtw-related" key={file.id}><button onClick={() => void downloadCrmFile(file.id, file.fileName)}>{file.fileName}</button><small>{Math.ceil(file.sizeBytes / 1024)} KB</small><button onClick={() => void (async () => { await deleteCrmFile(file.id); await onContextReload(); })()}>删除</button></div>)}<label className="rtw-file-button">上传到当前记录<input type="file" hidden onChange={(event) => void (async () => { const file = event.target.files?.[0]; if (file) { await uploadCrmRuntimeFile(object.objectKey, record.businessId, file); await onContextReload(); } })()}/></label></section>}{focus === 'CALENDAR' && <section><div className="rtw-widget-title"><strong>内部日历</strong><button onClick={() => onNavigate('calendar')}>打开日历</button></div><p>在 GBAP 内部日历中查看和维护团队日程。</p></section>} {!targetType && (showGeneral || focus === 'TASKS' || focus === 'NOTES') && <small>自定义业务数据支持文件；任务和笔记关联当前仍只支持客户公司、联系人和商机。</small>}</article>;
}
