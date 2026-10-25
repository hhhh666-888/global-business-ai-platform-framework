import {
  createAccount as createWireAccount,
  createContact as createWireContact,
  createOpportunity as createWireOpportunity,
  listAccounts as listWireAccounts,
  listContacts as listWireContacts,
  listOpportunities as listWireOpportunities,
  updateContact as updateWireContact,
  updateOpportunity as updateWireOpportunity,
  type CanonicalAccount as WireAccount,
  type CanonicalContact as WireContact,
  type CanonicalOpportunity as WireOpportunity,
  type OpportunityLifecycleState,
  type OpportunityPipelineStage,
} from './gbapClient';
import {
  deleteAccountRecord,
  deleteContactRecord,
  deleteOpportunityRecord,
  listCompanyProfiles,
  updateAccountRecord,
  type AccountPriority,
  type AccountProfilePatch,
  type CustomerType,
  type RelationshipStatus,
} from './crmLifecycleClient';
import {
  listOpportunityProfiles,
  updateOpportunityProfile,
  type ForeignTradeStage,
  type OpportunityProfile,
} from './crmOpportunityProfileClient';
import {
  customerCreateFingerprint,
  pendingCustomerBusinessId,
  rememberPendingCustomerCreate,
} from './pendingCustomerCreate';

export type CanonicalAccount = {
  businessId: string | null;
  businessType: 'Account';
  displayName: string;
  website: string | null;
  linkedinUrl: string | null;
  addressStreet1: string | null;
  addressStreet2: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressPostcode: string | null;
  addressCountry: string | null;
  annualRevenue: number | null;
  annualRevenueCurrency: string | null;
  updatedAt: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  customerType: CustomerType | null;
  relationshipStatus: RelationshipStatus | null;
  industry: string | null;
  employeeCount: number | null;
  source: string | null;
  priority: AccountPriority | null;
  notes: string | null;
  registrationCountry: string | null;
  registrationType: string | null;
  registrationId: string | null;
  commercialName: string | null;
  ownershipType: string | null;
  verificationGrade: string | null;
  strategicValueScore: number | null;
  researchRank: number | null;
  parentAccountBusinessId: string | null;
  accountOwnerUserId: string | null;
  profileUpdatedAt: string | null;
};

export type AccountProfileInput = Omit<AccountProfilePatch, 'displayName'> & { displayName: string };

export type CanonicalContact = {
  businessId: string | null;
  businessType: 'Contact';
  personName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  linkedinUrl: string | null;
  accountBusinessId: string | null;
  updatedAt: string | null;
};

export type ContactProfileInput = {
  personName: string;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  linkedinUrl?: string | null;
  accountBusinessId?: string | null;
};

export type CanonicalOpportunity = {
  businessId: string | null;
  businessType: 'Opportunity';
  nameSummary: string;
  lifecycleState: OpportunityLifecycleState | string;
  accountBusinessId: string | null;
  estimatedValue: number | null;
  currencyCode: string | null;
  pipelineStage: OpportunityPipelineStage | string | null;
  tradeStage: ForeignTradeStage;
  nextStep: string | null;
  profileUpdatedAt: string | null;
};

export type { OpportunityLifecycleState, OpportunityPipelineStage, ForeignTradeStage, CustomerType, RelationshipStatus, AccountPriority };

function hasProfileField(profile: Record<string, unknown> | undefined, key: string) {
  return Boolean(profile && Object.prototype.hasOwnProperty.call(profile, key));
}

function profileOrFallback<T>(profile: Record<string, unknown> | undefined, key: string, fallback: T): T {
  if (!hasProfileField(profile, key)) return fallback;
  return profile?.[key] as T;
}

