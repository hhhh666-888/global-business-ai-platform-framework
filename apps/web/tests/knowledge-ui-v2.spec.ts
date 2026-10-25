import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { makeXlsxFixture } from './fixtures/xlsx';

type Role = 'employee' | 'manager';

const collections = [
  {
    id: 'c1',
    name: '产品与方案',
    description: '产品参数、技术方案与选型资料',
    classification: 'INTERNAL',
    visibility: 'INTERNAL',
    providerState: 'READY',
    canManage: true,
    archivedAt: null,
    createdAt: '2026-09-18T08:00:00.000Z',
    updatedAt: '2026-09-19T08:00:00.000Z',
  },
  {
    id: 'c2',
    name: '市场研究',
    description: '国家市场与行业研究',
    classification: 'INTERNAL',
    visibility: 'INTERNAL',
    providerState: 'READY',
    canManage: false,
    archivedAt: null,
    createdAt: '2026-09-17T08:00:00.000Z',
    updatedAt: '2026-09-18T08:00:00.000Z',
  },
];

function doc(id: string, collectionId: string, title: string, state = 'READY', canManage = collectionId === 'c1') {
  return {
    id,
    collectionId,
    title,
    sourceType: 'UPLOAD',
    sourceFilename: `${title}.pdf`,
    sourceLocator: null,
    classification: 'INTERNAL',
    visibility: 'INTERNAL',
    ingestionState: state,
    cleanupState: 'NONE',
    currentVersionId: `v-${id}`,
    currentVersion: {
      id: `v-${id}`,
      documentId: id,
      version: 1,
      contentChecksum: `sha256:${'a'.repeat(64)}`,
      sourceFilename: `${title}.pdf`,
      sourceLocator: null,
      mediaType: 'application/pdf',
      byteSize: 1024,
      sourceStored: true,
      createdAt: '2026-09-19T08:00:00.000Z',
    },
    canManage,
    archivedAt: null,
    createdAt: '2026-09-19T08:00:00.000Z',
    updatedAt: '2026-09-19T08:00:00.000Z',
  };
}

const documents = [
  doc('d1', 'c1', 'Alpha Manual'),
  doc('d2', 'c1', 'Beta Proposal', 'FAILED'),
  doc('d3', 'c2', 'Ecuador Market'),
  doc('d4', 'c2', 'Workbook Preview'),
  doc('d5', 'c2', 'PDF Preview'),
  doc('d6', 'c2', 'DOCX Preview'),
];
documents[2].sourceFilename = 'Ecuador Market.md';
documents[2].currentVersion.sourceFilename = 'Ecuador Market.md';
documents[2].currentVersion.mediaType = 'text/markdown';
documents[3].sourceFilename = 'Workbook Preview.xlsx';
documents[3].currentVersion.sourceFilename = 'Workbook Preview.xlsx';
documents[3].currentVersion.mediaType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
documents[4].sourceFilename = 'PDF Preview.pdf';
documents[4].currentVersion.sourceFilename = 'PDF Preview.pdf';
documents[4].currentVersion.mediaType = 'application/pdf';
documents[5].sourceFilename = 'DOCX Preview.docx';
documents[5].currentVersion.sourceFilename = 'DOCX Preview.docx';
documents[5].currentVersion.mediaType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const XLSX_FIXTURE = makeXlsxFixture('Preview', [['GBAP XLSX PREVIEW', 'Value'], ['Module', 550]]);

function createPdfFixture() {
  const stream = 'BT /F1 18 Tf 72 720 Td (GBAP PDF PREVIEW) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf, 'binary');
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'binary');
}
const PDF_FIXTURE = createPdfFixture();

async function createDocxFixture() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.folder('word')?.file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body><w:p><w:r><w:t>GBAP DOCX PREVIEW</w:t></w:r></w:p><w:sectPr/></w:body>
</w:document>`);
  zip.folder('word')?.file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr/></w:rPrDefault><w:pPrDefault><w:pPr/></w:pPrDefault></w:docDefaults>
</w:styles>`);
  zip.folder('word')?.folder('_rels')?.file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
}
const DOCX_FIXTURE = createDocxFixture();

