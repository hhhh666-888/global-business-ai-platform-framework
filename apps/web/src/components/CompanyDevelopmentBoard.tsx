import { useEffect, useMemo, useState } from 'react';
import type { GbapSession } from '../hooks/useGbapSession';
import {
  useCrmAccountsQuery,
  useCrmContactsQuery,
  useCrmCustomerIntelligenceQuery,
  useCrmOpportunitiesQuery,
  invalidateCrmEntities,
} from '../lib/crmEntityQueries';
import type { CanonicalAccount, CanonicalOpportunity } from '../lib/crmBusinessClient';
import { bulkDeleteCrmRecordsInChunks } from '../lib/crmAdminBulkClient';
import type { CustomerIntelligenceProfile, EnergyProductNeed } from '../lib/crmCustomerIntelligenceClient';
import {
  listCompanyResearchInsights,
  type CompanyResearchInsight,
  type ResearchInsightTargetRole,
} from '../lib/crmCompanyResearchInsightsClient';
import './crm-object-surfaces.css';

type Props = { session: GbapSession; search?: string };
type BoardView = 'DEVELOPMENT' | 'ENERGY' | 'RESEARCH' | 'INSIGHTS';
type CompanyRow = CanonicalAccount & Partial<CustomerIntelligenceProfile> & { researchInsight?: CompanyResearchInsight };

type StageInfo = {
  label: string;
  rank: number;
  nextAction: string;
  opportunity: CanonicalOpportunity | null;
};

const STAGE_ORDER: Record<string, number> = {
  NEW: 10,
  CONTACTED: 20,
  QUALIFYING: 30,
  NEEDS_CONFIRMED: 40,
  TECHNICAL_SAMPLE: 50,
  QUOTATION: 60,
  NEGOTIATION: 70,
  DECISION: 80,
  ORDER_PENDING: 90,
  ORDER_CONFIRMED: 100,
  ON_HOLD: 5,
};

const STAGE_LABELS: Record<string, string> = {
  NEW: '未开发',
  CONTACTED: '已联系',
  QUALIFYING: '资格筛选',
  NEEDS_CONFIRMED: '需求已确认',
  TECHNICAL_SAMPLE: '技术 / 样品',
  QUOTATION: '已报价',
  NEGOTIATION: '商务谈判',
  DECISION: '客户决策',
  ORDER_PENDING: '待下单',
  ORDER_CONFIRMED: '已成交',
  ON_HOLD: '暂停跟进',
};

const NEXT_ACTIONS: Record<string, string> = {
  NEW: '完成首次联系并找到有效联系人',
  CONTACTED: '确认回复并补齐关键决策人',
  QUALIFYING: '完成客户资格筛选与机会判断',
  NEEDS_CONFIRMED: '获取用电 / 项目需求与现场资料',
  TECHNICAL_SAMPLE: '推进技术资料、选型或样品确认',
  QUOTATION: '跟进报价反馈并确认关键异议',
  NEGOTIATION: '推进价格、付款与交付条件',
  DECISION: '跟进客户内部决策与审批节点',
  ORDER_PENDING: '确认订单、合同与付款安排',
  ORDER_CONFIRMED: '推进交付并寻找复购 / 扩单机会',
  ON_HOLD: '复核暂停原因并设置重新跟进时间',
};

const PRIORITY_LABELS: Record<string, string> = { HIGH: '高', MEDIUM: '中', LOW: '低' };
const RELATION_LABELS: Record<string, string> = { PROSPECT: '潜在客户', QUALIFIED: '已筛选', CUSTOMER: '成交客户', PARTNER: '合作伙伴', INACTIVE: '暂不跟进' };
const GRID_LABELS: Record<string, string> = {
  STABLE: '供电稳定',
  OCCASIONAL_OUTAGE: '偶尔停电',
  FREQUENT_OUTAGE: '经常停电',
  SEVERE_OUTAGE: '严重停电',
  UNKNOWN: '待确认',
};
const NEED_LABELS: Record<EnergyProductNeed, string> = {
  SOLAR: '光伏', STORAGE: '储能', DIESEL_GENERATOR: '柴油机', GAS_GENERATOR: '燃气机', TRANSFORMER: '变压器', ELECTRICAL: '电气设备', MICROGRID: '微电网 / 综合能源', ENERGY_MANAGEMENT: '能源管理',
};
const TARGET_ROLE_LABELS: Record<string, string> = {
  LEGAL_REP: '法人 / 代表人',
  BUSINESS_DECISION: '业务决策人',
  PLANT_OPERATIONS: '工厂 / 运营负责人',
  ENERGY_MAINTENANCE: '工程 / 能源 / 维护',
  PROCUREMENT: '采购负责人',
  RECOMMENDED: '推荐寻找岗位',
};

