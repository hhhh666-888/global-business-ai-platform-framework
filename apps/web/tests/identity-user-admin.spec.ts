import { expect, test } from '@playwright/test';

const initialUsers = [
  { id: 'admin-id', username: 'platform.admin', email: 'admin@gbap.test', firstName: '明', lastName: '管', enabled: true, emailVerified: true, roles: ['substrate-user', 'substrate-admin'], roleTier: 'super-admin' },
  { id: 'employee-id', username: 'sales.one', email: 'sales.one@gbap.test', firstName: '一', lastName: '销', enabled: true, emailVerified: false, roles: ['substrate-user'], roleTier: 'employee' },
];

async function installIdentity(page: any, roles: string[], subject = 'admin-id', username = 'platform.admin') {
  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'identity-admin-access-token', id_token: 'identity-admin-id-token' }));
  });
  await page.route('http://127.0.0.1:8080/api/me', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ subject, username, roles }),
  }));
  await page.route('http://127.0.0.1:8080/api/capabilities/**', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ requestId: 'identity-test', providerId: 'provider', result: { ok: true, records: [] } }),
  }));
}

function nextRoles(user: any, body: any) {
  if (!body.roleTier) return user.roles;
  if (body.roleTier === 'super-admin') return ['substrate-user', 'substrate-admin'];
  if (body.roleTier === 'manager') return ['substrate-user', 'substrate-manager'];
  return ['substrate-user'];
}

async function installUserAdminApi(page: any, requests: Array<{ method: string; url: string; body: any }>) {
  let users = structuredClone(initialUsers);
  await page.route('http://127.0.0.1:8080/api/identity/users**', async (route: any) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const body = request.postDataJSON?.() ?? null;
    requests.push({ method, url: url.pathname, body });

    if (method === 'GET' && url.pathname === '/api/identity/users') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users }) });
    }
    if (method === 'POST' && url.pathname === '/api/identity/users') {
      const generated = !body.password;
      const next = { id: `new-${users.length}`, username: body.username, email: body.email, firstName: body.firstName, lastName: body.lastName, enabled: true, emailVerified: false, roles: ['substrate-user'], roleTier: body.roleTier };
      users.push(next);
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          user: next,
          ...(generated ? { generatedPassword: 'GeneratedTemporary!234' } : {}),
          passwordGenerated: generated,
          requirePasswordChange: generated ? true : Boolean(body.requirePasswordChange),
        }),
      });
    }
    if (method === 'PATCH' && url.pathname.startsWith('/api/identity/users/')) {
      const id = url.pathname.split('/').pop();
      users = users.map((user) => user.id === id ? { ...user, ...body, roles: nextRoles(user, body) } : user);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: users.find((user) => user.id === id) }) });
    }
    if (method === 'POST' && url.pathname.endsWith('/reset-password')) {
      const id = url.pathname.split('/').at(-2);
      const generated = !body.password;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: users.find((user) => user.id === id),
          ...(generated ? { generatedPassword: 'ResetTemporary!567' } : {}),
          passwordGenerated: generated,
          requirePasswordChange: generated ? true : Boolean(body.requirePasswordChange),
        }),
      });
    }
    if (method === 'DELETE' && url.pathname.startsWith('/api/identity/users/')) {
      const id = url.pathname.split('/').pop();
      users = users.filter((user) => user.id !== id);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ removed: id }) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) });
  });
}

