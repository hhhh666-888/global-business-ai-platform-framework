function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeCompanyName(value) {
  return text(value).normalize('NFKC').replace(/\s+/g, ' ').toUpperCase();
}

export function normalizeComparableUrl(value) {
  const raw = text(value);
  if (!raw) return '';
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withScheme);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = url.pathname.replace(/\/+$/, '').toLowerCase();
    return `${host}${path}`;
  } catch {
    return raw.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  }
}

export function identityKey(country, type, id) {
  return `${text(country).toUpperCase()}\u0000${text(type).toUpperCase()}\u0000${text(id)}`;
}

export function fingerprintsCompatible(row, account) {
  const rowWebsite = normalizeComparableUrl(row?.companySnapshot?.website);
  const accountWebsite = normalizeComparableUrl(account?.website);
  if (rowWebsite && accountWebsite && rowWebsite !== accountWebsite) return false;

  const rowLinkedin = normalizeComparableUrl(row?.companySnapshot?.linkedinUrl);
  const accountLinkedin = normalizeComparableUrl(account?.linkedinUrl);
  if (rowLinkedin && accountLinkedin && rowLinkedin !== accountLinkedin) return false;
  return true;
}

export function resolvedIdentityCoverage({ rows, plans, canonicalBusinessIds, identityOwnerByKey, stateOwnersByKey }) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const canonical = canonicalBusinessIds instanceof Set ? canonicalBusinessIds : new Set();
  const registryOwners = identityOwnerByKey instanceof Map ? identityOwnerByKey : new Map();
  const stateOwners = stateOwnersByKey instanceof Map ? stateOwnersByKey : new Map();
  const plannedRows = new Set((Array.isArray(plans) ? plans : []).map((plan) => plan?.rowNumber));
  let resolved = 0;

  for (const row of normalizedRows) {
    if (plannedRows.has(row?.rowNumber)) {
      resolved += 1;
      continue;
    }
    const key = identityKey(row?.registrationCountry, row?.registrationType, row?.registrationId);
    const registryOwner = registryOwners.get(key) ?? null;
    if (registryOwner && canonical.has(registryOwner)) {
      resolved += 1;
      continue;
    }
    const canonicalStateOwners = [...new Set(stateOwners.get(key) ?? [])]
      .filter((businessId) => canonical.has(businessId));
    if (canonicalStateOwners.length === 1) resolved += 1;
  }

  return resolved;
}

export function shouldFailClosedLegacyAdoption({ rowCount, canonicalAccountCount, resolvedCoverage }) {
  return Number.isInteger(rowCount)
    && rowCount > 0
    && canonicalAccountCount === rowCount
    && resolvedCoverage !== rowCount;
}

export function planExactIdentityAdoptions({
  rows,
  accounts,
  canonicalBusinessIds,
  identityOwnerByKey,
  identityKeyByBusinessId,
  stateOwnersByKey,
  stateIdentityKeyByBusinessId,
}) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const normalizedAccounts = Array.isArray(accounts) ? accounts : [];
  const canonical = canonicalBusinessIds instanceof Set ? canonicalBusinessIds : new Set();
  const registryOwners = identityOwnerByKey instanceof Map ? identityOwnerByKey : new Map();
  const registryByBusiness = identityKeyByBusinessId instanceof Map ? identityKeyByBusinessId : new Map();
  const stateOwners = stateOwnersByKey instanceof Map ? stateOwnersByKey : new Map();
  const stateByBusiness = stateIdentityKeyByBusinessId instanceof Map ? stateIdentityKeyByBusinessId : new Map();

  const rowNameCount = new Map();
  for (const row of normalizedRows) {
    const name = normalizeCompanyName(row?.displayName);
    if (name) rowNameCount.set(name, (rowNameCount.get(name) ?? 0) + 1);
  }

  const accountsByName = new Map();
  for (const account of normalizedAccounts) {
    if (!account?.businessId || !canonical.has(account.businessId)) continue;
    const name = normalizeCompanyName(account.displayName);
    if (!name) continue;
    const list = accountsByName.get(name) ?? [];
    list.push(account);
    accountsByName.set(name, list);
  }

  const plans = [];
  const rejected = [];
  const usedBusinessIds = new Set();

  for (const row of normalizedRows) {
    const key = identityKey(row?.registrationCountry, row?.registrationType, row?.registrationId);
    const registryOwner = registryOwners.get(key) ?? null;
    const rowStateOwners = [...new Set(stateOwners.get(key) ?? [])];
    const canonicalStateOwners = rowStateOwners.filter((businessId) => canonical.has(businessId));

    if (registryOwner && canonical.has(registryOwner)) continue;
    if (canonicalStateOwners.length === 1) continue;
    if (canonicalStateOwners.length > 1) {
      rejected.push({ rowNumber: row?.rowNumber ?? null, reason: 'multiple_canonical_state_identity_owners' });
      continue;
    }

    const normalizedName = normalizeCompanyName(row?.displayName);
    if (!normalizedName || rowNameCount.get(normalizedName) !== 1) {
      rejected.push({ rowNumber: row?.rowNumber ?? null, reason: 'csv_name_not_unique' });
      continue;
    }

    const candidates = accountsByName.get(normalizedName) ?? [];
    if (candidates.length !== 1) {
      rejected.push({ rowNumber: row?.rowNumber ?? null, reason: candidates.length ? 'crm_name_not_unique' : 'crm_exact_name_not_found' });
      continue;
    }

    const candidate = candidates[0];
    if (usedBusinessIds.has(candidate.businessId)) {
      rejected.push({ rowNumber: row?.rowNumber ?? null, reason: 'crm_business_id_reused_in_batch' });
      continue;
    }

    const registryIdentity = registryByBusiness.get(candidate.businessId) ?? null;
    if (registryIdentity && registryIdentity !== key) {
      rejected.push({ rowNumber: row?.rowNumber ?? null, reason: 'candidate_registry_identity_conflict' });
      continue;
    }

    const stateIdentity = stateByBusiness.get(candidate.businessId) ?? null;
    if (stateIdentity && stateIdentity !== key) {
      rejected.push({ rowNumber: row?.rowNumber ?? null, reason: 'candidate_state_identity_conflict' });
      continue;
    }

    if (!fingerprintsCompatible(row, candidate)) {
      rejected.push({ rowNumber: row?.rowNumber ?? null, reason: 'candidate_public_fingerprint_mismatch' });
      continue;
    }

    usedBusinessIds.add(candidate.businessId);
    plans.push({
      rowNumber: row?.rowNumber ?? null,
      businessId: candidate.businessId,
      registrationCountry: text(row?.registrationCountry).toUpperCase(),
      registrationType: text(row?.registrationType).toUpperCase(),
      registrationId: text(row?.registrationId),
      displayName: text(row?.displayName),
      staleRegistryOwnerBusinessId: registryOwner && !canonical.has(registryOwner) ? registryOwner : null,
      staleStateBusinessIds: rowStateOwners.filter((businessId) => !canonical.has(businessId)),
      reason: registryOwner && !canonical.has(registryOwner)
        ? 'orphan_identity_rebound_by_unique_exact_name'
        : 'unique_exact_name_adoption',
    });
  }

  return { plans, rejected };
}
