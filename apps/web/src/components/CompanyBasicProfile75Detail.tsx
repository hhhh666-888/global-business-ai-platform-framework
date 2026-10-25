import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CanonicalAccount, CanonicalContact, CanonicalOpportunity } from '../lib/crmBusinessClient';
import type { CustomerIntelligenceProfile } from '../lib/crmCustomerIntelligenceClient';
import {
  DEVELOPMENT_STAGE_LABELS,
  DEVELOPMENT_STAGE_ORDER,
  normalizeDevelopmentStage,
  type DevelopmentStage,
} from '../lib/crmDevelopmentStage';
import {
  PROTECTED_OPERATIONAL_RESEARCH_HEADERS,
  type EcuadorTop500Header,
} from '../lib/crmResearchIntake';
import {
  assertTop500V46Contract,
  TOP500_V46_MODULES,
  TOP500_V46_MODULE_HEADERS,
  TOP500_V46_URL_FIELDS,
} from '../lib/crmTop500V46Contract';
import {
  listCompanyResearchInsights,
  type CompanyResearchInsight,
  type ResearchInsightEvidence,
  type ResearchInsightTargetRole,
} from '../lib/crmCompanyResearchInsightsClient';
import './company-basic-profile-75.css';

export type CompanyProfile75Record = CanonicalAccount & Partial<CustomerIntelligenceProfile>;

type Props = {
  company: CompanyProfile75Record;
  contacts: CanonicalContact[];
  opportunities: CanonicalOpportunity[];
  children?: ReactNode;
};

export const COMPANY_PROFILE_75_MODULES = TOP500_V46_MODULES;

const PRIORITY_LABELS: Record<string, string> = { HIGH: '高', MEDIUM: '中', LOW: '低' };

