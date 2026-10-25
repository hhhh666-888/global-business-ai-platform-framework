import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const map = readFileSync('docs/architecture/GBAP_KNOWLEDGE_RAGFLOW_REUSE_MAP_v0.1.md', 'utf8');
const preview = readFileSync('apps/web/src/components/KnowledgeDocumentPreview.tsx', 'utf8');
const retrieval = readFileSync('apps/web/src/components/KnowledgeRetrievalTest.tsx', 'utf8');
const surface = readFileSync('apps/web/src/components/KnowledgeSurface.tsx', 'utf8');
const pkg = JSON.parse(readFileSync('apps/web/package.json', 'utf8'));
const stageB = readFileSync('docs/architecture/GBAP_KNOWLEDGE_RAGFLOW_PREVIEW_STAGE_B_v0.1.md', 'utf8');
const pdfAssets = readFileSync('apps/web/src/copy-pdf-assets.mjs', 'utf8');

const portFiles = [
  'apps/web/src/components/knowledge-preview/RagflowDocxPreview.tsx',
  'apps/web/src/components/knowledge-preview/RagflowExcelPreview.tsx',
  'apps/web/src/components/knowledge-preview/RagflowPptxPreview.tsx',
  'apps/web/src/components/knowledge-preview/RagflowPdfPreview.tsx',
  'apps/web/src/components/knowledge-preview/RagflowMarkdownPreview.tsx',
];

for (const required of [
  'RAGFlow v0.27.2',
  'a024bea0cd93f39e6652a42bf84dd20c55bc560b',
  'Apache License 2.0',
  'web/src/pages/dataset/testing/testing-form.tsx',
  'web/src/pages/dataset/testing/testing-result.tsx',
  'web/src/components/document-preview/index.tsx',
  'web/src/pages/dataset/process-log-modal.tsx',
  'PORT_NOW',
  'DIRECT_PORT_AFTER_SUPPLY',
  'PROVIDER_EXTENSION',
  'GBAP_NATIVE_KEEP',
  'EXCLUDE_EMPLOYEE_UI',
]) {
  assert.ok(map.includes(required), `missing RAGFlow reuse map contract: ${required}`);
}

for (const required of [
  'RAGFlow Preview Stage B v0.1',
  'canonical Blob input',
  '34588aa106983006eb8090666852c7dbb6adf190',
  'PPTX has compile/runtime component integration',
  'Production remains **NOT AUTHORIZED**',
]) {
  assert.ok(stageB.includes(required), `missing Stage B authority contract: ${required}`);
}
assert.ok(pdfAssets.includes("'LICENSE'"), 'PDF.js distribution must retain the engine license');

assert.ok(preview.includes('downloadKnowledgeSource(document.id)'), 'preview must use canonical GBAP source bytes');
for (const routed of [
  'RagflowPdfPreview',
  'RagflowDocxPreview',
  'RagflowExcelPreview',
  'RagflowPptxPreview',
  'RagflowMarkdownPreview',
]) {
  assert.ok(preview.includes(routed), `preview dispatcher must route through ${routed}`);
}
assert.equal(preview.includes('ragflow'), false, 'dispatcher must not contain raw RAGFlow endpoint/provider references');
assert.ok(preview.includes('TEXT_EXTENSIONS'), 'preview must keep bounded text fallback');
assert.ok(preview.includes('IMAGE_EXTENSIONS'), 'preview must keep image preview');

const expectedDependencies = {
  '@extend-ai/react-docx': '^0.6.7',
  '@js-preview/excel': '^1.7.14',
  'pptx-preview': '^1.0.5',
  'pdfjs-dist': '6.3.289',
  'react-markdown': '^9.0.1',
  jszip: '^3.10.1',
};
for (const [name, spec] of Object.entries(expectedDependencies)) {
  assert.equal(pkg.dependencies?.[name], spec, `preview dependency must match admitted spec: ${name}`);
}

for (const file of portFiles) {
  const source = readFileSync(file, 'utf8');
  assert.ok(source.includes('Copyright 2026 The InfiniFlow Authors. All Rights Reserved.'), `missing upstream copyright: ${file}`);
  assert.ok(source.includes('Licensed under the Apache License, Version 2.0'), `missing Apache-2.0 header: ${file}`);
  assert.ok(source.includes('a024bea0cd93f39e6652a42bf84dd20c55bc560b'), `missing pinned upstream commit: ${file}`);
  assert.equal(/https?:\/\/.*ragflow|\/api\/v1\/.*documents|Authorization/i.test(source), false, `ported preview must not use raw RAGFlow URL/auth: ${file}`);
}

