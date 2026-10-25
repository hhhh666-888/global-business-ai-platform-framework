import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { IconCalendar, IconLayoutKanban, IconLayoutList, IconPlus, IconRefresh, IconTrash } from 'twenty-ui/icon';
import type { GbapSession } from '../hooks/useGbapSession';
import {
  createCrmRuntimeRecord,
  destroyCrmRuntimeRecord,
  getCrmRuntimeLayouts,
  getCrmRuntimeSchema,
  getCrmRuntimeViews,
  listCrmRuntimeRecords,
  restoreCrmRuntimeRecord,
  softDeleteCrmRuntimeRecord,
  updateCrmRuntimeRecord,
  type CrmRuntimeField,
  type CrmRuntimeLayout,
  type CrmRuntimeObject,
  type CrmRuntimeRecord,
  type CrmRuntimeView,
  type CrmRuntimeWidget,
} from '../lib/crmRuntimeClient';
import './crm-runtime.css';

type Props = {
  session: GbapSession;
  onNavigate: (target: 'tasks' | 'notes' | 'files' | 'calendar' | 'workflows') => void;
};
type RuntimeMode = 'records' | 'deleted';
type FieldValueMap = Record<string, unknown>;

const AUDIT_KEYS = new Set(['createdAt', 'updatedAt', 'deletedAt', 'createdBy', 'updatedBy']);
const FIELD_TYPE_LABEL: Record<string, string> = {
  TEXT: '文本', LONG_TEXT: '长文本', RICH_TEXT: '富文本', NUMBER: '数字', BOOLEAN: '是/否', DATE: '日期', DATE_TIME: '日期时间',
  CURRENCY: '金额', SELECT: '单选', MULTI_SELECT: '多选', RATING: '评级', ADDRESS: '地址', EMAILS: '邮箱', PHONES: '电话', LINKS: '链接',
  FULL_NAME: '姓名', RELATION: '关联记录', RAW_JSON: 'JSON', ARRAY: '列表', UUID: '标识',
};