function accountView(record: WireAccount, profile?: Record<string, unknown>): CanonicalAccount {
  const rich = record as WireAccount & Partial<CanonicalAccount>;
  const authoritativeName = profile?.displayName as string | null | undefined;
  return {
    businessId: record.businessId,
    businessType: 'Account',
    displayName: authoritativeName || record.displayName,
    website: profileOrFallback<string | null>(profile, 'website', record.website ?? null),
    linkedinUrl: profileOrFallback<string | null>(profile, 'linkedinUrl', rich.linkedinUrl ?? null),
    addressStreet1: rich.addressStreet1 ?? null,
    addressStreet2: rich.addressStreet2 ?? null,
    addressCity: rich.addressCity ?? null,
    addressState: rich.addressState ?? null,
    addressPostcode: rich.addressPostcode ?? null,
    addressCountry: rich.addressCountry ?? null,
    annualRevenue: profileOrFallback<number | null>(profile, 'annualRevenue', rich.annualRevenue ?? null),
    annualRevenueCurrency: profileOrFallback<string | null>(profile, 'annualRevenueCurrency', rich.annualRevenueCurrency ?? null),
    updatedAt: rich.updatedAt ?? null,
    primaryEmail: (profile?.primaryEmail as string | null | undefined) ?? null,
    primaryPhone: (profile?.primaryPhone as string | null | undefined) ?? null,
    customerType: (profile?.customerType as CustomerType | null | undefined) ?? null,
    relationshipStatus: (profile?.relationshipStatus as RelationshipStatus | null | undefined) ?? null,
    industry: (profile?.industry as string | null | undefined) ?? null,
    employeeCount: (profile?.employeeCount as number | null | undefined) ?? null,
    source: (profile?.source as string | null | undefined) ?? null,
    priority: (profile?.priority as AccountPriority | null | undefined) ?? null,
    notes: (profile?.notes as string | null | undefined) ?? null,
    registrationCountry: (profile?.registrationCountry as string | null | undefined) ?? null,
    registrationType: (profile?.registrationType as string | null | undefined) ?? null,
    registrationId: (profile?.registrationId as string | null | undefined) ?? null,
    commercialName: (profile?.commercialName as string | null | undefined) ?? null,
    ownershipType: (profile?.ownershipType as string | null | undefined) ?? null,
    verificationGrade: (profile?.verificationGrade as string | null | undefined) ?? null,
    strategicValueScore: (profile?.strategicValueScore as number | null | undefined) ?? null,
    researchRank: (profile?.researchRank as number | null | undefined) ?? null,
    parentAccountBusinessId: (profile?.parentAccountBusinessId as string | null | undefined) ?? null,
    accountOwnerUserId: (profile?.accountOwnerUserId as string | null | undefined) ?? null,
    profileUpdatedAt: (profile?.profileUpdatedAt as string | null | undefined) ?? null,
  };
}

function contactView(record: WireContact): CanonicalContact {
  const rich = record as WireContact & Partial<CanonicalContact>;
  return {
    businessId: record.businessId,
    businessType: 'Contact',
    personName: record.personName,
    email: record.email,
    phone: rich.phone ?? null,
    jobTitle: rich.jobTitle ?? null,
    linkedinUrl: rich.linkedinUrl ?? null,
    accountBusinessId: record.accountBusinessId ?? null,
    updatedAt: rich.updatedAt ?? null,
  };
}

function tradeStageFromProvider(value: string | null | undefined): ForeignTradeStage {
  const normalized = String(value ?? '').toUpperCase();
  if (normalized === 'CUSTOMER') return 'ORDER_CONFIRMED';
  if (normalized === 'PROPOSAL') return 'QUOTATION';
  if (normalized === 'MEETING') return 'NEEDS_CONFIRMED';
  if (normalized === 'SCREENING') return 'QUALIFYING';
  return 'NEW';
}

export function providerStageForTradeStage(stage: ForeignTradeStage): OpportunityPipelineStage {
  if (stage === 'ORDER_CONFIRMED') return 'CUSTOMER';
  if (['QUOTATION', 'NEGOTIATION', 'DECISION', 'ORDER_PENDING'].includes(stage)) return 'PROPOSAL';
  if (['NEEDS_CONFIRMED', 'TECHNICAL_SAMPLE'].includes(stage)) return 'MEETING';
  if (['CONTACTED', 'QUALIFYING', 'ON_HOLD'].includes(stage)) return 'SCREENING';
  return 'NEW';
}

function opportunityView(record: WireOpportunity, profile?: OpportunityProfile): CanonicalOpportunity {
  return {
    businessId: record.businessId,
    businessType: 'Opportunity',
    nameSummary: record.nameSummary,
    lifecycleState: record.lifecycleState,
    accountBusinessId: record.accountBusinessId ?? null,
    estimatedValue: record.estimatedValue,
    currencyCode: record.currencyCode,
    pipelineStage: record.pipelineStage,
    tradeStage: profile?.tradeStage ?? tradeStageFromProvider(record.pipelineStage),
    nextStep: record.nextStep,
    profileUpdatedAt: profile?.profileUpdatedAt ?? null,
  };
}

export async function listAccounts(limit = 100) {
  const [records, profiles] = await Promise.all([listWireAccounts(limit), listCompanyProfiles()]);
  const profileById = new Map(profiles.map((profile) => [profile.businessId, profile as unknown as Record<string, unknown>]));
  return records.map((record) => accountView(record, record.businessId ? profileById.get(record.businessId) : undefined));
}

