import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const baseAllowlist = readFileSync(
  'infrastructure/ci/ci-supply-npm-toolchain-allowlist.tsv',
  'utf8',
);
const upgradeAllowlist = readFileSync(
  'infrastructure/ci/ci-supply-npm-toolchain-upgrade-additions.tsv',
  'utf8',
);
const snapshot = readFileSync(
  'infrastructure/ci/snapshot-ci-supply.sh',
  'utf8',
);
const ensure = readFileSync(
  'infrastructure/ci/ensure-ci-supply.sh',
  'utf8',
);
const refresh = readFileSync(
  '.github/workflows/ci-supply-refresh.yml',
  'utf8',
);
const governance = readFileSync(
  'docs/architecture/GBAP_CI_GOVERNANCE_v0.11.md',
  'utf8',
);
for (const row of [
  'devDependency\ttwenty-sdk\t2.37.0',
  'devDependency\ttwenty-client-sdk\t2.37.0',
  'devDependency\ttypescript\t5.9.3',
  'devDependency\t@types/node\t24.7.2',
]) {
  assert.ok(
    baseAllowlist.includes(row),
    `v0.11 must not rewrite frozen v0.10 base admission: ${row}`,
  );
}

for (const row of [
  'devDependency\ttwenty-sdk\t2.41.0',
  'devDependency\ttwenty-client-sdk\t2.41.0',
]) {
  assert.ok(
    upgradeAllowlist.includes(row),
    `missing exact Twenty v2.41 additive admission: ${row}`,
  );
}

for (const forbidden of [
  'twenty-sdk\tlatest',
  'twenty-sdk\t^2.41.0',
  'twenty-client-sdk\t^2.41.0',
]) {
  assert.equal(
    upgradeAllowlist.includes(forbidden),
    false,
    `upgrade supply must remain exact: ${forbidden}`,
  );
}

for (const required of [
  'NPM_TOOLCHAIN_UPGRADE_ALLOWLIST',
  'CI_SUPPLY_NPM_TOOLCHAIN_UPGRADE_ALLOWLIST',
  'toolchain_upgrade_allowlist_sha256',
  'GBAP_CI_SUPPLY_TOOLCHAIN_UPGRADE_ALLOWLIST_SHA256',
]) {
  assert.ok(snapshot.includes(required), `snapshot missing v0.11 contract: ${required}`);
}

for (const required of [
  'NPM_TOOLCHAIN_UPGRADE_ALLOWLIST',
  'toolchain_upgrade_allowlist_sha256',
  'GBAP_CI_TOOLCHAIN_UPGRADE_SUPPLY_ADMISSION=PASS',
  'GBAP_CI_TOOLCHAIN_UPGRADE_SUPPLY_PENDING_REFRESH=1',
  'CI_SUPPLY_TOOLCHAIN_UPGRADE_NOT_REFRESHED',
  'GBAP_CI_TOOLCHAIN_UPGRADE_SUPPLY_ADMITTED=',
  'GBAP_CI_SUPPLY_NETWORK_FALLBACK=DISABLED',
]) {
  assert.ok(ensure.includes(required), `ensure missing v0.11 fail-closed contract: ${required}`);
}

assert.equal(ensure.includes('--allow-network'), false);
assert.equal(refresh.includes('pull_request:'), false);

const governanceIsOpen = governance.includes(
  'Status: **REOPENED / CANDIDATE / NOT YET RE-FROZEN**',
);
const governanceIsClosed = governance.includes(
  'Status: **RE-FROZEN / PASS / CLOSED**',
);

assert.equal(
  governanceIsOpen || governanceIsClosed,
  true,
  'v0.11 governance must have an explicit lifecycle state',
);
assert.equal(
  governanceIsOpen && governanceIsClosed,
  false,
  'v0.11 cannot be both open and closed',
);

assert.equal(
  existsSync('providers/twenty-adapter/ai-app/package.json'),
  false,
  'retired built-in AI app consumer must remain absent',
);

if (governanceIsClosed) {
  assert.equal(
    existsSync('docs/evidence/GBAP_CI_V0_11_CLOSURE_2026-09-20.md'),
    true,
    'closed v0.11 must have closure evidence',
  );
  for (const witness of [
    'Refresh #5',
    '35505913676',
    'GBAP_CI_TOOLCHAIN_UPGRADE_SUPPLY_ADMISSION=PASS',
    'GBAP_CI_SUPPLY_NETWORK_FALLBACK=DISABLED',
  ]) {
    assert.ok(governance.includes(witness), `closed v0.11 missing witness: ${witness}`);
  }
}

console.log(
  JSON.stringify({
    gate: 'CI_NPM_TOOLCHAIN_UPGRADE_ADMISSION_V011',
    result: 'PASS',
    status: governanceIsClosed ? 'CLOSED' : 'OPEN',
    baseToolchainPreserved: true,
    sdk241Admitted: true,
    retiredBuiltInAiConsumerAbsent: true,
    normalCiNetworkFallback: 'DISABLED',
    productionAuthorized: false,
  }),
);
