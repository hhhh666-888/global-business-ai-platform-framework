import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const compose = readFileSync('infrastructure/local-uat/docker-compose.yml', 'utf8');
const apiServer = readFileSync('apps/api/server.mjs', 'utf8');
const providerTemplate = JSON.parse(readFileSync('infrastructure/twenty-production/provider-registration.template.json', 'utf8'));
const start = readFileSync('infrastructure/local-uat/Start-GBAP-UAT.ps1', 'utf8');
const stop = readFileSync('infrastructure/local-uat/Stop-GBAP-UAT.ps1', 'utf8');
const uatTest = readFileSync('infrastructure/local-uat/Test-GBAP-UAT.ps1', 'utf8');
const providerBootstrap = readFileSync('infrastructure/local-uat/Register-GBAP-UAT-TwentyProviders.ps1', 'utf8');
const retireProviders = readFileSync('infrastructure/local-uat/Retire-GBAP-RetiredProviders.ps1', 'utf8');
const sync = readFileSync('infrastructure/local-uat/Sync-GBAP-UAT-TwentyProvider.ps1', 'utf8');
const update = readFileSync('infrastructure/local-uat/Update-GBAP-UAT.ps1', 'utf8');
const migrationPreflight = readFileSync('infrastructure/local-uat/Test-GBAP-UAT-ProviderMigrationPreflight.ps1', 'utf8');
const migrationSnapshotPlan = readFileSync('apps/api/plan-provider-migration-snapshot.mjs', 'utf8');
const migrationProfile = readFileSync('apps/api/provider-migration-profile.mjs', 'utf8');
const cutover = readFileSync('infrastructure/local-uat/Invoke-GBAP-TwentyV241CompanyUatCutover.ps1', 'utf8');
const rollback = readFileSync('infrastructure/local-uat/Rollback-GBAP-TwentyV241CompanyUatCutover.ps1', 'utf8');

assert.match(compose, /GBAP_TWENTY_RUNTIME_IMAGE:-gbap-twenty-v2\.41\.0/u);
assert.match(compose, /GBAP_TWENTY_DOCKERFILE:-infrastructure\/twenty-production\/Dockerfile\.twenty-v2\.41\.0-gbap/u);
assert.match(compose, /GBAP_TWENTY_BASE_IMAGE:-twentycrm\/twenty:v2\.41\.0/u);
assert.doesNotMatch(compose, /AI_PROVIDERS|twenty-ai-bridge|gbap-ai-bridge|TWENTY_AI_REQUEST_TIMEOUT/u);

