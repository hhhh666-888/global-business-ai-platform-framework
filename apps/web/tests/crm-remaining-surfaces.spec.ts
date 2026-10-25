import { expect, test } from '@playwright/test';

const account = { businessId: 'account-business-1', businessType: 'Account', externalId: 'company-ext-1', externalType: 'company', displayName: 'Andes Plastics Group', website: 'https://andes.example' };
const secondAccount = { businessId: 'account-business-2', businessType: 'Account', externalId: 'company-ext-2', externalType: 'company', displayName: 'Quito Metals', website: 'https://quito.example' };
const contact = { businessId: 'contact-business-1', businessType: 'Contact', externalId: 'person-ext-1', externalType: 'person', personName: 'Carlos Mendoza', email: 'carlos@example.com', accountExternalId: 'company-ext-1', accountBusinessId: 'account-business-1' };
const opportunity = { businessId: 'opp-business-1', businessType: 'Opportunity', externalId: 'opp-ext-1', externalType: 'opportunity', nameSummary: 'Andes 储能项目', lifecycleState: 'OPEN', accountExternalId: 'company-ext-1', accountBusinessId: 'account-business-1', estimatedValue: 880000, currencyCode: 'USD', pipelineStage: 'PROPOSAL', nextStep: '确认负荷资料' };
const euroOpportunity = { businessId: 'opp-business-2', businessType: 'Opportunity', externalId: 'opp-ext-2', externalType: 'opportunity', nameSummary: 'Quito 光伏项目', lifecycleState: 'OPEN', accountExternalId: 'company-ext-2', accountBusinessId: 'account-business-2', estimatedValue: 100000, currencyCode: 'EUR', pipelineStage: 'NEW', nextStep: null };
const closedOpportunity = { businessId: 'opp-business-3', businessType: 'Opportunity', externalId: 'opp-ext-3', externalType: 'opportunity', nameSummary: '历史已赢项目', lifecycleState: 'CLOSED_WON', accountExternalId: 'company-ext-1', accountBusinessId: 'account-business-1', estimatedValue: 50000, currencyCode: 'USD', pipelineStage: 'CUSTOMER', nextStep: null };
const task = { businessId: 'task-business-1', businessType: 'CrmTask', title: 'Andes 现场资料跟进', bodyMarkdown: '索取电费账单', dueAt: '2025-01-01T00:00:00.000Z', status: 'TODO', targets: [{ businessType: 'Account', businessId: 'account-business-1' }], createdAt: '2026-08-31T00:00:00.000Z', updatedAt: '2026-08-31T00:00:00.000Z' };
const note = { businessId: 'note-business-1', businessType: 'CrmNote', title: 'Andes 客户背景', bodyMarkdown: '园区经常停电', targets: [{ businessType: 'Account', businessId: 'account-business-1' }], createdAt: '2026-08-31T00:00:00.000Z', updatedAt: '2026-08-31T00:00:00.000Z' };

type MockOptions = {
  role?: 'substrate-user' | 'substrate-manager' | 'substrate-admin';
  initialFileCreatedBy?: string;
};

