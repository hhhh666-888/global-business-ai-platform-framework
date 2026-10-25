import { api } from './gbapClient';
import {
  ECUADOR_TOP500_V46_SCHEMA,
  type EcuadorTop500Header,
} from './crmResearchIntake';

export type ResearchSafeCompanySnapshot = {
  displayName: string;
  commercialName: string | null;
  registrationCountry: string;
  registrationType: string;
  registrationId: string;
  ownershipType: string | null;
  verificationGrade: string | null;
  strategicValueScore: number | null;
  researchRank: number | null;
  website: string | null;
  linkedinUrl: string | null;
  industry: string | null;
  primaryPhone: string | null;
  primaryEmail: string | null;
  annualRevenue: number | null;
  annualRevenueCurrency: string | null;
  employeeCount: number | null;
  source: string | null;
};

export type ResearchSafeSiteSnapshot = {
  province: string | null;
  city: string | null;
  address: string | null;
  googleMapsUrl: string | null;
  reportedSiteCount: string | number | null;
  operatingProfile: string | null;
  processOperatingCharacteristics: string | null;
  keyEquipmentText: string | null;
  estimatedEnergyGrade: string | null;
  estimatedPeakDemandKw: string | number | null;
  estimatedMonthlyConsumptionKwh: string | number | null;
  energyPainPoints: string | null;
  existingGeneratorBackup: string | null;
  existingSolarStorage: string | null;
  roofSiteConditions: string | null;
  source: string | null;
};

export type ResearchContactRoleKey =
  | 'LEGAL_REP'
  | 'BUSINESS_DECISION'
  | 'PLANT_OPERATIONS'
  | 'ENERGY_MAINTENANCE'
  | 'PROCUREMENT';

export type ResearchContactCandidateSnapshot = {
  roleKey: ResearchContactRoleKey;
  personText: string | null;
  titleText: string | null;
  contactText: string | null;
  verificationText: string | null;
  source: string | null;
};

export type ResearchSafeContactSnapshot = {
  candidates: ResearchContactCandidateSnapshot[];
  recommendedSearchText: string | null;
  verificationText: string | null;
  source: string | null;
};

export type ResearchEnrichmentSnapshot = {
  evidence: {
    ownershipVerification: string | null;
    contactVerification: string | null;
    companyScaleBasis: string | null;
    energyEstimateConfidence: string | null;
    energyEstimateBasis: string | null;
    actualEnergyDataSource: string | null;
    sourceTitle: string | null;
    statement: string | null;
    sourceUrl: string | null;
    verifiedAt: string | null;
  };
  intelligence: {
    researchPriority: string | null;
    industrySegment: string | null;
    productsServices: string | null;
    researchRationale: string | null;
    companyWhatsapp: string | null;
    companyScale: string | null;
    recommendedSolution: string | null;
    recommendedEntryPoint: string | null;
    estimatedProjectScale: string | null;
    recommendedChannel: string | null;
    firstOutreachSubject: string | null;
    firstContactGuidance: string | null;
    researchCompleteness: string | null;
    researchNextAction: string | null;
  };
  salesSignal: {
    solarOpportunity: string | null;
    storageOpportunity: string | null;
    generatorOpportunity: string | null;
    electricalOpportunity: string | null;
  };
  energyDiscovery: {
    publicKnownEnergyData: string | null;
  };
  source: string | null;
};

export type ResearchAuthoritativeFields = Partial<Record<EcuadorTop500Header, string>>;

export type ResearchDryRunRow = {
  rowNumber: number;
  displayName: string;
  registrationCountry: string;
  registrationType: string;
  registrationId: string;
  researchRank: number | null;
  companySnapshot?: ResearchSafeCompanySnapshot;
  siteSnapshot?: ResearchSafeSiteSnapshot;
  contactSnapshot?: ResearchSafeContactSnapshot;
  enrichmentSnapshot?: ResearchEnrichmentSnapshot;
  authoritativeFields?: ResearchAuthoritativeFields;
};

export type ResearchDryRunItem = ResearchDryRunRow & {
  matchBusinessId: string | null;
  proposedAction: 'CREATE' | 'UPDATE' | 'CONFLICT';
  reason: string;
};

export type ResearchExecutionSummary = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  protectedOperationalWriteCount: number;
  completedAt: string | null;
};

export type ResearchAuthoritativeExecutionSummary = {
  updated: number;
  unchanged: number;
  failed: number;
  changedFields: number;
  clearedOverrides: number;
  authoritativeFieldCount: number;
  protectedOperationalWriteCount: number;
  completedAt: string | null;
};

