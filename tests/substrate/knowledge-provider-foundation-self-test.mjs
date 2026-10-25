import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const API_PORT = 18981;
const PROVIDER_PORT = 18993;
const JWKS_PORT = 18994;
const ISSUER = 'http://knowledge-fixture/realms/gbap';
const CLIENT_ID = 'gbap-web';
const temp = mkdtempSync(join(tmpdir(), 'gbap-knowledge-pou-'));
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
const adminToken = token('admin-fixture', ['substrate-admin', 'substrate-user']);
const userAToken = token('user-a', ['substrate-user', 'substrate-manager']);
const userBToken = token('user-b', ['substrate-user']);

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
  proc.stdout.on('data', (chunk) => { output += chunk.toString(); });
  proc.stderr.on('data', (chunk) => { output += chunk.toString(); });
  proc.output = () => output;
  children.push(proc);
  return proc;
}
const provider = child(process.execPath, ['providers/fake-knowledge-provider/server.mjs'], { PORT: String(PROVIDER_PORT) });
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
async function waitForApi() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (api.exitCode !== null) throw new Error(`api_exited:${api.exitCode}\n${api.output()}`);
    if (provider.exitCode !== null) throw new Error(`provider_exited:${provider.exitCode}\n${provider.output()}`);
    try {
      const result = await request('/api/me', adminToken);
      if (result.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`api_start_timeout\nAPI:\n${api.output()}\nPROVIDER:\n${provider.output()}`);
}

