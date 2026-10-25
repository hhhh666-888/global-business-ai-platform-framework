import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = mkdtempSync(join(tmpdir(), 'gbap-provider-migration-'));
const dbPath = join(root, 'substrate.db');
const db = new DatabaseSync(dbPath);
db.exec(`
PRAGMA foreign_keys=ON;
CREATE TABLE provider_registration (
  id TEXT PRIMARY KEY, component TEXT NOT NULL, version TEXT NOT NULL,
  integration_mode TEXT NOT NULL, endpoint TEXT NOT NULL, environment_scope TEXT NOT NULL,
  organization_scope TEXT, workspace_scope TEXT, lifecycle_owner TEXT NOT NULL,
  replacement_class TEXT NOT NULL, replacement_evidence TEXT NOT NULL, secret_ref TEXT,
  egress_allowlist_json TEXT NOT NULL, timeout_ms INTEGER NOT NULL DEFAULT 3000,
  retry_count INTEGER NOT NULL DEFAULT 0, failure_mode TEXT NOT NULL DEFAULT 'DEGRADE',
  contract_version TEXT, upstream_product TEXT, upstream_version TEXT, upstream_commit TEXT,
  upstream_digest TEXT, adapter_revision TEXT, config_revision TEXT, schema_revision TEXT,
  enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE capability_binding (
  capability TEXT NOT NULL,
  provider_id TEXT NOT NULL REFERENCES provider_registration(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100, enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (capability, provider_id)
) STRICT;
CREATE TABLE audit_event (
  id TEXT PRIMARY KEY, actor_subject TEXT NOT NULL, actor_username TEXT,
  action TEXT NOT NULL, target TEXT NOT NULL, occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;
`);

