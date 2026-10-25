import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { spawn } from 'node:child_process';

const RAGFLOW_BASE_URL = process.env.GBAP_RAGFLOW_BASE_URL;
const RAGFLOW_API_KEY_FILE = process.env.GBAP_RAGFLOW_API_KEY_FILE;
const ADAPTER_TOKEN_FILE = process.env.GBAP_ADAPTER_TOKEN_FILE;
const EMBEDDING_MODEL = process.env.GBAP_RAGFLOW_EMBEDDING_MODEL;
const BENCHMARK_PATH = process.env.GBAP_MULTILINGUAL_BENCHMARK_PATH ?? 'tests/knowledge-quality/multilingual-benchmark.json';
const OUTPUT_PATH = process.env.GBAP_MULTILINGUAL_RUN_OUTPUT;
if (!RAGFLOW_BASE_URL || !RAGFLOW_API_KEY_FILE || !ADAPTER_TOKEN_FILE || !EMBEDDING_MODEL || !OUTPUT_PATH) {
  throw new Error('missing_multilingual_real_benchmark_environment');
}
assert.match(EMBEDDING_MODEL, /@HuggingFace$/u, 'real benchmark must use the RAGFlow HuggingFace provider path');

const benchmark = JSON.parse(readFileSync(BENCHMARK_PATH, 'utf8'));
assert.equal(benchmark.schemaVersion, 1);
assert.equal(benchmark.dataPolicy, 'SYNTHETIC_ONLY');

const API_PORT = Number(process.env.GBAP_KNOWLEDGE_API_PORT ?? '29981');
const ADAPTER_PORT = Number(process.env.GBAP_KNOWLEDGE_ADAPTER_PORT ?? '29992');
const JWKS_PORT = Number(process.env.GBAP_KNOWLEDGE_JWKS_PORT ?? '29994');
const PROVIDER_TIMEOUT_MS = 60_000;
const ISSUER = 'http://knowledge-multilingual-benchmark/realms/gbap';
const CLIENT_ID = 'gbap-web';
const temp = mkdtempSync(join(tmpdir(), 'gbap-knowledge-multilingual-'));
const dbPath = join(temp, 'substrate.db');
const children = [];

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const kid = `kid-${randomUUID()}`;
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = kid;
jwk.use = 'sig';
jwk.alg = 'RS256';

function base64url(value) { return Buffer.from(value).toString('base64url'); }
function token(subject, roles) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const payload = base64url(JSON.stringify({
    iss: ISSUER,
    sub: subject,
    azp: CLIENT_ID,
    preferred_username: subject,
    iat: now,
    exp: now + 3600,
    realm_access: { roles },
  }));
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

const adminToken = token('benchmark-admin', ['substrate-admin', 'substrate-user']);
const ownerToken = token('benchmark-owner', ['substrate-user']);
const deniedToken = token('benchmark-denied', ['substrate-user']);

const jwksServer = http.createServer((req, res) => {
  if (req.url === '/certs') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ keys: [jwk] }));
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise((resolve) => jwksServer.listen(JWKS_PORT, '127.0.0.1', resolve));

function child(command, args, env) {
  const proc = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  proc.stdout.on('data', (chunk) => { output += chunk.toString(); process.stdout.write(chunk); });
  proc.stderr.on('data', (chunk) => { output += chunk.toString(); process.stderr.write(chunk); });
  proc.output = () => output;
  children.push(proc);
  return proc;
}

const adapter = child(process.execPath, ['providers/ragflow-adapter/server.mjs'], {
  PORT: String(ADAPTER_PORT),
  RAGFLOW_BASE_URL,
  RAGFLOW_API_KEY_FILE,
  GBAP_ADAPTER_TOKEN_FILE: ADAPTER_TOKEN_FILE,
  RAGFLOW_EMBEDDING_MODEL: EMBEDDING_MODEL,
  RAGFLOW_CHUNK_METHOD: 'naive',
  RAGFLOW_KEYWORD_SEARCH: '0',
  RAGFLOW_DEFAULT_SIMILARITY_THRESHOLD: '0',
  RAGFLOW_REQUEST_TIMEOUT_MS: String(PROVIDER_TIMEOUT_MS),
});

