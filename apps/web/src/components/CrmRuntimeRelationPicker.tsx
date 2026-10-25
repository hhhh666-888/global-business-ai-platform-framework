import { useEffect, useMemo, useState } from 'react';
import {
  getCrmRuntimeRecord,
  getCrmRuntimeSchema,
  listCrmRuntimeRecords,
  type CrmRuntimeField,
  type CrmRuntimeObject,
  type CrmRuntimeRecord,
} from '../lib/crmRuntimeClient';

type Props = {
  field: CrmRuntimeField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
};

function fullName(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return String(value ?? '');
  const row = value as Record<string, unknown>;
  return [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
}
function simpleValue(value: unknown) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object' && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    return fullName(value) || String(row.primaryEmail ?? row.primaryLinkUrl ?? row.primaryPhoneNumber ?? '');
  }
  return String(value);
}
function recordTitle(object: CrmRuntimeObject, record: CrmRuntimeRecord) {
  const preferred = object.fields.find((item) => ['name', 'title'].includes(item.fieldKey))
    ?? object.fields.find((item) => ['FULL_NAME', 'TEXT'].includes(item.type) && !item.system)
    ?? object.fields.find((item) => !item.system);
  return preferred ? simpleValue(record.values[preferred.fieldKey]) || object.labelSingular : object.labelSingular;
}
function selectedBusinessId(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) return String((value as { businessId?: unknown }).businessId ?? '');
  return '';
}

export function CrmRuntimeRelationPicker({ field, value, onChange, disabled = false }: Props) {
  const targetKey = field.relation?.targetObjectKey ?? '';
  const selectedId = selectedBusinessId(value);
  const [object, setObject] = useState<CrmRuntimeObject | null>(null);
  const [records, setRecords] = useState<CrmRuntimeRecord[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!targetKey) return;
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    void (async () => {
      try {
        const [schema, list] = await Promise.all([getCrmRuntimeSchema(), listCrmRuntimeRecords(targetKey, { limit: 500 })]);
        if (cancelled) return;
        const targetObject = schema.objects.find((item) => item.objectKey === targetKey) ?? null;
        if (!targetObject) throw new Error('relation_object_unavailable');
        let next = list.records;
        if (selectedId && !next.some((item) => item.businessId === selectedId)) {
          try {
            const selected = await getCrmRuntimeRecord(targetKey, selectedId);
            next = [selected.record, ...next];
          } catch { throw new Error('selected_relation_unavailable'); }
        }
        if (cancelled) return;
        setObject(targetObject);
        setRecords(next);
      } catch {
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [targetKey, selectedId, reload]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || !object) return records;
    return records.filter((record) => recordTitle(object, record).toLowerCase().includes(needle));
  }, [records, object, query]);

  return <div className="rtw-relation-picker">
    <input
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }}
      placeholder={loading ? '加载关联记录…' : `搜索${object?.labelPlural ?? '关联记录'}…`}
      disabled={disabled || loading || loadFailed}
    />
    <select
      value={selectedId}
      disabled={disabled || loading || loadFailed}
      onChange={(event) => onChange(event.target.value ? { businessId: event.target.value, objectKey: targetKey } : null)}
    >
      <option value="">未关联</option>
      {filtered.map((record) => <option key={record.businessId} value={record.businessId}>{object ? recordTitle(object, record) : '关联记录'}</option>)}
    </select>
    {loadFailed && <div role="alert"><small>关联记录暂时无法加载，请重试。</small><button type="button" disabled={disabled || loading} onClick={() => setReload(value => value + 1)}>重新加载关联记录</button></div>}
    {selectedId && object && <small>当前：{recordTitle(object, records.find((item) => item.businessId === selectedId) ?? { businessId: selectedId, objectKey: targetKey, values: {}, deleted: false })}</small>}
  </div>;
}
