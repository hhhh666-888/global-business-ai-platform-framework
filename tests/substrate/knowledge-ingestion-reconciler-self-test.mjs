import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = mkdtempSync(join(tmpdir(), 'gbap-knowledge-reconciler-'));
const dbPath = join(root, 'substrate.db');
const tokenPath = join(root, 'adapter-token');
writeFileSync(tokenPath, 'reconciler-secret\n');

process.env.DB_PATH = dbPath;
process.env.SUBSTRATE_ENV = 'local';
process.env.KNOWLEDGE_SOURCE_ROOT = join(root, 'knowledge-source');

const port = 29321;
let calls = 0;
let failStatus = false;
let onStatus = null;
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
  assert.equal(req.headers['x-gbap-provider-token'], 'reconciler-secret');
  assert.equal(body.capability, 'knowledge.v1.document.status');
  assert.equal(body.payload.providerCollectionId, 'dataset-1');
  calls += 1;
  onStatus?.();
  if (failStatus) {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'tei_unavailable:internal-diagnostic-do-not-expose' }));
    return;
  }
  const result = body.payload.providerDocumentId === 'extractor:job-1'
    ? {
        state: 'INDEXING',
        detail: 'normalized_handoff_started',
        record: { externalType: 'document', externalId: 'doc-real-1', title: 'Manual' },
        extraction: { parser: 'OPENDATALOADER_LOCAL', stage: 'NORMALIZED' },
      }
    : {
        state: 'READY',
        detail: null,
        chunkCount: 7,
        tokenCount: 1500,
      };
  const raw = JSON.stringify(result);
  res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(raw) });
  res.end(raw);
});
await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

