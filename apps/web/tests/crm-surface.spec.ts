import { expect, test } from '@playwright/test';

const futureBrickLabels = ['找客户', '沟通 / 渠道', 'AI 助手', '企业知识库', '报价与方案', '综合能源', '项目协同', '数据分析', '管理后台'];

async function installAuthenticatedRole(page: any, roles: string[], username: string) {
  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'role-test-access-token', id_token: 'role-test-id-token' }));
  });
  await page.route('http://127.0.0.1:8080/api/me', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ subject: `role-test-${username}`, username, roles }),
  }));
  await page.route('http://127.0.0.1:8080/api/capabilities/**', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ requestId: 'role-test', providerId: 'role-test-provider', result: { ok: true, records: [] } }),
  }));
}

test('desktop CRM surface exposes the complete current business information architecture without placeholders', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop navigation acceptance');
  await installAuthenticatedRole(page, ['substrate-user', 'substrate-admin'], 'platform.admin');

  await page.goto('/');
  await expect(page.locator('.topbar h1')).toHaveText('销售工作台');
  const sidebar = page.locator('aside.sidebar');

  for (const label of ['业务数据中心', '客户公司', '联系人', '商机', '任务', '笔记', '邮件', '日历', '文件', '常用视图', '业务管理', '销售分析', '数据导入与导出', '成员与权限', '业务自动化', '系统设置']) {
    await expect(sidebar.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  for (const label of futureBrickLabels) await expect(sidebar.getByText(label, { exact: true })).toHaveCount(0);

  await expect(page.locator('.profile-row small')).toHaveText('超级管理员 · 已登录');
  await sidebar.getByRole('button', { name: '系统设置', exact: true }).click();
  await expect(page.locator('.topbar h1')).toHaveText('系统设置');
  const settings = page.locator('[data-surface="real-settings-builder-handoff"]');
  await expect(settings).toBeVisible();
  await expect(settings.getByRole('heading', { name: '系统设置', level: 2 })).toBeVisible();
  await expect(settings.getByText('客户字段与分类', { exact: true })).toBeVisible();
  await expect(settings.getByText('部分高级设置当前尚未开放。可用入口会自动显示，不影响已经可以使用的业务功能。', { exact: true })).toBeVisible();
  await expect(page.locator('[data-surface="pending-real-wiring"]')).toHaveCount(0);

  for (const forbiddenText of ['Twenty', 'Provider', 'Adapter', 'Prototype', 'Builder', 'Runtime', 'Metadata Runtime', '浏览器未直连', 'crm.v1.']) {
    await expect(page.getByText(forbiddenText, { exact: false })).toHaveCount(0);
  }

  await page.screenshot({ path: testInfo.outputPath('desktop-crm-surface.png'), fullPage: true });
});

test('standard user identity keeps daily CRM and hides manager/admin surfaces', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop role-gate acceptance');
  await installAuthenticatedRole(page, ['substrate-user'], 'sales.employee');

  await page.goto('/');
  const sidebar = page.locator('aside.sidebar');
  for (const label of ['工作台', '业务数据中心', '客户公司', '联系人', '商机', '任务', '笔记', '邮件', '日历', '文件', '常用视图']) {
    await expect(sidebar.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  for (const label of ['业务管理', '销售分析', '数据导入与导出', '成员与权限', '业务自动化', '系统设置']) {
    await expect(sidebar.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  }
  await expect(page.locator('.profile-row small')).toHaveText('用户 · 已登录');
  await page.keyboard.press('Control+K');
  await expect(page.locator('#global-search')).toBeFocused();
});

test('substrate-manager gets business management and analysis but no bulk data governance or admin surfaces', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop role-gate acceptance');
  await installAuthenticatedRole(page, ['substrate-user', 'substrate-manager'], 'sales.manager');

  await page.goto('/');
  const sidebar = page.locator('aside.sidebar');
  await expect(sidebar.getByRole('button', { name: '业务管理', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: '销售分析', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: '数据导入与导出', exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: '成员与权限', exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: '业务自动化', exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: '系统设置', exact: true })).toHaveCount(0);
  await expect(page.locator('.profile-row small')).toHaveText('经理 · 已登录');

  await sidebar.getByRole('button', { name: '业务管理', exact: true }).click();
  await expect(page.locator('.topbar h1')).toHaveText('业务管理');
  const businessConfig = page.locator('[data-surface="real-manager-business-config"]');
  await expect(businessConfig).toBeVisible();
  for (const label of ['销售分析', '常用视图']) await expect(businessConfig.getByText(label, { exact: true })).toBeVisible();
  await expect(businessConfig.getByText('批量维护数据', { exact: true })).toHaveCount(0);
  await expect(businessConfig.getByText('客户字段与分类', { exact: true })).toHaveCount(0);
  await expect(businessConfig.getByText('外部应用连接', { exact: true })).toHaveCount(0);
  await expect(businessConfig.getByText('角色与数据权限', { exact: true })).toHaveCount(0);

  await businessConfig.locator('.crm-view-row').filter({ hasText: '销售分析' }).getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.locator('.topbar h1')).toHaveText('销售分析');
});

test('anonymous URL query cannot elevate UI role', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop role-escalation acceptance');

  await page.goto('/?role=super-admin');
  const sidebar = page.locator('aside.sidebar');
  for (const label of ['业务管理', '销售分析', '数据导入与导出', '成员与权限', '业务自动化', '系统设置']) {
    await expect(sidebar.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  }
  await expect(page.locator('.profile-row small')).toHaveText('用户 · 未登录');
});

test('mobile surface remains usable without horizontal overflow and keeps CRM search reachable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile responsive acceptance');
  await installAuthenticatedRole(page, ['substrate-user'], 'mobile.employee');

  await page.goto('/');
  await expect(page.locator('.topbar h1')).toHaveText('销售工作台');
  await expect(page.locator('#global-search')).toBeVisible();
  await page.locator('#global-search').focus();
  await expect(page.locator('#global-search')).toBeFocused();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  const sidebar = page.locator('aside.sidebar');
  await expect(sidebar).toBeVisible();
  await sidebar.getByRole('button', { name: '客户公司', exact: true }).click();
  await expect(page.locator('.topbar h1')).toHaveText('客户公司');
  await page.screenshot({ path: testInfo.outputPath('mobile-crm-surface.png'), fullPage: true });
});