function stageInfo(opportunities: CanonicalOpportunity[]): StageInfo {
  if (opportunities.length === 0) return { label: '未建商机', rank: 0, nextAction: '完成首次联系，确认机会后建立商机', opportunity: null };
  const selected = [...opportunities].sort((a, b) => {
    const rankA = STAGE_ORDER[String(a.tradeStage ?? a.pipelineStage ?? 'NEW').toUpperCase()] ?? 0;
    const rankB = STAGE_ORDER[String(b.tradeStage ?? b.pipelineStage ?? 'NEW').toUpperCase()] ?? 0;
    return rankB - rankA;
  })[0];
  const key = String(selected.tradeStage ?? selected.pipelineStage ?? 'NEW').toUpperCase();
  return {
    label: STAGE_LABELS[key] ?? key,
    rank: STAGE_ORDER[key] ?? 0,
    nextAction: selected.nextStep?.trim() || NEXT_ACTIONS[key] || '确认下一步跟进动作',
    opportunity: selected,
  };
}

function compactLocation(company: CanonicalAccount) {
  return [company.addressCountry, company.addressState, company.addressCity].filter(Boolean).join(' · ') || '待补充';
}

function formatNumber(value: string | number | null | undefined, unit = '') {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) return '—';
    const unitToken = unit.trim().toLocaleLowerCase();
    return unitToken && !normalized.toLocaleLowerCase().includes(unitToken) ? `${normalized}${unit}` : normalized;
  }
  return `${value.toLocaleString('zh-CN', { maximumFractionDigits: 1 })}${unit}`;
}