async function installSession(page: any, role: Role = 'manager') {
  const roles = role === 'manager' ? ['substrate-user', 'substrate-manager'] : ['substrate-user'];
  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'knowledge-ui-token', id_token: 'knowledge-ui-id' }));
  });
  await page.route('http://127.0.0.1:8080/api/me', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ subject: `${role}-knowledge-user`, username: `${role}.knowledge`, roles }),
  }));
  await page.route('http://127.0.0.1:8080/api/capabilities/**', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ requestId: 'knowledge-ui', providerId: 'fixture', result: { ok: true, records: [] } }),
  }));
}

async function installKnowledgeMocks(page: any) {
  await page.route('http://127.0.0.1:8080/api/knowledge/**', async (route: any) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;

    const fulfill = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    if (method === 'GET' && path === '/api/knowledge/health') {
      return fulfill({ state: 'READY', contractVersion: 'gbap.knowledge.v1' });
    }
    if (method === 'GET' && path === '/api/knowledge/collections') {
      return fulfill({ collections });
    }
    if (method === 'GET' && path === '/api/knowledge/collections/c1') {
      return fulfill({
        collection: collections[0],
        acl: [],
        documentCounts: { total: 2, ready: 1, processing: 0, failed: 1 },
      });
    }
    if (method === 'GET' && path === '/api/knowledge/collections/c2') {
      return fulfill({
        collection: collections[1],
        acl: [],
        documentCounts: { total: 4, ready: 4, processing: 0, failed: 0 },
      });
    }
    if (method === 'GET' && path === '/api/knowledge/documents') {
      const collectionId = url.searchParams.get('collectionId');
      return fulfill({ documents: collectionId ? documents.filter((item) => item.collectionId === collectionId) : documents });
    }
    if (method === 'GET' && path === '/api/knowledge/documents/d1') {
      await new Promise((resolve) => setTimeout(resolve, 180));
      return fulfill({
        document: documents[0],
        collection: collections[0],
        canManage: true,
        versions: [documents[0].currentVersion],
        links: [],
        ingestionRuns: [{ id: 'run-d1', status: 'READY', detail: null, startedAt: '2026-09-19T08:00:00.000Z', finishedAt: '2026-09-19T08:00:01.000Z' }],
      });
    }
    if (method === 'GET' && path === '/api/knowledge/documents/d2') {
      return fulfill({
        document: documents[1],
        collection: collections[0],
        canManage: true,
        versions: [documents[1].currentVersion],
        links: [],
        ingestionRuns: [{ id: 'run-d2', status: 'FAILED', detail: 'PROVIDER_UNAVAILABLE', startedAt: '2026-09-19T08:01:00.000Z', finishedAt: '2026-09-19T08:01:01.000Z' }],
      });
    }
    if (method === 'GET' && path === '/api/knowledge/documents/d3') {
      return fulfill({ document: documents[2], collection: collections[1], canManage: false, versions: [documents[2].currentVersion], links: [], ingestionRuns: [] });
    }
    if (method === 'GET' && path === '/api/knowledge/documents/d4') {
      return fulfill({ document: documents[3], collection: collections[1], canManage: false, versions: [documents[3].currentVersion], links: [], ingestionRuns: [] });
    }
    if (method === 'GET' && path === '/api/knowledge/documents/d5') {
      return fulfill({ document: documents[4], collection: collections[1], canManage: false, versions: [documents[4].currentVersion], links: [], ingestionRuns: [] });
    }
    if (method === 'GET' && path === '/api/knowledge/documents/d6') {
      return fulfill({ document: documents[5], collection: collections[1], canManage: false, versions: [documents[5].currentVersion], links: [], ingestionRuns: [] });
    }
    if (method === 'GET' && path === '/api/knowledge/documents/d3/source') {
      return route.fulfill({
        status: 200,
        contentType: 'text/markdown; charset=utf-8',
        body: '# Ecuador Market\n\nGBAP canonical markdown preview.',
      });
    }
    if (method === 'GET' && path === '/api/knowledge/documents/d4/source') {
      return route.fulfill({
        status: 200,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: await XLSX_FIXTURE,
      });
    }
    if (method === 'GET' && path === '/api/knowledge/documents/d5/source') {
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: PDF_FIXTURE });
    }
    if (method === 'GET' && path === '/api/knowledge/documents/d6/source') {
      return route.fulfill({
        status: 200,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        body: await DOCX_FIXTURE,
      });
    }
    if (method === 'POST' && path === '/api/knowledge/documents') {
      return fulfill({
        document: { ...doc('d-upload', 'c1', 'provider-down', 'FAILED'), canManage: true },
        ingestionRunId: 'run-upload',
        providerError: 'knowledge_provider_unavailable',
      }, 202);
    }
    if (method === 'POST' && path === '/api/knowledge/search') {
      return fulfill({
        query: '550W',
        results: [{
          knowledgeDocumentId: 'd1',
          knowledgeDocumentVersionId: 'v-d1',
          collectionId: 'c1',
          chunkId: 'chunk:fixture',
          text: 'Yingli 550W photovoltaic module.',
          score: 0.92,
          page: 3,
          section: null,
          sourceTitle: 'Alpha Manual',
          contractVersion: 'gbap.knowledge.v1',
        }],
      });
    }
    if (method === 'POST' && path.endsWith('/retry')) {
      const id = path.split('/').at(-2);
      return fulfill({ document: documents.find((item) => item.id === id), ingestionRunId: `retry-${id}` });
    }
    if (method === 'PUT' && path.endsWith('/acl')) return fulfill({ entries: [] });
    if (method === 'PATCH' && path.startsWith('/api/knowledge/collections/')) return fulfill({ collection: collections[0] });
    if (method === 'DELETE' && path.startsWith('/api/knowledge/documents/')) return fulfill({ archived: true, document: documents[0] });
    return fulfill({ error: 'not_found' }, 404);
  });
}

