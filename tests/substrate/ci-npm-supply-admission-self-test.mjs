import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ensure = readFileSync('infrastructure/ci/ensure-ci-supply.sh', 'utf8');
const snapshot = readFileSync('infrastructure/ci/snapshot-ci-supply.sh', 'utf8');
const refresh = readFileSync('.github/workflows/ci-supply-refresh.yml', 'utf8');
const allowlist = readFileSync('infrastructure/ci/ci-supply-npm-allowlist.tsv', 'utf8');
const governance = readFileSync('docs/architecture/GBAP_CI_GOVERNANCE_v0.9.md', 'utf8');

for (const required of [
  'supply_manifest_version=2',
  'web-dependencies.manifest.tsv',
  'npm_allowlist_sha256',
  'web_dependencies_manifest_sha256',
  'GBAP_CI_SUPPLY_PREAPPROVED_NPM',
  'GBAP_CI_SUPPLY_NPM_ONLY',
]) {
  assert.ok(snapshot.includes(required), `snapshot supply v2 contract missing: ${required}`);
}

for (const required of [
  'CI_SUPPLY_UNADMITTED_WEB_DEPENDENCY',
  'GBAP_CI_WEB_DIRECT_DEPENDENCY_ADMISSION=PASS',
  'npm install --offline',
  'GBAP_CI_SUPPLY_NETWORK_FALLBACK=DISABLED',
  'GBAP_CI_SUPPLY_LEGACY_MANIFEST=1',
]) {
  assert.ok(ensure.includes(required), `ensure supply contract missing: ${required}`);
}

assert.equal(ensure.includes('npm install --cache'), false, 'normal ensure path must not contain an online npm install');
assert.equal(ensure.includes('--allow-network'), false, 'normal ensure path must not expose a network-refresh switch');

for (const required of [
  'push:',
  'branches: [main]',
  'workflow_dispatch:',
  'GITHUB_EVENT_NAME',
  'snapshot-ci-supply.sh --allow-network --npm-only',
  "test \"$GITHUB_REF\" = 'refs/heads/main'",
]) {
  assert.ok(refresh.includes(required), `governed refresh workflow missing: ${required}`);
}

assert.equal(refresh.includes('pull_request:'), false, 'dependency refresh must never trigger from pull_request');

for (const [name, spec] of [
  ['@extend-ai/react-docx', '^0.6.7'],
  ['@js-preview/excel', '^1.7.14'],
  ['pptx-preview', '^1.0.5'],
  ['react-pdf-highlighter', '^6.1.0'],
  ['react-markdown', '^9.0.1'],
  ['jszip', '^3.10.1'],
  ['xlsx', '^0.18.5'],
]) {
  assert.ok(allowlist.includes(`dependency\t${name}\t${spec}`), `missing advance-admitted dependency: ${name}@${spec}`);
}

for (const invariant of [
  'PRIMARY / ONLY ACTIVE self-hosted runner',
  'normal CI cannot use public npm/Docker registry fallback',
  'Production remains NOT AUTHORIZED',
]) {
  assert.ok(governance.includes(invariant), `v0.9 must preserve invariant: ${invariant}`);
}

console.log(JSON.stringify({
  gate: 'CI_NPM_SUPPLY_ADMISSION_V09',
  result: 'PASS',
  normalCiNetworkFallback: 'DISABLED',
  automaticRefreshScope: 'NPM_ONLY_IMAGE_SUPPLY_PRESERVED',
  refreshSource: 'MAIN_OR_EXPLICIT_MANUAL_ONLY',
  manifestVersion: 2,
  advanceAdmittedCount: 7,
}));
