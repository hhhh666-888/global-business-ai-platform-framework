$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$restorePath = Resolve-Path 'infrastructure/local-uat/Restore-GBAP-UAT.ps1'
$content = Get-Content -LiteralPath $restorePath -Raw
$start = $content.IndexOf("`$knowledgeVerify = @'")
if ($start -lt 0) { throw 'Could not find literal Knowledge restore verifier here-string.' }
$bodyStart = $content.IndexOf("`n", $start) + 1
$end = $content.IndexOf("`n'@", $bodyStart)
if ($bodyStart -le 0 -or $end -lt 0) { throw 'Could not extract Knowledge restore verifier body.' }
$script = $content.Substring($bodyStart, $end - $bodyStart)
if (-not $script.Contains('db.prepare(`')) { throw 'SQL template-literal opening backtick is missing.' }
if (-not $script.Contains('`).all();')) { throw 'SQL template-literal closing backtick is missing.' }
$temp = Join-Path $env:RUNNER_TEMP ('gbap-knowledge-restore-verifier-' + [Guid]::NewGuid().ToString('N') + '.mjs')
try {
  [IO.File]::WriteAllText($temp, $script, (New-Object Text.UTF8Encoding($false)))
  & node --check $temp
  if ($LASTEXITCODE -ne 0) { throw 'Node syntax check failed for Knowledge restore verifier.' }
  Write-Host 'PASS: Knowledge restore inline Node verifier preserves SQL template-literal quoting and parses as JavaScript.'
} finally {
  Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
}
