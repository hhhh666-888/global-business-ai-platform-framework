import { useCallback, useMemo } from 'react';
import { Button } from 'twenty-ui/input';
import { IconCheck, IconHome, IconLayoutDashboard, IconRefresh, IconTargetArrow, IconTimelineEvent } from 'twenty-ui/icon';
import type { GbapSession } from '../hooks/useGbapSession';
import type { CanonicalOpportunity } from '../lib/crmBusinessClient';
import type { CrmTask } from '../lib/gbapClient';
import { useCrmActivityQuery, useCrmOpportunitiesQuery, useCrmTasksQuery } from '../lib/crmEntityQueries';
import { PageActionsPortal } from './PageActionsPortal';

type WorkbenchPage = 'companies' | 'people' | 'opportunities' | 'tasks' | 'notes';
type Props = { session: GbapSession; onNavigate: (page: WorkbenchPage) => void; onNewOpportunity: () => void };
type CurrencyTotal = { currencyCode: string | null; value: number };

function businessError(cause: unknown) {
  const status = typeof cause === 'object' && cause && 'status' in cause ? Number((cause as { status?: number }).status) : 0;
  if (status === 401) return '登录状态已失效，请重新登录。';
  if (status >= 500) return '工作台数据暂时不可用，请稍后刷新重试。';
  return '工作台加载失败，请刷新后重试。';
}

function normalizedCurrencyCode(value: string | null | undefined) {
  const code = value?.trim().toUpperCase();
  return code || null;
}

