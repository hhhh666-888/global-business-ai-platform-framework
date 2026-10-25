import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../../..');

function invocation(result: Record<string, unknown>) {
  return JSON.stringify({ requestId: 'stage3-7-customer-intelligence', providerId: 'test-provider', result: { ok: true, ...result } });
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

async function installCustomerMocks(page: any) {
  const accounts = [
    { businessId: 'factory-alpha', businessType: 'Account', externalId: 'company-alpha', externalType: 'company', displayName: 'Alpha Plastics', website: 'https://alpha.example', addressCountry: '厄瓜多尔', addressCity: 'Guayaquil' },
    { businessId: 'channel-beta', businessType: 'Account', externalId: 'company-beta', externalType: 'company', displayName: 'Beta Solar Distribution', website: 'https://beta.example', addressCountry: '厄瓜多尔', addressCity: 'Quito' },
    { businessId: 'factory-gamma', businessType: 'Account', externalId: 'company-gamma', externalType: 'company', displayName: 'Gamma Foods', website: 'https://gamma.example', addressCountry: '洪都拉斯', addressCity: 'Tegucigalpa' },
  ];
  let tablePreference: unknown = null;
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
    body: JSON.stringify({ profiles: [
      { businessId: 'factory-alpha', customerType: 'FACTORY', relationshipStatus: 'QUALIFIED', industry: '塑料制造', priority: 'HIGH', accountOwnerUserId: '负责人A' },
      { businessId: 'channel-beta', customerType: 'DISTRIBUTOR', relationshipStatus: 'PROSPECT', industry: '新能源分销', priority: 'HIGH' },
      { businessId: 'factory-gamma', customerType: 'FACTORY', relationshipStatus: 'PROSPECT', industry: '食品制造', priority: 'MEDIUM' },
    ] }),
  }));
  await page.route('http://127.0.0.1:8080/api/crm-native/customer-intelligence', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ profiles: [
      {
        businessId: 'factory-alpha', customerSegment: 'INDUSTRIAL', customerRoles: ['FACTORY'], developmentStage: 'QUALIFYING', monthlyConsumptionKwh: 850000,
        monthlyElectricityCost: 92000, electricityCostCurrency: 'USD', operatingHoursPerDay: 24, gridStability: 'FREQUENT_OUTAGE',
        generatorCapacityKw: 2000, roofAreaSqm: 54000, projectNeeds: ['SOLAR', 'STORAGE', 'MICROGRID'], keyEquipmentText: '注塑机 × 28；空压机 × 6',
      },
      {
        businessId: 'channel-beta', customerSegment: 'CHANNEL', customerRoles: ['RENEWABLE_DISTRIBUTOR', 'EPC'], developmentStage: 'CONTACTED', channelProducts: ['SOLAR_MODULE', 'INVERTER', 'STORAGE'],
        representedBrands: 'Huawei / Sungrow', annualPurchaseValue: 2500000, purchaseCurrency: 'USD', purchaseFrequency: 'MONTHLY', warehouseCapability: true,
        afterSalesCapability: true, installationCapability: true, technicalTeamSize: 18, coverageRegions: '厄瓜多尔全国', targetProducts: ['STORAGE', 'MICROGRID'],
      },
      {
        businessId: 'factory-gamma', customerSegment: 'INDUSTRIAL', customerRoles: ['FACTORY'], developmentStage: 'NEW', monthlyConsumptionKwh: 120000,
        operatingHoursPerDay: 16, gridStability: 'OCCASIONAL_OUTAGE', projectNeeds: ['SOLAR'],
      },
    ] }),
  }));
  await page.route('http://127.0.0.1:8080/api/crm-native/company-research-insights', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ insights: [] }),
  }));
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.account.list/invoke', (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ records: accounts }) }));
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.contact.list/invoke', (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ records: [] }) }));
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.opportunity.list/invoke', (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ records: [] }) }));
}

