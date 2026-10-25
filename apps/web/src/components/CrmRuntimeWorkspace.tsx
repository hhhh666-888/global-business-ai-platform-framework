import { csvCell as csvEscape } from '../lib/csvCell';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { IconCalendar, IconLayoutKanban, IconLayoutList, IconPlus, IconRefresh, IconTrash } from 'twenty-ui/icon';
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
  restoreCrmRuntimeRecord,
  softDeleteCrmRuntimeRecord,
  updateCrmRuntimeRecord,
  updateCrmRuntimeView,
  uploadCrmRuntimeFile,
  type CrmRuntimeContext,
  type CrmRuntimeField,
  type CrmRuntimeLayout,
  type CrmRuntimeObject,
  type CrmRuntimeRecord,
  type CrmRuntimeView,
  type CrmRuntimeWidget,
} from '../lib/crmRuntimeClient';
import { createNote, createTask, deleteCrmFile, downloadCrmFile } from '../lib/gbapClient';
import { CrmRuntimeFieldInput } from './CrmRuntimeFieldInput';
import './crm-runtime-workspace.css';

type Props = { session: GbapSession; onNavigate: (target: 'tasks' | 'notes' | 'files' | 'calendar' | 'workflows') => void };
type EditorMode = 'create' | 'edit' | null;
type PanelMode = 'records' | 'deleted';
type ViewFieldDraft = { fieldKey: string; visible: boolean; size: number };
type ViewDraft = {
  name: string;
  type: string;
  scope: 'PERSONAL' | 'WORKSPACE';
  fields: ViewFieldDraft[];
  groupField: string;
  calendarField: string;
  calendarEndField: string;
  anyFieldFilterValue: string;
  hideEmptyGroups: boolean;
  filters: Array<{ fieldKey: string; operand: string; value: string }>;
  sorts: Array<{ fieldKey: string; direction: 'ASC' | 'DESC' }>;
};
type ImportReport = { row: number; status: 'created' | 'updated' | 'failed'; detail: string };
type ImportState = { fileName: string; headers: string[]; rows: string[][]; mapping: Record<string, string>; report: ImportReport[] } | null;

const AUDIT_KEYS = new Set(['createdAt', 'updatedAt', 'deletedAt', 'createdBy', 'updatedBy']);
const FILTER_OPERANDS = ['IS', 'IS_NOT', 'CONTAINS', 'DOES_NOT_CONTAIN', 'IS_EMPTY', 'IS_NOT_EMPTY', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN_OR_EQUAL'];
const VIEW_TYPES = ['TABLE', 'KANBAN', 'CALENDAR', 'LIST'];
const STANDARD_TARGET: Record<string, 'Account' | 'Contact' | 'Opportunity'> = { company: 'Account', person: 'Contact', opportunity: 'Opportunity' };

function message(cause: unknown, fallback: string) {
  const error = cause as { status?: number; body?: { error?: string; detail?: { attachments?: number } } };
  if (error.status === 401) return '登录状态已失效，请重新登录。';
  if (error.status === 403) return '当前账号没有执行此操作的权限。';
  if (error.status === 409 && error.body?.error === 'runtime_destroy_has_gbap_attachments') return `该记录仍有 ${error.body.detail?.attachments ?? 0} 个 GBAP 文件，永久销毁已阻止。请先处理文件。`;
  if (error.status === 409) return '当前操作被记录关系或治理规则阻止。';
  return fallback;
}
function options(field?: CrmRuntimeField) {
  return (Array.isArray(field?.options) ? field!.options : []).map((item) => typeof item === 'string' ? { label: item, value: item } : {
    label: String((item as { label?: unknown }).label ?? (item as { value?: unknown }).value ?? ''),
    value: String((item as { value?: unknown }).value ?? (item as { label?: unknown }).label ?? ''),
  }).filter((item) => item.value);
}
function fullName(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return String(value ?? '');
  const row = value as Record<string, unknown>;
  return [row.firstName, row.lastName].filter(Boolean).join(' ');
}
function compositePrimary(value: unknown, key: string) {
  return value && typeof value === 'object' && !Array.isArray(value) ? String((value as Record<string, unknown>)[key] ?? '') : String(value ?? '');
}
function display(field: CrmRuntimeField | undefined, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field?.relation && typeof value === 'object' && !Array.isArray(value)) return '已关联';
  switch (field?.type) {
    case 'FULL_NAME': return fullName(value) || '—';
    case 'EMAILS': { const row = value as Record<string, unknown>; const extra = Array.isArray(row?.additionalEmails) ? row.additionalEmails.length : 0; return `${compositePrimary(value, 'primaryEmail') || '—'}${extra ? ` +${extra}` : ''}`; }
    case 'PHONES': { const row = value as Record<string, unknown>; const extra = Array.isArray(row?.additionalPhones) ? row.additionalPhones.length : 0; return `${compositePrimary(value, 'primaryPhoneCallingCode')}${compositePrimary(value, 'primaryPhoneNumber') || '—'}${extra ? ` +${extra}` : ''}`; }
    case 'LINKS': case 'DOMAIN': { const row = value as Record<string, unknown>; const extra = Array.isArray(row?.secondaryLinks) ? row.secondaryLinks.length : 0; return `${compositePrimary(value, 'primaryLinkUrl') || '—'}${extra ? ` +${extra}` : ''}`; }
    case 'CURRENCY': { const row = value as Record<string, unknown>; return `${row?.currencyCode ?? ''} ${(Number(row?.amountMicros ?? 0) / 1_000_000).toLocaleString('zh-CN')}`.trim(); }
    case 'ADDRESS': { const row = value as Record<string, unknown>; return [row?.addressCountry, row?.addressState, row?.addressCity, row?.addressStreet1].filter(Boolean).join(' · ') || '—'; }
    case 'BOOLEAN': return value ? '是' : '否';
    case 'MULTI_SELECT': return Array.isArray(value) ? value.join('、') : String(value);
    default: return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}
function labelField(object: CrmRuntimeObject) {
  return object.fields.find((field) => ['name', 'title'].includes(field.fieldKey)) ?? object.fields.find((field) => !field.system && ['TEXT', 'FULL_NAME'].includes(field.type)) ?? object.fields[0];
}
function titleOf(object: CrmRuntimeObject, record: CrmRuntimeRecord) {
  const field = labelField(object);
  return field ? display(field, record.values[field.fieldKey]) : record.businessId.slice(0, 8);
}
function visibleFields(object: CrmRuntimeObject, view: CrmRuntimeView | null) {
  const map = new Map(object.fields.map((field) => [field.fieldKey, field]));
  if (view?.fields?.length) return view.fields.filter((item) => item.visible).sort((a, b) => a.position - b.position).map((item) => map.get(item.fieldKey)).filter(Boolean) as CrmRuntimeField[];
  return object.fields.filter((field) => field.active && !field.system).slice(0, 12);
}
function applyView(records: CrmRuntimeRecord[], object: CrmRuntimeObject, view: CrmRuntimeView | null, search: string) {
  const needle = search.trim().toLowerCase();
  let output = needle ? records.filter((record) => object.fields.some((field) => display(field, record.values[field.fieldKey]).toLowerCase().includes(needle))) : records;
  for (const filter of view?.filters ?? []) output = output.filter((record) => {
    const value = record.values[filter.fieldKey], expected = filter.value;
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
  });
  if (view?.sorts?.length) output = [...output].sort((a, b) => {
    for (const sort of view.sorts) {
      const result = String(a.values[sort.fieldKey] ?? '').localeCompare(String(b.values[sort.fieldKey] ?? ''), 'zh-CN', { numeric: true });
      if (result) return sort.direction === 'DESC' ? -result : result;
    }
    return 0;
  });
  return output;
}
function emptyDraft(object: CrmRuntimeObject, canWorkspace: boolean): ViewDraft {
  return {
    name: `${object.labelPlural}视图`, type: 'TABLE', scope: canWorkspace ? 'WORKSPACE' : 'PERSONAL',
    fields: object.fields.filter((field) => field.active && !field.system).slice(0, 8).map((field) => ({ fieldKey: field.fieldKey, visible: true, size: 180 })),
    groupField: '', calendarField: '', calendarEndField: '', anyFieldFilterValue: '', hideEmptyGroups: false, filters: [], sorts: [],
  };
}
function draftFromView(object: CrmRuntimeObject, view: CrmRuntimeView): ViewDraft {
  const fields = view.fields.length ? [...view.fields].sort((a, b) => a.position - b.position).map((field) => ({ fieldKey: field.fieldKey, visible: field.visible, size: field.size ?? 180 }))
    : object.fields.filter((field) => !field.system).map((field) => ({ fieldKey: field.fieldKey, visible: true, size: 180 }));
  return {
    name: view.name, type: view.type, scope: view.scope ?? 'WORKSPACE', fields,
    groupField: view.mainGroupByFieldKey ?? '', calendarField: view.calendarFieldKey ?? '', calendarEndField: view.calendarEndFieldKey ?? '',
    anyFieldFilterValue: view.anyFieldFilterValue ?? '', hideEmptyGroups: view.hideEmptyGroups,
    filters: view.filters.map((filter) => ({ fieldKey: filter.fieldKey, operand: filter.operand, value: typeof filter.value === 'string' ? filter.value : JSON.stringify(filter.value ?? '') })),
    sorts: view.sorts.map((sort) => ({ fieldKey: sort.fieldKey, direction: sort.direction === 'DESC' ? 'DESC' : 'ASC' })),
  };
}
function viewSpec(object: CrmRuntimeObject, draft: ViewDraft) {
  return {
    objectKey: object.objectKey, name: draft.name, type: draft.type, scope: draft.scope,
    anyFieldFilterValue: draft.anyFieldFilterValue || null,
    hideEmptyGroups: draft.hideEmptyGroups,
    mainGroupByFieldKey: draft.type === 'KANBAN' ? draft.groupField || null : null,
    calendarFieldKey: draft.type === 'CALENDAR' ? draft.calendarField || null : null,
    calendarEndFieldKey: draft.type === 'CALENDAR' ? draft.calendarEndField || null : null,
    fields: draft.fields.map((field, position) => ({ fieldKey: field.fieldKey, visible: field.visible, position, size: field.size, aggregateOperation: null })),
    filters: draft.filters.filter((filter) => filter.fieldKey).map((filter, position) => ({ ...filter, groupKey: null, position, subFieldName: null })),
    sorts: draft.sorts.filter((sort) => sort.fieldKey).map((sort) => ({ ...sort, subFieldName: null })),
  };
}
function toCsv(records: CrmRuntimeRecord[], object: CrmRuntimeObject) {
  const fields = object.fields.filter((field) => field.active && !AUDIT_KEYS.has(field.fieldKey));
  const lines = [['businessId', ...fields.map((field) => field.fieldKey)].map(csvEscape).join(',')];
  for (const record of records) lines.push([record.businessId, ...fields.map((field) => {
    const value = record.values[field.fieldKey];
    return csvEscape(typeof value === 'object' ? JSON.stringify(value ?? null) : String(value ?? ''));
  })].join(','));
  return lines.join('\r\n');
}
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
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
      return raw;
    }
  }
  return raw;
}
function comparable(value: unknown) { return typeof value === 'object' ? JSON.stringify(value ?? null) : String(value ?? ''); }

