import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gate = readFileSync(
  'docs/architecture/GBAP_TWENTY_V241_SHADOW_UPGRADE_GATE_v0.1.md',
  'utf8',
);
const overlay = readFileSync(
  'infrastructure/local-uat/docker-compose.twenty-v241-shadow.yml',
  'utf8',
);
const runner = readFileSync(
  'infrastructure/local-uat/Invoke-GBAP-TwentyV241ShadowUpgrade.ps1',
  'utf8',
);
const webServer = readFileSync(
  'apps/web/server.mjs',
  'utf8',
);
const uatTest = readFileSync(
  'infrastructure/local-uat/Test-GBAP-UAT.ps1',
  'utf8',
);
const closure = readFileSync(
  'docs/evidence/GBAP_TWENTY_V241_SHADOW_UPGRADE_GATE_C_CLOSURE_2026-09-20.md',
  'utf8',
);

assert.match(gate, /PASS \/ CLOSED \/ GATE D OPEN FOR GOVERNED COMPANY UAT CUTOVER/u);
assert.match(gate, /Candidate B live apply remains Gate E/u);
assert.match(closure, /TWENTY_V241_SHADOW_UPGRADE=PASS/u);
assert.match(closure, /FORMAL_UAT_MUTATION=false/u);
assert.match(closure, /Gate C is \*\*PASS \/ CLOSED\*\*/u);
assert.match(gate, /Gate B2 Candidate B v2\.41 offline rebuild\s+PASS \/ CLOSED/u);
assert.match(gate, /yarn command:prod upgrade:status/u);
assert.match(gate, /formal company UAT mutation\s+NONE/u);

assert.match(overlay, /Dockerfile\.twenty-v2\.41\.0-gbap/u);
assert.match(overlay, /twentycrm\/twenty:v2\.41\.0/u);
assert.match(overlay, /gbap-twenty-v2\.41\.0-shadow/u);
assert.match(overlay, /gbap-twenty-v241-shadow-api/u);
assert.equal(overlay.includes('gbap-local-uat-api'), false);
assert.match(overlay, /ports:\s*!override/u);
assert.match(overlay, /GBAP_SHADOW_TWENTY_PORT/u);
assert.match(overlay, /GBAP_SHADOW_WEB_PORT/u);
assert.match(overlay, /GBAP_ADDITIONAL_GATEWAY_ORIGINS:\s*http:\/\/localhost:\$\{GBAP_SHADOW_WEB_PORT:-8180\},http:\/\/localhost:\$\{GBAP_SHADOW_GATEWAY_PORT:-3130\}/u);

assert.match(runner, /gbap-twenty-v241-shadow/u);
assert.match(runner, /Test-BackupIntegrity/u);
assert.match(runner, /function Wait-Postgres/u);
assert.match(runner, /pg_isready/u);
assert.match(runner, /Wait-Postgres/u);
assert.match(runner, /upgrade:status/u);
assert.match(runner, /ResumeAfterMigration/u);
assert.match(runner, /Invoke-Compose @\('build','web'\)/u);
assert.match(runner, /StatusCode -lt 400/u);
assert.match(runner, /workspaceCurrent/u);
assert.match(runner, /workspaceBehind/u);
assert.match(runner, /workspaceFailed/u);
assert.match(runner, /workspaceTotal/u);
assert.equal(runner.includes("failed[^0-9]*[1-9][0-9]*"), false);
assert.match(runner, /Test-GBAP-UAT\.ps1/u);
assert.match(runner, /formal UAT project fingerprint/iu);
assert.equal(runner.includes('docker system prune'), false);
assert.equal(runner.includes('docker volume rm'), false);
assert.equal(runner.includes('-SkipBackup'), false);

assert.match(webServer, /GBAP_ADDITIONAL_GATEWAY_ORIGINS/u);
assert.doesNotMatch(overlay, /mail|email|oauth/iu);
assert.match(webServer, /registerAdditionalGatewayOrigin/u);
assert.match(webServer, /invalid_additional_gateway_origin/u);

assert.match(uatTest, /\$businessId = \[Guid\]::NewGuid\(\)\.ToString\(\)/u);
assert.equal(uatTest.includes('$businessId = "GBAP-UAT-PERSIST-'), false);
assert.match(uatTest, /Capability '\$Capability' failed \(HTTP \$status\)/u);

for (const required of [
  'ComposeProjectName',
  'ComposeFiles',
  'WebBaseUrl',
  'ApiBaseUrl',
  'TwentyBaseUrl',
]) {
  assert.match(uatTest, new RegExp(required, 'u'));
}

console.log(
  JSON.stringify({
    gate: 'TWENTY_V241_SHADOW_UPGRADE_SOURCE_CONTRACT',
    result: 'PASS',
    companyUatMutationAuthorized: false,
    productionAuthorized: false,
  }),
);
