import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const RAGFLOW_BASE_URL = process.env.GBAP_RAGFLOW_BASE_URL;
const RAGFLOW_API_KEY_FILE = process.env.GBAP_RAGFLOW_API_KEY_FILE;
const ADAPTER_TOKEN_FILE = process.env.GBAP_ADAPTER_TOKEN_FILE;
const FIXTURES_DIR = process.env.GBAP_KNOWLEDGE_FIXTURES_DIR;
if (!RAGFLOW_BASE_URL || !RAGFLOW_API_KEY_FILE || !ADAPTER_TOKEN_FILE || !FIXTURES_DIR) {
  throw new Error('missing_real_ragflow_pou_environment');
}

const API_PORT = Number(process.env.GBAP_KNOWLEDGE_API_PORT ?? '28981');
const ADAPTER_PORT = Number(process.env.GBAP_KNOWLEDGE_ADAPTER_PORT ?? '28992');
const JWKS_PORT = Number(process.env.GBAP_KNOWLEDGE_JWKS_PORT ?? '28994');
const PROVIDER_TIMEOUT_MS = 60_000;
const ISSUER = 'http://knowledge-real-pou/realms/gbap';
const CLIENT_ID = 'gbap-web';
const temp = mkdtempSync(join(tmpdir(), 'gbap-ragflow-real-pou-'));
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
  const payload = base64url(JSON.stringify({ iss: ISSUER, sub: subject, azp: CLIENT_ID, preferred_username: subject, iat: now, exp: now + 3600, realm_access: { roles } }));
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
  return `${header}.${payload}.${signature}`;
}
const adminToken = token('ragflow-pou-admin', ['substrate-admin', 'substrate-user']);
const userAToken = token('ragflow-pou-user-a', ['substrate-user']);
const userBToken = token('ragflow-pou-user-b', ['substrate-user']);

const jwksServer = http.createServer((req, res) => {
  if (req.url === '/certs') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ keys: [jwk] }));
    return;
  }
  res.writeHead(404); res.end();
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
  RAGFLOW_EMBEDDING_MODEL: 'BAAI/bge-small-en-v1.5@Builtin',
  RAGFLOW_CHUNK_METHOD: 'naive',
  RAGFLOW_KEYWORD_SEARCH: '0',
  RAGFLOW_DEFAULT_SIMILARITY_THRESHOLD: '0',
  RAGFLOW_REQUEST_TIMEOUT_MS: String(PROVIDER_TIMEOUT_MS),
});
const api = child(process.execPath, ['apps/api/bootstrap.mjs'], {
  PORT: String(API_PORT),
  DB_PATH: dbPath,
  OBSERVABILITY_DB_PATH: join(temp, 'observability.db'),
  CORS_ORIGIN: 'http://localhost:8080',
  OIDC_ISSUER: ISSUER,
  OIDC_ALLOWED_ISSUERS: ISSUER,
  OIDC_JWKS_URL_INTERNAL: `http://127.0.0.1:${JWKS_PORT}/certs`,
  OIDC_CLIENT_ID: CLIENT_ID,
  SUBSTRATE_ENV: 'test',
  KNOWLEDGE_POU_MAX_DOCUMENT_BYTES: String(12 * 1024 * 1024),
});

