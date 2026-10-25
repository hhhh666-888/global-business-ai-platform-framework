import { expect, test } from '@playwright/test';

test('expired access token is refreshed once and the authenticated session continues', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop browser session acceptance');

  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({
      access_token: 'expired-access-token',
      id_token: 'identity-id-token',
      refresh_token: 'refresh-token-1',
      expires_in: 300,
      expires_at: Date.now() - 1000,
      session_started_at: Date.now() - 60_000,
    }));
  });

  let refreshCalls = 0;
  await page.route('http://127.0.0.1:8080/realms/gbap/protocol/openid-connect/token', async (route) => {
    const request = route.request();
    expect(request.method()).toBe('POST');
    expect(request.postData() ?? '').toContain('grant_type=refresh_token');
    expect(request.postData() ?? '').toContain('refresh_token=refresh-token-1');
    refreshCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'refreshed-access-token',
        id_token: 'identity-id-token-2',
        refresh_token: 'refresh-token-2',
        expires_in: 300,
      }),
    });
  });

  await page.route('http://127.0.0.1:8080/api/me', async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer refreshed-access-token');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ subject: 'employee-id', username: 'sales.one', roles: ['substrate-user'] }),
    });
  });
  await page.route('http://127.0.0.1:8080/api/capabilities/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ requestId: 'session-refresh-test', providerId: 'provider', result: { ok: true, records: [] } }),
  }));

  await page.goto('/');
  await expect(page.locator('aside.sidebar')).toBeVisible();
  await expect.poll(() => refreshCalls).toBe(1);

  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('gbap.tokens') ?? '{}'));
  expect(stored.access_token).toBe('refreshed-access-token');
  expect(stored.refresh_token).toBe('refresh-token-2');
  expect(stored.session_started_at).toBeTruthy();
});

test('a 401 response refreshes and retries instead of immediately logging the user out', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop browser session acceptance');

  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({
      access_token: 'still-marked-valid-token',
      id_token: 'identity-id-token',
      refresh_token: 'refresh-token-1',
      expires_in: 300,
      expires_at: Date.now() + 240_000,
      session_started_at: Date.now() - 60_000,
    }));
  });

  let meCalls = 0;
  let refreshCalls = 0;
  await page.route('http://127.0.0.1:8080/realms/gbap/protocol/openid-connect/token', async (route) => {
    refreshCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: 'retry-access-token', refresh_token: 'refresh-token-2', expires_in: 300 }),
    });
  });
  await page.route('http://127.0.0.1:8080/api/me', async (route) => {
    meCalls += 1;
    if (meCalls === 1) {
      expect(route.request().headers().authorization).toBe('Bearer still-marked-valid-token');
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'token_expired' }) });
    }
    expect(route.request().headers().authorization).toBe('Bearer retry-access-token');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ subject: 'employee-id', username: 'sales.one', roles: ['substrate-user'] }) });
  });
  await page.route('http://127.0.0.1:8080/api/capabilities/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ requestId: 'session-retry-test', providerId: 'provider', result: { ok: true, records: [] } }),
  }));

  await page.goto('/');
  await expect(page.locator('aside.sidebar')).toBeVisible();
  expect(meCalls).toBe(2);
  expect(refreshCalls).toBe(1);
  const hasSession = await page.evaluate(() => Boolean(JSON.parse(sessionStorage.getItem('gbap.tokens') ?? '{}').access_token));
  expect(hasSession).toBe(true);
});

test('create-user POST survives an expired bearer token and is retried after refresh', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop identity administration session acceptance');

  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({
      access_token: 'admin-access-token',
      id_token: 'admin-id-token',
      refresh_token: 'admin-refresh-token',
      expires_in: 300,
      expires_at: Date.now() + 240_000,
      session_started_at: Date.now() - 60_000,
    }));
  });

  await page.route('http://127.0.0.1:8080/api/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ subject: 'admin-id', username: 'platform.admin', roles: ['substrate-user', 'substrate-admin'] }),
  }));
  await page.route('http://127.0.0.1:8080/api/capabilities/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ requestId: 'identity-session-test', providerId: 'provider', result: { ok: true, records: [] } }),
  }));

  let createCalls = 0;
  let refreshCalls = 0;
  const users = [{ id: 'admin-id', username: 'platform.admin', email: 'admin@gbap.test', firstName: '明', lastName: '管', enabled: true, emailVerified: true, roles: ['substrate-user', 'substrate-admin'], roleTier: 'super-admin' }];
  await page.route('http://127.0.0.1:8080/api/identity/users**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname === '/api/identity/users') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users }) });
    }
    if (request.method() === 'POST' && url.pathname === '/api/identity/users') {
      createCalls += 1;
      if (createCalls === 1) {
        expect(request.headers().authorization).toBe('Bearer admin-access-token');
        return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'token_expired' }) });
      }
      expect(request.headers().authorization).toBe('Bearer refreshed-admin-token');
      const body = request.postDataJSON();
      const created = { id: 'created-id', username: body.username, email: body.email, firstName: body.firstName, lastName: body.lastName, enabled: true, emailVerified: false, roles: ['substrate-user'], roleTier: body.roleTier };
      users.push(created);
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ user: created, passwordGenerated: false, requirePasswordChange: false }) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) });
  });
  await page.route('http://127.0.0.1:8080/realms/gbap/protocol/openid-connect/token', async (route) => {
    refreshCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'refreshed-admin-token', refresh_token: 'admin-refresh-token-2', expires_in: 300 }) });
  });

  await page.goto('/');
  await page.locator('aside.sidebar').getByRole('button', { name: '成员与权限', exact: true }).click();
  const surface = page.locator('[data-surface="identity-user-administration"]');
  // Primary page actions are rendered in the shared header toolbar.
  await page.getByRole('button', { name: '新增用户', exact: true }).click();
  const form = page.getByTestId('identity-create-form');
  await form.getByLabel('登录账号（用户名）', { exact: true }).fill('sales.refresh');
  await form.getByLabel('登录密码', { exact: true }).fill('RefreshSafe!123');
  await form.getByLabel('企业邮箱', { exact: true }).fill('sales.refresh@gbap.test');
  await form.getByRole('button', { name: '创建用户', exact: true }).click();

  await expect(surface.locator('[data-user="sales.refresh"]')).toBeVisible();
  expect(createCalls).toBe(2);
  expect(refreshCalls).toBe(1);
});
