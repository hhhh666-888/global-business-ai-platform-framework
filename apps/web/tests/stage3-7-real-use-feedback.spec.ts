import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../../..');

async function installSession(page: any) {
  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'stage3-7-test-token', id_token: 'stage3-7-test-id' }));
  });
  await page.route('http://127.0.0.1:8080/api/me', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ subject: 'admin-id', username: 'platform.admin', roles: ['substrate-user', 'substrate-admin'] }),
  }));
}

async function installIdentityMocks(page: any) {
  const requests: any[] = [];
  let users = [{
    id: 'admin-id',
    username: 'platform.admin',
    email: 'admin@gbap.test',
    firstName: '明',
    lastName: '管',
    enabled: true,
    emailVerified: true,
    roles: ['substrate-user', 'substrate-admin'],
    roleTier: 'super-admin',
  }];

  await page.route('http://127.0.0.1:8080/api/identity/users**', async (route: any) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method === 'GET' && url.pathname === '/api/identity/users') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users }) });
    }
    if (method === 'POST' && url.pathname === '/api/identity/users') {
      const body = request.postDataJSON();
      requests.push(body);
      const user = {
        id: 'chinese-user-id',
        username: body.username,
        email: body.email ?? '',
        firstName: body.firstName ?? '',
        lastName: body.lastName ?? '',
        enabled: true,
        emailVerified: false,
        roles: ['substrate-user'],
        roleTier: body.roleTier,
      };
      users = [...users, user];
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ user, passwordGenerated: false, requirePasswordChange: false }),
      });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) });
  });
  return { requests };
}

async function installDataSurfaceMocks(page: any) {
  await page.route('http://127.0.0.1:8080/api/crm-native/files', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ files: [], maxFileBytes: 8 * 1024 * 1024 }),
  }));
  await page.route('http://127.0.0.1:8080/api/crm-native/company-import/jobs**', async (route: any) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname === '/api/crm-native/company-import/jobs') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jobs: [], total: 0, limit: 10, offset: 0 }),
      });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) });
  });
}

test('Stage 3.7 login branding source is bilingual and safe for persisted realms', async () => {
  const start = readFileSync(resolve(repoRoot, 'infrastructure/local-uat/Start-GBAP-UAT.ps1'), 'utf8');
  const compose = readFileSync(resolve(repoRoot, 'infrastructure/local-uat/docker-compose.yml'), 'utf8');
  const css = readFileSync(resolve(repoRoot, 'infrastructure/keycloak/themes/gbap/login/resources/css/login.css'), 'utf8');
  const theme = readFileSync(resolve(repoRoot, 'infrastructure/keycloak/themes/gbap/login/theme.properties'), 'utf8');

  expect(start).toContain('佛光全球业务智能平台');
  expect(start).toContain('GBAP Global Business AI Platform');
  expect(start).toContain("$currentDisplayNameHtml = if ($realm.PSObject.Properties.Name -contains 'displayNameHtml')");
  expect(start).toContain("$currentLoginTheme = if ($realm.PSObject.Properties.Name -contains 'loginTheme')");
  expect(compose).toContain('../keycloak/themes/gbap:/opt/keycloak/themes/gbap:ro');
  expect(theme).toContain('styles=css/login.css');
  expect(css).toContain('.gbap-login-brand-cn');
  expect(css).toContain('.gbap-login-brand-en');
});

test('Stage 3.7 accepts Chinese login usernames from enterprise user administration', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop real-use feedback acceptance');
  await installSession(page);
  const identity = await installIdentityMocks(page);
  await page.goto('/');
  await page.locator('aside.sidebar').getByRole('button', { name: '成员与权限', exact: true }).click();
  const surface = page.locator('[data-surface="identity-user-administration"]');
  await expect(surface).toBeVisible();
  await page.locator('#page-action-slot').getByRole('button', { name: '新增用户', exact: true }).click();
  const form = page.getByTestId('identity-create-form');
  await expect(form.getByText(/登录账号就是员工登录时输入的账号/)).toBeVisible();
  await form.getByLabel('登录账号（用户名）', { exact: true }).fill('张三');
  await form.getByLabel('显示姓', { exact: true }).fill('张');
  await form.getByLabel('显示名', { exact: true }).fill('三');
  await form.getByLabel('企业邮箱', { exact: true }).fill('zhangsan@gbap.test');
  const testPassword = ['Stage37', String.fromCharCode(33), '234567'].join('');
  await form.getByLabel('登录密码', { exact: true }).fill(testPassword);
  await form.getByRole('button', { name: '创建用户', exact: true }).click();

  await expect(surface.locator('[data-user="张三"]')).toBeVisible();
  await expect(surface.locator('[data-user="张三"]')).toContainText('登录账号：张三');
  expect(identity.requests).toHaveLength(1);
  expect(identity.requests[0].username).toBe('张三');
});

