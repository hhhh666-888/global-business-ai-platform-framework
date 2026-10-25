import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../../..');

function invocation(records: unknown) {
  return JSON.stringify({ requestId: 'batch16-test', providerId: 'test-provider', result: records });
}

async function installAuthenticatedApi(page: any) {
  const account = {
    businessId: 'account-b16', businessType: 'Account', displayName: 'Ecuador Industrial Customer', website: null,
    linkedinUrl: null, addressStreet1: null, addressStreet2: null, addressCity: 'Guayaquil', addressState: null,
    addressPostcode: null, addressCountry: 'Ecuador', annualRevenue: null, annualRevenueCurrency: null, updatedAt: null,
  };
  const contact = {
    businessId: 'contact-b16', businessType: 'Contact', personName: 'Maria Purchasing', email: 'maria@example.test', phone: '+593999999999',
    jobTitle: 'Purchasing Manager', linkedinUrl: null, accountBusinessId: 'account-b16', updatedAt: null,
  };
  const opportunity = {
    businessId: 'opportunity-b16', businessType: 'Opportunity', nameSummary: 'Factory solar storage project', lifecycleState: 'OPEN',
    accountBusinessId: 'account-b16', estimatedValue: 260000, currencyCode: 'USD', pipelineStage: 'PROPOSAL', nextStep: 'Confirm quotation',
  };

  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'batch16-token', id_token: 'batch16-id-token' }));
  });

  await page.route('http://127.0.0.1:8080/api/**', async (route: any) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/me') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ subject: 'batch16-user', username: 'batch16.user', roles: ['substrate-user', 'substrate-admin'] }) });
    if (path === '/api/crm-native/company-profiles') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profiles: [] }) });
    if (path === '/api/crm-native/customer-intelligence') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profiles: [] }) });
    if (path === '/api/crm-native/opportunity-profiles') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profiles: [{ businessId: 'opportunity-b16', tradeStage: 'NEGOTIATION', profileUpdatedAt: '2026-09-10T00:00:00.000Z' }] }) });
    if (path.includes('/crm.v1.account.list/')) return route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ records: [account] }) });
    if (path.includes('/crm.v1.contact.list/')) return route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ records: [contact] }) });
    if (path.includes('/crm.v1.opportunity.list/')) return route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ records: [opportunity] }) });
    if (path.includes('/crm.ops.v1.task.list/') || path.includes('/crm.ops.v1.note.list/') || path.includes('/crm.ops.v1.activity.list/')) return route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ records: [] }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

test('Batch 16 defaults to Light even when the operating system prefers Dark', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop Batch 16 acceptance');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('gbap.oauth.explicit-logout', '1');
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');
});

test('Batch 16 renders the real Keycloak login card dark after an explicit Dark preference', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop Batch 16 acceptance');
  const loginUrl = process.env.STAGE3_7_KEYCLOAK_LOGIN_URL;
  test.skip(!loginUrl, 'isolated Keycloak runtime is supplied by Stage 3.7 CI');
  const origin = new URL(loginUrl!).origin;
  await page.context().addCookies([{ name: 'gbap_appearance', value: 'dark', url: origin }]);
  await page.goto(loginUrl!);
  await expect(page.locator('html')).toHaveAttribute('data-gbap-theme', 'dark');
  const card = await page.locator('.pf-v5-c-login__main').evaluate((element) => getComputedStyle(element).backgroundColor);
  const input = await page.locator('#username').evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(card).not.toBe('rgb(255, 255, 255)');
  expect(input).not.toBe('rgb(255, 255, 255)');
  await expect(page.locator('#kc-page-title')).toHaveCSS('color', 'rgb(215, 224, 236)');
});