test('super-admin can manage enterprise users from the compact administration table', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop identity administration acceptance');
  await installIdentity(page, ['substrate-user', 'substrate-admin']);

  const requests: Array<{ method: string; url: string; body: any }> = [];
  await installUserAdminApi(page, requests);

  await page.goto('/');
  await page.locator('aside.sidebar').getByRole('button', { name: '成员与权限', exact: true }).click();
  const surface = page.locator('[data-surface="identity-user-administration"]');
  await expect(surface).toBeVisible();
  await expect(surface.getByText('全部账户', { exact: true })).toBeVisible();
  await expect(surface.locator('[data-user="platform.admin"]')).toContainText('platform.admin');
  await expect(surface.locator('[data-user="sales.one"]')).toContainText('用户');

  await page.getByRole('button', { name: '新增用户', exact: true }).click();
  const createForm = page.getByTestId('identity-create-form');
  await expect(createForm).toBeVisible();
  await createForm.getByLabel('登录账号（用户名）', { exact: true }).fill('sales.two');
  await createForm.getByLabel('登录密码', { exact: true }).fill('FixedPassword!23');
  await createForm.getByLabel('显示姓', { exact: true }).fill('销');
  await createForm.getByLabel('显示名', { exact: true }).fill('二');
  await createForm.getByLabel('企业邮箱', { exact: true }).fill('sales.two@gbap.test');
  await createForm.getByRole('combobox', { name: '角色', exact: true }).selectOption('employee');
  await createForm.getByRole('button', { name: '创建用户', exact: true }).click();
  await expect(surface.getByTestId('temporary-credential')).toContainText('可直接使用当前密码登录');
  await expect(surface.locator('[data-user="sales.two"]')).toBeVisible();
  const createRequest = requests.find((item) => item.method === 'POST' && item.url === '/api/identity/users');
  expect(createRequest?.body.password).toBe('FixedPassword!23');
  expect(createRequest?.body.requirePasswordChange).toBe(false);

  await surface.getByLabel('搜索用户', { exact: true }).fill('sales.one');
  await expect(surface.locator('[data-user="sales.one"]')).toBeVisible();
  await expect(surface.locator('[data-user="sales.two"]')).toHaveCount(0);
  await surface.getByLabel('搜索用户', { exact: true }).fill('');
  await surface.getByLabel('角色筛选', { exact: true }).selectOption('super-admin');
  await expect(surface.locator('[data-user="platform.admin"]')).toBeVisible();
  await expect(surface.locator('[data-user="sales.one"]')).toHaveCount(0);
  await surface.getByLabel('角色筛选', { exact: true }).selectOption('all');

  const userRow = surface.locator('[data-user="sales.one"]');
  await userRow.getByRole('button', { name: '编辑', exact: true }).click();
  const editForm = page.getByTestId('identity-edit-form');
  await editForm.getByRole('combobox', { name: '角色', exact: true }).selectOption('manager');
  await editForm.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(surface.locator('[data-user="sales.one"]')).toContainText('经理');

  await surface.locator('[data-user="sales.one"]').getByRole('button', { name: '重置密码', exact: true }).click();
  const passwordForm = page.getByTestId('identity-password-form');
  await passwordForm.getByLabel('新登录密码', { exact: true }).fill('AnotherFixed!45');
  await passwordForm.getByRole('button', { name: '保存密码', exact: true }).click();
  await expect(surface.getByTestId('temporary-credential')).toContainText('可直接使用当前密码登录');
  const resetRequest = requests.find((item) => item.method === 'POST' && item.url === '/api/identity/users/employee-id/reset-password');
  expect(resetRequest?.body.password).toBe('AnotherFixed!45');
  expect(resetRequest?.body.requirePasswordChange).toBe(false);

  const refreshedRow = surface.locator('[data-user="sales.one"]');
  await refreshedRow.getByRole('button', { name: '更多', exact: true }).click();
  await page.getByRole('button', { name: '停用账户', exact: true }).click();
  await expect(surface.locator('[data-user="sales.one"]')).toContainText('已停用');

  await surface.getByLabel('状态筛选', { exact: true }).selectOption('disabled');
  await expect(surface.locator('[data-user="sales.one"]')).toBeVisible();
  await expect(surface.locator('[data-user="platform.admin"]')).toHaveCount(0);
  await surface.getByLabel('状态筛选', { exact: true }).selectOption('all');

  page.once('dialog', (dialog) => void dialog.accept());
  await surface.locator('[data-user="sales.one"]').getByRole('button', { name: '更多', exact: true }).click();
  await page.getByRole('button', { name: '删除账户', exact: true }).click();
  await expect(surface.locator('[data-user="sales.one"]')).toHaveCount(0);
});

test('system-generated password mode preserves backend temporary-password semantics', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop generated-password acceptance');
  await installIdentity(page, ['substrate-user', 'substrate-admin']);
  const requests: Array<{ method: string; url: string; body: any }> = [];
  await installUserAdminApi(page, requests);

  await page.goto('/');
  await page.locator('aside.sidebar').getByRole('button', { name: '成员与权限', exact: true }).click();
  const surface = page.locator('[data-surface="identity-user-administration"]');
  await page.getByRole('button', { name: '新增用户', exact: true }).click();
  const createForm = page.getByTestId('identity-create-form');
  await createForm.getByLabel('登录账号（用户名）', { exact: true }).fill('sales.generated');
  await createForm.getByRole('radio', { name: /系统生成临时密码/ }).check();
  await createForm.getByRole('button', { name: '创建用户', exact: true }).click();

  const createRequest = requests.find((item) => item.method === 'POST' && item.url === '/api/identity/users');
  expect(createRequest?.body.password).toBeUndefined();
  expect(createRequest?.body.requirePasswordChange).toBeUndefined();
  const notice = surface.getByTestId('temporary-credential');
  await expect(notice).toContainText('临时登录密码已生成');
  await expect(notice).toContainText('首次登录后必须修改密码');
  await expect(notice).toContainText('GeneratedTemporary!234');
  await expect(notice.getByRole('button', { name: '复制密码', exact: true })).toBeVisible();
});

test('standard user cannot see or navigate to user administration', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop identity role boundary acceptance');
  await installIdentity(page, ['substrate-user'], 'employee-id', 'sales.one');
  await page.goto('/');
  await expect(page.locator('aside.sidebar').getByRole('button', { name: '成员与权限', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-surface="identity-user-administration"]')).toHaveCount(0);
});
