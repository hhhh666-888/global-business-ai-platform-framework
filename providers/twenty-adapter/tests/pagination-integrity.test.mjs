import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const listen = server => new Promise(resolvePromise => server.listen(0, '127.0.0.1', () => resolvePromise(server.address().port)));

test('CRM snapshots, operational relations and deletion guards remain complete beyond 500 records', async t => {
  const root = mkdtempSync(join(tmpdir(), 'gbap-crm-pagination-'));
  const tokenFile = join(root, 'token');
  writeFileSync(tokenFile, 'synthetic-token');
  const rows = {
    companies: Array.from({ length: 620 }, (_, i) => ({ id: `company-${i}`, name: `Company ${i}` })),
    people: Array.from({ length: 620 }, (_, i) => ({ id: `person-${i}`, name: { firstName: `Person ${i}` }, companyId: i === 619 ? 'company-619' : 'company-0' })),
    opportunities: Array.from({ length: 620 }, (_, i) => ({ id: `opportunity-${i}`, name: `Opportunity ${i}`, companyId: i === 619 ? 'company-619' : 'company-0' })),
    tasks: Array.from({ length: 620 }, (_, i) => ({ id: `task-${i}`, title: `Task ${i}` })),
    notes: Array.from({ length: 620 }, (_, i) => ({ id: `note-${i}`, title: `Note ${i}` })),
    taskTargets: Array.from({ length: 620 }, (_, i) => ({ id: `task-target-${i}`, taskId: i === 619 ? 'task-0' : 'task-619', targetCompanyId: i === 619 ? 'company-619' : 'company-0', targetPersonId: i === 619 ? 'person-619' : null })),
    noteTargets: Array.from({ length: 620 }, (_, i) => ({ id: `note-target-${i}`, noteId: i === 619 ? 'note-0' : 'note-619', targetCompanyId: i === 619 ? 'company-619' : 'company-0', targetOpportunityId: i === 619 ? 'opportunity-619' : null })),
  };
  let mode = 'normal';
  let deletes = 0;
  const requests = [];
  const upstream = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fixture');
    res.setHeader('content-type', 'application/json');
    if (url.pathname === '/healthz') return res.end('{}');
    if (req.method === 'DELETE') { deletes++; return res.end('{}'); }
    if (req.method === 'PATCH') {
      const [, , object, id] = url.pathname.split('/');
      const record = rows[object].find(row => row.id === id);
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      Object.assign(record, JSON.parse(Buffer.concat(chunks).toString()));
      return res.end(JSON.stringify({ data: { updateRecord: record } }));
    }
    const object = url.pathname.split('/').at(-1);
    let records = rows[object] ?? [];
    const filter = url.searchParams.get('filter') ?? '';
    const predicates = [...filter.matchAll(/([A-Za-z]+)\[eq\]:"([^"]+)"/g)];
    if (mode === 'normal' && predicates.length) records = records.filter(row => predicates.some(([, key, value]) => row[key] === value));
    const offset = mode === 'stalled' ? 0 : Number(url.searchParams.get('starting_after') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 100);
    requests.push({ object, offset, filter, urlLength: req.url.length });
    const page = records.slice(offset, offset + limit);
    res.end(JSON.stringify({ data: { [object]: page }, pageInfo: { hasNextPage: offset + page.length < records.length, endCursor: mode === 'stalled' ? 'stalled' : String(offset + page.length) } }));
  });
  const upstreamPort = await listen(upstream);
  const portProbe = http.createServer();
  const port = await listen(portProbe);
  await new Promise(resolvePromise => portProbe.close(resolvePromise));
  const child = spawn(process.execPath, [process.env.TWENTY_ADAPTER_TEST_SCRIPT ?? resolve(import.meta.dirname, '..', 'server.mjs')], {
    env: { ...process.env, PORT: String(port), TWENTY_URL: `http://127.0.0.1:${upstreamPort}`, TWENTY_API_KEY_FILE: tokenFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.resume(); child.stderr.resume();
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = new Promise(resolvePromise => child.once('exit', resolvePromise));
      child.kill('SIGTERM');
      await exited;
    }
    await new Promise(resolvePromise => upstream.close(resolvePromise));
    rmSync(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${base}/health`)).ok) { ready = true; break; } } catch {}
    await new Promise(resolvePromise => setTimeout(resolvePromise, 50));
  }
  assert.equal(ready, true);
  async function invoke(capability, payload = {}, expectedStatus = 200) {
    const response = await fetch(`${base}/invoke`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ capability, payload }) });
    const result = await response.json();
    assert.equal(response.status, expectedStatus, JSON.stringify(result));
    return result;
  }
  const snapshot = (await invoke('crm.v1.snapshot.export')).snapshot;
  assert.equal(snapshot.accounts.length, 620);
  assert.equal(snapshot.contacts.length, 620);
  assert.equal(snapshot.opportunities.length, 620);
  assert.equal(snapshot.accounts.at(-1).externalId, 'company-619');
  for (const kind of ['task', 'note']) {
    const records = (await invoke(`crm.ops.v1.${kind}.list`, { limit: 100 })).records;
    assert.equal(records.length, 100);
    assert.ok(records.find(record => record.externalId === `${kind}-0`).targets.some(target => target.externalId === 'company-619'));
    const updated = await invoke(`crm.ops.v1.${kind}.update`, { externalId: `${kind}-0`, ...(kind === 'task' ? { status: 'DONE' } : { title: 'Updated note' }) });
    assert.ok(updated.record.targets.some(target => target.externalId === 'company-619'), 'editing must preserve stored business relations in the returned record');
  }
  const companyGuard = await invoke('crm.ops.v1.account.delete', { externalId: 'company-619' });
  assert.equal(companyGuard.deleted, false);
  assert.deepEqual(companyGuard.blockers, { contacts: 1, opportunities: 1, tasks: 1, notes: 1 });
  assert.equal((await invoke('crm.ops.v1.contact.delete', { externalId: 'person-619' })).deleted, false);
  assert.equal((await invoke('crm.ops.v1.opportunity.delete', { externalId: 'opportunity-619' })).deleted, false);
  assert.equal(deletes, 0);
  mode = 'stalled';
  const stalled = await invoke('crm.ops.v1.account.delete', { externalId: 'company-619' }, 502);
  assert.equal(stalled.error, 'twenty_pagination_cursor_stalled');
  assert.equal(deletes, 0, 'incomplete relation reads must never permit deletion');
  assert.ok(requests.some(request => request.offset >= 600));
  assert.ok(requests.every(request => request.urlLength < 8000), 'bounded owner filters stay below HTTP header limits');
});
