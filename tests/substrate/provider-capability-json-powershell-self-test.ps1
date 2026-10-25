Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'

$Root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$CrmTemplatePath=Join-Path $Root 'infrastructure/twenty-production/provider-registration.template.json'

function Convert-CapabilityArrayJson([object[]]$Capabilities,[string]$ProviderId){
  $items=@($Capabilities)
  if($items.Count -lt 1){throw "Provider capability payload is empty: $ProviderId"}
  $json=ConvertTo-Json -InputObject $items -Depth 10 -Compress
  if(-not $json.TrimStart().StartsWith('[')){
    throw "Provider capability payload lost array shape: $ProviderId"
  }
  return $json
}

$crmObjects=@((Get-Content -LiteralPath $CrmTemplatePath -Raw | ConvertFrom-Json).capabilities)
$singleObjects=@($crmObjects | Select-Object -First 1)

if($crmObjects.Count -le 1){throw "Expected multi-capability CRM fixture; actual=$($crmObjects.Count)"}
if($singleObjects.Count -ne 1){throw "Expected synthetic single-capability fixture; actual=$($singleObjects.Count)"}

$crmJson=Convert-CapabilityArrayJson $crmObjects 'twenty-crm-uat'
$singleJson=Convert-CapabilityArrayJson $singleObjects 'single-capability-regression-fixture'

if(-not $crmJson.TrimStart().StartsWith('[')){throw 'CRM capability JSON is not an array.'}
if(-not $singleJson.TrimStart().StartsWith('[')){throw 'Single capability JSON is not an array.'}

$crmParsed=@($crmJson | ConvertFrom-Json)
$singleParsed=@($singleJson | ConvertFrom-Json)
if($crmParsed.Count -ne $crmObjects.Count){throw 'CRM capability JSON count changed during serialization.'}
if($singleParsed.Count -ne 1){throw 'Single-capability JSON array did not round-trip.'}
if([string]$singleParsed[0].name -ne [string]$singleObjects[0].name -or [int]$singleParsed[0].priority -ne [int]$singleObjects[0].priority){
  throw 'Single-capability JSON content drifted.'
}

Write-Host 'GBAP_PROVIDER_CAPABILITY_JSON_POWERSHELL=PASS'
Write-Host "CRM_CAPABILITY_COUNT=$($crmParsed.Count)"
Write-Host "SINGLE_CAPABILITY_COUNT=$($singleParsed.Count)"
