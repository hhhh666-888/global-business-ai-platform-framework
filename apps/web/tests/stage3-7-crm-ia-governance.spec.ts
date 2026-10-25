import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../../..');

type RoleMode = 'employee' | 'manager' | 'admin';

async function installSession(page: any, mode: RoleMode) {
  const roles = mode === 'admin'
    ? ['substrate-user', 'substrate-admin']
    : mode === 'manager'
      ? ['substrate-user', 'substrate-manager']
      : ['substrate-user'];
  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'stage3-7-access-token', id_token: 'stage3-7-id-token' }));
  });
  await page.route('http://127.0.0.1:8080/api/me', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ subject: `${mode}-id`, username: `${mode}.user`, roles }),
  }));
}

async function installRecycleMocks(page: any) {
  const restored: string[] = [];
  const destroyed: string[] = [];
  const fileRestored: string[] = [];
  const fileDestroyed: string[] = [];
  const objects = ['company', 'person', 'opportunity', 'task', 'note'].map((objectKey) => ({
    objectKey,
    objectPluralKey: `${objectKey}s`,
    labelSingular: objectKey === 'company' ? '客户公司' : objectKey === 'person' ? '联系人' : objectKey === 'opportunity' ? '商机' : objectKey === 'task' ? '任务' : '笔记',
    labelPlural: objectKey === 'company' ? '客户公司' : objectKey === 'person' ? '联系人' : objectKey === 'opportunity' ? '商机' : objectKey === 'task' ? '任务' : '笔记',
    description: null,
    icon: null,
    color: null,
    active: true,
    system: false,
    uiEditable: true,
    uiCreatable: true,
    searchable: true,
    openRecordIn: 'USER_CHOICE',
    fields: [{ fieldKey: 'name', label: '名称', type: 'TEXT', description: null, icon: null, active: true, system: false, uiEditable: true, nullable: false, unique: false, defaultValue: null, options: null, settings: null, relation: null }],
  }));

  await page.route('http://127.0.0.1:8080/api/crm-runtime/schema', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ providerNeutral: true, objects }),
  }));

  await page.route(/\/api\/crm-runtime\/objects\/([^/]+)\/records\?/, (route: any) => {
    const url = new URL(route.request().url());
    const objectKey = decodeURIComponent(url.pathname.split('/')[4] ?? '');
    const records = objectKey === 'company'
      ? [{ businessId: 'deleted-company-1', objectKey: 'company', values: { name: '误删客户公司' }, deleted: true }]
      : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ objectKey, records }) });
  });

  await page.route(/\/api\/crm-runtime\/objects\/company\/records\/deleted-company-1\/(restore|destroy)$/, (route: any) => {
    const action = new URL(route.request().url()).pathname.endsWith('/destroy') ? 'destroy' : 'restore';
    if (action === 'destroy') destroyed.push('deleted-company-1'); else restored.push('deleted-company-1');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: action === 'destroy'
        ? JSON.stringify({ destroyed: true, businessId: 'deleted-company-1' })
        : JSON.stringify({ record: { businessId: 'deleted-company-1', objectKey: 'company', values: { name: '误删客户公司' }, deleted: false } }),
    });
  });

  await page.route('http://127.0.0.1:8080/api/crm-native/files/recycle', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ files: [{
      id: 'deleted-file-1', fileName: '误删报价.pdf', mimeType: 'application/pdf', sizeBytes: 5 * 1024 * 1024,
      target: null, createdBy: 'employee-id', createdAt: '2026-09-08T00:00:00.000Z',
    }] }),
  }));

  await page.route(/\/api\/crm-native\/files\/deleted-file-1\/(restore|destroy)$/, (route: any) => {
    const action = new URL(route.request().url()).pathname.endsWith('/destroy') ? 'destroy' : 'restore';
    if (action === 'destroy') fileDestroyed.push('deleted-file-1'); else fileRestored.push('deleted-file-1');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: action === 'destroy'
        ? JSON.stringify({ destroyed: 'deleted-file-1' })
        : JSON.stringify({ file: { id: 'deleted-file-1', fileName: '误删报价.pdf', mimeType: 'application/pdf', sizeBytes: 5 * 1024 * 1024, target: null, createdBy: 'employee-id', createdAt: '2026-09-08T00:00:00.000Z' } }),
    });
  });

  return { restored, destroyed, fileRestored, fileDestroyed };
}

async function openDataRecovery(page: any) {
  const sidebar = page.locator('aside.sidebar');
  await sidebar.getByRole('button', { name: '设置', exact: true }).click();
  const settings = page.locator('[data-surface="crm-settings"]');
  await expect(settings).toBeVisible();
  await settings.getByRole('button', { name: /数据与恢复/ }).click();
  return page.locator('[data-surface="crm-recycle-bin"]');
}

test('Stage 3.7 Batch 8 keeps business data center retired and moves recycle into settings', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop governance acceptance');
  await installSession(page, 'manager');
  await page.goto('/');
  const sidebar = page.locator('aside.sidebar');
  await expect(sidebar.getByRole('button', { name: '业务数据中心', exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: '数据导入与导出', exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: '回收站', exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: '设置', exact: true })).toBeVisible();
});

