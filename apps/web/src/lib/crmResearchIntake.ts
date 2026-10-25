import type { AccountProfilePatch } from './crmLifecycleClient';

export const ECUADOR_TOP500_V46_SCHEMA = 'EC_TOP500_V46' as const;
export const ECUADOR_TOP500_V46_SOURCE = 'EC_TOP500_V46_20260915' as const;

export const ECUADOR_TOP500_V46_HEADERS = [
  '开发排名', 'GBAP价值评分', '开发优先级', '销售状态', '当前项目阶段', '销售负责人',
  '首次联系日期', '最后联系日期', '下次跟进日期', '客户反馈/关键异议', '数据核验等级', '公司名称',
  '商业名称', 'RUC', '私营企业核验', '官网', 'LinkedIn', '行业大类', '行业细分', '主营产品/服务',
  '为什么值得开发', '省/州', '城市', '主要工厂/运营地址', 'Google Maps核验链接', '公司电话',
  '公司邮箱', '公司WhatsApp', '法人/代表人', '法人/代表人职务', '首选业务决策人',
  '首选业务决策人联系方式', '工厂/运营负责人', '工厂/运营负责人联系方式', '工程/能源/维护负责人',
  '工程/能源联系方式', '采购负责人', '采购联系方式', '联系人核验状态', '推荐优先寻找职位',
  '2025营收USD', '员工人数', '规模等级', '规模判断依据', '工厂/主要场址数', '生产/运营时长',
  '工艺/运营特征', '主要耗电设备', '潜在用电等级', '潜在峰值负荷估算kW', '潜在月用电估算kWh',
  '能源估算置信度', '用电判断依据', '已知实际用电/能源数据', '实际用电数据来源', '供电/停电痛点',
  '现有发电机/备用电源', '现有光伏/储能', '屋顶/场地条件', '光伏机会', '储能机会', '发电机机会',
  '变压器/电气机会', '最佳匹配产品/方案', '建议首推切入点', '预计项目规模', '推荐开发渠道',
  '首封开发主题', '首次联系建议', '关键核验来源', '关键核验结论', '关键证据URL',
  '数据完整度/深挖状态', '核验日期', '下一步动作',
] as const;

export type EcuadorTop500Header = typeof ECUADOR_TOP500_V46_HEADERS[number];
export type ResearchRow = Partial<Record<EcuadorTop500Header, string>> & Record<string, string | undefined>;

export type ResearchDestinationObject =
  | 'COMPANY'
  | 'SITE'
  | 'CONTACT'
  | 'TARGET_ROLE'
  | 'EVIDENCE'
  | 'SALES_SIGNAL'
  | 'CUSTOMER_INTELLIGENCE'
  | 'ENERGY_DISCOVERY'
  | 'OPERATIONAL_SALES';

export type ResearchMergePolicy =
  | 'RESEARCH_FILL'
  | 'EVIDENCE_APPEND'
  | 'ESTIMATE_ONLY'
  | 'PROTECTED_OPERATIONAL'
  | 'DEFER_UNTIL_OBJECT_EXISTS';

export type ResearchFieldMapping = {
  sourceHeader: EcuadorTop500Header;
  destinationObject: ResearchDestinationObject;
  destinationField: string;
  mergePolicy: ResearchMergePolicy;
  valueType?: 'PUBLIC_REPORTED' | 'ESTIMATED' | 'INFERRED';
};

const mapping = (
  sourceHeader: EcuadorTop500Header,
  destinationObject: ResearchDestinationObject,
  destinationField: string,
  mergePolicy: ResearchMergePolicy,
  valueType?: ResearchFieldMapping['valueType'],
): ResearchFieldMapping => ({ sourceHeader, destinationObject, destinationField, mergePolicy, ...(valueType ? { valueType } : {}) });

