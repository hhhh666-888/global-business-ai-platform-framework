import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const surface = readFileSync('apps/web/src/components/KnowledgeSurface.tsx', 'utf8');
const styles = readFileSync('apps/web/src/components/knowledge-surface.css', 'utf8');
const client = readFileSync('apps/web/src/lib/knowledgeClient.ts', 'utf8');
const browser = readFileSync('apps/web/tests/knowledge-ui-v2.spec.ts', 'utf8');
const api = readFileSync('apps/api/knowledge-native.mjs', 'utf8');
const retrieval = readFileSync('apps/web/src/components/KnowledgeRetrievalTest.tsx', 'utf8');
const preview = readFileSync('apps/web/src/components/KnowledgeDocumentPreview.tsx', 'utf8');
const previewPorts = [
  'apps/web/src/components/knowledge-preview/RagflowDocxPreview.tsx',
  'apps/web/src/components/knowledge-preview/RagflowExcelPreview.tsx',
  'apps/web/src/components/knowledge-preview/RagflowPptxPreview.tsx',
  'apps/web/src/components/knowledge-preview/RagflowPdfPreview.tsx',
  'apps/web/src/components/knowledge-preview/RagflowMarkdownPreview.tsx',
].map((path) => readFileSync(path, 'utf8')).join('\n');

const requiredSurfaceContracts = [
  'GBAP KNOWLEDGE',
  '企业知识库',
  "'overview' | 'documents' | 'search' | 'testing' | 'governance'",
  '全部知识',
  '概览',
  '文档中心',
  '知识检索',
  '权限与治理',
  '检索测试',
  '预览',
  '拖拽文件到这里，或批量选择上传',
  '一次最多 20 份',
  '版本 {documentDetail.versions.length}',
  '处理记录',
  '业务关联',
  '最近 7 天活动',
  '不经过 AI 生成',
  '查看当前知识库的文档处理与检索状态。',
  'canCreateCollection',
  'role="dialog"',
  'aria-label="搜索企业知识"',
  'document.canManage',
  '原件已安全保存但暂不可检索',
  '文件完整性',
  '已校验',
  '查看文档处理状态、开始时间、结束时间和耗时，便于定位失败任务。',
];

for (const contract of requiredSurfaceContracts) {
  assert.ok(surface.includes(contract), `missing Knowledge UI V2 contract: ${contract}`);
}

for (const forbidden of ['AI 助手', '模型配置', 'RAGFlow 后台', 'ownerSubject']) {
  assert.equal(surface.includes(forbidden), false, `employee Knowledge UI must not expose excluded/internal surface: ${forbidden}`);
}

const employeeCopy = [surface, retrieval, preview, previewPorts].join('\n');
for (const forbiddenCopy of [
  'RAGFlow Process Log 范式',
  'canonical ingestion run',
  'Provider 原始 ID',
  'RAGFlow Retrieval Testing 范式',
  '检索 Provider',
  'RAGFlow Adapter',
  'Hybrid Similarity',
  '返回数量 Top-K',
  '当前 Stage B',
  'GBAP canonical source',
  '恢复边界',
  '检索索引',
  'DOCX ZIP 文档',
  '解析失败，请下载原件查看',
  '重新渲染失败',
]) {
  assert.equal(employeeCopy.includes(forbiddenCopy), false, `employee-facing Knowledge copy must not expose engineering terminology: ${forbiddenCopy}`);
}

for (const requiredCopy of [
  '检索质量验证',
  '最多返回',
  '相关度',
  '正在加载原始文件',
  '原件已安全保存，可以下载查看',
  '企业资料按权限安全管理',
]) {
  assert.ok(employeeCopy.includes(requiredCopy), `missing employee-facing Knowledge copy: ${requiredCopy}`);
}

assert.ok(surface.includes('multiple accept='), 'batch file selection must remain enabled');
assert.ok(surface.includes('searchScope'), 'cross-collection/current-collection search scope must remain explicit');
assert.ok(surface.includes('selectedDocumentIds'), 'document selection/bulk workflow must remain present');
assert.ok(surface.includes('documentDetail.ingestionRuns'), 'processing history must be backed by real API detail');
assert.ok(surface.includes('documentDetail.versions'), 'version history must be backed by real API detail');
assert.ok(surface.includes('replaceKnowledgeBusinessLinks'), 'business links must remain a real persisted operation');
assert.ok(surface.includes('replaceKnowledgeAcl'), 'ACL governance must remain a real persisted operation');

for (const forbiddenClientField of ['providerId', 'providerProvenance', 'ownerSubject', 'organizationScope', 'workspaceScope']) {
  assert.equal(client.includes(forbiddenClientField), false, `browser Knowledge contract must not expose internal field: ${forbiddenClientField}`);
}

assert.ok(api.includes('requireKnowledgeManager(actor)'), 'Knowledge collection create must be manager/admin governed');
assert.ok(api.includes('validateKnowledgeSecurityPair(classification, visibility)'), 'sensitive classification visibility must fail closed');
assert.ok(api.includes('publicKnowledgeHttpError'), 'provider/internal errors must be redacted at the HTTP boundary');
assert.ok(api.includes('publicIngestionDetail'), 'processing history details must use public-safe error codes');

for (const browserProof of [
  'never leaves a blank governance view',
  'prevents stale document detail from winning a rapid selection race',
  'reports canonical-only uploads truthfully',
  'ordinary employees can read/search Knowledge but cannot create governed Knowledge spaces',
  'manager can run retrieval quality validation with threshold and result-count controls',
  'Knowledge document preview reads the GBAP canonical source for supported text formats',
  'mobile layout preserves usable width without horizontal overflow',
]) {
  assert.ok(browser.includes(browserProof), `missing Knowledge browser regression proof: ${browserProof}`);
}

for (const cssContract of [
  '.knowledge-workspace',
  '.knowledge-kpis',
  '.knowledge-documents-layout',
  '.knowledge-inspector',
  '.knowledge-search-hero',
  '.knowledge-retrieval-test',
  '.knowledge-preview-state',
  '.knowledge-governance-grid',
  '@media(max-width:760px)',
  '@media(max-width:520px)',
]) {
  assert.ok(styles.includes(cssContract), `missing Knowledge UI V2 visual contract: ${cssContract}`);
}

console.log(JSON.stringify({
  gate: 'KNOWLEDGE_UI_V2_PRODUCT_CONTRACT',
  result: 'PASS',
  views: ['overview', 'documents', 'search', 'testing', 'governance'],
  aiScope: 'EXCLUDED_SEPARATE_TOPIC',
  providerTechnicalUi: 'HIDDEN',
  collectionCreation: 'MANAGER_OR_ADMIN',
  sensitiveVisibility: 'FAIL_CLOSED',
  browserRegressionSuite: 'PRESENT',
}));
