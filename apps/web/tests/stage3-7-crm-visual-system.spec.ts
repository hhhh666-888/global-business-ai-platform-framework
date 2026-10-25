import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../../..');

function invocation(result: Record<string, unknown>) {
  return JSON.stringify({ requestId: 'stage3-7-visual', providerId: 'test-provider', result: { ok: true, ...result } });
}

async function installEmployeeSession(page: any) {
  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'stage3-7-access-token', id_token: 'stage3-7-id-token' }));
  });
  await page.route('http://127.0.0.1:8080/api/me', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ subject: 'employee-id', username: 'employee.user', roles: ['substrate-user'] }),
  }));
}

async function installVisualCrmMocks(page: any) {
  const accounts = [
    { businessId: 'account-one', businessType: 'Account', externalId: 'company-one', externalType: 'company', displayName: 'Alpha Energy', website: 'https://alpha.example' },
    { businessId: 'account-two', businessType: 'Account', externalId: 'company-two', externalType: 'company', displayName: 'Beta Energy', website: 'https://beta.example' },
  ];
  await page.route('http://127.0.0.1:8080/api/crm-native/files', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ files: [], maxFileBytes: 300 * 1024 * 1024 }),
  }));
  await page.route('http://127.0.0.1:8080/api/crm-native/company-profiles', (route: any) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ profiles: [] }),
  }));
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.account.list/invoke', (route: any) => route.fulfill({
    status: 200, contentType: 'application/json', body: invocation({ records: accounts }),
  }));
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.contact.list/invoke', (route: any) => route.fulfill({
    status: 200, contentType: 'application/json', body: invocation({ records: [] }),
  }));
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.opportunity.list/invoke', (route: any) => route.fulfill({
    status: 200, contentType: 'application/json', body: invocation({ records: [] }),
  }));
}

async function expectNotPureWhite(locator: any) {
  await expect(locator).toBeVisible();
  const background = await locator.evaluate((element: Element) => getComputedStyle(element).backgroundColor);
  expect(background).not.toBe('rgb(255, 255, 255)');
}

