import { useCallback, useMemo } from 'react';
import { IconLayoutDashboard, IconRefresh } from 'twenty-ui/icon';
import type { CanonicalOpportunity } from '../lib/crmBusinessClient';
import type { CrmTask } from '../lib/gbapClient';
import {
  useCrmAccountsQuery,
  useCrmContactsQuery,
  useCrmOpportunitiesQuery,
  useCrmTasksQuery,
} from '../lib/crmEntityQueries';
import type { GbapSession } from '../hooks/useGbapSession';
import './crm-advanced-surfaces.css';

type Props = { session: GbapSession };
const stages = ['NEW', 'SCREENING', 'MEETING', 'PROPOSAL', 'CUSTOMER'] as const;
const stageLabels: Record<string, string> = { NEW: '新建', SCREENING: '筛选', MEETING: '会谈', PROPOSAL: '方案', CUSTOMER: '客户' };

type CurrencyTotal = { currencyCode: string | null; value: number };

function normalizedCurrencyCode(value: string | null | undefined) {
  const code = value?.trim().toUpperCase();
  return code || null;
}

function openValueTotals(records: CanonicalOpportunity[]): CurrencyTotal[] {
  const totals = new Map<string, CurrencyTotal>();
  for (const item of records) {
    if (item.lifecycleState !== 'OPEN' || typeof item.estimatedValue !== 'number') continue;
    const currencyCode = normalizedCurrencyCode(item.currencyCode);
    const key = currencyCode ?? '__UNSPECIFIED__';
    const current = totals.get(key) ?? { currencyCode, value: 0 };
    current.value += item.estimatedValue;
    totals.set(key, current);
  }
  return [...totals.values()].sort((left, right) => String(left.currencyCode ?? '').localeCompare(String(right.currencyCode ?? '')));
}

function currency(value: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: currencyCode, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currencyCode} ${value.toLocaleString('zh-CN')}`;
  }
}

function currencyLabel(item: CurrencyTotal) {
  return item.currencyCode ? currency(item.value, item.currencyCode) : `未指定币种 ${item.value.toLocaleString('zh-CN')}`;
}

function overdue(tasks: CrmTask[]) { const now = Date.now(); return tasks.filter((x) => x.status !== 'DONE' && x.dueAt && new Date(x.dueAt).getTime() < now).length; }

export function DashboardSurface({ session }: Props) {
  const accountQuery = useCrmAccountsQuery(session);
  const contactQuery = useCrmContactsQuery(session);
  const opportunityQuery = useCrmOpportunitiesQuery(session);
  const taskQuery = useCrmTasksQuery(session);
  const accounts = accountQuery.data?.length ?? 0;
  const contacts = contactQuery.data?.length ?? 0;
  const opportunities = opportunityQuery.data ?? [];
  const tasks = taskQuery.data ?? [];
  const queries = [accountQuery, contactQuery, opportunityQuery, taskQuery];
  const loading = queries.some((query) => query.isPending && !query.data);
  const refreshing = queries.some((query) => query.isFetching);
  const error = queries.some((query) => Boolean(query.error)) ? '仪表盘数据加载失败，请刷新后重试。' : null;
  const refetch = useCallback(() => {
    void Promise.all([accountQuery.refetch(), contactQuery.refetch(), opportunityQuery.refetch(), taskQuery.refetch()]);
  }, [accountQuery.refetch, contactQuery.refetch, opportunityQuery.refetch, taskQuery.refetch]);

  const openOpportunities = useMemo(() => opportunities.filter((item) => item.lifecycleState === 'OPEN'), [opportunities]);
  const stageCounts = useMemo(() => new Map(stages.map((stage) => [stage, openOpportunities.filter((x) => (x.pipelineStage || 'NEW') === stage).length])), [openOpportunities]);
  const openTotals = useMemo(() => openValueTotals(opportunities), [opportunities]);
  const maxStage = Math.max(1, ...stageCounts.values());
  const won = opportunities.filter((x) => x.lifecycleState === 'CLOSED_WON').length;
  const lost = opportunities.filter((x) => x.lifecycleState === 'CLOSED_LOST').length;
  const open = openOpportunities.length;

  if (session.status !== 'authenticated') return <section className="real-data-gate"><div className="real-data-gate-icon"><IconLayoutDashboard size={22} /></div><div><h2>登录后查看仪表盘</h2><p>仪表盘只展示当前企业账号有权访问的真实 CRM 数据。</p></div></section>;

  return <section data-surface="real-dashboard-wiring">
    <div className="object-toolbar"><div><h2>销售仪表盘</h2><p>{loading ? '正在加载…' : `基于当前 CRM 数据实时汇总${refreshing ? ' · 后台同步中' : ''}`}</p></div><div className="toolbar-actions"><button className="tool-button" onClick={refetch} disabled={refreshing}><IconRefresh size={15} />{refreshing ? '同步中' : '刷新'}</button></div></div>
    {error && <div className="real-error" role="alert">{error}</div>}
    <div className="crm-stat-grid">
      <div className="crm-stat-card"><small>客户公司</small><strong>{accounts}</strong></div>
      <div className="crm-stat-card"><small>联系人</small><strong>{contacts}</strong></div>
      <div className="crm-stat-card"><small>进行中商机</small><strong>{open}</strong></div>
      <div className="crm-stat-card"><small>进行中商机金额</small><strong>{openTotals.length === 0 ? '未录入金额' : openTotals.map((item, index) => <span key={item.currencyCode ?? '__UNSPECIFIED__'}>{index > 0 && <span aria-hidden="true"> · </span>}<span>{currencyLabel(item)}</span></span>)}</strong></div>
    </div>
    <div className="crm-advanced-grid">
      <div className="crm-section-card">
        <div className="crm-section-head"><div><h3>销售漏斗</h3><p>按当前进行中商机的销售阶段汇总。</p></div></div>
        <div className="crm-funnel-list">{stages.map((stage) => { const count = stageCounts.get(stage) ?? 0; return <div className="crm-funnel-row" key={stage}><span>{stageLabels[stage]}</span><div className="crm-funnel-track"><div className="crm-funnel-fill" style={{ width: `${count === 0 ? 0 : Math.max(3, count / maxStage * 100)}%` }} /></div><strong>{count}</strong></div>; })}</div>
      </div>
      <div className="crm-section-card">
        <div className="crm-section-head"><div><h3>推进健康度</h3><p>用于经理快速发现需要干预的销售事项。</p></div></div>
        <div className="crm-stat-grid" style={{ padding: 14, margin: 0 }}>
          <div className="crm-stat-card"><small>已赢单</small><strong>{won}</strong></div>
          <div className="crm-stat-card"><small>已丢单</small><strong>{lost}</strong></div>
          <div className="crm-stat-card"><small>逾期任务</small><strong>{overdue(tasks)}</strong></div>
          <div className="crm-stat-card"><small>待办任务</small><strong>{tasks.filter((x) => x.status !== 'DONE').length}</strong></div>
        </div>
      </div>
    </div>
  </section>;
}