function text(value: unknown, fallback = '待补充') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}
function numberText(value: string | number | null | undefined, suffix = '') {
  if (value === null || value === undefined || value === '') return '待补充';
  if (typeof value === 'string') return `${value}${suffix}`;
  return `${value.toLocaleString('zh-CN', { maximumFractionDigits: 1 })}${suffix}`;
}
function moneyText(value: number | null | undefined, currency = 'USD') {
  if (value === null || value === undefined) return '待补充';
  return `${currency} ${value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
}
function joinKnown(values: Array<string | number | null | undefined>, separator = ' · ') {
  const items = values.map((value) => value === null || value === undefined ? '' : String(value).trim()).filter(Boolean);
  return items.length ? items.join(separator) : '待补充';
}
function opportunityStage(opportunity: CanonicalOpportunity | null): DevelopmentStage {
  if (!opportunity) return 'NEW';
  return normalizeDevelopmentStage(opportunity.tradeStage ?? opportunity.pipelineStage ?? 'NEW');
}
function currentOpportunity(opportunities: CanonicalOpportunity[]) {
  return [...opportunities].sort((a, b) => {
    const aStage = opportunityStage(a);
    const bStage = opportunityStage(b);
    return (DEVELOPMENT_STAGE_ORDER[bStage] ?? -1) - (DEVELOPMENT_STAGE_ORDER[aStage] ?? -1);
  })[0] ?? null;
}
function companyStage(company: CompanyProfile75Record, opportunities: CanonicalOpportunity[]) {
  return company.developmentStage ? normalizeDevelopmentStage(company.developmentStage) : opportunityStage(currentOpportunity(opportunities));
}
function role(insight: CompanyResearchInsight | null, key: string) {
  return insight?.targetRoles.find((item) => item.roleKey === key) ?? null;
}
function resolvedContact(roleRow: ResearchInsightTargetRole | null, contacts: CanonicalContact[]) {
  if (!roleRow) return null;
  if (roleRow.resolvedContactBusinessId) return contacts.find((contact) => contact.businessId === roleRow.resolvedContactBusinessId) ?? null;
  if (roleRow.candidateName) return contacts.find((contact) => contact.personName.trim().toLowerCase() === roleRow.candidateName?.trim().toLowerCase()) ?? null;
  return null;
}
function rolePerson(roleRow: ResearchInsightTargetRole | null, contacts: CanonicalContact[]) {
  return roleRow?.candidateName || resolvedContact(roleRow, contacts)?.personName || null;
}
function roleContact(roleRow: ResearchInsightTargetRole | null, contacts: CanonicalContact[]) {
  const contact = resolvedContact(roleRow, contacts);
  return roleRow?.candidateContactText || joinKnown([contact?.email, contact?.phone], ' / ').replace(/^待补充$/, '') || null;
}
function evidenceValue(evidence: ResearchInsightEvidence[], key: keyof ResearchInsightEvidence) {
  for (const row of evidence) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}
function normalizeOverride(value: string | null | undefined) {
  return value === null || value === undefined || value === '' ? '待补充' : value;
}
function isKnownValue(value: string | null | undefined) {
  const normalized = value?.trim() ?? '';
  return Boolean(normalized && normalized !== '待补充');
}
function normalizeExternalUrl(value: string) {
  const trimmed = value.trim();
  if (!isKnownValue(trimmed)) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Customer detail has two authorities:
 * - protected operational-sales fields stay under live business workflow/user control;
 * - for every other field, the newest mapped company-import authority wins whenever
 *   that import actually supplied the field. A stale manual override must never turn
 *   a successfully imported value back into "待补充".
 *
 * The current Ecuador v46 module layout is only today's profile presentation. The
 * import center itself is not bound to this field count or country.
 */
export function buildCompanyProfile75Values(
  company: CompanyProfile75Record,
  contacts: CanonicalContact[],
  opportunities: CanonicalOpportunity[],
  insight: CompanyResearchInsight | null,
): Record<EcuadorTop500Header, string> {
  assertTop500V46Contract();
  const current = currentOpportunity(opportunities);
  const stage = companyStage(company, opportunities);
  const stageLabel = DEVELOPMENT_STAGE_LABELS[stage];
  const site = insight?.primarySite ?? null;
  const intelligence = insight?.researchIntelligence ?? null;
  const salesSignal = insight?.salesSignal ?? null;
  const energyDiscovery = insight?.energyDiscovery ?? null;
  const evidence = insight?.evidence ?? (insight?.latestEvidence ? [insight.latestEvidence] : []);
  const legal = role(insight, 'LEGAL_REP');
  const businessDecision = role(insight, 'BUSINESS_DECISION');
  const operations = role(insight, 'PLANT_OPERATIONS');
  const energy = role(insight, 'ENERGY_MAINTENANCE');
  const procurement = role(insight, 'PROCUREMENT');
  const recommended = role(insight, 'RECOMMENDED');

  const values: Record<EcuadorTop500Header, string> = {
    '开发排名': numberText(company.researchRank),
    'GBAP价值评分': numberText(company.strategicValueScore),
    '开发优先级': text(intelligence?.researchPriority || (company.priority ? PRIORITY_LABELS[company.priority] : null)),
    '销售状态': stageLabel,
    '当前项目阶段': stageLabel,
    '销售负责人': text(company.accountOwnerUserId),
    '首次联系日期': '待补充',
    '最后联系日期': '待补充',
    '下次跟进日期': '待补充',
    '客户反馈/关键异议': '待补充',
    '数据核验等级': text(company.verificationGrade),
    '公司名称': text(company.displayName),
    '商业名称': text(company.commercialName),
    RUC: text(company.registrationId),
    '私营企业核验': text(evidenceValue(evidence, 'ownershipVerification')),
    '官网': text(company.website),
    LinkedIn: text(company.linkedinUrl),
    '行业大类': text(company.industry),
    '行业细分': text(intelligence?.industrySegment),
    '主营产品/服务': text(intelligence?.productsServices),
    '为什么值得开发': text(intelligence?.researchRationale),
    '省/州': text(site?.province || company.addressState),
    '城市': text(site?.city || company.addressCity),
    '主要工厂/运营地址': text(site?.address || joinKnown([company.addressCountry, company.addressState, company.addressCity, company.addressStreet1])),
    'Google Maps核验链接': text(site?.googleMapsUrl),
    '公司电话': text(company.primaryPhone),
    '公司邮箱': text(company.primaryEmail),
    '公司WhatsApp': text(intelligence?.companyWhatsapp),
    '法人/代表人': text(rolePerson(legal, contacts)),
    '法人/代表人职务': text(legal?.roleTitleText || resolvedContact(legal, contacts)?.jobTitle),
    '首选业务决策人': text(rolePerson(businessDecision, contacts)),
    '首选业务决策人联系方式': text(roleContact(businessDecision, contacts)),
    '工厂/运营负责人': text(rolePerson(operations, contacts)),
    '工厂/运营负责人联系方式': text(roleContact(operations, contacts)),
    '工程/能源/维护负责人': text(rolePerson(energy, contacts)),
    '工程/能源联系方式': text(roleContact(energy, contacts)),
    '采购负责人': text(rolePerson(procurement, contacts)),
    '采购联系方式': text(roleContact(procurement, contacts)),
    '联系人核验状态': text(evidenceValue(evidence, 'contactVerification')),
    '推荐优先寻找职位': text(recommended?.recommendedSearchText || recommended?.roleTitleText),
    '2025营收USD': moneyText(company.annualRevenue, company.annualRevenueCurrency || 'USD'),
    '员工人数': company.employeeCount === null || company.employeeCount === undefined ? '待补充' : `${company.employeeCount.toLocaleString('zh-CN')} 人`,
    '规模等级': text(intelligence?.companyScale),
    '规模判断依据': text(evidenceValue(evidence, 'companyScaleBasis')),
    '工厂/主要场址数': numberText(site?.reportedSiteCount ?? (insight?.siteCount || company.factoryCount)),
    '生产/运营时长': text(site?.operatingProfile || (company.operatingHoursPerDay == null ? null : `${company.operatingHoursPerDay} 小时/日`)),
    '工艺/运营特征': text(site?.processOperatingCharacteristics),
    '主要耗电设备': text(site?.keyEquipmentText || company.keyEquipmentText),
    '潜在用电等级': text(site?.estimatedEnergyGrade),
    '潜在峰值负荷估算kW': numberText(site?.estimatedPeakDemandKw, ' kW'),
    '潜在月用电估算kWh': numberText(site?.estimatedMonthlyConsumptionKwh, ' kWh'),
    '能源估算置信度': text(evidenceValue(evidence, 'energyEstimateConfidence')),
    '用电判断依据': text(evidenceValue(evidence, 'energyEstimateBasis')),
    '已知实际用电/能源数据': text(energyDiscovery?.publicKnownEnergyData || (company.monthlyConsumptionKwh == null ? null : `已录入月用电 ${numberText(company.monthlyConsumptionKwh, ' kWh')}`)),
    '实际用电数据来源': text(evidenceValue(evidence, 'actualEnergyDataSource')),
    '供电/停电痛点': text(site?.energyPainPoints || company.energyPainPoints),
    '现有发电机/备用电源': text(site?.existingGeneratorBackup || (company.generatorCapacityKw == null ? null : numberText(company.generatorCapacityKw, ' kW'))),
    '现有光伏/储能': text(site?.existingSolarStorage || ((company.existingSolarKw != null || company.existingStorageKwh != null) ? joinKnown([company.existingSolarKw == null ? null : `光伏 ${numberText(company.existingSolarKw, ' kW')}`, company.existingStorageKwh == null ? null : `储能 ${numberText(company.existingStorageKwh, ' kWh')}`]) : null)),
    '屋顶/场地条件': text(site?.roofSiteConditions || ((company.roofAreaSqm != null || company.availableLandSqm != null) ? joinKnown([company.roofAreaSqm == null ? null : `屋顶 ${numberText(company.roofAreaSqm, ' ㎡')}`, company.availableLandSqm == null ? null : `空地 ${numberText(company.availableLandSqm, ' ㎡')}`]) : null)),
    '光伏机会': text(salesSignal?.solarOpportunity),
    '储能机会': text(salesSignal?.storageOpportunity),
    '发电机机会': text(salesSignal?.generatorOpportunity),
    '变压器/电气机会': text(salesSignal?.electricalOpportunity),
    '最佳匹配产品/方案': text(intelligence?.recommendedSolution),
    '建议首推切入点': text(intelligence?.recommendedEntryPoint),
    '预计项目规模': text(intelligence?.estimatedProjectScale),
    '推荐开发渠道': text(intelligence?.recommendedChannel),
    '首封开发主题': text(intelligence?.firstOutreachSubject),
    '首次联系建议': text(intelligence?.firstContactGuidance),
    '关键核验来源': text(evidenceValue(evidence, 'sourceTitle')),
    '关键核验结论': text(evidenceValue(evidence, 'statement')),
    '关键证据URL': text(evidenceValue(evidence, 'sourceUrl')),
    '数据完整度/深挖状态': text(intelligence?.researchCompleteness),
    '核验日期': text(evidenceValue(evidence, 'verifiedAt')),
    '下一步动作': text(intelligence?.researchNextAction || current?.nextStep),
  };

  const authoritative = insight?.authoritativeProfile?.fields ?? null;
  if (authoritative) {
    for (const header of TOP500_V46_MODULE_HEADERS) {
      if (PROTECTED_OPERATIONAL_RESEARCH_HEADERS.has(header)) continue;
      if (Object.prototype.hasOwnProperty.call(authoritative, header)) {
        values[header] = normalizeOverride(authoritative[header]);
      }
    }
  }

  const overrides = company.profile75Overrides ?? {};
  for (const header of TOP500_V46_MODULE_HEADERS) {
    if (header === '销售状态' || header === '当前项目阶段') continue;

    const isProtected = PROTECTED_OPERATIONAL_RESEARCH_HEADERS.has(header);
    const importedAuthorityOwnsField = !isProtected
      && authoritative !== null
      && Object.prototype.hasOwnProperty.call(authoritative, header);

    if (importedAuthorityOwnsField) continue;
    if (Object.prototype.hasOwnProperty.call(overrides, header)) values[header] = normalizeOverride(overrides[header]);
  }
  return values;
}

function renderValue(header: EcuadorTop500Header, value: string): ReactNode {
  if (!isKnownValue(value)) return null;
  if (!TOP500_V46_URL_FIELDS.has(header)) return value;
  const href = normalizeExternalUrl(value);
  if (!href) return value;
  return <a href={href} target="_blank" rel="noopener noreferrer">{value}</a>;
}

export function CompanyBasicProfile75Detail({ company, contacts, opportunities, children }: Props) {
  const [insight, setInsight] = useState<CompanyResearchInsight | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchUnavailable, setResearchUnavailable] = useState(false);

  useEffect(() => {
    if (!company.businessId) {
      setInsight(null);
      setResearchUnavailable(false);
      return;
    }
    let active = true;
    setResearchLoading(true);
    setResearchUnavailable(false);
    void listCompanyResearchInsights()
      .then((rows) => {
        if (!active) return;
        setInsight(rows.find((item) => item.accountBusinessId === company.businessId) ?? null);
      })
      .catch(() => {
        if (!active) return;
        setInsight(null);
        setResearchUnavailable(true);
      })
      .finally(() => { if (active) setResearchLoading(false); });
    return () => { active = false; };
  }, [company.businessId]);

  const values = useMemo(() => buildCompanyProfile75Values(company, contacts, opportunities, insight), [company, contacts, opportunities, insight]);
  const visibleModules = useMemo(() => TOP500_V46_MODULES
    .map((module) => ({ ...module, visibleHeaders: module.headers.filter((header) => isKnownValue(values[header])) }))
    .filter((module) => module.visibleHeaders.length > 0), [values]);
  const contract = assertTop500V46Contract();

  return <div className="company-drawer-body company-profile-75" data-testid="company-profile-75" data-field-count={contract.fieldCount} data-schema-complete={contract.ok ? 'true' : 'false'}>
    {researchLoading && <div className="company-profile-research-note">研究资料读取中，已保存的公司资料仍可查看。</div>}
    {researchUnavailable && <div className="company-profile-research-note">研究资料暂时无法读取；已保存的公司基础资料不受影响。</div>}
    {visibleModules.map((module) => <section className="company-profile-module top500-v46-module" key={module.title}>
      <div className="company-profile-module-head"><h4>{module.title}</h4><span>{module.visibleHeaders.length} 项已录入</span></div>
      <div className="company-profile-field-grid top500-v46-field-grid" data-top500-module={module.title}>
        {module.visibleHeaders.map((header) => <div className="company-profile-field top500-v46-field" key={header} data-top500-field={header}>
          <span>{header}</span>
          <strong>{renderValue(header, values[header])}</strong>
        </div>)}
      </div>
    </section>)}
    {children}
  </div>;
}