test('Stage 3.7 keeps user action menus outside clipping and transform contexts', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop real-use feedback acceptance');
  await installSession(page);
  await installIdentityMocks(page);
  await page.goto('/');
  await page.locator('aside.sidebar').getByRole('button', { name: '成员与权限', exact: true }).click();

  const surface = page.locator('[data-surface="identity-user-administration"]');
  await expect(surface).toBeVisible();
  const surfaceStyle = await surface.evaluate((element) => {
    const style = getComputedStyle(element);
    return { overflow: style.overflow, transform: style.transform, animationName: style.animationName };
  });
  expect(surfaceStyle.overflow).toBe('visible');
  expect(surfaceStyle.transform).toBe('none');
  expect(surfaceStyle.animationName).toBe('none');

  const row = surface.locator('[data-user="platform.admin"]');
  await row.getByRole('button', { name: /更多/ }).click();
  const menu = row.locator('.identity-action-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('button', { name: '停用账户', exact: true })).toBeVisible();
  await expect(menu.getByRole('button', { name: '删除账户', exact: true })).toBeVisible();

  const geometry = await menu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const clippingAncestors: string[] = [];
    let ancestor = element.parentElement;
    while (ancestor) {
      const style = getComputedStyle(ancestor);
      const overflowValues = [style.overflow, style.overflowX, style.overflowY];
      if (overflowValues.some((value) => value === 'hidden' || value === 'clip')) {
        clippingAncestors.push(typeof ancestor.className === 'string' && ancestor.className ? ancestor.className : ancestor.tagName);
      }
      ancestor = ancestor.parentElement;
    }
    return { top: rect.top, bottom: rect.bottom, height: rect.height, clippingAncestors };
  });
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  expect(geometry.height).toBeGreaterThan(40);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(viewportHeight);
  expect(geometry.clippingAncestors).toEqual([]);
});

test('Stage 3.7 exposes one real customer-company import center and no legacy import paths', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop real-use feedback acceptance');
  await installSession(page);
  await installDataSurfaceMocks(page);
  await page.goto('/');
  const sidebar = page.locator('aside.sidebar');

  await sidebar.getByRole('button', { name: '文件', exact: true }).click();
  const filesSurface = page.locator('[data-surface="real-files-wiring"]');
  await expect(filesSurface).toBeVisible();
  await expect(filesSurface.getByText('超级管理员', { exact: false })).toHaveCount(0);
  await expect(filesSurface.getByText('具备文件管理权限的人员', { exact: false })).toHaveCount(0);

  await sidebar.getByRole('button', { name: '数据导入与导出', exact: true }).click();
  const center = page.getByTestId('company-import-center');
  await expect(center).toBeVisible();
  await expect(center.getByRole('heading', { name: '客户公司数据导入', exact: true })).toBeVisible();
  await expect(center.getByText('上传文件', { exact: true })).toBeVisible();
  await expect(center.getByText('字段映射', { exact: true })).toBeVisible();
  await expect(center.getByText('匹配规则', { exact: true })).toBeVisible();
  await expect(center.getByText('数据预检', { exact: true })).toBeVisible();
  await expect(center.getByText('确认导入', { exact: true })).toBeVisible();
  await expect(center.getByText('导入完成', { exact: true })).toBeVisible();
  await expect(center.getByRole('button', { name: /选择 CSV 文件/ })).toBeVisible();
  await expect(center.getByText('客户公司导入记录', { exact: true })).toBeVisible();

  await expect(page.getByTestId('research-intake-preview')).toHaveCount(0);
  await expect(page.getByText('TOP500 研究数据导入预检', { exact: true })).toHaveCount(0);
  await expect(page.getByText('联系人 / 商机批量导入', { exact: true })).toHaveCount(0);
});