async function installAuthenticatedMocks(page: any, options: MockOptions = {}) {
  const role = options.role ?? 'substrate-admin';
  const observedRequests: string[] = [];
  let files: any[] = [{ id: 'file-1', fileName: 'Andes-electricity-bill.pdf', mimeType: 'application/pdf', sizeBytes: 1200, target: { businessType: 'Account', businessId: 'account-business-1' }, createdBy: options.initialFileCreatedBy ?? 'test-user', createdAt: '2026-08-31T00:00:00.000Z' }];
  let views: any[] = [];
  let accountCreates = 0;

  await page.addInitScript(() => sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'test-access-token', id_token: 'test-id-token' })));
  page.on('request', (request: any) => observedRequests.push(request.url()));

  const roles = role === 'substrate-user' ? ['substrate-user'] : ['substrate-user', role];
  await page.route('**/api/crm-native/company-import/jobs?**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jobs: [], total: 0 }) }));
  await page.route('http://127.0.0.1:8080/api/me', (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ subject: 'test-user', username: 'sales.manager', roles }) }));

  const capability = async (name: string, result: any) => page.route(`http://127.0.0.1:8080/api/capabilities/${name}/invoke`, (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requestId: name, providerId: 'test-provider', result: { ok: true, ...result } }) }));
  await capability('crm.v1.account.list', { records: [account, secondAccount] });
  await capability('crm.v1.contact.list', { records: [contact] });
  await capability('crm.v1.opportunity.list', { records: [opportunity, euroOpportunity, closedOpportunity] });
  await capability('crm.ops.v1.task.list', { records: [task] });
  await capability('crm.ops.v1.note.list', { records: [note] });
  await capability('crm.ops.v1.activity.list', { records: [{ kind: 'TASK', ...task }, { kind: 'NOTE', ...note }] });
  await page.route('http://127.0.0.1:8080/api/calendar-events', async (route: any) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'method_not_allowed' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [{
      id: 'calendar-event-1',
      title: 'Andes 客户会议',
      description: '方案沟通',
      location: '会议室',
      startsAt: '2026-09-28T15:00:00.000Z',
      endsAt: '2026-09-28T16:00:00.000Z',
      fullDay: false,
      timeZone: 'Asia/Shanghai',
      createdAt: '2026-09-28T00:00:00.000Z',
      updatedAt: '2026-09-28T00:00:00.000Z',
    }] }) });
  });

  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.account.create/invoke', async (route: any) => {
    accountCreates += 1;
    const input = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requestId: 'account-create', providerId: 'test-provider', result: { ok: true, record: { ...account, businessId: input.payload.businessId, externalId: `company-created-${accountCreates}`, displayName: input.payload.displayName } } }) });
  });

  await page.route('http://127.0.0.1:8080/api/crm-native/files', async (route: any) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files, maxFileBytes: 8 * 1024 * 1024 }) });
    const input = route.request().postDataJSON();
    const created = { id: `file-${files.length + 1}`, fileName: input.fileName, mimeType: input.mimeType, sizeBytes: input.sizeBytes, target: input.target, createdBy: 'test-user', createdAt: '2026-09-01T00:00:00.000Z' };
    files = [created, ...files];
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ file: created }) });
  });
  await page.route(/http:\/\/127\.0\.0\.1:8080\/api\/crm-native\/files\/[^/]+\/content/, (route: any) => route.fulfill({ status: 200, headers: { 'content-type': 'application/pdf' }, body: Buffer.from('fake-pdf') }));
  await page.route(/http:\/\/127\.0\.0\.1:8080\/api\/crm-native\/files\/[^/]+$/, async (route: any) => {
    const id = route.request().url().split('/').at(-1)!;
    files = files.filter((item) => item.id !== id);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ removed: id }) });
  });

  await page.route('http://127.0.0.1:8080/api/crm-native/views', async (route: any) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ views }) });
    const input = route.request().postDataJSON();
    const created = { id: `view-${views.length + 1}`, name: input.name, pageKey: input.pageKey, query: input.query, favorite: Boolean(input.favorite), createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };
    views = [created, ...views];
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ view: created }) });
  });
  await page.route(/http:\/\/127\.0\.0\.1:8080\/api\/crm-native\/views\/[^/]+$/, async (route: any) => {
    const id = route.request().url().split('/').at(-1)!;
    if (route.request().method() === 'DELETE') {
      views = views.filter((item) => item.id !== id);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ removed: id }) });
    }
    const input = route.request().postDataJSON();
    const index = views.findIndex((item) => item.id === id);
    views[index] = { ...views[index], ...input, updatedAt: '2026-09-01T00:05:00.000Z' };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ view: views[index] }) });
  });

  return { observedRequests, getFiles: () => files, getViews: () => views, getAccountCreates: () => accountCreates };
}