try {
  const moduleUrl = pathToFileURL(join(process.cwd(), 'apps/api/knowledge-native.mjs'));
  moduleUrl.searchParams.set('test', String(Date.now()));
  const { reconcileKnowledgeIngestionBatch } = await import(moduleUrl.href);

  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE provider_registration (
      id TEXT PRIMARY KEY,
      endpoint TEXT NOT NULL,
      environment_scope TEXT NOT NULL,
      organization_scope TEXT,
      workspace_scope TEXT,
      enabled INTEGER NOT NULL,
      contract_version TEXT,
      egress_allowlist_json TEXT NOT NULL,
      secret_ref TEXT,
      timeout_ms INTEGER NOT NULL,
      retry_count INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE capability_binding (
      capability TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      priority INTEGER NOT NULL,
      enabled INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE external_mapping (
      id TEXT PRIMARY KEY,
      business_type TEXT NOT NULL,
      business_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      external_type TEXT NOT NULL,
      external_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;
  `);

  const at = new Date().toISOString();
  db.prepare(`INSERT INTO provider_registration(
    id,endpoint,environment_scope,organization_scope,workspace_scope,enabled,
    contract_version,egress_allowlist_json,secret_ref,timeout_ms,retry_count
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
    'knowledge-ragflow-uat',
    `http://127.0.0.1:${port}`,
    'local',
    null,
    null,
    1,
    'gbap.knowledge.v1',
    JSON.stringify(['127.0.0.1']),
    tokenPath,
    5000,
    0,
  );
  db.prepare('INSERT INTO capability_binding(capability,provider_id,priority,enabled) VALUES(?,?,?,?)')
    .run('knowledge.v1.document.status', 'knowledge-ragflow-uat', 100, 1);

  db.prepare(`INSERT INTO knowledge_collection(
    id,name,description,classification,visibility,owner_subject,organization_scope,workspace_scope,
    provider_state,archived_at,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'collection-1','Products',null,'INTERNAL','INTERNAL','user-1',null,null,'READY',null,at,at,
  );
  db.prepare(`INSERT INTO knowledge_document(
    id,collection_id,title,source_type,source_filename,source_locator,classification,visibility,
    owner_subject,ingestion_state,cleanup_state,current_version_id,archived_at,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'document-1','collection-1','Manual','UPLOAD','manual.pdf',null,'INTERNAL','INTERNAL',
    'user-1','INDEXING','NONE','version-1',null,at,at,
  );
  db.prepare(`INSERT INTO knowledge_document_version(
    id,document_id,version,content_checksum,source_filename,source_locator,media_type,byte_size,storage_path,created_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
    'version-1','document-1',1,'sha256:test','manual.pdf',null,'application/pdf',123,null,at,
  );
  db.prepare(`INSERT INTO knowledge_ingestion_run(
    id,document_version_id,provider_id,status,detail,started_at,finished_at
  ) VALUES(?,?,?,?,?,?,?)`).run(
    'run-1','version-1','knowledge-ragflow-uat','INDEXING',null,at,null,
  );
  db.prepare(`INSERT INTO external_mapping(
    id,business_type,business_id,provider_id,external_type,external_id,created_at
  ) VALUES(?,?,?,?,?,?,?)`).run(
    'map-collection','KnowledgeCollection','collection-1','knowledge-ragflow-uat','dataset','dataset-1',at,
  );
  db.prepare(`INSERT INTO external_mapping(
    id,business_type,business_id,provider_id,external_type,external_id,created_at
  ) VALUES(?,?,?,?,?,?,?)`).run(
    'map-document','KnowledgeDocument','document-1','knowledge-ragflow-uat','document','extractor:job-1',at,
  );

  const first = await reconcileKnowledgeIngestionBatch({ limit: 12 });
  assert.equal(first.scanned, 1);
  assert.equal(first.indexing, 1);
  assert.equal(first.errors, 0);
  let mapping = db.prepare("SELECT * FROM external_mapping WHERE id='map-document'").get();
  assert.equal(mapping.external_id, 'doc-real-1');
  let document = db.prepare("SELECT * FROM knowledge_document WHERE id='document-1'").get();
  assert.equal(document.ingestion_state, 'INDEXING');

  const second = await reconcileKnowledgeIngestionBatch({ limit: 12 });
  assert.equal(second.scanned, 1);
  assert.equal(second.ready, 1);
  assert.equal(second.errors, 0);
  document = db.prepare("SELECT * FROM knowledge_document WHERE id='document-1'").get();
  assert.equal(document.ingestion_state, 'READY');
  const run = db.prepare("SELECT * FROM knowledge_ingestion_run WHERE id='run-1'").get();
  assert.equal(run.status, 'READY');
  assert.ok(run.finished_at);
  assert.equal(calls, 2);

  function restart() {
    db.prepare("UPDATE knowledge_document SET ingestion_state='INDEXING',archived_at=NULL,updated_at=? WHERE id='document-1'").run(new Date(Date.now() - 5000).toISOString());
    db.prepare("UPDATE knowledge_ingestion_run SET status='INDEXING',detail=NULL,finished_at=NULL,poll_error_count=0,started_at=? WHERE id='run-1'").run(new Date().toISOString());
  }
  restart();
  failStatus = true;
  let errorBatch = await reconcileKnowledgeIngestionBatch({ limit: 1 });
  assert.equal(errorBatch.errors, 1);
  assert.equal(db.prepare("SELECT poll_error_count FROM knowledge_ingestion_run WHERE id='run-1'").get().poll_error_count, 1);
  assert.match(db.prepare("SELECT detail FROM knowledge_ingestion_run WHERE id='run-1'").get().detail, /^knowledge_status_retry:/);
  failStatus = false;
  await reconcileKnowledgeIngestionBatch({ limit: 1 });
  assert.equal(db.prepare("SELECT poll_error_count FROM knowledge_ingestion_run WHERE id='run-1'").get().poll_error_count, 0, 'a successful poll resets consecutive errors');
  assert.equal(db.prepare("SELECT ingestion_state FROM knowledge_document WHERE id='document-1'").get().ingestion_state, 'READY');

  restart();
  failStatus = true;
  for (let i = 0; i < 6; i += 1) errorBatch = await reconcileKnowledgeIngestionBatch({ limit: 1 });
  assert.equal(errorBatch.failed, 1, 'persistent provider failure must become actionable FAILED');
  assert.equal(db.prepare("SELECT ingestion_state FROM knowledge_document WHERE id='document-1'").get().ingestion_state, 'FAILED');
  assert.ok(db.prepare("SELECT finished_at FROM knowledge_ingestion_run WHERE id='run-1'").get().finished_at);

  restart();
  const callsBeforeTimeout = calls;
  db.prepare("UPDATE knowledge_ingestion_run SET started_at=? WHERE id='run-1'").run(new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
  const timeout = await reconcileKnowledgeIngestionBatch({ limit: 1 });
  assert.equal(timeout.failed, 1);
  assert.equal(calls, callsBeforeTimeout, 'expired work must not keep sending provider requests forever');
  assert.equal(db.prepare("SELECT detail FROM knowledge_ingestion_run WHERE id='run-1'").get().detail, 'knowledge_processing_timeout');

  restart();
  failStatus = false;
  onStatus = () => db.prepare("UPDATE knowledge_document SET archived_at=?,ingestion_state='ARCHIVED' WHERE id='document-1'").run(new Date().toISOString());
  const archived = await reconcileKnowledgeIngestionBatch({ limit: 1 });
  assert.equal(archived.skipped, 1);
  assert.equal(db.prepare("SELECT ingestion_state FROM knowledge_document WHERE id='document-1'").get().ingestion_state, 'ARCHIVED');
  onStatus = null;

  restart();
  onStatus = () => db.prepare("INSERT INTO knowledge_ingestion_run(id,document_version_id,provider_id,status,started_at) VALUES('new-run','version-1','knowledge-ragflow-uat','PENDING',?)").run(db.prepare("SELECT started_at FROM knowledge_ingestion_run WHERE id='run-1'").get().started_at);
  const superseded = await reconcileKnowledgeIngestionBatch({ limit: 1 });
  assert.equal(superseded.skipped, 1);
  assert.equal(db.prepare("SELECT status FROM knowledge_ingestion_run WHERE id='new-run'").get().status, 'PENDING', 'an old in-flight poll cannot finish a newer retry');
  onStatus = null;
  db.prepare("DELETE FROM knowledge_ingestion_run WHERE id='new-run'").run();

  restart();
  db.prepare('UPDATE provider_registration SET enabled=0').run();
  for (let i = 0; i < 6; i += 1) errorBatch = await reconcileKnowledgeIngestionBatch({ limit: 1 });
  assert.equal(errorBatch.failed, 1, 'a missing provider must not leave a document indexing forever');

  db.close();
  console.log('PASS: Knowledge reconciliation covers handoff, recovery, bounded failure, timeout and archive/retry races without browser polling.');
} finally {
  await new Promise((resolve) => server.close(resolve));
  rmSync(root, { recursive: true, force: true });
}