try {
  await waitForApi();
  const capabilities = [
    'knowledge.v1.health',
    'knowledge.v1.collection.list',
    'knowledge.v1.collection.create',
    'knowledge.v1.collection.update',
    'knowledge.v1.collection.archive',
    'knowledge.v1.document.ingest',
    'knowledge.v1.document.status',
    'knowledge.v1.document.remove',
    'knowledge.v1.search',
    'knowledge.v1.chunk.get',
  ].map((name) => ({ name, priority: 100 }));
  const registration = await request('/api/providers', adminToken, {
    method: 'POST',
    body: {
      id: 'fake-knowledge-pou',
      component: 'knowledge',
      version: '0.1.0',
      integrationMode: 'HEADLESS_PROVIDER',
      endpoint: `http://127.0.0.1:${PROVIDER_PORT}`,
      environmentScope: 'test',
      lifecycleOwner: 'GBAP_MANAGED',
      replacementClass: 'R2',
      replacementEvidence: 'E0',
      failureMode: 'FAIL_CLOSED',
      egressAllowlist: ['127.0.0.1'],
      timeoutMs: 3000,
      retryCount: 0,
      capabilities,
      provenance: { contractVersion: 'gbap.knowledge.v1', upstreamProduct: 'fake-knowledge-provider', upstreamVersion: '0.1.0', upstreamCommit: 'fixture', adapterRevision: 'fixture' },
    },
  });
  assert.equal(registration.status, 201, JSON.stringify(registration.json));

  const health = await request('/api/knowledge/health', userAToken);
  assert.equal(health.status, 200, JSON.stringify(health.json));
  assert.equal(health.json.state, 'READY');
  assert.equal(health.json.contractVersion, 'gbap.knowledge.v1');
  assert.equal(Object.prototype.hasOwnProperty.call(health.json, 'providerId'), false, 'public Knowledge health must not expose provider identity');

  const direct = await request('/api/capabilities/knowledge.v1.search/invoke', userAToken, { method: 'POST', body: { payload: { query: 'fixture' } } });
  assert.equal(direct.status, 403, 'browser/direct knowledge provider invocation must be forbidden');
  assert.equal(direct.json.error, 'internal_provider_capability_forbidden');

  const collectionResult = await request('/api/knowledge/collections', userAToken, {
    method: 'POST',
    body: { name: 'Private PoU Knowledge', classification: 'INTERNAL', visibility: 'PRIVATE' },
  });
  assert.equal(collectionResult.status, 201, JSON.stringify(collectionResult.json));
  const collectionId = collectionResult.json.collection.id;
  assert.equal(collectionResult.json.collection.providerState, 'READY');

  const fixtureText = 'GBAP ESS fixture: battery energy storage supports factory continuity and peak shaving.';
  const documentResult = await request('/api/knowledge/documents', userAToken, {
    method: 'POST',
    body: {
      collectionId,
      title: 'ESS Fixture',
      sourceType: 'UPLOAD',
      sourceFilename: 'ess-fixture.txt',
      mediaType: 'text/plain',
      contentBase64: Buffer.from(fixtureText).toString('base64'),
    },
  });
  assert.equal(documentResult.status, 201, JSON.stringify(documentResult.json));
  const documentId = documentResult.json.document.id;
  assert.equal(documentResult.json.document.ingestionState, 'READY');

  const statusResult = await request(`/api/knowledge/documents/${encodeURIComponent(documentId)}/status`, userAToken);
  assert.equal(statusResult.status, 200, JSON.stringify(statusResult.json));
  assert.equal(statusResult.json.document.ingestionState, 'READY');

  const searchA = await request('/api/knowledge/search', userAToken, { method: 'POST', body: { query: 'peak shaving', collectionIds: [collectionId], topK: 5 } });
  assert.equal(searchA.status, 200, JSON.stringify(searchA.json));
  assert.equal(searchA.json.results.length, 1);
  assert.equal(searchA.json.results[0].knowledgeDocumentId, documentId);
  assert.equal(searchA.json.results[0].text, fixtureText);
  assert.equal(searchA.json.results[0].contractVersion, 'gbap.knowledge.v1');
  assert.equal(Object.prototype.hasOwnProperty.call(searchA.json.results[0], 'providerProvenance'), false);
  assert.ok(!Object.prototype.hasOwnProperty.call(searchA.json.results[0], 'documentExternalId'), 'raw provider document IDs must not cross browser boundary');

  const searchB = await request('/api/knowledge/search', userBToken, { method: 'POST', body: { query: 'peak shaving', collectionIds: [collectionId] } });
  assert.equal(searchB.status, 403, 'private collection must fail closed for a different user');

  const listB = await request('/api/knowledge/collections', userBToken);
  assert.equal(listB.status, 200);
  assert.equal(listB.json.collections.length, 0, 'private collection must not be discoverable by another user');

  if (provider.exitCode === null) {
    const exited = new Promise((resolve) => provider.once('exit', resolve));
    provider.kill('SIGTERM');
    await exited;
  }
  const outage = await request('/api/knowledge/search', userAToken, { method: 'POST', body: { query: 'peak shaving', collectionIds: [collectionId], topK: 5 } });
  assert.equal(outage.status, 503, `provider outage must fail explicitly: ${JSON.stringify(outage.json)}`);
  assert.equal(outage.json.error, 'knowledge_provider_unavailable');

  const canonicalAfterOutage = await request('/api/knowledge/collections', userAToken);
  assert.equal(canonicalAfterOutage.status, 200, JSON.stringify(canonicalAfterOutage.json));
  assert.ok(canonicalAfterOutage.json.collections.some((item) => item.id === collectionId), 'canonical knowledge collection must survive provider outage');

  const db = new DatabaseSync(dbPath);
  try {
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM knowledge_collection').get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM knowledge_document').get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM external_mapping WHERE business_type IN ('KnowledgeCollection','KnowledgeDocument')").get().n, 2);
    assert.ok(db.prepare("SELECT COUNT(*) AS n FROM audit_event WHERE action LIKE 'knowledge.%'").get().n >= 4);
  } finally { db.close(); }

  console.log(JSON.stringify({ gate: 'KNOWLEDGE_PROVIDER_POU_FOUNDATION', result: 'PASS', collectionId, documentId, outageStatus: outage.status }));
} finally {
  for (const proc of children) { if (proc.exitCode === null) proc.kill('SIGTERM'); }
  await new Promise((resolve) => jwksServer.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}
