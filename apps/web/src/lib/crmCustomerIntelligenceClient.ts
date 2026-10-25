import { api } from './gbapClient';
import { clearPendingCustomerCreate } from './pendingCustomerCreate';
import type { DevelopmentStage } from './crmDevelopmentStage';
import type { EcuadorTop500Header } from './crmResearchIntake';

export type CustomerSegment = 'INDUSTRIAL' | 'CHANNEL' | 'PROJECT' | 'PUBLIC' | 'OTHER';
export type CustomerRole =
  | 'FACTORY' | 'MINE' | 'DATA_CENTER' | 'COMMERCIAL_PARK' | 'AGRICULTURE'
  | 'RENEWABLE_DISTRIBUTOR' | 'GENERATOR_DISTRIBUTOR' | 'ELECTRICAL_DISTRIBUTOR'
  | 'EPC' | 'DEVELOPER' | 'INVESTOR' | 'UTILITY' | 'GOVERNMENT';
export type GridStability = 'STABLE' | 'OCCASIONAL_OUTAGE' | 'FREQUENT_OUTAGE' | 'SEVERE_OUTAGE' | 'UNKNOWN';
export type EnergyProductNeed = 'SOLAR' | 'STORAGE' | 'DIESEL_GENERATOR' | 'GAS_GENERATOR' | 'TRANSFORMER' | 'ELECTRICAL' | 'MICROGRID' | 'ENERGY_MANAGEMENT';
export type ChannelProduct = 'SOLAR_MODULE' | 'INVERTER' | 'STORAGE' | 'DIESEL_GENERATOR' | 'GAS_GENERATOR' | 'TRANSFORMER' | 'ELECTRICAL' | 'MICROGRID';
export type PurchaseFrequency = 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL' | 'IRREGULAR';
export type Top500V46ManualOverrides = Partial<Record<EcuadorTop500Header, string | null>>;

export type CustomerIntelligenceProfile = {
  businessId: string | null;
  customerSegment?: CustomerSegment | null;
  customerRoles?: CustomerRole[];
  developmentStage?: DevelopmentStage | null;
  factoryCount?: number | null;
  siteAreaSqm?: number | null;
  buildingAreaSqm?: number | null;
  roofAreaSqm?: number | null;
  availableLandSqm?: number | null;
  operatingHoursPerDay?: number | null;
  operatingDaysPerWeek?: number | null;
  shiftsPerDay?: number | null;
  monthlyConsumptionKwh?: number | null;
  annualConsumptionKwh?: number | null;
  monthlyElectricityCost?: number | null;
  electricityCostCurrency?: string | null;
  electricityTariff?: number | null;
  peakDemandKw?: number | null;
  gridStability?: GridStability | null;
  outageHoursPerMonth?: number | null;
  transformerCapacityKva?: number | null;
  generatorCapacityKw?: number | null;
  existingSolarKw?: number | null;
  existingStorageKwh?: number | null;
  keyEquipmentText?: string | null;
  energyPainPoints?: string | null;
  projectNeeds?: EnergyProductNeed[];
  projectBudget?: number | null;
  projectBudgetCurrency?: string | null;
  projectTimeline?: string | null;
  channelProducts?: ChannelProduct[];
  representedBrands?: string | null;
  existingSuppliers?: string | null;
  annualPurchaseValue?: number | null;
  purchaseCurrency?: string | null;
  purchaseFrequency?: PurchaseFrequency | null;
  coverageRegions?: string | null;
  branchCount?: number | null;
  warehouseCapability?: boolean | null;
  afterSalesCapability?: boolean | null;
  installationCapability?: boolean | null;
  technicalTeamSize?: number | null;
  channelCustomerSegments?: string | null;
  targetProducts?: ChannelProduct[];
  paymentTerms?: string | null;
  nextPurchaseAt?: string | null;
  /**
   * Explicit user corrections for the frozen TOP500 v46 75-field business view.
   * Keys are the exact spreadsheet headers; absence means "use canonical/research
   * value", while null/empty means the user intentionally cleared the field.
   */
  profile75Overrides?: Top500V46ManualOverrides;
  intelligenceUpdatedAt?: string | null;
};

export type CustomerIntelligencePatch = Omit<CustomerIntelligenceProfile, 'businessId' | 'intelligenceUpdatedAt'>;

type ApiFailure = { status?: number };

function wait(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function sameValue(actual: unknown, expected: unknown) {
  if (Array.isArray(actual) && Array.isArray(expected)) return JSON.stringify(actual) === JSON.stringify(expected);
  if (actual && expected && typeof actual === 'object' && typeof expected === 'object') return JSON.stringify(actual) === JSON.stringify(expected);
  return actual === expected;
}

function profileMatches(profile: CustomerIntelligenceProfile, changes: CustomerIntelligencePatch) {
  return Object.entries(changes).every(([key, expected]) => sameValue((profile as Record<string, unknown>)[key], expected));
}

export async function listCustomerIntelligenceProfiles() {
  return (await api<{ profiles: CustomerIntelligenceProfile[] }>('/api/crm-native/customer-intelligence')).profiles;
}

async function readBackCustomerIntelligence(businessId: string, changes: CustomerIntelligencePatch) {
  try {
    const profile = (await listCustomerIntelligenceProfiles()).find((item) => item.businessId === businessId);
    return profile && profileMatches(profile, changes) ? profile : null;
  } catch {
    return null;
  }
}

export async function updateCustomerIntelligenceProfile(businessId: string, changes: CustomerIntelligencePatch) {
  let lastFailure: unknown = null;
  const path = `/api/crm-native/customer-intelligence/${encodeURIComponent(businessId)}`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const profile = (await api<{ profile: CustomerIntelligenceProfile }>(path, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      })).profile;
      clearPendingCustomerCreate(businessId);
      return profile;
    } catch (cause) {
      lastFailure = cause;
      const status = (cause as ApiFailure)?.status;
      if (!status || status < 500) throw cause;

      // A write can commit before a downstream response/audit path fails. Read back first
      // so the UI never reports a false failure or asks the user to create the same company again.
      const persisted = await readBackCustomerIntelligence(businessId, changes);
      if (persisted) {
        clearPendingCustomerCreate(businessId);
        return persisted;
      }

      if (attempt < 2) await wait(160 * (attempt + 1));
    }
  }

  throw lastFailure;
}