function rgbChannels(value: string) {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) throw new Error(`Unsupported color: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function relativeLuminance(value: string) {
  const channels = rgbChannels(value).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

async function expectPrimaryActionContrast(locator: any) {
  let styles = { color: '', background: '' };
  await expect.poll(async () => {
    try {
      styles = await locator.evaluate((element: Element) => {
        const computed = getComputedStyle(element);
        return { color: computed.color, background: computed.backgroundColor };
      });
      return styles.color === 'rgb(255, 255, 255)' && Boolean(styles.background) && styles.background !== 'rgba(0, 0, 0, 0)';
    } catch {
      return false;
    }
  }, { timeout: 5000 }).toBe(true);
  expect(contrastRatio(styles.color, styles.background)).toBeGreaterThanOrEqual(4.5);
  return styles;
}

async function expectActionsInsideTopbar(page: any, actions: any) {
  const topbar = page.locator('header.topbar');
  const search = page.locator('.global-search-shell');
  await expect(topbar).toBeVisible();
  await expect(actions).toBeVisible();
  const [topbarBox, actionBox, searchBox] = await Promise.all([topbar.boundingBox(), actions.boundingBox(), search.boundingBox()]);
  expect(topbarBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  expect(searchBox).not.toBeNull();
  expect(actionBox!.y).toBeGreaterThanOrEqual(topbarBox!.y - 1);
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(topbarBox!.y + topbarBox!.height + 1);
  expect(searchBox!.x + searchBox!.width).toBeLessThanOrEqual(actionBox!.x - 6);
}

test('Stage 3.7 Batch 8 exposes grouped CRM navigation and user settings without duplicate recycle entry', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop visual-system acceptance');
  await installEmployeeSession(page);
  await page.goto('/');

  const sidebar = page.locator('aside.sidebar');
  await expect(sidebar.getByText('客户与销售', { exact: true })).toBeVisible();
  await expect(sidebar.getByText('协作', { exact: true })).toBeVisible();
  await expect(sidebar.getByText('工具', { exact: true })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: '设置', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: '回收站', exact: true })).toHaveCount(0);

  await sidebar.getByRole('button', { name: '设置', exact: true }).click();
  const settings = page.locator('[data-surface="crm-settings"]');
  await expect(settings).toBeVisible();
  await expect(settings.getByRole('button', { name: /外观/ })).toBeVisible();
  await expect(settings.getByRole('button', { name: /数据与恢复/ })).toBeVisible();
  await expect(settings.getByRole('button', { name: /系统管理/ })).toHaveCount(0);
});

test('Stage 3.7 Batch 8 appearance switches light dark and system and persists per signed-in user', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop visual-system acceptance');
  await installEmployeeSession(page);
  await page.goto('/');
  await page.locator('aside.sidebar').getByRole('button', { name: '设置', exact: true }).click();

  const settings = page.locator('[data-surface="crm-settings"]');
  const appearance = settings.locator('[data-settings-section="appearance"]');
  await expect(appearance).toBeVisible();

  await appearance.getByRole('radio', { name: '深色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('gbap.appearance.employee-id'))).toBe('dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('aside.sidebar').getByRole('button', { name: '设置', exact: true }).click();

  const reloadedAppearance = page.locator('[data-settings-section="appearance"]');
  await reloadedAppearance.getByRole('radio', { name: '浅色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('gbap.appearance.employee-id'))).toBe('light');

  await reloadedAppearance.getByRole('radio', { name: '跟随系统', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'system');
  expect(await page.evaluate(() => localStorage.getItem('gbap.appearance.employee-id'))).toBe('system');
});

test('Stage 3.7 Batch 9 dark theme covers Files and Company 360 legacy inner surfaces', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop dark-theme coverage acceptance');
  await installEmployeeSession(page);
  await installVisualCrmMocks(page);
  await page.addInitScript(() => localStorage.setItem('gbap.appearance.employee-id', 'dark'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  const sidebar = page.locator('aside.sidebar');
  await sidebar.getByRole('button', { name: '文件', exact: true }).click();
  const files = page.locator('[data-surface="real-files-wiring"]');
  await expect(files).toBeVisible();
  await expect(files.locator('.crm-section-card')).toHaveCount(2);
  await expectNotPureWhite(files.locator('.crm-section-card').nth(0));
  await expectNotPureWhite(files.locator('.crm-section-card').nth(1));
  await expectNotPureWhite(files.locator('.crm-advanced-form [role="combobox"]'));

  await sidebar.getByRole('button', { name: '客户公司', exact: true }).click();
  const companies = page.locator('[data-surface="real-account-wiring"]');
  await expect(companies).toBeVisible();
  await expect(companies.locator('.company-list-row')).toHaveCount(2);
  await expectNotPureWhite(companies.locator('.company-list-pane'));
  await expectNotPureWhite(companies.locator('.company-list-row:not(.selected)').first());
  await expectNotPureWhite(companies.locator('.company-detail-pane'));
});

test('Stage 3.7 Batch 10 keeps one page title and structurally bridges page actions into the desktop topbar', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop page-header consolidation acceptance');
  await page.setViewportSize({ width: 1600, height: 900 });
  await installEmployeeSession(page);
  await installVisualCrmMocks(page);
  await page.goto('/');

  const sidebar = page.locator('aside.sidebar');
  const pageActionSlot = page.locator('#page-action-slot');
  const workbenchBand = page.locator('[data-surface="real-workbench"] > .workbench-actions-only');
  const workbenchActions = pageActionSlot.locator(':scope > .toolbar-actions');
  await expectActionsInsideTopbar(page, workbenchActions);
  await expect(workbenchBand).toBeHidden();
  await expect(page.locator('header.topbar h1')).toHaveText('销售工作台');
  await expect(workbenchActions.getByRole('button', { name: /刷新/ })).toBeVisible();
  await expect(workbenchActions.getByRole('button', { name: '新建商机', exact: true })).toBeVisible();

  await sidebar.getByRole('button', { name: '联系人', exact: true }).click();
  const contacts = page.locator('[data-surface="real-contact-wiring"]');
  await expect(contacts).toBeVisible();
  await expect(page.locator('header.topbar h1')).toHaveText('联系人');
  await expect(contacts.locator(':scope > .object-toolbar h2')).toBeHidden();
  const contactToolbar = contacts.locator(':scope > .object-toolbar');
  expect(await contactToolbar.evaluate((element: Element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(42);
  const contactActions = pageActionSlot.locator(':scope > .toolbar-actions');
  await expectActionsInsideTopbar(page, contactActions);
  await expect(contactActions.getByRole('button', { name: /刷新/ })).toBeVisible();
  await expect(contactActions.getByRole('button', { name: '新建联系人', exact: true })).toBeVisible();
  await expect(contactToolbar.locator(':scope > .toolbar-actions')).toBeHidden();
  await contactActions.getByRole('button', { name: '新建联系人', exact: true }).click();
  const contactModal = page.getByRole('dialog', { name: '新建联系人' });
  await expect(contactModal.getByLabel('新建联系人姓名')).toBeVisible();
  expect(await contactModal.evaluate((element) => element instanceof HTMLDialogElement && element.parentElement === document.body && element.matches(':modal'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(contactModal).toBeHidden();

  await sidebar.getByRole('button', { name: '商机', exact: true }).click();
  const opportunities = page.locator('[data-surface="real-opportunity-wiring"]');
  await expect(opportunities).toBeVisible();
  await expect(page.locator('header.topbar h1')).toHaveText('商机');
  await expect(opportunities.locator(':scope > .object-toolbar h2')).toBeHidden();
  const opportunityActions = pageActionSlot.locator(':scope > .toolbar-actions');
  await expectActionsInsideTopbar(page, opportunityActions);
  await expect(opportunityActions.getByRole('button', { name: '表格视图', exact: true })).toBeVisible();
  await expect(opportunityActions.getByRole('button', { name: '看板视图', exact: true })).toBeVisible();
  await expect(opportunityActions.getByRole('button', { name: '新建商机', exact: true })).toBeVisible();
  await expect(opportunities.locator(':scope > .object-toolbar > .toolbar-actions')).toBeHidden();
  await opportunityActions.getByRole('button', { name: '看板视图', exact: true }).click();
  await expect(opportunities.locator('.kanban')).toBeVisible();
});

test('Stage 3.7 Batch 11 unifies dark primary actions and keeps row interaction states dark', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop dark contrast acceptance');
  await page.setViewportSize({ width: 1600, height: 900 });
  await installEmployeeSession(page);
  await installVisualCrmMocks(page);
  await page.addInitScript(() => localStorage.setItem('gbap.appearance.employee-id', 'dark'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  const sidebar = page.locator('aside.sidebar');
  const slot = page.locator('#page-action-slot');

  const workbenchPrimary = slot.locator('.page-primary-action').filter({ hasText: '新建商机' }).first();
  const workbenchStyle = await expectPrimaryActionContrast(workbenchPrimary);

  await sidebar.getByRole('button', { name: '客户公司', exact: true }).click();
  const companyActions = slot.locator(':scope > .toolbar-actions');
  await expect(companyActions.getByRole('button', { name: '新建客户公司', exact: true })).toBeVisible();
  const companyPrimary = companyActions.locator('.page-primary-action').filter({ hasText: '新建客户公司' }).first();
  const companyStyle = await expectPrimaryActionContrast(companyPrimary);
  expect(companyStyle.background).toBe(workbenchStyle.background);

  await sidebar.getByRole('button', { name: '联系人', exact: true }).click();
  const contactActions = slot.locator(':scope > .toolbar-actions');
  const contactPrimary = contactActions.locator('.page-primary-action').filter({ hasText: '新建联系人' }).first();
  const contactStyle = await expectPrimaryActionContrast(contactPrimary);
  expect(contactStyle.background).toBe(workbenchStyle.background);

  await page.locator('.profile-row').click();
  const account = page.locator('[data-surface="real-account-settings"]');
  await expect(account).toBeVisible();
  const accountSecurityRow = account.locator('.crm-view-row').nth(1);
  await accountSecurityRow.hover();
  await expectNotPureWhite(accountSecurityRow);
  const rowBackground = await accountSecurityRow.evaluate((element: Element) => getComputedStyle(element).backgroundColor);
  expect(rowBackground).not.toBe('rgba(247, 248, 250, 0.86)');
  await expect(accountSecurityRow.locator('.crm-row-main strong')).toHaveCSS('color', 'rgb(248, 251, 255)');
});

test('Stage 3.7 Batch 8 source keeps one theme-aware visual system and removes workbench duplication', async () => {
  const main = readFileSync(resolve(repoRoot, 'apps/web/src/main.tsx'), 'utf8');
  const app = readFileSync(resolve(repoRoot, 'apps/web/src/App.tsx'), 'utf8');
  const workbench = readFileSync(resolve(repoRoot, 'apps/web/src/components/WorkbenchSurface.tsx'), 'utf8');
  const settings = readFileSync(resolve(repoRoot, 'apps/web/src/components/SettingsSurface.tsx'), 'utf8');
  const visual = readFileSync(resolve(repoRoot, 'apps/web/src/crm-visual-system.css'), 'utf8');
  const pageChrome = readFileSync(resolve(repoRoot, 'apps/web/src/components/page-header-consolidation.css'), 'utf8');
  const pageBridge = readFileSync(resolve(repoRoot, 'apps/web/src/components/PageActionBridge.tsx'), 'utf8');
  const productExperience = readFileSync(resolve(repoRoot, 'apps/web/src/product-experience.css'), 'utf8');

  expect(main).toContain("import 'twenty-ui/theme-light.css'");
  expect(main).toContain("import 'twenty-ui/theme-dark.css'");
  expect(main).toContain("import './crm-visual-system.css'");
  expect(main).toContain("import './components/page-header-consolidation.css'");
  expect(main).toContain("import { PageActionBridge } from './components/PageActionBridge'");
  expect(main).toContain('<PageActionBridge />');
  expect(main.indexOf("./crm-visual-system.css")).toBeGreaterThan(main.indexOf("./product-experience.css"));
  expect(main.indexOf("./crm-visual-system.css")).toBeGreaterThan(main.indexOf("from './App'"));
  expect(main.indexOf("./components/page-header-consolidation.css")).toBeGreaterThan(main.indexOf("./crm-visual-system.css"));
  expect(main).toContain('<AppearanceProvider>');

  expect(app).toContain("label: '设置'");
  expect(app).not.toContain("{ key: 'recycle', label: '回收站'");
  expect(app).not.toContain("title=\"新建商机\" Icon={IconPlus}");
  expect(settings).toContain("title: '浅色'");
  expect(settings).toContain("title: '深色'");
  expect(settings).toContain("title: '跟随系统'");
  expect(settings).toContain('<RecycleBinSurface session={session} />');

  expect(workbench).toContain('商机金额');
  expect(workbench).not.toContain('>Pipeline<');
  expect(workbench).toContain('workbench-actions-only');
  expect(workbench).not.toContain('<h2>销售工作台</h2>');

  expect(visual).toContain("html[data-theme='dark']");
  expect(visual).toContain('--sidebar-width: 232px');
  expect(visual).toContain('.settings-layout');
  expect(visual).toContain('.sidebar-item.active::before');
  expect(visual).toContain('.appearance-grid');
  expect(pageChrome).toContain('Stage 3.7 Batch 11');
  expect(pageChrome).toContain('.page-action-slot');
  expect(pageChrome).toContain('background: #2f6fed');
  expect(pageChrome).toContain('color: #fff !important');
  expect(pageChrome).not.toContain('position: fixed');
  expect(pageBridge).toContain("slot.id = 'page-action-slot'");
  expect(pageBridge).toContain("data-page-action-source");
  expect(pageBridge).toContain("data-page-action-forward");
  expect(pageBridge).toContain("sourceChild.click()");
  expect(pageBridge).toContain("normalized.startsWith('新建')");
  expect(pageBridge).toContain("normalized.startsWith('新增')");
  expect(pageBridge).toContain("data-page-action-kind', 'primary'");
  expect(productExperience).toContain('.crm-view-row:hover');
  expect(productExperience).toContain('background: var(--fg-hover');
  expect(productExperience).toContain("html[data-theme='dark'] .rtw-table tr.selected");
});