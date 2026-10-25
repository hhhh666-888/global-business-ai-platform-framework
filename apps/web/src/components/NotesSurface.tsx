import { useCallback, useMemo, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { IconNotes, IconPlus, IconRefresh, IconTimelineEvent } from 'twenty-ui/icon';
import type { GbapSession } from '../hooks/useGbapSession';
import { deleteNoteRecord } from '../lib/crmLifecycleClient';
import { createNote, updateNote, type CrmActivity, type CrmNote, type OperationalTarget } from '../lib/gbapClient';
import {
  useCrmAccountsQuery,
  useCrmActivityQuery,
  useCrmContactsQuery,
  useCrmNotesQuery,
  useCrmOpportunitiesQuery,
} from '../lib/crmEntityQueries';
import { BusinessRecordModal } from './BusinessRecordModal';
import { BusinessRelationPicker, type BusinessRelationOption } from './BusinessRelationPicker';
import './crm-object-surfaces.css';

type Props = { session: GbapSession; search: string };
type TargetOption = OperationalTarget & BusinessRelationOption;
function businessError(cause: unknown, fallback: string) { const status = typeof cause === 'object' && cause && 'status' in cause ? Number((cause as { status?: number }).status) : 0; if (status === 401) return '登录状态已失效，请重新登录。'; if (status === 409) return '关联的业务记录已发生变化，请刷新后重试。'; if (status >= 500) return '笔记服务暂时不可用，请稍后刷新重试。'; return fallback; }
function targetKey(target: OperationalTarget) { return `${target.businessType}:${target.businessId}`; }
function when(value: string | null | undefined) { if (!value) return ''; const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }

export function NotesSurface({ session, search }: Props) {
  const notesQuery = useCrmNotesQuery(session);
  const activityQuery = useCrmActivityQuery(session);
  const accountQuery = useCrmAccountsQuery(session);
  const contactQuery = useCrmContactsQuery(session);
  const opportunityQuery = useCrmOpportunitiesQuery(session);
  const records = notesQuery.data ?? [];
  const activity = activityQuery.data ?? [];
  const accounts = accountQuery.data ?? [];
  const contacts = contactQuery.data ?? [];
  const opportunities = opportunityQuery.data ?? [];
  const queries = [notesQuery, activityQuery, accountQuery, contactQuery, opportunityQuery];
  const loading = queries.some((query) => query.isPending && !query.data);
  const refreshing = queries.some((query) => query.isFetching);
  const loadError = queries.map((query) => query.error).find(Boolean) ?? null;

  const accountByBusinessId = useMemo(() => new Map(accounts.filter((item) => item.businessId).map((item) => [item.businessId!, item])), [accounts]);
  const targetOptions = useMemo<TargetOption[]>(() => [
    ...accounts.filter((item) => item.businessId).map((item) => ({
      businessType: 'Account' as const,
      businessId: item.businessId!,
      key: `Account:${item.businessId}`,
      label: `客户公司 · ${item.displayName}`,
      searchText: [item.displayName, item.commercialName, item.registrationId, item.registrationCountry, item.addressCountry, item.addressState, item.addressCity, item.industry, item.primaryEmail, item.primaryPhone, item.website, item.accountOwnerUserId].filter(Boolean).join(' '),
    })),
    ...contacts.filter((item) => item.businessId).map((item) => ({
      businessType: 'Contact' as const,
      businessId: item.businessId!,
      key: `Contact:${item.businessId}`,
      label: `联系人 · ${item.personName}`,
      searchText: [item.personName, item.email, item.phone, item.jobTitle, item.linkedinUrl, item.accountBusinessId ? accountByBusinessId.get(item.accountBusinessId)?.displayName : null].filter(Boolean).join(' '),
    })),
    ...opportunities.filter((item) => item.businessId).map((item) => ({
      businessType: 'Opportunity' as const,
      businessId: item.businessId!,
      key: `Opportunity:${item.businessId}`,
      label: `商机 · ${item.nameSummary}`,
      searchText: [item.nameSummary, item.nextStep, item.accountBusinessId ? accountByBusinessId.get(item.accountBusinessId)?.displayName : null].filter(Boolean).join(' '),
    })),
  ], [accounts, contacts, opportunities, accountByBusinessId]);

  const setRecords = useCallback((updater: React.SetStateAction<CrmNote[]>) => {
    notesQuery.setData((current) => {
      const base = current ?? [];
      return typeof updater === 'function' ? updater(base) : updater;
    });
  }, [notesQuery.setData]);
  const setActivity = useCallback((updater: React.SetStateAction<CrmActivity[]>) => {
    activityQuery.setData((current) => {
      const base = current ?? [];
      return typeof updater === 'function' ? updater(base) : updater;
    });
  }, [activityQuery.setData]);
  const refetch = useCallback(() => {
    void Promise.all([notesQuery.refetch(), activityQuery.refetch(), accountQuery.refetch(), contactQuery.refetch(), opportunityQuery.refetch()]);
  }, [accountQuery.refetch, activityQuery.refetch, contactQuery.refetch, notesQuery.refetch, opportunityQuery.refetch]);

  const [error, setError] = useState<string | null>(null); const [success, setSuccess] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false); const [editing, setEditing] = useState<CrmNote | null>(null); const [title, setTitle] = useState(''); const [bodyMarkdown, setBodyMarkdown] = useState(''); const [targetValue, setTargetValue] = useState(''); const [saving, setSaving] = useState(false); const [deletingId, setDeletingId] = useState<string | null>(null);
  const targetLabels = useMemo(() => new Map(targetOptions.map((item) => [item.key, item.label])), [targetOptions]);
  const filteredNotes = useMemo(() => { const q = search.trim().toLowerCase(); if (!q) return records; return records.filter((item) => `${item.title} ${item.bodyMarkdown ?? ''} ${item.targets.map((target) => targetLabels.get(targetKey(target)) ?? '').join(' ')}`.toLowerCase().includes(q)); }, [records, search, targetLabels]);
  const filteredActivity = useMemo(() => { const q = search.trim().toLowerCase(); if (!q) return activity; return activity.filter((item) => `${item.title} ${item.bodyMarkdown ?? ''}`.toLowerCase().includes(q)); }, [activity, search]);
  const resetForm = () => { setEditing(null); setTitle(''); setBodyMarkdown(''); setTargetValue(''); setCreateOpen(false); };
  const startEdit = (note: CrmNote) => { setEditing(note); setTitle(note.title); setBodyMarkdown(note.bodyMarkdown ?? ''); setTargetValue(''); setCreateOpen(true); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!title.trim() || saving) return; setSaving(true); setError(null); setSuccess(null);
    try {
      if (editing) {
        const updated = await updateNote(editing.businessId, { title: title.trim(), bodyMarkdown });
        setRecords((current) => current.map((item) => item.businessId === updated.businessId ? updated : item));
        setActivity((current) => current.map((item) => item.kind === 'NOTE' && item.businessId === updated.businessId ? { ...updated, kind: 'NOTE' as const } : item));
        setSuccess('笔记已更新。');
      } else {
        const selected = targetOptions.find((item) => item.key === targetValue);
        const created = await createNote({ title: title.trim(), bodyMarkdown, targets: selected ? [{ businessType: selected.businessType, businessId: selected.businessId }] : [] });
        setRecords((current) => [created, ...current.filter((item) => item.businessId !== created.businessId)]);
        setActivity((current) => [{ ...created, kind: 'NOTE' as const }, ...current.filter((item) => !(item.kind === 'NOTE' && item.businessId === created.businessId))]);
        setSuccess('笔记已创建。');
      }
      resetForm();
    } catch (cause) { setError(businessError(cause, editing ? '笔记更新失败，请重试。' : '笔记创建失败，请检查填写内容后重试。')); }
    finally { setSaving(false); }
  };
  const remove = async (note: CrmNote) => {
    if (deletingId || !window.confirm(`确认删除笔记“${note.title}”？`)) return;
    setDeletingId(note.businessId); setError(null); setSuccess(null);
    try { await deleteNoteRecord(note.businessId); setRecords((current) => current.filter((item) => item.businessId !== note.businessId)); setActivity((current) => current.filter((item) => !(item.kind === 'NOTE' && item.businessId === note.businessId))); if (editing?.businessId === note.businessId) resetForm(); setSuccess('笔记已删除。'); }
    catch (cause) { setError(businessError(cause, '笔记删除失败，请重试。')); }
    finally { setDeletingId(null); }
  };

  if (session.status === 'initializing') return <Gate title="正在加载笔记" detail="正在恢复企业登录状态…" />;
  if (session.status !== 'authenticated') return <Gate title="登录后查看笔记" detail="登录企业账号后即可记录客户信息与销售活动。" action={<Button title="企业登录" onClick={() => void session.login('notes')} />} />;
  const visibleError = error ?? (loadError ? businessError(loadError, '笔记与活动加载失败，请刷新后重试。') : null);
  return <div className="crm-notes-layout" data-surface="real-note-wiring"><section className="panel flush"><div className="object-toolbar"><div><h2>笔记</h2><p>{loading ? '正在加载…' : `${filteredNotes.length} 条笔记${refreshing ? ' · 后台同步中' : ''}`}</p></div><div className="toolbar-actions"><button className="tool-button" onClick={refetch} disabled={refreshing}><IconRefresh size={15} /> {refreshing ? '同步中' : '刷新'}</button><button type="button" className="tool-button page-primary-action" onClick={() => { resetForm(); setCreateOpen(true); }}><IconPlus size={15} /> 新建笔记</button></div></div>{visibleError && <div className="real-error" role="alert">{visibleError}</div>}{success && <div className="real-success" role="status">{success}</div>}
  {createOpen && <BusinessRecordModal title={editing ? '查看 / 编辑笔记' : '新建笔记'} description={editing ? editing.title : '记录客户需求、决策和后续动作。'} onClose={resetForm} width="medium"><form className="crm-create-form crm-note-form" onSubmit={submit}><label>标题<input aria-label="笔记标题" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如 客户需求沟通记录" autoFocus /></label>{!editing && <label>关联记录<BusinessRelationPicker ariaLabel="笔记关联记录" value={targetValue} onChange={setTargetValue} options={targetOptions} emptyLabel="不关联" searchPlaceholder="搜索客户公司、联系人或商机…" /></label>}<label className="crm-wide-field">内容<textarea aria-label="笔记内容" value={bodyMarkdown} onChange={(event) => setBodyMarkdown(event.target.value)} placeholder="记录需求、决策、承诺和后续动作" /></label><div className="crm-form-actions">{editing && <button type="button" className="danger-text-button" disabled={deletingId === editing.businessId} onClick={() => void remove(editing)}>{deletingId === editing.businessId ? '删除中…' : '删除笔记'}</button>}<Button title="取消" variant="secondary" size="small" type="button" onClick={resetForm} /><Button title={saving ? '保存中' : editing ? '保存修改' : '创建'} size="small" type="submit" disabled={!title.trim() || saving} /></div></form></BusinessRecordModal>}
  <div className="crm-note-list">{filteredNotes.map((note) => <article className="crm-note-card crm-note-card-actions-first" key={note.businessId}><button className="text-action crm-note-leading-action" onClick={() => startEdit(note)}>查看 / 编辑</button><div className="crm-note-icon"><IconNotes size={16} /></div><div className="crm-note-main"><div><strong>{note.title}</strong><time>{when(note.updatedAt ?? note.createdAt)}</time></div>{note.bodyMarkdown && <p>{note.bodyMarkdown}</p>}<small>{note.targets.map((target) => targetLabels.get(targetKey(target))).filter(Boolean).join(' · ') || '未关联业务记录'}</small></div></article>)}{!loading && filteredNotes.length === 0 && <div className="real-empty">{search ? '没有匹配的笔记。' : '还没有笔记。点击“新建笔记”记录客户信息。'}</div>}</div></section><section className="panel flush"><div className="object-toolbar"><div><h2>活动时间线</h2><p>真实任务与笔记活动{refreshing ? ' · 后台同步中' : ''}</p></div><IconTimelineEvent size={18} /></div><div className="activity-list crm-real-activity-list">{filteredActivity.map((item) => <div className="activity-row" key={`${item.kind}-${item.businessId}`}><div className="activity-icon">{item.kind === 'TASK' ? <IconTimelineEvent size={16} /> : <IconNotes size={16} />}</div><div><strong>{item.title}</strong><p>{item.kind === 'TASK' ? `任务 · ${item.status === 'DONE' ? '已完成' : '待办'}` : '笔记'}{item.bodyMarkdown ? ` · ${item.bodyMarkdown}` : ''}</p></div><time>{when(item.updatedAt ?? item.createdAt)}</time></div>)}{!loading && filteredActivity.length === 0 && <div className="real-empty">暂无活动记录。</div>}</div></section></div>;
}
function Gate({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) { return <section className="real-data-gate"><div className="real-data-gate-icon"><IconNotes size={22} /></div><div><h2>{title}</h2><p>{detail}</p>{action && <div className="real-data-gate-action">{action}</div>}</div></section>; }