async function modalDiagnostics(dialog: any) {
  const diagnostic = await dialog.evaluate((element: HTMLElement) => {
    const chain: Array<Record<string, unknown>> = [];
    let current: HTMLElement | null = element;
    while (current) {
      const style = getComputedStyle(current);
      const rect = current.getBoundingClientRect();
      chain.push({
        tag: current.tagName,
        id: current.id,
        className: current.className,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        position: style.position,
        display: style.display,
        transform: style.transform,
        filter: style.filter,
        backdropFilter: (style as any).backdropFilter ?? '',
        perspective: style.perspective,
        contain: style.contain,
        willChange: style.willChange,
        overflow: style.overflow,
        animationName: style.animationName,
      });
      current = current.parentElement;
    }
    const backdrop = element.parentElement;
    const backdropRect = backdrop?.getBoundingClientRect();
    return {
      viewport: { innerWidth: window.innerWidth, innerHeight: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY },
      backdropRect: backdropRect ? { x: backdropRect.x, y: backdropRect.y, width: backdropRect.width, height: backdropRect.height } : null,
      chain,
    };
  });
  console.log(`BATCH13_MODAL_DIAGNOSTICS=${JSON.stringify(diagnostic)}`);
}

async function buttonDiagnostics(dialog: any) {
  const diagnostic = await dialog.locator('button').evaluateAll((buttons: HTMLElement[]) => buttons.map((button) => {
    const style = getComputedStyle(button);
    const rect = button.getBoundingClientRect();
    return {
      text: button.innerText,
      title: button.getAttribute('title'),
      ariaLabel: button.getAttribute('aria-label'),
      type: button.getAttribute('type'),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
    };
  }));
  console.log(`BATCH13_BUTTON_DIAGNOSTICS=${JSON.stringify(diagnostic)}`);
}

async function expectCenteredModal(page: any, dialog: any) {
  await expect(dialog).toBeVisible();
  await modalDiagnostics(dialog);
  const box = await dialog.locator('.company-detail-drawer').boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(18);
  expect(box!.x).toBeGreaterThanOrEqual(18);
  expect(box!.height).toBeLessThan(viewport!.height - 20);
  expect(Math.abs((box!.x + box!.width / 2) - viewport!.width / 2)).toBeLessThanOrEqual(3);
  expect(Math.abs((box!.y + box!.height / 2) - viewport!.height / 2)).toBeLessThanOrEqual(3);
}

