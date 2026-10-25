import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'twenty-ui/input';
import {
  updateAccount,
  type CanonicalAccount,
  type CanonicalContact,
  type CanonicalOpportunity,
  type AccountPriority,
} from '../lib/crmBusinessClient';
import {
  updateCustomerIntelligenceProfile,
  type CustomerIntelligenceProfile,
  type Top500V46ManualOverrides,
} from '../lib/crmCustomerIntelligenceClient';
import {
  DEVELOPMENT_STAGE_LABELS,
  FOLLOW_UP_STATUS_OPTIONS,
  normalizeDevelopmentStage,
  type DevelopmentStage,
} from '../lib/crmDevelopmentStage';
import {
  listCompanyResearchInsights,
  type CompanyResearchInsight,
} from '../lib/crmCompanyResearchInsightsClient';
import type { EcuadorTop500Header } from '../lib/crmResearchIntake';
import {
  assertTop500V46Contract,
  TOP500_V46_LONG_TEXT_FIELDS,
  TOP500_V46_MODULES,
  TOP500_V46_MODULE_HEADERS,
} from '../lib/crmTop500V46Contract';
import {
  buildCompanyProfile75Values,
  type CompanyProfile75Record,
} from './CompanyBasicProfile75Detail';
import './company-basic-profile-75.css';

type Props = {
  company: CompanyProfile75Record;
  contacts: CanonicalContact[];
  opportunities: CanonicalOpportunity[];
  onCancel: () => void;
  onSaved: (account: CanonicalAccount, intelligence: CustomerIntelligenceProfile) => void;
};

const PRIORITY_FROM_TEXT: Record<string, AccountPriority> = {
  高: 'HIGH', 中: 'MEDIUM', 低: 'LOW', HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW',
};
const STAGE_FROM_LABEL = Object.fromEntries(
  Object.entries(DEVELOPMENT_STAGE_LABELS).map(([key, label]) => [label, key]),
) as Record<string, DevelopmentStage>;