export type ResearchSiteExecutionSummary = {
  created: number;
  updated: number;
  unchanged: number;
  skippedNoIdentity: number;
  failed: number;
  completedAt: string | null;
};

export type ResearchContactExecutionSummary = {
  contactsCreated: number;
  existingContactsLinked: number;
  targetRolesOnly: number;
  conflicts: number;
  failed: number;
  completedAt: string | null;
};

export type ResearchEnrichmentExecutionSummary = {
  evidenceAppended: number;
  researchIntelligenceUpdated: number;
  salesSignalsUpdated: number;
  energyDiscoveryUpdated: number;
  unchanged: number;
  failed: number;
  completedAt: string | null;
};

export type ResearchImportBatchSummary = {
  create: number;
  update: number;
  conflict: number;
  protectedOperationalWriteCount: number;
  execution?: ResearchExecutionSummary;
  authoritativeSnapshotCount?: number;
  authoritativeFieldCount?: number;
  authoritativeExecution?: ResearchAuthoritativeExecutionSummary;
  siteSnapshotCount?: number;
  siteIdentifiedCount?: number;
  siteExecution?: ResearchSiteExecutionSummary;
  contactSnapshotCount?: number;
  namedCandidateCount?: number;
  contactExecution?: ResearchContactExecutionSummary;
  enrichmentSnapshotCount?: number;
  evidenceSnapshotRows?: number;
  salesSignalSnapshotRows?: number;
  energyDiscoverySnapshotRows?: number;
  researchIntelligenceSnapshotRows?: number;
  enrichmentExecution?: ResearchEnrichmentExecutionSummary;
};

export type ResearchDryRunResult = {
  batchId: string;
  status: 'DRY_RUN_READY' | 'DRY_RUN_BLOCKED';
  summary: ResearchImportBatchSummary;
  items: ResearchDryRunItem[];
};

export type ResearchExecutionResult = {
  batchId: string;
  status: 'EXECUTION_CONTINUE' | 'EXECUTED';
  execution: ResearchExecutionSummary;
  summary?: ResearchImportBatchSummary;
  remaining: number;
  hasMore: boolean;
  idempotent: boolean;
  chunkSize?: number;
};

export type ResearchAuthoritativeExecutionResult = {
  batchId: string;
  status: 'AUTHORITATIVE_EXECUTION_CONTINUE' | 'AUTHORITATIVE_EXECUTED';
  authoritativeExecution: ResearchAuthoritativeExecutionSummary;
  remaining: number;
  hasMore: boolean;
  idempotent: boolean;
  chunkSize?: number;
};

export type ResearchSiteExecutionResult = {
  batchId: string;
  status: 'SITE_EXECUTION_CONTINUE' | 'SITE_EXECUTED';
  siteExecution: ResearchSiteExecutionSummary;
  remaining: number;
  hasMore: boolean;
  idempotent: boolean;
  chunkSize?: number;
};

export type ResearchContactExecutionResult = {
  batchId: string;
  status: 'CONTACT_EXECUTION_CONTINUE' | 'CONTACT_EXECUTED';
  contactExecution: ResearchContactExecutionSummary;
  remaining: number;
  hasMore: boolean;
  idempotent: boolean;
  chunkSize?: number;
};

export type ResearchEnrichmentExecutionResult = {
  batchId: string;
  status: 'ENRICHMENT_EXECUTION_CONTINUE' | 'ENRICHMENT_EXECUTED';
  enrichmentExecution: ResearchEnrichmentExecutionSummary;
  remaining: number;
  hasMore: boolean;
  idempotent: boolean;
  chunkSize?: number;
};

export type ResearchImportBatch = {
  id: string;
  schemaVersion: string;
  sourceName: string;
  fileName: string | null;
  sourceDigest: string | null;
  rowCount: number;
  status: string;
  actorSubject: string;
  actorUsername: string | null;
  createdAt: string;
  updatedAt: string;
  summary: ResearchImportBatchSummary;
};

function sourceText(value: unknown) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function contactCandidate(row: ResearchDryRunRow, roleKey: ResearchContactRoleKey) {
  return row.contactSnapshot?.candidates.find((item) => item.roleKey === roleKey) ?? null;
}