test('Stage 3.7 customer company uses one 75-field database and exactly two detail pages', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop customer intelligence acceptance');
  await page.setViewportSize({ width: 1600, height: 900 });
  await installEmployeeSession(page);
  await installCustomerMocks(page);
  await page.goto('/');

  await page.locator('aside.sidebar').getByRole('button', { name: '客户公司', exact: true }).click();
  const surface = page.locator('[data-surface="real-account-wiring"]');
  await expect(surface).toBeVisible();
  await expect(surface).toHaveAttribute('data-company-contract', 'TOP500_V46_75');
  await expect(surface.locator('.customer-company-table tbody tr')).toHaveCount(3);
  await expect(surface.getByRole('tab', { name: /工业用能客户/ })).toBeVisible();
  await expect(surface.getByRole('tab', { name: /渠道 \/ 经销商/ })).toBeVisible();
  await expect(surface.getByRole('button', { name: '列设置', exact: true })).toBeVisible();
  await expect(surface.getByRole('button', { name: '保存表格视图', exact: true })).toBeVisible();

  const resizeHandle = surface.locator('.customer-column-resizer[aria-label="调整公司名称列宽"]');
  const companyNameHeader = resizeHandle.locator('..');
  await expect(resizeHandle).toBeVisible();
  const widthBefore = Number(await companyNameHeader.getAttribute('data-column-width'));
  const handleBox = await resizeHandle.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2 + 64, handleBox!.y + handleBox!.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => Number(await companyNameHeader.getAttribute('data-column-width'))).toBeGreaterThan(widthBefore + 30);
  const widthAfter = (await companyNameHeader.boundingBox())?.width ?? 0;
  expect(widthAfter).toBeGreaterThan(0);

  page.once('dialog', async (dialog) => { expect(dialog.type()).toBe('prompt'); await dialog.accept('工业客户测试视图'); });
  await surface.getByRole('button', { name: '保存表格视图', exact: true }).click();
  const savedViewSelect = surface.getByLabel('已保存客户表格视图');
  await expect(savedViewSelect).toBeVisible();
  await expect(savedViewSelect.locator('option')).toHaveCount(2);
  await expect(surface.getByRole('button', { name: '删除视图', exact: true })).toBeEnabled();
  page.once('dialog', async (dialog) => { expect(dialog.type()).toBe('confirm'); await dialog.accept(); });
  await surface.getByRole('button', { name: '删除视图', exact: true }).click();
  await expect(savedViewSelect).toHaveCount(0);

  await surface.getByRole('button', { name: '列设置', exact: true }).click();
  const columnPanel = surface.getByTestId('top500-column-panel');
  await expect(columnPanel).toHaveAttribute('data-column-count', '75');
  await expect(columnPanel.locator('[data-top500-column-option]')).toHaveCount(75);
  await expect(columnPanel.locator('[data-top500-column-option="公司名称"]')).toBeVisible();
  await expect(columnPanel.locator('[data-top500-column-option="下一步动作"]')).toBeVisible();
  await surface.getByRole('button', { name: '列设置', exact: true }).click();

  await surface.getByRole('tab', { name: /工业用能客户/ }).click();
  await expect(surface.locator('.customer-company-table tbody tr')).toHaveCount(2);
  const nameHeader = surface.locator('.customer-company-table thead').getByRole('button', { name: /公司名称/ });
  await nameHeader.click();
  await nameHeader.click();
  await expect(surface.locator('.customer-company-table tbody tr').first().locator('.customer-name-cell strong')).toHaveText('Gamma Foods');

  await surface.getByLabel('行业大类', { exact: true }).selectOption('塑料制造');
  await expect(surface.locator('.customer-company-table tbody tr')).toHaveCount(1);
  await surface.getByRole('button', { name: '查看', exact: true }).click();
  const industrialDrawer = page.getByRole('dialog', { name: 'Alpha Plastics' });
  await expectCenteredModal(page, industrialDrawer);
  await expect(industrialDrawer.locator('.company-drawer-tabs button')).toHaveCount(2);
  await expect(industrialDrawer.getByRole('button', { name: '基础信息', exact: true })).toBeVisible();
  await expect(industrialDrawer.getByRole('button', { name: '开发进度', exact: true })).toBeVisible();
  await expect(industrialDrawer.getByRole('button', { name: '用能与电力', exact: true })).toHaveCount(0);
  await expect(industrialDrawer.getByRole('button', { name: '渠道与采购', exact: true })).toHaveCount(0);

  const profile75 = industrialDrawer.getByTestId('company-profile-75');
  await expect(profile75).toBeVisible();
  await expect(profile75).toHaveAttribute('data-field-count', '75');
  await expect(profile75).toHaveAttribute('data-schema-complete', 'true');
  const populatedIndustrialFields = profile75.locator('[data-top500-field]');
  const populatedIndustrialCount = await populatedIndustrialFields.count();
  expect(populatedIndustrialCount).toBeGreaterThan(0);
  expect(populatedIndustrialCount).toBeLessThan(75);
  await expect(profile75.getByText('待补充', { exact: true })).toHaveCount(0);
  await expect(profile75.locator('[data-top500-field="主要耗电设备"] strong')).toHaveText('注塑机 × 28；空压机 × 6');
  await expect(profile75.locator('[data-top500-field="已知实际用电/能源数据"] strong')).toContainText('850,000 kWh');
  await expect(profile75.locator('[data-top500-field="销售状态"]')).toBeHidden();
  await expect(profile75.locator('[data-top500-field="当前项目阶段"]')).toBeVisible();
  await expect(profile75.locator('[data-top500-field="当前项目阶段"] strong')).toHaveText('资格筛选');
  await expect(profile75.locator('[data-top500-field="销售负责人"] strong')).toHaveText('负责人A');

  const adaptiveCard = profile75.locator('[data-top500-field="主要耗电设备"]');
  const adaptiveStyles = await adaptiveCard.evaluate((element: HTMLElement) => {
    const style = getComputedStyle(element);
    return { height: style.height, maxHeight: style.maxHeight, overflow: style.overflow, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight };
  });
  expect(adaptiveStyles.maxHeight).toBe('none');
  expect(adaptiveStyles.overflow).toBe('visible');
  expect(adaptiveStyles.scrollHeight).toBeLessThanOrEqual(adaptiveStyles.clientHeight + 1);

  await industrialDrawer.getByRole('button', { name: '开发进度', exact: true }).click();
  await expect(industrialDrawer.getByText('客户开发进度', { exact: true })).toBeVisible();
  const development = industrialDrawer.getByTestId('company-development-detail');
  await expect(development).toHaveAttribute('data-stage-count', '11');
  await expect(development).toHaveAttribute('data-development-stage', 'QUALIFYING');
  await expect(industrialDrawer.locator('.development-step')).toHaveCount(11);
  await expect(industrialDrawer.locator('.development-step[data-stage-key="NEW"]')).toBeVisible();
  await expect(industrialDrawer.locator('.development-step[data-stage-key="ORDER_CONFIRMED"]')).toBeVisible();
  await expect(industrialDrawer.locator('.development-step[data-stage-key="ON_HOLD"]')).toBeVisible();
  const kpis = development.locator('.customer-intelligence-kpis');
  await expect(kpis.getByText('跟进状态', { exact: true })).toHaveCount(0);
  await expect(kpis.getByText('开发进度', { exact: true })).toBeVisible();
  await expect(kpis.getByText('销售负责人', { exact: true })).toBeVisible();
  await expect(kpis.getByText('负责人A', { exact: true })).toBeVisible();
  await expect(development.getByText('推进提示', { exact: true })).toHaveCount(0);
  await industrialDrawer.getByRole('button', { name: '关闭客户详情' }).click();

  await surface.getByRole('tab', { name: /渠道 \/ 经销商/ }).click();
  await expect(surface.locator('.customer-company-table tbody tr')).toHaveCount(1);
  await expect(surface.locator('.customer-name-cell strong')).toHaveText('Beta Solar Distribution');
  await surface.getByRole('button', { name: '查看', exact: true }).click();
  const channelDrawer = page.getByRole('dialog', { name: 'Beta Solar Distribution' });
  await expectCenteredModal(page, channelDrawer);
  await expect(channelDrawer.locator('.company-drawer-tabs button')).toHaveCount(2);
  const channelProfile75 = channelDrawer.getByTestId('company-profile-75');
  await expect(channelProfile75).toHaveAttribute('data-field-count', '75');
  await expect(channelProfile75).toHaveAttribute('data-schema-complete', 'true');
  const populatedChannelCount = await channelProfile75.locator('[data-top500-field]').count();
  expect(populatedChannelCount).toBeGreaterThan(0);
  expect(populatedChannelCount).toBeLessThan(75);
  await expect(channelProfile75.getByText('待补充', { exact: true })).toHaveCount(0);
});

