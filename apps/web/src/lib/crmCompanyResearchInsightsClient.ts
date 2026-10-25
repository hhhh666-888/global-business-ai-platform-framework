import { api } from './gbapClient';
import type { EcuadorTop500Header } from './crmResearchIntake';

export type ResearchInsightSite = {
  businessId: string;
  siteName: string | null;
  siteKind: string | null;
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
  updatedAt: string;
};

export type ResearchInsightTargetRole = {
  businessId: string;
  roleKey: string;
  roleTitleText: string | null;
  candidateName: string | null;
  candidateContactText: string | null;
  verificationNote: string | null;
  recommendedSearchText: string | null;
  status: string;
  resolvedContactBusinessId: string | null;
  source: string | null;
  updatedAt: string;
};

export type ResearchInsightEvidence = {
  businessId: string;
  sourceName: string;
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
  createdAt: string;
};

export type ResearchAuthoritativeProfile = {
  accountBusinessId: string;
  batchId: string;
  rowNumber: number;
  schemaVersion: string;
  sourceName: string;
  sourceDigest: string | null;
  fields: Partial<Record<EcuadorTop500Header, string>>;
  updatedAt: string;
};

export type CompanyResearchInsight = {
  accountBusinessId: string;
  siteCount: number;
  primarySite: ResearchInsightSite | null;
  targetRoles: ResearchInsightTargetRole[];
  openTargetRoleCount: number;
  resolvedTargetRoleCount: number;
  evidenceCount: number;
  evidence?: ResearchInsightEvidence[];
  latestEvidence: ResearchInsightEvidence | null;
  researchIntelligence: null | {
    researchPriority?: string | null;
    industrySegment?: string | null;
    productsServices?: string | null;
    researchRationale?: string | null;
    companyWhatsapp?: string | null;
    companyScale?: string | null;
    recommendedSolution?: string | null;
    recommendedEntryPoint?: string | null;
    estimatedProjectScale?: string | null;
    recommendedChannel?: string | null;
    firstOutreachSubject?: string | null;
    firstContactGuidance?: string | null;
    researchCompleteness?: string | null;
    researchNextAction?: string | null;
    updatedAt?: string | null;
  };
  salesSignal: null | {
    solarOpportunity?: string | null;
    storageOpportunity?: string | null;
    generatorOpportunity?: string | null;
    electricalOpportunity?: string | null;
    updatedAt?: string | null;
  };
  energyDiscovery: null | {
    publicKnownEnergyData?: string | null;
    updatedAt?: string | null;
  };
  authoritativeProfile: ResearchAuthoritativeProfile | null;
};

function emptyInsight(accountBusinessId: string): CompanyResearchInsight {
  return {
    accountBusinessId,
    siteCount: 0,
    primarySite: null,
    targetRoles: [],
    openTargetRoleCount: 0,
    resolvedTargetRoleCount: 0,
    evidenceCount: 0,
    evidence: [],
    latestEvidence: null,
    researchIntelligence: null,
    salesSignal: null,
    energyDiscovery: null,
    authoritativeProfile: null,
  };
}

export async function listCompanyResearchInsights() {
  const [researchResult, authoritativeResult] = await Promise.all([
    api<{ insights?: Omit<CompanyResearchInsight, 'authoritativeProfile'>[] }>('/api/crm-native/company-research-insights'),
    api<{ profiles?: ResearchAuthoritativeProfile[] }>('/api/crm-native/research-authoritative-profiles'),
  ]);
  const researchRows = Array.isArray(researchResult.insights) ? researchResult.insights : [];
  const authoritativeRows = Array.isArray(authoritativeResult.profiles) ? authoritativeResult.profiles : [];
  const merged = new Map<string, CompanyResearchInsight>();
  for (const row of researchRows) merged.set(row.accountBusinessId, { ...row, authoritativeProfile: null });
  for (const profile of authoritativeRows) {
    const current = merged.get(profile.accountBusinessId) ?? emptyInsight(profile.accountBusinessId);
    merged.set(profile.accountBusinessId, { ...current, authoritativeProfile: profile });
  }
  return [...merged.values()];
}
