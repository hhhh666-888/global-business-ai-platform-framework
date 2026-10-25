import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { makeXlsxFixture } from './fixtures/xlsx';

const content = Buffer.alloc(512 * 1024, 65);
const accounts = [
  { businessId: 'files-company-a', businessType: 'Account', externalId: 'external-a', externalType: 'company', displayName: '文件验证公司 A' },
  { businessId: 'files-company-b', businessType: 'Account', externalId: 'external-b', externalType: 'company', displayName: '文件验证公司 B' },
];
const companyFile = { id: 'chinese-file', fileName: '公司账单（九月）.pdf', mimeType: 'application/pdf', sizeBytes: content.length, target: { businessType: 'Account', businessId: 'files-company-a' }, createdBy: 'file-user', createdAt: '2026-10-01T00:00:00Z' };

async function installMocks(page: any, options: { failDownload?: boolean; failList?: boolean; previewFile?: { fileName: string; mimeType: string }; source?: Buffer } = {}) {
  let failDownload = options.failDownload ?? false;
  let failList = options.failList ?? false;
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  const targetedRequests: string[] = [];
  const contentRequests: string[] = [];
  const source = options.source ?? content;
  const file = { ...companyFile, ...options.previewFile, sizeBytes: source.length };
  page.on('pageerror', (error: Error) => errors.push(error.message));
  page.on('console', (message: any) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.addInitScript(() => sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'file-test-token', id_token: 'file-test-id' })));
  await page.route('**/api/**', async (route: any) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/me') return json({ subject: 'file-user', username: 'file.employee', roles: ['substrate-user'] });
    if (path === '/api/crm-native/files/chinese-file/content') {
      contentRequests.push(route.request().url());
      expect(route.request().headers().authorization).toBe('Bearer file-test-token');
      if (failDownload) return json({ error: 'internal_error' }, 500);
      return route.fulfill({ status: 200, contentType: file.mimeType, headers: { 'content-disposition': 'attachment; filename="source.bin"' }, body: source });
    }
    if (path === '/api/crm-native/files') {
      const companyId = url.searchParams.get('businessId');
      if (companyId) targetedRequests.push(companyId);
      if (failList && companyId) return json({ error: 'unavailable' }, 503);
      return json({ files: !companyId || companyId === 'files-company-a' ? [file] : [], maxFileBytes: 300 * 1024 * 1024 });
    }
    if (path.startsWith('/api/capabilities/')) {
      const records = path.includes('crm.v1.account.list') ? accounts : [];
      return json({ requestId: 'files-test', providerId: 'files-provider', result: { ok: true, records } });
    }
    if (path.startsWith('/api/user-preferences/')) return json({ preference: null });
    if (path === '/api/crm-native/company-research-insights') return json({ insights: [] });
    if (['/api/crm-native/company-profiles', '/api/crm-native/customer-intelligence', '/api/crm-native/research-authoritative-profiles', '/api/crm-native/research-company-profiles', '/api/crm-native/opportunity-profiles'].includes(path)) return json({ profiles: [] });
    return json({ error: 'not_found' }, 404);
  });
  return { errors, consoleErrors, targetedRequests, contentRequests, file, recoverDownload: () => { failDownload = false; }, recoverList: () => { failList = false; } };
}

async function openCompany(page: any, name: string) {
  await page.locator('aside.sidebar').getByRole('button', { name: '客户公司', exact: true }).click();
  await page.locator('.customer-company-table tbody tr').filter({ hasText: name }).getByRole('button', { name: '查看', exact: true }).click();
  return page.getByRole('dialog', { name, exact: true });
}

