$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Join-Path $env:RUNNER_TEMP ('gbap-knowledge-git-probe-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $root | Out-Null
try {
  git -C $root init | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'fixture git init failed' }

  . (Resolve-Path 'infrastructure/knowledge-runtime/Knowledge-UAT.Common.ps1').Path

  $head = Invoke-KnowledgeGitProbe -RepositoryRoot $root -Arguments @('rev-parse', '--verify', 'HEAD')
  if ($head.ExitCode -eq 0) { throw 'unborn HEAD unexpectedly resolved' }
  if ($head.Output) { throw "unborn HEAD probe leaked output: $($head.Output)" }

  $origin = Invoke-KnowledgeGitProbe -RepositoryRoot $root -Arguments @('remote', 'get-url', 'origin')
  if ($origin.ExitCode -eq 0) { throw 'missing origin unexpectedly resolved' }
  if ($origin.Output) { throw "missing origin probe leaked output: $($origin.Output)" }

  git -C $root remote add origin 'https://github.com/infiniflow/ragflow.git'
  if ($LASTEXITCODE -ne 0) { throw 'fixture origin add failed' }
  $origin = Invoke-KnowledgeGitProbe -RepositoryRoot $root -Arguments @('remote', 'get-url', 'origin')
  if ($origin.ExitCode -ne 0 -or $origin.Output -ne 'https://github.com/infiniflow/ragflow.git') {
    throw 'existing origin probe failed'
  }

  Write-Host 'PASS: Knowledge Git probe tolerates unborn HEAD and missing origin under ErrorActionPreference=Stop.'
} finally {
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
