import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { publicExtractionStatus, publicIngestionCause, publicIngestionDetail } from '../knowledge-status.mjs';

test('Knowledge public diagnostics retain actionable causes while stripping parser internals', () => {
  assert.equal(publicIngestionCause('knowledge_status_failed:tei_unavailable:private-server'), 'EMBEDDING_UNAVAILABLE');
  assert.equal(publicIngestionCause('knowledge_status_retry:request_body_too_large'), 'FILE_SIZE_REJECTED');
  assert.equal(publicIngestionCause('knowledge_status_failed:ragflow_http_401:secret-token'), 'PROCESSING_AUTH_FAILED');
  const result = publicExtractionStatus({ stage: 'NORMALIZED', parser: 'internal-parser', metrics: { pageCount: 44, pagesWithText: 44, pageCoverage: 1, attempts: [{ error: 'private-error-secret' }], credentials: 'secret' } });
  assert.deepEqual(result, { stage: 'NORMALIZED', metrics: { pageCount: 44, pagesWithText: 44, pageCoverage: 1 } });
});

test('Native parsing limits produce actionable public diagnostics without private engine details', () => {
  for (const error of ['document_parse_memory_limit', 'document_parse_storage_limit', 'document_complexity_limit', 'normalized_content_too_large', 'office_output_too_large']) {
    const raw = `knowledge_status_failed:extractor_failed:${error}:secret-token:/private/source`;
    assert.equal(publicIngestionDetail(raw), 'PROCESSING_RESOURCE_LIMIT');
    assert.equal(publicIngestionCause(raw), 'PROCESSING_RESOURCE_LIMIT');
  }
  assert.equal(publicIngestionDetail('extractor_failed:document_parse_timeout:2400s'), 'PROCESSING_SERVICE_TIMEOUT');
});

test('Knowledge diagnostics read legacy schema without mutation or source/credential disclosure', () => {
  const root = mkdtempSync(join(tmpdir(), 'gbap-diagnostics-'));
  const path = join(root, 'fixture.db');
  const db = new DatabaseSync(path);
  try {
    db.exec(`CREATE TABLE knowledge_document(id TEXT,ingestion_state TEXT,current_version_id TEXT,archived_at TEXT,updated_at TEXT,title TEXT);
      CREATE TABLE knowledge_document_version(id TEXT,byte_size INTEGER);
      CREATE TABLE knowledge_ingestion_run(id TEXT,document_version_id TEXT,started_at TEXT,finished_at TEXT,detail TEXT);
      INSERT INTO knowledge_document VALUES('doc-1','FAILED','version-1',NULL,'2026-10-02','private title must not escape');
      INSERT INTO knowledge_document_version VALUES('version-1',17200000);
      INSERT INTO knowledge_ingestion_run VALUES('run-1','version-1','2026-10-02T08:00:00Z','2026-10-02T09:00:00Z','knowledge_status_failed:credential=private-secret');`);
    const beforeColumns = db.prepare('PRAGMA table_info(knowledge_ingestion_run)').all();
    const result = spawnSync(process.execPath, ['apps/api/knowledge-diagnostics.mjs'], { env: { ...process.env, DB_PATH: path }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.counts, [{ state: 'FAILED', count: 1 }]);
    assert.equal(report.documents[0].detail, 'STATUS_CHECK_FAILED');
    assert.equal(report.documents[0].elapsedSeconds, 3600);
    assert.equal(result.stdout.includes('private-secret'), false);
    assert.equal(result.stdout.includes('private title'), false);
    assert.deepEqual(db.prepare('PRAGMA table_info(knowledge_ingestion_run)').all(), beforeColumns);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM knowledge_document').get().count, 1);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});

test('Knowledge diagnostics fail clearly without creating a missing database', () => {
  const root = mkdtempSync(join(tmpdir(), 'gbap-diagnostics-'));
  try {
    const result = spawnSync(process.execPath, ['apps/api/knowledge-diagnostics.mjs'], { env: { ...process.env, DB_PATH: join(root, 'missing.db') }, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).error, 'knowledge_diagnostics_unavailable');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
