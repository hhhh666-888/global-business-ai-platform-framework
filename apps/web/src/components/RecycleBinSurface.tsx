import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconRefresh } from 'twenty-ui/icon';
import type { GbapSession } from '../hooks/useGbapSession';
import { bulkDeleteCrmRecordsInChunks } from '../lib/crmAdminBulkClient';
import { invalidateCrmEntities } from '../lib/crmEntityQueries';
import { destroyCrmFile, listDeletedCrmFiles, restoreCrmFile } from '../lib/crmFileLifecycleClient';
import type { CrmFile } from '../lib/gbapClient';
import {
  destroyCrmRuntimeRecord,
  getCrmRuntimeSchema,
  listCrmRuntimeRecords,
  restoreCrmRuntimeRecord,
  type CrmRuntimeObject,
  type CrmRuntimeRecord,
} from '../lib/crmRuntimeClient';
import './crm-object-surfaces.css';

type Props = { session: GbapSession };
type DeletedItem = { object: CrmRuntimeObject; record: CrmRuntimeRecord };

const RECYCLE_OBJECTS = new Set(['company', 'person', 'opportunity', 'task', 'note']);
const LIVE_CACHE_ENTITY: Record<string, string> = {
  company: 'accounts',
  person: 'contacts',
  opportunity: 'opportunities',
  task: 'tasks',
  note: 'notes',
};

function deletedItemKey(item: DeletedItem) { return `${item.object.objectKey}:${item.record.businessId}`; }

function invalidateRestoredRecord(session: GbapSession, objectKey: string) {
  const entity = LIVE_CACHE_ENTITY[objectKey];
  if (!entity) return;
  invalidateCrmEntities(session, objectKey === 'task' || objectKey === 'note' ? [entity, 'activity'] : [entity]);
}

