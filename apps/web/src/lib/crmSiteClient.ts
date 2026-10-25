import { api } from './gbapClient';

export type SiteKind = 'FACTORY' | 'PLANT' | 'WAREHOUSE' | 'DATA_CENTER' | 'MINE' | 'FARM' | 'COMMERCIAL_PARK' | 'OFFICE' | 'OTHER';

export type CrmSite = {
  businessId: string;
  accountBusinessId: string;
  siteKey: string;
  siteName: string;
  siteKind?: SiteKind | null;
  province?: string | null;
  city?: string | null;
  address?: string | null;
  googleMapsUrl?: string | null;
  reportedSiteCount?: number | null;
  siteAreaSqm?: number | null;
  buildingAreaSqm?: number | null;
  roofAreaSqm?: number | null;
  availableLandSqm?: number | null;
  operatingProfile?: string | null;
  operatingHoursPerDay?: number | null;
  operatingDaysPerWeek?: number | null;
  shiftsPerDay?: number | null;
  processOperatingCharacteristics?: string | null;
  keyEquipmentText?: string | null;
  estimatedEnergyGrade?: string | null;
  estimatedPeakDemandKw?: number | null;
  estimatedMonthlyConsumptionKwh?: number | null;
  energyPainPoints?: string | null;
  existingGeneratorBackup?: string | null;
  existingSolarStorage?: string | null;
  roofSiteConditions?: string | null;
  source?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SitePatch = Omit<Partial<CrmSite>, 'businessId' | 'accountBusinessId' | 'siteKey' | 'createdAt' | 'updatedAt'>;

export async function listCompanySites(accountBusinessId: string) {
  const result = await api<{ sites?: CrmSite[] }>(`/api/crm-native/sites?accountBusinessId=${encodeURIComponent(accountBusinessId)}`);
  return Array.isArray(result.sites) ? result.sites : [];
}

export async function getCompanySite(businessId: string) {
  const result = await api<{ site: CrmSite }>(`/api/crm-native/sites/${encodeURIComponent(businessId)}`);
  return result.site;
}

export async function createCompanySite(accountBusinessId: string, input: SitePatch & { siteName: string }) {
  const result = await api<{ site: CrmSite }>('/api/crm-native/sites', {
    method: 'POST',
    body: JSON.stringify({ accountBusinessId, ...input }),
  });
  return result.site;
}

export async function updateCompanySite(businessId: string, patch: SitePatch) {
  const result = await api<{ site: CrmSite }>(`/api/crm-native/sites/${encodeURIComponent(businessId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return result.site;
}
