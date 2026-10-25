import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

async function listen(server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return server.address().port;
}

test('CRM files preserve Unicode names and bytes and list only the selected company', async t => {
  const work = mkdtempSync(join(tmpdir(), 'gbap-crm-files-'));
  const dbPath = join(work, 'files.db');
  const seed = new DatabaseSync(dbPath);
  seed.exec(`CREATE TABLE external_mapping (id TEXT PRIMARY KEY, business_type TEXT, business_id TEXT);
    CREATE TABLE audit_event (id TEXT PRIMARY KEY,actor_subject TEXT,actor_username TEXT,action TEXT,target TEXT,occurred_at TEXT,payload_json TEXT);`);
  seed.prepare('INSERT INTO external_mapping VALUES(?,?,?)').run('company-1', 'Account', 'company-1');
  seed.close();
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = 'crm-files-key';
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
  const jwks = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ keys: [jwk] }));
  });
  const issuer = `http://127.0.0.1:${await listen(jwks)}/realm`;
  process.env.DB_PATH = dbPath;
  process.env.OIDC_ISSUER = issuer;
  process.env.OIDC_ALLOWED_ISSUERS = issuer;
  process.env.OIDC_JWKS_URL_INTERNAL = issuer;
  const { createCrmNativeHandler } = await import('../crm-native.mjs');
  const handler = createCrmNativeHandler();
  const api = http.createServer(async (req, res) => {
    if (!await handler(req, res)) res.writeHead(404).end();
  });
  const base = `http://127.0.0.1:${await listen(api)}/api/crm-native/files`;
  t.after(() => { api.closeAllConnections(); api.close(); jwks.closeAllConnections(); jwks.close(); rmSync(work, { recursive: true, force: true }); });
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'file-user', iss: issuer, azp: 'gbap-web', exp: now + 300, realm_access: { roles: ['substrate-user'] } })).toString('base64url');
  const token = `${header}.${payload}.${sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url')}`;
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const request = (suffix = '', options = {}) => fetch(base + suffix, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(3000) });

  await t.test('requires authentication', async () => {
    assert.equal((await fetch(base)).status, 401);
  });
  let companyFile;
  for (const [fileName, size] of [['small.txt', 23], ['公司账单（九月）.pdf', 512 * 1024], ["合同'()*.docx", 5 * 1024 * 1024]]) {
    await t.test(`upload/download ${fileName} (${size} bytes)`, async () => {
      const content = Buffer.alloc(size, 65);
      const created = await request('', { method: 'POST', body: JSON.stringify({ fileName, mimeType: 'application/octet-stream', sizeBytes: size, contentBase64: content.toString('base64'), target: { businessType: 'Account', businessId: 'company-1' } }) });
      assert.equal(created.status, 201);
      const { file } = await created.json();
      companyFile ??= file;
      const response = await request(`/${file.id}/content`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-length'), String(size));
      const disposition = response.headers.get('content-disposition');
      assert.match(disposition, /^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''/);
      assert.equal(decodeURIComponent(disposition.split("filename*=UTF-8''")[1]), fileName);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), content);
    });
  }
  await t.test('filters before the global 500-file cap and excludes deleted/unlinked files', async () => {
    const db = new DatabaseSync(dbPath);
    const insert = db.prepare('INSERT INTO crm_file(id,file_name,mime_type,size_bytes,content,target_business_type,target_business_id,created_by,created_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
    db.exec('BEGIN');
    for (let i = 0; i < 510; i++) insert.run(randomUUID(), 'other.txt', 'text/plain', 1, Buffer.from('x'), 'Account', 'company-2', 'file-user', '2099-01-01', null);
    insert.run('unlinked', 'unlinked.txt', 'text/plain', 1, Buffer.from('x'), null, null, 'file-user', '2099-01-01', null);
    insert.run('deleted', 'deleted.txt', 'text/plain', 1, Buffer.from('x'), 'Account', 'company-1', 'file-user', '2099-01-01', '2099-01-02');
    db.exec('COMMIT');
    db.close();
    const global = await (await request()).json();
    assert.equal(global.files.length, 500);
    assert(!global.files.some(file => file.id === companyFile.id));
    const selected = await (await request('?businessType=Account&businessId=company-1')).json();
    assert.equal(selected.files.length, 3);
    assert(selected.files.every(file => file.target.businessId === 'company-1'));
    assert.equal((await (await request('?businessType=Account&businessId=missing')).json()).files.length, 0);
    assert.equal((await request('?businessId=company-1')).status, 400);
    assert.equal((await request('?businessType=Unexpected&businessId=company-1')).status, 400);
  });
  await t.test('soft-deleted content cannot be downloaded', async () => {
    assert.equal((await request(`/${companyFile.id}`, { method: 'DELETE' })).status, 200);
    const response = await request(`/${companyFile.id}/content`);
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, 'file_not_found');
  });
});