const api = child(process.execPath, ['apps/api/bootstrap.mjs'], {
  PORT: String(API_PORT),
  DB_PATH: dbPath,
  OBSERVABILITY_DB_PATH: join(temp, 'observability.db'),
  KNOWLEDGE_SOURCE_ROOT: join(temp, 'knowledge-source'),
  CORS_ORIGIN: 'http://localhost:8080',
  OIDC_ISSUER: ISSUER,
  OIDC_ALLOWED_ISSUERS: ISSUER,
  OIDC_JWKS_URL_INTERNAL: `http://127.0.0.1:${JWKS_PORT}/certs`,
  OIDC_CLIENT_ID: CLIENT_ID,
  SUBSTRATE_ENV: 'test',
  KNOWLEDGE_POU_MAX_DOCUMENT_BYTES: String(4 * 1024 * 1024),
});

async function request(path, auth, { method = 'GET', body } = {}) {
  const response = await fetch(`http://127.0.0.1:${API_PORT}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${auth}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json };
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitReady() {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (api.exitCode !== null) throw new Error(`api_exited:${api.exitCode}\n${api.output()}`);
    if (adapter.exitCode !== null) throw new Error(`adapter_exited:${adapter.exitCode}\n${adapter.output()}`);
    try {
      const [me, health] = await Promise.all([
        request('/api/me', adminToken),
        fetch(`http://127.0.0.1:${ADAPTER_PORT}/health`).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) })),
      ]);
      if (me.status === 200 && health.status === 200) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`runtime_start_timeout\nAPI:\n${api.output()}\nADAPTER:\n${adapter.output()}`);
}

async function waitDocument(documentId, timeoutMs = 15 * 60 * 1000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = await request(`/api/knowledge/documents/${encodeURIComponent(documentId)}/status`, ownerToken);
    if (last.status !== 200) throw new Error(`document_status_failed:${documentId}:${JSON.stringify(last.json)}`);
    const state = last.json.document?.ingestionState;
    if (state === 'READY') return last;
    if (state === 'FAILED' || state === 'CANCELLED') {
      throw new Error(`document_ingestion_${state.toLowerCase()}:${documentId}:${JSON.stringify(last.json)}`);
    }
    await sleep(4000);
  }
  throw new Error(`document_ingestion_timeout:${documentId}:${JSON.stringify(last?.json ?? {})}`);
}

function mediaType(format) {
  if (format === 'csv') return 'text/csv';
  return 'text/plain; charset=utf-8';
}

function uniqueDocumentIds(results) {
  const seen = new Set();
  const ids = [];
  for (const row of results) {
    if (!row?.knowledgeDocumentId || seen.has(row.knowledgeDocumentId)) continue;
    seen.add(row.knowledgeDocumentId);
    ids.push(row.knowledgeDocumentId);
  }
  return ids;
}

