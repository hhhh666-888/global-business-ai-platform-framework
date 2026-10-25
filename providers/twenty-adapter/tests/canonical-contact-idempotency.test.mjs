import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

async function listen(server) {
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  return server.address().port;
}
async function freePort() {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return port;
}
async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}
async function waitForHealth(url, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`adapter_exited_${child.exitCode}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error('adapter_health_timeout');
}
async function invoke(baseUrl, payload) {
  const response = await fetch(`${baseUrl}/invoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ capability: 'crm.v1.contact.create', payload }),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

test('canonical Contact create is provider-idempotent by GBAP businessId', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'gbap-twenty-idempotent-contact-'));
  const tokenFile = join(work, 'twenty-api-key');
  writeFileSync(tokenFile, 'adapter-test-token\n');

  const people = new Map();
  const createRequests = [];
  const upstream = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/rest/people') {
      const body = await readJson(req);
      createRequests.push({ upsert: url.searchParams.get('upsert'), body });
      const id = typeof body.id === 'string' ? body.id : `generated-${createRequests.length}`;
      const previous = people.get(id) ?? {};
      const record = { id, ...previous, ...body, updatedAt: new Date().toISOString() };
      people.set(id, record);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: { createPerson: record } }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  const upstreamPort = await listen(upstream);
  const adapterPort = await freePort();
  const adapterPath = resolve(import.meta.dirname, '..', 'server.mjs');
  const child = spawn(process.execPath, [adapterPath], {
    env: {
      ...process.env,
      PORT: String(adapterPort),
      TWENTY_URL: `http://127.0.0.1:${upstreamPort}`,
      TWENTY_API_KEY_FILE: tokenFile,
      TWENTY_REQUEST_TIMEOUT_MS: '2000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let childLog = '';
  child.stdout.on('data', (chunk) => { childLog += chunk.toString(); });
  child.stderr.on('data', (chunk) => { childLog += chunk.toString(); });

  t.after(async () => {
    if (child.exitCode === null) child.kill('SIGTERM');
    await new Promise((resolvePromise) => upstream.close(resolvePromise));
    rmSync(work, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${adapterPort}`;
  await waitForHealth(`${baseUrl}/health`, child).catch((error) => {
    throw new Error(`${error.message}\n${childLog}`);
  });

  const businessId = '7a539d6f-d1e1-4aed-9e75-7ee93eaa9086';
  const first = await invoke(baseUrl, { businessId, personName: 'Ana Rivera', email: 'ana@example.com' });
  const second = await invoke(baseUrl, { businessId, personName: 'Ana Rivera Updated', email: 'ana@example.com' });

  assert.equal(first.record.externalId, businessId);
  assert.equal(second.record.externalId, businessId);
  assert.equal(people.size, 1);
  assert.equal(people.get(businessId)?.name?.firstName, 'Ana');
  assert.equal(people.get(businessId)?.name?.lastName, 'Rivera Updated');
  assert.equal(createRequests.length, 2);
  assert.deepEqual(createRequests.map((item) => item.upsert), ['true', 'true']);
  assert.deepEqual(createRequests.map((item) => item.body.id), [businessId, businessId]);
});
