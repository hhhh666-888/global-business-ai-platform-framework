import { api } from './gbapClient';
import { softDeleteCrmRuntimeRecord } from './crmRuntimeClient';

export type CustomerType = 'DISTRIBUTOR' | 'EPC' | 'FACTORY' | 'END_USER' | 'DEVELOPER' | 'UTILITY' | 'GOVERNMENT' | 'OTHER';
export type RelationshipStatus = 'PROSPECT' | 'QUALIFIED' | 'CUSTOMER' | 'PARTNER' | 'INACTIVE';
export type AccountPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export type CompanyProfileState = {
  businessId: string;
  displayName?: string | null;
  primaryEmail?: string | null;
  primaryPhone?: string | null;
  customerType?: CustomerType | null;
  relationshipStatus?: RelationshipStatus | null;
  industry?: string | null;
  employeeCount?: number | null;
  source?: string | null;
  priority?: AccountPriority | null;
  notes?: string | null;
  registrationCountry?: string | null;
  registrationType?: string | null;
  registrationId?: string | null;
  commercialName?: string | null;
  ownershipType?: string | null;
  verificationGrade?: string | null;
  strategicValueScore?: number | null;
  researchRank?: number | null;
  parentAccountBusinessId?: string | null;
  accountOwnerUserId?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
  annualRevenue?: number | null;
  annualRevenueCurrency?: string | null;
  profileUpdatedAt?: string | null;
};

export type AccountProfilePatch = Omit<CompanyProfileState, 'businessId' | 'profileUpdatedAt'> & {
  displayName?: string;
  addressStreet1?: string | null;
  addressStreet2?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressPostcode?: string | null;
  addressCountry?: string | null;
};

type InvocationResponse<T> = { requestId: string; providerId: string; result: T };
type ResearchAuthoritativeProfileWire = {
  accountBusinessId: string;
  sourceName?: string | null;
  fields?: Record<string, string>;
  updatedAt?: string | null;
};

async function invoke<T>(capability: string, payload: Record<string, unknown>) {
  return api<InvocationResponse<T>>(`/api/capabilities/${encodeURIComponent(capability)}/invoke`, {
    method: 'POST',
    body: JSON.stringify({ payload }),
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readCanonicalCompanyProfiles() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await api<{ profiles?: CompanyProfileState[] }>('/api/crm-native/company-profiles');
      return Array.isArray(result.profiles) ? result.profiles : [];
    } catch (cause) {
      const status = (cause as { status?: number } | null)?.status;
      if (status === 404 || status === 421) return [];
      const transient = status === 502 || status === 503 || status === 504;
      if (!transient) throw cause;
      if (attempt < 2) {
        await sleep(100 * (attempt + 1));
        continue;
      }
      return [];
    }
  }
  return [];
}

async function readResearchCompanyProfiles() {
  try {
    const result = await api<{ profiles?: CompanyProfileState[] }>('/api/crm-native/research-company-profiles');
    return Array.isArray(result.profiles) ? result.profiles : [];
  } catch (cause) {
    const status = (cause as { status?: number } | null)?.status;
    if (status === 404 || status === 421 || status === 502 || status === 503 || status === 504) return [];
    throw cause;
  }
}

function numberFromCsv(value: string | undefined) {
  if (!value?.trim()) return null;
  const parsed = Number(value.replace(/[$,\s]/g, '').replace(/USD/gi, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function integerFromCsv(value: string | undefined) {
  const parsed = numberFromCsv(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function authoritativeState(profile: ResearchAuthoritativeProfileWire): CompanyProfileState {
  const fields = profile.fields ?? {};
  const revenue = numberFromCsv(fields['2025营收USD']);
  return {
    businessId: profile.accountBusinessId,
    displayName: fields['公司名称'] || null,
    commercialName: fields['商业名称'] || null,
    registrationCountry: 'EC',
    registrationType: 'RUC',
    registrationId: fields.RUC || null,
    verificationGrade: fields['数据核验等级'] || null,
    strategicValueScore: numberFromCsv(fields['GBAP价值评分']),
    researchRank: integerFromCsv(fields['开发排名']),
    website: fields['官网'] || null,
    linkedinUrl: fields.LinkedIn || null,
    industry: fields['行业大类'] || null,
    primaryPhone: fields['公司电话'] || null,
    primaryEmail: fields['公司邮箱'] || null,
    annualRevenue: revenue,
    annualRevenueCurrency: revenue === null ? null : 'USD',
    employeeCount: integerFromCsv(fields['员工人数']),
    source: profile.sourceName ?? null,
    profileUpdatedAt: profile.updatedAt ?? null,
  };
}

async function readResearchAuthoritativeProfiles() {
  try {
    const result = await api<{ profiles?: ResearchAuthoritativeProfileWire[] }>('/api/crm-native/research-authoritative-profiles');
    return (Array.isArray(result.profiles) ? result.profiles : []).map(authoritativeState);
  } catch (cause) {
    const status = (cause as { status?: number } | null)?.status;
    if (status === 404 || status === 421 || status === 502 || status === 503 || status === 504) return [];
    throw cause;
  }
}

export async function listCompanyProfiles() {
  const [canonical, research, authoritative] = await Promise.all([
    readCanonicalCompanyProfiles(),
    readResearchCompanyProfiles(),
    readResearchAuthoritativeProfiles(),
  ]);
  const researchById = new Map(research.map((profile) => [profile.businessId, profile]));
  const authoritativeById = new Map(authoritative.map((profile) => [profile.businessId, profile]));
  return canonical.map((profile) => ({
    ...profile,
    ...(researchById.get(profile.businessId) ?? {}),
    ...(authoritativeById.get(profile.businessId) ?? {}),
  }));
}

export async function updateAccountRecord<T>(businessId: string, changes: AccountProfilePatch) {
  return (await invoke<{ record: T }>('crm.ops.v1.account.update', { businessId, ...changes })).result.record;
}

// User-facing delete actions are recoverable. Permanent destruction is exposed
// only through the unified recycle bin and remains server-enforced for substrate-admin.
export async function deleteAccountRecord(businessId: string) {
  return softDeleteCrmRuntimeRecord('company', businessId);
}
export async function deleteContactRecord(businessId: string) {
  return softDeleteCrmRuntimeRecord('person', businessId);
}
export async function deleteOpportunityRecord(businessId: string) {
  return softDeleteCrmRuntimeRecord('opportunity', businessId);
}
export async function deleteTaskRecord(businessId: string) {
  return softDeleteCrmRuntimeRecord('task', businessId);
}
export async function deleteNoteRecord(businessId: string) {
  return softDeleteCrmRuntimeRecord('note', businessId);
}