test('Batch 16 uses body Portal modals and leading actions for contacts and opportunities', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop Batch 16 acceptance');
  await installAuthenticatedApi(page);
  await page.goto('/');
  const sidebar = page.locator('aside.sidebar');
  const pageActions = page.locator('#page-action-slot');

  await sidebar.getByRole('button', { name: '联系人', exact: true }).click();
  const people = page.locator('[data-surface="real-contact-wiring"]');
  await expect(people).toBeVisible();
  await expect(people.locator('thead th').first()).toHaveText('操作');
  await people.getByRole('button', { name: '查看 / 编辑', exact: true }).click();
  const contactDialog = page.getByRole('dialog', { name: '查看 / 编辑联系人' });
  await expect(contactDialog).toBeVisible();
  expect(await contactDialog.evaluate((element) => element instanceof HTMLDialogElement && element.parentElement === document.body && element.matches(':modal'))).toBe(true);
  await contactDialog.getByRole('button', { name: '关闭查看 / 编辑联系人' }).click();
  await pageActions.getByRole('button', { name: '新建联系人', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '新建联系人' })).toBeVisible();
  await page.keyboard.press('Escape');

  await sidebar.getByRole('button', { name: '商机', exact: true }).click();
  const opportunities = page.locator('[data-surface="real-opportunity-wiring"]');
  await expect(opportunities).toBeVisible();
  await expect(opportunities.locator('thead th').first()).toHaveText('操作');
  await expect(opportunities.getByText('商务谈判', { exact: true })).toBeVisible();
  await opportunities.getByRole('button', { name: '查看 / 编辑', exact: true }).click();
  const opportunityDialog = page.getByRole('dialog', { name: '查看 / 编辑商机' });
  await expect(opportunityDialog).toBeVisible();
  await expect(opportunityDialog.getByLabel('编辑外贸推进阶段').locator('option')).toHaveCount(11);
  await expect(opportunityDialog.getByLabel('编辑商机结果').locator('option')).toHaveCount(4);
});