export const ECUADOR_TOP500_V46_FIELD_MAPPING: readonly ResearchFieldMapping[] = [
  mapping('开发排名', 'COMPANY', 'researchRank', 'RESEARCH_FILL'),
  mapping('GBAP价值评分', 'COMPANY', 'strategicValueScore', 'RESEARCH_FILL'),
  mapping('开发优先级', 'CUSTOMER_INTELLIGENCE', 'researchPriority', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('销售状态', 'OPERATIONAL_SALES', 'relationshipStatus', 'PROTECTED_OPERATIONAL'),
  mapping('当前项目阶段', 'OPERATIONAL_SALES', 'salesStage', 'PROTECTED_OPERATIONAL'),
  mapping('销售负责人', 'OPERATIONAL_SALES', 'accountOwnerUserId', 'PROTECTED_OPERATIONAL'),
  mapping('首次联系日期', 'OPERATIONAL_SALES', 'firstContactAt', 'PROTECTED_OPERATIONAL'),
  mapping('最后联系日期', 'OPERATIONAL_SALES', 'lastContactAt', 'PROTECTED_OPERATIONAL'),
  mapping('下次跟进日期', 'OPERATIONAL_SALES', 'nextFollowUpAt', 'PROTECTED_OPERATIONAL'),
  mapping('客户反馈/关键异议', 'OPERATIONAL_SALES', 'customerFeedback', 'PROTECTED_OPERATIONAL'),
  mapping('数据核验等级', 'COMPANY', 'verificationGrade', 'RESEARCH_FILL'),
  mapping('公司名称', 'COMPANY', 'displayName', 'RESEARCH_FILL'),
  mapping('商业名称', 'COMPANY', 'commercialName', 'RESEARCH_FILL'),
  mapping('RUC', 'COMPANY', 'registrationId', 'RESEARCH_FILL'),
  mapping('私营企业核验', 'EVIDENCE', 'ownershipVerification', 'EVIDENCE_APPEND', 'PUBLIC_REPORTED'),
  mapping('官网', 'COMPANY', 'website', 'RESEARCH_FILL'),
  mapping('LinkedIn', 'COMPANY', 'linkedinUrl', 'RESEARCH_FILL'),
  mapping('行业大类', 'COMPANY', 'industry', 'RESEARCH_FILL'),
  mapping('行业细分', 'CUSTOMER_INTELLIGENCE', 'industrySegment', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('主营产品/服务', 'CUSTOMER_INTELLIGENCE', 'productsServices', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('为什么值得开发', 'CUSTOMER_INTELLIGENCE', 'researchRationale', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('省/州', 'SITE', 'province', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('城市', 'SITE', 'city', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('主要工厂/运营地址', 'SITE', 'address', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('Google Maps核验链接', 'SITE', 'googleMapsUrl', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('公司电话', 'COMPANY', 'primaryPhone', 'RESEARCH_FILL'),
  mapping('公司邮箱', 'COMPANY', 'primaryEmail', 'RESEARCH_FILL'),
  mapping('公司WhatsApp', 'CUSTOMER_INTELLIGENCE', 'companyWhatsapp', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('法人/代表人', 'CONTACT', 'legalRepresentative', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('法人/代表人职务', 'CONTACT', 'jobTitle', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('首选业务决策人', 'CONTACT', 'preferredBusinessDecisionMaker', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('首选业务决策人联系方式', 'CONTACT', 'preferredBusinessDecisionMakerContact', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('工厂/运营负责人', 'CONTACT', 'plantOperationsDecisionMaker', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('工厂/运营负责人联系方式', 'CONTACT', 'plantOperationsDecisionMakerContact', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('工程/能源/维护负责人', 'CONTACT', 'engineeringEnergyMaintenanceDecisionMaker', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('工程/能源联系方式', 'CONTACT', 'engineeringEnergyDecisionMakerContact', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('采购负责人', 'CONTACT', 'procurementDecisionMaker', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('采购联系方式', 'CONTACT', 'procurementDecisionMakerContact', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('联系人核验状态', 'EVIDENCE', 'contactVerification', 'EVIDENCE_APPEND', 'PUBLIC_REPORTED'),
  mapping('推荐优先寻找职位', 'TARGET_ROLE', 'recommendedTargetRole', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('2025营收USD', 'COMPANY', 'annualRevenue', 'RESEARCH_FILL', 'PUBLIC_REPORTED'),
  mapping('员工人数', 'COMPANY', 'employeeCount', 'RESEARCH_FILL', 'PUBLIC_REPORTED'),
  mapping('规模等级', 'CUSTOMER_INTELLIGENCE', 'companyScale', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('规模判断依据', 'EVIDENCE', 'companyScaleBasis', 'EVIDENCE_APPEND', 'INFERRED'),
  mapping('工厂/主要场址数', 'SITE', 'siteCountResearch', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('生产/运营时长', 'SITE', 'operatingProfile', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('工艺/运营特征', 'SITE', 'processOperatingCharacteristics', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('主要耗电设备', 'SITE', 'keyEquipment', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('潜在用电等级', 'SITE', 'estimatedEnergyGrade', 'ESTIMATE_ONLY', 'ESTIMATED'),
  mapping('潜在峰值负荷估算kW', 'SITE', 'peakDemandKw', 'ESTIMATE_ONLY', 'ESTIMATED'),
  mapping('潜在月用电估算kWh', 'SITE', 'monthlyConsumptionKwh', 'ESTIMATE_ONLY', 'ESTIMATED'),
  mapping('能源估算置信度', 'EVIDENCE', 'energyEstimateConfidence', 'EVIDENCE_APPEND', 'ESTIMATED'),
  mapping('用电判断依据', 'EVIDENCE', 'energyEstimateBasis', 'EVIDENCE_APPEND', 'INFERRED'),
  mapping('已知实际用电/能源数据', 'ENERGY_DISCOVERY', 'publicKnownEnergyData', 'DEFER_UNTIL_OBJECT_EXISTS', 'PUBLIC_REPORTED'),
  mapping('实际用电数据来源', 'EVIDENCE', 'actualEnergyDataSource', 'EVIDENCE_APPEND', 'PUBLIC_REPORTED'),
  mapping('供电/停电痛点', 'SITE', 'energyPainPoints', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('现有发电机/备用电源', 'SITE', 'existingGeneratorBackup', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('现有光伏/储能', 'SITE', 'existingSolarStorage', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('屋顶/场地条件', 'SITE', 'roofSiteConditions', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('光伏机会', 'SALES_SIGNAL', 'solarOpportunity', 'DEFER_UNTIL_OBJECT_EXISTS', 'INFERRED'),
  mapping('储能机会', 'SALES_SIGNAL', 'storageOpportunity', 'DEFER_UNTIL_OBJECT_EXISTS', 'INFERRED'),
  mapping('发电机机会', 'SALES_SIGNAL', 'generatorOpportunity', 'DEFER_UNTIL_OBJECT_EXISTS', 'INFERRED'),
  mapping('变压器/电气机会', 'SALES_SIGNAL', 'electricalOpportunity', 'DEFER_UNTIL_OBJECT_EXISTS', 'INFERRED'),
  mapping('最佳匹配产品/方案', 'CUSTOMER_INTELLIGENCE', 'recommendedSolution', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('建议首推切入点', 'CUSTOMER_INTELLIGENCE', 'recommendedEntryPoint', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('预计项目规模', 'CUSTOMER_INTELLIGENCE', 'estimatedProjectScale', 'DEFER_UNTIL_OBJECT_EXISTS', 'ESTIMATED'),
  mapping('推荐开发渠道', 'CUSTOMER_INTELLIGENCE', 'recommendedChannel', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('首封开发主题', 'CUSTOMER_INTELLIGENCE', 'firstOutreachSubject', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('首次联系建议', 'CUSTOMER_INTELLIGENCE', 'firstContactGuidance', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('关键核验来源', 'EVIDENCE', 'sourceTitle', 'EVIDENCE_APPEND', 'PUBLIC_REPORTED'),
  mapping('关键核验结论', 'EVIDENCE', 'statement', 'EVIDENCE_APPEND', 'PUBLIC_REPORTED'),
  mapping('关键证据URL', 'EVIDENCE', 'sourceUrl', 'EVIDENCE_APPEND', 'PUBLIC_REPORTED'),
  mapping('数据完整度/深挖状态', 'CUSTOMER_INTELLIGENCE', 'researchCompleteness', 'DEFER_UNTIL_OBJECT_EXISTS'),
  mapping('核验日期', 'EVIDENCE', 'verifiedAt', 'EVIDENCE_APPEND', 'PUBLIC_REPORTED'),
  mapping('下一步动作', 'CUSTOMER_INTELLIGENCE', 'researchNextAction', 'DEFER_UNTIL_OBJECT_EXISTS'),
] as const;

export const PROTECTED_OPERATIONAL_RESEARCH_HEADERS = new Set<EcuadorTop500Header>([
  '销售状态', '当前项目阶段', '销售负责人', '首次联系日期', '最后联系日期', '下次跟进日期', '客户反馈/关键异议',
]);

export type ResearchSchemaRecognition = {
  recognized: boolean;
  schemaVersion: typeof ECUADOR_TOP500_V46_SCHEMA | null;
  missingHeaders: EcuadorTop500Header[];
  extraHeaders: string[];
  duplicateHeaders: string[];
  orderMatches: boolean;
};

export type ResearchValidationIssue = {
  rowNumber: number;
  field: EcuadorTop500Header | 'ROW';
  severity: 'ERROR' | 'WARNING';
  code: string;
  message: string;
};

function normalizedHeader(value: string) {
  return value.replace(/^\uFEFF/, '').trim();
}

function text(row: ResearchRow, header: EcuadorTop500Header) {
  const value = row[header];
  return typeof value === 'string' ? value.trim() : '';
}

function parseNumber(value: string) {
  const normalized = value.replace(/[$,\s]/g, '').replace(/USD/gi, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: string) {
  const parsed = parseNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

export function normalizeEcuadorRuc(value: string) {
  const normalized = value.trim().replace(/\.0$/, '').replace(/[^0-9]/g, '');
  return normalized;
}

/**
 * TOP500 v46 is a positional, frozen 75-column contract. We intentionally fail
 * closed: no missing, extra, duplicated or reordered header is accepted. This
 * prevents a spreadsheet from appearing valid while one column is silently
 * shifted into another business field.
 */
export function recognizeResearchSchema(headers: readonly string[]): ResearchSchemaRecognition {
  const normalized = headers.map(normalizedHeader);
  const normalizedSet = new Set(normalized);
  const expectedSet = new Set<string>(ECUADOR_TOP500_V46_HEADERS);
  const missingHeaders = ECUADOR_TOP500_V46_HEADERS.filter((header) => !normalizedSet.has(header));
  const extraHeaders = normalized.filter((header) => !expectedSet.has(header));
  const counts = new Map<string, number>();
  normalized.forEach((header) => counts.set(header, (counts.get(header) ?? 0) + 1));
  const duplicateHeaders = [...counts.entries()].filter(([, count]) => count > 1).map(([header]) => header);
  const orderMatches = normalized.length === ECUADOR_TOP500_V46_HEADERS.length
    && normalized.every((header, index) => header === ECUADOR_TOP500_V46_HEADERS[index]);
  const recognized = normalized.length === ECUADOR_TOP500_V46_HEADERS.length
    && missingHeaders.length === 0
    && extraHeaders.length === 0
    && duplicateHeaders.length === 0
    && orderMatches;
  return {
    recognized,
    schemaVersion: recognized ? ECUADOR_TOP500_V46_SCHEMA : null,
    missingHeaders: [...missingHeaders],
    extraHeaders,
    duplicateHeaders,
    orderMatches,
  };
}

export function validateEcuadorTop500Rows(rows: readonly ResearchRow[]) {
  const issues: ResearchValidationIssue[] = [];
  const seenRuc = new Map<string, number>();
  const seenRank = new Map<number, number>();
  const seenCompany = new Map<string, number>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const company = text(row, '公司名称');
    const ruc = normalizeEcuadorRuc(text(row, 'RUC'));
    const rank = parseInteger(text(row, '开发排名'));
    const score = parseNumber(text(row, 'GBAP价值评分'));

    if (!company) issues.push({ rowNumber, field: '公司名称', severity: 'ERROR', code: 'COMPANY_REQUIRED', message: '公司名称不能为空。' });
    if (!/^\d{13}$/.test(ruc)) issues.push({ rowNumber, field: 'RUC', severity: 'ERROR', code: 'RUC_INVALID', message: '厄瓜多尔 RUC 必须是 13 位数字。' });
    if (rank === null || rank < 1) issues.push({ rowNumber, field: '开发排名', severity: 'ERROR', code: 'RANK_INVALID', message: '开发排名必须是正整数。' });
    if (score === null || score < 0 || score > 100) issues.push({ rowNumber, field: 'GBAP价值评分', severity: 'ERROR', code: 'SCORE_INVALID', message: 'GBAP价值评分必须在 0–100 之间。' });

    const companyKey = company.toLocaleLowerCase();
    if (companyKey) {
      const first = seenCompany.get(companyKey);
      if (first) issues.push({ rowNumber, field: '公司名称', severity: 'WARNING', code: 'COMPANY_DUPLICATE', message: `公司名称与第 ${first} 行重复。` });
      else seenCompany.set(companyKey, rowNumber);
    }
    if (ruc) {
      const first = seenRuc.get(ruc);
      if (first) issues.push({ rowNumber, field: 'RUC', severity: 'ERROR', code: 'RUC_DUPLICATE', message: `RUC 与第 ${first} 行重复，不能生成第二个 Company。` });
      else seenRuc.set(ruc, rowNumber);
    }
    if (rank !== null) {
      const first = seenRank.get(rank);
      if (first) issues.push({ rowNumber, field: '开发排名', severity: 'ERROR', code: 'RANK_DUPLICATE', message: `开发排名与第 ${first} 行重复。` });
      else seenRank.set(rank, rowNumber);
    }
  });

  return {
    valid: issues.every((issue) => issue.severity !== 'ERROR'),
    rowCount: rows.length,
    issues,
  };
}

export function buildResearchCompanyPatch(row: ResearchRow): AccountProfilePatch & { displayName: string } {
  const displayName = text(row, '公司名称');
  const ruc = normalizeEcuadorRuc(text(row, 'RUC'));
  const score = parseNumber(text(row, 'GBAP价值评分'));
  const rank = parseInteger(text(row, '开发排名'));
  const revenue = parseNumber(text(row, '2025营收USD'));
  const employees = parseInteger(text(row, '员工人数'));

  if (!displayName) throw new Error('research_company_name_required');
  if (!/^\d{13}$/.test(ruc)) throw new Error('research_ruc_invalid');

  return {
    displayName,
    registrationCountry: 'EC',
    registrationType: 'RUC',
    registrationId: ruc,
    commercialName: text(row, '商业名称') || null,
    ownershipType: text(row, '私营企业核验') ? 'PRIVATE' : null,
    verificationGrade: text(row, '数据核验等级') || null,
    strategicValueScore: score,
    researchRank: rank,
    website: text(row, '官网') || null,
    linkedinUrl: text(row, 'LinkedIn') || null,
    industry: text(row, '行业大类') || null,
    primaryPhone: text(row, '公司电话') || null,
    primaryEmail: text(row, '公司邮箱') || null,
    annualRevenue: revenue,
    annualRevenueCurrency: revenue === null ? null : 'USD',
    employeeCount: employees,
    source: ECUADOR_TOP500_V46_SOURCE,
  };
}

export function protectedOperationalHeadersPresent(row: ResearchRow) {
  return [...PROTECTED_OPERATIONAL_RESEARCH_HEADERS].filter((header) => text(row, header) !== '');
}