async function openKnowledge(page: any, role: Role = 'manager') {
  await installSession(page, role);
  await installKnowledgeMocks(page);
  await page.goto('/');
  await page.locator('aside.sidebar').getByRole('button', { name: '企业知识库', exact: true }).click();
  await expect(page.getByTestId('knowledge-surface')).toBeVisible();
}

test('Knowledge UI V2 keeps collection overview scoped and never leaves a blank governance view', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop Knowledge product acceptance');
  await openKnowledge(page);

  await page.locator('.knowledge-sidebar').getByRole('button', { name: /产品与方案/ }).click();
  await page.getByRole('button', { name: '概览', exact: true }).click();
  await expect(page.getByText('当前范围共 2 份资料', { exact: true })).toBeVisible();
  await expect(page.getByText('当前页面统计仅针对“产品与方案”。', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '权限与治理', exact: true }).click();
  await expect(page.getByText('知识库设置', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /全部知识/ }).click();
  await expect(page.getByRole('button', { name: '概览', exact: true })).toHaveClass(/active/);
  await expect(page.getByText('跨知识库浏览、检索和管理你有权限访问的企业知识。', { exact: true })).toBeVisible();
});

test('Knowledge UI V2 prevents stale document detail from winning a rapid selection race', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop Knowledge product acceptance');
  await openKnowledge(page);
  await page.locator('.knowledge-sidebar').getByRole('button', { name: /产品与方案/ }).click();

  await page.getByRole('button', { name: /Alpha Manual/ }).click();
  await page.getByRole('button', { name: /Beta Proposal/ }).click();

  const inspector = page.locator('.knowledge-inspector');
  await expect(inspector).toContainText('Beta Proposal');
  await page.waitForTimeout(260);
  await expect(inspector).toContainText('Beta Proposal');
  await expect(inspector).not.toContainText('Alpha Manual');
  await inspector.getByRole('button', { name: '处理记录', exact: true }).click();
  await expect(inspector.getByText('检索服务暂时不可用', { exact: true })).toBeVisible();
  await expect(inspector.getByText('耗时：1 秒', { exact: true })).toBeVisible();
});

test('Knowledge UI V2 reports canonical-only uploads truthfully instead of claiming indexing success', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop Knowledge product acceptance');
  await openKnowledge(page);
  await page.locator('.knowledge-sidebar').getByRole('button', { name: /产品与方案/ }).click();

  await page.getByLabel('选择知识库文档').setInputFiles({
    name: 'provider-down.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('provider down fixture'),
  });
  await page.getByRole('button', { name: '上传 1 份文档', exact: true }).click();

  await expect(page.getByRole('alert')).toContainText('0 份已进入检索流程');
  await expect(page.getByRole('alert')).toContainText('1 份原件已安全保存但暂不可检索');
});