assert.match(start, /GBAP_TWENTY_RUNTIME_VERSION = 'v2\.41\.0'/u);
assert.match(start, /Register-GBAP-UAT-TwentyProviders\.ps1/u);
assert.match(start, /Retire-GBAP-RetiredProviders\.ps1/u);
assert.match(start, /twenty-crm-uat/u);
assert.doesNotMatch(start, /Sync-GBAP-UAT-TwentyAiProvider|\$aiProvider/u);
assert.match(start, /Install-GBAP-Knowledge-UAT\.ps1/u);
assert.match(start, /Start-GBAP-Knowledge-UAT\.ps1/u);
assert.match(start, /Get-TwentyBuildRequired/u);
assert.match(start, /PASS reusing existing Twenty runtime image/u);
assert.match(start, /Could not evaluate Twenty runtime build freshness safely/u);
assert.match(start, /Invoke-Compose @\('build','identity-admin','api','worker','web','twenty-adapter'\)/u);
assert.match(start, /Invoke-Compose @\('up','-d','--no-deps','twenty-adapter'\)/u);
assert.doesNotMatch(start, /Invoke-Compose @\('up','-d','--build','twenty-adapter'\)/u);
assert.doesNotMatch(start, /'run','--rm','--no-deps','--build','--user','0:0','--entrypoint','chown','twenty-server'/u);
assert.doesNotMatch(start, /Invoke-Compose @\('up','-d','--build','--remove-orphans'/u);
assert.match(stop, /Stop-GBAP-Knowledge-UAT\.ps1/u);
assert.match(uatTest, /crm_company_list/u);
assert.match(uatTest, /knowledge_search/u);

assert.match(providerBootstrap, /provider-registration\.template\.json/u);
assert.match(providerBootstrap, /Register-ProviderFromTemplate 'twenty-crm-uat'/u);
assert.match(providerBootstrap, /gbap\.crm\.v1/u);
assert.doesNotMatch(providerBootstrap, /twenty-crm-ai|gbap\.crm-ai|ai-provider-registration/u);

assert.match(retireProviders, /twenty-crm-ai-uat/u);
assert.match(retireProviders, /ragflow-agent-uat/u);
assert.match(retireProviders, /"enabled":false/u);
assert.match(retireProviders, /twenty-mail-calendar-user-uat/u);

assert.match(sync, /migrate-provider-runtime-provenance\.mjs twenty-crm-uat/u);
assert.match(sync, /PASS Twenty UAT provider provenance matches runtime/u);
assert.match(sync, /Required CRM runtime capability/u);
assert.match(sync, /GBAP-governed CRM read path/u);
assert.doesNotMatch(sync, /Required Stage 3\.5 capability|crm\.ops\.v1\.email\.status|principal permission bootstrap/u);
assert.match(apiServer, /'crm\.meta\.v1\.permission\.check'/u);
assert.match(apiServer, /retired_capability_not_allowed/u);
const canonicalCapabilityNames = new Set(providerTemplate.capabilities.map((item) => item.name));
for (const retired of [
  'crm.meta.v1.permission.check',
  'crm.meta.v1.record.communication',
  'crm.ops.v1.email.status',
  'crm.ops.v1.email.list',
  'crm.ops.v1.calendar.status',
  'crm.ops.v1.calendar.list',
]) {
  assert.equal(canonicalCapabilityNames.has(retired), false, `retired capability must stay out of canonical CRM provider: ${retired}`);
}
assert.ok(migrationProfile.includes("'twenty-crm'"));
assert.ok(migrationProfile.includes("'gbap.crm.v1'"));
assert.doesNotMatch(migrationProfile, /twenty-crm-ai|CRM_AI/u);

assert.match(update, /Test-GBAP-UAT-ProviderMigrationPreflight\.ps1/u);
assert.match(update, /providerMigrationPreflight = 'PASS'/u);
assert.match(migrationPreflight, /gbap-substrate\.db/u);
assert.match(migrationPreflight, /twenty-crm-uat/u);
assert.doesNotMatch(migrationPreflight, /twenty-crm-ai-uat|gbap\.crm-ai/u);
assert.match(migrationPreflight, /PRAGMA integrity_check/u);
assert.match(migrationPreflight, /PRAGMA foreign_key_check/u);
assert.match(migrationPreflight, /GBAP_STATEFUL_PROVIDER_MIGRATION_PREFLIGHT=PASS/u);
assert.match(migrationSnapshotPlan, /twenty-crm-uat/u);
assert.doesNotMatch(migrationSnapshotPlan, /twenty-crm-ai-uat|gbap\.crm-ai/u);

assert.match(cutover, /GBAP_TWENTY_RUNTIME_VERSION = 'v2\.41\.0'/u);
assert.match(cutover, /TWENTY_V241_COMPANY_UAT_CUTOVER=PASS/u);
assert.equal(cutover.includes('docker system prune'), false);
assert.equal(cutover.includes('docker volume rm'), false);
assert.equal(cutover.includes('twenty apply'), false);

assert.match(rollback, /Restore-GBAP-UAT\.ps1/u);
assert.match(rollback, /TWENTY_V241_COMPANY_UAT_ROLLBACK=PASS/u);
assert.equal(rollback.includes('docker system prune'), false);
assert.equal(rollback.includes('docker volume rm'), false);
assert.equal(rollback.includes('git reset --hard'), false);

console.log(JSON.stringify({
  gate: 'TWENTY_V241_COMPANY_UAT_CUTOVER_SOURCE_CONTRACT',
  result: 'PASS',
  freshInstallBaseline: 'v2.41.0',
  statefulProviderMigrationPreflightRequired: true,
  canonicalCrmProviderOnly: true,
  builtInAiProvidersRetired: true,
  mailProvidersRetired: true,
  crmAndKnowledgeLifecycleUnified: true,
  mcpRuntimeProofRequired: true,
  productionAuthorized: false,
}));