test('Stage 3.7 keeps the customer create modal fixed while its editor scrolls internally', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop centered customer modal acceptance');
  await page.setViewportSize({ width: 1600, height: 900 });
  await installEmployeeSession(page);
  await installCustomerMocks(page);
  await page.goto('/');
  await page.locator('aside.sidebar').getByRole('button', { name: '客户公司', exact: true }).click();
  await page.locator('#page-action-slot').getByRole('button', { name: '新建客户公司', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: '新建客户公司' });
  await expectCenteredModal(page, dialog);
  await expect(dialog.getByTestId('company-profile-75-create')).toHaveAttribute('data-field-count', '75');
  await expect(dialog.locator('[data-top500-create-field]')).toHaveCount(75);
  await expect(dialog.getByText('TOP500 v46', { exact: false })).toHaveCount(0);
  const editor = dialog.locator('.top500-v46-editor');
  const dimensions = await editor.evaluate((element: HTMLElement) => ({ scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }));
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
  const before = await dialog.locator('.company-detail-drawer').boundingBox();
  await editor.evaluate((element: HTMLElement) => { element.scrollTop = Math.min(500, element.scrollHeight); });
  const after = await dialog.locator('.company-detail-drawer').boundingBox();
  expect(after).toEqual(before);
  await buttonDiagnostics(dialog);
  await expect(dialog.getByRole('button', { name: '创建客户公司', exact: true })).toBeVisible();
});

