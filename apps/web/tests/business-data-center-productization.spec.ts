import { expect, test } from '@playwright/test';

async function installRuntimeMocks(page: any) {
  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'productization-access-token', id_token: 'productization-id-token' }));
  });
  await page.route('http://127.0.0.1:8080/api/me', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ subject: 'productization-user', username: 'sales.manager', roles: ['substrate-user', 'substrate-manager'] }),
  }));
  await page.route('http://127.0.0.1:8080/api/capabilities/**', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ requestId: 'productization', providerId: 'productization-provider', result: { ok: true, records: [] } }),
  }));
  await page.route('http://127.0.0.1:8080/api/crm-runtime/schema', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ providerNeutral: true, objects: [{
      objectKey: 'company', objectPluralKey: 'companies', labelSingular: '客户公司', labelPlural: '客户公司', description: null, icon: null, color: null,
      active: true, system: false, uiEditable: true, uiCreatable: true, searchable: true, openRecordIn: 'SIDE_PANEL',
      fields: [
        { fieldKey: 'name', label: '公司名称', type: 'TEXT', description: null, icon: null, active: true, system: false, uiEditable: true, nullable: false, unique: true, defaultValue: null, options: null, settings: null, relation: null },
        { fieldKey: 'stage', label: '客户阶段', type: 'SELECT', description: null, icon: null, active: true, system: false, uiEditable: true, nullable: true, unique: false, defaultValue: null, options: [{ label: '潜在客户', value: 'LEAD' }, { label: '客户', value: 'CUSTOMER' }], settings: null, relation: null },
        { fieldKey: 'nextAt', label: '下次跟进', type: 'DATE_TIME', description: null, icon: null, active: true, system: false, uiEditable: true, nullable: true, unique: false, defaultValue: null, options: null, settings: null, relation: null },
      ],
    }] }),
  }));
  await page.route('http://127.0.0.1:8080/api/crm-runtime/views', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ views: [{
      viewKey: 'company-table', name: '全部客户', objectKey: 'company', type: 'TABLE', icon: null, position: 0, compact: false, visibility: null, scope: 'WORKSPACE', owned: true, editable: true,
      anyFieldFilterValue: null, mainGroupByFieldKey: null, kanbanAggregateOperation: null, kanbanAggregateFieldKey: null, calendarFieldKey: null, calendarEndFieldKey: null, calendarLayout: null, hideEmptyGroups: false,
      fields: [{ fieldKey: 'name', visible: true, position: 0, size: 240, aggregateOperation: null }, { fieldKey: 'stage', visible: true, position: 1, size: 160, aggregateOperation: null }], filters: [], filterGroups: [], sorts: [], groups: [],
    }] }),
  }));
  await page.route('http://127.0.0.1:8080/api/crm-runtime/layouts', (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ layouts: [] }) }));
  await page.route(/http:\/\/127\.0\.0\.1:8080\/api\/crm-runtime\/objects\/company\/records\?.*/, (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ objectKey: 'company', records: [{ businessId: 'company-product-1', objectKey: 'company', values: { name: 'Andes Energy Group', stage: 'LEAD', nextAt: '2026-09-20T09:00:00.000Z' }, deleted: false }] }),
  }));
}

test('business data center exposes business language while keeping advanced view capability', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop productization acceptance');
  await installRuntimeMocks(page);
  await page.goto('/');

  await page.locator('aside.sidebar').getByRole('button', { name: '业务数据中心', exact: true }).click();
  const surface = page.locator('.rtw-shell');
  await expect(surface).toBeVisible();
  await expect(surface.getByText('业务分类', { exact: true })).toBeVisible();
  await expect(surface.getByRole('heading', { name: '客户公司', exact: true })).toBeVisible();
  await expect(surface.getByText('集中查看和维护业务记录、关联关系、常用视图、客户上下文与协作信息。', { exact: true })).toBeVisible();
  await expect(surface.getByText('Andes Energy Group', { exact: true })).toBeVisible();
  await expect(surface.getByText('表格 · 共享视图', { exact: true })).toBeVisible();
  await expect(surface.getByText('导入 CSV', { exact: true })).toBeVisible();

  for (const forbidden of ['CRM Objects', 'Stage 3.5', 'Metadata Runtime', 'Twenty', 'Upsert', 'businessId', 'Record Page', 'Custom Object', 'Dry Run']) {
    await expect(surface.getByText(forbidden, { exact: false })).toHaveCount(0);
  }

  await surface.getByRole('button', { name: '+ 新建视图', exact: true }).click();
  await expect(surface.getByText('新建视图', { exact: true })).toBeVisible();
  await expect(surface.getByLabel('视图类型')).toHaveValue('TABLE');
  await expect(surface.getByLabel('视图类型').locator('option')).toHaveText(['表格', '看板', '日历', '列表']);
  await surface.getByLabel('视图类型').selectOption('KANBAN');
  await expect(surface.getByLabel('汇总方式')).toBeVisible();
  await expect(surface.getByLabel('汇总方式').locator('option')).toHaveText(['无', '计数', '求和', '平均值', '最小值', '最大值']);
  await expect(surface.getByText('条件组合（全部 / 任一，可嵌套）', { exact: true })).toBeVisible();
  await expect(surface.getByRole('button', { name: '保存视图', exact: true })).toBeVisible();

  for (const forbidden of ['Kanban', 'Calendar', '保存到 Twenty', '删除 View', 'AND / OR']) {
    await expect(surface.getByText(forbidden, { exact: false })).toHaveCount(0);
  }

  await page.screenshot({ path: testInfo.outputPath('business-data-center-productized.png'), fullPage: true });
});
