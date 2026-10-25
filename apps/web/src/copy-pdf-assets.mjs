import { cp, mkdir, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Main engine, worker and font data always come from the same verified package.
const source = new URL('../node_modules/pdfjs-dist/', import.meta.url);
const target = new URL('../dist/pdfjs-dist/', import.meta.url);
await mkdir(target, { recursive: true });
for (const asset of ['build/pdf.worker.min.mjs', 'cmaps', 'standard_fonts', 'wasm', 'LICENSE']) {
  const output = asset.startsWith('build/') ? asset.slice(6) : asset;
  await cp(fileURLToPath(new URL(asset, source)), fileURLToPath(new URL(output, target)), { recursive: true });
}

// Vite builds the reader from src so the frozen CI Dockerfile copies it.
const preview = new URL('../dist/preview/', import.meta.url);
await mkdir(preview, { recursive: true });
await rename(new URL('../dist/src/preview-frame/excel.html', import.meta.url), new URL('excel.html', preview));
await rm(new URL('../dist/src/', import.meta.url), { recursive: true, force: true });