function recordTitle(object: CrmRuntimeObject, record: CrmRuntimeRecord) {
  const values = record.values ?? {};
  for (const key of ['name', 'title', 'displayName']) {
    const value = values[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  const first = typeof values.firstName === 'string' ? values.firstName.trim() : '';
  const last = typeof values.lastName === 'string' ? values.lastName.trim() : '';
  const fullName = [first, last].filter(Boolean).join(' ');
  if (fullName) return fullName;
  const labelField = object.fields.find((field) => !field.system && ['TEXT', 'FULL_NAME'].includes(field.type));
  const fallback = labelField ? values[labelField.fieldKey] : null;
  if (typeof fallback === 'string' && fallback.trim()) return fallback.trim();
  return `记录 ${record.businessId.slice(0, 8)}`;
}

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function errorMessage(cause: unknown, fallback: string) {
  const status = typeof cause === 'object' && cause && 'status' in cause ? Number((cause as { status?: number }).status) : 0;
  if (status === 401) return '登录状态已失效，请重新登录。';
  if (status === 403) return '当前账号没有执行此操作的权限。';
  if (status >= 500) return '回收站服务暂时不可用，请稍后刷新重试。';
  return fallback;
}

export function RecycleBinSurface({ session }: Props) {
  const [items, setItems] = useState<DeletedItem[]>([]);
  const [files, setFiles] = useState<CrmFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(() => new Set());
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isAdmin = session.status === 'authenticated' && Boolean(session.identity?.roles?.includes('substrate-admin'));

  const load = useCallback(async () => {
    if (session.status !== 'authenticated') return;
    setLoading(true);
    setError(null);
    try {
      const [schema, deletedFiles] = await Promise.all([getCrmRuntimeSchema(), listDeletedCrmFiles()]);
      const objects = schema.objects.filter((object) => RECYCLE_OBJECTS.has(object.objectKey));
      const deleted = await Promise.all(objects.map(async (object) => {
        const result = await listCrmRuntimeRecords(object.objectKey, { limit: 300, deleted: true });
        return result.records.map((record) => ({ object, record }));
      }));
      setItems(deleted.flat());
      setFiles(deletedFiles);
      setSelectedRecords(new Set());
      setSelectedFiles(new Set());
    } catch (cause) {
      setError(errorMessage(cause, '回收站加载失败，请刷新后重试。'));
    } finally {
      setLoading(false);
    }
  }, [session.status]);

  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, DeletedItem[]>();
    for (const item of items) {
      const rows = map.get(item.object.objectKey) ?? [];
      rows.push(item);
      map.set(item.object.objectKey, rows);
    }
    return [...map.entries()].map(([objectKey, rows]) => ({ objectKey, object: rows[0].object, rows }));
  }, [items]);

  const restore = async (item: DeletedItem) => {
    const key = deletedItemKey(item);
    if (busyKey || bulkBusy) return;
    setBusyKey(key); setError(null); setNotice(null);
    try {
      await restoreCrmRuntimeRecord(item.object.objectKey, item.record.businessId);
      invalidateRestoredRecord(session, item.object.objectKey);
      setItems((current) => current.filter((row) => row !== item));
      setSelectedRecords((current) => { const next = new Set(current); next.delete(key); return next; });
      setNotice(`“${recordTitle(item.object, item.record)}”已恢复。`);
    } catch (cause) {
      setError(errorMessage(cause, '记录恢复失败，请重试。'));
    } finally {
      setBusyKey(null);
    }
  };

  const destroy = async (item: DeletedItem) => {
    if (!isAdmin || busyKey || bulkBusy) return;
    const title = recordTitle(item.object, item.record);
    if (!window.confirm(`永久删除“${title}”？\n\n永久删除后无法恢复。`)) return;
    const key = deletedItemKey(item);
    setBusyKey(key); setError(null); setNotice(null);
    try {
      await destroyCrmRuntimeRecord(item.object.objectKey, item.record.businessId);
      invalidateRestoredRecord(session, item.object.objectKey);
      setItems((current) => current.filter((row) => row !== item));
      setSelectedRecords((current) => { const next = new Set(current); next.delete(key); return next; });
      setNotice(`“${title}”已永久删除。`);
    } catch (cause) {
      setError(errorMessage(cause, '永久删除失败，请重试。'));
    } finally {
      setBusyKey(null);
    }
  };

  const restoreFile = async (file: CrmFile) => {
    const key = `file:${file.id}`;
    if (busyKey || bulkBusy) return;
    setBusyKey(key); setError(null); setNotice(null);
    try {
      await restoreCrmFile(file.id);
      invalidateCrmEntities(session, ['files']);
      setFiles((current) => current.filter((item) => item.id !== file.id));
      setSelectedFiles((current) => { const next = new Set(current); next.delete(file.id); return next; });
      setNotice(`文件“${file.fileName}”已恢复。`);
    } catch (cause) {
      setError(errorMessage(cause, '文件恢复失败，请重试。'));
    } finally {
      setBusyKey(null);
    }
  };

  const destroyFile = async (file: CrmFile) => {
    if (!isAdmin || busyKey || bulkBusy) return;
    if (!window.confirm(`永久删除文件“${file.fileName}”？\n\n永久删除后无法恢复。`)) return;
    const key = `file:${file.id}`;
    setBusyKey(key); setError(null); setNotice(null);
    try {
      await destroyCrmFile(file.id);
      invalidateCrmEntities(session, ['files']);
      setFiles((current) => current.filter((item) => item.id !== file.id));
      setSelectedFiles((current) => { const next = new Set(current); next.delete(file.id); return next; });
      setNotice(`文件“${file.fileName}”已永久删除。`);
    } catch (cause) {
      setError(errorMessage(cause, '文件永久删除失败，请重试。'));
    } finally {
      setBusyKey(null);
    }
  };

  const selectedCount = selectedRecords.size + selectedFiles.size;
  const toggleRecord = (key: string) => setSelectedRecords((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleFile = (id: string) => setSelectedFiles((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectAll = () => {
    if (!isAdmin) return;
    setSelectedRecords(new Set(items.map(deletedItemKey)));
    setSelectedFiles(new Set(files.map((file) => file.id)));
  };
  const clearSelection = () => { setSelectedRecords(new Set()); setSelectedFiles(new Set()); };

  const destroySelected = async () => {
    if (!isAdmin || bulkBusy || busyKey || selectedCount === 0) return;
    if (!window.confirm(`永久删除所选 ${selectedCount} 条记录？\n\n此操作仅限超级管理员，执行后无法恢复。`)) return;
    setBulkBusy(true); setError(null); setNotice(null);
    const removedFiles = new Set<string>();
    const removedRecords = new Set<string>();
    const failures: string[] = [];

    for (const file of files.filter((entry) => selectedFiles.has(entry.id))) {
      try {
        await destroyCrmFile(file.id);
        removedFiles.add(file.id);
      } catch {
        failures.push(`文件：${file.fileName}`);
      }
    }
    if (removedFiles.size > 0) invalidateCrmEntities(session, ['files']);

    const selectedItems = items.filter((entry) => selectedRecords.has(deletedItemKey(entry)));
    const byObject = new Map<string, DeletedItem[]>();
    for (const item of selectedItems) {
      const rows = byObject.get(item.object.objectKey) ?? [];
      rows.push(item);
      byObject.set(item.object.objectKey, rows);
    }
    for (const [objectKey, objectItems] of byObject) {
      try {
        const result = await bulkDeleteCrmRecordsInChunks(objectKey, objectItems.map((item) => item.record.businessId), 'destroy');
        const succeeded = new Set(result.succeeded);
        for (const item of objectItems) {
          if (succeeded.has(item.record.businessId)) removedRecords.add(deletedItemKey(item));
        }
        for (const failure of result.failed) {
          const item = objectItems.find((candidate) => candidate.record.businessId === failure.businessId);
          failures.push(item ? recordTitle(item.object, item.record) : failure.businessId.slice(0, 8));
        }
        if (succeeded.size > 0) invalidateRestoredRecord(session, objectKey);
      } catch {
        failures.push(...objectItems.map((item) => recordTitle(item.object, item.record)));
      }
    }

    setFiles((current) => current.filter((file) => !removedFiles.has(file.id)));
    setItems((current) => current.filter((item) => !removedRecords.has(deletedItemKey(item))));
    setSelectedFiles((current) => new Set([...current].filter((id) => !removedFiles.has(id))));
    setSelectedRecords((current) => new Set([...current].filter((key) => !removedRecords.has(key))));
    const successCount = removedFiles.size + removedRecords.size;
    if (failures.length > 0) setError(`批量永久删除完成 ${successCount} 条，${failures.length} 条失败：${failures.slice(0, 5).join('、')}${failures.length > 5 ? '…' : ''}`);
    else setNotice(`已永久删除 ${successCount} 条所选记录。`);
    setBulkBusy(false);
  };

  const totalCount = items.length + files.length;

  if (session.status === 'initializing') return <section className="real-data-gate"><div><h2>正在加载回收站</h2><p>正在恢复企业登录状态…</p></div></section>;
  if (session.status !== 'authenticated') return <section className="real-data-gate"><div><h2>登录后查看回收站</h2><p>登录企业账号后可以恢复误删除的业务记录。</p></div></section>;

  return <section className="panel flush" data-surface="crm-recycle-bin">
    <div className="object-toolbar">
      <div><h2>回收站</h2><p>{loading ? '正在更新…' : `${totalCount} 条已删除记录 · 可恢复误删除的数据`}</p></div>
      <div className="toolbar-actions">
        {isAdmin && totalCount > 0 && <>
          <button className="tool-button" data-testid="recycle-select-all" onClick={selectAll} disabled={bulkBusy}>全选</button>
          {selectedCount > 0 && <button className="tool-button" onClick={clearSelection} disabled={bulkBusy}>取消选择</button>}
          <button className="danger-text-button" data-testid="recycle-bulk-destroy" onClick={() => void destroySelected()} disabled={selectedCount === 0 || bulkBusy}>{bulkBusy ? '批量删除中…' : `永久删除所选 (${selectedCount})`}</button>
        </>}
        <button className="tool-button" onClick={() => void load()} disabled={loading || bulkBusy}><IconRefresh size={15} /> {loading ? '刷新中' : '刷新'}</button>
      </div>
    </div>
    {error && <div className="real-error" role="alert">{error}</div>}
    {notice && <div className="real-success" role="status">{notice}</div>}
    {isAdmin
      ? <div className="form-guidance">超级管理员可勾选多条记录批量永久删除。永久删除无法恢复；建议先确认关联文件和业务记录均不再需要。</div>
      : <div className="form-guidance">员工可以恢复误删除的数据；批量删除和永久删除仅由超级管理员执行。</div>}
    {grouped.map((group) => <div className="table-wrap" key={group.objectKey}>
      <table>
        <thead><tr>{isAdmin && <th aria-label="选择" />}<th>{group.object.labelPlural}</th><th>记录编号</th><th>操作</th></tr></thead>
        <tbody>{group.rows.map((item) => {
          const key = deletedItemKey(item);
          return <tr key={key}>
            {isAdmin && <td><input aria-label={`选择${recordTitle(item.object, item.record)}`} type="checkbox" checked={selectedRecords.has(key)} onChange={() => toggleRecord(key)} disabled={bulkBusy} /></td>}
            <td><strong>{recordTitle(item.object, item.record)}</strong></td>
            <td>{item.record.businessId.slice(0, 8)}</td>
            <td><div className="toolbar-actions"><button className="text-action" disabled={busyKey === key || bulkBusy} onClick={() => void restore(item)}>{busyKey === key ? '处理中…' : '恢复'}</button>{isAdmin && <button className="danger-text-button" disabled={busyKey === key || bulkBusy} onClick={() => void destroy(item)}>永久删除</button>}</div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>)}
    {files.length > 0 && <div className="table-wrap">
      <table>
        <thead><tr>{isAdmin && <th aria-label="选择" />}<th>文件</th><th>大小</th><th>操作</th></tr></thead>
        <tbody>{files.map((file) => {
          const key = `file:${file.id}`;
          return <tr key={key}>
            {isAdmin && <td><input aria-label={`选择文件${file.fileName}`} type="checkbox" checked={selectedFiles.has(file.id)} onChange={() => toggleFile(file.id)} disabled={bulkBusy} /></td>}
            <td><strong>{file.fileName}</strong></td>
            <td>{sizeLabel(file.sizeBytes)}</td>
            <td><div className="toolbar-actions"><button className="text-action" disabled={busyKey === key || bulkBusy} onClick={() => void restoreFile(file)}>{busyKey === key ? '处理中…' : '恢复'}</button>{isAdmin && <button className="danger-text-button" disabled={busyKey === key || bulkBusy} onClick={() => void destroyFile(file)}>永久删除</button>}</div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
    {!loading && totalCount === 0 && <div className="real-empty">回收站为空。</div>}
  </section>;
}