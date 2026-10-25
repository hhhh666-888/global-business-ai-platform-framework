import { expect, test } from '@playwright/test';

async function installIdentity(page: any, roles: string[], username: string) {
  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'account-ui-access-token', id_token: 'account-ui-id-token' }));
  });
  await page.route('http://127.0.0.1:8080/api/me', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ subject: `account-ui-${username}`, username, roles }),
  }));
  await page.route('http://127.0.0.1:8080/api/capabilities/**', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ requestId: 'account-ui', providerId: 'account-ui-provider', result: { ok: true, records: [] } }),
  }));
}

test('clicking the authenticated profile opens Account and never logs out implicitly', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop account acceptance');
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await installIdentity(page, ['substrate-user', 'substrate-admin'], 'platform.admin');

  await page.goto('/');
  const profile = page.locator('.profile-row');
  await expect(profile).toHaveAttribute('title', '我的账户');
  await profile.click();

  await expect(page.locator('.topbar h1')).toHaveText('我的账户');
  const account = page.locator('[data-surface="real-account-settings"]');
  await expect(account).toBeVisible();
  const identityRow = account.locator('.crm-view-row').first();
  await expect(identityRow.getByText('platform.admin', { exact: true })).toBeVisible();
  await expect(identityRow.getByText('超级管理员', { exact: true })).toBeVisible();
  await expect(account.getByRole('button', { name: '退出登录', exact: true })).toBeVisible();
  expect(requests.some((url) => url.includes('/protocol/openid-connect/logout'))).toBe(false);

  const securityRow = account.locator('.crm-view-row').filter({ hasText: '账户与安全' });
  await expect(securityRow.getByRole('link', { name: '打开', exact: true })).toHaveAttribute('href', 'http://127.0.0.1:8080/realms/gbap/account/');

  const adminRow = account.locator('.crm-view-row').filter({ hasText: '超级管理员设置' });
  await adminRow.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.locator('.topbar h1')).toHaveText('系统设置');
  await page.getByRole('button', { name: '系统管理', exact: true }).click();
  const settings = page.locator('[data-surface="real-settings-builder-handoff"]');
  await expect(settings).toBeVisible();
  await expect(settings.getByText('账户与系统', { exact: true })).toBeVisible();
  await expect(settings.locator('.crm-view-row').filter({ hasText: '我的账户与安全' }).getByRole('link', { name: '打开', exact: true })).toHaveAttribute('href', 'http://127.0.0.1:8080/realms/gbap/account/');
  await expect(settings.locator('.crm-view-row').filter({ hasText: '系统服务管理' }).getByRole('link', { name: '打开', exact: true })).toHaveAttribute('href', 'http://127.0.0.1:8080/substrate.html');
  for (const label of ['客户字段与分类', '记录页面布局', '角色与数据权限']) await expect(settings.getByText(label, { exact: true })).toBeVisible();
  for (const retired of ['企业邮箱与日历', 'Google Workspace', 'Microsoft 365', '外部应用连接']) await expect(settings.getByText(retired, { exact: true })).toHaveCount(0);
  await expect(settings.getByText('准备中', { exact: true })).toHaveCount(3);
  await expect(settings.getByText('部分高级设置当前尚未开放。可用入口会自动显示，不影响已经可以使用的业务功能。', { exact: true })).toBeVisible();
  await expect(settings.getByText(/Client ID|Client Secret/)).toHaveCount(0);
});

test('standard user profile opens self-service Account without admin controls', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop account role acceptance');
  await installIdentity(page, ['substrate-user'], 'sales.employee');

  await page.goto('/');
  await page.locator('.profile-row').click();
  await expect(page.locator('.topbar h1')).toHaveText('我的账户');
  const account = page.locator('[data-surface="real-account-settings"]');
  await expect(account.getByText('sales.employee', { exact: true })).toBeVisible();
  await expect(account.getByText('用户', { exact: true })).toBeVisible();
  await expect(account.getByText('超级管理员设置', { exact: true })).toHaveCount(0);
  await expect(account.getByRole('button', { name: '退出登录', exact: true })).toBeVisible();
});

test('retired mail integration is absent while the internal CRM calendar remains usable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop CRM calendar boundary acceptance');
  await installIdentity(page, ['substrate-user', 'substrate-admin'], 'platform.admin');
  await page.route('http://127.0.0.1:8080/api/calendar-events', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ events: [{
      id: 'calendar-event-1',
      title: '内部客户跟进',
      description: '仅保存在 GBAP 内部日历',
      location: '办公室',
      startsAt: '2026-09-28T15:00:00.000Z',
      endsAt: '2026-09-28T16:00:00.000Z',
      fullDay: false,
      timeZone: 'Asia/Shanghai',
      createdAt: '2026-09-28T00:00:00.000Z',
      updatedAt: '2026-09-28T00:00:00.000Z',
    }] }),
  }));

  await page.goto('/');
  const sidebar = page.locator('aside.sidebar');
  await expect(sidebar.getByRole('button', { name: '邮件', exact: true })).toHaveCount(0);
  await sidebar.getByRole('button', { name: '日历', exact: true }).click();
  const calendar = page.locator('[data-surface="real-calendar-wiring"]');
  await expect(calendar).toBeVisible();
  await expect(calendar.getByText('内部客户跟进', { exact: true })).toBeVisible();
  await calendar.getByRole('button', { name: '新建日程', exact: true }).first().click();
  await expect(page.getByText('保存在 GBAP 个人日历中，不连接邮箱，也不向外部日历同步。', { exact: true })).toBeVisible();
});

test('primary navigation uses business language instead of implementation language', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop product-language acceptance');
  await installIdentity(page, ['substrate-user'], 'sales.employee');
  await page.goto('/');

  const sidebar = page.locator('aside.sidebar');
  await expect(sidebar.getByRole('button', { name: '业务数据中心', exact: true })).toBeVisible();
  await expect(sidebar.getByText('客户与销售', { exact: true })).toBeVisible();
  await expect(sidebar.getByText('完整 CRM', { exact: true })).toHaveCount(0);
  await expect(page.getByText('CRM 管理与分析', { exact: true })).toHaveCount(0);
});
