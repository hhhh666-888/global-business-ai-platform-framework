import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = mkdtempSync(join(tmpdir(), 'gbap-mcp-http-'));
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'fixture', alg: 'RS256', use: 'sig' };
const issuer = 'http://mcp-http-fixture/realms/gbap';
const jwks = http.createServer((_req, res) => res.end(JSON.stringify({ keys: [jwk] })));
await new Promise(resolve => jwks.listen(0, '127.0.0.1', resolve));
const server = http.createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
process.env.PORT = String(port);
process.env.DB_PATH = join(root, 'substrate.db');
process.env.OIDC_ISSUER = issuer;
process.env.OIDC_ALLOWED_ISSUERS = issuer;
process.env.OIDC_JWKS_URL_INTERNAL = `http://127.0.0.1:${jwks.address().port}/certs`;
process.env.CORS_ORIGIN = 'http://localhost:8080';
process.env.MCP_ALLOWED_ORIGINS = 'http://localhost:8080,https://portal.example.com';
const db = new DatabaseSync(process.env.DB_PATH);
db.exec('CREATE TABLE audit_event(id TEXT PRIMARY KEY,actor_subject TEXT,actor_username TEXT,action TEXT,target TEXT,occurred_at TEXT,payload_json TEXT)');
const { createMcpNativeHandler } = await import('../../apps/api/mcp-native.mjs');
const { listMcpTools } = await import('../../apps/api/mcp-tool-registry.mjs');
const handler = createMcpNativeHandler({ publicResourceUrl: 'https://gbap.example/api/mcp', authorizationServerUrl: 'https://identity.example/realms/gbap' });
let downstreamCalls = 0;
let downstreamStatus = 200;
let lastPayload;
server.on('request', async (req, res) => {
  if (await handler(req, res)) return;
  downstreamCalls += 1;
  assert.ok(req.headers.authorization.startsWith('Bearer '));
  assert.equal(req.headers['x-gbap-organization'], 'org-fixture');
  assert.equal(req.headers['x-gbap-workspace'], 'workspace-fixture');
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  lastPayload = JSON.parse(Buffer.concat(chunks).toString());
  res.writeHead(downstreamStatus, { 'content-type': 'application/json' });
  res.end(JSON.stringify(downstreamStatus === 200
    ? req.url === '/api/knowledge/search' ? { results: [{ knowledgeDocumentId: 'canonical-doc', chunkId: 'canonical-chunk', text: 'Authorized knowledge' }] } : { result: { records: [{ businessId: 'canonical-record' }] } }
    : { error: 'privateInternalConnection:secret-must-not-escape' }));
});
function token(roles = ['substrate-user'], expired = false, audience = 'https://gbap.example/api/mcp') {
  const head = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'fixture' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ iss: issuer, sub: 'user-fixture', azp: 'gbap-web', aud: audience, exp: Math.floor(Date.now() / 1000) + (expired ? -10 : 300), realm_access: { roles } })).toString('base64url');
  return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url')}`;
}
async function rpc(body, extraHeaders = {}, auth = token()) {
  const response = await fetch(`http://127.0.0.1:${port}/api/mcp`, {
    method: 'POST', headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json', 'x-gbap-organization': 'org-fixture', 'x-gbap-workspace': 'workspace-fixture', ...extraHeaders }, body: JSON.stringify(body),
  });
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null, text };
}
const call = (name, args) => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
try {
  const metadata = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-protected-resource/api/mcp`, { headers: { host: 'attacker.example' } });
  assert.equal(metadata.status, 200);
  assert.deepEqual(await metadata.json(), { resource: 'https://gbap.example/api/mcp', authorization_servers: ['https://identity.example/realms/gbap'], bearer_methods_supported: ['header'], resource_name: 'GBAP CRM and Enterprise Knowledge' });
  const headMetadata = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-protected-resource/api/mcp`, { method: 'HEAD' });
  assert.equal(headMetadata.status, 200); assert.equal(await headMetadata.text(), '');
  const badAudience = await rpc({ jsonrpc: '2.0', id: 0, method: 'ping' }, {}, token(['substrate-user'], false, 'https://another.example/api/mcp'));
  assert.equal(badAudience.response.status, 401);
  assert.match(badAudience.response.headers.get('www-authenticate'), /resource_metadata="https:\/\/gbap.example\/.well-known\/oauth-protected-resource\/api\/mcp"/);
  assert.equal(downstreamCalls, 0, 'discovery and audience denial must not invoke business APIs');
  const rawRpc = (body, auth = token()) => fetch(`http://127.0.0.1:${port}/api/mcp`, {
    method: 'POST', headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' }, body,
  });
  const malformed = await rawRpc('{ broken JSON');
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, -32700);
  const oversized = await rawRpc(JSON.stringify({ padding: 'x'.repeat(140 * 1024) }));
  assert.equal(oversized.status, 413);
  assert.equal((await rawRpc('{ broken JSON', 'invalid.jwt.signature')).status, 401, 'authenticate before parsing the request body');
  const initialized = await rpc({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: 'unknown-version' } });
  assert.equal(initialized.body.id, 0);
  assert.equal(initialized.body.result.protocolVersion, '2025-11-25');
  const trustedBrowser = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize' }, { origin: 'https://portal.example.com' });
  assert.equal(trustedBrowser.response.status, 200);
  assert.equal(trustedBrowser.response.headers.get('access-control-allow-origin'), 'https://portal.example.com');
  assert.equal(trustedBrowser.response.headers.get('vary'), 'Origin');
  const notification = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(notification.response.status, 202);
  assert.equal(notification.text, '');
  const listed = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(listed.body.result.tools.length, 7);
  for (const tool of listMcpTools()) {
    const result = await rpc(call(tool.name, tool.name === 'knowledge_search' ? { query: '  inverter  ' } : {}));
    assert.equal(result.body.result.isError, false, tool.name);
    assert.ok(result.body.result.structuredContent);
    if (tool.name === 'knowledge_search') {
      assert.equal(lastPayload.query, 'inverter');
      assert.equal(lastPayload.topK, 6);
      assert.equal(result.body.result.structuredContent.results[0].knowledgeDocumentId, 'canonical-doc');
    } else assert.equal(lastPayload.payload.limit, 100);
  }
  const callsBeforeInvalid = downstreamCalls;
  for (const [name, args] of [['crm_company_list', { limit: 201 }], ['crm_company_list', { limit: '50' }], ['crm_company_list', { externalIds: ['forbidden'] }], ['knowledge_search', {}], ['knowledge_search', { query: ' ' }], ['knowledge_search', { query: 'x', topK: 13 }], ['knowledge_search', { query: 'x', collectionIds: new Array(51).fill('c') }], ['crm_note_list', []]]) {
    const result = await rpc(call(name, args));
    assert.equal(result.body.error.code, -32602);
  }
  assert.equal(downstreamCalls, callsBeforeInvalid, 'invalid inputs must never reach business APIs');
  const nullId = await rpc({ jsonrpc: '2.0', id: null, method: 'ping' });
  assert.equal(nullId.body.error.code, -32600);
  const origin = await rpc(call('crm_company_list', {}), { origin: 'https://untrusted.example' });
  assert.equal(origin.response.status, 403);
  const protocol = await rpc(call('crm_company_list', {}), { 'mcp-protocol-version': 'invented' });
  assert.equal(protocol.response.status, 400);
  const expired = await rpc(call('crm_company_list', {}), {}, token(['substrate-user'], true));
  assert.equal(expired.response.status, 401);
  assert.ok(expired.response.headers.get('www-authenticate').startsWith('Bearer'));
  assert.equal((await rpc(call('crm_company_list', {}), {}, 'invalid.jwt.signature')).response.status, 401);
  assert.equal((await rpc(call('crm_company_list', {}), {}, token(['outsider']))).response.status, 403);
  assert.equal((await rpc(call('crm_company_list', {}), {}, token(['substrate-manager']))).body.result.isError, false);
  for (const [status, code, retryable] of [[403, 'forbidden', false], [503, 'service_unavailable', true]]) {
    downstreamStatus = status;
    const result = await rpc(call('knowledge_search', { query: 'inverter' }));
    assert.equal(result.body.result.isError, true);
    assert.deepEqual(result.body.result.structuredContent.error, { code, retryable });
    assert.equal(result.text.includes('secret-must-not-escape'), false);
  }
  assert.ok(db.prepare("SELECT COUNT(*) AS count FROM audit_event WHERE action='mcp.tool.call'").get().count >= 9);
  console.log('PASS: all seven MCP tools execute over HTTP with identity/scope delegation, schema bounds, protocol handling, audit and safe actionable errors.');
} finally {
  await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => jwks.close(resolve))]);
  db.close();
  rmSync(root, { recursive: true, force: true });
}
