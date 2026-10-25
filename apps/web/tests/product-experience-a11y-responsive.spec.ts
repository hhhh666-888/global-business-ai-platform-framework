import { expect, test } from '@playwright/test';

async function installUser(page: any, username = 'sales.employee') {
  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'experience-access-token', id_token: 'experience-id-token' }));
  });
  await page.route('http://127.0.0.1:8080/api/me', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ subject: `experience-${username}`, username, roles: ['substrate-user'] }),
  }));
  await page.route('http://127.0.0.1:8080/api/capabilities/**', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ requestId: 'experience', providerId: 'experience-provider', result: { ok: true, records: [] } }),
  }));
}

test('desktop primary navigation is keyboard operable and exposes current-page semantics', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop accessibility acceptance');
  await installUser(page);
  await page.goto('/');

  const quickSearch = page.getByRole('button', { name: '打开全局搜索', exact: true });
  await page.keyboard.press('Tab');
  await expect(quickSearch).toBeFocused();
  const focusedShadow = await quickSearch.evaluate((element) => getComputedStyle(element).boxShadow);
  expect(focusedShadow).not.toBe('none');

  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: '全局搜索', exact: true })).toBeFocused();

  const companies = page.locator('aside.sidebar').getByRole('button', { name: '客户公司', exact: true });
  await companies.click();
  await expect(companies).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.topbar h1')).toHaveText('客户公司');
  await expect(page.locator('aside.sidebar')).toHaveAttribute('aria-label', '主导航');
});

test('mobile uses a compact navigation rail and preserves usable workspace width', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile responsive acceptance');
  await installUser(page, 'mobile.employee');
  await page.goto('/');

  const sidebar = page.locator('aside.sidebar');
  const workspace = page.locator('main.workspace');
  const sidebarBox = await sidebar.boundingBox();
  const workspaceBox = await workspace.boundingBox();
  expect(sidebarBox?.width ?? 999).toBeLessThanOrEqual(66);
  expect(workspaceBox?.width ?? 0).toBeGreaterThanOrEqual(300);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  await expect(page.getByRole('textbox', { name: '全局搜索', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: '客户公司', exact: true })).toBeVisible();
  await sidebar.getByRole('button', { name: '客户公司', exact: true }).click();
  await expect(page.locator('.topbar h1')).toHaveText('客户公司');
  await expect(page.getByRole('textbox', { name: '全局搜索', exact: true })).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath('mobile-compact-navigation.png'), fullPage: true });
});