function deriveAuthoritativeFields(row: ResearchDryRunRow): ResearchAuthoritativeFields {
  if (row.authoritativeFields) return row.authoritativeFields;
  const company = row.companySnapshot;
  const site = row.siteSnapshot;
  const contact = row.contactSnapshot;
  const enrichment = row.enrichmentSnapshot;
  const evidence = enrichment?.evidence;
  const intelligence = enrichment?.intelligence;
  const sales = enrichment?.salesSignal;
  const energy = enrichment?.energyDiscovery;
  const legal = contactCandidate(row, 'LEGAL_REP');
  const business = contactCandidate(row, 'BUSINESS_DECISION');
  const operations = contactCandidate(row, 'PLANT_OPERATIONS');
  const maintenance = contactCandidate(row, 'ENERGY_MAINTENANCE');
  const procurement = contactCandidate(row, 'PROCUREMENT');
  const fields: ResearchAuthoritativeFields = {
    '开发排名': sourceText(company?.researchRank ?? row.researchRank),
    'GBAP价值评分': sourceText(company?.strategicValueScore),
    '开发优先级': sourceText(intelligence?.researchPriority),
    '数据核验等级': sourceText(company?.verificationGrade),
    '公司名称': sourceText(company?.displayName ?? row.displayName),
    '商业名称': sourceText(company?.commercialName),
    RUC: sourceText(company?.registrationId ?? row.registrationId),
    '私营企业核验': sourceText(evidence?.ownershipVerification),
    '官网': sourceText(company?.website),
    LinkedIn: sourceText(company?.linkedinUrl),
    '行业大类': sourceText(company?.industry),
    '行业细分': sourceText(intelligence?.industrySegment),
    '主营产品/服务': sourceText(intelligence?.productsServices),
    '为什么值得开发': sourceText(intelligence?.researchRationale),
    '省/州': sourceText(site?.province),
    '城市': sourceText(site?.city),
    '主要工厂/运营地址': sourceText(site?.address),
    'Google Maps核验链接': sourceText(site?.googleMapsUrl),
    '公司电话': sourceText(company?.primaryPhone),
    '公司邮箱': sourceText(company?.primaryEmail),
    '公司WhatsApp': sourceText(intelligence?.companyWhatsapp),
    '法人/代表人': sourceText(legal?.personText),
    '法人/代表人职务': sourceText(legal?.titleText),
    '首选业务决策人': sourceText(business?.personText),
    '首选业务决策人联系方式': sourceText(business?.contactText),
    '工厂/运营负责人': sourceText(operations?.personText),
    '工厂/运营负责人联系方式': sourceText(operations?.contactText),
    '工程/能源/维护负责人': sourceText(maintenance?.personText),
    '工程/能源联系方式': sourceText(maintenance?.contactText),
    '采购负责人': sourceText(procurement?.personText),
    '采购联系方式': sourceText(procurement?.contactText),
    '联系人核验状态': sourceText(contact?.verificationText ?? evidence?.contactVerification),
    '推荐优先寻找职位': sourceText(contact?.recommendedSearchText),
    '2025营收USD': sourceText(company?.annualRevenue),
    '员工人数': sourceText(company?.employeeCount),
    '规模等级': sourceText(intelligence?.companyScale),
    '规模判断依据': sourceText(evidence?.companyScaleBasis),
    '工厂/主要场址数': sourceText(site?.reportedSiteCount),
    '生产/运营时长': sourceText(site?.operatingProfile),
    '工艺/运营特征': sourceText(site?.processOperatingCharacteristics),
    '主要耗电设备': sourceText(site?.keyEquipmentText),
    '潜在用电等级': sourceText(site?.estimatedEnergyGrade),
    '潜在峰值负荷估算kW': sourceText(site?.estimatedPeakDemandKw),
    '潜在月用电估算kWh': sourceText(site?.estimatedMonthlyConsumptionKwh),
    '能源估算置信度': sourceText(evidence?.energyEstimateConfidence),
    '用电判断依据': sourceText(evidence?.energyEstimateBasis),
    '已知实际用电/能源数据': sourceText(energy?.publicKnownEnergyData),
    '实际用电数据来源': sourceText(evidence?.actualEnergyDataSource),
    '供电/停电痛点': sourceText(site?.energyPainPoints),
    '现有发电机/备用电源': sourceText(site?.existingGeneratorBackup),
    '现有光伏/储能': sourceText(site?.existingSolarStorage),
    '屋顶/场地条件': sourceText(site?.roofSiteConditions),
    '光伏机会': sourceText(sales?.solarOpportunity),
    '储能机会': sourceText(sales?.storageOpportunity),
    '发电机机会': sourceText(sales?.generatorOpportunity),
    '变压器/电气机会': sourceText(sales?.electricalOpportunity),
    '最佳匹配产品/方案': sourceText(intelligence?.recommendedSolution),
    '建议首推切入点': sourceText(intelligence?.recommendedEntryPoint),
    '预计项目规模': sourceText(intelligence?.estimatedProjectScale),
    '推荐开发渠道': sourceText(intelligence?.recommendedChannel),
    '首封开发主题': sourceText(intelligence?.firstOutreachSubject),
    '首次联系建议': sourceText(intelligence?.firstContactGuidance),
    '关键核验来源': sourceText(evidence?.sourceTitle),
    '关键核验结论': sourceText(evidence?.statement),
    '关键证据URL': sourceText(evidence?.sourceUrl),
    '数据完整度/深挖状态': sourceText(intelligence?.researchCompleteness),
    '核验日期': sourceText(evidence?.verifiedAt),
    '下一步动作': sourceText(intelligence?.researchNextAction),
  };
  return fields;
}

