import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { IconLayoutKanban, IconLayoutList, IconPlus, IconRefresh, IconTargetArrow } from 'twenty-ui/icon';
import {
  createOpportunity,
  deleteOpportunity,
  updateOpportunity,
  type CanonicalAccount,
  type CanonicalOpportunity,
  type ForeignTradeStage,
  type OpportunityLifecycleState,
} from '../lib/crmBusinessClient';
import { useCrmAccountsQuery, useCrmOpportunitiesQuery } from '../lib/crmEntityQueries';
import type { GbapSession } from '../hooks/useGbapSession';
import { BusinessRecordModal } from './BusinessRecordModal';
import { BusinessRelationPicker, type BusinessRelationOption } from './BusinessRelationPicker';
import './crm-object-surfaces.css';

type Props = { session: GbapSession; search: string; createSignal?: number };
type ViewMode = 'table' | 'kanban';
const TRADE_STAGES: ForeignTradeStage[] = ['NEW', 'CONTACTED', 'QUALIFYING', 'NEEDS_CONFIRMED', 'TECHNICAL_SAMPLE', 'QUOTATION', 'NEGOTIATION', 'DECISION', 'ORDER_PENDING', 'ON_HOLD', 'ORDER_CONFIRMED'];
const LIFECYCLE_STATES: OpportunityLifecycleState[] = ['OPEN', 'CLOSED_WON', 'CLOSED_LOST', 'CANCELLED'];
const TRADE_STAGE_LABELS: Record<ForeignTradeStage, string> = {
  NEW: '新商机',
  CONTACTED: '已建联',
  QUALIFYING: '资格筛选',
  NEEDS_CONFIRMED: '需求确认',
  TECHNICAL_SAMPLE: '技术 / 样品确认',
  QUOTATION: '正式报价',
  NEGOTIATION: '商务谈判',
  DECISION: '客户决策',
  ORDER_PENDING: '待合同 / 订单',
  ON_HOLD: '暂缓 / 培育',
  ORDER_CONFIRMED: '已成交 / 订单确认',
};

function userError(cause: unknown, fallback: string) {
  const typed = cause as { status?: number; body?: { error?: string; detail?: Record<string, number> } };
  const message = cause instanceof Error ? cause.message : '';
  if (typed?.status === 401) return '登录状态已失效，请重新登录。';
  if (typed?.status === 409 && message.includes('mapping_missing')) return '关联的客户公司尚未准备好，请刷新客户公司后重试。';
  if (typed?.status === 409 && typed.body?.error === 'record_has_related_records') {
    const detail = typed.body.detail ?? {};
    return `该商机仍关联 ${detail.tasks ?? 0} 个任务、${detail.notes ?? 0} 条笔记。请先处理关联活动，再删除。`;
  }
  if (typed?.status === 409 && typed.body?.error === 'record_has_attached_files') return '该商机仍有附件，请先处理附件再删除。';
  if (typed?.status === 409) return '商机信息与现有数据冲突，请检查后重试。';
  if (typed?.status && typed.status >= 500) return '商机服务暂时不可用，请稍后刷新重试。';
  return fallback;
}
function lifecycleLabel(state: string) { if (state === 'CLOSED_WON') return '已赢单'; if (state === 'CLOSED_LOST') return '已丢单'; if (state === 'CANCELLED') return '已取消'; return '进行中'; }
function tradeStageLabel(stage: ForeignTradeStage) { return TRADE_STAGE_LABELS[stage] ?? '新商机'; }
function validLifecycle(value: string): OpportunityLifecycleState { return LIFECYCLE_STATES.includes(value as OpportunityLifecycleState) ? value as OpportunityLifecycleState : 'OPEN'; }
function money(value: number | null, currency: string | null) {
  if (typeof value !== 'number') return '—'; const code = currency?.trim().toUpperCase(); if (!code) return value.toLocaleString('zh-CN');
  try { return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(value); } catch { return `${code} ${value.toLocaleString('zh-CN')}`; }
}
function accountSearchText(account: CanonicalAccount) {
  return [
    account.displayName,
    account.commercialName,
    account.registrationId,
    account.registrationCountry,
    account.addressCountry,
    account.addressState,
    account.addressCity,
    account.industry,
    account.primaryEmail,
    account.primaryPhone,
    account.website,
    account.accountOwnerUserId,
  ].filter(Boolean).join(' ');
}

