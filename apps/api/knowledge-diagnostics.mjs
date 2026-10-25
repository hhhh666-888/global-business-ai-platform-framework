import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { publicIngestionDetail, publicIngestionCause } from './knowledge-status.mjs';

// Run inside the installed API container; never create/migrate a database and
// never emit source text, filenames, principals, raw errors or credentials.
const path = process.env.DB_PATH ?? '/data/substrate.db';
let db;
try {
  if (!existsSync(path)) throw new Error('missing_database');
  db = new DatabaseSync(path, { readOnly: true });
  db.exec('PRAGMA busy_timeout = 5000');
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
  if (!['knowledge_document', 'knowledge_ingestion_run', 'knowledge_document_version'].every(name => tables.has(name))) throw new Error('missing_knowledge_schema');
  const columns = new Set(db.prepare('PRAGMA table_info(knowledge_ingestion_run)').all().map(row => row.name));
  const documents = db.prepare(`
    SELECT d.id AS documentId, d.ingestion_state AS state, v.byte_size AS byteSize,
      r.started_at AS startedAt, r.finished_at AS finishedAt, r.detail,
      ${columns.has('poll_error_count') ? 'r.poll_error_count' : '0'} AS consecutivePollErrors,
      ${columns.has('last_polled_at') ? 'r.last_polled_at' : 'NULL'} AS lastPolledAt
    FROM knowledge_document d
    LEFT JOIN knowledge_document_version v ON v.id=d.current_version_id
    LEFT JOIN knowledge_ingestion_run r ON r.id=(SELECT id FROM knowledge_ingestion_run WHERE document_version_id=d.current_version_id ORDER BY started_at DESC,rowid DESC LIMIT 1)
    WHERE d.archived_at IS NULL AND d.ingestion_state IN ('PENDING','INDEXING','FAILED')
    ORDER BY d.updated_at ASC LIMIT 100
  `).all().map(({ detail, ...row }) => ({ ...row, detail: publicIngestionDetail(detail), cause: publicIngestionCause(detail), elapsedSeconds: row.startedAt ? Math.max(0, Math.round((Date.parse(row.finishedAt ?? new Date().toISOString()) - Date.parse(row.startedAt)) / 1000)) : null }));
  const counts = db.prepare('SELECT ingestion_state AS state,COUNT(*) AS count FROM knowledge_document WHERE archived_at IS NULL GROUP BY ingestion_state').all();
  console.log(JSON.stringify({ schemaVersion: 1, observedAt: new Date().toISOString(), counts, documents }, null, 2));
} catch {
  console.error(JSON.stringify({ error: 'knowledge_diagnostics_unavailable', instruction: 'Run this command inside the installed GBAP API container with its existing DB_PATH.' }));
  process.exitCode = 1;
} finally { db?.close(); }