test('Stage 3.7 retries a failed intelligence write without creating a duplicate company', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'customer create retry acceptance');
  await page.setViewportSize({ width: 1600, height: 900 });
  await installEmployeeSession(page);

  let createCalls = 0;
  let intelligenceCalls = 0;
  const created = { businessId: 'retry-company', businessType: 'Account', externalId: 'retry-external', externalType: 'company', displayName: 'Retry Energy', website: null };
  await page.route('http://127.0.0.1:8080/api/crm-native/company-profiles', (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profiles: [] }) }));
  await page.route('http://127.0.0.1:8080/api/crm-native/customer-intelligence', (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profiles: [] }) }));
  await page.route('http://127.0.0.1:8080/api/crm-native/company-research-insights', (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ insights: [] }) }));
  await page.route('http://127.0.0.1:8080/api/user-preferences/customer-company-table', (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ preference: null }) }));
  await page.route('http://127.0.0.1:8080/api/crm-native/customer-intelligence/retry-company', (route: any) => {
    intelligenceCalls += 1;
    if (intelligenceCalls <= 3) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'temporary_profile_write_failure' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profile: { businessId: 'retry-company', customerSegment: 'INDUSTRIAL', customerRoles: ['FACTORY'], developmentStage: 'NEW', profile75Overrides: {} } }) });
  });
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.account.list/invoke', (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ records: [] }) }));
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.contact.list/invoke', (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ records: [] }) }));
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.opportunity.list/invoke', (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ records: [] }) }));
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.account.create/invoke', (route: any) => { createCalls += 1; return route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ record: created }) }); });
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.ops.v1.account.update/invoke', (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ record: { ...created, customerType: 'FACTORY', relationshipStatus: 'PROSPECT' } }) }));

  await page.goto('/');
  await page.locator('aside.sidebar').getByRole('button', { name: '客户公司', exact: true }).click();
  await page.locator('#page-action-slot').getByRole('button', { name: '新建客户公司', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新建客户公司' });
  await dialog.getByLabel('公司名称').fill('Retry Energy');
  await buttonDiagnostics(dialog);
  await dialog.getByRole('button', { name: '创建客户公司', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('CRM 服务暂时不可用');
  expect(createCalls).toBe(1);
  expect(intelligenceCalls).toBe(3);

  await dialog.getByRole('button', { name: '创建客户公司', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(createCalls).toBe(1);
  expect(intelligenceCalls).toBe(4);
});

test('Stage 3.7 source keeps one full company master with one frozen 75-field contract and one progress vocabulary', async () => {
  const companiesEntry = readFileSync(resolve(repoRoot, 'apps/web/src/components/CompaniesSurface.tsx'), 'utf8');
  const companies = readFileSync(resolve(repoRoot, 'apps/web/src/components/LegacyCompaniesSurface.tsx'), 'utf8');
  const table = readFileSync(resolve(repoRoot, 'apps/web/src/components/CompanyTop500Table.tsx'), 'utf8');
  const basicProfile = readFileSync(resolve(repoRoot, 'apps/web/src/components/CompanyBasicProfile75Detail.tsx'), 'utf8');
  const createProfile = readFileSync(resolve(repoRoot, 'apps/web/src/components/CompanyProfile75Create.tsx'), 'utf8');
  const editProfile = readFileSync(resolve(repoRoot, 'apps/web/src/components/CompanyProfile75Editor.tsx'), 'utf8');
  const developmentDetail = readFileSync(resolve(repoRoot, 'apps/web/src/components/CompanyDevelopmentDetail.tsx'), 'utf8');
  const developmentStage = readFileSync(resolve(repoRoot, 'apps/web/src/lib/crmDevelopmentStage.ts'), 'utf8');
  const researchSchema = readFileSync(resolve(repoRoot, 'apps/web/src/lib/crmResearchIntake.ts'), 'utf8');
  const contract = readFileSync(resolve(repoRoot, 'apps/web/src/lib/crmTop500V46Contract.ts'), 'utf8');
  const intelligence = readFileSync(resolve(repoRoot, 'apps/web/src/lib/crmCustomerIntelligenceClient.ts'), 'utf8');
  const pendingCreate = readFileSync(resolve(repoRoot, 'apps/web/src/lib/pendingCustomerCreate.ts'), 'utf8');
  const preferenceClient = readFileSync(resolve(repoRoot, 'apps/web/src/lib/userPreferencesClient.ts'), 'utf8');
  const preferenceApi = readFileSync(resolve(repoRoot, 'apps/api/user-preferences.mjs'), 'utf8');
  const profileCss = readFileSync(resolve(repoRoot, 'apps/web/src/components/company-basic-profile-75.css'), 'utf8');
  const resizeCss = readFileSync(resolve(repoRoot, 'apps/web/src/components/company-table-resize.css'), 'utf8');
  const profileHardeningCss = readFileSync(resolve(repoRoot, 'apps/web/src/batch17-top500-profile-hardening.css'), 'utf8');
  const modalFix = readFileSync(resolve(repoRoot, 'apps/web/src/components/customer-modal-fix.css'), 'utf8');
  const main = readFileSync(resolve(repoRoot, 'apps/web/src/main.tsx'), 'utf8');
  const apiHandler = readFileSync(resolve(repoRoot, 'apps/api/customer-intelligence.mjs'), 'utf8');
  const bootstrap = readFileSync(resolve(repoRoot, 'apps/api/bootstrap.mjs'), 'utf8');

  expect(companiesEntry).toContain('CustomerCompaniesDatabase');
  expect(companiesEntry).toContain("import './company-table-resize.css'");
  expect(companiesEntry).not.toContain('CompanyDevelopmentBoard');
  expect(companies).toContain('CompanyTop500Table');
  expect(companies).toContain('CompanyProfile75Create');
  expect(companies).toContain('CompanyProfile75Editor');
  expect(companies).toContain("type DrawerTab = 'overview' | 'development'");
  expect(companies).toContain('CompanyBasicProfile75Detail');
  expect(companies).toContain('CompanyDevelopmentDetail');
  expect(companies).not.toContain('TOP500 v46 75 字段统一主档');
  expect(companies).not.toContain("['energy', '用能与电力']");
  expect(companies).not.toContain("['channel', '渠道与采购']");

  expect(table).toContain('TOP500_V46_MODULES');
  expect(table).toContain('data-column-count="75"');
  expect(table).toContain('保存表格视图');
  expect(table).toContain('删除视图');
  expect(table).toContain('customer-column-resizer');
  expect(table).toContain("window.addEventListener('mousemove', move");
  expect(table).toContain('draggable={false}');
  expect(table).toContain('CUSTOMER_TABLE_PREFERENCE_KEY');
  expect(table).toContain('getUserPreference<CustomerTablePreference>');
  expect(table).toContain('setUserPreference(CUSTOMER_TABLE_PREFERENCE_KEY');
  expect(preferenceClient).toContain('/api/user-preferences/');
  expect(preferenceApi).toContain('ui_user_preference');
  expect(preferenceApi).toContain('owner_subject');
  expect(basicProfile).toContain('TOP500_V46_MODULES');
  expect(basicProfile).toContain('data-field-count');
  expect(basicProfile).toContain('data-schema-complete');
  expect(createProfile).toContain('data-field-count="75"');
  expect(editProfile).toContain('data-field-count="75"');
  expect(createProfile).not.toContain('建立 75 字段客户主档');
  expect(createProfile).not.toContain('创建并保存 75 项资料');
  expect(editProfile).not.toContain('编辑 75 字段资料');
  expect(editProfile).not.toContain('保存 75 项资料');

  expect(contract).toContain('TOP500_V46_FIELD_COUNT');
  expect(contract).toContain('mappingMatchesHeaders');
  expect(researchSchema).toContain('duplicateHeaders');
  expect(researchSchema).toContain('orderMatches');
  expect(researchSchema).toContain("'开发排名', 'GBAP价值评分'");
  expect(researchSchema).toContain("'核验日期', '下一步动作'");

  expect(developmentStage).toContain('FOLLOW_UP_STATUS_OPTIONS = DEVELOPMENT_STAGES.map');
  expect(developmentDetail).toContain('data-stage-count={DEVELOPMENT_STAGES.length}');
  expect(developmentDetail).toContain('客户开发进度');
  expect(developmentDetail).not.toContain('推进提示');
  expect(developmentDetail).not.toContain('<span>跟进状态</span>');
  expect(developmentDetail).toContain("profile75Overrides?.['销售负责人']");
  expect(basicProfile).toContain("'销售状态': stageLabel");
  expect(basicProfile).toContain("'当前项目阶段': stageLabel");
  expect(profileHardeningCss).toContain("[data-top500-field='销售状态']");

  expect(resizeCss).toContain('cursor: col-resize');
  expect(resizeCss).toContain('width: 13px');
  expect(profileCss).toContain('height: auto !important');
  expect(profileCss).toContain('max-height: none !important');
  expect(profileCss).toContain('white-space: pre-wrap');
  expect(intelligence).toContain('profile75Overrides');
  expect(intelligence).toContain('developmentStage');
  expect(intelligence).toContain('readBackCustomerIntelligence');
  expect(pendingCreate).toContain('pendingCustomerBusinessId');
  expect(pendingCreate).toContain('sessionStorage');
  expect(modalFix).toContain('place-items: center');
  expect(modalFix).toContain('100dvh');
  expect(main).toContain("import './components/customer-modal-fix.css'");
  expect(apiHandler).toContain("'customerSegment', 'customerRoles', 'developmentStage'");
  expect(apiHandler).toContain('profile75Overrides');
  expect(apiHandler).toContain('crm_business_state');
  expect(apiHandler).toContain("business_type='Account'");
  expect(apiHandler).not.toContain('twenty');
  expect(bootstrap).toContain('createCustomerIntelligenceHandler');
  expect(bootstrap).toContain('createUserPreferencesHandler');
});
