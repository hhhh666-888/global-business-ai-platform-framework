import { expect, test } from '@playwright/test';

function invocation(records: unknown) {
  return JSON.stringify({ requestId: 'searchable-relations-test', providerId: 'test-provider', result: records });
}

async function installApi(page: any) {
  const accounts = Array.from({ length: 55 }, (_, index) => ({
    businessId: `relation-account-${String(index + 1).padStart(3, '0')}`,
    businessType: 'Account',
    displayName: index === 54 ? 'Target Solar Factory' : `Customer ${String(index + 1).padStart(3, '0')}`,
    website: null,
    linkedinUrl: null,
    addressStreet1: null,
    addressStreet2: null,
    addressCity: index === 54 ? 'Guayaquil' : 'Quito',
    addressState: null,
    addressPostcode: null,
    addressCountry: 'Ecuador',
    annualRevenue: null,
    annualRevenueCurrency: null,
    updatedAt: null,
  }));
  const profiles = accounts.map((account, index) => ({
    businessId: account.businessId,
    displayName: account.displayName,
    registrationCountry: 'EC',
    registrationType: 'RUC',
    registrationId: index === 54 ? '0999999999001' : `0999999${String(index).padStart(6, '0')}`.slice(0, 13),
    industry: index === 54 ? '塑料制造' : '食品制造',
  }));
  const contacts = [{
    businessId: 'relation-contact-1', businessType: 'Contact', personName: 'Maria Purchasing', email: 'maria@example.test', phone: '+593999999999',
    jobTitle: 'Purchasing Manager', linkedinUrl: null, accountBusinessId: accounts[54].businessId, updatedAt: null,
  }];
  const opportunities = [{
    businessId: 'relation-opportunity-1', businessType: 'Opportunity', nameSummary: 'Factory storage project', lifecycleState: 'OPEN',
    accountBusinessId: accounts[54].businessId, estimatedValue: 100000, currencyCode: 'USD', pipelineStage: 'SCREENING', nextStep: 'Confirm quotation',
  }];

  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'relations-token', id_token: 'relations-id-token' }));
  });
  await page.route('**/api/**', async (route: any) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ subject: 'relations-user', username: 'relations.user', roles: ['substrate-user', 'substrate-admin'] }) });
    if (path === '/api/crm-native/company-profiles') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profiles }) });
    if (path === '/api/crm-native/customer-intelligence') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profiles: [] }) });
    if (path === '/api/crm-native/opportunity-profiles') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profiles: [] }) });
    if (path.includes('/crm.v1.account.list/')) return route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ records: accounts }) });
    if (path.includes('/crm.v1.contact.list/')) return route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ records: contacts }) });
    if (path.includes('/crm.v1.opportunity.list/')) return route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ records: opportunities }) });
    if (path.includes('/crm.ops.v1.task.list/') || path.includes('/crm.ops.v1.note.list/') || path.includes('/crm.ops.v1.activity.list/')) return route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ records: [] }) });
    if (path === '/api/crm-files') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [], maxFileBytes: 314572800 }) });
    if (path === '/api/crm-native/company-research-insights') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ insights: [] }) });
    if (path.startsWith('/api/user-preferences/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ preference: null }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

async function openFromSidebar(page: any, name: string) {
  await page.locator('aside.sidebar').getByRole('button', { name, exact: true }).click();
}

async function openCreateFromSurface(page: any, surfaceSelector: string, buttonName: string) {
  const surface = page.locator(surfaceSelector);
  await expect(surface).toBeVisible({ timeout: 15_000 });
  const sourceButton = surface.locator('.page-primary-action').filter({ hasText: buttonName }).first();
  await expect(sourceButton).toBeAttached({ timeout: 15_000 });
  await sourceButton.evaluate((element: HTMLButtonElement) => element.click());
}

async function closeDialog(dialog: any) {
  await dialog.getByRole('button', { name: /关闭/ }).click();
}

async function chooseFromCombobox(scope: any, label: string, query: string, optionText: string) {
  const combobox = scope.getByRole('combobox', { name: label, exact: true });
  await expect(combobox).toBeVisible({ timeout: 15_000 });
  await combobox.click();
  await expect(combobox).toHaveAttribute('aria-expanded', 'true');
  const listbox = scope.getByRole('listbox', { name: `${label}候选项`, exact: true });
  await expect(listbox).toBeVisible();
  await combobox.fill(query);
  const option = listbox.getByRole('option').filter({ hasText: optionText }).first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
  await expect(combobox).toHaveValue(new RegExp(optionText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await expect(combobox).toHaveAttribute('aria-expanded', 'false');
  await expect(listbox).toHaveCount(0);
}

test('business relations use one searchable combobox across CRM creation surfaces', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop Stage 3.7 acceptance');
  await installApi(page);
  await page.goto('/');

  await openFromSidebar(page, '商机');
  await openCreateFromSurface(page, '[data-surface="real-opportunity-wiring"]', '新建商机');
  const opportunityDialog = page.getByRole('dialog', { name: '新建商机' });
  const opportunityCompany = opportunityDialog.getByRole('combobox', { name: '客户公司', exact: true });
  await expect(opportunityCompany).toBeVisible({ timeout: 15_000 });
  await opportunityCompany.click();
  await expect(opportunityCompany).toHaveAttribute('aria-expanded', 'true');
  const opportunityList = opportunityDialog.getByRole('listbox', { name: '客户公司候选项', exact: true });
  await expect(opportunityList).toBeVisible();
  await opportunityCompany.fill('0999999999001');
  const targetCompany = opportunityList.getByRole('option').filter({ hasText: 'Target Solar Factory' }).first();
  await expect(targetCompany).toBeVisible({ timeout: 15_000 });
  await targetCompany.click();
  await expect(opportunityCompany).toHaveValue('Target Solar Factory');
  await expect(opportunityCompany).toHaveAttribute('aria-expanded', 'false');
  await expect(opportunityDialog.getByLabel('搜索客户公司', { exact: true })).toHaveCount(0);
  await closeDialog(opportunityDialog);

  await openFromSidebar(page, '任务');
  await openCreateFromSurface(page, '[data-surface="real-task-wiring"]', '新建任务');
  const taskDialog = page.getByRole('dialog', { name: '新建任务' });
  await chooseFromCombobox(taskDialog, '任务关联记录', 'Target Solar Factory', '客户公司 · Target Solar Factory');
  await closeDialog(taskDialog);

  await openFromSidebar(page, '笔记');
  await openCreateFromSurface(page, '[data-surface="real-note-wiring"]', '新建笔记');
  const noteDialog = page.getByRole('dialog', { name: '新建笔记' });
  await chooseFromCombobox(noteDialog, '笔记关联记录', 'Maria Purchasing', '联系人 · Maria Purchasing');
  await closeDialog(noteDialog);

  await openFromSidebar(page, '联系人');
  await openCreateFromSurface(page, '[data-surface="real-contact-wiring"]', '新建联系人');
  const contactDialog = page.getByRole('dialog', { name: '新建联系人' });
  await chooseFromCombobox(contactDialog, '新建联系人所属客户公司', '塑料制造', 'Target Solar Factory');
  await closeDialog(contactDialog);

  await openFromSidebar(page, '文件');
  const files = page.locator('[data-surface="real-files-wiring"]');
  await expect(files).toBeVisible({ timeout: 15_000 });
  await chooseFromCombobox(files, '文件关联业务记录', 'Factory storage project', '商机 · Factory storage project');
});