export function OpportunitiesSurface({ session, search, createSignal = 0 }: Props) {
  const opportunitiesQuery = useCrmOpportunitiesQuery(session);
  const accountsQuery = useCrmAccountsQuery(session);
  const records = opportunitiesQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];
  const loading = (opportunitiesQuery.isPending && !opportunitiesQuery.data) || (accountsQuery.isPending && !accountsQuery.data);
  const refreshing = opportunitiesQuery.isFetching || accountsQuery.isFetching;
  const loadError = opportunitiesQuery.error
    ? userError(opportunitiesQuery.error, '商机加载失败，请刷新后重试。')
    : accountsQuery.error
      ? userError(accountsQuery.error, '客户公司加载失败，请刷新后重试。')
      : null;
  const setRecords = useCallback((updater: React.SetStateAction<CanonicalOpportunity[]>) => {
    opportunitiesQuery.setData((current) => {
      const base = current ?? [];
      return typeof updater === 'function' ? updater(base) : updater;
    });
  }, [opportunitiesQuery.setData]);
  const refetch = useCallback(() => {
    void Promise.all([opportunitiesQuery.refetch(), accountsQuery.refetch()]);
  }, [accountsQuery.refetch, opportunitiesQuery.refetch]);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [accountBusinessId, setAccountBusinessId] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [createTradeStage, setCreateTradeStage] = useState<ForeignTradeStage>('NEW');
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<ViewMode>('table');
  const [selected, setSelected] = useState<CanonicalOpportunity | null>(null);
  const [editName, setEditName] = useState('');
  const [editAccountId, setEditAccountId] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editCurrency, setEditCurrency] = useState('USD');
  const [editTradeStage, setEditTradeStage] = useState<ForeignTradeStage>('NEW');
  const [editLifecycle, setEditLifecycle] = useState<OpportunityLifecycleState>('OPEN');
  const [editNextStep, setEditNextStep] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { if (createSignal > 0) setCreateOpen(true); }, [createSignal]);

  const accountByBusinessId = useMemo(() => new Map(accounts.filter((account) => account.businessId).map((account) => [account.businessId as string, account])), [accounts]);
  const creatableAccounts = useMemo(() => accounts.filter((account) => Boolean(account.businessId)), [accounts]);
  const accountOptions = useMemo<BusinessRelationOption[]>(() => creatableAccounts.map((account) => ({
    key: account.businessId!,
    label: account.displayName,
    searchText: accountSearchText(account),
  })), [creatableAccounts]);
  const accountFor = useCallback((item: CanonicalOpportunity) => item.accountBusinessId ? accountByBusinessId.get(item.accountBusinessId) ?? null : null, [accountByBusinessId]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((item) => `${item.nameSummary} ${accountFor(item)?.displayName ?? ''} ${lifecycleLabel(item.lifecycleState)} ${tradeStageLabel(item.tradeStage)} ${item.nextStep ?? ''}`.toLowerCase().includes(q));
  }, [records, search, accountFor]);

  const openEditor = (item: CanonicalOpportunity) => {
    setSelected(item); setEditName(item.nameSummary); setEditAccountId(item.accountBusinessId ?? ''); setEditValue(typeof item.estimatedValue === 'number' ? String(item.estimatedValue) : ''); setEditCurrency(item.currencyCode || 'USD');
    setEditTradeStage(item.tradeStage); setEditLifecycle(validLifecycle(item.lifecycleState)); setEditNextStep(item.nextStep ?? ''); setError(null); setSuccess(null);
  };
  const resetCreate = () => { setName(''); setAccountBusinessId(''); setEstimatedValue(''); setCurrencyCode('USD'); setCreateTradeStage('NEW'); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!name.trim() || !accountBusinessId || creating) return;
    const amount = estimatedValue.trim() ? Number(estimatedValue) : undefined; if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) { setError('请输入有效的商机金额。'); return; }
    setCreating(true); setError(null); setSuccess(null);
    try {
      let created = await createOpportunity({ nameSummary: name.trim(), accountBusinessId, estimatedValue: amount, currencyCode });
      if (created.businessId && createTradeStage !== 'NEW') created = await updateOpportunity(created.businessId, { tradeStage: createTradeStage, lifecycleState: createTradeStage === 'ORDER_CONFIRMED' ? 'CLOSED_WON' : 'OPEN' });
      setRecords((current) => [created, ...current.filter((item) => item.businessId !== created.businessId)]);
      setSuccess(`商机“${created.nameSummary}”已创建。`); resetCreate(); setCreateOpen(false);
    } catch (cause) { setError(userError(cause, '商机创建失败，请检查客户公司和金额后重试。')); }
    finally { setCreating(false); }
  };
  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selected?.businessId || !editName.trim() || !editAccountId || saving) return;
    const amount = editValue.trim() ? Number(editValue) : selected.estimatedValue ?? 0; if (!Number.isFinite(amount) || amount < 0) { setError('请输入有效的商机金额。'); return; }
    setSaving(true); setError(null); setSuccess(null);
    try {
      const lifecycleState: OpportunityLifecycleState = editTradeStage === 'ORDER_CONFIRMED' ? 'CLOSED_WON' : editLifecycle;
      const updated = await updateOpportunity(selected.businessId, { nameSummary: editName.trim(), accountBusinessId: editAccountId, estimatedValue: amount, currencyCode: editCurrency, tradeStage: editTradeStage, lifecycleState, nextStep: editNextStep.trim() || null });
      setRecords((current) => current.map((item) => item.businessId === updated.businessId ? updated : item));
      setSuccess(`商机“${updated.nameSummary}”已更新。`); setSelected(null);
    } catch (cause) { setError(userError(cause, '商机更新失败，请检查阶段、客户公司和金额后重试。')); }
    finally { setSaving(false); }
  };
  const removeSelected = async () => {
    if (!selected?.businessId || deleting) return;
    if (!window.confirm(`确认删除商机“${selected.nameSummary}”？\n\n有关联任务、笔记或附件时系统会自动阻止删除。`)) return;
    const removedId = selected.businessId;
    setDeleting(true); setError(null); setSuccess(null);
    try { await deleteOpportunity(removedId); setRecords((current) => current.filter((item) => item.businessId !== removedId)); setSelected(null); setSuccess('商机已删除。'); }
    catch (cause) { setError(userError(cause, '商机删除失败，请重试。')); }
    finally { setDeleting(false); }
  };

  if (session.status === 'initializing') return <Gate title="正在加载商机" detail="正在恢复企业登录状态…" />;
  if (session.status !== 'authenticated') return <Gate title="登录后查看商机" detail="登录企业账号后即可查看、新建和维护商机。" action={<Button title="企业登录" onClick={() => void session.login('opportunities')} />} />;

  const visibleError = error ?? loadError;
  return <section className="panel flush" data-surface="real-opportunity-wiring">
    <div className="object-toolbar"><div><h2>商机</h2><p>{loading ? '正在加载…' : `${filtered.length} 条商机 · 外贸推进阶段与商机结果分开管理${refreshing && !loading ? ' · 后台同步中' : ''}`}</p></div><div className="toolbar-actions"><button className="tool-button" onClick={refetch} disabled={refreshing}><IconRefresh size={15} /> {refreshing ? '同步中' : '刷新'}</button><div className="view-toggle"><button aria-label="表格视图" className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}><IconLayoutList size={16} /></button><button aria-label="看板视图" className={view === 'kanban' ? 'active' : ''} onClick={() => setView('kanban')}><IconLayoutKanban size={16} /></button></div><button type="button" className="tool-button page-primary-action" onClick={() => { resetCreate(); setCreateOpen(true); }}><IconPlus size={15} /> 新建商机</button></div></div>
    {visibleError && <div className="real-error" role="alert">{visibleError}</div>}{success && <div className="real-success" role="status">{success}</div>}

    {createOpen && <BusinessRecordModal title="新建商机" description="创建外贸商机并设置当前推进阶段。" onClose={() => setCreateOpen(false)}><OpportunityCreateForm name={name} setName={setName} accountBusinessId={accountBusinessId} setAccountBusinessId={setAccountBusinessId} estimatedValue={estimatedValue} setEstimatedValue={setEstimatedValue} currencyCode={currencyCode} setCurrencyCode={setCurrencyCode} tradeStage={createTradeStage} setTradeStage={setCreateTradeStage} accountOptions={accountOptions} accountCount={creatableAccounts.length} creating={creating} onSubmit={submit} onCancel={() => setCreateOpen(false)} /></BusinessRecordModal>}

    {selected && <BusinessRecordModal title={selected.businessId ? '查看 / 编辑商机' : '查看商机'} description={selected.nameSummary} onClose={() => setSelected(null)}><form className="crm-record-editor" onSubmit={saveEdit}>{!selected.businessId && <p className="form-guidance">此商机尚未纳入平台维护，当前只能查看。通过受控导入或重新建档后即可编辑。</p>}<div className="crm-record-editor-fields crm-opportunity-editor-fields"><label>商机名称<input aria-label="编辑商机名称" value={editName} onChange={(e) => setEditName(e.target.value)} disabled={!selected.businessId} /></label><label>客户公司<BusinessRelationPicker ariaLabel="编辑商机客户公司" value={editAccountId} onChange={setEditAccountId} options={accountOptions} emptyLabel="请选择客户公司" searchPlaceholder="搜索客户公司（公司名、RUC、城市、行业…）" disabled={!selected.businessId} /></label><label>预计金额<input aria-label="编辑预计金额" inputMode="decimal" value={editValue} onChange={(e) => setEditValue(e.target.value)} disabled={!selected.businessId} /></label><label>币种<select aria-label="编辑币种" value={editCurrency} onChange={(e) => setEditCurrency(e.target.value)} disabled={!selected.businessId}><option value="USD">USD</option><option value="CNY">CNY</option><option value="EUR">EUR</option></select></label><label>外贸推进阶段<select aria-label="编辑外贸推进阶段" value={editTradeStage} onChange={(e) => setEditTradeStage(e.target.value as ForeignTradeStage)} disabled={!selected.businessId}>{TRADE_STAGES.map((stage) => <option key={stage} value={stage}>{tradeStageLabel(stage)}</option>)}</select></label><label>商机结果<select aria-label="编辑商机结果" value={editLifecycle} onChange={(e) => setEditLifecycle(e.target.value as OpportunityLifecycleState)} disabled={!selected.businessId}><option value="OPEN">进行中</option><option value="CLOSED_WON">已赢单</option><option value="CLOSED_LOST">已丢单</option><option value="CANCELLED">已取消</option></select></label><label className="crm-wide-field">下一步<textarea aria-label="编辑下一步" value={editNextStep} onChange={(e) => setEditNextStep(e.target.value)} placeholder="例如：周五前确认最近 12 个月电费账单" disabled={!selected.businessId} /></label></div>{selected.businessId && <div className="crm-form-actions"><button type="button" className="danger-text-button" disabled={deleting} onClick={() => void removeSelected()}>{deleting ? '删除中…' : '删除商机'}</button><Button title="取消" variant="secondary" size="small" type="button" onClick={() => setSelected(null)} /><Button title={saving ? '保存中' : '保存修改'} size="small" type="submit" disabled={!editName.trim() || !editAccountId || saving} /></div>}</form></BusinessRecordModal>}

    {view === 'table' ? <div className="table-wrap"><table><thead><tr><th className="crm-leading-action-column">操作</th><th>商机</th><th>客户公司</th><th>外贸阶段</th><th>结果</th><th>金额</th><th>下一步</th></tr></thead><tbody>{filtered.map((item, index) => <tr key={item.businessId ?? `${item.nameSummary}-${index}`}><td className="crm-leading-action-column"><button className="text-action" onClick={() => openEditor(item)}>{item.businessId ? '查看 / 编辑' : '查看'}</button></td><td><strong>{item.nameSummary || '未命名商机'}</strong></td><td>{accountFor(item)?.displayName || '—'}</td><td><span className="stage-chip">{tradeStageLabel(item.tradeStage)}</span></td><td>{lifecycleLabel(item.lifecycleState)}</td><td>{money(item.estimatedValue, item.currencyCode)}</td><td>{item.nextStep || '—'}</td></tr>)}{!loading && filtered.length === 0 && <tr><td colSpan={7}><div className="real-empty">{search ? '没有匹配的商机。' : '还没有商机。点击“新建商机”开始录入。'}</div></td></tr>}</tbody></table></div> : <div className="kanban crm-real-kanban">{TRADE_STAGES.map((stage) => { const stageRecords = filtered.filter((item) => item.tradeStage === stage); return <div className="kanban-col" key={stage}><div className="kanban-head"><strong>{tradeStageLabel(stage)}</strong><span>{stageRecords.length}</span></div>{stageRecords.map((item) => <button type="button" className="deal-card crm-deal-card-button" key={item.businessId ?? item.nameSummary} onClick={() => openEditor(item)}><strong>{item.nameSummary}</strong><p>{accountFor(item)?.displayName || '未关联客户公司'}</p><div><span>{lifecycleLabel(item.lifecycleState)}</span><b>{money(item.estimatedValue, item.currencyCode)}</b></div></button>)}</div>; })}</div>}
  </section>;
}