test('legacy substrate console is reachable but hides administration while anonymous', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop substrate access acceptance');
  await page.goto('/substrate.html');
  await expect(page.getByRole('heading', { name: 'GBAP Minimum Runnable Substrate' })).toBeVisible();
  await expect(page.getByText('请使用超级管理员账号登录后进入平台管理控制台。', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '注册 Reference Provider' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '读取最近审计' })).toHaveCount(0);

  const legacyScript = await page.request.get('http://127.0.0.1:8080/app.js');
  expect(legacyScript.ok()).toBe(true);
  const legacySource = await legacyScript.text();
  expect(legacySource).toContain('const GATEWAY_ORIGIN = window.location.origin;');
  expect(legacySource).toContain('const REDIRECT_URI = `${GATEWAY_ORIGIN}/substrate.html`;');
  expect(legacySource).toContain("history.replaceState({}, document.title, '/substrate.html');");
});

test('substrate-manager cannot obtain legacy substrate controls by direct URL', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop substrate manager boundary acceptance');
  await installAuthenticatedRole(page, ['substrate-user', 'substrate-manager'], 'sales.manager');
  await page.goto('/substrate.html');
  await expect(page.getByText('当前账号没有平台管理权限。请返回 GBAP CRM 使用已授权的业务功能。', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '注册 Reference Provider' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '卸载 Provider' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '读取最近审计' })).toHaveCount(0);
});

test('substrate-admin can reach legacy substrate controls', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop substrate admin acceptance');
  await installAuthenticatedRole(page, ['substrate-user', 'substrate-admin'], 'platform.admin');
  await page.route('http://127.0.0.1:8080/api/providers', (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers: [] }) }));
  await page.goto('/substrate.html');
  await expect(page.getByText('超级管理员权限已验证。以下为平台底座管理控制台。', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '注册 Reference Provider' })).toBeVisible();
  await expect(page.getByRole('button', { name: '读取最近审计' })).toBeVisible();
});