test('Batch 17 keeps the customer company View action pinned while the table scrolls horizontally', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop Batch 17 acceptance');
  await installAuthenticatedApi(page);
  await page.setViewportSize({ width: 900, height: 760 });
  await page.goto('/');
  await page.locator('aside.sidebar').getByRole('button', { name: '客户公司', exact: true }).click();
  const legacySurface = page.locator('[data-surface="real-account-wiring"]');
  const table = legacySurface.locator('table.customer-company-table');
  const scroller = legacySurface.locator('.customer-table-scroll');
  await expect(table).toBeVisible();
  const actionButton = table.locator('tbody .customer-row-actions button').first();
  const companyName = table.locator('tbody .customer-name-cell strong').first();
  await expect(actionButton).toHaveText('查看');
  const beforeAction = await actionButton.boundingBox();
  const beforeName = await companyName.boundingBox();
  expect(beforeAction).not.toBeNull();
  expect(beforeName).not.toBeNull();
  expect(beforeAction!.x).toBeLessThan(beforeName!.x);

  const scrollWidth = await scroller.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(scrollWidth).toBeGreaterThan(100);
  await scroller.evaluate((element) => { element.scrollLeft = Math.min(420, element.scrollWidth); });
  await expect.poll(() => scroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

  const afterAction = await actionButton.boundingBox();
  const afterName = await companyName.boundingBox();
  expect(afterAction).not.toBeNull();
  expect(afterName).not.toBeNull();
  expect(Math.abs(afterAction!.x - beforeAction!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(afterName!.x - beforeName!.x)).toBeLessThanOrEqual(1);
});

test('Batch 16 source keeps opportunity outcome separate from GBAP foreign-trade stage', async () => {
  const opportunity = readFileSync(resolve(repoRoot, 'apps/web/src/components/OpportunitiesSurface.tsx'), 'utf8');
  const profile = readFileSync(resolve(repoRoot, 'apps/api/opportunity-profile.mjs'), 'utf8');
  const businessClient = readFileSync(resolve(repoRoot, 'apps/web/src/lib/crmBusinessClient.ts'), 'utf8');
  expect(opportunity).toContain("'CONTACTED'");
  expect(opportunity).toContain("'TECHNICAL_SAMPLE'");
  expect(opportunity).toContain("'ORDER_PENDING'");
  expect(opportunity).toContain("'ON_HOLD'");
  expect(opportunity).toContain('外贸推进阶段');
  expect(opportunity).toContain('商机结果');
  expect(profile).toContain("'crm.opportunity.trade_stage.update'");
  expect(businessClient).toContain('providerStageForTradeStage');
  expect(businessClient).toContain('updateOpportunityProfile');
});

async function installPaginatedCustomerApi(page: any) {
  const accounts = Array.from({ length: 55 }, (_, index) => ({
    businessId: `customer-${String(index + 1).padStart(3, '0')}`,
    businessType: 'Account',
    externalId: `company-${index + 1}`,
    externalType: 'company',
    displayName: `Customer ${String(index + 1).padStart(3, '0')}`,
    website: `https://customer-${index + 1}.example`,
    addressCountry: index < 30 ? '厄瓜多尔' : '洪都拉斯',
    addressState: index < 30 ? 'Guayas' : 'Francisco Morazán',
    addressCity: index < 30 ? 'Guayaquil' : 'Tegucigalpa',
  }));
  const profiles = accounts.map((account, index) => ({
    businessId: account.businessId,
    customerType: 'FACTORY',
    relationshipStatus: 'PROSPECT',
    industry: index % 2 === 0 ? '塑料制造' : '食品制造',
    priority: index % 3 === 0 ? 'HIGH' : 'MEDIUM',
    accountOwnerUserId: index < 20 ? '销售A' : index < 40 ? '销售B' : '销售C',
  }));
  const contactRecords = [
    ...accounts.slice(0, 10).map((account, index) => ({
      businessId: `direct-contact-${index + 1}`, businessType: 'Contact', externalId: `direct-${index + 1}`, externalType: 'person',
      personName: `Direct Contact ${index + 1}`, email: `direct-${index + 1}@example.test`, phone: null, jobTitle: 'Purchasing Manager', linkedinUrl: null,
      accountBusinessId: account.businessId,
    })),
    ...accounts.slice(10, 15).map((account, index) => ({
      businessId: `named-contact-${index + 1}`, businessType: 'Contact', externalId: `named-${index + 1}`, externalType: 'person',
      personName: `Named Contact ${index + 1}`, email: null, phone: null, jobTitle: 'General Manager', linkedinUrl: null,
      accountBusinessId: account.businessId,
    })),
  ];
  const opportunityRecords = accounts.slice(0, 8).map((account, index) => ({
    businessId: `customer-opportunity-${index + 1}`, businessType: 'Opportunity', externalId: `opp-${index + 1}`, externalType: 'opportunity',
    nameSummary: `Customer opportunity ${index + 1}`, lifecycleState: 'OPEN', accountBusinessId: account.businessId,
    estimatedValue: 100000 + index * 1000, currencyCode: 'USD', pipelineStage: 'SCREENING', nextStep: 'Continue development',
  }));
  let tablePreference: unknown = null;

  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'customer-table-access-token', id_token: 'customer-table-id-token' }));
  });
  await page.route('http://127.0.0.1:8080/api/me', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ subject: 'customer-table-admin', username: 'customer.table.admin', roles: ['substrate-admin'] }),
  }));
  await page.route('http://127.0.0.1:8080/api/user-preferences/customer-company-table', async (route: any) => {
    if (route.request().method() === 'PUT') {
      const input = route.request().postDataJSON();
      tablePreference = input.value;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ preference: { key: 'customer-company-table', value: tablePreference, updatedAt: new Date().toISOString() } }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ preference: tablePreference === null ? null : { key: 'customer-company-table', value: tablePreference, updatedAt: new Date().toISOString() } }) });
  });
  await page.route('http://127.0.0.1:8080/api/crm-native/company-profiles', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ profiles }),
  }));
  await page.route('http://127.0.0.1:8080/api/crm-native/customer-intelligence', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ profiles: accounts.map((account) => ({ businessId: account.businessId, customerSegment: 'INDUSTRIAL', developmentStage: 'NEW' })) }),
  }));
  await page.route('http://127.0.0.1:8080/api/crm-native/company-research-insights', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ insights: [] }),
  }));
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.account.list/invoke', (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ records: accounts }) }));
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.contact.list/invoke', (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ records: contactRecords }) }));
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.opportunity.list/invoke', (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ records: opportunityRecords }) }));
}

