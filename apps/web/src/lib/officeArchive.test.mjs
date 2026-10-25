import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { inspectOfficeArchive, safeOfficeBytes } from './officeArchive.ts';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');

test('Office archive guard accepts normal deflate and stored Office files', async () => {
  for (const compression of ['STORE', 'DEFLATE']) {
    const zip = new JSZip(); zip.file('word/document.xml', '<document>Safe fixture</document>');
    const bytes = await zip.generateAsync({ type: 'arraybuffer', compression });
    assert.equal(inspectOfficeArchive(bytes).length, 2);
    assert.equal((await safeOfficeBytes(new Blob([bytes]))).byteLength, bytes.byteLength);
  }
});
test('Office archive guard rejects declared and disguised expansion bombs before preview', async () => {
  const zip = new JSZip(); zip.file('word/document.xml', 'x'.repeat(200000));
  const original = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  const entries = inspectOfficeArchive(original);
  assert.equal(entries[1].expanded, 200000);
  for (const declared of [512 * 1024 * 1024, 1]) {
    const bytes = original.slice(0); const view = new DataView(bytes);
    for (let offset = 0; offset < bytes.byteLength - 46; offset++) {
      if (view.getUint32(offset, true) === 0x02014b50 && view.getUint32(offset + 24, true) === 200000) view.setUint32(offset + 24, declared, true);
    }
    await assert.rejects(safeOfficeBytes(new Blob([bytes])), /office_archive_expansion_limit/);
  }
});
test('Office archive guard rejects traversal and truncated archives', async () => {
  const zip = new JSZip(); zip.file('../secret.xml', 'outside');
  const bytes = await zip.generateAsync({ type: 'arraybuffer' });
  assert.throws(() => inspectOfficeArchive(bytes), /office_archive_invalid_path/);
  assert.throws(() => inspectOfficeArchive(bytes.slice(0, 10)), /office_archive_size/);
});
