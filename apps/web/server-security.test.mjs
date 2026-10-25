import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('Web gateway contains files, refuses dot paths, protects the app and returns real asset errors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gbap-web-security-'));
  const web = join(root, 'web');
  await mkdir(web);
  await writeFile(join(web, 'index.html'), '<title>Security fixture</title>');
  await writeFile(join(web, 'app.js'), 'console.log("fixture")');
  await writeFile(join(web, 'worker.mjs'), 'export const fixture = true;');
  await writeFile(join(web, 'engine.wasm'), new Uint8Array([0, 97, 115, 109]));
  await mkdir(join(web, 'preview'));
  await writeFile(join(web, 'preview', 'excel.html'), '<title>Isolated Excel reader</title>');
  await writeFile(join(web, '.env'), 'private=never-return');
  await writeFile(join(root, 'secret.txt'), 'outside=never-return');
  await symlink(join(root, 'secret.txt'), join(web, 'escape.txt'));
  const child = spawn(process.execPath, [new URL('./server.mjs', import.meta.url).pathname], { env: { ...process.env, WEB_ROOT: web, PORT: '28183' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('gateway_start_failed'); }), new Promise((_, reject) => setTimeout(() => reject(new Error('gateway_start_timeout')), 5000).unref())]);
    const base = 'http://127.0.0.1:28183';
    const index = await fetch(base);
    assert.equal(index.status, 200);
    assert.equal(index.headers.get('x-content-type-options'), 'nosniff');
    assert.match(index.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(index.headers.get('content-security-policy').includes("script-src 'self' 'unsafe-inline'"), false);
    assert.equal((await fetch(`${base}/.env`)).status, 404);
    assert.equal((await fetch(`${base}/%2eenv`)).status, 404);
    assert.equal((await fetch(`${base}/bad%ZZ`)).status, 400);
    assert.equal((await fetch(`${base}/escape.txt`)).status, 403);
    assert.equal((await fetch(`${base}/missing.js`)).status, 404);
    assert.match((await fetch(`${base}/worker.mjs`)).headers.get('content-type'), /text\/javascript/);
    assert.equal((await fetch(`${base}/engine.wasm`)).headers.get('content-type'), 'application/wasm');
    assert.match((await fetch(`${base}/preview/excel.html`)).headers.get('content-security-policy'), /frame-ancestors 'self'/);
    assert.equal((await fetch(`${base}/companies`)).status, 200);
    const head = await fetch(`${base}/app.js`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal((await fetch(`${base}/app.js`, { method: 'POST', body: 'x' })).status, 405);
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null) await once(child, 'exit');
    await rm(root, { recursive: true, force: true });
  }
});
