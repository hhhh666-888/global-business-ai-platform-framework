import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const temp = mkdtempSync(join(tmpdir(), 'gbap-extractor-handoff-'));
const keyFile = join(temp, 'ragflow-api-key');
writeFileSync(keyFile, 'test-key\n');

const extractorPort = 29201;
const ragflowPort = 29202;
const adapterPort = 29203;
let jobState = 'QUEUED';
let handoffExternalId = null;
let ragflowDocCreated = false;
let ragflowRun = 'UNSTART';
let parseCount = 0;
let uploadCount = 0;
let failNextParse = false;
let submittedBytes = 0;

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}
function respond(res, body, status = 200) {
  const raw = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(raw) });
  res.end(raw);
}

const extractor = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${extractorPort}`);
  if (req.method === 'GET' && url.pathname === '/health') return respond(res, { status: 'ok' });
  if (req.method === 'POST' && url.pathname === '/jobs') {
    const body = await readJson(req);
    submittedBytes = Buffer.from(body.contentBase64, 'base64').length;
    return respond(res, { jobId: '11111111-1111-1111-1111-111111111111', state: 'QUEUED', stage: 'QUEUED' }, 202);
  }
  if (req.method === 'GET' && url.pathname === '/jobs/11111111-1111-1111-1111-111111111111') {
    return respond(res, {
      jobId: '11111111-1111-1111-1111-111111111111',
      state: jobState,
      stage: jobState === 'READY' ? 'NORMALIZED' : 'EXTRACTING',
      sourceFilename: 'manual.pdf',
      parser: jobState === 'READY' ? 'OPENDATALOADER_LOCAL' : null,
      metrics: jobState === 'READY' ? { accepted: true, pageCount: 44, pagesWithText: 44, pageCoverage: 1, tokenishCount: 1200 } : null,
      handoffExternalId,
    });
  }
  if (req.method === 'GET' && url.pathname.endsWith('/result')) {
    return respond(res, {
      jobId: '11111111-1111-1111-1111-111111111111',
      normalizedFilename: 'gbap-11111111-1111-1111-1111-111111111111.md',
      mediaType: 'text/markdown',
      contentBase64: Buffer.from('# Manual\n\nGenerator set 500 kVA\nVoltage 400V\n').toString('base64'),
      parser: 'OPENDATALOADER_LOCAL',
      metrics: { accepted: true, pageCount: 44, pagesWithText: 44, pageCoverage: 1, tokenishCount: 1200 },
    });
  }
  if (req.method === 'PUT' && url.pathname.endsWith('/handoff')) {
    const body = await readJson(req);
    handoffExternalId = body.externalId;
    return respond(res, { jobId: '11111111-1111-1111-1111-111111111111', state: 'READY', handoffExternalId });
  }
  if (req.method === 'DELETE' && url.pathname.startsWith('/jobs/')) return respond(res, { removed: true });
  return respond(res, { error: `unexpected:${req.method}:${url.pathname}` }, 404);
});
await new Promise((resolve) => extractor.listen(extractorPort, '127.0.0.1', resolve));

const ragflow = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${ragflowPort}`);
  if (req.method === 'GET' && url.pathname === '/health') return respond(res, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/api/v1/datasets') return respond(res, { code: 0, data: [] });
  if (req.method === 'GET' && url.pathname === '/api/v1/datasets/ds/documents') {
    if (url.searchParams.get('id') === 'doc-1') {
      return respond(res, { code: 0, data: { docs: [{ id: 'doc-1', name: 'gbap-11111111-1111-1111-1111-111111111111.md', run: ragflowRun, chunk_count: ragflowRun === 'DONE' ? 4 : 0, token_count: ragflowRun === 'DONE' ? 900 : 0, parser_config: {} }] } });
    }
    const name = url.searchParams.get('name');
    return respond(res, { code: 0, data: { docs: ragflowDocCreated && name ? [{ id: 'doc-1', name, run: ragflowRun }] : [] } });
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/datasets/ds/documents') {
    for await (const _ of req) {}
    uploadCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 50));
    ragflowDocCreated = true;
    return respond(res, { code: 0, data: [{ id: 'doc-1', name: 'gbap-11111111-1111-1111-1111-111111111111.md' }] });
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/datasets/ds/documents/parse') {
    await readJson(req);
    parseCount += 1;
    if (failNextParse) {
      failNextParse = false;
      return respond(res, { message: 'temporary_parse_failure' }, 503);
    }
    ragflowRun = 'RUNNING';
    return respond(res, { code: 0, data: true });
  }
  if (req.method === 'DELETE' && url.pathname === '/api/v1/datasets/ds/documents') return respond(res, { code: 0, data: true });
  return respond(res, { message: `unexpected:${req.method}:${url.pathname}` }, 404);
});
await new Promise((resolve) => ragflow.listen(ragflowPort, '127.0.0.1', resolve));