function money(value: number, currencyCode: string | null | undefined) {
  const code = normalizedCurrencyCode(currencyCode);
  if (!code) return value.toLocaleString('zh-CN');
  try {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${code} ${value.toLocaleString('zh-CN')}`;
  }
}

function totalsByCurrency(records: CanonicalOpportunity[]): CurrencyTotal[] {
  const totals = new Map<string, CurrencyTotal>();
  for (const item of records) {
    if (typeof item.estimatedValue !== 'number') continue;
    const currencyCode = normalizedCurrencyCode(item.currencyCode);
    const key = currencyCode ?? '__UNSPECIFIED__';
    const current = totals.get(key) ?? { currencyCode, value: 0 };
    current.value += item.estimatedValue;
    totals.set(key, current);
  }
  return [...totals.values()].sort((left, right) => String(left.currencyCode ?? '').localeCompare(String(right.currencyCode ?? '')));
}

function moneySummary(totals: CurrencyTotal[]) {
  if (totals.length === 0) return '未录入金额';
  return totals.map((item) => item.currencyCode ? money(item.value, item.currencyCode) : `未指定币种 ${item.value.toLocaleString('zh-CN')}`).join(' · ');
}

function when(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function WorkbenchSurface({ session, onNavigate, onNewOpportunity }: Props) {
  const opportunityQuery = useCrmOpportunitiesQuery(session);
  const taskQuery = useCrmTasksQuery(session);
  const activityQuery = useCrmActivityQuery(session);
  const opportunities = opportunityQuery.data ?? [];
  const tasks = taskQuery.data ?? [];
  const activity = activityQuery.data ?? [];
  const queries = [opportunityQuery, taskQuery, activityQuery];
  const loading = queries.some((query) => query.isPending && !query.data);
  const refreshing = queries.some((query) => query.isFetching);
  const loadError = queries.map((query) => query.error).find(Boolean) ?? null;
  const refetch = useCallback(() => {
    void Promise.all([opportunityQuery.refetch(), taskQuery.refetch(), activityQuery.refetch()]);
  }, [activityQuery.refetch, opportunityQuery.refetch, taskQuery.refetch]);

  const openOpportunities = useMemo(() => opportunities.filter((item) => item.lifecycleState === 'OPEN'), [opportunities]);
  const pipelineTotals = useMemo(() => totalsByCurrency(openOpportunities), [openOpportunities]);
  const todoTasks = useMemo(() => tasks.filter((item) => item.status !== 'DONE').sort((a, b) => String(a.dueAt ?? '9999').localeCompare(String(b.dueAt ?? '9999'))), [tasks]);
  const completedTasks = tasks.length - todoTasks.length;

  if (session.status === 'initializing') return <Gate title="正在加载销售工作台" detail="正在恢复企业登录状态…" />;
  if (session.status !== 'authenticated') return <Gate title="登录后进入销售工作台" detail="登录企业账号后查看真实商机、待办和最近业务活动。" action={<Button title="企业登录" onClick={() => void session.login('home')} />} />;

  const error = loadError ? businessError(loadError) : null;
  return (
    <div data-surface="real-workbench">
      <section className="workbench-heading workbench-actions-only workbench-actions-portaled" aria-label="工作台操作">
        <PageActionsPortal activityManaged><button className="tool-button" onClick={refetch} disabled={refreshing}><IconRefresh size={15} /> {refreshing ? '同步中' : '刷新'}</button><button type="button" className="tool-button page-primary-action" onClick={onNewOpportunity}>新建商机</button></PageActionsPortal>
      </section>
      {error && <div className="real-error" role="alert">{error}</div>}
      {refreshing && <div className="background-sync-note" role="status">后台同步最新销售数据…</div>}

      <section className="stats-row" aria-label="销售概览">
        <div className="stat"><div className="stat-head"><div className="stat-label">进行中商机</div><div className="stat-icon"><IconTargetArrow size={15} /></div></div><div className="stat-value">{openOpportunities.length}</div><div className="stat-hint">当前仍在推进的商机</div></div>
        <div className="stat"><div className="stat-head"><div className="stat-label">商机金额</div><div className="stat-icon"><IconLayoutDashboard size={15} /></div></div><div className="stat-value compact-value">{moneySummary(pipelineTotals)}</div><div className="stat-hint">按币种汇总已录入预计金额</div></div>
        <div className="stat"><div className="stat-head"><div className="stat-label">待办任务</div><div className="stat-icon"><IconCheck size={15} /></div></div><div className="stat-value">{todoTasks.length}</div><div className="stat-hint">尚未完成的下一步行动</div></div>
        <div className="stat"><div className="stat-head"><div className="stat-label">已完成任务</div><div className="stat-icon"><IconTimelineEvent size={15} /></div></div><div className="stat-value">{completedTasks}</div><div className="stat-hint">当前任务记录中的已完成项</div></div>
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-head"><div><h2>下一步任务</h2><p>按到期时间排列</p></div><button className="text-action" onClick={() => onNavigate('tasks')}>查看全部</button></div>
          <div className="task-list compact">
            {todoTasks.slice(0, 6).map((task: CrmTask) => <button className="task-row" key={task.businessId} onClick={() => onNavigate('tasks')}><span className="task-check" /><span className="task-main"><strong>{task.title}</strong><small>{task.bodyMarkdown || '打开任务查看详情'}</small></span><time>{task.dueAt ? when(task.dueAt) : '未设置'}</time></button>)}
            {!loading && todoTasks.length === 0 && <div className="real-empty">当前没有待办任务。</div>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><div><h2>商机概览</h2><p>当前进行中的真实商机</p></div><button className="text-action" onClick={() => onNavigate('opportunities')}>查看全部</button></div>
          <div className="workbench-opportunity-list">
            {openOpportunities.slice(0, 6).map((item, index) => <button key={item.businessId ?? `${item.nameSummary}-${index}`} className="workbench-opportunity-row" onClick={() => onNavigate('opportunities')}><span><IconTargetArrow size={15} /><strong>{item.nameSummary || '未命名商机'}</strong></span><b>{typeof item.estimatedValue === 'number' ? money(item.estimatedValue, item.currencyCode) : '未录入金额'}</b></button>)}
            {!loading && openOpportunities.length === 0 && <div className="real-empty">当前没有进行中的商机。</div>}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>最近活动</h2><p>任务和笔记的真实更新时间线</p></div><button className="text-action" onClick={() => onNavigate('notes')}>查看时间线</button></div>
        <div className="activity-list">
          {activity.slice(0, 8).map((item) => <button className="activity-row workbench-activity-button" key={`${item.kind}-${item.businessId}`} onClick={() => onNavigate(item.kind === 'TASK' ? 'tasks' : 'notes')}><div className="activity-icon">{item.kind === 'TASK' ? <IconCheck size={16} /> : <IconTimelineEvent size={16} />}</div><div><strong>{item.title}</strong><p>{item.kind === 'TASK' ? `任务 · ${item.status === 'DONE' ? '已完成' : '待办'}` : '笔记'}</p></div><time>{when(item.updatedAt ?? item.createdAt)}</time></button>)}
          {!loading && activity.length === 0 && <div className="real-empty">当前没有任务或笔记活动。</div>}
        </div>
      </section>
    </div>
  );
}

function Gate({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return <section className="real-data-gate"><div className="real-data-gate-icon"><IconHome size={22} /></div><div><h2>{title}</h2><p>{detail}</p>{action && <div className="real-data-gate-action">{action}</div>}</div></section>;
}