function OpportunityCreateForm({ name, setName, accountBusinessId, setAccountBusinessId, estimatedValue, setEstimatedValue, currencyCode, setCurrencyCode, tradeStage, setTradeStage, accountOptions, accountCount, creating, onSubmit, onCancel }: { name: string; setName: (value: string) => void; accountBusinessId: string; setAccountBusinessId: (value: string) => void; estimatedValue: string; setEstimatedValue: (value: string) => void; currencyCode: string; setCurrencyCode: (value: string) => void; tradeStage: ForeignTradeStage; setTradeStage: (value: ForeignTradeStage) => void; accountOptions: BusinessRelationOption[]; accountCount: number; creating: boolean; onSubmit: (event: React.FormEvent) => void; onCancel: () => void }) {
  return <form className="crm-create-form crm-opportunity-form" onSubmit={onSubmit}><label>商机名称<input aria-label="商机名称" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 厂区光储改造项目" autoFocus /></label><label>客户公司<BusinessRelationPicker ariaLabel="客户公司" value={accountBusinessId} onChange={setAccountBusinessId} options={accountOptions} emptyLabel="请选择客户公司" searchPlaceholder="搜索客户公司（公司名、RUC、城市、行业…）" /></label><label>外贸推进阶段<select aria-label="外贸推进阶段" value={tradeStage} onChange={(e) => setTradeStage(e.target.value as ForeignTradeStage)}>{TRADE_STAGES.map((stage) => <option key={stage} value={stage}>{tradeStageLabel(stage)}</option>)}</select></label><label>预计金额<input aria-label="预计金额" inputMode="decimal" value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} placeholder="0" /></label><label>币种<select aria-label="币种" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}><option value="USD">USD</option><option value="CNY">CNY</option><option value="EUR">EUR</option></select></label>{accountCount === 0 && <p className="form-guidance">创建商机前，请先在“客户公司”中创建至少一家客户公司。</p>}<div className="crm-form-actions"><Button title="取消" variant="secondary" size="small" type="button" onClick={onCancel} /><Button title={creating ? '创建中' : '创建'} size="small" type="submit" disabled={!name.trim() || !accountBusinessId || creating} /></div></form>;
}
function Gate({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) { return <section className="real-data-gate"><div className="real-data-gate-icon"><IconTargetArrow size={22} /></div><div><h2>{title}</h2><p>{detail}</p>{action && <div className="real-data-gate-action">{action}</div>}</div></section>; }