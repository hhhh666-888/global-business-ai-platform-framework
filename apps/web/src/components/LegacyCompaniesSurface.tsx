import { useCallback, useMemo, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { IconBuildingSkyscraper, IconPlus, IconRefresh } from 'twenty-ui/icon';
import { bulkDeleteCrmRecordsInChunks } from '../lib/crmAdminBulkClient';
import { deleteAccount, type CanonicalAccount } from '../lib/crmBusinessClient';
import {
  type CustomerIntelligenceProfile,
  type CustomerSegment,
} from '../lib/crmCustomerIntelligenceClient';
import { DEVELOPMENT_STAGE_LABELS } from '../lib/crmDevelopmentStage';
import {
  useCrmAccountsQuery,
  useCrmCompanyResearchInsightsQuery,
  useCrmContactsQuery,
  useCrmCustomerIntelligenceQuery,
  useCrmOpportunitiesQuery,
} from '../lib/crmEntityQueries';
import type { GbapSession } from '../hooks/useGbapSession';
import { CompanyBasicProfile75Detail } from './CompanyBasicProfile75Detail';
import { CompanyFilesSection } from './CompanyFilesSection';
import { CompanyDevelopmentDetail, resolveCompanyDevelopmentStage } from './CompanyDevelopmentDetail';
import { CompanyProfile75Create } from './CompanyProfile75Create';
import { NativeModalLayer } from './NativeModalLayer';
import { CompanyProfile75Editor } from './CompanyProfile75Editor';
import { CompanyTop500Table } from './CompanyTop500Table';
import './companies.css';

type CompaniesSurfaceProps = { session: GbapSession; search?: string };
type CompanyRecord = CanonicalAccount & Partial<CustomerIntelligenceProfile>;
type DrawerMode = 'view' | 'edit' | 'create' | null;
type DrawerTab = 'overview' | 'development';

const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  INDUSTRIAL: '工业用能客户',
  CHANNEL: '渠道 / 经销商',
  PROJECT: 'EPC / 项目型客户',
  PUBLIC: '公共事业客户',
  OTHER: '其他',
};

function inferSegment(account: CompanyRecord): CustomerSegment {
  if (account.customerSegment) return account.customerSegment;
  if (account.customerType === 'FACTORY' || account.customerType === 'END_USER') return 'INDUSTRIAL';
  if (account.customerType === 'DISTRIBUTOR') return 'CHANNEL';
  if (account.customerType === 'EPC' || account.customerType === 'DEVELOPER') return 'PROJECT';
  if (account.customerType === 'UTILITY' || account.customerType === 'GOVERNMENT') return 'PUBLIC';
  return 'OTHER';
}

function businessError(cause: unknown, fallback: string) {
  const typed = cause as { status?: number; body?: { error?: string; detail?: Record<string, number> } };
  if (typed?.status === 401) return '登录状态已失效，请重新登录。';
  if (typed?.status === 409 && typed.body?.error === 'record_has_related_records') {
    const detail = typed.body.detail ?? {};
    const parts = [
      detail.contacts ? `${detail.contacts} 个联系人` : '',
      detail.opportunities ? `${detail.opportunities} 个商机` : '',
      detail.tasks ? `${detail.tasks} 个任务` : '',
      detail.notes ? `${detail.notes} 条笔记` : '',
    ].filter(Boolean);
    return `该公司仍有关联记录（${parts.join('、') || '请先处理关联数据'}），系统已阻止删除。`;
  }
  if (typed?.status === 409 && typed.body?.error === 'record_has_attached_files') return '该公司仍有附件。请先处理附件，再删除公司。';
  if (typed?.status === 409) return '该记录当前存在关联或状态冲突，请刷新后重试。';
  if (typed?.status && typed.status >= 500) return 'CRM 服务暂时不可用，请稍后重试。';
  return fallback;
}

function ConnectionGate({ title, detail, action, error }: { title: string; detail: string; action?: React.ReactNode; error?: string | null }) {
  return <section className="real-data-gate">
    <div className="real-data-gate-icon"><IconBuildingSkyscraper size={22} /></div>
    <div><h2>{title}</h2><p>{detail}</p>{error && <div className="real-error" role="alert">{error}</div>}{action && <div className="real-data-gate-action">{action}</div>}</div>
  </section>;
}