test('Stage 3.7 Batch 8 settings recycle restores deleted business records and files for users', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop governance acceptance');
  await installSession(page, 'employee');
  const lifecycle = await installRecycleMocks(page);
  await page.goto('/');
  const recycle = await openDataRecovery(page);
  await expect(recycle.getByText('误删客户公司', { exact: true })).toBeVisible();
  await expect(recycle.getByText('误删报价.pdf', { exact: true })).toBeVisible();
  await expect(recycle.getByRole('button', { name: '永久删除', exact: true })).toHaveCount(0);
  await expect(recycle.getByTestId('recycle-select-all')).toHaveCount(0);
  await expect(recycle.getByTestId('recycle-bulk-destroy')).toHaveCount(0);
  await expect(recycle.getByText('批量删除和永久删除仅由超级管理员执行。', { exact: false })).toBeVisible();

  const companyRow = recycle.locator('tr').filter({ hasText: '误删客户公司' });
  await companyRow.getByRole('button', { name: '恢复', exact: true }).click();
  await expect(recycle.getByText('“误删客户公司”已恢复。', { exact: true })).toBeVisible();

  const fileRow = recycle.locator('tr').filter({ hasText: '误删报价.pdf' });
  await fileRow.getByRole('button', { name: '恢复', exact: true }).click();
  await expect(recycle.getByText('文件“误删报价.pdf”已恢复。', { exact: true })).toBeVisible();

  expect(lifecycle.restored).toEqual(['deleted-company-1']);
  expect(lifecycle.destroyed).toEqual([]);
  expect(lifecycle.fileRestored).toEqual(['deleted-file-1']);
  expect(lifecycle.fileDestroyed).toEqual([]);
});

test('Stage 3.7 Batch 8 super-admin keeps bulk data governance and permanent recycle deletion', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop governance acceptance');
  await installSession(page, 'admin');
  await installRecycleMocks(page);
  await page.goto('/');
  const sidebar = page.locator('aside.sidebar');
  await expect(sidebar.getByRole('button', { name: '数据导入与导出', exact: true })).toBeVisible();
  const recycle = await openDataRecovery(page);
  await expect(recycle.getByRole('button', { name: '永久删除', exact: true })).toHaveCount(2);
  await expect(recycle.getByTestId('recycle-select-all')).toBeVisible();
  await expect(recycle.getByTestId('recycle-bulk-destroy')).toBeVisible();
  await expect(recycle.getByTestId('recycle-bulk-destroy')).toBeDisabled();
  await recycle.getByTestId('recycle-select-all').click();
  await expect(recycle.getByTestId('recycle-bulk-destroy')).toBeEnabled();
});

test('Stage 3.7 Batch 7 source keeps file delete recoverable, destroy admin-only, and cap at 300 MB', async () => {
  const runtime = readFileSync(resolve(repoRoot, 'apps/api/crm-runtime.mjs'), 'utf8');
  const native = readFileSync(resolve(repoRoot, 'apps/api/crm-native.mjs'), 'utf8');
  const adminBulk = readFileSync(resolve(repoRoot, 'apps/api/crm-admin-bulk.mjs'), 'utf8');
  const lifecycle = readFileSync(resolve(repoRoot, 'apps/web/src/lib/crmLifecycleClient.ts'), 'utf8');
  const bulkClient = readFileSync(resolve(repoRoot, 'apps/web/src/lib/crmAdminBulkClient.ts'), 'utf8');
  const companyBoard = readFileSync(resolve(repoRoot, 'apps/web/src/components/CompanyDevelopmentBoard.tsx'), 'utf8');
  const recycle = readFileSync(resolve(repoRoot, 'apps/web/src/components/RecycleBinSurface.tsx'), 'utf8');
  const files = readFileSync(resolve(repoRoot, 'apps/web/src/components/FilesSurface.tsx'), 'utf8');
  const app = readFileSync(resolve(repoRoot, 'apps/web/src/App.tsx'), 'utf8');

  expect(runtime).toContain("if (req.method === 'POST' && businessId && action === 'destroy')");
  expect(runtime).toContain('requireAdmin(actor);');
  expect(lifecycle).toContain("softDeleteCrmRuntimeRecord('company', businessId)");
  expect(lifecycle).toContain("softDeleteCrmRuntimeRecord('person', businessId)");
  expect(lifecycle).toContain("softDeleteCrmRuntimeRecord('opportunity', businessId)");
  expect(lifecycle).toContain("softDeleteCrmRuntimeRecord('note', businessId)");

  expect(adminBulk).toContain("url.pathname !== '/api/crm-admin/bulk-delete'");
  expect(adminBulk).toContain('requireAdmin(actor);');
  expect(adminBulk).toContain('const MAX_BULK_RECORDS = 100;');
  expect(adminBulk).toContain("mode === 'destroy' ? 'crm.meta.v1.record.destroy' : 'crm.meta.v1.record.delete'");
  expect(adminBulk).toContain('crm.admin.bulk_');
  expect(bulkClient).toContain('bulkDeleteCrmRecordsInChunks');
  expect(companyBoard).toContain("bulkDeleteCrmRecordsInChunks('company', [...selected], 'soft-delete')");
  expect(companyBoard).toContain("roles.includes('substrate-admin')");
  expect(recycle).toContain("bulkDeleteCrmRecordsInChunks(objectKey, objectItems.map((item) => item.record.businessId), 'destroy')");
  expect(recycle).toContain("roles?.includes('substrate-admin')");

  expect(native).toContain('300 * 1024 * 1024');
  expect(native).toContain("ensureColumn('crm_file', 'deleted_at', 'TEXT')");
  expect(native).toContain("url.pathname === '/api/crm-native/files/recycle'");
  expect(native).toContain("UPDATE crm_file SET deleted_at=?, deleted_by=? WHERE id=?");
  expect(native).toContain("recordAudit(actor, 'crm.file.soft_delete'");
  expect(native).toContain("const destroyMatch = url.pathname.match");
  expect(native).toContain('requireAdmin(actor);');
  expect(files).toContain('300 * 1024 * 1024');
  expect(files).toContain('已移至回收站');
  expect(app).not.toContain("label: '业务数据中心'");
  expect(app).not.toContain("{ key: 'recycle', label: '回收站'");
  expect(app).toContain("data: 'super-admin'");
});