test('Knowledge processing timeout and retry errors give actionable guidance', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', error => consoleErrors.push(error.message));
  await openKnowledge(page);
  await page.route('**/api/knowledge/documents/d2', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    document: documents[1], collection: collections[0], canManage: true, versions: [documents[1].currentVersion], links: [],
    ingestionRuns: [{ id: 'timed-out', status: 'FAILED', detail: 'PROCESSING_TIMEOUT', startedAt: '2026-10-02T08:00:00Z', finishedAt: '2026-10-02T09:00:00Z' }],
  }) }));
  await page.route('**/api/knowledge/documents/d2/retry', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'knowledge_provider_operation_failed' }) }));
  await page.locator('.knowledge-sidebar').getByRole('button', { name: /产品与方案/ }).click();
  await page.getByRole('button', { name: /Beta Proposal/ }).click();
  const inspector = page.locator('.knowledge-inspector');
  await inspector.getByRole('button', { name: '处理记录', exact: true }).click();
  await expect(inspector).toContainText('处理超过时限，原件已保留，请检查服务后重新处理');
  await inspector.getByRole('button', { name: '概览', exact: true }).click();
  await inspector.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('请打开文件的“处理记录”查看状态');
  await expect(page.getByRole('alert')).not.toContainText('文档重试失败');
  await page.screenshot({ path: testInfo.outputPath('knowledge-processing-failure.png'), fullPage: false });
  expect(consoleErrors).toEqual([]);
});

test('Knowledge inspector follows refreshed processing history without switching its tab', async ({ page }, testInfo) => {
  await openKnowledge(page);
  let refreshed = false;
  await page.route('**/api/knowledge/documents?**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents: [documents[0], { ...documents[1], updatedAt: refreshed ? '2026-10-03T09:00:00Z' : documents[1].updatedAt }] }) }));
  await page.route('**/api/knowledge/documents', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents: documents.map(item => item.id === 'd2' && refreshed ? { ...item, updatedAt: '2026-10-03T09:00:00Z' } : item) }) }));
  await page.route('**/api/knowledge/documents/d2', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    document: documents[1], collection: collections[0], canManage: true, versions: [documents[1].currentVersion], links: [],
    ingestionRuns: [{ id: 'new-processing-history', status: 'FAILED', detail: refreshed ? 'PROCESSING_RESOURCE_LIMIT' : 'PROVIDER_UNAVAILABLE', startedAt: '2026-10-03T08:00:00Z', finishedAt: '2026-10-03T09:00:00Z' }],
  }) }));
  await page.locator('.knowledge-sidebar').getByRole('button', { name: /产品与方案/ }).click();
  await page.getByRole('button', { name: /Beta Proposal/ }).click();
  const inspector = page.locator('.knowledge-inspector');
  await inspector.getByRole('button', { name: '处理记录', exact: true }).click();
  await expect(inspector).toContainText('检索服务暂时不可用');
  refreshed = true;
  await inspector.getByRole('button', { name: '刷新文档详情', exact: true }).click();
  await expect(inspector).toContainText('文件解析超出资源限制，原件已保留');
  await expect(inspector).toContainText('请拆分文件，或联系管理员调整处理资源');
  await expect(inspector.getByRole('button', { name: '处理记录', exact: true })).toHaveClass(/active/);
  await page.screenshot({ path: testInfo.outputPath('knowledge-history-refreshed.png'), fullPage: true });
});

test('ordinary employees can read/search Knowledge but cannot create governed Knowledge spaces', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop Knowledge product acceptance');
  await openKnowledge(page, 'employee');

  await expect(page.getByRole('button', { name: '+ 新建知识库', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '检索测试', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '知识检索', exact: true }).click();
  await page.getByLabel('搜索企业知识').fill('550W');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.getByText('Yingli 550W photovoltaic module.', { exact: true })).toBeVisible();
  await expect(page.getByText('相关度 92%', { exact: false })).toBeVisible();
});

