import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const roots = [
  'infrastructure/local-uat',
  'infrastructure/knowledge-runtime',
];

const forbidden = [
  { name: 'ConvertFrom-Json -Depth', re: /ConvertFrom-Json\b[^\r\n]*-Depth\b/iu },
  { name: 'ConvertFrom-Json -AsHashtable', re: /ConvertFrom-Json\b[^\r\n]*-AsHashtable\b/iu },
  { name: 'ConvertFrom-Json -NoEnumerate', re: /ConvertFrom-Json\b[^\r\n]*-NoEnumerate\b/iu },
  { name: 'ConvertFrom-Json -DateKind', re: /ConvertFrom-Json\b[^\r\n]*-DateKind\b/iu },
  { name: 'ConvertTo-Json -EscapeHandling', re: /ConvertTo-Json\b[^\r\n]*-EscapeHandling\b/iu },
  { name: 'ForEach-Object -Parallel', re: /ForEach-Object\b[^\r\n]*-Parallel\b/iu },
  { name: 'Invoke-* -SkipHttpErrorCheck', re: /Invoke-(?:WebRequest|RestMethod)\b[^\r\n]*-SkipHttpErrorCheck\b/iu },
  { name: 'Get-Content -AsByteStream', re: /Get-Content\b[^\r\n]*-AsByteStream\b/iu },
  { name: 'Test-Json', re: /(^|[^A-Za-z0-9_-])Test-Json\b/iu },
  { name: 'Join-String', re: /(^|[^A-Za-z0-9_-])Join-String\b/iu },
  { name: 'Get-Error', re: /(^|[^A-Za-z0-9_-])Get-Error\b/iu },
  { name: 'ConvertFrom-SecureString -AsPlainText', re: /ConvertFrom-SecureString\b[^\r\n]*-AsPlainText\b/iu },
  { name: 'Bash-style trailing backslash continuation', re: /\\\s*$/u },
];

function walk(root) {
  const result = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) result.push(...walk(path));
    else if (path.toLowerCase().endsWith('.ps1')) result.push(path);
  }
  return result;
}

const violations = [];
const files = roots.flatMap(walk);
for (const path of files) {
  const source = readFileSync(path, 'utf8');
  const lines = source.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    for (const rule of forbidden) {
      if (rule.re.test(line)) {
        violations.push({
          file: relative('.', path).replaceAll('\\', '/'),
          line: index + 1,
          rule: rule.name,
          source: trimmed,
        });
      }
    }
  }
}

assert.deepEqual(
  violations,
  [],
  `Windows PowerShell 5.1 runtime incompatibilities detected:\n${JSON.stringify(violations, null, 2)}`,
);

console.log(JSON.stringify({
  gate: 'GBAP_WINDOWS_POWERSHELL_51_RUNTIME_CONTRACT',
  result: 'PASS',
  scannedPowerShellFiles: files.length,
  roots,
}));