export function CrmRuntimeWorkspace({ session, onNavigate }: Props) {
  const [objects, setObjects] = useState<CrmRuntimeObject[]>([]);
  const [views, setViews] = useState<CrmRuntimeView[]>([]);
  const [layouts, setLayouts] = useState<CrmRuntimeLayout[]>([]);
  const [objectKey, setObjectKey] = useState('company');
  const [viewKey, setViewKey] = useState('');
  const [records, setRecords] = useState<CrmRuntimeRecord[]>([]);
  const [mode, setMode] = useState<PanelMode>('records');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CrmRuntimeRecord | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<EditorMode>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [viewEditor, setViewEditor] = useState(false);
  const [editingViewKey, setEditingViewKey] = useState<string | null>(null);
  const [viewDraft, setViewDraft] = useState<ViewDraft | null>(null);
  const [importState, setImportState] = useState<ImportState>(null);
  const [context, setContext] = useState<CrmRuntimeContext | null>(null);
  const [activeTab, setActiveTab] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const roles = session.identity?.roles ?? [];
  const isAdmin = roles.includes('substrate-admin');
  const isManager = isAdmin || roles.includes('substrate-manager');
  const object = useMemo(() => objects.find((item) => item.objectKey === objectKey) ?? objects[0] ?? null, [objects, objectKey]);
  const objectViews = useMemo(() => object ? views.filter((item) => item.objectKey === object.objectKey).sort((a, b) => a.position - b.position) : [], [views, object]);
  const view = useMemo(() => objectViews.find((item) => item.viewKey === viewKey) ?? objectViews[0] ?? null, [objectViews, viewKey]);
  const editingView = useMemo(() => editingViewKey ? views.find((item) => item.viewKey === editingViewKey) ?? null : null, [editingViewKey, views]);
  const layout = useMemo(() => object ? layouts.find((item) => item.objectKey === object.objectKey) ?? null : null, [layouts, object]);
  const displayed = useMemo(() => object ? applyView(records, object, view, search) : [], [records, object, view, search]);
  const tableFields = useMemo(() => object ? visibleFields(object, view) : [], [object, view]);

  const loadMetadata = useCallback(async (refresh = false) => {
    if (session.status !== 'authenticated') return;
    setLoading(true); setError(null);
    try {
      const [schema, viewData, layoutData] = await Promise.all([getCrmRuntimeSchema(refresh), getCrmRuntimeViews(), getCrmRuntimeLayouts()]);
      const usable = schema.objects.filter((item) => item.active && !['view', 'viewField'].includes(item.objectKey));
      setObjects(usable); setViews(viewData.views); setLayouts(layoutData.layouts);
      setObjectKey((current) => usable.some((item) => item.objectKey === current) ? current : usable.find((item) => item.objectKey === 'company')?.objectKey ?? usable[0]?.objectKey ?? '');
    } catch (cause) { setError(message(cause, 'CRM 元数据加载失败。')); }
    finally { setLoading(false); }
  }, [session.status]);
  const loadRecords = useCallback(async () => {
    if (session.status !== 'authenticated' || !objectKey) return;
    setLoading(true); setError(null);
    try {
      const data = await listCrmRuntimeRecords(objectKey, { limit: 500, deleted: mode === 'deleted' });
      setRecords(data.records); setChecked(new Set());
      setSelected((current) => current ? data.records.find((item) => item.businessId === current.businessId) ?? null : null);
    } catch (cause) { setError(message(cause, '记录加载失败。')); }
    finally { setLoading(false); }
  }, [session.status, objectKey, mode]);
  const loadContext = useCallback(async () => {
    if (!object || !selected || mode !== 'records') { setContext(null); return; }
    try { setContext(await getCrmRuntimeContext(object.objectKey, selected.businessId)); }
    catch { setContext(null); }
  }, [object?.objectKey, selected?.businessId, mode]);

  useEffect(() => { void loadMetadata(); }, [loadMetadata]);
  useEffect(() => { void loadRecords(); }, [loadRecords]);
  useEffect(() => { void loadContext(); }, [loadContext]);
  useEffect(() => {
    setViewKey(objectViews[0]?.viewKey ?? ''); setSelected(null); setChecked(new Set()); setEditor(null);
    setViewEditor(false); setEditingViewKey(null); setActiveTab(''); setImportState(null);
  }, [objectKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveRecord = async (event: React.FormEvent) => {
    event.preventDefault(); if (!object || busy) return;
    setBusy(true); setError(null);
    try {
      const editable = new Set(object.fields.filter((field) => field.uiEditable && !field.system).map((field) => field.fieldKey));
      const payload = Object.fromEntries(Object.entries(form).filter(([key]) => editable.has(key)));
      const result = editor === 'create' ? await createCrmRuntimeRecord(object.objectKey, payload) : selected ? await updateCrmRuntimeRecord(object.objectKey, selected.businessId, payload) : null;
      if (result?.record) setSelected(result.record);
      setEditor(null); setNotice('记录已保存。'); await loadRecords();
    } catch (cause) { setError(message(cause, '记录保存失败。')); }
    finally { setBusy(false); }
  };
  const removeRecord = async () => {
    if (!object || !selected || !window.confirm('移入回收站？之后可以恢复。')) return;
    setBusy(true);
    try { await softDeleteCrmRuntimeRecord(object.objectKey, selected.businessId); setSelected(null); setNotice('记录已移入回收站。'); await loadRecords(); }
    catch (cause) { setError(message(cause, '删除失败。')); }
    finally { setBusy(false); }
  };
  const restore = async (record: CrmRuntimeRecord) => {
    if (!object) return; setBusy(true);
    try { await restoreCrmRuntimeRecord(object.objectKey, record.businessId); await loadRecords(); }
    catch (cause) { setError(message(cause, '恢复失败。')); }
    finally { setBusy(false); }
  };
  const destroy = async (record: CrmRuntimeRecord) => {
    if (!object || !isAdmin || !window.confirm('永久销毁不可恢复，确认继续？')) return; setBusy(true);
    try { await destroyCrmRuntimeRecord(object.objectKey, record.businessId); await loadRecords(); }
    catch (cause) { setError(message(cause, '永久销毁失败。')); }
    finally { setBusy(false); }
  };
  const openViewEditor = (current: CrmRuntimeView | null) => {
    if (!object) return;
    setEditingViewKey(current?.viewKey ?? null); setViewDraft(current ? draftFromView(object, current) : emptyDraft(object, isManager)); setViewEditor(true);
  };
  const saveView = async () => {
    if (!object || !viewDraft) return; setBusy(true); setError(null);
    try {
      const spec = viewSpec(object, viewDraft);
      const result = editingViewKey ? await updateCrmRuntimeView(editingViewKey, spec) : await createCrmRuntimeView(spec);
      await loadMetadata(true); setViewKey(result.viewKey); setViewEditor(false); setEditingViewKey(null); setNotice('Twenty 原生 View 已保存。');
    } catch (cause) { setError(message(cause, 'View 保存失败。')); }
    finally { setBusy(false); }
  };
  const deleteView = async () => {
    if (!editingView?.editable || !window.confirm(`删除视图“${editingView.name}”？`)) return; setBusy(true);
    try { await deleteCrmRuntimeView(editingView.viewKey); await loadMetadata(true); setViewEditor(false); setEditingViewKey(null); setNotice('View 已删除。'); }
    catch (cause) { setError(message(cause, 'View 删除失败。')); }
    finally { setBusy(false); }
  };
  const bulkDelete = async () => {
    if (!object || checked.size === 0 || !window.confirm(`将 ${checked.size} 条记录移入回收站？`)) return;
    const count = checked.size; setBusy(true);
    try { for (const id of checked) await softDeleteCrmRuntimeRecord(object.objectKey, id); await loadRecords(); setNotice(`已处理 ${count} 条记录。`); }
    catch (cause) { setError(message(cause, '批量删除中断。')); }
    finally { setBusy(false); }
  };
  const bulkMerge = async () => {
    if (!object || !isManager || checked.size < 2) return;
    const ids = [...checked]; const survivor = selected && checked.has(selected.businessId) ? selected.businessId : ids[0];
    if (!window.confirm(`合并 ${ids.length} 条记录？\n保留当前选中记录（如未选则保留首条）。\n重复记录的 GBAP 文件会迁移到保留记录。`)) return;
    setBusy(true);
    try { await mergeCrmRuntimeRecords(object.objectKey, ids, survivor); setSelected(null); await loadRecords(); setNotice('重复记录已通过 Twenty 原生 Merge 合并。'); }
    catch (cause) { setError(message(cause, '合并失败。')); }
    finally { setBusy(false); }
  };
  const moveKanban = async (record: CrmRuntimeRecord, field: CrmRuntimeField, value: string) => {
    if (!object) return; setBusy(true); setError(null);
    try { await updateCrmRuntimeRecord(object.objectKey, record.businessId, { [field.fieldKey]: value }); await loadRecords(); setNotice(`${titleOf(object, record)} 已移动到新分组。`); }
    catch (cause) { setError(message(cause, 'Kanban 移动失败。')); }
    finally { setBusy(false); }
  };
  const exportCsv = () => {
    if (!object) return;
    const blob = new Blob(['\ufeff', toCsv(displayed, object)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${object.objectPluralKey}-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const chooseCsv = async (file?: File) => {
    if (!file || !object) return;
    const matrix = parseCsv(await file.text());
    if (matrix.length < 2) { setError('CSV 至少需要表头和一行数据。'); return; }
    const headers = matrix[0]; const editable = object.fields.filter((field) => field.uiEditable && !field.system); const mapping: Record<string, string> = {};
    for (const header of headers) {
      if (header === 'businessId') { mapping[header] = '__businessId'; continue; }
      const match = editable.find((field) => field.fieldKey === header || field.label === header); if (match) mapping[header] = match.fieldKey;
    }
    setImportState({ fileName: file.name, headers, rows: matrix.slice(1), mapping, report: [] });
  };
  const runImport = async () => {
    if (!object || !importState) return;
    setBusy(true); setError(null);
    const report: ImportReport[] = []; const fieldsByKey = new Map(object.fields.map((field) => [field.fieldKey, field])); const working = [...records];
    for (const [rowIndex, row] of importState.rows.slice(0, 500).entries()) {
      try {
        const payload: Record<string, unknown> = {}; let requestedBusinessId = '';
        importState.headers.forEach((header, index) => {
          const key = importState.mapping[header];
          if (key === '__businessId') { requestedBusinessId = (row[index] ?? '').trim(); return; }
          const field = fieldsByKey.get(key); if (key && field) payload[key] = importValue(field, row[index] ?? '');
        });
        let target = requestedBusinessId ? working.find((item) => item.businessId === requestedBusinessId) : undefined;
        if (requestedBusinessId && !target) throw new Error('businessId 不存在，未擅自创建新的 durable identity');
        if (!target) {
          const uniqueFields = object.fields.filter((field) => field.unique && Object.hasOwn(payload, field.fieldKey));
          if (uniqueFields.length) target = working.find((candidate) => uniqueFields.every((field) => comparable(candidate.values[field.fieldKey]) === comparable(payload[field.fieldKey])));
        }
        if (target) {
          const result = await updateCrmRuntimeRecord(object.objectKey, target.businessId, payload);
          const index = working.findIndex((item) => item.businessId === target!.businessId); if (index >= 0) working[index] = result.record;
          report.push({ row: rowIndex + 2, status: 'updated', detail: target.businessId });
        } else {
          const result = await createCrmRuntimeRecord(object.objectKey, payload); working.push(result.record);
          report.push({ row: rowIndex + 2, status: 'created', detail: result.record.businessId });
        }
      } catch (cause) { report.push({ row: rowIndex + 2, status: 'failed', detail: cause instanceof Error ? cause.message : '导入失败' }); }
    }
    setImportState((current) => current ? { ...current, report } : current);
    await loadRecords();
    const created = report.filter((item) => item.status === 'created').length, updated = report.filter((item) => item.status === 'updated').length, failed = report.filter((item) => item.status === 'failed').length;
    setNotice(`CSV Upsert 完成：新增 ${created}，更新 ${updated}，失败 ${failed}。`); setBusy(false);
  };

  if (session.status !== 'authenticated') return <div className="real-empty">登录后可使用完整 CRM。</div>;
  return <section className="rtw-shell">
    <aside className="rtw-objects"><div className="rtw-brand"><strong>CRM Objects</strong><button onClick={() => void loadMetadata(true)} title="刷新元数据"><IconRefresh size={15}/></button></div>{objects.map((item) => <button key={item.objectKey} className={item.objectKey === object?.objectKey ? 'active' : ''} onClick={() => { setObjectKey(item.objectKey); setMode('records'); }}><span>{item.labelPlural}</span><small>{item.objectKey}{item.system ? ' · system' : ''}</small></button>)}</aside>
    <main className="rtw-main">
      <header className="rtw-head"><div><span>Stage 3.5 · Twenty Metadata Runtime</span><h2>{object?.labelPlural ?? '完整 CRM'}</h2><p>{object?.description || '对象、字段、关系、视图和 Record Page 均来自当前 Twenty 元数据。'}</p></div><div className="rtw-head-actions"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索当前对象…"/><button onClick={exportCsv}>导出 CSV</button><label className="rtw-file-button">导入 / Upsert CSV<input type="file" accept=".csv,text/csv" hidden onChange={(event) => void chooseCsv(event.target.files?.[0])}/></label><button onClick={() => setMode(mode === 'records' ? 'deleted' : 'records')}><IconTrash size={14}/>{mode === 'records' ? '回收站' : '返回'}</button>{mode === 'records' && object?.uiCreatable && !object.system && <Button title={`新建${object.labelSingular}`} Icon={IconPlus} size="small" onClick={() => { setForm({}); setEditor('create'); }}/>}</div></header>
      {error && <div className="real-error">{error}</div>}{notice && <div className="real-success">{notice}</div>}
      {importState && object && <ImportPanel state={importState} setState={setImportState} object={object} busy={busy} onRun={runImport}/>} 
      {mode === 'records' && object && <>
        <div className="rtw-viewbar"><div className="rtw-view-tabs">{objectViews.map((item) => <button key={item.viewKey} className={view?.viewKey === item.viewKey ? 'active' : ''} onClick={() => setViewKey(item.viewKey)}>{item.type === 'KANBAN' ? <IconLayoutKanban size={14}/> : item.type === 'CALENDAR' ? <IconCalendar size={14}/> : <IconLayoutList size={14}/>}<span>{item.name}</span><small>{item.scope === 'PERSONAL' ? '个人' : '共享'}</small></button>)}</div><div className="rtw-view-actions"><button onClick={() => openViewEditor(null)}>+ 新建 View</button>{view?.editable && <button onClick={() => openViewEditor(view)}>编辑 View</button>}</div></div>
        {viewEditor && viewDraft && <ViewEditor draft={viewDraft} setDraft={setViewDraft} object={object} current={editingView} isManager={isManager} busy={busy} onSave={saveView} onDelete={deleteView} onClose={() => { setViewEditor(false); setEditingViewKey(null); }}/>} 
        {editor && <RecordEditor object={object} form={form} setForm={setForm} busy={busy} mode={editor} onSave={saveRecord} onClose={() => setEditor(null)}/>} 
        <BulkBar checked={checked} object={object} isManager={isManager} onClear={() => setChecked(new Set())} onDelete={bulkDelete} onMerge={bulkMerge} onUpdate={async (field, raw) => { const count = checked.size; setBusy(true); try { for (const id of checked) await updateCrmRuntimeRecord(object.objectKey, id, { [field.fieldKey]: importValue(field, raw) }); await loadRecords(); setNotice(`已批量更新 ${count} 条记录。`); } catch (cause) { setError(message(cause, '批量更新失败。')); } finally { setBusy(false); } }}/>
        <RecordList object={object} view={view} fields={tableFields} records={displayed} loading={loading} selected={selected} checked={checked} setChecked={setChecked} onSelect={(record) => { setSelected(record); setEditor(null); }} onMove={moveKanban}/>
        {selected && <RecordDetail object={object} record={selected} layout={layout} objects={objects} context={context} activeTab={activeTab} setActiveTab={setActiveTab} records={records} busy={busy} onEdit={() => { setForm({ ...selected.values }); setEditor('edit'); }} onDelete={removeRecord} onContextReload={loadContext} onNavigate={onNavigate}/>}</>}
      {mode === 'deleted' && object && <Recycle object={object} records={displayed} isAdmin={isAdmin} onRestore={restore} onDestroy={destroy}/>} 
    </main>
  </section>;
}

function RecordList({ object, view, fields, records, loading, selected, checked, setChecked, onSelect, onMove }: { object: CrmRuntimeObject; view: CrmRuntimeView | null; fields: CrmRuntimeField[]; records: CrmRuntimeRecord[]; loading: boolean; selected: CrmRuntimeRecord | null; checked: Set<string>; setChecked: React.Dispatch<React.SetStateAction<Set<string>>>; onSelect: (record: CrmRuntimeRecord) => void; onMove: (record: CrmRuntimeRecord, field: CrmRuntimeField, value: string) => Promise<void> }) {
  const toggle = (id: string) => setChecked((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  if (view?.type === 'KANBAN' && view.mainGroupByFieldKey) {
    const field = object.fields.find((item) => item.fieldKey === view.mainGroupByFieldKey);
    const configured = options(field).map((item) => item.value); const existing = records.map((record) => String(record.values[view.mainGroupByFieldKey!] ?? '未分组'));
    const values = [...new Set([...configured, ...existing])];
    return <div className="rtw-kanban">{values.map((value) => <section key={value}><header><strong>{options(field).find((item) => item.value === value)?.label ?? value}</strong><span>{records.filter((record) => String(record.values[view.mainGroupByFieldKey!] ?? '未分组') === value).length}</span></header>{records.filter((record) => String(record.values[view.mainGroupByFieldKey!] ?? '未分组') === value).map((record) => <div className={`rtw-card ${selected?.businessId === record.businessId ? 'selected' : ''}`} key={record.businessId}><input type="checkbox" checked={checked.has(record.businessId)} onChange={() => toggle(record.businessId)}/><button onClick={() => onSelect(record)}><strong>{titleOf(object, record)}</strong></button>{field && configured.length > 0 && <select aria-label="移动 Kanban 分组" value={String(record.values[field.fieldKey] ?? '')} onChange={(event) => void onMove(record, field, event.target.value)}>{options(field).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>}</div>)}</section>)}</div>;
  }
  if (view?.type === 'CALENDAR' && view.calendarFieldKey) {
    const rows = records.map((record) => ({ record, date: new Date(String(record.values[view.calendarFieldKey!] ?? '')) })).filter((item) => !Number.isNaN(item.date.getTime())).sort((a, b) => a.date.getTime() - b.date.getTime());
    return <div className="rtw-calendar">{rows.map(({ record, date }) => <div key={record.businessId}><input type="checkbox" checked={checked.has(record.businessId)} onChange={() => toggle(record.businessId)}/><button onClick={() => onSelect(record)}><time>{date.toLocaleDateString('zh-CN')}</time><strong>{titleOf(object, record)}</strong></button></div>)}</div>;
  }
  return <div className="rtw-table-wrap"><table className="rtw-table"><thead><tr><th><input type="checkbox" checked={records.length > 0 && records.every((record) => checked.has(record.businessId))} onChange={(event) => setChecked(event.target.checked ? new Set(records.map((record) => record.businessId)) : new Set())}/></th>{fields.map((field) => <th key={field.fieldKey} style={{ width: view?.fields.find((item) => item.fieldKey === field.fieldKey)?.size ?? undefined }}>{field.label}</th>)}<th/></tr></thead><tbody>{records.map((record) => <tr key={record.businessId} className={selected?.businessId === record.businessId ? 'selected' : ''}><td><input type="checkbox" checked={checked.has(record.businessId)} onChange={() => toggle(record.businessId)}/></td>{fields.map((field) => <td key={field.fieldKey}>{display(field, record.values[field.fieldKey])}</td>)}<td><button onClick={() => onSelect(record)}>打开</button></td></tr>)}{!loading && records.length === 0 && <tr><td colSpan={fields.length + 2}>暂无记录。</td></tr>}</tbody></table></div>;
}
function BulkBar({ checked, object, isManager, onClear, onDelete, onMerge, onUpdate }: { checked: Set<string>; object: CrmRuntimeObject; isManager: boolean; onClear: () => void; onDelete: () => void; onMerge: () => void; onUpdate: (field: CrmRuntimeField, raw: string) => Promise<void> }) {
  const [fieldKey, setFieldKey] = useState(''); const [value, setValue] = useState('');
  if (checked.size === 0) return null;
  const editable = object.fields.filter((field) => field.uiEditable && !field.system && !field.relation); const field = editable.find((item) => item.fieldKey === fieldKey);
  return <div className="rtw-bulk"><strong>已选择 {checked.size} 条</strong><select value={fieldKey} onChange={(event) => setFieldKey(event.target.value)}><option value="">批量字段…</option>{editable.map((item) => <option key={item.fieldKey} value={item.fieldKey}>{item.label}</option>)}</select><input value={value} onChange={(event) => setValue(event.target.value)} placeholder="新值 / JSON"/><button disabled={!field} onClick={() => field && void onUpdate(field, value)}>批量更新</button><button onClick={onDelete}>批量删除</button>{isManager && checked.size >= 2 && <button onClick={onMerge}>合并重复项</button>}<button onClick={onClear}>取消选择</button></div>;
}
function ViewEditor({ draft, setDraft, object, current, isManager, busy, onSave, onDelete, onClose }: { draft: ViewDraft; setDraft: React.Dispatch<React.SetStateAction<ViewDraft | null>>; object: CrmRuntimeObject; current: CrmRuntimeView | null; isManager: boolean; busy: boolean; onSave: () => void; onDelete: () => void; onClose: () => void }) {
  const patch = (next: Partial<ViewDraft>) => setDraft((value) => value ? { ...value, ...next } : value);
  const moveField = (index: number, delta: number) => { const target = index + delta; if (target < 0 || target >= draft.fields.length) return; const next = [...draft.fields]; [next[index], next[target]] = [next[target], next[index]]; patch({ fields: next }); };
  return <section className="rtw-editor"><header><div><strong>{current ? '编辑 Twenty View' : '新建 Twenty View'}</strong><small>字段、顺序、宽度、筛选、排序和分组会真正保存到 Twenty metadata。</small></div><button onClick={onClose}>关闭</button></header><div className="rtw-grid"><label>名称<input value={draft.name} onChange={(event) => patch({ name: event.target.value })}/></label><label>类型<select value={draft.type} onChange={(event) => patch({ type: event.target.value })}>{VIEW_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label><label>范围<select value={draft.scope} onChange={(event) => patch({ scope: event.target.value as ViewDraft['scope'] })}><option value="PERSONAL">仅自己</option>{isManager && <option value="WORKSPACE">整个工作区</option>}</select></label><label>View 内搜索<input value={draft.anyFieldFilterValue} onChange={(event) => patch({ anyFieldFilterValue: event.target.value })}/></label>{draft.type === 'KANBAN' && <><label>分组字段<select value={draft.groupField} onChange={(event) => patch({ groupField: event.target.value })}><option value="">选择…</option>{object.fields.filter((field) => ['SELECT', 'RATING', 'BOOLEAN'].includes(field.type)).map((field) => <option key={field.fieldKey} value={field.fieldKey}>{field.label}</option>)}</select></label><label className="rtw-check"><input type="checkbox" checked={draft.hideEmptyGroups} onChange={(event) => patch({ hideEmptyGroups: event.target.checked })}/>隐藏空分组</label></>}{draft.type === 'CALENDAR' && <><label>开始日期<select value={draft.calendarField} onChange={(event) => patch({ calendarField: event.target.value })}><option value="">选择…</option>{object.fields.filter((field) => ['DATE', 'DATE_TIME'].includes(field.type)).map((field) => <option key={field.fieldKey} value={field.fieldKey}>{field.label}</option>)}</select></label><label>结束日期<select value={draft.calendarEndField} onChange={(event) => patch({ calendarEndField: event.target.value })}><option value="">无</option>{object.fields.filter((field) => ['DATE', 'DATE_TIME'].includes(field.type)).map((field) => <option key={field.fieldKey} value={field.fieldKey}>{field.label}</option>)}</select></label></>}</div><fieldset className="rtw-field-picker"><legend>字段、顺序与宽度</legend>{draft.fields.map((item, index) => { const field = object.fields.find((candidate) => candidate.fieldKey === item.fieldKey); if (!field) return null; return <div key={item.fieldKey} className="rtw-field-row"><label><input type="checkbox" checked={item.visible} onChange={(event) => patch({ fields: draft.fields.map((row, i) => i === index ? { ...row, visible: event.target.checked } : row) })}/>{field.label}</label><input type="number" min={80} max={800} value={item.size} onChange={(event) => patch({ fields: draft.fields.map((row, i) => i === index ? { ...row, size: Math.max(80, Number(event.target.value) || 180) } : row) })}/><button type="button" onClick={() => moveField(index, -1)}>↑</button><button type="button" onClick={() => moveField(index, 1)}>↓</button></div>; })}</fieldset><RuleEditor rows={draft.filters} fields={object.fields} onChange={(rows) => patch({ filters: rows })}/><SortEditor rows={draft.sorts} fields={object.fields} onChange={(rows) => patch({ sorts: rows })}/><footer><Button title={busy ? '保存中' : '保存到 Twenty'} size="small" disabled={busy || !draft.name.trim()} onClick={onSave}/>{current?.editable && <button className="danger" onClick={onDelete}>删除 View</button>}</footer></section>;
}
function RuleEditor({ rows, fields, onChange }: { rows: ViewDraft['filters']; fields: CrmRuntimeField[]; onChange: (rows: ViewDraft['filters']) => void }) {
  return <fieldset className="rtw-rules"><legend>筛选（当前为 AND 条件）</legend>{rows.map((row, index) => <div key={index}><select value={row.fieldKey} onChange={(event) => onChange(rows.map((item, itemIndex) => itemIndex === index ? { ...item, fieldKey: event.target.value } : item))}><option value="">字段…</option>{fields.map((field) => <option key={field.fieldKey} value={field.fieldKey}>{field.label}</option>)}</select><select value={row.operand} onChange={(event) => onChange(rows.map((item, itemIndex) => itemIndex === index ? { ...item, operand: event.target.value } : item))}>{FILTER_OPERANDS.map((operand) => <option key={operand}>{operand}</option>)}</select><input value={row.value} onChange={(event) => onChange(rows.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))}/><button onClick={() => onChange(rows.filter((_, itemIndex) => itemIndex !== index))}>移除</button></div>)}<button onClick={() => onChange([...rows, { fieldKey: '', operand: 'IS', value: '' }])}>+ 筛选条件</button></fieldset>;
}
function SortEditor({ rows, fields, onChange }: { rows: ViewDraft['sorts']; fields: CrmRuntimeField[]; onChange: (rows: ViewDraft['sorts']) => void }) {
  return <fieldset className="rtw-rules"><legend>排序</legend>{rows.map((row, index) => <div key={index}><select value={row.fieldKey} onChange={(event) => onChange(rows.map((item, itemIndex) => itemIndex === index ? { ...item, fieldKey: event.target.value } : item))}><option value="">字段…</option>{fields.map((field) => <option key={field.fieldKey} value={field.fieldKey}>{field.label}</option>)}</select><select value={row.direction} onChange={(event) => onChange(rows.map((item, itemIndex) => itemIndex === index ? { ...item, direction: event.target.value as 'ASC' | 'DESC' } : item))}><option>ASC</option><option>DESC</option></select><button onClick={() => onChange(rows.filter((_, itemIndex) => itemIndex !== index))}>移除</button></div>)}<button onClick={() => onChange([...rows, { fieldKey: '', direction: 'ASC' }])}>+ 排序</button></fieldset>;
}
function ImportPanel({ state, setState, object, busy, onRun }: { state: NonNullable<ImportState>; setState: React.Dispatch<React.SetStateAction<ImportState>>; object: CrmRuntimeObject; busy: boolean; onRun: () => void }) {
  const editable = object.fields.filter((field) => field.uiEditable && !field.system);
  return <section className="rtw-import"><header><div><strong>导入 / Upsert {state.fileName}</strong><small>{state.rows.length} 行 · businessId 优先更新，其次按 Unique Field 匹配，否则新增 · 最多 500 行</small></div><button onClick={() => setState(null)}>关闭</button></header><div className="rtw-mapping">{state.headers.map((header) => <label key={header}><span>{header}</span><select value={state.mapping[header] ?? ''} onChange={(event) => setState((current) => current ? { ...current, mapping: { ...current.mapping, [header]: event.target.value } } : current)}><option value="">忽略</option><option value="__businessId">GBAP Business ID（更新定位）</option>{editable.map((field) => <option key={field.fieldKey} value={field.fieldKey}>{field.label} · {field.fieldKey}{field.unique ? ' · UNIQUE' : ''}</option>)}</select></label>)}</div><Button title={busy ? '执行中' : '开始 Upsert'} size="small" disabled={busy || !Object.values(state.mapping).some(Boolean)} onClick={onRun}/>{state.report.length > 0 && <div className="rtw-import-report"><strong>逐行结果</strong>{state.report.map((item) => <div key={`${item.row}:${item.status}`} className={item.status}><span>第 {item.row} 行</span><b>{item.status === 'created' ? '新增' : item.status === 'updated' ? '更新' : '失败'}</b><small>{item.detail}</small></div>)}</div>}</section>;
}
function RecordEditor({ object, form, setForm, busy, mode, onSave, onClose }: { object: CrmRuntimeObject; form: Record<string, unknown>; setForm: React.Dispatch<React.SetStateAction<Record<string, unknown>>>; busy: boolean; mode: Exclude<EditorMode, null>; onSave: (event: React.FormEvent) => void; onClose: () => void }) {
  const fields = object.fields.filter((field) => field.uiEditable && !field.system);
  return <form className="rtw-editor" onSubmit={onSave}><header><strong>{mode === 'create' ? `新建${object.labelSingular}` : `编辑${object.labelSingular}`}</strong><button type="button" onClick={onClose}>关闭</button></header><div className="rtw-form-grid">{fields.map((field) => <CrmRuntimeFieldInput key={field.fieldKey} field={field} value={form[field.fieldKey]} onChange={(value) => setForm((current) => ({ ...current, [field.fieldKey]: value }))}/>)}</div><footer><button type="submit" disabled={busy}>{busy ? '保存中' : '保存'}</button></footer></form>;
}
function Recycle({ object, records, isAdmin, onRestore, onDestroy }: { object: CrmRuntimeObject; records: CrmRuntimeRecord[]; isAdmin: boolean; onRestore: (record: CrmRuntimeRecord) => void; onDestroy: (record: CrmRuntimeRecord) => void }) {
  return <section className="rtw-recycle"><h3>回收站</h3>{records.map((record) => <div key={record.businessId}><span><strong>{titleOf(object, record)}</strong><small>{record.businessId}</small></span><button onClick={() => void onRestore(record)}>恢复</button>{isAdmin && <button className="danger" onClick={() => void onDestroy(record)}>永久销毁</button>}</div>)}{records.length === 0 && <p>回收站为空。</p>}</section>;
}
function RecordDetail({ object, record, layout, objects, context, activeTab, setActiveTab, records, busy, onEdit, onDelete, onContextReload, onNavigate }: { object: CrmRuntimeObject; record: CrmRuntimeRecord; layout: CrmRuntimeLayout | null; objects: CrmRuntimeObject[]; context: CrmRuntimeContext | null; activeTab: string; setActiveTab: (value: string) => void; records: CrmRuntimeRecord[]; busy: boolean; onEdit: () => void; onDelete: () => void; onContextReload: () => Promise<void>; onNavigate: Props['onNavigate'] }) {
  const tabs = layout?.tabs ?? []; const tab = tabs.find((item) => item.tabKey === activeTab) ?? tabs[0];
  useEffect(() => { if (tabs.length && !activeTab) setActiveTab(tabs[0].tabKey); }, [tabs, activeTab, setActiveTab]);
  return <section className="rtw-detail"><header><div><span>{object.labelSingular}</span><h3>{titleOf(object, record)}</h3><small>GBAP Business ID · {record.businessId}</small></div><div><button onClick={onEdit}>编辑</button><button className="danger" disabled={busy} onClick={onDelete}>移入回收站</button></div></header>{tabs.length > 0 && <nav>{tabs.map((item) => <button key={item.tabKey} className={tab?.tabKey === item.tabKey ? 'active' : ''} onClick={() => setActiveTab(item.tabKey)}>{item.title}</button>)}</nav>}<div className="rtw-widgets">{tab?.widgets?.length ? tab.widgets.map((widget) => <Widget key={widget.widgetKey} widget={widget} object={object} record={record} objects={objects} records={records} context={context} onContextReload={onContextReload} onNavigate={onNavigate}/>) : <><FieldsWidget object={object} record={record}/><ContextWidget object={object} record={record} context={context} onContextReload={onContextReload} onNavigate={onNavigate}/><RelatedWidget object={object} record={record} objects={objects}/></>}</div></section>;
}
function FieldsWidget({ object, record }: { object: CrmRuntimeObject; record: CrmRuntimeRecord }) {
  const business = object.fields.filter((field) => field.active && !AUDIT_KEYS.has(field.fieldKey));
  const audit = object.fields.filter((field) => field.active && AUDIT_KEYS.has(field.fieldKey));
  return <article className="rtw-widget"><h4>字段</h4><div className="rtw-properties">{business.map((field) => <div key={field.fieldKey}><span>{field.label}</span><strong>{display(field, record.values[field.fieldKey])}</strong></div>)}</div>{audit.length > 0 && <details className="rtw-audit"><summary>审计元数据</summary><div className="rtw-properties">{audit.map((field) => <div key={field.fieldKey}><span>{field.label}</span><strong>{display(field, record.values[field.fieldKey])}</strong></div>)}</div></details>}</article>;
}
function Widget({ widget, object, record, objects, records, context, onContextReload, onNavigate }: { widget: CrmRuntimeWidget; object: CrmRuntimeObject; record: CrmRuntimeRecord; objects: CrmRuntimeObject[]; records: CrmRuntimeRecord[]; context: CrmRuntimeContext | null; onContextReload: () => Promise<void>; onNavigate: Props['onNavigate'] }) {
  const type = widget.configuration?.type ?? widget.type;
  if (['FIELDS', 'FIELD', 'FIELD_RICH_TEXT'].some((token) => String(type).includes(token))) return <FieldsWidget object={object} record={record}/>;
  if (['EMAILS', 'EMAIL_THREAD'].includes(String(type))) return null;
  if (['TASKS', 'NOTES', 'FILES', 'CALENDAR', 'TIMELINE'].includes(String(type))) return <ContextWidget object={object} record={record} context={context} onContextReload={onContextReload} onNavigate={onNavigate} focus={String(type)}/>;
  if (['AGGREGATE_CHART', 'PIE_CHART', 'BAR_CHART', 'LINE_CHART'].includes(String(type))) return <ChartWidget widget={widget} object={object} records={records}/>;
  if (String(type) === 'RECORD_TABLE' || String(type) === 'VIEW') return <RelatedWidget object={object} record={record} objects={objects}/>;
  if (String(type) === 'STANDALONE_RICH_TEXT') return <article className="rtw-widget"><h4>{widget.title || '说明'}</h4><p>{String((widget.configuration?.body as { markdown?: string })?.markdown ?? '')}</p></article>;
  if (String(type) === 'IFRAME') return <article className="rtw-widget"><h4>{widget.title || '嵌入'}</h4>{widget.configuration?.url ? <a href={widget.configuration.url} target="_blank" rel="noreferrer">打开受配置的外部内容</a> : <p>未配置 URL。</p>}</article>;
  if (String(type).includes('WORKFLOW')) return <article className="rtw-widget"><h4>{widget.title || '自动化'}</h4><button onClick={() => onNavigate('workflows')}>打开自动化中心</button></article>;
  return <article className="rtw-widget"><h4>{widget.title || widget.type}</h4><p>Twenty Widget：{String(type)}。元数据已恢复，当前没有额外业务输入。</p></article>;
}
function ChartWidget({ widget, object, records }: { widget: CrmRuntimeWidget; object: CrmRuntimeObject; records: CrmRuntimeRecord[] }) {
  const config = widget.configuration; const groupKey = config?.groupByFieldKey ?? config?.primaryAxisFieldKey; const aggregateKey = config?.aggregateFieldKey;
  if (!groupKey) return <article className="rtw-widget"><h4>{widget.title || '指标'}</h4><div className="rtw-metric">{records.length}</div><small>{object.labelPlural}记录数</small></article>;
  const groups = new Map<string, number>();
  for (const record of records) { const key = String(record.values[groupKey] ?? '未分组'); const value = aggregateKey ? Number(record.values[aggregateKey] ?? 0) : 1; groups.set(key, (groups.get(key) ?? 0) + (Number.isFinite(value) ? value : 0)); }
  const max = Math.max(1, ...groups.values());
  return <article className="rtw-widget"><h4>{widget.title || '图表'}</h4><div className="rtw-chart">{[...groups.entries()].slice(0, 20).map(([key, value]) => <div key={key}><span>{key}</span><i style={{ width: `${Math.max(4, value / max * 100)}%` }}/><strong>{value.toLocaleString('zh-CN')}</strong></div>)}</div></article>;
}
function RelatedWidget({ object, record, objects }: { object: CrmRuntimeObject; record: CrmRuntimeRecord; objects: CrmRuntimeObject[] }) {
  const [related, setRelated] = useState<Array<{ object: CrmRuntimeObject; records: CrmRuntimeRecord[] }>>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result: Array<{ object: CrmRuntimeObject; records: CrmRuntimeRecord[] }> = [];
      for (const candidate of objects) {
        const relationFields = candidate.fields.filter((field) => field.relation?.targetObjectKey === object.objectKey); if (!relationFields.length) continue;
        try {
          const data = await listCrmRuntimeRecords(candidate.objectKey, { limit: 500 });
          const matches = data.records.filter((item) => relationFields.some((field) => { const value = item.values[field.fieldKey]; return value && typeof value === 'object' && !Array.isArray(value) && (value as { businessId?: string }).businessId === record.businessId; }));
          if (matches.length) result.push({ object: candidate, records: matches });
        } catch {}
      }
      if (!cancelled) setRelated(result);
    })();
    return () => { cancelled = true; };
  }, [object.objectKey, record.businessId, objects]);
  return <article className="rtw-widget"><h4>关联记录</h4>{related.flatMap((group) => group.records.map((item) => <div className="rtw-related" key={`${group.object.objectKey}:${item.businessId}`}><span>{group.object.labelSingular}</span><strong>{titleOf(group.object, item)}</strong></div>))}{related.length === 0 && <p>暂无反向关联记录。</p>}</article>;
}
function ContextWidget({ object, record, context, onContextReload, onNavigate, focus }: { object: CrmRuntimeObject; record: CrmRuntimeRecord; context: CrmRuntimeContext | null; onContextReload: () => Promise<void>; onNavigate: Props['onNavigate']; focus?: string }) {
  const [task, setTask] = useState(''); const [note, setNote] = useState(''); const targetType = STANDARD_TARGET[object.objectKey];
  const showGeneral = !focus || focus === 'TIMELINE';
  return <article className="rtw-widget"><h4>{focus || '活动与协作'}</h4>{(showGeneral || focus === 'TASKS') && <section><div className="rtw-widget-title"><strong>任务</strong><button onClick={() => onNavigate('tasks')}>全部任务</button></div>{context?.tasks.map((item) => <div className="rtw-related" key={item.businessId ?? item.title}><span>{item.status ?? 'TASK'}</span><strong>{item.title ?? '任务'}</strong></div>)}{targetType && <div className="rtw-inline-create"><input value={task} onChange={(event) => setTask(event.target.value)} placeholder="新建关联任务"/><button disabled={!task.trim()} onClick={() => void (async () => { await createTask({ title: task, targets: [{ businessType: targetType, businessId: record.businessId }] }); setTask(''); await onContextReload(); })()}>添加</button></div>}</section>}{(showGeneral || focus === 'NOTES') && <section><div className="rtw-widget-title"><strong>笔记</strong><button onClick={() => onNavigate('notes')}>全部笔记</button></div>{context?.notes.map((item) => <div className="rtw-related" key={item.businessId ?? item.title}><span>NOTE</span><strong>{item.title ?? '笔记'}</strong></div>)}{targetType && <div className="rtw-inline-create"><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="新建关联笔记"/><button disabled={!note.trim()} onClick={() => void (async () => { await createNote({ title: note, targets: [{ businessType: targetType, businessId: record.businessId }] }); setNote(''); await onContextReload(); })()}>添加</button></div>}</section>}{(showGeneral || focus === 'FILES') && <section><div className="rtw-widget-title"><strong>文件</strong><button onClick={() => onNavigate('files')}>文件中心</button></div>{context?.files.map((file) => <div className="rtw-related" key={file.id}><button onClick={() => void downloadCrmFile(file.id, file.fileName)}>{file.fileName}</button><small>{Math.ceil(file.sizeBytes / 1024)} KB</small><button onClick={() => void (async () => { await deleteCrmFile(file.id); await onContextReload(); })()}>删除</button></div>)}<label className="rtw-file-button">上传到当前记录<input type="file" hidden onChange={(event) => void (async () => { const file = event.target.files?.[0]; if (file) { await uploadCrmRuntimeFile(object.objectKey, record.businessId, file); await onContextReload(); } })()}/></label></section>}{focus === 'CALENDAR' && <section><div className="rtw-widget-title"><strong>内部日历</strong><button onClick={() => onNavigate('calendar')}>打开日历</button></div><p>在 GBAP 内部日历中查看和维护团队日程。</p></section>} {!targetType && (!focus || ['TASKS', 'NOTES'].includes(focus)) && <small>Custom Object 的文件已完整开放；任务/笔记 Target 仍遵守已冻结的 Account/Contact/Opportunity 边界，未擅自扩权。</small>}</article>;
}