export function CompaniesSurface({ session, search = '' }: CompaniesSurfaceProps) {
  const accountQuery = useCrmAccountsQuery(session);
  const contactQuery = useCrmContactsQuery(session);
  const opportunityQuery = useCrmOpportunitiesQuery(session);
  const intelligenceQuery = useCrmCustomerIntelligenceQuery(session);
  const researchInsightsQuery = useCrmCompanyResearchInsightsQuery(session);

  const intelligenceById = useMemo(
    () => new Map((intelligenceQuery.data ?? []).map((item) => [item.businessId, item])),
    [intelligenceQuery.data],
  );
  const accounts = useMemo<CompanyRecord[]>(
    () => (accountQuery.data ?? []).map((account) => ({
      ...account,
      ...(account.businessId ? intelligenceById.get(account.businessId) : undefined),
    })),
    [accountQuery.data, intelligenceById],
  );
  const contacts = contactQuery.data ?? [];
  const opportunities = opportunityQuery.data ?? [];
  const researchInsights = researchInsightsQuery.data ?? [];

  const queries = [accountQuery, contactQuery, opportunityQuery, intelligenceQuery, researchInsightsQuery];
  const loading = queries.some((query) => query.isPending && !query.data);
  const refreshing = !loading && queries.some((query) => query.isFetching);
  const loadError = accountQuery.error ?? contactQuery.error ?? opportunityQuery.error ?? intelligenceQuery.error ?? researchInsightsQuery.error;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('overview');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const isSuperAdmin = session.status === 'authenticated' && Boolean(session.identity?.roles?.includes('substrate-admin'));
  const selected = useMemo(
    () => accounts.find((item) => item.businessId === selectedId) ?? null,
    [accounts, selectedId],
  );
  const selectedContacts = useMemo(
    () => selected?.businessId ? contacts.filter((item) => item.accountBusinessId === selected.businessId) : [],
    [contacts, selected],
  );
  const selectedOpportunities = useMemo(
    () => selected?.businessId ? opportunities.filter((item) => item.accountBusinessId === selected.businessId) : [],
    [opportunities, selected],
  );

  const refreshAll = useCallback(async () => {
    setError(null);
    await Promise.all([
      accountQuery.refetch(),
      contactQuery.refetch(),
      opportunityQuery.refetch(),
      intelligenceQuery.refetch(),
      researchInsightsQuery.refetch(),
    ]);
  }, [accountQuery.refetch, contactQuery.refetch, opportunityQuery.refetch, intelligenceQuery.refetch, researchInsightsQuery.refetch]);

  const openCompany = (account: CompanyRecord) => {
    setSelectedId(account.businessId);
    setDrawerMode('view');
    setDrawerTab('overview');
    setError(null);
    setNotice(null);
  };

  const startCreate = () => {
    setSelectedId(null);
    setDrawerMode('create');
    setDrawerTab('overview');
    setError(null);
    setNotice(null);
  };

  const startEdit = () => {
    if (!selected) return;
    setDrawerMode('edit');
    setError(null);
    setNotice(null);
  };

  const closeDrawer = () => {
    setDrawerMode(null);
    setSelectedId(null);
    setDrawerTab('overview');
  };

  const writeAccountCache = (account: CanonicalAccount) => {
    accountQuery.setData((current) => {
      const base = current ?? [];
      return [account, ...base.filter((item) => item.businessId !== account.businessId)];
    });
  };

  const writeIntelligenceCache = (intelligence: CustomerIntelligenceProfile) => {
    intelligenceQuery.setData((current) => {
      const base = current ?? [];
      return [intelligence, ...base.filter((item) => item.businessId !== intelligence.businessId)];
    });
  };

  const handleCreated = (account: CanonicalAccount, intelligence: CustomerIntelligenceProfile) => {
    writeAccountCache(account);
    writeIntelligenceCache(intelligence);
    setSelectedId(account.businessId);
    setDrawerMode('view');
    setDrawerTab('overview');
    setNotice('客户公司已创建。');
  };

  const handleSaved = (account: CanonicalAccount, intelligence: CustomerIntelligenceProfile) => {
    writeAccountCache(account);
    writeIntelligenceCache(intelligence);
    setSelectedId(account.businessId);
    setDrawerMode('view');
    setDrawerTab('overview');
    setNotice('客户公司资料已更新。');
  };

  const removeSelected = async () => {
    if (!selected?.businessId || deleting) return;
    if (!window.confirm(`确认删除“${selected.displayName}”？\n\n如果仍有关联联系人、商机、任务、笔记或附件，系统会自动阻止删除。`)) return;
    const removedId = selected.businessId;
    setDeleting(true);
    setError(null);
    setNotice(null);
    try {
      await deleteAccount(removedId);
      accountQuery.setData((current) => (current ?? []).filter((item) => item.businessId !== removedId));
      intelligenceQuery.setData((current) => (current ?? []).filter((item) => item.businessId !== removedId));
      researchInsightsQuery.setData((current) => (current ?? []).filter((item) => item.accountBusinessId !== removedId));
      closeDrawer();
      setNotice('客户公司已删除。');
    } catch (cause) {
      setError(businessError(cause, '客户公司删除失败，请重试。'));
    } finally {
      setDeleting(false);
    }
  };

  const bulkDeleteCompanies = async (businessIds: string[]) => {
    if (!isSuperAdmin || bulkDeleting) return [];
    const ids = [...new Set(businessIds.filter(Boolean))];
    if (ids.length === 0) return [];
    const selectedSet = new Set(ids);
    const knownContacts = contacts.filter((item) => selectedSet.has(item.accountBusinessId ?? '')).length;
    const knownOpportunities = opportunities.filter((item) => selectedSet.has(item.accountBusinessId ?? '')).length;
    const impact = [knownContacts ? `${knownContacts} 个已加载联系人` : '', knownOpportunities ? `${knownOpportunities} 个已加载商机` : ''].filter(Boolean).join('、');
    if (!window.confirm(`确认批量删除所选 ${ids.length} 家客户公司？\n\n这是普通删除：成功记录会进入回收站，可恢复，不是永久删除。${impact ? `\n当前已识别关联：${impact}。` : ''}\n系统会逐条检查关联记录和附件；存在保护关系的公司会阻止删除，不会级联删除关联业务数据。`)) return [];

    setBulkDeleting(true);
    setError(null);
    setNotice(null);
    try {
      const result = await bulkDeleteCrmRecordsInChunks('company', ids, 'soft-delete');
      const succeeded = result.succeeded.filter((id): id is string => Boolean(id));
      const succeededSet = new Set(succeeded);
      if (succeeded.length > 0) {
        accountQuery.setData((current) => (current ?? []).filter((item) => !item.businessId || !succeededSet.has(item.businessId)));
        intelligenceQuery.setData((current) => (current ?? []).filter((item) => !succeededSet.has(item.businessId ?? '')));
        researchInsightsQuery.setData((current) => (current ?? []).filter((item) => !succeededSet.has(item.accountBusinessId ?? '')));
      }
      if (result.failed.length > 0) {
        const examples = result.failed.slice(0, 5).map((item) => item.error).join('、');
        setError(`批量删除完成 ${succeeded.length} 家，${result.failed.length} 家因关联、附件或状态保护未删除${examples ? `：${examples}${result.failed.length > 5 ? '…' : ''}` : '。'}`);
      } else {
        setNotice(`已将 ${succeeded.length} 家客户公司移入回收站。`);
      }
      return succeeded;
    } catch (cause) {
      setError(businessError(cause, '批量删除失败，请刷新后重试。'));
      return [];
    } finally {
      setBulkDeleting(false);
    }
  };

  if (session.status === 'initializing') {
    return <ConnectionGate title="正在恢复登录状态" detail="请稍候…" />;
  }
  if (session.status !== 'authenticated') {
    return <ConnectionGate
      title="登录后查看客户公司"
      detail="登录企业账号后即可查看和管理客户公司资料。"
      action={<Button title="企业登录" onClick={() => void session.login('companies')} />}
      error={session.error ? '登录状态异常，请重新登录。' : null}
    />;
  }

  const visibleError = error ?? (loadError ? businessError(loadError, '客户公司加载失败，请刷新后重试。') : null);
  const drawerOpen = drawerMode !== null;
  const stageLabel = selected
    ? DEVELOPMENT_STAGE_LABELS[resolveCompanyDevelopmentStage(selected, selectedOpportunities)]
    : null;

  return <section className="panel flush customer-database-surface" data-surface="real-account-wiring" data-company-contract="TOP500_V46_75">
    <div className="object-toolbar company-contract-toolbar">
      <div>
        <h2>客户公司</h2>
        <p>{loading ? '正在加载…' : `${accounts.length} 家公司${refreshing ? ' · 后台同步中' : ''}`}</p>
      </div>
      <div className="toolbar-actions">
        <button className="tool-button" onClick={() => void refreshAll()} disabled={loading || refreshing}><IconRefresh size={15} /> {loading || refreshing ? '同步中' : '刷新'}</button>
        <button type="button" className="tool-button page-primary-action" onClick={startCreate}><IconPlus size={15} /> 新建客户公司</button>
      </div>
    </div>

    {visibleError && <div className="real-error" role="alert">{visibleError}</div>}
    {notice && <div className="real-success" role="status">{notice}</div>}

    {!loading && <CompanyTop500Table
      accounts={accounts}
      contacts={contacts}
      opportunities={opportunities}
      insights={researchInsights}
      researchLoading={researchInsightsQuery.isFetching}
      search={search}
      userKey={session.identity?.subject ?? null}
      isSuperAdmin={isSuperAdmin}
      bulkDeleting={bulkDeleting}
      onBulkDelete={bulkDeleteCompanies}
      onOpen={openCompany}
    />}

    {drawerOpen && <NativeModalLayer className="company-drawer-backdrop" title={drawerMode === 'create' ? '新建客户公司' : selected?.displayName ?? '客户公司详情'} onClose={closeDrawer}>
      <aside className="company-detail-drawer">
        {drawerMode === 'create' && <CompanyProfile75Create onCancel={closeDrawer} onCreated={handleCreated} />}

        {drawerMode === 'edit' && selected && <CompanyProfile75Editor
          company={selected}
          contacts={selectedContacts}
          opportunities={selectedOpportunities}
          onCancel={() => setDrawerMode('view')}
          onSaved={handleSaved}
        />}

        {drawerMode === 'view' && selected && <>
          <div className="company-drawer-header">
            <div>
              <span className="company-eyebrow">{SEGMENT_LABELS[inferSegment(selected)]}</span>
              <h3>{selected.displayName}</h3>
              <p>{selected.industry || '待补充行业'} · {selected.addressState || selected.addressCity || '待补充地区'} · 开发进度：{stageLabel}</p>
            </div>
            <div className="company-detail-actions">
              <Button title="编辑客户资料" size="small" variant="secondary" onClick={startEdit} />
              <button type="button" className="danger-text-button" disabled={deleting} onClick={() => void removeSelected()}>{deleting ? '删除中…' : '删除公司'}</button>
              <button type="button" className="drawer-close-button" aria-label="关闭客户详情" onClick={closeDrawer}>×</button>
            </div>
          </div>

          <div className="company-drawer-tabs">
            <button type="button" className={drawerTab === 'overview' ? 'active' : ''} onClick={() => setDrawerTab('overview')}>基础信息</button>
            <button type="button" className={drawerTab === 'development' ? 'active' : ''} onClick={() => setDrawerTab('development')}>开发进度</button>
          </div>

          {drawerTab === 'overview' && <CompanyBasicProfile75Detail company={selected} contacts={selectedContacts} opportunities={selectedOpportunities}>
            {selected.businessId && <CompanyFilesSection key={selected.businessId} session={session} businessId={selected.businessId} />}
          </CompanyBasicProfile75Detail>}
          {drawerTab === 'development' && <CompanyDevelopmentDetail company={selected} contacts={selectedContacts} opportunities={selectedOpportunities} />}
        </>}
      </aside>
    </NativeModalLayer>}
  </section>;
}