async function attachResearchSiteSnapshots(batchId: string, rows: ResearchDryRunRow[]) {
  return api<{ batchId: string; rowCount: number; identifiedCount: number }>(
    `/api/crm-native/research-intake/batches/${encodeURIComponent(batchId)}/site-snapshots`,
    { method: 'POST', body: JSON.stringify({ sites: rows.map((row) => ({ rowNumber: row.rowNumber, siteSnapshot: row.siteSnapshot ?? {} })) }) },
  );
}

async function attachResearchContactSnapshots(batchId: string, rows: ResearchDryRunRow[]) {
  return api<{ batchId: string; rowCount: number; namedCandidateCount: number }>(
    `/api/crm-native/research-intake/batches/${encodeURIComponent(batchId)}/contact-snapshots`,
    { method: 'POST', body: JSON.stringify({ contacts: rows.map((row) => ({ rowNumber: row.rowNumber, contactSnapshot: row.contactSnapshot ?? {} })) }) },
  );
}

async function attachResearchEnrichmentSnapshots(batchId: string, rows: ResearchDryRunRow[]) {
  return api<{ batchId: string; rowCount: number }>(
    `/api/crm-native/research-intake/batches/${encodeURIComponent(batchId)}/enrichment-snapshots`,
    { method: 'POST', body: JSON.stringify({ rows: rows.map((row) => ({ rowNumber: row.rowNumber, enrichmentSnapshot: row.enrichmentSnapshot ?? {} })) }) },
  );
}

async function attachResearchAuthoritativeSnapshots(batchId: string, rows: ResearchDryRunRow[]) {
  return api<{ batchId: string; rowCount: number; authoritativeFieldCount: number }>(
    `/api/crm-native/research-intake/batches/${encodeURIComponent(batchId)}/authoritative-snapshots`,
    {
      method: 'POST',
      body: JSON.stringify({
        rows: rows.map((row) => ({ rowNumber: row.rowNumber, fields: deriveAuthoritativeFields(row) })),
      }),
    },
  );
}

export async function createResearchDryRun(input: {
  sourceName: string;
  fileName: string;
  sourceDigest?: string | null;
  rows: ResearchDryRunRow[];
}) {
  const result = await api<ResearchDryRunResult>('/api/crm-native/research-intake/dry-run', {
    method: 'POST',
    body: JSON.stringify({ schemaVersion: ECUADOR_TOP500_V46_SCHEMA, sourceName: input.sourceName, fileName: input.fileName, sourceDigest: input.sourceDigest ?? null, rows: input.rows }),
  });
  await attachResearchSiteSnapshots(result.batchId, input.rows);
  await attachResearchContactSnapshots(result.batchId, input.rows);
  await attachResearchEnrichmentSnapshots(result.batchId, input.rows);
  await attachResearchAuthoritativeSnapshots(result.batchId, input.rows);
  return result;
}

async function executeResearchImportChunk(batchId: string) {
  return api<ResearchExecutionResult>(`/api/crm-native/research-intake/batches/${encodeURIComponent(batchId)}/execute`, { method: 'POST', body: JSON.stringify({ confirmation: 'EXECUTE_TOP500_RESEARCH_BATCH' }) });
}

async function executeResearchAuthoritativeChunk(batchId: string) {
  return api<ResearchAuthoritativeExecutionResult>(
    `/api/crm-native/research-intake/batches/${encodeURIComponent(batchId)}/execute-authoritative`,
    { method: 'POST', body: JSON.stringify({ confirmation: 'EXECUTE_TOP500_AUTHORITATIVE_PROFILE' }) },
  );
}

