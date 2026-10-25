import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const ensure = readFileSync('infrastructure/ci/ensure-ci-supply.sh', 'utf8');
const snapshot = readFileSync('infrastructure/ci/snapshot-ci-supply.sh', 'utf8');
const refresh = readFileSync('.github/workflows/ci-supply-refresh.yml', 'utf8');
const additions = readFileSync('infrastructure/ci/ci-supply-npm-security-additions.tsv', 'utf8');
const admission = ensure.split('node - "$WEB_PACKAGE" "$WEB_DEPENDENCY_MANIFEST" <<\'NODE\'\n')[1]?.split('\nNODE')[0];
const builder = snapshot.split("<<'NODE'\n")[1]?.split('\nNODE')[0];
assert.ok(admission && builder, 'executable admission and manifest builder are required');
assert.ok(ensure.includes('check_sha "$NPM_SECURITY_ADDITIONS" "$security_additions_sha256"'));
assert.ok(ensure.includes('GBAP_CI_SECURITY_SUPPLY_PENDING_REFRESH=1'));
assert.ok(refresh.includes("'infrastructure/ci/ci-supply-npm-security-additions.tsv'"));
assert.ok(refresh.includes('snapshot-ci-supply.sh --allow-network --npm-only'));
assert.equal(ensure.includes('npm install --cache'), false);
assert.equal(refresh.includes('pull_request:'), false);
// A feature must not silently invalidate the accepted Dockerfile or base list.
assert.equal(createHash('sha256').update(readFileSync('apps/web/Dockerfile.ci')).digest('hex'), '3edb26c807500d5f7bbeb93fd45e5813bfe6e568822894f3eb5ca35dd3c6307c');
assert.equal(createHash('sha256').update(readFileSync('infrastructure/ci/ci-supply-npm-allowlist.tsv')).digest('hex'), '6aeecefc312e58e94b6451146387e263e572e324a509e27eb4b6bfda9efc02fb');

const root = mkdtempSync(join(tmpdir(), 'gbap-security-admission-'));
try {
  const packagePath = join(root, 'package.json');
  const manifest = join(root, 'manifest.tsv');
  const security = join(root, 'security.tsv');
  const base = join(root, 'base.tsv');
  const toolchain = join(root, 'toolchain.tsv');
  const upgrades = join(root, 'upgrades.tsv');
  for (const file of [base, toolchain, upgrades]) writeFileSync(file, '');
  writeFileSync(security, additions);
  const build = () => spawnSync(process.execPath, ['-', packagePath, base, toolchain, upgrades, security, manifest], { input: builder, encoding: 'utf8' });
  const check = () => spawnSync(process.execPath, ['-', packagePath, manifest], { input: admission, encoding: 'utf8' });
  const oldPackage = { dependencies: { fixture: '1.0.0' } };
  writeFileSync(packagePath, JSON.stringify(oldPackage));
  writeFileSync(manifest, 'dependency\tfixture\t1.0.0\n');
  assert.equal(check().status, 0, 'Stage A accepted package stays usable with the old ledger');
  const newPackage = { dependencies: { fixture: '1.0.0', 'pdfjs-dist': '6.3.289' }, overrides: { dompurify: '3.4.16' } };
  writeFileSync(packagePath, JSON.stringify(newPackage));
  const pending = check(); assert.equal(pending.status, 37); assert.match(pending.stderr, /pdfjs-dist/); assert.match(pending.stderr, /override\tdompurify/);
  writeFileSync(packagePath, JSON.stringify(oldPackage));
  const built = build(); assert.equal(built.status, 0, built.stderr);
  const ledger = readFileSync(manifest, 'utf8');
  for (const line of additions.split('\n').filter(line => line && !line.startsWith('#'))) assert.ok(ledger.includes(line));
  writeFileSync(packagePath, JSON.stringify(newPackage));
  assert.equal(check().status, 0, 'Stage B consumes only exact refreshed specs');
  writeFileSync(packagePath, JSON.stringify({ overrides: { fixture: { dompurify: '3.4.16' } } }));
  const nested = check(); assert.equal(nested.status, 37); assert.match(nested.stderr, /unsupported-nested-override/);
  writeFileSync(packagePath, JSON.stringify(oldPackage));
  for (const invalid of ['dependency\tdompurify\t^3.4.16\n', 'dependency\tunexpected\t1.0.0\n', 'devDependency\tdompurify\t3.4.16\n', 'dependency\tdompurify\tnpm:alias@3.4.16\n']) {
    writeFileSync(security, invalid);
    assert.notEqual(build().status, 0, 'only bounded exact security additions may enter the ledger');
  }
} finally { rmSync(root, { recursive: true, force: true }); }
console.log('PASS: security admission preserves accepted inputs, rejects pending/unsafe consumers, and builds an exact six-spec ledger without a CI network fallback.');
