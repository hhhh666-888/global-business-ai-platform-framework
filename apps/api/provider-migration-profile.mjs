const PROFILES = Object.freeze({
  'twenty-crm': Object.freeze({
    component: 'twenty-crm',
    contractVersion: 'gbap.crm.v1',
    upstreamProduct: 'Twenty',
    auditSource: 'infrastructure/local-uat/Sync-GBAP-UAT-TwentyProvider.ps1',
    capabilityPolicy: 'CRM',
  }),
});

export function resolveProviderMigrationProfile(provider) {
  const component = typeof provider?.component === 'string' ? provider.component : '';
  const profile = PROFILES[component];
  if (!profile) throw new Error(`unexpected_provider_component:${component || 'null'}`);
  if (provider.contract_version !== profile.contractVersion) {
    throw new Error(`provider_contract_version_mismatch:${provider.contract_version ?? 'null'}:${profile.contractVersion}`);
  }
  return profile;
}

export function validateProviderMigrationCapabilities(profile, desired) {
  const names = desired.map((item) => item.name);
  if (profile.capabilityPolicy === 'CRM') {
    if (names.some((name) => !/^crm\.(?:v1|meta\.v1|ops\.v1)\./u.test(name))) {
      return 'canonical_crm_capability_namespace_invalid';
    }
    if (names.includes('crm.ai.v1.reason')) {
      return 'canonical_crm_provider_must_not_own_ai_reasoning';
    }
    return null;
  }
  return 'unsupported_capability_policy';
}
