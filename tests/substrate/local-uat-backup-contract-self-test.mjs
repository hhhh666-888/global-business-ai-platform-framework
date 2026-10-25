import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const backup = readFileSync('infrastructure/local-uat/Backup-GBAP-UAT.ps1', 'utf8');

assert.doesNotMatch(backup, /function Remove-TwentyTransientBuildState/);
assert.doesNotMatch(backup, /--entrypoint','sh','twenty-server','-c',\$twentyTransientCleanup/);

const cleanupMarker = "[GBAP UAT] Removing transient Twenty logic-function build staging before snapshot copy...";
const cleanupIndex = backup.indexOf(cleanupMarker);
const cleanupRunIndex = backup.indexOf("Invoke-Compose @('run','--rm','--no-deps','--entrypoint','node','twenty-server','--input-type=module','-e',$twentyTransientCleanup)");
const copyIndex = backup.indexOf("Invoke-Compose @('cp','twenty-server:/app/packages/twenty-server/.local-storage'");
const manifestIndex = backup.indexOf('$files = @(Get-BackupFileMetadata $target)');

assert.ok(cleanupIndex >= 0, 'Twenty transient cleanup marker must exist');
assert.ok(cleanupRunIndex > cleanupIndex, 'cleanup must execute through Node inside the Twenty container');
assert.ok(copyIndex > cleanupRunIndex, 'Twenty local storage must be copied only after Linux-side transient cleanup');
assert.ok(manifestIndex > copyIndex, 'manifest hashing must happen after the cleaned snapshot is copied');

assert.match(backup, /process\.env\.GBAP_TWENTY_STORAGE_ROOT \|\| '\/app\/packages\/twenty-server\/\.local-storage'/);
assert.match(backup, /rmSync\(pending, \{ recursive: true, force: true \}\)/);
assert.match(backup, /twentyTransientBuildStateExcluded = \$true/);
assert.match(backup, /Does NOT contain .*transient Twenty built-logic-function\/\.pending compiler staging/);

const embedded = backup.match(/\$twentyTransientCleanup = @'\r?\n([\s\S]*?)\r?\n'@/);
assert.ok(embedded, 'embedded Twenty transient cleanup JavaScript must be discoverable');
const cleanupScript = embedded[1];

const root = mkdtempSync(join(tmpdir(), 'gbap-twenty-backup-cleanup-'));
try {
  const appRoot = join(root, 'workspace-a', 'app-a', 'built-logic-function');
  const pending = join(appRoot, '.pending');
  mkdirSync(join(pending, 'build-a', 'src'), { recursive: true });
  symlinkSync(join(root, 'missing-target'), join(pending, 'build-a', 'src', 'logic-functions'));
  writeFileSync(join(appRoot, 'stable-runtime.js'), 'keep-me');

  const run = spawnSync(process.execPath, ['--input-type=module', '-e', cleanupScript], {
    env: { ...process.env, GBAP_TWENTY_STORAGE_ROOT: root },
    encoding: 'utf8',
  });

  assert.equal(run.status, 0, `cleanup failed:\nSTDOUT:\n${run.stdout}\nSTDERR:\n${run.stderr}`);
  assert.equal(existsSync(pending), false, 'transient .pending tree with dangling symlink must be removed');
  assert.equal(existsSync(join(appRoot, 'stable-runtime.js')), true, 'stable Twenty local-storage output must be preserved');
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('PASS: Local UAT backup removes only Twenty transient logic-function staging with the exact embedded Node cleanup before Windows snapshot copy.');