export async function createAccount(input: string | AccountProfileInput) {
  const profile: AccountProfileInput = typeof input === 'string' ? { displayName: input } : input;
  const fingerprint = customerCreateFingerprint(profile);
  const pendingBusinessId = pendingCustomerBusinessId(fingerprint);
  const { displayName: _displayName, ...changes } = profile;

  if (pendingBusinessId) {
    const updated = await updateAccountRecord<WireAccount & Partial<CanonicalAccount>>(pendingBusinessId, { displayName: profile.displayName, ...changes });
    return accountView(updated as WireAccount, updated as unknown as Record<string, unknown>);
  }

  const created = await createWireAccount(profile.displayName);
  if (!created.businessId) return accountView(created);

  rememberPendingCustomerCreate(fingerprint, created.businessId);

  if (Object.values(changes).some((value) => value !== undefined && value !== '')) {
    const updated = await updateAccountRecord<WireAccount & Partial<CanonicalAccount>>(created.businessId, { displayName: profile.displayName, ...changes });
    return accountView(updated as WireAccount, updated as unknown as Record<string, unknown>);
  }
  return accountView(created);
}

export async function updateAccount(businessId: string, changes: AccountProfilePatch) {
  const record = await updateAccountRecord<WireAccount & Partial<CanonicalAccount>>(businessId, changes);
  return accountView(record as WireAccount, record as unknown as Record<string, unknown>);
}

export async function deleteAccount(businessId: string) { return deleteAccountRecord(businessId); }

export async function listContacts(limit = 100) {
  return (await listWireContacts(limit)).map(contactView);
}

export async function createContact(input: string | ContactProfileInput, email?: string) {
  const profile: ContactProfileInput = typeof input === 'string' ? { personName: input, email: email ?? null } : input;
  const created = await createWireContact(profile.personName, profile.email ?? undefined);
  if (!created.businessId) return contactView(created);
  const extra = {
    ...(profile.accountBusinessId !== undefined ? { accountBusinessId: profile.accountBusinessId } : {}),
    ...(profile.phone !== undefined ? { phone: profile.phone } : {}),
    ...(profile.jobTitle !== undefined ? { jobTitle: profile.jobTitle } : {}),
    ...(profile.linkedinUrl !== undefined ? { linkedinUrl: profile.linkedinUrl } : {}),
  };
  if (Object.keys(extra).length) {
    const updated = await updateWireContact(created.businessId, extra as Parameters<typeof updateWireContact>[1]);
    return contactView(updated);
  }
  return contactView(created);
}

export async function updateContact(businessId: string, changes: ContactProfileInput | { personName?: string; email?: string | null; accountBusinessId?: string | null; phone?: string | null; jobTitle?: string | null; linkedinUrl?: string | null }) {
  return contactView(await updateWireContact(businessId, changes as Parameters<typeof updateWireContact>[1]));
}

export async function deleteContact(businessId: string) { return deleteContactRecord(businessId); }

export async function listOpportunities(limit = 100) {
  const [records, profiles] = await Promise.all([listWireOpportunities(limit), listOpportunityProfiles()]);
  const profileById = new Map(profiles.map((profile) => [profile.businessId, profile]));
  return records.map((record) => opportunityView(record, record.businessId ? profileById.get(record.businessId) : undefined));
}

export async function createOpportunity(input: { nameSummary: string; accountBusinessId: string; estimatedValue?: number; currencyCode?: string }) {
  return opportunityView(await createWireOpportunity(input));
}

export async function updateOpportunity(
  businessId: string,
  changes: {
    nameSummary?: string;
    accountBusinessId?: string | null;
    estimatedValue?: number;
    currencyCode?: string;
    pipelineStage?: OpportunityPipelineStage;
    tradeStage?: ForeignTradeStage;
    lifecycleState?: OpportunityLifecycleState;
    nextStep?: string | null;
  },
) {
  const { tradeStage, ...providerChanges } = changes;
  const normalizedTradeStage = changes.lifecycleState === 'CLOSED_WON' ? 'ORDER_CONFIRMED' : tradeStage;
  if (normalizedTradeStage) providerChanges.pipelineStage = providerStageForTradeStage(normalizedTradeStage);
  const updated = await updateWireOpportunity(businessId, providerChanges);
  const profile = normalizedTradeStage ? await updateOpportunityProfile(businessId, normalizedTradeStage) : undefined;
  return opportunityView(updated, profile);
}

export async function deleteOpportunity(businessId: string) { return deleteOpportunityRecord(businessId); }
