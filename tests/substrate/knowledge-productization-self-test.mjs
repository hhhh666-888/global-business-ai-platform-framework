import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const API_PORT = 19181;
const PROVIDER_PORT = 19193;
const JWKS_PORT = 19194;
const ISSUER = 'http://knowledge-product-fixture/realms/gbap';
const CLIENT_ID = 'gbap-web';
const temp = mkdtempSync(join(tmpdir(), 'gbap-knowledge-product-'));
const dbPath = join(temp, 'substrate.db');
const sourceRoot = join(temp, 'knowledge-source');
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
const employeeToken = token('employee-only', ['substrate-user']);
const userBToken = token('user-b', ['substrate-user']);
const userCToken = token('user-c', ['substrate-user']);

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
  KNOWLEDGE_SOURCE_ROOT: sourceRoot,
  KNOWLEDGE_MAX_DOCUMENT_BYTES: String(2 * 1024 * 1024),
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
async function requestBytes(path, auth) {
  const response = await fetch(`http://127.0.0.1:${API_PORT}${path}`, { headers: { authorization: `Bearer ${auth}` } });
  return { status: response.status, bytes: Buffer.from(await response.arrayBuffer()), disposition: response.headers.get('content-disposition') };
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
      id: 'fake-knowledge-product',
      component: 'knowledge',
      version: '0.2.0',
      integrationMode: 'HEADLESS_PROVIDER',
      endpoint: `http://127.0.0.1:${PROVIDER_PORT}`,
      environmentScope: 'test',
      lifecycleOwner: 'GBAP_MANAGED',
      replacementClass: 'R2',
      replacementEvidence: 'E0',
      failureMode: 'FAIL_CLOSED',
      egressAllowlist: ['127.0.0.1'],
      timeoutMs: 1000,
      retryCount: 0,
      capabilities,
      provenance: { contractVersion: 'gbap.knowledge.v1', upstreamProduct: 'fake-knowledge-provider', upstreamVersion: '0.2.0', upstreamCommit: 'fixture', adapterRevision: 'fixture' },
    },
  });
  assert.equal(registration.status, 201, JSON.stringify(registration.json));

  const health = await request('/api/knowledge/health', userAToken);
  assert.equal(health.status, 200, JSON.stringify(health.json));
  assert.equal(health.json.state, 'READY');
  assert.equal(Object.prototype.hasOwnProperty.call(health.json, 'providerId'), false, 'employee API must not expose provider ID');

  const employeeCreate = await request('/api/knowledge/collections', employeeToken, {
    method: 'POST',
    body: { name: 'Unauthorized Employee Collection', classification: 'INTERNAL', visibility: 'PRIVATE' },
  });
  assert.equal(employeeCreate.status, 403, 'ordinary employee must not create governed enterprise Knowledge spaces');

  const unsafeSensitive = await request('/api/knowledge/collections', userAToken, {
    method: 'POST',
    body: { name: 'Unsafe Sensitive Collection', classification: 'CONFIDENTIAL', visibility: 'INTERNAL' },
  });
  assert.equal(unsafeSensitive.status, 400, 'sensitive classification must not be company-wide INTERNAL');
  assert.equal(unsafeSensitive.json.error, 'knowledge_sensitive_visibility_requires_restricted');

  const create = await request('/api/knowledge/collections', userAToken, {
    method: 'POST',
    body: { name: 'GBAP Product Knowledge', description: 'Product fixture', classification: 'INTERNAL', visibility: 'PRIVATE' },
  });
  assert.equal(create.status, 201, JSON.stringify(create.json));
  assert.equal(Object.prototype.hasOwnProperty.call(create.json.collection, 'ownerSubject'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(create.json.collection, 'organizationScope'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(create.json.collection, 'workspaceScope'), false);
  const collectionId = create.json.collection.id;

  const restricted = await request(`/api/knowledge/collections/${collectionId}`, userAToken, {
    method: 'PATCH',
    body: { name: 'GBAP Product Knowledge', description: 'Restricted product fixture', classification: 'CONFIDENTIAL', visibility: 'RESTRICTED' },
  });
  assert.equal(restricted.status, 200, JSON.stringify(restricted.json));
  assert.equal(restricted.json.collection.visibility, 'RESTRICTED');

  const acl = await request(`/api/knowledge/collections/${collectionId}/acl`, userAToken, {
    method: 'PUT',
    body: { entries: [{ principalType: 'SUBJECT', principalId: 'user-b', permission: 'READ' }] },
  });
  assert.equal(acl.status, 200, JSON.stringify(acl.json));

  const listB = await request('/api/knowledge/collections', userBToken);
  assert.equal(listB.status, 200);
  assert.ok(listB.json.collections.some((item) => item.id === collectionId), 'ACL subject must discover restricted collection');

  const listC = await request('/api/knowledge/collections', userCToken);
  assert.equal(listC.status, 200);
  assert.equal(listC.json.collections.some((item) => item.id === collectionId), false, 'non-ACL user must not discover restricted collection');

  const fixtureText = 'GBAP product fixture: FG-ESS-261 stores energy for factory backup and peak shaving.';
  const fixtureBytes = Buffer.from(fixtureText);
  const upload = await request('/api/knowledge/documents', userAToken, {
    method: 'POST',
    body: {
      collectionId,
      title: 'ESS Product Fixture',
      sourceType: 'UPLOAD',
      sourceFilename: 'ess-product.txt',
      mediaType: 'text/plain',
      contentBase64: fixtureBytes.toString('base64'),
    },
  });
  assert.equal(upload.status, 201, JSON.stringify(upload.json));
  const documentId = upload.json.document.id;
  assert.equal(upload.json.document.ingestionState, 'READY');
  assert.equal(upload.json.document.currentVersion.sourceStored, true);
  assert.equal(upload.json.document.canManage, true);
  assert.equal(Object.prototype.hasOwnProperty.call(upload.json.document, 'ownerSubject'), false);

  const sensitiveDocument = await request('/api/knowledge/documents', userAToken, {
    method: 'POST',
    body: {
      collectionId,
      title: 'Unsafe document override',
      sourceType: 'UPLOAD',
      sourceFilename: 'unsafe.txt',
      mediaType: 'text/plain',
      classification: 'CONFIDENTIAL',
      visibility: 'INTERNAL',
      contentBase64: Buffer.from('unsafe sensitive visibility fixture').toString('base64'),
    },
  });
  assert.equal(sensitiveDocument.status, 400);
  assert.equal(sensitiveDocument.json.error, 'knowledge_sensitive_visibility_requires_restricted');

  const adminPrivateBytes = Buffer.from('Collection owner must retain access to private document uploaded by admin.');
  const adminPrivate = await request('/api/knowledge/documents', adminToken, {
    method: 'POST',
    body: {
      collectionId,
      title: 'Admin Private Fixture',
      sourceType: 'UPLOAD',
      sourceFilename: 'admin-private.txt',
      mediaType: 'text/plain',
      visibility: 'PRIVATE',
      contentBase64: adminPrivateBytes.toString('base64'),
    },
  });
  assert.equal(adminPrivate.status, 201, JSON.stringify(adminPrivate.json));
  const privateDocumentId = adminPrivate.json.document.id;
  const ownerReadsPrivate = await request(`/api/knowledge/documents/${privateDocumentId}`, userAToken);
  assert.equal(ownerReadsPrivate.status, 200, 'collection owner must be able to read private documents inside the collection');
  const aclReaderPrivate = await request(`/api/knowledge/documents/${privateDocumentId}`, userBToken);
  assert.equal(aclReaderPrivate.status, 403, 'READ ACL must not override document PRIVATE visibility');

  const source = await requestBytes(`/api/knowledge/documents/${documentId}/source`, userBToken);
  assert.equal(source.status, 200);
  assert.deepEqual(source.bytes, fixtureBytes, 'canonical source download must exactly match accepted source bytes');
  assert.match(source.disposition ?? '', /ess-product\.txt/u);

  const detail = await request(`/api/knowledge/documents/${documentId}`, userBToken);
  assert.equal(detail.status, 200, JSON.stringify(detail.json));
  assert.equal(detail.json.document.id, documentId);
  assert.equal(detail.json.document.currentVersion.sourceStored, true);
  assert.match(detail.json.document.currentVersion.contentChecksum, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(Object.prototype.hasOwnProperty.call(detail.json.document, 'ownerSubject'), false);
  assert.ok(detail.json.ingestionRuns.length >= 1);
  assert.equal(Object.prototype.hasOwnProperty.call(detail.json.ingestionRuns[0], 'providerId'), false, 'provider IDs must stay out of employee document history');

  const detailC = await request(`/api/knowledge/documents/${documentId}`, userCToken);
  assert.equal(detailC.status, 403, 'document authorization must be rechecked, not inherited from provider results');

  const duplicate = await request('/api/knowledge/documents', userAToken, {
    method: 'POST',
    body: {
      collectionId,
      title: 'Duplicate',
      sourceType: 'UPLOAD',
      sourceFilename: 'duplicate.txt',
      mediaType: 'text/plain',
      contentBase64: fixtureBytes.toString('base64'),
    },
  });
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.json.error ?? '', /^knowledge_duplicate_document:/u);

  const links = await request(`/api/knowledge/documents/${documentId}/links`, userAToken, {
    method: 'PUT',
    body: { links: [{ businessType: 'Product', businessId: 'product-fixture-001' }, { businessType: 'Country', businessId: 'EC' }] },
  });
  assert.equal(links.status, 200, JSON.stringify(links.json));
  assert.equal(links.json.links.length, 2);

  const searchB = await request('/api/knowledge/search', userBToken, {
    method: 'POST',
    body: { query: 'peak shaving', collectionIds: [collectionId], topK: 5 },
  });
  assert.equal(searchB.status, 200, JSON.stringify(searchB.json));
  assert.equal(searchB.json.results.length, 1);
  assert.equal(searchB.json.results[0].knowledgeDocumentId, documentId);
  assert.match(searchB.json.results[0].chunkId, /^chunk:[0-9a-f]{32}$/u);
  assert.equal(String(searchB.json.results[0].chunkId).includes('fake-knowledge-product'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(searchB.json.results[0], 'documentExternalId'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(searchB.json.results[0], 'providerProvenance'), false, 'search result must not expose provider provenance IDs');
  assert.equal(searchB.json.results[0].contractVersion, 'gbap.knowledge.v1');

  const mcpSearch = await request('/api/mcp', userBToken, { method: 'POST', body: {
    jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'knowledge_search', arguments: { query: 'peak shaving', collectionIds: [collectionId], topK: 5 } },
  } });
  assert.equal(mcpSearch.status, 200);
  assert.equal(mcpSearch.json.result.isError, false);
  assert.equal(mcpSearch.json.result.structuredContent.results[0].knowledgeDocumentId, documentId, 'MCP citations must preserve the canonical document identity');
  const mcpDenied = await request('/api/mcp', userCToken, { method: 'POST', body: {
    jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'knowledge_search', arguments: { query: 'peak shaving', collectionIds: [collectionId] } },
  } });
  assert.equal(mcpDenied.json.result.isError, true);
  assert.equal(mcpDenied.json.result.structuredContent.error.code, 'forbidden', 'MCP must recheck the real Knowledge ACL');
  assert.equal(JSON.stringify(mcpDenied.json).includes('peak shaving'), false);

  // A stale browser interval must not undo a canonical processing timeout.
  const timeoutDb = new DatabaseSync(dbPath);
  const currentVersionId = upload.json.document.currentVersionId;
  timeoutDb.prepare("UPDATE knowledge_document SET ingestion_state='FAILED' WHERE id=?").run(documentId);
  timeoutDb.prepare("UPDATE knowledge_ingestion_run SET status='FAILED',detail='knowledge_processing_timeout' WHERE document_version_id=?").run(currentVersionId);
  const timeoutStatus = await request(`/api/knowledge/documents/${documentId}/status`, userAToken);
  assert.equal(timeoutStatus.status, 200);
  assert.equal(timeoutStatus.json.document.ingestionState, 'FAILED');
  assert.equal(timeoutStatus.json.providerStatus.detail, 'PROCESSING_TIMEOUT');
  assert.equal(timeoutDb.prepare('SELECT ingestion_state FROM knowledge_document WHERE id=?').get(documentId).ingestion_state, 'FAILED');
  const timeoutRetry = await request(`/api/knowledge/documents/${documentId}/retry`, userAToken, { method: 'POST' });
  assert.equal(timeoutRetry.status, 200);
  assert.equal(timeoutRetry.json.document.ingestionState, 'READY', 'an explicit retry may reconcile a provider that completed after timeout');
  timeoutDb.close();

  // Simulate total loss of replaceable provider state while GBAP canonical IDs/source remain authoritative.
  const providerResetResponse = await fetch(`http://127.0.0.1:${PROVIDER_PORT}/__test/reset`, { method: 'POST' });
  assert.equal(providerResetResponse.status, 200, 'test provider reset must succeed');

  const collectionRetry = await request(`/api/knowledge/collections/${collectionId}/retry`, userAToken, { method: 'POST' });
  assert.equal(collectionRetry.status, 200, JSON.stringify(collectionRetry.json));
  assert.equal(collectionRetry.json.collection.id, collectionId, 'canonical collection ID must survive provider recreation');
  assert.equal(collectionRetry.json.collection.providerState, 'READY');
  assert.equal(collectionRetry.json.recreated, true, 'stale provider collection mapping must be recreated');

  const documentRetry = await request(`/api/knowledge/documents/${documentId}/retry`, userAToken, { method: 'POST' });
  assert.equal(documentRetry.status, 200, JSON.stringify(documentRetry.json));
  assert.equal(documentRetry.json.document.id, documentId, 'canonical document ID must survive provider re-index');
  assert.equal(documentRetry.json.document.currentVersionId, upload.json.document.currentVersionId, 'canonical version ID must survive provider re-index');

  const sourceAfterProviderLoss = await requestBytes(`/api/knowledge/documents/${documentId}/source`, userAToken);
  assert.equal(sourceAfterProviderLoss.status, 200);
  assert.deepEqual(sourceAfterProviderLoss.bytes, fixtureBytes, 'canonical source bytes must remain unchanged through provider recreation');

  const searchAfterReindex = await request('/api/knowledge/search', userAToken, {
    method: 'POST',
    body: { query: 'peak shaving', collectionIds: [collectionId], topK: 5 },
  });
  assert.equal(searchAfterReindex.status, 200, JSON.stringify(searchAfterReindex.json));
  assert.equal(searchAfterReindex.json.results.length, 1, 'search must recover after provider recreation + re-index');
  assert.equal(searchAfterReindex.json.results[0].knowledgeDocumentId, documentId, 're-indexed result must map back to the same canonical document ID');

  const searchC = await request('/api/knowledge/search', userCToken, {
    method: 'POST',
    body: { query: 'peak shaving', collectionIds: [collectionId], topK: 5 },
  });
  assert.equal(searchC.status, 403, 'non-ACL search must fail closed');

  const disposableText = Buffer.from('GBAP temporary knowledge fixture: ARCHIVE-ME-001.');
  const disposable = await request('/api/knowledge/documents', userAToken, {
    method: 'POST',
    body: {
      collectionId,
      title: 'Archive Fixture',
      sourceType: 'UPLOAD',
      sourceFilename: 'archive-me.txt',
      mediaType: 'text/plain',
      contentBase64: disposableText.toString('base64'),
    },
  });
  assert.equal(disposable.status, 201, JSON.stringify(disposable.json));
  const disposableId = disposable.json.document.id;
  const disposablePath = disposable.json.document.currentVersion.sourceStored
    ? join(sourceRoot, disposableId, `${disposable.json.document.currentVersionId}.bin`)
    : null;
  assert.ok(disposablePath && existsSync(disposablePath));

  const archived = await request(`/api/knowledge/documents/${disposableId}`, userAToken, { method: 'DELETE' });
  assert.equal(archived.status, 200, JSON.stringify(archived.json));
  assert.equal(archived.json.document.ingestionState, 'ARCHIVED');
  assert.ok(existsSync(disposablePath), 'canonical source remains inside recovery boundary after provider cleanup/archive');

  const activeDocs = await request(`/api/knowledge/documents?collectionId=${collectionId}`, userBToken);
  assert.equal(activeDocs.status, 200);
  assert.equal(activeDocs.json.documents.some((item) => item.id === disposableId), false);

  const archiveNonEmpty = await request(`/api/knowledge/collections/${collectionId}`, userAToken, { method: 'DELETE' });
  assert.equal(archiveNonEmpty.status, 409);
  assert.equal(archiveNonEmpty.json.error, 'knowledge_collection_not_empty');

  // Same canonical document, immutable historical originals, CAS and ACL.
  const revisionOriginal = Buffer.from('Original version fixture for durable revision acceptance.');
  const revisionUpload = await request('/api/knowledge/documents', userAToken, { method: 'POST', body: { collectionId, title: 'Revision Fixture', sourceFilename: '历史原件.txt', contentBase64: revisionOriginal.toString('base64'), mediaType: 'text/plain' } });
  assert.equal(revisionUpload.status, 201, JSON.stringify(revisionUpload.json));
  const revisionId = revisionUpload.json.document.id;
  const originalVersionId = revisionUpload.json.document.currentVersionId;
  const newBytes = Buffer.from('New version fixture replaces obsolete evidence and keeps originals.');
  const revisionInput = { expectedVersionId: originalVersionId, sourceFilename: '新版本.txt', mediaType: 'text/plain', contentBase64: newBytes.toString('base64') };
  assert.equal((await request(`/api/knowledge/documents/${revisionId}/versions`, userBToken, { method: 'POST', body: revisionInput })).status, 403, 'read-only ACL must not grant revision writes');
  await request(`/api/knowledge/documents/${revisionId}/links`, userAToken, { method: 'PUT', body: { links: [{ businessType: 'Project', businessId: 'retained-project' }] } });
  const revisionAttempts = await Promise.all([1,2].map(() => request(`/api/knowledge/documents/${revisionId}/versions`, userAToken, { method: 'POST', body: revisionInput })));
  assert.deepEqual(revisionAttempts.map(item => item.status).sort(), [201,409], 'concurrent editors produce exactly one new version');
  const revision = revisionAttempts.find(item => item.status === 201);
  assert.equal(revision.status, 201, JSON.stringify(revision.json));
  assert.equal(revision.json.document.id, revisionId);
  assert.equal(revision.json.document.currentVersion.version, 2);
  assert.equal(revision.json.document.ingestionState, 'READY');
  assert.equal((await request(`/api/knowledge/documents/${revisionId}/versions`, userAToken, { method: 'POST', body: revisionInput })).status, 409, 'stale editor must not overwrite the latest revision');
  assert.equal((await request(`/api/knowledge/documents/${revisionId}/versions`, userAToken, { method: 'POST', body: { ...revisionInput, expectedVersionId: revision.json.document.currentVersionId } })).status, 409, 'identical bytes must not produce a new revision');
  const history = await request(`/api/knowledge/documents/${revisionId}`, userAToken);
  assert.deepEqual(history.json.versions.map(v => v.version), [2,1]);
  assert.deepEqual(history.json.links.map(link => [link.businessType,link.businessId]), [['Project','retained-project']]);
  assert.deepEqual((await requestBytes(`/api/knowledge/documents/${revisionId}/source`, userAToken)).bytes, newBytes);
  assert.deepEqual((await requestBytes(`/api/knowledge/documents/${revisionId}/source?versionId=${originalVersionId}`, userBToken)).bytes, revisionOriginal);
  assert.equal((await requestBytes(`/api/knowledge/documents/${revisionId}/source?versionId=${originalVersionId}`, userCToken)).status, 403);
  assert.equal((await requestBytes(`/api/knowledge/documents/${revisionId}/source?versionId=${upload.json.document.currentVersionId}`, userAToken)).status, 404, 'cross-document version injection must fail');
  const revisionDb = new DatabaseSync(dbPath);
  assert.equal(revisionDb.prepare('SELECT COUNT(*) n FROM knowledge_retired_index WHERE version_id=? AND cleaned_at IS NOT NULL').get(originalVersionId).n, 1);
  revisionDb.close();

  const providerExited = new Promise((resolve) => provider.once('exit', resolve));
  provider.kill('SIGTERM');
  await providerExited;

  const outageRevisionBytes = Buffer.from('Revision source remains durable during an index outage.');
  const outageRevision = await request(`/api/knowledge/documents/${revisionId}/versions`, userAToken, { method: 'POST', body: { expectedVersionId: revision.json.document.currentVersionId, sourceFilename: '离线新版本.txt', contentBase64: outageRevisionBytes.toString('base64'), mediaType: 'text/plain' } });
  assert.equal(outageRevision.status, 202, JSON.stringify(outageRevision.json));
  assert.equal(outageRevision.json.document.currentVersion.version, 3);
  assert.equal(outageRevision.json.document.ingestionState, 'FAILED');
  assert.deepEqual((await requestBytes(`/api/knowledge/documents/${revisionId}/source`, userAToken)).bytes, outageRevisionBytes);
  assert.deepEqual((await requestBytes(`/api/knowledge/documents/${revisionId}/source?versionId=${originalVersionId}`, userAToken)).bytes, revisionOriginal);
  const outageRevisionDb = new DatabaseSync(dbPath);
  assert.equal(outageRevisionDb.prepare("SELECT COUNT(*) n FROM external_mapping WHERE business_type='KnowledgeDocument' AND business_id=?").get(revisionId).n,0,'obsolete chunks must never map to the latest failed version');
  assert.equal(outageRevisionDb.prepare('SELECT COUNT(*) n FROM knowledge_retired_index WHERE version_id=? AND cleaned_at IS NULL').get(revision.json.document.currentVersionId).n,1,'pending cleanup survives failures for an explicit retry');
  outageRevisionDb.close();

  const outageBytes = Buffer.from('GBAP canonical source survives provider outage: OUTAGE-SOURCE-001.');
  const outageUpload = await request('/api/knowledge/documents', userAToken, {
    method: 'POST',
    body: {
      collectionId,
      title: 'Provider Outage Fixture',
      sourceType: 'UPLOAD',
      sourceFilename: 'outage-source.txt',
      mediaType: 'text/plain',
      contentBase64: outageBytes.toString('base64'),
    },
  });
  assert.equal(outageUpload.status, 202, JSON.stringify(outageUpload.json));
  assert.equal(outageUpload.json.document.ingestionState, 'FAILED');
  assert.ok(outageUpload.json.document.id, 'canonical document ID must be allocated despite provider outage');
  assert.equal(outageUpload.json.document.currentVersion.sourceStored, true);

  const outageSource = await requestBytes(`/api/knowledge/documents/${outageUpload.json.document.id}/source`, userAToken);
  assert.equal(outageSource.status, 200);
  assert.deepEqual(outageSource.bytes, outageBytes);

  const db = new DatabaseSync(dbPath);
  try {
    const version = db.prepare('SELECT storage_path,content_checksum,byte_size FROM knowledge_document_version WHERE document_id=?').get(documentId);
    assert.ok(version.storage_path.startsWith(sourceRoot));
    assert.ok(existsSync(version.storage_path));
    assert.deepEqual(readFileSync(version.storage_path), fixtureBytes);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM knowledge_business_link WHERE document_id=?').get(documentId).n, 2);
    assert.ok(db.prepare("SELECT COUNT(*) AS n FROM audit_event WHERE action LIKE 'knowledge.%'").get().n >= 8);
    assert.equal(db.prepare('SELECT cleanup_state FROM knowledge_document WHERE id=?').get(disposableId).cleanup_state, 'CLEAN');
    assert.equal(db.prepare('SELECT ingestion_state FROM knowledge_document WHERE id=?').get(outageUpload.json.document.id).ingestion_state, 'FAILED');
  } finally { db.close(); }

  console.log(JSON.stringify({
    gate: 'KNOWLEDGE_PRODUCTIZATION_V1',
    result: 'PASS',
    collectionId,
    documentId,
    sourceAuthority: 'GBAP_CANONICAL_FILE',
    aclIsolation: 'PASS',
    providerOutageCanonicalPersistence: 'PASS',
  }));
} finally {
  for (const proc of children) { if (proc.exitCode === null) proc.kill('SIGTERM'); }
  await new Promise((resolve) => jwksServer.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}
