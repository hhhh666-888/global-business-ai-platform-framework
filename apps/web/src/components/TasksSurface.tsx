import { useCallback, useMemo, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { IconCheck, IconPlus, IconRefresh } from 'twenty-ui/icon';
import type { GbapSession } from '../hooks/useGbapSession';
import {
  createTask,
  updateTask,
  type CrmTask,
  type OperationalTarget,
} from '../lib/gbapClient';
import {
  useCrmAccountsQuery,
  useCrmContactsQuery,
  useCrmOpportunitiesQuery,
  useCrmTasksQuery,
} from '../lib/crmEntityQueries';
import { BusinessRecordModal } from './BusinessRecordModal';
import { BusinessRelationPicker, type BusinessRelationOption } from './BusinessRelationPicker';
import './crm-object-surfaces.css';

type Props = { session: GbapSession; search: string };
type TargetOption = OperationalTarget & BusinessRelationOption;

function businessError(cause: unknown, fallback: string) {
  const status = typeof cause === 'object' && cause && 'status' in cause ? Number((cause as { status?: number }).status) : 0;
  if (status === 401) return '登录状态已失效，请重新登录。';
  if (status === 409) return '关联的业务记录已发生变化，请刷新后重试。';
  if (status >= 500) return '任务服务暂时不可用，请稍后刷新重试。';
  return fallback;
}
function displayDue(value: string | null) { if (!value) return '未设置'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '未设置' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
function targetKey(target: OperationalTarget) { return `${target.businessType}:${target.businessId}`; }

export function TasksSurface({ session, search }: Props) {
  const taskQuery = useCrmTasksQuery(session);
  const accountQuery = useCrmAccountsQuery(session);
  const contactQuery = useCrmContactsQuery(session);
  const opportunityQuery = useCrmOpportunitiesQuery(session);
  const records = taskQuery.data ?? [];
  const accounts = accountQuery.data ?? [];
  const contacts = contactQuery.data ?? [];
  const opportunities = opportunityQuery.data ?? [];
  const loading = [taskQuery, accountQuery, contactQuery, opportunityQuery].some((query) => query.isPending && !query.data);
  const refreshing = [taskQuery, accountQuery, contactQuery, opportunityQuery].some((query) => query.isFetching);
  const loadError = taskQuery.error ?? accountQuery.error ?? contactQuery.error ?? opportunityQuery.error;

  const accountByBusinessId = useMemo(() => new Map(accounts.filter((item) => item.businessId).map((item) => [item.businessId!, item])), [accounts]);
  const targetOptions = useMemo<TargetOption[]>(() => [
    ...accounts.filter((item) => item.businessId).map((item) => ({
      businessType: 'Account' as const,
      businessId: item.businessId!,
      key: `Account:${item.businessId}`,
      label: `客户公司 · ${item.displayName}`,
      searchText: [item.displayName, item.commercialName, item.registrationId, item.addressCountry, item.addressState, item.addressCity, item.industry, item.primaryEmail, item.primaryPhone, item.website, item.accountOwnerUserId].filter(Boolean).join(' '),
    })),
    ...contacts.filter((item) => item.businessId).map((item) => ({
      businessType: 'Contact' as const,
      businessId: item.businessId!,
      key: `Contact:${item.businessId}`,
      label: `联系人 · ${item.personName}`,
      searchText: [item.personName, item.email, item.phone, item.jobTitle, item.accountBusinessId ? accountByBusinessId.get(item.accountBusinessId)?.displayName : null].filter(Boolean).join(' '),
    })),
    ...opportunities.filter((item) => item.businessId).map((item) => ({
      businessType: 'Opportunity' as const,
      businessId: item.businessId!,
      key: `Opportunity:${item.businessId}`,
      label: `商机 · ${item.nameSummary}`,
      searchText: [item.nameSummary, item.nextStep, item.accountBusinessId ? accountByBusinessId.get(item.accountBusinessId)?.displayName : null].filter(Boolean).join(' '),
    })),
  ], [accounts, contacts, opportunities, accountByBusinessId]);

  const setRecords = useCallback((updater: React.SetStateAction<CrmTask[]>) => {
    taskQuery.setData((current) => {
      const base = current ?? [];
      return typeof updater === 'function' ? updater(base) : updater;
    });
  }, [taskQuery.setData]);
  const refetch = useCallback(() => {
    void Promise.all([taskQuery.refetch(), accountQuery.refetch(), contactQuery.refetch(), opportunityQuery.refetch()]);
  }, [accountQuery.refetch, contactQuery.refetch, opportunityQuery.refetch, taskQuery.refetch]);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [bodyMarkdown, setBodyMarkdown] = useState('');
  const [dueLocal, setDueLocal] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [creating, setCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const targetLabels = useMemo(() => new Map(targetOptions.map((item) => [item.key, item.label])), [targetOptions]);
  const filtered = useMemo(() => { const q = search.trim().toLowerCase(); if (!q) return records; return records.filter((item) => `${item.title} ${item.bodyMarkdown ?? ''} ${item.targets.map((target) => targetLabels.get(targetKey(target)) ?? '').join(' ')}`.toLowerCase().includes(q)); }, [records, search, targetLabels]);
  const resetCreate = () => { setTitle(''); setBodyMarkdown(''); setDueLocal(''); setTargetValue(''); };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!title.trim() || creating) return;
    setCreating(true); setError(null); setSuccess(null);
    try {
      const selected = targetOptions.find((item) => item.key === targetValue);
      const created = await createTask({ title: title.trim(), bodyMarkdown, ...(dueLocal ? { dueAt: new Date(dueLocal).toISOString() } : {}), targets: selected ? [{ businessType: selected.businessType, businessId: selected.businessId }] : [] });
      setRecords((current) => [created, ...current.filter((item) => item.businessId !== created.businessId)]);
      resetCreate(); setCreateOpen(false); setSuccess('任务已创建。');
    } catch (cause) { setError(businessError(cause, '任务创建失败，请检查填写内容后重试。')); }
    finally { setCreating(false); }
  };
  const toggle = async (task: CrmTask) => {
    if (updatingId) return;
    setUpdatingId(task.businessId); setError(null); setSuccess(null);
    try { const updated = await updateTask(task.businessId, { status: task.status === 'DONE' ? 'TODO' : 'DONE' }); setRecords((current) => current.map((item) => item.businessId === updated.businessId ? updated : item)); setSuccess(task.status === 'DONE' ? '任务已恢复为待办。' : '任务已完成。'); }
    catch (cause) { setError(businessError(cause, '任务状态更新失败，请重试。')); }
    finally { setUpdatingId(null); }
  };

  if (session.status === 'initializing') return <Gate title="正在加载任务" detail="正在恢复企业登录状态…" />;
  if (session.status !== 'authenticated') return <Gate title="登录后查看任务" detail="登录企业账号后即可管理销售跟进任务。" action={<Button title="企业登录" onClick={() => void session.login('tasks')} />} />;

  const visibleError = error ?? (loadError ? businessError(loadError, '任务加载失败，请刷新后重试。') : null);
  return <section className="panel flush" data-surface="real-task-wiring">
    <div className="object-toolbar"><div><h2>任务</h2><p>{loading ? '正在加载…' : `${filtered.length} 条任务 · ${filtered.filter((item) => item.status !== 'DONE').length} 条待办${refreshing ? ' · 后台同步中' : ''}`}</p></div><div className="toolbar-actions"><button className="tool-button" onClick={refetch} disabled={refreshing}><IconRefresh size={15} /> {refreshing ? '同步中' : '刷新'}</button><button type="button" className="tool-button page-primary-action" onClick={() => { resetCreate(); setCreateOpen(true); }}><IconPlus size={15} /> 新建任务</button></div></div>
    {visibleError && <div className="real-error" role="alert">{visibleError}</div>}{success && <div className="real-success" role="status">{success}</div>}
    {createOpen && <BusinessRecordModal title="新建任务" description="安排下一步销售行动并关联客户、联系人或商机。" onClose={() => setCreateOpen(false)} width="medium"><form className="crm-create-form crm-task-form" onSubmit={submit}><label>任务标题<input aria-label="任务标题" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如 跟进客户电费账单" autoFocus /></label><label>关联记录<BusinessRelationPicker ariaLabel="任务关联记录" value={targetValue} onChange={setTargetValue} options={targetOptions} emptyLabel="不关联" searchPlaceholder="搜索客户公司、联系人或商机…" /></label><label>到期时间<input aria-label="任务到期时间" type="datetime-local" value={dueLocal} onChange={(event) => setDueLocal(event.target.value)} /></label><label className="crm-wide-field">任务说明<textarea aria-label="任务说明" value={bodyMarkdown} onChange={(event) => setBodyMarkdown(event.target.value)} placeholder="补充任务要求或下一步动作" /></label><div className="crm-form-actions"><Button title="取消" variant="secondary" size="small" type="button" onClick={() => setCreateOpen(false)} /><Button title={creating ? '创建中' : '创建'} size="small" type="submit" disabled={!title.trim() || creating} /></div></form></BusinessRecordModal>}
    <div className="task-list crm-real-task-list">{filtered.map((task) => <button key={task.businessId} className={`task-row ${task.status === 'DONE' ? 'done' : ''}`} onClick={() => void toggle(task)} disabled={updatingId === task.businessId}><span className="task-check">{task.status === 'DONE' && <IconCheck size={13} />}</span><span className="task-main"><strong>{task.title}</strong><small>{task.targets.map((target) => targetLabels.get(targetKey(target))).filter(Boolean).join(' · ') || '未关联业务记录'}{task.bodyMarkdown ? ` · ${task.bodyMarkdown}` : ''}</small></span><time>{displayDue(task.dueAt)}</time></button>)}{!loading && filtered.length === 0 && <div className="real-empty">{search ? '没有匹配的任务。' : '还没有任务。点击“新建任务”开始安排跟进。'}</div>}</div>
  </section>;
}
function Gate({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) { return <section className="real-data-gate"><div className="real-data-gate-icon"><IconCheck size={22} /></div><div><h2>{title}</h2><p>{detail}</p>{action && <div className="real-data-gate-action">{action}</div>}</div></section>; }