test('manager can run retrieval quality validation with threshold and result-count controls', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop Knowledge product acceptance');
  await openKnowledge(page, 'manager');

  await page.getByRole('button', { name: '检索测试', exact: true }).click();
  await expect(page.getByText('检索质量验证', { exact: true })).toBeVisible();
  const threshold = page.getByLabel('最低相关度');
  await threshold.focus();
  await threshold.press('Home');
  for (let index = 0; index < 10; index += 1) await threshold.press('ArrowRight');
  await expect(page.getByText('50%', { exact: true })).toBeVisible();
  await page.getByLabel('检索测试问题').fill('550W');

  const searchRequest = page.waitForRequest((request) => request.url().endsWith('/api/knowledge/search') && request.method() === 'POST');
  await page.getByRole('button', { name: '运行检索测试', exact: true }).click();
  const request = await searchRequest;
  expect(request.postDataJSON()).toMatchObject({ query: '550W', topK: 10, minimumScore: 0.5 });

  await expect(page.getByText('Yingli 550W photovoltaic module.', { exact: true })).toBeVisible();
  await expect(page.getByText('92.00%', { exact: true })).toBeVisible();
});

test('Knowledge document preview reads the GBAP canonical source for supported text formats', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop Knowledge product acceptance');
  await openKnowledge(page, 'manager');

  await page.locator('.knowledge-sidebar').getByRole('button', { name: /市场研究/ }).click();
  await page.getByRole('button', { name: /Ecuador Market/ }).click();
  const inspector = page.locator('.knowledge-inspector');
  await inspector.getByRole('button', { name: '预览', exact: true }).click();
  await expect(inspector.getByRole('heading', { name: 'Ecuador Market', exact: true })).toBeVisible();
  await expect(inspector.getByText('GBAP canonical markdown preview.', { exact: true })).toBeVisible();
});

test('RAGFlow Stage B XLSX preview renders a real workbook from canonical source bytes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop Knowledge product acceptance');
  await openKnowledge(page, 'manager');
  await page.locator('.knowledge-sidebar').getByRole('button', { name: /市场研究/ }).click();
  await page.getByRole('button', { name: /Workbook Preview/ }).click();
  const inspector = page.locator('.knowledge-inspector');
  await inspector.getByRole('button', { name: '预览', exact: true }).click();
  const preview = inspector.locator('.knowledge-excel-preview');
  await expect(preview).toBeVisible();
  await expect(inspector.frameLocator('iframe.knowledge-excel-preview').locator('.vue-office-excel-main')).toBeVisible();
  await expect(inspector.getByText(/XLSX 文件无法预览|XLSX 预览刷新失败/)).toHaveCount(0);
});

test('RAGFlow Stage B PDF preview loads through the pinned local PDF.js worker', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop Knowledge product acceptance');
  await openKnowledge(page, 'manager');
  await page.locator('.knowledge-sidebar').getByRole('button', { name: /市场研究/ }).click();
  await page.getByRole('button', { name: /PDF Preview/ }).click();
  const inspector = page.locator('.knowledge-inspector');
  await inspector.getByRole('button', { name: '预览', exact: true }).click();
  await expect(inspector.locator('.knowledge-pdf-highlighter')).toBeVisible();
  await expect(inspector.locator('.PdfHighlighter')).toBeVisible();
  await expect(inspector.getByText(/PDF 文件无法预览/)).toHaveCount(0);
});

test('RAGFlow Stage B DOCX preview parses a canonical DOCX blob in read-only mode', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop Knowledge product acceptance');
  await openKnowledge(page, 'manager');
  await page.locator('.knowledge-sidebar').getByRole('button', { name: /市场研究/ }).click();
  await page.getByRole('button', { name: /DOCX Preview/ }).click();
  const inspector = page.locator('.knowledge-inspector');
  await inspector.getByRole('button', { name: '预览', exact: true }).click();
  await expect(inspector.locator('.knowledge-docx-preview')).toBeVisible();
  await expect(inspector.locator('.knowledge-docx-canvas')).toBeVisible();
  await expect(inspector.getByText(/DOCX 文件无法预览|DOCX 预览不可用/)).toHaveCount(0);
});

