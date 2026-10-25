import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = mkdtempSync(join(tmpdir(), 'gbap-knowledge-recovery-'));
const live = join(root, 'live');
const backup = join(root, 'backup');
const restored = join(root, 'restored');
const documentId = randomUUID();
const versionId = randomUUID();
const sourceBytes = Buffer.from('GBAP canonical recovery fixture: KNOWLEDGE-RECOVERY-2048.');
const checksum = 'sha256:' + createHash('sha256').update(sourceBytes).digest('hex');

function hash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function walkFiles(base) {
  const out = [];
  function visit(current) {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      const st = statSync(full);
      if (st.isDirectory()) visit(full);
      else out.push(full);
    }
  }
  visit(base);
  return out.sort();
}
function buildManifest(path) {
  const files = walkFiles(path).filter((item) => !item.endsWith('manifest.json')).map((item) => ({
    path: relative(path, item).replaceAll('\\', '/'),
    bytes: statSync(item).size,
    sha256: hash(item),
  }));
  return { schemaVersion: 1, environment: 'gbap-local-uat', knowledgeSourceIncluded: true, knowledgeSourceRoot: '/data/knowledge-source', files };
}
function verifyManifest(path) {
  const manifest = JSON.parse(readFileSync(join(path, 'manifest.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.environment, 'gbap-local-uat');
  assert.equal(manifest.knowledgeSourceIncluded, true);
  for (const file of manifest.files) {
    const full = join(path, ...String(file.path).split('/'));
    assert.ok(existsSync(full), 'missing backup file ' + file.path);
    assert.equal(statSync(full).size, file.bytes, 'size mismatch ' + file.path);
    assert.equal(hash(full), file.sha256, 'hash mismatch ' + file.path);
  }
  return manifest;
}
function verifyCanonicalRecovery(dataRoot) {
  const db = new DatabaseSync(join(dataRoot, 'substrate.db'));
  try {
    const row = db.prepare('SELECT d.id AS document_id, v.id AS version_id, v.content_checksum, v.byte_size, v.storage_path FROM knowledge_document d JOIN knowledge_document_version v ON v.document_id=d.id WHERE d.id=? AND v.id=?').get(documentId, versionId);
    assert.ok(row, 'canonical IDs must survive restore');
    assert.equal(row.document_id, documentId);
    assert.equal(row.version_id, versionId);
    assert.equal(row.content_checksum, checksum);
    assert.equal(row.byte_size, sourceBytes.length);
    assert.equal(row.storage_path, '/data/knowledge-source/' + documentId + '/' + versionId + '.bin');
    const source = join(dataRoot, 'knowledge-source', documentId, versionId + '.bin');
    assert.ok(existsSync(source), 'canonical source bytes must survive restore');
    const bytes = readFileSync(source);
    assert.deepEqual(bytes, sourceBytes);
    assert.equal('sha256:' + createHash('sha256').update(bytes).digest('hex'), row.content_checksum);
  } finally { db.close(); }
}

try {
  mkdirSync(join(live, 'knowledge-source', documentId), { recursive: true });
  writeFileSync(join(live, 'knowledge-source', documentId, versionId + '.bin'), sourceBytes);

  const db = new DatabaseSync(join(live, 'substrate.db'));
  db.exec('CREATE TABLE knowledge_document(id TEXT PRIMARY KEY,current_version_id TEXT); CREATE TABLE knowledge_document_version(id TEXT PRIMARY KEY,document_id TEXT NOT NULL,version INTEGER NOT NULL,content_checksum TEXT NOT NULL,byte_size INTEGER NOT NULL,storage_path TEXT);');
  db.prepare('INSERT INTO knowledge_document(id,current_version_id) VALUES(?,?)').run(documentId, versionId);
  db.prepare('INSERT INTO knowledge_document_version(id,document_id,version,content_checksum,byte_size,storage_path) VALUES(?,?,?,?,?,?)').run(versionId, documentId, 1, checksum, sourceBytes.length, '/data/knowledge-source/' + documentId + '/' + versionId + '.bin');
  db.close();

  mkdirSync(backup, { recursive: true });
  cpSync(join(live, 'substrate.db'), join(backup, 'gbap-substrate.db'));
  cpSync(join(live, 'knowledge-source'), join(backup, 'knowledge-source'), { recursive: true });
  writeFileSync(join(backup, 'README.txt'), 'GBAP Knowledge recovery fixture');
  const manifest = buildManifest(backup);
  writeFileSync(join(backup, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  verifyManifest(backup);

  rmSync(live, { recursive: true, force: true });
  mkdirSync(restored, { recursive: true });
  cpSync(join(backup, 'gbap-substrate.db'), join(restored, 'substrate.db'));
  cpSync(join(backup, 'knowledge-source'), join(restored, 'knowledge-source'), { recursive: true });
  verifyCanonicalRecovery(restored);

  const sourceBackup = join(backup, 'knowledge-source', documentId, versionId + '.bin');
  const original = readFileSync(sourceBackup);
  writeFileSync(sourceBackup, Buffer.concat([original, Buffer.from('tampered')]));
  assert.throws(() => verifyManifest(backup), /size mismatch|hash mismatch/u, 'tampered Knowledge source must be rejected by backup manifest');

  const backupScript = readFileSync('infrastructure/local-uat/Backup-GBAP-UAT.ps1', 'utf8');
  const restoreScript = readFileSync('infrastructure/local-uat/Restore-GBAP-UAT.ps1', 'utf8');
  const hostScript = readFileSync('infrastructure/local-uat/Test-GBAP-Knowledge-HostAdmission.ps1', 'utf8');
  const knowledgeCommonScript = readFileSync('infrastructure/knowledge-runtime/Knowledge-UAT.Common.ps1', 'utf8');
  const knowledgeStartScript = readFileSync('infrastructure/knowledge-runtime/Start-GBAP-Knowledge-UAT.ps1', 'utf8');
  const knowledgeAdapterScript = readFileSync('providers/ragflow-adapter/server.mjs', 'utf8');
  const knowledgeAdapterCompose = readFileSync('infrastructure/knowledge-runtime/docker-compose.adapter.yml', 'utf8');
  const knowledgeNativeApi = readFileSync('apps/api/knowledge-native.mjs', 'utf8');
  const realRecoveryScript = readFileSync('infrastructure/knowledge-runtime/Test-GBAP-Knowledge-Recovery-UAT.ps1', 'utf8');

  for (const marker of ["api:/data/knowledge-source", "knowledgeSourceIncluded = $true", "knowledgeSourceRoot = '/data/knowledge-source'"]) assert.ok(backupScript.includes(marker), 'backup script missing ' + marker);
  for (const marker of ['knowledgeSourceIncluded', 'Restoring canonical Knowledge source files', 'KNOWLEDGE_CANONICAL_RECOVERY', 'knowledge_source_checksum_mismatch']) assert.ok(restoreScript.includes(marker), 'restore script missing ' + marker);
  assert.ok(restoreScript.includes("$knowledgeVerify = @'"), 'Knowledge restore verifier must use a literal single-quoted PowerShell here-string');
  assert.ok(!restoreScript.includes('$knowledgeVerify = @"'), 'Knowledge restore verifier must not use an interpolated double-quoted PowerShell here-string');
  for (const marker of ["'--entrypoint','id','keycloak','-u'", "'--entrypoint','id','keycloak','-g'", "'--entrypoint','chown','keycloak','-R'", '$keycloakMutableEntries', "$keycloakIdentity = $keycloakUid + ':' + $keycloakGid"]) assert.ok(restoreScript.includes(marker), 'Keycloak restore must preserve argv-safe recovery marker ' + marker);
  for (const marker of ['state/install-record.json', 'Rehydrating and verifying installed Knowledge runtime integration', 'Start-GBAP-Knowledge-UAT.ps1', 'PASS restored Knowledge runtime credential bridge and native health']) assert.ok(restoreScript.includes(marker), 'restore script missing Knowledge credential-bridge recovery marker ' + marker);
  for (const marker of ['function Sync-KnowledgeGbapAdapterToken', 'secrets/gbap-adapter-token', '/data/knowledge-runtime/adapter-token', 'PASS GBAP-side Knowledge adapter token provisioned']) assert.ok(knowledgeCommonScript.includes(marker), 'Knowledge common script missing adapter-token reprovision marker ' + marker);
  assert.ok(knowledgeStartScript.includes('Sync-KnowledgeGbapAdapterToken -ProjectRoot $ProjectRoot -RuntimeRoot $RuntimeRoot'), 'Knowledge start must rehydrate GBAP-side adapter token before native health verification');
  assert.ok(knowledgeAdapterScript.includes("RAGFLOW_KEYWORD_SEARCH = (process.env.RAGFLOW_KEYWORD_SEARCH ?? '0') !== '0'"), 'Knowledge adapter must fail safe to retrieval-only mode without an authorized chat model');
  assert.ok(knowledgeAdapterCompose.includes('RAGFLOW_KEYWORD_SEARCH: "0"'), 'Knowledge UAT must disable RAGFlow LLM keyword expansion until a generative model is explicitly authorized');
  for (const marker of ['function normalizeRagflowDocumentError', "new Error('document_not_found')", 'httpStatus: 404']) assert.ok(knowledgeAdapterScript.includes(marker), 'RAGFlow adapter must normalize stale provider document state: ' + marker);
  assert.ok(knowledgeNativeApi.includes('response.status === 404 ? 404'), 'GBAP provider transport must preserve provider not-found semantics for deterministic re-index recovery');
  for (const marker of ['COLOCATION_CANDIDATE', 'DEDICATED_KNOWLEDGE_HOST_REQUIRED', 'RequiredDockerMemoryGiB = 16', 'RequiredFreeDiskGiB = 50', 'Docker Compose']) assert.ok(hostScript.includes(marker), 'host admission script missing ' + marker);
  for (const marker of ['GBAP-RECOVERY-', 'PROVIDER_DATASET_DELETED', 'PASS CANONICAL_RESTORE_ID_SOURCE_CHECKSUM', 'PASS PROVIDER_COLLECTION_RECREATED', 'PASS CANONICAL_DOCUMENT_REINDEXED', 'PASS SEARCH_AND_CANONICAL_CITATION_RECOVERED', 'PASS BASELINE_STATE_RESTORED', 'KNOWLEDGE_RECOVERY_UAT=PASS', 'REAL_COMPANY_KNOWLEDGE=NOT_USED']) assert.ok(realRecoveryScript.includes(marker), 'real recovery UAT script missing ' + marker);
  assert.ok(realRecoveryScript.includes('-SkipSafetyBackup'), 'real recovery UAT orchestrator must use its explicit baseline/proof backups instead of creating redundant nested safety backups');
  for (const marker of ['Wait-KnowledgeReady', 'PASS Knowledge provider READY after GBAP restart', '$BackupScript -SkipRestart | Out-Host', '$StartUatScript -NoBrowser | Out-Host', '$RestoreScript -BackupPath $Path -SkipSafetyBackup -NoBrowser | Out-Host', 'return [string]$path']) assert.ok(realRecoveryScript.includes(marker), 'real recovery UAT script missing startup-race/output-isolation marker ' + marker);
  for (const marker of ['GBAP_API_FAILURE', 'TransientRetries', 'STAGE=CREATE_SYNTHETIC_COLLECTION', 'STAGE=CREATE_SYNTHETIC_DOCUMENT', 'STAGE=VERIFY_SYNTHETIC_SEARCH_BEFORE_BACKUP', 'STAGE=SIMULATE_PROVIDER_DATASET_LOSS', 'STAGE=RECREATE_PROVIDER_COLLECTION', 'STAGE=REINDEX_CANONICAL_DOCUMENT', 'STAGE=VERIFY_SEARCH_AFTER_REINDEX', '$script:RecoveryAdminToken = $token', '$token = $script:RecoveryAdminToken']) assert.ok(realRecoveryScript.includes(marker), 'real recovery UAT script missing diagnostic marker ' + marker);

  console.log(JSON.stringify({ gate: 'KNOWLEDGE_RECOVERY_CONTRACT', result: 'PASS', documentId, versionId, checksum, canonicalIdPreserved: true, canonicalSourceRestored: true, tamperRejected: true }));
} finally {
  rmSync(root, { recursive: true, force: true });
}