const now = new Date().toISOString();
const insertProvider = db.prepare(`
  INSERT INTO provider_registration(
    id,component,version,integration_mode,endpoint,environment_scope,
    lifecycle_owner,replacement_class,replacement_evidence,egress_allowlist_json,
    timeout_ms,retry_count,failure_mode,contract_version,upstream_product,
    upstream_version,upstream_digest,adapter_revision,config_revision,schema_revision,
    enabled,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);
function seed(id, component, contractVersion) {
  insertProvider.run(
    id, component, 'v2.37.0', 'HEADLESS_PROVIDER', 'http://twenty-adapter:8091', 'local-uat',
    'GBAP_MANAGED', 'R4', 'E0', '["twenty-adapter"]',
    7000, 0, 'DEGRADE', contractVersion, 'Twenty',
    'v2.37.0', 'sha256:' + '1'.repeat(64), 'old-revision', 'old-config', 'old-schema',
    1, now, now,
  );
}
seed('twenty-crm-uat', 'twenty-crm', 'gbap.crm.v1');
seed('bad-crm-contract', 'twenty-crm', 'gbap.retired-ai.v1');
seed('rogue-provider', 'other-component', 'gbap.crm.v1');
db.prepare('INSERT INTO capability_binding(capability,provider_id,priority,enabled) VALUES(?,?,?,1)')
  .run('crm.v1.account.list','twenty-crm-uat',50);
db.close();

const crmTemplate = JSON.parse(readFileSync('infrastructure/twenty-production/provider-registration.template.json','utf8'));
const provenance = {
  version: 'v2.41.0',
  upstreamVersion: 'v2.41.0',
  upstreamImageDigest: 'sha256:' + 'a'.repeat(64),
  adapterRevision: 'fixture-head',
  configRevision: 'fixture-v2.41.0',
  schemaRevision: 'fixture-v2.41.0',
};

function run(script, providerId, payload, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [script, providerId], {
    cwd: process.cwd(),
    env: { ...process.env, DB_PATH: dbPath },
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  assert.equal(result.status, expectedStatus, `${script} ${providerId}\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  return `${result.stdout}\n${result.stderr}`;
}
function runPlan(planDbPath, expectedStatus = 0) {
  const result = spawnSync(process.execPath, ['apps/api/plan-provider-migration-snapshot.mjs'], {
    cwd: process.cwd(), env: { ...process.env, DB_PATH: planDbPath }, encoding: 'utf8',
  });
  assert.equal(result.status, expectedStatus, `snapshot-plan\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  return expectedStatus === 0 ? result.stdout.trim() : `${result.stdout}\n${result.stderr}`;
}

const emptyRegistryPath = join(root, 'legacy-empty-provider-registry.db');
{
  const legacy = new DatabaseSync(emptyRegistryPath);
  legacy.exec('CREATE TABLE provider_registration (id TEXT PRIMARY KEY, component TEXT NOT NULL, contract_version TEXT) STRICT;');
  legacy.close();
}
const emptyPlan = JSON.parse(runPlan(emptyRegistryPath));
assert.deepEqual(emptyPlan.plan.map((item) => [item.id, item.action]), [['twenty-crm-uat', 'BOOTSTRAP_REQUIRED']]);

const preRegistryPath = join(root, 'legacy-before-provider-registry.db');
{
  const legacy = new DatabaseSync(preRegistryPath);
  legacy.exec('CREATE TABLE unrelated_state (id TEXT PRIMARY KEY) STRICT;');
  legacy.close();
}
const preRegistryPlan = JSON.parse(runPlan(preRegistryPath));
assert.equal(preRegistryPlan.providerTablePresent, false);
assert.deepEqual(preRegistryPlan.plan.map((item) => [item.id, item.action]), [['twenty-crm-uat', 'BOOTSTRAP_REQUIRED']]);

const conflictRegistryPath = join(root, 'legacy-conflicting-provider-registry.db');
{
  const legacy = new DatabaseSync(conflictRegistryPath);
  legacy.exec('CREATE TABLE provider_registration (id TEXT PRIMARY KEY, component TEXT NOT NULL, contract_version TEXT) STRICT;');
  legacy.prepare('INSERT INTO provider_registration(id,component,contract_version) VALUES(?,?,?)')
    .run('legacy-twenty-crm', 'twenty-crm', 'gbap.crm.v1');
  legacy.close();
}
assert.match(runPlan(conflictRegistryPath, 1), /provider_identity_conflict/u);

const firstCapabilities = run('apps/api/migrate-provider-capabilities.mjs', 'twenty-crm-uat', crmTemplate.capabilities);
assert.match(firstCapabilities, /"status":"UPDATED"/u);
assert.match(run('apps/api/migrate-provider-capabilities.mjs', 'twenty-crm-uat', crmTemplate.capabilities), /"status":"UNCHANGED"/u);
assert.match(run('apps/api/migrate-provider-runtime-provenance.mjs', 'twenty-crm-uat', provenance), /"status":"UPDATED"/u);
assert.match(run('apps/api/migrate-provider-runtime-provenance.mjs', 'twenty-crm-uat', provenance), /"status":"UNCHANGED"/u);

assert.match(
  run('apps/api/migrate-provider-capabilities.mjs', 'bad-crm-contract', crmTemplate.capabilities, 1),
  /provider_contract_version_mismatch/u,
);
assert.match(
  run('apps/api/migrate-provider-capabilities.mjs', 'rogue-provider', crmTemplate.capabilities, 1),
  /unexpected_provider_component/u,
);

const verify = new DatabaseSync(dbPath, { readOnly: true });
const provider = verify.prepare('SELECT * FROM provider_registration WHERE id=?').get('twenty-crm-uat');
assert.equal(provider.version, 'v2.41.0');
assert.equal(provider.upstream_version, 'v2.41.0');
assert.equal(provider.upstream_digest, provenance.upstreamImageDigest);
const audit = verify.prepare('SELECT action,target FROM audit_event ORDER BY occurred_at').all();
assert.ok(audit.some((row) => row.action === 'provider.capabilities.update' && row.target === 'provider:twenty-crm-uat'));
assert.ok(audit.some((row) => row.action === 'provider.runtime-provenance.update' && row.target === 'provider:twenty-crm-uat'));
verify.close();
rmSync(root, { recursive: true, force: true });

console.log(JSON.stringify({
  gate: 'GBAP_STATEFUL_PROVIDER_MIGRATION_MATRIX',
  result: 'PASS',
  profiles: ['twenty-crm/gbap.crm.v1'],
  builtInAiProviderRequired: false,
  idempotency: true,
  legacyProviderBootstrapPlanning: true,
  providerIdentityConflictRejected: true,
  rogueProviderRejected: true,
}));