test('employee-facing Knowledge surfaces do not expose internal engineering terminology', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop Knowledge product acceptance');
  await openKnowledge(page, 'manager');

  for (const forbidden of [
    'RAGFlow Process Log 范式',
    'canonical ingestion run',
    'Provider 原始 ID',
    'RAGFlow Retrieval Testing 范式',
    'RAGFlow Adapter',
    'Hybrid Similarity',
    '当前 Stage B',
    'GBAP canonical source',
  ]) {
    await expect(page.getByText(forbidden, { exact: false })).toHaveCount(0);
  }

  await page.getByRole('button', { name: '检索测试', exact: true }).click();
  await expect(page.getByText('检索质量验证', { exact: true })).toBeVisible();
  await expect(page.getByText('最多返回', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /文档中心/ }).click();
  await page.locator('.knowledge-sidebar').getByRole('button', { name: /产品与方案/ }).click();
  await page.getByRole('button', { name: /Alpha Manual/ }).click();
  const inspector = page.locator('.knowledge-inspector');
  await inspector.getByRole('button', { name: '处理记录', exact: true }).click();
  await expect(inspector.getByText('查看文档处理状态、开始时间、结束时间和耗时，便于定位失败任务。', { exact: true })).toBeVisible();
});

test('Knowledge UI V2 mobile layout preserves usable width without horizontal overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile Knowledge responsive acceptance');
  await openKnowledge(page, 'employee');

  await expect(page.getByRole('button', { name: '文档中心', exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '知识检索', exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});


test('Knowledge links select a company by name and persist its canonical identity', async ({ page }) => {
  await openKnowledge(page);
  await page.route('**/api/capabilities/crm.v1.account.list/invoke', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: { records: [{ businessId: 'account-ecuador', businessType: 'Account', displayName: '厄瓜多尔客户公司' }] } }) }));
  let saved: any;
  await page.route('**/api/knowledge/documents/d1/links', route => {
    saved = route.request().postDataJSON();
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ links: saved.links }) });
  });
  await page.locator('.knowledge-sidebar').getByRole('button', { name: /产品与方案/ }).click();
  await page.getByRole('button', { name: /Alpha Manual/ }).click();
  const inspector = page.locator('.knowledge-inspector');
  await inspector.getByRole('button', { name: '业务关联', exact: true }).click();
  const picker = inspector.getByRole('combobox', { name: '选择关联业务记录' });
  await expect(picker).toBeEnabled(); await picker.fill('厄瓜多尔');
  await inspector.getByRole('option', { name: '厄瓜多尔客户公司', exact: true }).click();
  await inspector.getByRole('button', { name: '关联', exact: true }).click();
  await expect(inspector.locator('.knowledge-link-chip')).toContainText('account-ecuador');
  expect(saved.links).toEqual([{ businessType: 'Account', businessId: 'account-ecuador' }]);
});

test('Knowledge revision upload keeps the document identity and historical source downloads', async ({ page }) => {
  await openKnowledge(page);
  let latest = documents[0]; let payload: any;
  const versions = [documents[0].currentVersion];
  await page.route('**/api/knowledge/documents/d1', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ document: latest, collection: collections[0], canManage: true, versions, links: [], ingestionRuns: [] }) }));
  await page.route('**/api/knowledge/documents/d1/versions', route => {
    payload = route.request().postDataJSON();
    const version = { ...versions[0], id: 'version-2', version: 2, sourceFilename: payload.sourceFilename };
    versions.unshift(version); latest = { ...latest, currentVersionId: version.id, currentVersion: version, sourceFilename: version.sourceFilename, updatedAt: '2026-10-03T10:00:00Z' };
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ document: latest, ingestionRunId: 'revision-run' }) });
  });
  await page.locator('.knowledge-sidebar').getByRole('button', { name: /产品与方案/ }).click();
  await page.getByRole('button', { name: /Alpha Manual/ }).click();
  const inspector = page.locator('.knowledge-inspector');
  await inspector.getByRole('button', { name: '版本 1', exact: true }).click();
  await page.getByLabel('选择文档新版本').setInputFiles({ name: '新版资料.txt', mimeType: 'text/plain', buffer: Buffer.from('Updated enterprise document.') });
  await expect(inspector).toContainText('v2 · 当前版本');
  expect(payload.expectedVersionId).toBe('v-d1');
  expect(Buffer.from(payload.contentBase64, 'base64').toString()).toBe('Updated enterprise document.');
  const sourceRequest = page.waitForRequest(request => request.url().includes('versionId=v-d1'));
  await inspector.getByRole('button', { name: '下载版本 1', exact: true }).click();
  await sourceRequest;
});
