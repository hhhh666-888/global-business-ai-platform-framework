Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'

$Root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$Helper=Join-Path $Root 'infrastructure/local-uat/Json-Utf8.Common.ps1'
if(-not (Test-Path -LiteralPath $Helper)){throw "UTF-8 helper missing: $Helper"}
. $Helper

$Dir=Join-Path ([IO.Path]::GetTempPath()) ('gbap-utf8-json-' + [Guid]::NewGuid().ToString('N'))
$Path=Join-Path $Dir 'last-update.json'
$BadPath=Join-Path $Dir 'invalid.json'
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
try {
  $errorText='Capability email.status failed (HTTP 403): 远程服务器返回错误: 已禁止。 Configuración inválida.'
  $record=[ordered]@{
    schemaVersion=1
    status='FAILED'
    installedSha='0123456789abcdef'
    error=$errorText
  }
  Write-GbapUtf8Json $Path $record 10
  $bytes=[IO.File]::ReadAllBytes($Path)
  if($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF){throw 'UTF-8 evidence unexpectedly contains BOM.'}
  $roundTrip=Read-GbapUtf8Json $Path
  if([string]$roundTrip.status -ne 'FAILED'){throw 'UTF-8 JSON status did not round-trip.'}
  if([string]$roundTrip.error -ne $errorText){throw 'UTF-8 JSON localized error did not round-trip exactly.'}

  [IO.File]::WriteAllBytes($BadPath,[byte[]](0x7B,0x22,0x78,0x22,0x3A,0x22,0xFF,0x22,0x7D))
  $invalidRejected=$false
  try { $null=Read-GbapUtf8Json $BadPath } catch {
    if($_.Exception.Message -like 'UTF-8 JSON read failed:*'){ $invalidRejected=$true } else { throw }
  }
  if(-not $invalidRejected){throw 'Invalid UTF-8 evidence was not rejected.'}

  Write-Host 'GBAP_UAT_UTF8_JSON_EVIDENCE=PASS'
  Write-Host 'LOCALIZED_ERROR_ROUNDTRIP=PASS'
  Write-Host 'INVALID_UTF8_FAIL_CLOSED=PASS'
} finally {
  Remove-Item -LiteralPath $Dir -Recurse -Force -ErrorAction SilentlyContinue
}
