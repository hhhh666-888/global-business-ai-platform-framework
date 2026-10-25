import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { createAccount, type AccountPriority, type CanonicalAccount } from '../lib/crmBusinessClient';
import {
  updateCustomerIntelligenceProfile,
  type CustomerIntelligenceProfile,
  type CustomerRole,
  type CustomerSegment,
  type Top500V46ManualOverrides,
} from '../lib/crmCustomerIntelligenceClient';
import { DEVELOPMENT_STAGE_LABELS, FOLLOW_UP_STATUS_OPTIONS, type DevelopmentStage } from '../lib/crmDevelopmentStage';
import type { EcuadorTop500Header } from '../lib/crmResearchIntake';
import { ECUADOR_TOP500_V46_SOURCE } from '../lib/crmResearchIntake';
import { assertTop500V46Contract, TOP500_V46_LONG_TEXT_FIELDS, TOP500_V46_MODULE_HEADERS, TOP500_V46_MODULES } from '../lib/crmTop500V46Contract';
import './company-basic-profile-75.css';

type Props = {
  onCancel: () => void;
  onCreated: (account: CanonicalAccount, intelligence: CustomerIntelligenceProfile) => void;
};

const PRIORITY_FROM_TEXT: Record<string, AccountPriority> = { 高: 'HIGH', 中: 'MEDIUM', 低: 'LOW', HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' };
const STAGE_FROM_LABEL = Object.fromEntries(Object.entries(DEVELOPMENT_STAGE_LABELS).map(([key, label]) => [label, key])) as Record<string, DevelopmentStage>;

function clean(value: string) { const normalized = value.trim(); return normalized === '' ? null : normalized; }
function numberFromText(value: string) {
  const normalized = value.replace(/,/g, '').replace(/USD/gi, '').replace(/[^0-9.+-]/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
function integerFromText(value: string) { const parsed = numberFromText(value); return parsed === null ? null : Math.round(parsed); }
function initialDraft() {
  assertTop500V46Contract();
  const draft = Object.fromEntries(TOP500_V46_MODULE_HEADERS.map((header) => [header, ''])) as Record<EcuadorTop500Header, string>;
  draft['销售状态'] = DEVELOPMENT_STAGE_LABELS.NEW;
  draft['当前项目阶段'] = DEVELOPMENT_STAGE_LABELS.NEW;
  return draft;
}
function legacyType(segment: CustomerSegment) {
  return segment === 'CHANNEL' ? 'DISTRIBUTOR' as const : segment === 'PROJECT' ? 'EPC' as const : 'FACTORY' as const;
}
function rolesFor(segment: CustomerSegment): CustomerRole[] {
  return segment === 'CHANNEL' ? ['RENEWABLE_DISTRIBUTOR'] : segment === 'PROJECT' ? ['EPC'] : ['FACTORY'];
}

export function CompanyProfile75Create({ onCancel, onCreated }: Props) {
  const [draft, setDraft] = useState<Record<EcuadorTop500Header, string>>(initialDraft);
  const [segment, setSegment] = useState<CustomerSegment>('INDUSTRIAL');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (header: EcuadorTop500Header, value: string) => setDraft((current) => {
    if (header === '销售状态' || header === '当前项目阶段') return { ...current, '销售状态': value, '当前项目阶段': value };
    return { ...current, [header]: value };
  });

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !draft['公司名称'].trim()) return;
    setSaving(true); setError(null);
    try {
      const annualRevenue = numberFromText(draft['2025营收USD']);
      const account = await createAccount({
        displayName: draft['公司名称'].trim(),
        commercialName: clean(draft['商业名称']),
        registrationCountry: clean(draft.RUC) ? 'EC' : null,
        registrationType: clean(draft.RUC) ? 'RUC' : null,
        registrationId: clean(draft.RUC),
        website: clean(draft['官网']),
        linkedinUrl: clean(draft.LinkedIn),
        industry: clean(draft['行业大类']),
        primaryPhone: clean(draft['公司电话']),
        primaryEmail: clean(draft['公司邮箱']),
        addressState: clean(draft['省/州']),
        addressCity: clean(draft['城市']),
        annualRevenue,
        annualRevenueCurrency: annualRevenue === null ? null : 'USD',
        employeeCount: integerFromText(draft['员工人数']),
        researchRank: integerFromText(draft['开发排名']),
        strategicValueScore: numberFromText(draft['GBAP价值评分']),
        verificationGrade: clean(draft['数据核验等级']),
        accountOwnerUserId: clean(draft['销售负责人']),
        priority: PRIORITY_FROM_TEXT[draft['开发优先级'].trim()] ?? null,
        customerType: legacyType(segment),
        relationshipStatus: 'PROSPECT',
        source: ECUADOR_TOP500_V46_SOURCE,
      });
      if (!account.businessId) throw new Error('created_company_business_id_missing');
      const overrides: Top500V46ManualOverrides = {};
      for (const header of TOP500_V46_MODULE_HEADERS) {
        if (header === '销售状态' || header === '当前项目阶段') continue;
        overrides[header] = clean(draft[header]);
      }
      const intelligence = await updateCustomerIntelligenceProfile(account.businessId, {
        customerSegment: segment,
        customerRoles: rolesFor(segment),
        developmentStage: STAGE_FROM_LABEL[draft['当前项目阶段']] ?? 'NEW',
        profile75Overrides: overrides,
      });
      onCreated(account, intelligence);
    } catch (cause) {
      const typed = cause as { status?: number };
      setError(typed?.status && typed.status >= 500 ? 'CRM 服务暂时不可用，请稍后重试。' : '创建客户公司失败，请检查填写内容后重试。');
    } finally { setSaving(false); }
  };

  return <form className="top500-v46-editor-form" onSubmit={save} data-testid="company-profile-75-create" data-field-count="75">
    <div className="company-editor-header"><div><span className="company-eyebrow">新建客户公司</span><h3>建立客户公司资料</h3><p>创建后可继续补充、编辑，并通过数据导入更新客户资料。</p></div><Button title="取消" size="small" variant="secondary" type="button" onClick={onCancel} /></div>
    <div className="top500-v46-editor">
      {error && <div className="real-error" role="alert">{error}</div>}
      <div className="top500-v46-system-classification"><label><span>系统客户分类</span><select aria-label="系统客户分类" value={segment} onChange={(event) => setSegment(event.target.value as CustomerSegment)}><option value="INDUSTRIAL">工业用能客户</option><option value="CHANNEL">渠道 / 经销商</option><option value="PROJECT">EPC / 项目型客户</option></select></label><small>用于客户分类、筛选和后续业务流程。</small></div>
      {TOP500_V46_MODULES.map((module) => <section className="company-profile-module top500-v46-module" key={module.title}>
        <div className="company-profile-module-head"><h4>{module.title}</h4><span>{module.headers.length} 项</span></div>
        <div className="company-profile-field-grid top500-v46-field-grid">{module.headers.map((header) => <div className="company-profile-field top500-v46-field" key={header} data-top500-create-field={header}><label htmlFor={`new-top500-${header}`}>{header}</label>{header === '销售状态' || header === '当前项目阶段' ? <select id={`new-top500-${header}`} aria-label={header} value={draft[header]} onChange={(event) => update(header, event.target.value)}>{FOLLOW_UP_STATUS_OPTIONS.map(([key, label]) => <option key={key} value={label}>{label}</option>)}</select> : TOP500_V46_LONG_TEXT_FIELDS.has(header) ? <textarea id={`new-top500-${header}`} aria-label={header} value={draft[header]} onChange={(event) => update(header, event.target.value)} /> : <input id={`new-top500-${header}`} aria-label={header} value={draft[header]} onChange={(event) => update(header, event.target.value)} />}</div>)}</div>
      </section>)}
    </div>
    <div className="top500-v46-editor-footer"><span>公司名称必填；其他资料可后续继续补充。</span><div><Button title="取消" size="small" variant="secondary" type="button" onClick={onCancel} /><Button title={saving ? '创建中' : '创建客户公司'} size="small" type="submit" disabled={saving || !draft['公司名称'].trim()} /></div></div>
  </form>;
}