test('Batch 17 customer company paginates at 50, uses action-oriented filters, and physically resizes persisted columns', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop customer table acceptance');
  await page.setViewportSize({ width: 1600, height: 900 });
  await installPaginatedCustomerApi(page);
  await page.goto('/');

  await page.locator('aside.sidebar').getByRole('button', { name: '客户公司', exact: true }).click();
  const surface = page.locator('[data-surface="real-account-wiring"]');
  await expect(surface).toBeVisible();

  for (const retired of ['数据核验等级', '数据完整度/深挖状态', '省/州', '城市', '潜在用电等级', '开发优先级']) {
    await expect(surface.getByLabel(retired, { exact: true })).toHaveCount(0);
  }
  for (const active of ['国家/地区', '行业大类', '开发进度', '销售负责人', '联系状态', '商机状态']) {
    await expect(surface.getByLabel(active, { exact: true })).toBeVisible();
  }

  const pagination = surface.getByTestId('customer-pagination');
  await expect(pagination).toContainText('每页 50 家');
  await expect(pagination).toContainText('显示 1-50 / 共 55 家');
  await expect(surface.locator('.customer-company-table tbody tr')).toHaveCount(50);
  await surface.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(pagination).toContainText('显示 51-55 / 共 55 家');
  await expect(surface.locator('.customer-company-table tbody tr')).toHaveCount(5);

  await surface.getByLabel('国家/地区', { exact: true }).selectOption('厄瓜多尔');
  await expect(pagination).toContainText('显示 1-30 / 共 30 家');
  await surface.getByLabel('销售负责人', { exact: true }).selectOption('销售A');
  await expect(pagination).toContainText('显示 1-20 / 共 20 家');
  await surface.getByLabel('联系状态', { exact: true }).selectOption('可直接联系');
  await expect(pagination).toContainText('显示 1-10 / 共 10 家');
  await surface.getByLabel('商机状态', { exact: true }).selectOption('已有商机');
  await expect(pagination).toContainText('显示 1-8 / 共 8 家');

  const resizeHandle = surface.locator('.customer-column-resizer[aria-label="调整公司名称列宽"]');
  const companyNameHeader = resizeHandle.locator('..');
  await expect(resizeHandle).toBeVisible();
  const widthBeforeState = Number(await companyNameHeader.getAttribute('data-column-width'));
  const widthBeforePixels = (await companyNameHeader.boundingBox())?.width ?? 0;
  const handleBox = await resizeHandle.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2 + 80, handleBox!.y + handleBox!.height / 2, { steps: 5 });
  await page.mouse.up();

  await expect.poll(async () => Number(await companyNameHeader.getAttribute('data-column-width'))).toBeGreaterThan(widthBeforeState + 50);
  await expect.poll(async () => (await companyNameHeader.boundingBox())?.width ?? 0).toBeGreaterThan(widthBeforePixels + 50);

  const resizedWidth = Number(await companyNameHeader.getAttribute('data-column-width'));
  await page.waitForTimeout(700);
  await page.reload();
  await page.locator('aside.sidebar').getByRole('button', { name: '客户公司', exact: true }).click();
  const reloadedSurface = page.locator('[data-surface="real-account-wiring"]');
  const reloadedHeader = reloadedSurface.locator('.customer-column-resizer[aria-label="调整公司名称列宽"]').locator('..');
  await expect.poll(async () => Number(await reloadedHeader.getAttribute('data-column-width'))).toBe(resizedWidth);
  await expect.poll(async () => (await reloadedHeader.boundingBox())?.width ?? 0).toBeGreaterThan(widthBeforePixels + 50);
});
