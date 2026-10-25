import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const listen = server => new Promise(done => server.listen(0, '127.0.0.1', () => done(server.address().port)));

// Twenty v2.41.0 (d1bb92d): Object/Field no longer expose isCustom;
// Index still does. Custom metadata belongs to workspaceCustomApplication.
test('runtime schema reads v2.41 metadata and preserves custom-object visibility', async t => {
  const root = mkdtempSync(join(tmpdir(), 'gbap-schema-compat-'));
  const tokenFile = join(root, 'token');
  writeFileSync(tokenFile, 'synthetic-token');
  let mode = 'normal';
  let metadataReads = 0;
  const upstream = http.createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/healthz') return res.end('{}');
    if (req.url !== '/metadata') { res.writeHead(404); return res.end('{}'); }
    metadataReads++;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const { query } = JSON.parse(Buffer.concat(chunks).toString());
    const objectFields = query.split('indexMetadataList')[0];
    const fieldFields = query.split('fieldsList')[1]?.split('relation')[0] ?? '';
    const errors = [];
    if (/\bisCustom\b/u.test(objectFields)) errors.push({ message: 'Cannot query field "isCustom" on type "Object".' });
    if (/\bisCustom\b/u.test(fieldFields)) errors.push({ message: 'Cannot query field "isCustom" on type "Field".' });
    if (mode === 'denied') { res.writeHead(403); return res.end(JSON.stringify({ errors: [{ message: 'Forbidden' }] })); }
    if (mode === 'graphql-error') errors.push({ message: 'Metadata unavailable' });
    if (errors.length) return res.end(JSON.stringify({ errors }));
    const objects = [
      { id: 'company', nameSingular: 'company', applicationId: 'standard-app', isSystem: false },
      { id: 'project', nameSingular: 'project', applicationId: 'custom-app', isSystem: false },
      { id: 'addon', nameSingular: 'addon', applicationId: 'third-party-app', isSystem: false },
      { id: 'unknown', nameSingular: 'unknown', applicationId: null, isSystem: false },
    ].map(object => ({ ...object, isActive: true, isUIEditable: true, fieldsList: [
      { name: 'name', applicationId: object.applicationId, isSystem: false },
      { name: 'extra', applicationId: 'custom-app', isSystem: false },
    ], indexMetadataList: [{ id: 'index', isCustom: true }] }));
    // Like GraphQL, unrequested workspace metadata is absent from the result.
    const workspace = /currentWorkspace\s*\{\s*workspaceCustomApplication\s*\{\s*id\s*\}/u.test(query)
      ? { currentWorkspace: { workspaceCustomApplication: mode === 'missing-app' ? null : { id: 'custom-app' } } } : {};
    res.end(JSON.stringify({ data: { ...workspace, objects: { edges: objects.map(node => ({ node })) } } }));
  });
  const upstreamPort = await listen(upstream);
  const probes = [http.createServer(), http.createServer(), http.createServer()];
  const ports = await Promise.all(probes.map(listen));
  await Promise.all(probes.map(server => new Promise(done => server.close(done))));
  const child = spawn(process.execPath, [process.env.TWENTY_ADAPTER_TEST_SCRIPT ?? resolve(import.meta.dirname, '..', 'stage35-entry.mjs')], {
    cwd: resolve(import.meta.dirname, '..'),
    env: { ...process.env, GBAP_DB_PATH: ':memory:', PORT: String(ports[0]), TWENTY_ADAPTER_EXTENDED_PORT: String(ports[1]), TWENTY_ADAPTER_LEGACY_PORT: String(ports[2]), TWENTY_URL: `http://127.0.0.1:${upstreamPort}`, TWENTY_API_KEY_FILE: tokenFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-4000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-4000); });
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = new Promise(done => child.once('exit', done));
      child.kill('SIGTERM');
      await exited;
    }
    await new Promise(done => upstream.close(done));
    rmSync(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${ports[0]}`;
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${base}/health`)).ok) { ready = true; break; } } catch {}
    await new Promise(done => setTimeout(done, 50));
  }
  assert.equal(ready, true, output);
  async function schema(expectedStatus = 200) {
    const response = await fetch(`${base}/invoke`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ capability: 'crm.meta.v1.schema', payload: {} }) });
    const result = await response.json();
    assert.equal(response.status, expectedStatus, JSON.stringify(result));
    return result;
  }
  const result = await schema();
  assert.deepEqual(result.objects.map(object => object.isCustom), [false, true, false, false]);
  assert.deepEqual(result.objects[0].fieldsList.map(field => field.isCustom), [false, true]);
  assert.equal(result.objects[1].fieldsList[0].isCustom, true);
  assert.equal(result.objects[0].indexMetadataList[0].isCustom, true, 'Index custom flags must remain intact');
  assert.equal(result.objects[0].isSystem, false, 'Standard business objects are not necessarily system objects');
  mode = 'missing-app';
  const missing = await schema();
  assert.ok(missing.objects.every(object => object.isCustom === false));
  assert.ok(missing.objects.every(object => object.fieldsList.every(field => field.isCustom === false)), 'Unknown ownership must not imply custom');
  mode = 'denied';
  assert.equal((await schema(403)).upstreamStatus, 403);
  mode = 'graphql-error';
  assert.match((await schema(502)).error, /Metadata unavailable/u, 'HTTP 200 with GraphQL errors is still a failed read');
  assert.equal(metadataReads, 4, 'Each read uses one metadata request; no fallback that hides failures');
});