export async function executeResearchAuthoritativeBatch(batchId: string) {
  let result = await executeResearchAuthoritativeChunk(batchId); let guard = 0;
  while (result.hasMore && result.status === 'AUTHORITATIVE_EXECUTION_CONTINUE') {
    guard += 1;
    if (guard > 100) throw new Error('TOP500 CSV 权威字段自动分批次数异常，请刷新批次状态后重试。');
    result = await executeResearchAuthoritativeChunk(batchId);
  }
  return result;
}

export async function executeResearchImportBatch(batchId: string) {
  let result = await executeResearchImportChunk(batchId); let guard = 0;
  while (result.hasMore && result.status === 'EXECUTION_CONTINUE') {
    guard += 1;
    if (guard > 200) throw new Error('研究数据导入自动分批次数异常，请刷新批次状态后重试。');
    result = await executeResearchImportChunk(batchId);
  }
  if (result.status === 'EXECUTED') {
    const authoritative = await executeResearchAuthoritativeBatch(batchId);
    if (authoritative.status !== 'AUTHORITATIVE_EXECUTED') throw new Error('TOP500 CSV 权威字段尚未完整同步。');
  }
  return result;
}

async function executeResearchSiteChunk(batchId: string) {
  return api<ResearchSiteExecutionResult>(`/api/crm-native/research-intake/batches/${encodeURIComponent(batchId)}/execute-sites`, { method: 'POST', body: JSON.stringify({ confirmation: 'EXECUTE_TOP500_RESEARCH_SITES' }) });
}
export async function executeResearchSiteBatch(batchId: string) {
  let result = await executeResearchSiteChunk(batchId); let guard = 0;
  while (result.hasMore && result.status === 'SITE_EXECUTION_CONTINUE') { guard += 1; if (guard > 100) throw new Error('工厂/场址研究数据自动分批次数异常，请刷新批次状态后重试。'); result = await executeResearchSiteChunk(batchId); }
  return result;
}

async function executeResearchContactChunk(batchId: string) {
  return api<ResearchContactExecutionResult>(`/api/crm-native/research-intake/batches/${encodeURIComponent(batchId)}/execute-contacts`, { method: 'POST', body: JSON.stringify({ confirmation: 'EXECUTE_TOP500_RESEARCH_CONTACTS' }) });
}
export async function executeResearchContactBatch(batchId: string) {
  let result = await executeResearchContactChunk(batchId); let guard = 0;
  while (result.hasMore && result.status === 'CONTACT_EXECUTION_CONTINUE') { guard += 1; if (guard > 200) throw new Error('联系人/目标岗位研究数据自动分批次数异常，请刷新批次状态后重试。'); result = await executeResearchContactChunk(batchId); }
  return result;
}

async function executeResearchEnrichmentChunk(batchId: string) {
  return api<ResearchEnrichmentExecutionResult>(`/api/crm-native/research-intake/batches/${encodeURIComponent(batchId)}/execute-enrichment`, { method: 'POST', body: JSON.stringify({ confirmation: 'EXECUTE_TOP500_RESEARCH_ENRICHMENT' }) });
}
export async function executeResearchEnrichmentBatch(batchId: string) {
  let result = await executeResearchEnrichmentChunk(batchId); let guard = 0;
  while (result.hasMore && result.status === 'ENRICHMENT_EXECUTION_CONTINUE') { guard += 1; if (guard > 100) throw new Error('研究证据/机会/能源发现自动分批次数异常，请刷新批次状态后重试。'); result = await executeResearchEnrichmentChunk(batchId); }
  return result;
}

export async function listResearchImportBatches(limit = 50) {
  const result = await api<{ batches?: ResearchImportBatch[] }>(`/api/crm-native/research-intake/batches?limit=${Math.max(1, Math.min(200, Math.floor(limit)))}`);
  return Array.isArray(result.batches) ? result.batches : [];
}

export async function getResearchImportBatch(batchId: string) {
  const result = await api<{ batch?: ResearchImportBatch; items?: ResearchDryRunItem[] }>(`/api/crm-native/research-intake/batches/${encodeURIComponent(batchId)}`);
  if (!result.batch) throw new Error('研究数据批次不存在或暂不可读取。');
  return { batch: result.batch, items: Array.isArray(result.items) ? result.items : [] };
}
