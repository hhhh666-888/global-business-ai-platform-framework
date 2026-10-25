import test from 'node:test';
import assert from 'node:assert/strict';
import {
  identityKey,
  normalizeCompanyName,
  normalizeComparableUrl,
  planExactIdentityAdoptions,
  resolvedIdentityCoverage,
  shouldFailClosedLegacyAdoption,
} from '../research-identity-adoption-core.mjs';

function maps(overrides = {}) {
  return {
    canonicalBusinessIds: new Set(['acct-1', 'acct-2', 'acct-3']),
    identityOwnerByKey: new Map(),
    identityKeyByBusinessId: new Map(),
    stateOwnersByKey: new Map(),
    stateIdentityKeyByBusinessId: new Map(),
    ...overrides,
  };
}

const baseRow = {
  rowNumber: 2,
  displayName: 'ACME TEXTIL S.A.',
  registrationCountry: 'EC',
  registrationType: 'RUC',
  registrationId: '0990011223001',
  companySnapshot: {
    website: 'https://www.acme.example.ec/',
    linkedinUrl: 'https://www.linkedin.com/company/acme-example/',
  },
};

const baseAccount = {
  businessId: 'acct-1',
  displayName: 'ACME TEXTIL S.A.',
  website: 'https://acme.example.ec',
  linkedinUrl: 'https://linkedin.com/company/acme-example',
};

test('normalizers keep exact-name matching strict while tolerating harmless URL formatting', () => {
  assert.equal(normalizeCompanyName('  Acme Textil   S.A. '), 'ACME TEXTIL S.A.');
  assert.equal(normalizeComparableUrl('https://www.acme.example.ec/'), 'acme.example.ec');
  assert.equal(normalizeComparableUrl('http://acme.example.ec'), 'acme.example.ec');
});

test('unique exact CRM company is safely adopted for an unbound TOP500 RUC', () => {
  const result = planExactIdentityAdoptions({
    rows: [baseRow],
    accounts: [baseAccount],
    ...maps(),
  });
  assert.equal(result.plans.length, 1);
  assert.equal(result.plans[0].businessId, 'acct-1');
  assert.equal(result.plans[0].reason, 'unique_exact_name_adoption');
  assert.equal(result.rejected.length, 0);
});

test('orphan RUC identity may be rebound only when the old owner is not canonical', () => {
  const key = identityKey('EC', 'RUC', baseRow.registrationId);
  const result = planExactIdentityAdoptions({
    rows: [baseRow],
    accounts: [baseAccount],
    ...maps({
      identityOwnerByKey: new Map([[key, 'deleted-acct']]),
      identityKeyByBusinessId: new Map([['deleted-acct', key]]),
    }),
  });
  assert.equal(result.plans.length, 1);
  assert.equal(result.plans[0].staleRegistryOwnerBusinessId, 'deleted-acct');
  assert.equal(result.plans[0].reason, 'orphan_identity_rebound_by_unique_exact_name');
});

test('existing canonical RUC owner is never silently rebound', () => {
  const key = identityKey('EC', 'RUC', baseRow.registrationId);
  const result = planExactIdentityAdoptions({
    rows: [baseRow],
    accounts: [baseAccount],
    ...maps({ identityOwnerByKey: new Map([[key, 'acct-2']]) }),
  });
  assert.equal(result.plans.length, 0);
});

test('duplicate CRM names are rejected instead of guessed', () => {
  const result = planExactIdentityAdoptions({
    rows: [baseRow],
    accounts: [baseAccount, { ...baseAccount, businessId: 'acct-2' }],
    ...maps(),
  });
  assert.equal(result.plans.length, 0);
  assert.equal(result.rejected[0].reason, 'crm_name_not_unique');
});

test('duplicate CSV names are rejected instead of sharing one business id', () => {
  const result = planExactIdentityAdoptions({
    rows: [baseRow, { ...baseRow, rowNumber: 3, registrationId: '0990011223002' }],
    accounts: [baseAccount],
    ...maps(),
  });
  assert.equal(result.plans.length, 0);
  assert.equal(result.rejected.every((item) => item.reason === 'csv_name_not_unique'), true);
});

test('public website mismatch blocks adoption', () => {
  const result = planExactIdentityAdoptions({
    rows: [baseRow],
    accounts: [{ ...baseAccount, website: 'https://different.example.com' }],
    ...maps(),
  });
  assert.equal(result.plans.length, 0);
  assert.equal(result.rejected[0].reason, 'candidate_public_fingerprint_mismatch');
});

test('candidate already bound to another RUC is rejected', () => {
  const otherKey = identityKey('EC', 'RUC', '0999999999001');
  const result = planExactIdentityAdoptions({
    rows: [baseRow],
    accounts: [baseAccount],
    ...maps({ identityKeyByBusinessId: new Map([['acct-1', otherKey]]) }),
  });
  assert.equal(result.plans.length, 0);
  assert.equal(result.rejected[0].reason, 'candidate_registry_identity_conflict');
});

test('legacy migration coverage counts already-bound rows plus safe adoption plans', () => {
  const secondRow = { ...baseRow, rowNumber: 3, displayName: 'SECOND S.A.', registrationId: '0990011223002', companySnapshot: {} };
  const firstKey = identityKey('EC', 'RUC', baseRow.registrationId);
  const coverageMaps = maps({ identityOwnerByKey: new Map([[firstKey, 'acct-1']]) });
  const coverage = resolvedIdentityCoverage({
    rows: [baseRow, secondRow],
    plans: [{ rowNumber: 3, businessId: 'acct-2' }],
    ...coverageMaps,
  });
  assert.equal(coverage, 2);
});

test('same-size legacy CRM fails closed unless every CSV row resolves before adoption', () => {
  assert.equal(shouldFailClosedLegacyAdoption({ rowCount: 500, canonicalAccountCount: 500, resolvedCoverage: 499 }), true);
  assert.equal(shouldFailClosedLegacyAdoption({ rowCount: 500, canonicalAccountCount: 500, resolvedCoverage: 500 }), false);
  assert.equal(shouldFailClosedLegacyAdoption({ rowCount: 500, canonicalAccountCount: 501, resolvedCoverage: 499 }), false);
});
