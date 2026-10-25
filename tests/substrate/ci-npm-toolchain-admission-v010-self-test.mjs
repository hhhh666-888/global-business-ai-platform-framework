import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const webAllowlist = readFileSync(
  'infrastructure/ci/ci-supply-npm-allowlist.tsv',
  'utf8',
);
const toolchainAllowlist = readFileSync(
  'infrastructure/ci/ci-supply-npm-toolchain-allowlist.tsv',
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
  'docs/architecture/GBAP_CI_GOVERNANCE_v0.10.md',
  'utf8',
);

for (const row of [
  'devDependency\ttwenty-sdk\t2.37.0',
  'devDependency\ttwenty-client-sdk\t2.37.0',
  'devDependency\ttypescript\t5.9.3',
  'devDependency\t@types/node\t24.7.2',
]) {
  assert.ok(
    toolchainAllowlist.includes(row),
    `missing bounded toolchain admission: ${row}`,
  );
}
assert.equal(
  webAllowlist.includes('twenty-sdk'),
  false,
  'v0.10 must not mutate the accepted v0.9 web allowlist during Stage A',
);

for (const required of [
  'NPM_TOOLCHAIN_ALLOWLIST',
  'toolchain_allowlist_sha256',
  'GBAP_CI_SUPPLY_TOOLCHAIN_ALLOWLIST_SHA256',
  'npm install --offline',
  'web-dependencies.manifest.tsv',
  'GBAP_CI_SUPPLY_PREAPPROVED_NPM',
]) {
  assert.ok(
    snapshot.includes(required),
    `snapshot bounded toolchain behavior missing: ${required}`,
  );
}

assert.equal(
  (snapshot.match(/<<'NODE'/gu) ?? []).length,
  1,
  'snapshot script must contain exactly one embedded Node manifest builder',
);
assert.equal(
  (snapshot.match(/supply_manifest_version=2/gu) ?? []).length,
  1,
  'snapshot script must write exactly one manifest-v2 block',
);

for (const required of [
  'NPM_TOOLCHAIN_ALLOWLIST',
  'toolchain_allowlist_sha256',
  'GBAP_CI_TOOLCHAIN_SUPPLY_PENDING_REFRESH=1',
  'CI_SUPPLY_TOOLCHAIN_NOT_REFRESHED',
  'GBAP_CI_TOOLCHAIN_SUPPLY_ADMISSION=PASS',
  'GBAP_CI_SUPPLY_NETWORK_FALLBACK=DISABLED',
  'npm install --offline',
]) {
  assert.ok(
    ensure.includes(required),
    `normal CI fail-closed toolchain behavior missing: ${required}`,
  );
}
assert.equal(
  ensure.includes('--allow-network'),
  false,
  'ordinary ensure path must not expose a network refresh switch',
);

for (const required of [
  'push:',
  'branches: [main]',
  'workflow_dispatch:',
  'ci-supply-npm-toolchain-allowlist.tsv',
  'snapshot-ci-supply.sh --allow-network --npm-only',
  'Bounded toolchain admission manifest: PRESENT',
]) {
  assert.ok(
    refresh.includes(required),
    `governed main refresh behavior missing: ${required}`,
  );
}
assert.equal(
  refresh.includes('pull_request:'),
  false,
  'networked dependency refresh must never run from pull_request',
);

const governanceIsOpen = governance.includes(
  'Status: **REOPENED / CANDIDATE / NOT YET RE-FROZEN**',
);
const governanceIsClosed = governance.includes(
  'Status: **RE-FROZEN / PASS / CLOSED**',
);

assert.equal(
  governanceIsOpen || governanceIsClosed,
  true,
  'v0.10 governance must be in an explicit open or closed lifecycle state',
);
assert.equal(
  governanceIsOpen && governanceIsClosed,
  false,
  'v0.10 governance cannot be simultaneously open and closed',
);

for (const invariant of [
  'ci-supply-npm-toolchain-allowlist.tsv',
  'existing v0.9 web allowlist remains unchanged',
  'one persistent npm cache',
  'npm install --offline only',
  'Twenty v2.37.0',
  'Production = NOT AUTHORIZED',
]) {
  assert.ok(
    governance.includes(invariant),
    `v0.10 governance invariant missing: ${invariant}`,
  );
}

if (governanceIsClosed) {
  for (const closureInvariant of [
    'docs/evidence/GBAP_CI_V0_10_CLOSURE_2026-09-20.md',
    'CI Governance v0.10 = RE-FROZEN / PASS / CLOSED',
    'Candidate B SDK/build supply = ADMITTED',
    'Normal CI network fallback = DISABLED',
  ]) {
    assert.ok(
      governance.includes(closureInvariant),
      `closed v0.10 governance missing closure invariant: ${closureInvariant}`,
    );
  }
}

const retiredCandidatePackagePath = 'providers/twenty-adapter/ai-app/package.json';
assert.equal(
  existsSync(retiredCandidatePackagePath),
  false,
  'retired built-in AI app consumer must remain absent',
);

console.log(
  JSON.stringify({
    gate: 'CI_NPM_TOOLCHAIN_ADMISSION_V010',
    result: 'PASS',
    baseMechanism: 'CI_GOVERNANCE_V09_MANIFEST_V2',
    webAdmissionSourceChanged: false,
    toolchainAdmissionSource: 'SEPARATE_BOUNDED_FILE',
    normalCiNetworkFallback: 'DISABLED',
    refreshSource: 'EXACT_MAIN_OR_EXPLICIT_MANUAL_ONLY',
    retiredBuiltInAiConsumerAbsent: true,
    productionAuthorized: false,
  }),
);