test('daily CRM remaining surfaces are real: files, views, search and internal calendar', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop remaining-surface acceptance');
  const state = await installAuthenticatedMocks(page);
  await page.goto('/');
  const sidebar = page.locator('aside.sidebar');

  await sidebar.getByRole('button', { name: '文件', exact: true }).click();
  await expect(page.locator('[data-surface="real-files-wiring"]')).toBeVisible();
  await expect(page.getByText('Andes-electricity-bill.pdf', { exact: true })).toBeVisible();
  const fileInput = page.locator('[data-surface="real-files-wiring"] input[type="file"]');
  await fileInput.setInputFiles({ name: 'site-photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('photo-data') });
  const uploadedRow = page.locator('.crm-file-row').filter({ hasText: 'site-photo.jpg' });
  await expect(uploadedRow).toBeVisible();
  expect(state.getFiles().some((item) => item.fileName === 'site-photo.jpg')).toBe(true);

  const contentBefore = state.observedRequests.length;
  await uploadedRow.getByRole('button', { name: '下载', exact: true }).click();
  await expect.poll(() => state.observedRequests.slice(contentBefore).some((url) => /\/api\/crm-native\/files\/[^/]+\/content/.test(url))).toBe(true);

  page.on('dialog', (dialog) => dialog.accept());
  await uploadedRow.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.locator('.crm-file-row').filter({ hasText: 'site-photo.jpg' })).toHaveCount(0);
  expect(state.getFiles().some((item) => item.fileName === 'site-photo.jpg')).toBe(false);

  await sidebar.getByRole('button', { name: '常用视图', exact: true }).click();
  const viewsSurface = page.locator('[data-surface="real-saved-views-wiring"]');
  await expect(viewsSurface).toBeVisible();
  await page.getByLabel('视图名称').fill('Andes 客户公司');
  await page.getByLabel('业务页面').selectOption('companies');
  await page.getByLabel('搜索条件').fill('Andes');
  await viewsSurface.locator('.crm-advanced-form button').filter({ hasText: '保存视图' }).click();
  await expect(page.getByText('Andes 客户公司', { exact: true })).toBeVisible();
  expect(state.getViews()).toHaveLength(1);
  await page.getByRole('button', { name: '取消收藏', exact: true }).click();
  expect(state.getViews()[0].favorite).toBe(false);
  await page.getByRole('button', { name: '收藏', exact: true }).click();
  expect(state.getViews()[0].favorite).toBe(true);
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await expect(page.locator('.topbar h1')).toHaveText('客户公司');
  await expect(page.locator('[data-surface="real-account-wiring"]').getByText('Andes Plastics Group', { exact: true })).toBeVisible();
  await expect(page.getByText('Quito Metals', { exact: true })).toHaveCount(0);

  const searchInput = page.locator('#global-search');
  await searchInput.fill('Andes');
  await expect(page.locator('[data-surface="real-global-search"]')).toBeVisible();
  await page.getByRole('button').filter({ hasText: 'Andes 储能项目' }).click();
  await expect(page.locator('.topbar h1')).toHaveText('商机');
  await expect(page.locator('[data-surface="real-global-search"]')).toHaveCount(0);

  await expect(sidebar.getByRole('button', { name: '邮件', exact: true })).toHaveCount(0);
  await sidebar.getByRole('button', { name: '日历', exact: true }).click();
  const calendarSurface = page.locator('[data-surface="real-calendar-wiring"]');
  await expect(calendarSurface).toBeVisible();
  await expect(calendarSurface.getByText('Andes 客户会议', { exact: true })).toBeVisible();
  await calendarSurface.getByText('Andes 客户会议', { exact: true }).click();
  await expect(calendarSurface.getByText('会议室', { exact: true })).toBeVisible();

  const directVendorCalls = state.observedRequests.filter((url) => url.includes(':3000') || url.includes('/rest/messages') || url.includes('/rest/calendarEvents') || url.includes('twenty-server'));
  expect(directVendorCalls).toEqual([]);
  await expect(page.locator('[data-surface="pending-real-wiring"]')).toHaveCount(0);
});