function editable(value: string) { return value === '待补充' ? '' : value; }
function clean(value: string) { const normalized = value.trim(); return normalized === '' ? null : normalized; }
function numberFromText(value: string) {
  const normalized = value.replace(/,/g, '').replace(/USD/gi, '').replace(/[^0-9.+-]/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
function integerFromText(value: string) {
  const parsed = numberFromText(value);
  return parsed === null ? null : Math.round(parsed);
}
function changed(draft: Record<EcuadorTop500Header, string>, initial: Record<EcuadorTop500Header, string>, header: EcuadorTop500Header) {
  return draft[header].trim() !== initial[header].trim();
}
function errorText(cause: unknown) {
  const typed = cause as { status?: number; body?: { error?: string } };
  if (typed?.status === 401) return '登录状态已失效，请重新登录。';
  if (typed?.status === 400 && typed.body?.error?.startsWith('unsupported_profile75_field:')) return '客户资料字段结构不一致，系统已阻止保存。';
  if (typed?.status === 400 && typed.body?.error === 'invalid_development_stage') return '当前项目阶段无效，系统已阻止保存。';
  if (typed?.status && typed.status >= 500) return 'CRM 服务暂时不可用，请稍后重试。';
  return '保存客户资料失败，请检查填写内容后重试。';
}

export function CompanyProfile75Editor({ company, contacts, opportunities, onCancel, onSaved }: Props) {
  const [insight, setInsight] = useState<CompanyResearchInsight | null>(null);
  const [researchLoading, setResearchLoading] = useState(Boolean(company.businessId));
  const [draft, setDraft] = useState<Record<EcuadorTop500Header, string> | null>(null);
  const [initialDraft, setInitialDraft] = useState<Record<EcuadorTop500Header, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!company.businessId) { setResearchLoading(false); return; }
    let active = true;
    setResearchLoading(true);
    void listCompanyResearchInsights()
      .then((rows) => { if (active) setInsight(rows.find((item) => item.accountBusinessId === company.businessId) ?? null); })
      .catch(() => { if (active) setInsight(null); })
      .finally(() => { if (active) setResearchLoading(false); });
    return () => { active = false; };
  }, [company.businessId]);

  const baseline = useMemo(() => buildCompanyProfile75Values(company, contacts, opportunities, insight), [company, contacts, opportunities, insight]);

  useEffect(() => {
    const key = company.businessId ?? company.displayName;
    if (researchLoading || initializedFor.current === key) return;
    assertTop500V46Contract();
    const next = Object.fromEntries(TOP500_V46_MODULE_HEADERS.map((header) => [header, editable(baseline[header])])) as Record<EcuadorTop500Header, string>;
    setDraft(next);
    setInitialDraft({ ...next });
    initializedFor.current = key;
  }, [baseline, company.businessId, company.displayName, researchLoading]);

  const update = (header: EcuadorTop500Header, value: string) => setDraft((current) => {
    if (!current) return current;
    if (header === '销售状态' || header === '当前项目阶段') {
      return { ...current, '销售状态': value, '当前项目阶段': value };
    }
    return { ...current, [header]: value };
  });

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || !initialDraft || !company.businessId || saving) return;
    const contract = assertTop500V46Contract();
    if (!contract.ok || TOP500_V46_MODULE_HEADERS.length !== 75) return;
    if (!draft['公司名称'].trim()) { setError('公司名称不能为空。'); return; }

    setSaving(true);
    setError(null);
    try {
      const accountPatch: Parameters<typeof updateAccount>[1] = {};
      if (changed(draft, initialDraft, '公司名称')) accountPatch.displayName = draft['公司名称'].trim();
      if (changed(draft, initialDraft, '商业名称')) accountPatch.commercialName = clean(draft['商业名称']);
      if (changed(draft, initialDraft, 'RUC')) accountPatch.registrationId = clean(draft.RUC);
      if (changed(draft, initialDraft, '数据核验等级')) accountPatch.verificationGrade = clean(draft['数据核验等级']);
      if (changed(draft, initialDraft, '开发排名')) accountPatch.researchRank = integerFromText(draft['开发排名']);
      if (changed(draft, initialDraft, 'GBAP价值评分')) accountPatch.strategicValueScore = numberFromText(draft['GBAP价值评分']);
      if (changed(draft, initialDraft, '官网')) accountPatch.website = clean(draft['官网']);
      if (changed(draft, initialDraft, 'LinkedIn')) accountPatch.linkedinUrl = clean(draft.LinkedIn);
      if (changed(draft, initialDraft, '行业大类')) accountPatch.industry = clean(draft['行业大类']);
      if (changed(draft, initialDraft, '公司电话')) accountPatch.primaryPhone = clean(draft['公司电话']);
      if (changed(draft, initialDraft, '公司邮箱')) accountPatch.primaryEmail = clean(draft['公司邮箱']);
      if (changed(draft, initialDraft, '省/州')) accountPatch.addressState = clean(draft['省/州']);
      if (changed(draft, initialDraft, '城市')) accountPatch.addressCity = clean(draft['城市']);
      if (changed(draft, initialDraft, '2025营收USD')) {
        accountPatch.annualRevenue = numberFromText(draft['2025营收USD']);
        accountPatch.annualRevenueCurrency = accountPatch.annualRevenue === null ? null : 'USD';
      }
      if (changed(draft, initialDraft, '员工人数')) accountPatch.employeeCount = integerFromText(draft['员工人数']);
      if (changed(draft, initialDraft, '销售负责人')) accountPatch.accountOwnerUserId = clean(draft['销售负责人']);
      if (changed(draft, initialDraft, '开发优先级')) accountPatch.priority = PRIORITY_FROM_TEXT[draft['开发优先级'].trim()] ?? company.priority ?? null;

      const updatedAccount = Object.keys(accountPatch).length
        ? await updateAccount(company.businessId, accountPatch)
        : company as CanonicalAccount;

      const overrides: Top500V46ManualOverrides = { ...(company.profile75Overrides ?? {}) };
      for (const header of TOP500_V46_MODULE_HEADERS) {
        if (header === '销售状态' || header === '当前项目阶段') continue;
        if (!changed(draft, initialDraft, header)) continue;
        overrides[header] = clean(draft[header]);
      }
      const selectedStage = STAGE_FROM_LABEL[draft['当前项目阶段'].trim()]
        ?? normalizeDevelopmentStage(company.developmentStage ?? 'NEW');
      const intelligence = await updateCustomerIntelligenceProfile(company.businessId, {
        developmentStage: selectedStage,
        profile75Overrides: overrides,
      });
      onSaved(updatedAccount, intelligence);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  };

  if (!draft || !initialDraft) {
    return <div className="company-drawer-body" data-testid="company-profile-75-editor-loading">正在读取客户资料…</div>;
  }

  return <form className="top500-v46-editor-form" onSubmit={save} data-testid="company-profile-75-editor" data-field-count="75">
    <div className="company-editor-header">
      <div><span className="company-eyebrow">编辑客户资料</span><h3>{company.displayName}</h3><p>修改客户信息；项目阶段会在相关页面保持一致。</p></div>
      <Button title="取消" size="small" variant="secondary" type="button" onClick={onCancel} />
    </div>
    <div className="top500-v46-editor">
      {error && <div className="real-error" role="alert">{error}</div>}
      <p className="top500-v46-editor-note">按业务模块维护客户资料；未填写的信息可后续继续补充。</p>
      {TOP500_V46_MODULES.map((module) => <section className="company-profile-module top500-v46-module" key={module.title}>
        <div className="company-profile-module-head"><h4>{module.title}</h4><span>{module.headers.length} 项</span></div>
        <div className="company-profile-field-grid top500-v46-field-grid" data-top500-edit-module={module.title}>
          {module.headers.map((header) => <div className="company-profile-field top500-v46-field" key={header} data-top500-edit-field={header}>
            <label htmlFor={`top500-${header}`}>{header}</label>
            {header === '销售状态' || header === '当前项目阶段'
              ? <select id={`top500-${header}`} aria-label={header} value={draft[header]} onChange={(event) => update(header, event.target.value)}>{FOLLOW_UP_STATUS_OPTIONS.map(([key, label]) => <option key={key} value={label}>{label}</option>)}</select>
              : TOP500_V46_LONG_TEXT_FIELDS.has(header)
                ? <textarea id={`top500-${header}`} aria-label={header} value={draft[header]} onChange={(event) => update(header, event.target.value)} />
                : <input id={`top500-${header}`} aria-label={header} value={draft[header]} onChange={(event) => update(header, event.target.value)} />}
          </div>)}
        </div>
      </section>)}
    </div>
    <div className="top500-v46-editor-footer">
      <span>保存后将同步更新当前客户资料。</span>
      <div><Button title="取消" size="small" variant="secondary" type="button" onClick={onCancel} /><Button title={saving ? '保存中' : '保存修改'} size="small" type="submit" disabled={saving || !draft['公司名称'].trim()} /></div>
    </div>
  </form>;
}
