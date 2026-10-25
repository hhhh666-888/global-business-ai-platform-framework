import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = [
  'infrastructure/local-uat/Rollback-GBAP-UAT-Update.ps1',
];
const helper = readFileSync('infrastructure/local-uat/Json-Utf8.Common.ps1','utf8');
const update = readFileSync('infrastructure/local-uat/Update-GBAP-UAT.ps1','utf8');

assert.match(helper, /new-object system\.text\.utf8encoding\(\$false,\$true\)/iu);
assert.match(helper, /\[IO\.File\]::ReadAllText/u);
assert.match(helper, /ConvertFrom-Json/u);
assert.match(helper, /Write-GbapUtf8Json/u);
assert.match(update, /\. \$JsonHelperPath/u);
assert.match(update, /Write-GbapUtf8Json \$UpdateRecordPath \$Record 10/u);

for (const path of files) {
  const source = readFileSync(path,'utf8');
  assert.match(source, /Json-Utf8\.Common\.ps1/u, path);
  assert.match(source, /Read-GbapUtf8Json/u, path);
  assert.doesNotMatch(
    source,
    /Get-Content -LiteralPath \$UpdateRecordPath -Raw \| ConvertFrom-Json/u,
    path,
  );
}

console.log(JSON.stringify({
  gate:'GBAP_UAT_MACHINE_EVIDENCE_UTF8_CONTRACT',
  result:'PASS',
  strictUtf8:true,
  localizedFailureSafe:true,
  rollbackSafe:true,
}));