function formatMoney(value: number | null | undefined, currency = 'USD') {
  return value === null || value === undefined ? '—' : `${currency} ${value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
}

function companySearchText(company: CompanyRow) {
  return [
    company.displayName, company.commercialName, company.registrationId, company.industry,
    company.addressCountry, company.addressState, company.addressCity, company.primaryEmail, company.primaryPhone,
  ].filter(Boolean).join(' ').toLocaleLowerCase();
}

function researchSearchText(insight: CompanyResearchInsight | undefined) {
  if (!insight) return '';
  const intelligence = insight.researchIntelligence;
  const signal = insight.salesSignal;
  const site = insight.primarySite;
  return [
    intelligence?.researchPriority, intelligence?.industrySegment, intelligence?.productsServices, intelligence?.researchRationale,
    intelligence?.recommendedSolution, intelligence?.recommendedEntryPoint, intelligence?.estimatedProjectScale,
    intelligence?.recommendedChannel, intelligence?.firstOutreachSubject, intelligence?.firstContactGuidance,
    intelligence?.researchCompleteness, intelligence?.researchNextAction,
    signal?.solarOpportunity, signal?.storageOpportunity, signal?.generatorOpportunity, signal?.electricalOpportunity,
    insight.energyDiscovery?.publicKnownEnergyData,
    site?.province, site?.city, site?.address, site?.keyEquipmentText, site?.energyPainPoints,
    ...insight.targetRoles.flatMap((role) => [role.roleTitleText, role.candidateName, role.recommendedSearchText, role.verificationNote]),
    insight.latestEvidence?.sourceTitle, insight.latestEvidence?.statement,
  ].filter(Boolean).join(' ').toLocaleLowerCase();
}

function roleSummary(roles: ResearchInsightTargetRole[]) {
  if (roles.length === 0) return '暂无待核岗位';
  return roles.slice(0, 3).map((role) => {
    const label = role.roleTitleText || role.recommendedSearchText || TARGET_ROLE_LABELS[role.roleKey] || role.roleKey;
    return `${label}${role.candidateName ? `：${role.candidateName}` : ''}`;
  }).join('；') + (roles.length > 3 ? `；另 ${roles.length - 3} 项` : '');
}

function opportunitySignalText(insight: CompanyResearchInsight | undefined) {
  const signal = insight?.salesSignal;
  if (!signal) return '待研究';
  const values = [
    signal.solarOpportunity ? `光伏 ${signal.solarOpportunity}` : '',
    signal.storageOpportunity ? `储能 ${signal.storageOpportunity}` : '',
    signal.generatorOpportunity ? `发电机 ${signal.generatorOpportunity}` : '',
    signal.electricalOpportunity ? `电气 ${signal.electricalOpportunity}` : '',
  ].filter(Boolean);
  return values.join(' · ') || '待研究';
}

export function CompanyDevelopmentBoard({ session, search = '' }: Props) {
  const accountsQuery = useCrmAccountsQuery(session);
  const contactsQuery = useCrmContactsQuery(session);
  const opportunitiesQuery = useCrmOpportunitiesQuery(session);
  const intelligenceQuery = useCrmCustomerIntelligenceQuery(session);
  const [researchInsights, setResearchInsights] = useState<CompanyResearchInsight[]>([]);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [view, setView] = useState<BoardView>('DEVELOPMENT');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = session.status === 'authenticated' && Boolean(session.identity?.roles.includes('substrate-admin'));

  useEffect(() => {
    let active = true;
    if (session.status !== 'authenticated') {
      setResearchInsights([]);
      setResearchLoading(false);
      setResearchError(null);
      return () => { active = false; };
    }
    setResearchLoading(true);
    setResearchError(null);
    void listCompanyResearchInsights()
      .then((rows) => { if (active) setResearchInsights(rows); })
      .catch(() => { if (active) setResearchError('研究洞察暂时无法读取；客户主资料和销售进度仍可正常使用。'); })
      .finally(() => { if (active) setResearchLoading(false); });
    return () => { active = false; };
  }, [session.status, session.identity?.subject]);

  const intelligenceById = useMemo(() => new Map((intelligenceQuery.data ?? []).map((profile) => [profile.businessId, profile])), [intelligenceQuery.data]);
  const researchById = useMemo(() => new Map(researchInsights.map((item) => [item.accountBusinessId, item])), [researchInsights]);
  const contactsByCompany = useMemo(() => {
    const map = new Map<string, number>();
    for (const contact of contactsQuery.data ?? []) if (contact.accountBusinessId) map.set(contact.accountBusinessId, (map.get(contact.accountBusinessId) ?? 0) + 1);
    return map;
  }, [contactsQuery.data]);
  const opportunitiesByCompany = useMemo(() => {
    const map = new Map<string, CanonicalOpportunity[]>();
    for (const opportunity of opportunitiesQuery.data ?? []) {
      if (!opportunity.accountBusinessId) continue;
      const rows = map.get(opportunity.accountBusinessId) ?? [];
      rows.push(opportunity);
      map.set(opportunity.accountBusinessId, rows);
    }
    return map;
  }, [opportunitiesQuery.data]);

  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (accountsQuery.data ?? [])
      .map((account) => ({
        ...account,
        ...(account.businessId ? intelligenceById.get(account.businessId) : undefined),
        researchInsight: account.businessId ? researchById.get(account.businessId) : undefined,
      } as CompanyRow))
      .filter((company) => !query || `${companySearchText(company)} ${researchSearchText(company.researchInsight)}`.includes(query))
      .sort((a, b) => {
        const rankA = a.researchRank ?? Number.MAX_SAFE_INTEGER;
        const rankB = b.researchRank ?? Number.MAX_SAFE_INTEGER;
        if (rankA !== rankB) return rankA - rankB;
        const scoreA = a.strategicValueScore ?? -1;
        const scoreB = b.strategicValueScore ?? -1;
        if (scoreA !== scoreB) return scoreB - scoreA;
        return a.displayName.localeCompare(b.displayName, 'zh-CN');
      });
  }, [accountsQuery.data, intelligenceById, researchById, search]);

  const selectedCount = selected.size;
  const toggle = (businessId: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(businessId)) next.delete(businessId); else next.add(businessId);
    return next;
  });
  const selectVisible = () => {
    if (!isAdmin) return;
    setSelected(new Set(rows.flatMap((row) => row.businessId ? [row.businessId] : [])));
  };

  const bulkDelete = async () => {
    if (!isAdmin || bulkBusy || selectedCount === 0) return;
    if (!window.confirm(`将所选 ${selectedCount} 家客户公司移入回收站？\n\n此批量操作仅限超级管理员。移入回收站后仍可恢复。`)) return;
    setBulkBusy(true); setError(null); setNotice(null);
    try {
      const result = await bulkDeleteCrmRecordsInChunks('company', [...selected], 'soft-delete');
      const succeeded = new Set(result.succeeded);
      if (succeeded.size > 0) {
        accountsQuery.setData((current) => (current ?? []).filter((account) => {
          const businessId = account.businessId;
          return businessId === null || !succeeded.has(businessId);
        }));
        intelligenceQuery.setData((current) => (current ?? []).filter((profile) => !succeeded.has(profile.businessId)));
        invalidateCrmEntities(session, ['accounts', 'customer-intelligence']);
      }
      setSelected((current) => new Set([...current].filter((businessId) => !succeeded.has(businessId))));
      if (result.failed.length > 0) {
        const names = new Map(rows.flatMap((row) => row.businessId ? [[row.businessId, row.displayName] as const] : []));
        const failedNames = result.failed.slice(0, 5).map((failure) => names.get(failure.businessId) ?? failure.businessId.slice(0, 8));
        setError(`已移入回收站 ${result.succeeded.length} 家，${result.failed.length} 家失败：${failedNames.join('、')}${result.failed.length > 5 ? '…' : ''}`);
      } else {
        setNotice(`已将 ${result.succeeded.length} 家客户公司移入回收站。`);
      }
    } catch {
      setError('批量删除未执行成功。请确认当前账号为超级管理员后重试。');
    } finally {
      setBulkBusy(false);
    }
  };

  const loading = accountsQuery.isPending || contactsQuery.isPending || opportunitiesQuery.isPending || (view === 'INSIGHTS' && researchLoading);

  return <section className="crm-section-card" data-testid="company-development-board">
    <div className="crm-section-head">
      <div>
        <h3>客户开发总览</h3>
        <p>按“先看价值 → 看当前阶段 → 看下一步动作”的方式管理客户；研究字段和销售进展分层维护。</p>
      </div>
      <span className="crm-channel-chip">{rows.length} 家</span>
    </div>
    <div className="company-view-tabs" role="tablist" aria-label="客户开发视图">
      <button className={view === 'DEVELOPMENT' ? 'active' : ''} onClick={() => setView('DEVELOPMENT')}>开发推进</button>
      <button className={view === 'ENERGY' ? 'active' : ''} onClick={() => setView('ENERGY')}>用能与项目</button>
      <button className={view === 'RESEARCH' ? 'active' : ''} onClick={() => setView('RESEARCH')}>研究资料</button>
      <button className={view === 'INSIGHTS' ? 'active' : ''} onClick={() => setView('INSIGHTS')}>研究洞察</button>
    </div>

    {isAdmin && <div className="crm-data-actions" data-testid="company-development-bulk-actions">
      <button className="crm-link-button" onClick={selectVisible} disabled={bulkBusy || rows.length === 0}>全选当前结果</button>
      {selectedCount > 0 && <button className="crm-link-button" onClick={() => setSelected(new Set())} disabled={bulkBusy}>取消选择</button>}
      <button className="danger-text-button" onClick={() => void bulkDelete()} disabled={bulkBusy || selectedCount === 0}>{bulkBusy ? '批量删除中…' : `批量移入回收站 (${selectedCount})`}</button>
      <span className="crm-muted">批量删除仅超级管理员可见；员工没有此入口。</span>
    </div>}

    {notice && <div className="real-success" role="status">{notice}</div>}
    {error && <div className="real-error" role="alert">{error}</div>}
    {view === 'INSIGHTS' && researchError && <div className="real-error" role="alert">{researchError}</div>}

    <div className="table-wrap customer-table-scroll">
      <table className="customer-company-table company-development-table">
        <thead>
          {view === 'DEVELOPMENT' && <tr>{isAdmin && <th>选择</th>}<th>排名</th><th>客户公司</th><th>行业 / 地区</th><th>价值 / 优先级</th><th>核验</th><th>当前阶段</th><th>下一步动作</th><th>联系人</th><th>商机</th></tr>}
          {view === 'ENERGY' && <tr>{isAdmin && <th>选择</th>}<th>客户公司</th><th>月用电量</th><th>月电费</th><th>供电情况</th><th>关键设备 / 痛点</th><th>项目需求</th><th>现有光伏</th><th>现有储能</th></tr>}
          {view === 'RESEARCH' && <tr>{isAdmin && <th>选择</th>}<th>排名</th><th>公司名称 / 商业名称</th><th>RUC</th><th>行业 / 地区</th><th>GBAP评分</th><th>核验等级</th><th>营收</th><th>员工</th><th>联系资料</th></tr>}
          {view === 'INSIGHTS' && <tr>{isAdmin && <th>选择</th>}<th>排名</th><th>客户公司</th><th>研究优先级 / 完整度</th><th>主要场址 / 能源估算</th><th>待核关键岗位</th><th>核验证据</th><th>机会信号</th><th>已知能源数据</th><th>推荐方案 / 切入点</th><th>下一步研究动作</th></tr>}
        </thead>
        <tbody>{rows.map((company) => {
          const businessId = company.businessId ?? '';
          const opportunities = businessId ? opportunitiesByCompany.get(businessId) ?? [] : [];
          const stage = stageInfo(opportunities);
          const contactCount = businessId ? contactsByCompany.get(businessId) ?? 0 : 0;
          const checked = Boolean(businessId && selected.has(businessId));
          const selection = isAdmin ? <td><input aria-label={`选择${company.displayName}`} type="checkbox" checked={checked} disabled={!businessId || bulkBusy} onChange={() => businessId && toggle(businessId)} /></td> : null;
          const insight = company.researchInsight;
          const site = insight?.primarySite;
          if (view === 'INSIGHTS') {
            const siteLocation = site ? [site.province, site.city, site.address].filter(Boolean).join(' · ') : '';
            const research = insight?.researchIntelligence;
            return <tr key={businessId || company.displayName} data-testid={`company-research-insight-row-${businessId}`}>
              {selection}
              <td>{company.researchRank ?? '—'}</td>
              <td><strong>{company.displayName}</strong><small style={{ display: 'block' }}>{company.registrationId ? `RUC ${company.registrationId}` : compactLocation(company)}</small></td>
              <td><strong>{research?.researchPriority || company.priority || '待定'}</strong><small style={{ display: 'block' }}>{research?.researchCompleteness || '完整度待补充'}</small></td>
              <td>{siteLocation || '场址待补充'}<small style={{ display: 'block' }}>场址 {insight?.siteCount ?? 0} · 月用电估算 {formatNumber(site?.estimatedMonthlyConsumptionKwh, ' kWh')} · 峰值 {formatNumber(site?.estimatedPeakDemandKw, ' kW')}</small>{site?.energyPainPoints ? <small style={{ display: 'block' }}>{site.energyPainPoints}</small> : null}</td>
              <td>{roleSummary(insight?.targetRoles ?? [])}<small style={{ display: 'block' }}>待核 {insight?.openTargetRoleCount ?? 0} · 已关联 {insight?.resolvedTargetRoleCount ?? 0}</small></td>
              <td>{insight?.latestEvidence?.statement || insight?.latestEvidence?.sourceTitle || '待补充'}<small style={{ display: 'block' }}>证据 {insight?.evidenceCount ?? 0} · {insight?.latestEvidence?.verifiedAt || '日期待核'}</small></td>
              <td>{opportunitySignalText(insight)}</td>
              <td>{insight?.energyDiscovery?.publicKnownEnergyData || '暂无公开实际能源数据'}</td>
              <td>{[research?.recommendedSolution, research?.recommendedEntryPoint].filter(Boolean).join(' · ') || '待研究'}<small style={{ display: 'block' }}>{research?.estimatedProjectScale || ''}</small></td>
              <td>{research?.researchNextAction || research?.firstContactGuidance || stage.nextAction}</td>
            </tr>;
          }
          if (view === 'ENERGY') {
            const monthlyConsumption = company.monthlyConsumptionKwh ?? site?.estimatedMonthlyConsumptionKwh;
            const equipmentPain = [company.keyEquipmentText || site?.keyEquipmentText, company.energyPainPoints || site?.energyPainPoints].filter(Boolean).join(' · ');
            return <tr key={businessId || company.displayName}>{selection}<td><strong>{company.displayName}</strong><small style={{ display: 'block' }}>{company.industry || '行业待补充'} · {compactLocation(company)}</small></td><td>{formatNumber(monthlyConsumption, ' kWh')}{company.monthlyConsumptionKwh == null && site?.estimatedMonthlyConsumptionKwh != null ? <small style={{ display: 'block' }}>研究估算</small> : null}</td><td>{formatMoney(company.monthlyElectricityCost, company.electricityCostCurrency ?? 'USD')}</td><td>{company.gridStability ? GRID_LABELS[company.gridStability] ?? '待确认' : site?.energyPainPoints ? '有供电 / 停电研究线索' : '待补充'}</td><td>{equipmentPain || '待补充'}</td><td>{(company.projectNeeds ?? []).map((need) => NEED_LABELS[need]).join('、') || opportunitySignalText(insight)}</td><td>{formatNumber(company.existingSolarKw, ' kW')}</td><td>{formatNumber(company.existingStorageKwh, ' kWh')}</td></tr>;
          }
          if (view === 'RESEARCH') return <tr key={businessId || company.displayName}>{selection}<td>{company.researchRank ?? '—'}</td><td><strong>{company.displayName}</strong>{company.commercialName && company.commercialName !== company.displayName ? <small style={{ display: 'block' }}>{company.commercialName}</small> : null}</td><td>{company.registrationId || '待补充'}</td><td>{company.industry || '待补充'}<small style={{ display: 'block' }}>{compactLocation(company)}</small></td><td>{company.strategicValueScore ?? '—'}</td><td>{company.verificationGrade || '待核验'}</td><td>{formatMoney(company.annualRevenue, company.annualRevenueCurrency ?? 'USD')}</td><td>{formatNumber(company.employeeCount)}</td><td>{company.primaryPhone || company.primaryEmail || company.website || '待补充'}</td></tr>;
          return <tr key={businessId || company.displayName}>{selection}<td>{company.researchRank ?? '—'}</td><td><strong>{company.displayName}</strong><small style={{ display: 'block' }}>{company.registrationId ? `RUC ${company.registrationId}` : RELATION_LABELS[company.relationshipStatus ?? ''] ?? '潜在客户'}</small></td><td>{company.industry || '待补充'}<small style={{ display: 'block' }}>{compactLocation(company)}</small></td><td><strong>{company.strategicValueScore ?? '—'}</strong><small style={{ display: 'block' }}>优先级 {PRIORITY_LABELS[company.priority ?? ''] ?? company.priority ?? '待定'}</small></td><td>{company.verificationGrade || '待核验'}</td><td><strong>{stage.label}</strong>{stage.opportunity?.nameSummary ? <small style={{ display: 'block' }}>{stage.opportunity.nameSummary}</small> : null}</td><td>{stage.nextAction}</td><td>{contactCount}</td><td>{opportunities.length}</td></tr>;
        })}</tbody>
      </table>
      {!loading && rows.length === 0 && <div className="real-empty">没有符合当前搜索条件的客户公司。</div>}
      {loading && <div className="real-empty">正在加载客户开发信息…</div>}
    </div>
  </section>;
}