try {
  await waitReady();

  const capabilities = [
    'knowledge.v1.health', 'knowledge.v1.collection.list', 'knowledge.v1.collection.create',
    'knowledge.v1.collection.update', 'knowledge.v1.collection.archive', 'knowledge.v1.document.ingest',
    'knowledge.v1.document.status', 'knowledge.v1.document.remove', 'knowledge.v1.search', 'knowledge.v1.chunk.get',
  ].map((name) => ({ name, priority: 100 }));

  const registration = await request('/api/providers', adminToken, {
    method: 'POST',
    body: {
      id: 'ragflow-v0-27-2-gte-huggingface-benchmark',
      component: 'knowledge',
      version: '0.3.0',
      integrationMode: 'HEADLESS_PROVIDER',
      endpoint: `http://127.0.0.1:${ADAPTER_PORT}`,
      environmentScope: 'test',
      lifecycleOwner: 'GBAP_MANAGED',
      replacementClass: 'R2',
      replacementEvidence: 'E0',
      failureMode: 'FAIL_CLOSED',
      secretRef: ADAPTER_TOKEN_FILE,
      egressAllowlist: ['127.0.0.1'],
      timeoutMs: PROVIDER_TIMEOUT_MS,
      retryCount: 0,
      capabilities,
      provenance: {
        contractVersion: 'gbap.knowledge.v1',
        upstreamProduct: 'infiniflow/ragflow',
        upstreamVersion: 'v0.27.2',
        upstreamCommit: 'a024bea0cd93f39e6652a42bf84dd20c55bc560b',
        adapterRevision: process.env.GITHUB_SHA ?? 'local-gte-huggingface-benchmark',
        configRevision: 'knowledge-gte-huggingface-benchmark-v1',
        schemaRevision: 'gbap.knowledge.v1',
      },
    },
  });
  assert.equal(registration.status, 201, JSON.stringify(registration.json));

  const collectionResult = await request('/api/knowledge/collections', ownerToken, {
    method: 'POST',
    body: {
      name: `Synthetic GTE HuggingFace Benchmark ${Date.now()}`,
      description: 'Synthetic CN EN ES retrieval benchmark through official RAGFlow HuggingFace provider binding',
      classification: 'INTERNAL',
      visibility: 'PRIVATE',
    },
  });
  assert.equal(collectionResult.status, 201, JSON.stringify(collectionResult.json));
  const collectionId = collectionResult.json.collection.id;
  assert.equal(collectionResult.json.collection.providerState, 'READY');

  const canonicalByFixture = new Map();
  for (const fixture of benchmark.corpus) {
    const bytes = Buffer.from(fixture.text, 'utf8');
    const result = await request('/api/knowledge/documents', ownerToken, {
      method: 'POST',
      body: {
        collectionId,
        title: fixture.id,
        sourceType: 'UPLOAD',
        sourceFilename: fixture.filename,
        mediaType: mediaType(fixture.format),
        contentBase64: bytes.toString('base64'),
      },
    });
    assert.equal(result.status, 201, `${fixture.id}: ${JSON.stringify(result.json)}`);
    canonicalByFixture.set(fixture.id, result.json.document.id);
  }

  await Promise.all([...canonicalByFixture.values()].map((documentId) => waitDocument(documentId)));

  const denied = await request('/api/knowledge/search', deniedToken, {
    method: 'POST',
    body: { query: 'FG-PV-550', collectionIds: [collectionId], topK: 3, minimumScore: 0 },
  });
  assert.equal(denied.status, 403, 'private benchmark collection must remain ACL-isolated');

  const cases = [];
  for (const query of benchmark.queries) {
    const started = performance.now();
    const search = await request('/api/knowledge/search', ownerToken, {
      method: 'POST',
      body: { query: query.query, collectionIds: [collectionId], topK: 12, minimumScore: 0 },
    });
    const latencyMs = Math.round((performance.now() - started) * 100) / 100;
    assert.equal(search.status, 200, `${query.id}: ${JSON.stringify(search.json)}`);

    const ranked = uniqueDocumentIds(search.json.results ?? []).slice(0, 3);
    const expectedCanonicalId = canonicalByFixture.get(query.expectedDocumentId);
    assert.ok(expectedCanonicalId, `missing canonical mapping for ${query.expectedDocumentId}`);

    cases.push({
      queryId: query.id,
      rankedDocumentIds: ranked,
      citationDocumentIds: ranked,
      latencyMs,
      expectedCanonicalDocumentId: expectedCanonicalId,
      sourceTitles: (search.json.results ?? []).slice(0, 12).map((row) => row.sourceTitle ?? null),
    });
  }

  const normalizedBenchmark = structuredClone(benchmark);
  for (const query of normalizedBenchmark.queries) {
    query.expectedDocumentId = canonicalByFixture.get(query.expectedDocumentId);
  }

  const run = {
    schemaVersion: 1,
    modelId: EMBEDDING_MODEL,
    providerBinding: 'HuggingFace',
    benchmarkSource: BENCHMARK_PATH,
    benchmark: normalizedBenchmark,
    documentIdMap: Object.fromEntries(canonicalByFixture),
    corpusCanonicalMap: Object.fromEntries(canonicalByFixture),
    cases,
  };
  writeFileSync(OUTPUT_PATH, JSON.stringify(run, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify({
    gate: 'KNOWLEDGE_RAGFLOW_GTE_HUGGINGFACE_REAL_BENCHMARK_RAW',
    result: 'COMPLETE',
    modelId: EMBEDDING_MODEL,
    providerBinding: 'HuggingFace',
    collectionId,
    corpusDocuments: benchmark.corpus.length,
    queries: benchmark.queries.length,
    output: OUTPUT_PATH,
  }, null, 2));
} finally {
  for (const proc of children) {
    if (proc.exitCode === null) proc.kill('SIGTERM');
  }
  await new Promise((resolve) => jwksServer.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}