test('employee sees neutral self-service states and only relevant controls', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop employee product-language acceptance');
  await installAuthenticatedMocks(page, { role: 'substrate-user', connected: false, initialFileCreatedBy: 'another-user' });
  await page.goto('/');
  const sidebar = page.locator('aside.sidebar');

  await sidebar.getByRole('button', { name: '文件', exact: true }).click();
  const existingFile = page.locator('.crm-file-row').filter({ hasText: 'Andes-electricity-bill.pdf' });
  await expect(existingFile).toBeVisible();
  await expect(existingFile.getByRole('button', { name: '删除', exact: true })).toHaveCount(0);

  await expect(sidebar.getByRole('button', { name: '邮件', exact: true })).toHaveCount(0);
  await sidebar.getByRole('button', { name: '日历', exact: true }).click();
  await expect(page.locator('[data-surface="real-calendar-wiring"]')).toBeVisible();
  await expect(page.getByText('Andes 客户会议', { exact: true })).toBeVisible();
  for (const restrictive of ['请联系超级管理员', '权限不足', '没有用户管理权限']) await expect(page.getByText(restrictive, { exact: false })).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: '销售分析', exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: '数据导入与导出', exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: '业务自动化', exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: '系统设置', exact: true })).toHaveCount(0);
});

test('manager/admin surfaces use truthful aggregates, single governed import center and governed management states', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop manager/admin acceptance');
  const state = await installAuthenticatedMocks(page);
  await page.goto('/');
  const sidebar = page.locator('aside.sidebar');

  await sidebar.getByRole('button', { name: '销售分析', exact: true }).click();
  await expect(page.locator('[data-surface="real-dashboard-wiring"]')).toBeVisible();
  await expect(page.getByText('进行中商机金额', { exact: true })).toBeVisible();
  await expect(page.getByText('逾期任务', { exact: true })).toBeVisible();
  await expect(page.locator('[data-surface="real-dashboard-wiring"]').getByText('US$880,000', { exact: true }).last()).toBeVisible();
  await expect(page.locator('[data-surface="real-dashboard-wiring"]').getByText('€100,000', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('US$980,000', { exact: true })).toHaveCount(0);
  const customerFunnel = page.locator('.crm-funnel-row').filter({ hasText: '客户' });
  await expect(customerFunnel.locator('strong')).toHaveText('0');

  await sidebar.getByRole('button', { name: '数据导入与导出', exact: true }).click();
  const dataSurface = page.getByTestId('company-import-center');
  await expect(dataSurface).toBeVisible();
  await expect(page.getByTestId('company-import-history')).toBeVisible();
  await expect(page.locator('[data-surface="real-data-transfer-wiring"]')).toHaveCount(0);
  expect(state.getAccountCreates()).toBe(0);

  await sidebar.getByRole('button', { name: '业务自动化', exact: true }).click();
  await expect(page.locator('[data-surface="real-workflows-handoff"]')).toBeVisible();
  await expect(page.getByText('高级管理地址尚未配置', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: /系统管理 企业连接/ }).click();
  await expect(page.locator('[data-surface="real-settings-builder-handoff"]')).toBeVisible();
  for (const label of ['客户字段与分类', '记录页面布局', '角色与数据权限']) await expect(page.getByText(label, { exact: true })).toBeVisible();
  for (const retired of ['邮箱与日历账号', '外部应用连接']) await expect(page.getByText(retired, { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-surface="pending-real-wiring"]')).toHaveCount(0);

  for (const forbidden of ['浏览器未直连 Twenty', 'crm.v1.', 'Provider 记录', 'Prototype', 'Builder', 'Metadata Runtime', '请联系系统管理员', 'OAuth', 'Client Secret']) await expect(page.getByText(forbidden, { exact: false })).toHaveCount(0);
});