async function request(path, auth, { method = 'GET', body } = {}) {
  const response = await fetch(`http://127.0.0.1:${API_PORT}${path}`, {
    method,
    headers: { authorization: `Bearer ${auth}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json };
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function waitReady() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
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
async function waitDocument(documentId, timeoutMs = 12 * 60 * 1000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = await request(`/api/knowledge/documents/${encodeURIComponent(documentId)}/status`, userAToken);
    if (last.status !== 200) throw new Error(`document_status_failed:${documentId}:${JSON.stringify(last.json)}`);
    const state = last.json.document?.ingestionState;
    if (state === 'READY') return last;
    if (state === 'FAILED' || state === 'CANCELLED') throw new Error(`document_ingestion_${state.toLowerCase()}:${documentId}:${JSON.stringify(last.json)}`);
    await sleep(5000);
  }
  throw new Error(`document_ingestion_timeout:${documentId}:${JSON.stringify(last?.json ?? {})}`);
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
      id: 'ragflow-v0-27-2-real-pou',
      component: 'knowledge',
      version: '0.2.0',
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
        adapterRevision: process.env.GITHUB_SHA ?? 'local-real-pou',
        configRevision: 'ragflow-real-pou-v1',
        schemaRevision: 'gbap.knowledge.v1',
      },
    },
  });
  assert.equal(registration.status, 201, JSON.stringify(registration.json));
  assert.equal(registration.json.provider.timeoutMs, PROVIDER_TIMEOUT_MS, `provider timeout must persist exactly: ${JSON.stringify(registration.json)}`);

  const direct = await request('/api/capabilities/knowledge.v1.search/invoke', userAToken, { method: 'POST', body: { payload: { query: 'forbidden' } } });
  assert.equal(direct.status, 403, 'direct provider invocation must remain blocked');

  const collectionResult = await request('/api/knowledge/collections', userAToken, {
    method: 'POST',
    body: { name: `Synthetic RAGFlow Real PoU ${Date.now()}`, description: 'Synthetic PDF/DOCX/XLSX acceptance only', classification: 'INTERNAL', visibility: 'PRIVATE' },
  });
  assert.equal(collectionResult.status, 201, JSON.stringify(collectionResult.json));
  const collectionId = collectionResult.json.collection.id;
  assert.equal(collectionResult.json.collection.providerState, 'READY');

  const manifest = JSON.parse(readFileSync(join(FIXTURES_DIR, 'manifest.json'), 'utf8'));
  assert.equal(manifest.policy, 'SYNTHETIC_FIXTURES_ONLY');
  assert.equal(manifest.fixtures.length, 3);
  const documents = [];
  for (const fixture of manifest.fixtures) {
    const bytes = readFileSync(join(FIXTURES_DIR, fixture.filename));
    const result = await request('/api/knowledge/documents', userAToken, {
      method: 'POST',
      body: {
        collectionId,
        title: fixture.title,
        sourceType: 'UPLOAD',
        sourceFilename: fixture.filename,
        mediaType: fixture.mediaType,
        contentBase64: bytes.toString('base64'),
      },
    });
    assert.equal(result.status, 201, `${fixture.filename}: ${JSON.stringify(result.json)}`);
    documents.push({ ...fixture, documentId: result.json.document.id });
  }

  await Promise.all(documents.map((item) => waitDocument(item.documentId)));

  const searchProofs = [];
  for (const item of documents) {
    const search = await request('/api/knowledge/search', userAToken, {
      method: 'POST',
      body: { query: `${item.question} ${item.token}`, collectionIds: [collectionId], topK: 10, minimumScore: 0 },
    });
    assert.equal(search.status, 200, `${item.filename}: ${JSON.stringify(search.json)}`);
    const hit = search.json.results.find((result) => result.knowledgeDocumentId === item.documentId && result.text.includes(item.token));
    assert.ok(hit, `${item.filename}: expected token ${item.token} in canonical search evidence: ${JSON.stringify(search.json)}`);
    assert.equal(hit.collectionId, collectionId);
    assert.ok(hit.knowledgeDocumentVersionId, `${item.filename}: canonical version id missing`);
    assert.ok(!Object.prototype.hasOwnProperty.call(hit, 'documentExternalId'), `${item.filename}: raw RAGFlow document id leaked`);
    assert.ok(!Object.prototype.hasOwnProperty.call(hit, 'chunkExternalId'), `${item.filename}: raw RAGFlow chunk id leaked`);
    searchProofs.push({ filename: item.filename, documentId: item.documentId, token: item.token, score: hit.score, sourceTitle: hit.sourceTitle });
  }

  const denied = await request('/api/knowledge/search', userBToken, { method: 'POST', body: { query: 'FG-PDF-2048', collectionIds: [collectionId] } });
  assert.equal(denied.status, 403, 'private RAGFlow-backed collection must fail closed for another user');
  const hiddenList = await request('/api/knowledge/collections', userBToken);
  assert.equal(hiddenList.status, 200);
  assert.equal(hiddenList.json.collections.length, 0, 'private RAGFlow-backed collection must not be discoverable');

  const db = new DatabaseSync(dbPath);
  try {
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM knowledge_collection').get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM knowledge_document').get().n, 3);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM knowledge_document WHERE ingestion_state='READY'").get().n, 3);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM external_mapping WHERE business_type='KnowledgeCollection'").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM external_mapping WHERE business_type='KnowledgeDocument'").get().n, 3);
  } finally { db.close(); }

  if (adapter.exitCode === null) adapter.kill('SIGTERM');
  for (let attempt = 0; attempt < 40 && adapter.exitCode === null; attempt += 1) await sleep(100);
  const outage = await request('/api/knowledge/search', userAToken, { method: 'POST', body: { query: 'FG-PDF-2048', collectionIds: [collectionId] } });
  assert.equal(outage.status, 503, `provider outage must fail explicitly: ${JSON.stringify(outage.json)}`);
  const canonicalStillReadable = await request('/api/knowledge/collections', userAToken);
  assert.equal(canonicalStillReadable.status, 200);
  assert.equal(canonicalStillReadable.json.collections[0].id, collectionId, 'provider outage must not destroy canonical collection identity');

  console.log(JSON.stringify({
    gate: 'KNOWLEDGE_RAGFLOW_REAL_RUNTIME',
    result: 'PASS',
    upstream: { version: 'v0.27.2', commit: 'a024bea0cd93f39e6652a42bf84dd20c55bc560b' },
    collectionId,
    documents: searchProofs,
    chineseQuestionMode: 'Chinese natural-language semantic retrieval with deterministic token anchors; no external paid LLM used',
  }, null, 2));
} finally {
  for (const proc of children) { if (proc.exitCode === null) proc.kill('SIGTERM'); }
  await new Promise((resolve) => jwksServer.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}