const docx = readFileSync(portFiles[0], 'utf8');
assert.ok(docx.includes('@extend-ai/react-docx'), 'DOCX port must use RAGFlow preview engine');
assert.ok(docx.includes('ensureDefaultLineSpacing'), 'DOCX port must retain RAGFlow CJK line-spacing normalization');

const excel = readFileSync(portFiles[1], 'utf8');
assert.equal(pkg.dependencies?.xlsx, undefined, 'obsolete SheetJS must not be a production dependency');
assert.equal(excel.includes("from 'xlsx'"), false, 'untrusted workbook parsing must not use obsolete SheetJS');
assert.ok(excel.includes('safeOfficeBytes'), 'Office preview must enforce bounded expansion');
const excelFrame = readFileSync('apps/web/src/preview-frame/excel.ts', 'utf8');
assert.ok(excelFrame.includes("from '@js-preview/excel'"), 'isolated XLSX reader must use the RAGFlow preview engine');
assert.ok(excelFrame.includes('xls: false'), 'bundled legacy binary SheetJS path must remain disabled');
assert.ok(excel.includes('event.source !== frameRef.current?.contentWindow'), 'XLSX messages must be scoped to the current reader');
assert.ok(excel.includes('stripWpsDispImg'), 'XLSX port must retain RAGFlow WPS DISPIMG protection');
assert.ok(excel.includes('normalizeXlsxForExcelJS'), 'XLSX port must retain namespace normalization');
assert.ok(excel.includes('sanitizeSheetNames'), 'XLSX port must retain sheet-name sanitation');

const ppt = readFileSync(portFiles[2], 'utf8');
assert.ok(ppt.includes("from 'pptx-preview'"), 'PPTX port must use upstream preview engine');

const pdf = readFileSync(portFiles[3], 'utf8');
assert.ok(pdf.includes("from 'pdfjs-dist'"), 'PDF preview must use the patched stable PDF.js engine');
assert.ok(pdf.includes('enableXfa: false'), 'PDF preview must disable interactive XFA forms');
assert.equal(pkg.dependencies?.['react-pdf-highlighter'], undefined, 'vulnerable legacy PDF wrapper must be retired');
assert.ok(pdf.includes('/pdfjs-dist/pdf.worker.min.mjs'), 'PDF port must use bundled pinned worker');

const markdown = readFileSync(portFiles[4], 'utf8');
assert.ok(markdown.includes('react-markdown'), 'Markdown port must use upstream renderer');

assert.ok(retrieval.includes('searchKnowledge({'), 'retrieval test must use the canonical Knowledge search API');
assert.ok(retrieval.includes('minimumScore'), 'retrieval test must expose minimum score');
assert.ok(retrieval.includes('topK'), 'retrieval test must expose Top-K');
assert.ok(retrieval.includes('检索质量验证'), 'retrieval test must expose business-facing quality-validation copy');

assert.ok(surface.includes("'testing'"), 'Knowledge main navigation must include the retrieval-test view');
assert.ok(surface.includes("'preview'"), 'document inspector must include preview');
assert.ok(surface.includes('查看文档处理状态、开始时间、结束时间和耗时'), 'processing log must expose business-facing processing guidance');

console.log(JSON.stringify({
  gate: 'KNOWLEDGE_RAGFLOW_REUSE_V1',
  result: 'PASS',
  upstream: {
    product: 'RAGFlow',
    version: '0.27.2',
    commit: 'a024bea0cd93f39e6652a42bf84dd20c55bc560b',
    license: 'Apache-2.0',
  },
  batch1: ['retrieval-test', 'processing-log-pattern', 'canonical-source-preview'],
  stageB: ['docx', 'xlsx', 'pptx', 'pdf-js-viewer', 'markdown'],
  canonicalSourceOnly: true,
  rawProviderSurface: 'EXCLUDED',
  aiScope: 'EXCLUDED_SEPARATE_TOPIC',
}));