function errorMessage(cause: unknown, fallback: string) {
  const typed = cause as { status?: number; body?: { error?: string } };
  if (typed?.status === 401) return '登录状态已失效，请重新登录。';
  if (typed?.status === 403) return '当前账号没有执行此操作的权限。';
  if (typed?.status === 404) return '记录或对象已经不存在，请刷新。';
  if (typed?.status === 409) return '记录关系或映射发生冲突，请刷新后重试。';
  if (typed?.status && typed.status >= 500) return 'CRM Runtime 暂时不可用，请稍后刷新。';
  return fallback;
}
function labelField(object: CrmRuntimeObject) {
  return object.fields.find((field) => ['name', 'title'].includes(field.fieldKey) && !field.system)
    ?? object.fields.find((field) => !field.system && ['TEXT', 'FULL_NAME'].includes(field.type))
    ?? object.fields.find((field) => !field.system)
    ?? object.fields[0];
}
function optionRows(field: CrmRuntimeField): Array<{ label: string; value: string }> {
  const raw = Array.isArray(field.options) ? field.options : [];
  return raw.map((item) => typeof item === 'string' ? { label: item, value: item } : {
    label: String((item as { label?: unknown }).label ?? (item as { value?: unknown }).value ?? ''),
    value: String((item as { value?: unknown }).value ?? (item as { label?: unknown }).label ?? ''),
  }).filter((item) => item.value);
}
function fullName(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return String(value ?? '');
  const row = value as Record<string, unknown>;
  return [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
}
function primaryEmail(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return String(value ?? '');
  return String((value as Record<string, unknown>).primaryEmail ?? '');
}
function primaryPhone(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return String(value ?? '');
  const row = value as Record<string, unknown>;
  return `${row.primaryPhoneCallingCode ?? ''}${row.primaryPhoneNumber ?? ''}`;
}
function primaryLink(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return String(value ?? '');
  return String((value as Record<string, unknown>).primaryLinkUrl ?? '');
}
function currencyDisplay(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return String(value ?? '');
  const row = value as Record<string, unknown>;
  const micros = typeof row.amountMicros === 'number' ? row.amountMicros : Number(row.amountMicros ?? 0);
  const amount = Number.isFinite(micros) ? micros / 1_000_000 : 0;
  return `${row.currencyCode ?? ''} ${amount.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`.trim();
}
function addressDisplay(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return String(value ?? '');
  const row = value as Record<string, unknown>;
  return [row.addressCountry, row.addressState, row.addressCity, row.addressStreet1, row.addressStreet2, row.addressPostcode].filter(Boolean).join(' · ');
}
function displayValue(field: CrmRuntimeField | undefined, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (!field) return typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (field.relation && typeof value === 'object' && !Array.isArray(value)) return `关联记录 · ${String((value as { businessId?: unknown }).businessId ?? '')}`;
  switch (field.type) {
    case 'FULL_NAME': return fullName(value) || '—';
    case 'EMAILS': return primaryEmail(value) || '—';
    case 'PHONES': return primaryPhone(value) || '—';
    case 'LINKS': return primaryLink(value) || '—';
    case 'ADDRESS': return addressDisplay(value) || '—';
    case 'CURRENCY': return currencyDisplay(value) || '—';
    case 'BOOLEAN': return value ? '是' : '否';
    case 'MULTI_SELECT': return Array.isArray(value) ? value.join('、') : String(value);
    case 'DATE':
    case 'DATE_TIME': {
      const date = new Date(String(value));
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN');
    }
    default: return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}
function recordTitle(object: CrmRuntimeObject, record: CrmRuntimeRecord) {
  const field = labelField(object);
  return field ? displayValue(field, record.values[field.fieldKey]) : record.businessId.slice(0, 8);
}
function defaultView(object: CrmRuntimeObject, views: CrmRuntimeView[]) {
  return views.filter((view) => view.objectKey === object.objectKey).sort((a, b) => a.position - b.position)[0] ?? null;
}
function visibleFields(object: CrmRuntimeObject, view: CrmRuntimeView | null) {
  if (view?.fields?.length) {
    const byKey = new Map(object.fields.map((field) => [field.fieldKey, field]));
    return view.fields.filter((field) => field.visible).sort((a, b) => a.position - b.position).map((item) => byKey.get(item.fieldKey)).filter(Boolean) as CrmRuntimeField[];
  }
  return object.fields.filter((field) => !field.system && field.active).slice(0, 10);
}
function filterRecord(record: CrmRuntimeRecord, object: CrmRuntimeObject, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return object.fields.some((field) => displayValue(field, record.values[field.fieldKey]).toLowerCase().includes(needle));
}
function compareValues(a: unknown, b: unknown) {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'zh-CN', { numeric: true });
}
function applyView(records: CrmRuntimeRecord[], object: CrmRuntimeObject, view: CrmRuntimeView | null, search: string) {
  let output = records.filter((record) => filterRecord(record, object, search));
  if (view?.filters?.length) {
    output = output.filter((record) => view.filters.every((filter) => {
      const value = record.values[filter.fieldKey];
      const expected = filter.value as unknown;
      switch (filter.operand) {
        case 'IS_EMPTY': return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
        case 'IS_NOT_EMPTY': return !(value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0));
        case 'CONTAINS': return String(value ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
        case 'DOES_NOT_CONTAIN': return !String(value ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
        case 'IS_NOT': return String(value ?? '') !== String(expected ?? '');
        case 'GREATER_THAN_OR_EQUAL': return Number(value) >= Number(expected);
        case 'LESS_THAN_OR_EQUAL': return Number(value) <= Number(expected);
        default: return expected === undefined || expected === null || expected === '' ? true : String(value ?? '') === String(expected);
      }
    }));
  }
  if (view?.sorts?.length) {
    output = [...output].sort((left, right) => {
      for (const sort of view.sorts) {
        const cmp = compareValues(left.values[sort.fieldKey], right.values[sort.fieldKey]);
        if (cmp) return sort.direction === 'DESC' ? -cmp : cmp;
      }
      return 0;
    });
  }
  return output;
}

export function CrmRuntimeSurface({ session, onNavigate }: Props) {
  const [objects, setObjects] = useState<CrmRuntimeObject[]>([]);
  const [views, setViews] = useState<CrmRuntimeView[]>([]);
  const [layouts, setLayouts] = useState<CrmRuntimeLayout[]>([]);
  const [objectKey, setObjectKey] = useState('company');
  const [viewKey, setViewKey] = useState('');
  const [records, setRecords] = useState<CrmRuntimeRecord[]>([]);
  const [mode, setMode] = useState<RuntimeMode>('records');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CrmRuntimeRecord | null>(null);
  const [editor, setEditor] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState<FieldValueMap>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('');
  const isSuperAdmin = Boolean(session.identity?.roles.includes('substrate-admin'));

  const object = useMemo(() => objects.find((item) => item.objectKey === objectKey) ?? objects[0] ?? null, [objects, objectKey]);
  const objectViews = useMemo(() => object ? views.filter((view) => view.objectKey === object.objectKey).sort((a, b) => a.position - b.position) : [], [views, object]);
  const view = useMemo(() => objectViews.find((item) => item.viewKey === viewKey) ?? (object ? defaultView(object, objectViews) : null), [objectViews, viewKey, object]);
  const layout = useMemo(() => object ? layouts.find((item) => item.objectKey === object.objectKey) ?? null : null, [layouts, object]);
  const displayed = useMemo(() => object ? applyView(records, object, view, search) : [], [records, object, view, search]);
  const fields = useMemo(() => object ? visibleFields(object, view) : [], [object, view]);

  const loadMetadata = useCallback(async (refresh = false) => {
    if (session.status !== 'authenticated') return;
    setLoading(true); setError(null);
    try {
      const [schema, viewData, layoutData] = await Promise.all([getCrmRuntimeSchema(refresh), getCrmRuntimeViews(), getCrmRuntimeLayouts()]);
      const usable = schema.objects.filter((item) => item.active && !['workspaceMember', 'view', 'viewField'].includes(item.objectKey));
      setObjects(usable); setViews(viewData.views); setLayouts(layoutData.layouts);
      setObjectKey((current) => usable.some((item) => item.objectKey === current) ? current : (usable.find((item) => item.objectKey === 'company')?.objectKey ?? usable[0]?.objectKey ?? ''));
    } catch (cause) { setError(errorMessage(cause, 'CRM 元数据加载失败。')); }
    finally { setLoading(false); }
  }, [session.status]);

  const loadRecords = useCallback(async () => {
    if (session.status !== 'authenticated' || !objectKey) return;
    setLoading(true); setError(null);
    try {
      const data = await listCrmRuntimeRecords(objectKey, { limit: 500, deleted: mode === 'deleted' });
      setRecords(data.records); setSelected((current) => current ? data.records.find((record) => record.businessId === current.businessId) ?? null : null);
    } catch (cause) { setError(errorMessage(cause, '记录加载失败。')); }
    finally { setLoading(false); }
  }, [session.status, objectKey, mode]);

  useEffect(() => { void loadMetadata(); }, [loadMetadata]);
  useEffect(() => { void loadRecords(); }, [loadRecords]);
  useEffect(() => { if (object) { const preferred = defaultView(object, objectViews); setViewKey(preferred?.viewKey ?? ''); setSelected(null); setEditor(null); setActiveTab(''); } }, [object?.objectKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const startCreate = () => { if (!object) return; setSelected(null); setForm(Object.fromEntries(object.fields.filter((field) => field.uiEditable && field.defaultValue !== null).map((field) => [field.fieldKey, field.defaultValue]))); setEditor('create'); setError(null); setNotice(null); };
  const startEdit = () => { if (!selected) return; setForm({ ...selected.values }); setEditor('edit'); setError(null); setNotice(null); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!object || busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const editable = new Set(object.fields.filter((field) => field.uiEditable).map((field) => field.fieldKey));
      const fieldsToSave = Object.fromEntries(Object.entries(form).filter(([key]) => editable.has(key)));
      const result = editor === 'create' ? await createCrmRuntimeRecord(object.objectKey, fieldsToSave)
        : selected ? await updateCrmRuntimeRecord(object.objectKey, selected.businessId, fieldsToSave) : null;
      if (result?.record) setSelected(result.record);
      setEditor(null); setNotice(editor === 'create' ? `${object.labelSingular}已创建。` : `${object.labelSingular}已更新。`); await loadRecords();
    } catch (cause) { setError(errorMessage(cause, '记录保存失败，请检查字段内容。')); }
    finally { setBusy(false); }
  };
  const softDelete = async () => {
    if (!object || !selected || busy || !window.confirm(`将“${recordTitle(object, selected)}”移入回收站？\n\n之后仍可恢复。`)) return;
    setBusy(true); setError(null);
    try { await softDeleteCrmRuntimeRecord(object.objectKey, selected.businessId); setSelected(null); setNotice('记录已移入回收站，可随时恢复。'); await loadRecords(); }
    catch (cause) { setError(errorMessage(cause, '删除失败。')); }
    finally { setBusy(false); }
  };
  const restore = async (record: CrmRuntimeRecord) => {
    if (!object || busy) return; setBusy(true); setError(null);
    try { await restoreCrmRuntimeRecord(object.objectKey, record.businessId); setNotice('记录已恢复。'); await loadRecords(); }
    catch (cause) { setError(errorMessage(cause, '恢复失败。')); }
    finally { setBusy(false); }
  };
  const destroy = async (record: CrmRuntimeRecord) => {
    if (!object || !isSuperAdmin || busy || !window.confirm(`永久销毁这条${object.labelSingular}记录？\n\n该操作不可恢复。`)) return;
    setBusy(true); setError(null);
    try { await destroyCrmRuntimeRecord(object.objectKey, record.businessId); setNotice('记录已永久销毁。'); await loadRecords(); }
    catch (cause) { setError(errorMessage(cause, '永久销毁失败。')); }
    finally { setBusy(false); }
  };

  if (session.status === 'initializing') return <Gate title="正在加载完整 CRM" detail="正在恢复企业登录状态…" />;
  if (session.status !== 'authenticated') return <Gate title="登录后使用完整 CRM" detail="登录后可以使用 Twenty 提供的完整对象、字段、视图和记录能力。" action={<Button title="企业登录" onClick={() => void session.login('crm-runtime')} />} />;

  return <section className="crm-runtime" data-surface="stage35-crm-runtime">
    <aside className="runtime-object-nav">
      <div className="runtime-nav-head"><strong>全部 CRM 对象</strong><button className="runtime-icon-button" title="刷新元数据" onClick={() => void loadMetadata(true)}><IconRefresh size={14} /></button></div>
      {objects.map((item) => <button key={item.objectKey} className={item.objectKey === object?.objectKey ? 'active' : ''} onClick={() => { setObjectKey(item.objectKey); setMode('records'); }}><span>{item.labelPlural}</span>{!item.system && <small>{item.objectKey}</small>}</button>)}
    </aside>

    <div className="runtime-main">
      <header className="runtime-toolbar">
        <div><span className="runtime-eyebrow">Stage 3.5 · Metadata-driven CRM</span><h2>{object?.labelPlural ?? '完整 CRM'}</h2><p>{object?.description || '对象、字段、关系和视图来自当前 CRM 元数据。'}</p></div>
        <div className="runtime-actions">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`搜索${object?.labelPlural ?? '记录'}…`} />
          <button className={`tool-button ${mode === 'deleted' ? 'active' : ''}`} onClick={() => setMode(mode === 'records' ? 'deleted' : 'records')}><IconTrash size={14} />{mode === 'records' ? '回收站' : '返回记录'}</button>
          {mode === 'records' && object?.uiCreatable && !object.system && <Button title={`新建${object.labelSingular}`} Icon={IconPlus} size="small" onClick={startCreate} />}
        </div>
      </header>

      {error && <div className="real-error" role="alert">{error}</div>}
      {notice && <div className="real-success" role="status">{notice}</div>}

      {mode === 'records' && objectViews.length > 0 && <div className="runtime-viewbar">
        <div className="runtime-view-tabs">{objectViews.map((item) => <button key={item.viewKey} className={view?.viewKey === item.viewKey ? 'active' : ''} onClick={() => setViewKey(item.viewKey)}>{item.type === 'KANBAN' ? <IconLayoutKanban size={14} /> : item.type === 'CALENDAR' ? <IconCalendar size={14} /> : <IconLayoutList size={14} />}{item.name}</button>)}</div>
        <div className="runtime-view-summary">{view ? `${view.type} · ${view.fields.filter((item) => item.visible).length || fields.length} 个字段 · ${view.filters.length} 个筛选 · ${view.sorts.length} 个排序` : '默认对象视图'}</div>
      </div>}

      {editor && object && <RuntimeEditor object={object} form={form} setForm={setForm} mode={editor} busy={busy} onSubmit={save} onCancel={() => setEditor(null)} />}

      {mode === 'deleted' ? <DeletedRecords object={object} records={displayed} loading={loading} isSuperAdmin={isSuperAdmin} onRestore={restore} onDestroy={destroy} />
        : object && <RuntimeRecords object={object} view={view} fields={fields} records={displayed} loading={loading} selected={selected} onSelect={(record) => { setSelected(record); setEditor(null); }} />}

      {mode === 'records' && selected && object && <RuntimeRecordDetail object={object} record={selected} layout={layout} activeTab={activeTab} setActiveTab={setActiveTab} onEdit={startEdit} onDelete={softDelete} busy={busy} onNavigate={onNavigate} />}
    </div>
  </section>;
}

function RuntimeRecords({ object, view, fields, records, loading, selected, onSelect }: { object: CrmRuntimeObject; view: CrmRuntimeView | null; fields: CrmRuntimeField[]; records: CrmRuntimeRecord[]; loading: boolean; selected: CrmRuntimeRecord | null; onSelect: (record: CrmRuntimeRecord) => void }) {
  if (view?.type === 'KANBAN' && view.mainGroupByFieldKey) return <KanbanRecords object={object} records={records} groupFieldKey={view.mainGroupByFieldKey} selected={selected} onSelect={onSelect} />;
  if (view?.type === 'CALENDAR' && view.calendarFieldKey) return <CalendarRecords object={object} records={records} dateFieldKey={view.calendarFieldKey} selected={selected} onSelect={onSelect} />;
  return <div className="runtime-table-wrap"><table className="runtime-table"><thead><tr>{fields.map((field) => <th key={field.fieldKey}>{field.label}</th>)}<th>操作</th></tr></thead><tbody>{records.map((record) => <tr key={record.businessId} className={selected?.businessId === record.businessId ? 'selected' : ''}>{fields.map((field) => <td key={field.fieldKey}>{displayValue(field, record.values[field.fieldKey])}</td>)}<td><button className="text-action" onClick={() => onSelect(record)}>查看</button></td></tr>)}{!loading && records.length === 0 && <tr><td colSpan={Math.max(1, fields.length + 1)}><div className="real-empty">暂无记录。</div></td></tr>}</tbody></table></div>;
}
function KanbanRecords({ object, records, groupFieldKey, selected, onSelect }: { object: CrmRuntimeObject; records: CrmRuntimeRecord[]; groupFieldKey: string; selected: CrmRuntimeRecord | null; onSelect: (record: CrmRuntimeRecord) => void }) {
  const field = object.fields.find((item) => item.fieldKey === groupFieldKey);
  const configured = optionRows(field ?? object.fields[0]).map((option) => option.value);
  const values = [...new Set([...configured, ...records.map((record) => String(record.values[groupFieldKey] ?? '未分组'))])];
  return <div className="runtime-kanban">{values.map((value) => <section key={value}><header><strong>{optionRows(field ?? object.fields[0]).find((item) => item.value === value)?.label ?? value}</strong><span>{records.filter((record) => String(record.values[groupFieldKey] ?? '未分组') === value).length}</span></header>{records.filter((record) => String(record.values[groupFieldKey] ?? '未分组') === value).map((record) => <button key={record.businessId} className={selected?.businessId === record.businessId ? 'selected' : ''} onClick={() => onSelect(record)}><strong>{recordTitle(object, record)}</strong><small>{record.businessId.slice(0, 8)}</small></button>)}</section>)}</div>;
}
function CalendarRecords({ object, records, dateFieldKey, selected, onSelect }: { object: CrmRuntimeObject; records: CrmRuntimeRecord[]; dateFieldKey: string; selected: CrmRuntimeRecord | null; onSelect: (record: CrmRuntimeRecord) => void }) {
  const dated = records.map((record) => ({ record, date: new Date(String(record.values[dateFieldKey] ?? '')) })).filter((item) => !Number.isNaN(item.date.getTime())).sort((a, b) => a.date.getTime() - b.date.getTime());
  return <div className="runtime-calendar-list">{dated.map(({ record, date }) => <button key={record.businessId} className={selected?.businessId === record.businessId ? 'selected' : ''} onClick={() => onSelect(record)}><time>{date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' })}</time><span><strong>{recordTitle(object, record)}</strong><small>{date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small></span></button>)}{dated.length === 0 && <div className="real-empty">当前 Calendar View 没有可显示的日期记录。</div>}</div>;
}
function DeletedRecords({ object, records, loading, isSuperAdmin, onRestore, onDestroy }: { object: CrmRuntimeObject | null; records: CrmRuntimeRecord[]; loading: boolean; isSuperAdmin: boolean; onRestore: (record: CrmRuntimeRecord) => void; onDestroy: (record: CrmRuntimeRecord) => void }) {
  return <div className="runtime-recycle"><div className="crm-section-head"><div><h3>回收站</h3><p>普通删除保留可恢复状态；永久销毁仅超级管理员可执行。</p></div></div>{records.map((record) => <div className="runtime-recycle-row" key={record.businessId}><div><strong>{object ? recordTitle(object, record) : record.businessId}</strong><small>{record.values.deletedAt ? `删除于 ${displayValue(undefined, record.values.deletedAt)}` : record.businessId}</small></div><div><button className="crm-link-button" onClick={() => void onRestore(record)}>恢复</button>{isSuperAdmin && <button className="crm-link-button danger" onClick={() => void onDestroy(record)}>永久销毁</button>}</div></div>)}{!loading && records.length === 0 && <div className="real-empty">回收站为空。</div>}</div>;
}
function RuntimeEditor({ object, form, setForm, mode, busy, onSubmit, onCancel }: { object: CrmRuntimeObject; form: FieldValueMap; setForm: React.Dispatch<React.SetStateAction<FieldValueMap>>; mode: 'create' | 'edit'; busy: boolean; onSubmit: (event: React.FormEvent) => void; onCancel: () => void }) {
  const fields = object.fields.filter((field) => field.uiEditable && !field.system);
  return <form className="runtime-editor" onSubmit={onSubmit}><div className="runtime-editor-head"><div><strong>{mode === 'create' ? `新建${object.labelSingular}` : `编辑${object.labelSingular}`}</strong><small>{fields.length} 个当前可编辑字段 · 字段来自 CRM 元数据</small></div><button type="button" className="text-action" onClick={onCancel}>关闭</button></div><div className="runtime-field-grid">{fields.map((field) => <RuntimeFieldInput key={field.fieldKey} field={field} value={form[field.fieldKey]} onChange={(value) => setForm((current) => ({ ...current, [field.fieldKey]: value }))} />)}</div><div className="crm-form-actions"><Button title="取消" type="button" variant="secondary" size="small" onClick={onCancel} /><Button title={busy ? '保存中' : '保存'} type="submit" size="small" disabled={busy} /></div></form>;
}
function RuntimeFieldInput({ field, value, onChange }: { field: CrmRuntimeField; value: unknown; onChange: (value: unknown) => void }) {
  const options = optionRows(field);
  const caption = `${field.label}${field.nullable ? '' : ' *'}`;
  if (field.relation) return <label>{caption}<RelationBusinessIdInput value={value} targetObjectKey={field.relation.targetObjectKey} onChange={onChange} /><small>{FIELD_TYPE_LABEL[field.type] ?? field.type} · {field.relation.targetObjectKey}</small></label>;
  if (field.type === 'BOOLEAN') return <label className="runtime-check"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /><span>{caption}</span></label>;
  if (field.type === 'SELECT') return <label>{caption}<select value={String(value ?? '')} onChange={(event) => onChange(event.target.value || null)}><option value="">未选择</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  if (field.type === 'MULTI_SELECT') { const selected = Array.isArray(value) ? value.map(String) : []; return <label>{caption}<select multiple value={selected} onChange={(event) => onChange([...event.target.selectedOptions].map((option) => option.value))}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
  if (field.type === 'FULL_NAME') { const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; return <fieldset><legend>{caption}</legend><input placeholder="名" value={String(row.firstName ?? '')} onChange={(event) => onChange({ ...row, firstName: event.target.value })} /><input placeholder="姓" value={String(row.lastName ?? '')} onChange={(event) => onChange({ ...row, lastName: event.target.value })} /></fieldset>; }
  if (field.type === 'EMAILS') { const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; return <label>{caption}<input type="email" value={String(row.primaryEmail ?? '')} onChange={(event) => onChange({ ...row, primaryEmail: event.target.value, additionalEmails: Array.isArray(row.additionalEmails) ? row.additionalEmails : [] })} /><small>主邮箱；其他邮箱数据会保留</small></label>; }
  if (field.type === 'PHONES') { const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; return <label>{caption}<input value={`${row.primaryPhoneCallingCode ?? ''}${row.primaryPhoneNumber ?? ''}`} onChange={(event) => onChange({ ...row, primaryPhoneNumber: event.target.value, primaryPhoneCallingCode: '', primaryPhoneCountryCode: '', additionalPhones: Array.isArray(row.additionalPhones) ? row.additionalPhones : [] })} placeholder="+593..." /></label>; }
  if (field.type === 'LINKS' || field.type === 'DOMAIN') { const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; return <label>{caption}<input value={String(row.primaryLinkUrl ?? value ?? '')} onChange={(event) => onChange({ ...row, primaryLinkUrl: event.target.value, primaryLinkLabel: String(row.primaryLinkLabel ?? ''), secondaryLinks: Array.isArray(row.secondaryLinks) ? row.secondaryLinks : [] })} placeholder="https://" /></label>; }
  if (field.type === 'CURRENCY') { const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; const micros = Number(row.amountMicros ?? 0); return <fieldset><legend>{caption}</legend><input inputMode="decimal" value={Number.isFinite(micros) && micros ? String(micros / 1_000_000) : ''} onChange={(event) => onChange({ ...row, amountMicros: event.target.value ? Math.round(Number(event.target.value) * 1_000_000) : null, currencyCode: String(row.currencyCode ?? 'USD') })} placeholder="金额" /><input value={String(row.currencyCode ?? 'USD')} maxLength={3} onChange={(event) => onChange({ ...row, currencyCode: event.target.value.toUpperCase() })} placeholder="USD" /></fieldset>; }
  if (field.type === 'ADDRESS') { const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; const patch = (key: string, next: string) => onChange({ ...row, [key]: next }); return <fieldset className="runtime-address"><legend>{caption}</legend><input placeholder="国家" value={String(row.addressCountry ?? '')} onChange={(e) => patch('addressCountry', e.target.value)} /><input placeholder="省 / 州" value={String(row.addressState ?? '')} onChange={(e) => patch('addressState', e.target.value)} /><input placeholder="城市" value={String(row.addressCity ?? '')} onChange={(e) => patch('addressCity', e.target.value)} /><input placeholder="街道" value={String(row.addressStreet1 ?? '')} onChange={(e) => patch('addressStreet1', e.target.value)} /><input placeholder="详细地址" value={String(row.addressStreet2 ?? '')} onChange={(e) => patch('addressStreet2', e.target.value)} /><input placeholder="邮编" value={String(row.addressPostcode ?? '')} onChange={(e) => patch('addressPostcode', e.target.value)} /></fieldset>; }
  if (['LONG_TEXT', 'RICH_TEXT'].includes(field.type)) return <label className="runtime-wide">{caption}<textarea value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} rows={5} /><small>{field.description || FIELD_TYPE_LABEL[field.type] || field.type}</small></label>;
  if (field.type === 'RAW_JSON' || field.type === 'JSON') return <label className="runtime-wide">{caption}<textarea value={typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2)} onChange={(event) => { try { onChange(JSON.parse(event.target.value)); } catch { onChange(event.target.value); } }} rows={5} /></label>;
  if (field.type === 'DATE') return <label>{caption}<input type="date" value={String(value ?? '').slice(0, 10)} onChange={(event) => onChange(event.target.value || null)} /></label>;
  if (field.type === 'DATE_TIME') return <label>{caption}<input type="datetime-local" value={String(value ?? '').slice(0, 16)} onChange={(event) => onChange(event.target.value ? new Date(event.target.value).toISOString() : null)} /></label>;
  if (['NUMBER', 'RATING'].includes(field.type)) return <label>{caption}<input type="number" value={value === null || value === undefined ? '' : String(value)} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} /></label>;
  return <label>{caption}<input value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} /><small>{field.description || FIELD_TYPE_LABEL[field.type] || field.type}{field.unique ? ' · 唯一字段' : ''}</small></label>;
}
function RelationBusinessIdInput({ value, targetObjectKey, onChange }: { value: unknown; targetObjectKey: string; onChange: (value: unknown) => void }) {
  const [options, setOptions] = useState<CrmRuntimeRecord[]>([]);
  useEffect(() => { let cancelled = false; void listCrmRuntimeRecords(targetObjectKey, { limit: 300 }).then((result) => { if (!cancelled) setOptions(result.records); }).catch(() => { if (!cancelled) setOptions([]); }); return () => { cancelled = true; }; }, [targetObjectKey]);
  const selected = typeof value === 'string' ? value : value && typeof value === 'object' ? String((value as { businessId?: unknown }).businessId ?? '') : '';
  return <select value={selected} onChange={(event) => onChange(event.target.value ? { businessId: event.target.value, objectKey: targetObjectKey } : null)}><option value="">未关联</option>{options.map((record) => <option value={record.businessId} key={record.businessId}>{String(Object.values(record.values).find((item) => typeof item === 'string' && item) ?? record.businessId.slice(0, 8))}</option>)}</select>;
}
function RuntimeRecordDetail({ object, record, layout, activeTab, setActiveTab, onEdit, onDelete, busy, onNavigate }: { object: CrmRuntimeObject; record: CrmRuntimeRecord; layout: CrmRuntimeLayout | null; activeTab: string; setActiveTab: (key: string) => void; onEdit: () => void; onDelete: () => void; busy: boolean; onNavigate: Props['onNavigate'] }) {
  const fallbackTabs = [{ tabKey: 'overview', title: '概览', icon: null, position: 0, layoutMode: 'GRID', widgets: [{ widgetKey: 'fields', title: '字段', type: 'FIELDS', objectKey: object.objectKey, position: null, conditionalDisplay: null, configuration: null }] }];
  const tabs = layout?.tabs?.length ? layout.tabs : fallbackTabs;
  const chosen = tabs.find((tab) => tab.tabKey === activeTab) ?? tabs[0];
  useEffect(() => { if (!activeTab && tabs[0]) setActiveTab(tabs[0].tabKey); }, [activeTab, tabs, setActiveTab]);
  return <section className="runtime-detail"><header><div><span className="runtime-eyebrow">{object.labelSingular} · 记录详情</span><h3>{recordTitle(object, record)}</h3><p>Durable ID: {record.businessId}</p></div><div><Button title="编辑" size="small" variant="secondary" onClick={onEdit} /><button className="danger-text-button" disabled={busy} onClick={() => void onDelete()}>移入回收站</button></div></header><div className="runtime-detail-tabs">{tabs.map((tab) => <button key={tab.tabKey} className={chosen?.tabKey === tab.tabKey ? 'active' : ''} onClick={() => setActiveTab(tab.tabKey)}>{tab.title}</button>)}</div><div className="runtime-widget-grid">{chosen?.widgets?.length ? chosen.widgets.map((widget) => <RuntimeWidget key={widget.widgetKey} widget={widget} object={object} record={record} onNavigate={onNavigate} />) : <FieldsWidget object={object} record={record} />}</div></section>;
}
function RuntimeWidget({ widget, object, record, onNavigate }: { widget: CrmRuntimeWidget; object: CrmRuntimeObject; record: CrmRuntimeRecord; onNavigate: Props['onNavigate'] }) {
  const type = widget.type || widget.configuration?.type || 'FIELDS';
  if (['FIELDS', 'FIELD'].includes(type)) return <FieldsWidget object={object} record={record} fieldKey={widget.configuration?.fieldKey ?? undefined} title={widget.title} />;
  if (type === 'STANDALONE_RICH_TEXT') return <div className="runtime-widget"><h4>{widget.title || '说明'}</h4><p className="runtime-rich-text">{String((widget.configuration?.body as { markdown?: unknown } | null)?.markdown ?? '')}</p></div>;
  if (type === 'EMAILS' || type === 'EMAIL_THREAD') return null;
  const navigation: Partial<Record<string, Parameters<Props['onNavigate']>[0]>> = { TASKS: 'tasks', NOTES: 'notes', FILES: 'files', CALENDAR: 'calendar', WORKFLOW: 'workflows', TIMELINE: 'notes' };
  if (navigation[type]) return <div className="runtime-widget runtime-action-widget"><div><h4>{widget.title || widgetLabel(type)}</h4><p>该能力由现有受控 GBAP 业务实现承载，保持 Twenty Record Page 的业务入口，同时不绕过身份和数据边界。</p></div><button className="crm-link-button" onClick={() => onNavigate(navigation[type]!)}>打开{widgetLabel(type)}</button></div>;
  if (type === 'IFRAME') { const url = widget.configuration?.url; return <div className="runtime-widget"><h4>{widget.title || '嵌入内容'}</h4>{url && /^https?:\/\//.test(url) ? <a className="crm-link-button" href={url} target="_blank" rel="noopener noreferrer">在新窗口打开受控内容</a> : <p>未配置可用 URL。</p>}</div>; }
  if (['GRAPH', 'RECORD_TABLE', 'VIEW'].includes(type)) return <div className="runtime-widget"><h4>{widget.title || widgetLabel(type)}</h4><p>已恢复该 Widget 的元数据配置。当前记录：{recordTitle(object, record)}。</p>{widget.configuration?.viewKey && <small>{widget.configuration.viewKey}</small>}</div>;
  return <div className="runtime-widget"><h4>{widget.title || widgetLabel(type)}</h4><p>Twenty Widget：{type}</p></div>;
}
function widgetLabel(type: string) { return ({ TASKS: '任务', NOTES: '笔记', FILES: '文件', CALENDAR: '日历', TIMELINE: '活动时间线', WORKFLOW: '自动化', GRAPH: '图表', RECORD_TABLE: '关联记录', VIEW: '视图' } as Record<string, string>)[type] ?? type; }
function FieldsWidget({ object, record, fieldKey, title }: { object: CrmRuntimeObject; record: CrmRuntimeRecord; fieldKey?: string; title?: string }) {
  const fields = fieldKey ? object.fields.filter((field) => field.fieldKey === fieldKey) : object.fields.filter((field) => field.active && (!field.system || AUDIT_KEYS.has(field.fieldKey)));
  return <div className="runtime-widget"><h4>{title || (fieldKey ? fields[0]?.label : '字段')}</h4><div className="runtime-detail-fields">{fields.map((field) => <div key={field.fieldKey}><span>{field.label}</span><strong>{displayValue(field, record.values[field.fieldKey])}</strong></div>)}</div></div>;
}
function Gate({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) { return <section className="real-data-gate"><div><h2>{title}</h2><p>{detail}</p>{action && <div className="real-data-gate-action">{action}</div>}</div></section>; }