test('company detail shows its files, downloads Unicode 512 KB content and isolates another company', async ({ page }, testInfo) => {
  const state = await installMocks(page);
  await page.goto('/');
  await expect(page).toHaveTitle(/GBAP/i);
  const dialog = await openCompany(page, accounts[0].displayName);
  const section = dialog.getByTestId('company-files');
  await page.locator('aside.sidebar').evaluate(element => element.querySelector('button')?.focus());
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await expect(dialog.locator('[data-testid="company-profile-75"] > :last-child')).toHaveAttribute('data-testid', 'company-files');
  await expect(section.getByText('1 个文件')).toBeVisible();
  await expect(section.getByText(companyFile.fileName, { exact: true })).toBeVisible();
  await expect(section.getByText(/512 KB/)).toBeVisible();
  const downloading = page.waitForEvent('download');
  await section.getByRole('button', { name: '下载', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(companyFile.fileName);
  expect(await download.failure()).toBeNull();
  expect(await readFile((await download.path())!)).toEqual(content);
  await page.screenshot({ path: testInfo.outputPath('company-files.png') });
  await dialog.getByRole('button', { name: '关闭客户详情' }).click();
  await expect(page.locator('.customer-company-table tbody tr').filter({ hasText: accounts[0].displayName }).getByRole('button', { name: '查看', exact: true })).toBeFocused();
  const second = await openCompany(page, accounts[1].displayName);
  await expect(second.getByTestId('company-files')).toContainText('此公司还没有关联文件');
  await expect(second.getByTestId('company-files').getByText(companyFile.fileName)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(second).toHaveCount(0);
  expect(state.targetedRequests).toEqual(['files-company-a', 'files-company-b']);
  expect(state.errors).toEqual([]);
  expect(state.consoleErrors).toEqual([]);
});

test('file library explains download failure and can retry successfully', async ({ page }) => {
  const state = await installMocks(page, { failDownload: true });
  await page.goto('/');
  await page.locator('aside.sidebar').getByRole('button', { name: '文件', exact: true }).click();
  const surface = page.locator('[data-surface="real-files-wiring"]');
  const row = surface.locator('.crm-file-row').filter({ hasText: companyFile.fileName });
  await row.getByRole('button', { name: '下载', exact: true }).click();
  await expect(surface.getByRole('alert')).toContainText('文件服务暂时不可用');
  await expect(row.getByRole('button', { name: '下载', exact: true })).toBeEnabled();
  state.recoverDownload();
  const downloading = page.waitForEvent('download');
  await row.getByRole('button', { name: '下载', exact: true }).click();
  expect(await (await downloading).failure()).toBeNull();
  await expect(surface.getByRole('alert')).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test('company files explain load failure and refresh recovers', async ({ page }) => {
  const state = await installMocks(page, { failList: true });
  await page.goto('/');
  const dialog = await openCompany(page, accounts[0].displayName);
  const section = dialog.getByTestId('company-files');
  await expect(section.getByRole('alert')).toContainText('关联文件读取失败');
  await expect(section.getByText('此公司还没有关联文件', { exact: false })).toHaveCount(0);
  state.recoverList();
  await section.getByRole('button', { name: '刷新文件' }).click();
  await expect(section.getByText(companyFile.fileName, { exact: true })).toBeVisible();
  await expect(section.getByRole('alert')).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

function pdfFixture() {
  const stream = 'BT /F1 18 Tf 72 720 Td (GBAP CRM FILE PREVIEW) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => { offsets[index + 1] = Buffer.byteLength(pdf); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

async function docxFixture() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.file('_rels/.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>GBAP CRM FILE PREVIEW</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`);
  zip.file('word/styles.xml', `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr/></w:rPrDefault><w:pPrDefault><w:pPr/></w:pPrDefault></w:docDefaults></w:styles>`);
  zip.file('word/_rels/document.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
}



const previewFixtures = [
  { fileName: '公司账单.pdf', mimeType: 'application/pdf', source: async () => pdfFixture(), selector: '.PdfHighlighter', text: 'GBAP CRM FILE PREVIEW' },
  { fileName: '公司合同.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', source: docxFixture, selector: '.knowledge-docx-canvas', text: 'GBAP CRM FILE PREVIEW' },
  { fileName: '公司账单.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', source: () => makeXlsxFixture('Invoice', [['Company invoice', 'Amount'], ['September', 1200]]), selector: '.knowledge-excel-preview', text: null },
  { fileName: '公司方案.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', source: () => readFile(new URL('./fixtures/crm-file-preview.pptx', import.meta.url)), selector: '.knowledge-pptx-preview', text: null },
  { fileName: '公司资料.txt', mimeType: 'text/plain', source: async () => Buffer.from('公司账单：九月\n合计 USD 1,200'), selector: '.crm-file-preview-text', text: '公司账单：九月' },
  { fileName: '公司截图.svg', mimeType: 'image/svg+xml', source: async () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#eef2ff"/><text x="25" y="80">Company invoice</text></svg>'), selector: '.crm-file-preview-image', text: null },
];

for (const fixture of previewFixtures) {
  test(`company file views ${fixture.fileName} without forcing a download`, async ({ page }, testInfo) => {
    const state = await installMocks(page, { previewFile: fixture, source: await fixture.source() });
    const downloads: string[] = [];
    page.on('download', download => downloads.push(download.suggestedFilename()));
    await page.goto('/');
    const company = await openCompany(page, accounts[0].displayName);
    const trigger = company.getByTestId('company-files').getByRole('button', { name: '查看', exact: true });
    await trigger.click();
    const preview = page.getByRole('dialog', { name: `文件预览：${fixture.fileName}`, exact: true });
    await expect(preview).toBeVisible();
    await expect(preview.locator(fixture.selector)).toBeVisible();
    if (fixture.text) await expect(fixture.selector === '.knowledge-excel-preview' ? preview.frameLocator('iframe.knowledge-excel-preview').getByText(fixture.text, { exact: false }) : preview.getByText(fixture.text, { exact: false })).toBeVisible();
    if (fixture.selector === '.knowledge-excel-preview') {
      await expect(preview.locator(fixture.selector)).toHaveAttribute('aria-busy', 'false');
      await expect(preview.frameLocator('iframe.knowledge-excel-preview').locator('canvas')).toBeVisible();
      await preview.frameLocator('iframe.knowledge-excel-preview').locator('.x-spreadsheet-overlayer').click({ position: { x: 100, y: 80 } });
    }
    if (fixture.selector === '.knowledge-pptx-preview') {
      await expect.poll(() => preview.locator(fixture.selector).evaluate((element: HTMLElement) => element.childElementCount)).toBeGreaterThan(0);
    }
    if (fixture.selector === '.crm-file-preview-image') await expect.poll(() => preview.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(300);
    await expect(preview.getByText(/文件无法预览|图片无法预览/)).toHaveCount(0);
    const bounds = await preview.boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(downloads).toEqual([]);
    expect(state.contentRequests).toHaveLength(1);
    expect(new URL(state.contentRequests[0]).search).toBe('');
    expect(state.errors).toEqual([]);
    if (fixture.fileName.endsWith('.pdf')) await page.screenshot({ path: testInfo.outputPath('company-file-preview.png') });
    await page.keyboard.press('Escape');
    await expect(preview).toHaveCount(0);
    await expect(company).toBeVisible();
    await expect(trigger).toBeFocused();
    if (fixture.selector === '.knowledge-excel-preview') { await page.waitForTimeout(500); await expect(trigger).toBeFocused(); }
  });
}

test('file library previews report errors and retry without downloading', async ({ page }) => {
  const state = await installMocks(page, { failDownload: true, previewFile: { fileName: '公司账单.txt', mimeType: 'text/plain' }, source: Buffer.from('公司账单：九月') });
  await page.goto('/');
  await page.locator('aside.sidebar').getByRole('button', { name: '文件', exact: true }).click();
  await page.locator('.crm-file-row').getByRole('button', { name: '查看', exact: true }).click();
  const preview = page.getByRole('dialog', { name: '文件预览：公司账单.txt', exact: true });
  await expect(preview.getByRole('alert')).toContainText('文件预览加载失败');
  state.recoverDownload();
  await preview.getByRole('button', { name: '重试预览' }).click();
  await expect(preview.locator('pre')).toHaveText('公司账单：九月');
  await expect(preview.getByRole('alert')).toHaveCount(0);
  await preview.getByRole('button', { name: '关闭文件预览' }).click();
  await expect(preview).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test('unsupported legacy documents explain the fallback and retain download', async ({ page }) => {
  const state = await installMocks(page, { previewFile: { fileName: '旧合同.doc', mimeType: 'application/msword' }, source: Buffer.from('legacy-document-bytes') });
  await page.goto('/');
  const company = await openCompany(page, accounts[0].displayName);
  await company.getByTestId('company-files').getByRole('button', { name: '查看', exact: true }).click();
  const preview = page.getByRole('dialog', { name: '文件预览：旧合同.doc', exact: true });
  await expect(preview).toContainText('当前格式暂不支持在线查看');
  expect(state.contentRequests).toHaveLength(0);
  const downloading = page.waitForEvent('download');
  await preview.getByRole('button', { name: '下载', exact: true }).click();
  expect((await downloading).suggestedFilename()).toBe('旧合同.doc');
  expect(state.errors).toEqual([]);
});

test('HTML files are shown as text instead of executing uploaded content', async ({ page }) => {
  await installMocks(page, { previewFile: { fileName: '公司网页.html', mimeType: 'text/html' }, source: Buffer.from('<script>window.crmPreviewExecuted=true</script><h1>账单资料</h1>') });
  await page.goto('/');
  const company = await openCompany(page, accounts[0].displayName);
  await company.getByTestId('company-files').getByRole('button', { name: '查看', exact: true }).click();
  const preview = page.getByRole('dialog', { name: '文件预览：公司网页.html', exact: true });
  await expect(preview.locator('pre')).toContainText('<script>');
  expect(await page.evaluate(() => (window as any).crmPreviewExecuted)).toBeUndefined();
});