const adapter = spawn(process.execPath, [process.env.RAGFLOW_ADAPTER_SCRIPT ?? 'providers/ragflow-adapter/server.mjs'], {
  env: {
    ...process.env,
    PORT: String(adapterPort),
    RAGFLOW_BASE_URL: `http://127.0.0.1:${ragflowPort}`,
    RAGFLOW_TEI_BASE_URL: `http://127.0.0.1:${ragflowPort}`,
    KNOWLEDGE_EXTRACTOR_BASE_URL: `http://127.0.0.1:${extractorPort}`,
    RAGFLOW_API_KEY_FILE: keyFile,
    GBAP_ADAPTER_TOKEN_FILE: '',
    RAGFLOW_REQUEST_TIMEOUT_MS: '5000',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
adapter.stdout.on('data', (chunk) => { output += chunk.toString(); });
adapter.stderr.on('data', (chunk) => { output += chunk.toString(); });

async function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function waitAdapter() {
  for (let i = 0; i < 80; i += 1) {
    if (adapter.exitCode !== null) throw new Error(`adapter exited: ${adapter.exitCode}\n${output}`);
    try {
      const response = await fetch(`http://127.0.0.1:${adapterPort}/health`);
      if (response.ok) return;
    } catch {}
    await sleep(50);
  }
  throw new Error(`adapter startup timeout\n${output}`);
}
async function invoke(capability, payload, expectedStatus = 200) {
  const response = await fetch(`http://127.0.0.1:${adapterPort}/invoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ capability, context: { contractVersion: 'gbap.knowledge.v1' }, payload }),
  });
  const body = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(body));
  return body;
}

try {
  await waitAdapter();

  const dependencyHealth = await fetch(`http://127.0.0.1:${adapterPort}/health/extractor`);
  assert.equal(dependencyHealth.status, 200);
  const dependencyBody = await dependencyHealth.json();
  assert.equal(dependencyBody.status, 'ok');
  assert.equal(dependencyBody.dependency, 'knowledge-extractor');
  assert.equal(dependencyBody.route, 'adapter-internal');

  const ingest = await invoke('knowledge.v1.document.ingest', {
    providerCollectionId: 'ds',
    sourceFilename: 'manual.pdf',
    mediaType: 'application/pdf',
    contentBase64: Buffer.from('fake-pdf').toString('base64'),
  });
  assert.equal(ingest.state, 'INDEXING');
  assert.equal(ingest.record.externalId, 'extractor:11111111-1111-1111-1111-111111111111');

  await invoke('knowledge.v1.document.ingest', {
    providerCollectionId: 'ds', sourceFilename: '大文件产品手册.pdf', mediaType: 'application/pdf',
    contentBase64: Buffer.alloc(Math.ceil(16.4 * 1024 * 1024), 65).toString('base64'),
  });
  assert.equal(submittedBytes, Math.ceil(16.4 * 1024 * 1024), '16.4 MB raw file must reach extraction through its larger Base64 envelope');

  const pending = await invoke('knowledge.v1.document.status', {
    providerCollectionId: 'ds',
    providerDocumentId: ingest.record.externalId,
  });
  assert.equal(pending.state, 'INDEXING');
  assert.match(pending.detail, /^extractor_processing:/);

  jobState = 'READY';
  failNextParse = true;
  await invoke('knowledge.v1.document.status', {
    providerCollectionId: 'ds', providerDocumentId: ingest.record.externalId,
  }, 502);
  assert.equal(uploadCount, 1);
  assert.equal(parseCount, 1);
  assert.equal(handoffExternalId, null, 'failed parse must not commit the handoff');
  const [handedA, handedB] = await Promise.all([
    invoke('knowledge.v1.document.status', {
      providerCollectionId: 'ds',
      providerDocumentId: ingest.record.externalId,
    }),
    invoke('knowledge.v1.document.status', {
      providerCollectionId: 'ds',
      providerDocumentId: ingest.record.externalId,
    }),
  ]);
  for (const handed of [handedA, handedB]) {
    assert.equal(handed.state, 'INDEXING');
    assert.equal(handed.record.externalId, 'doc-1');
    assert.equal(handed.extraction.parser, 'OPENDATALOADER_LOCAL');
  }
  assert.equal(uploadCount, 1, 'concurrent status reconciliation must upload normalized content exactly once');
  assert.equal(parseCount, 2, 'recover a failed parse once without duplicate successful parses');
  assert.equal(handoffExternalId, 'doc-1');

  ragflowRun = 'DONE';
  const ready = await invoke('knowledge.v1.document.status', {
    providerCollectionId: 'ds',
    providerDocumentId: 'doc-1',
  });
  assert.equal(ready.state, 'READY');
  assert.equal(ready.chunkCount, 4);
  assert.equal(ready.tokenCount, 900);

  console.log('PASS: extractor jobs hand off normalized Markdown to RAGFlow without false READY or duplicate parse.');
} finally {
  if (adapter.exitCode === null) adapter.kill('SIGTERM');
  await Promise.all([
    new Promise((resolve) => extractor.close(resolve)),
    new Promise((resolve) => ragflow.close(resolve)),
  ]);
  rmSync(temp, { recursive: true, force: true });
}
