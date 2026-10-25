import { expect, test } from '@playwright/test';

test('Companies list/create uses only GBAP canonical CRM capabilities', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop wiring acceptance');

  const observedRequests: string[] = [];
  const createdNames: string[] = [];
  let createPayload: Record<string, unknown> | null = null;
  let accountListCalls = 0;
  let profileCalls = 0;

  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'test-access-token', id_token: 'test-id-token' }));
  });

  page.on('request', (request) => observedRequests.push(request.url()));

  await page.route('http://127.0.0.1:8080/api/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ subject: 'test-user', username: 'sales.user', roles: ['substrate-user'] }),
    });
  });

  // Company profile data is optional enrichment. A transient enrichment outage
  // must not take down the canonical company list or turn a successful mutation
  // into a contradictory red error banner.
  await page.route('http://127.0.0.1:8080/api/crm-native/company-profiles', async (route) => {
    profileCalls += 1;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'temporary_profile_fault' }) });
  });

  for (const capability of ['crm.v1.contact.list', 'crm.v1.opportunity.list']) {
    await page.route(`http://127.0.0.1:8080/api/capabilities/${capability}/invoke`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ requestId: capability, providerId: 'internal-test-provider', result: { ok: true, records: [] } }),
      });
    });
  }

  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.account.list/invoke', async (route) => {
    accountListCalls += 1;
    const records = [
      {
        businessId: 'acc-gbap-001',
        businessType: 'Account',
        externalId: 'twenty-company-001',
        externalType: 'company',
        displayName: 'Andes Plastics Group',
        website: 'https://andes.example',
      },
      ...createdNames.map((displayName, index) => ({
        businessId: `acc-gbap-created-${index + 1}`,
        businessType: 'Account',
        externalId: `twenty-company-created-${index + 1}`,
        externalType: 'company',
        displayName,
        website: null,
      })),
    ];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        requestId: 'req-account-list',
        providerId: 'twenty-crm-production',
        result: { ok: true, provider: 'twenty', capability: 'crm.v1.account.list', records },
      }),
    });
  });

  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.account.create/invoke', async (route) => {
    const requestBody = route.request().postDataJSON() as { payload?: Record<string, unknown> };
    createPayload = requestBody.payload ?? null;
    const displayName = String(createPayload?.displayName ?? '');
    createdNames.push(displayName);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        requestId: 'req-account-create',
        providerId: 'twenty-crm-production',
        result: {
          ok: true,
          provider: 'twenty',
          capability: 'crm.v1.account.create',
          record: {
            businessId: createPayload?.businessId,
            businessType: 'Account',
            externalId: 'twenty-company-created-1',
            externalType: 'company',
            displayName,
            website: null,
          },
        },
      }),
    });
  });

  await page.route('http://127.0.0.1:8080/api/capabilities/crm.ops.v1.account.update/invoke', async (route) => {
    const requestBody = route.request().postDataJSON() as { payload?: Record<string, unknown> };
    const payload = requestBody.payload ?? {};
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        requestId: 'req-account-update',
        providerId: 'twenty-crm-production',
        result: {
          ok: true,
          record: {
            businessId: payload.businessId,
            businessType: 'Account',
            externalId: 'twenty-company-created-1',
            externalType: 'company',
            displayName: payload.displayName,
            website: payload.website ?? null,
            ...payload,
          },
        },
      }),
    });
  });

  await page.goto('/');
  const sidebar = page.locator('aside.sidebar');
  await expect(page.locator('.profile-row small')).toHaveText('用户 · 已登录');
  for (const adminLabel of ['销售分析', '数据导入与导出', '业务自动化', '系统设置']) {
    await expect(sidebar.getByRole('button', { name: adminLabel, exact: true })).toHaveCount(0);
  }

  await sidebar.getByRole('button', { name: '客户公司', exact: true }).click();

  await expect(page.locator('[data-surface="real-account-wiring"]')).toBeVisible();
  await expect(page.locator('[data-surface="real-account-wiring"] .object-toolbar p')).toHaveText('1 家公司 · 公司资料、联系人和商机统一管理');
  await expect(page.getByRole('heading', { name: 'Andes Plastics Group', exact: true })).toBeVisible();
  await expect(page.locator('[data-surface="real-account-wiring"] .real-error')).toHaveCount(0);
  expect(profileCalls).toBe(3);

  for (const engineeringText of ['GBAP API 已认证', '浏览器未直连 Twenty', 'crm.v1.account', 'Provider', 'acc-gbap-001']) {
    await expect(page.getByText(engineeringText, { exact: false })).toHaveCount(0);
  }

  const listCallsBeforeCreate = accountListCalls;
  await page.locator('.object-toolbar button').filter({ hasText: '新建客户公司' }).click();
  await page.getByLabel('公司名称').fill('Quito Industrial Energy');
  await page.getByRole('button', { name: '创建并保存' }).click();

  await expect.poll(() => createPayload).not.toBeNull();
  expect(createPayload?.displayName).toBe('Quito Industrial Energy');
  expect(String(createPayload?.businessId ?? '')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  await expect(page.getByRole('heading', { name: 'Quito Industrial Energy', exact: true })).toBeVisible();
  await expect(page.locator('[data-surface="real-account-wiring"] .object-toolbar p')).toHaveText('2 家公司 · 公司资料、联系人和商机统一管理');
  await expect(page.getByText('客户公司已创建，完整资料已保存。', { exact: true })).toBeVisible();
  await expect(page.locator('[data-surface="real-account-wiring"] .real-error')).toHaveCount(0);
  await expect(page.getByText('acc-gbap-created-1', { exact: true })).toHaveCount(0);
  expect(accountListCalls).toBe(listCallsBeforeCreate);

  const vendorDirectCalls = observedRequests.filter((url) =>
    url.includes(':3000') || url.includes('/rest/companies') || url.includes('twenty-server') || url.includes('twenty-crm-production/invoke'),
  );
  expect(vendorDirectCalls).toEqual([]);
  expect(observedRequests.some((url) => url.includes('/api/capabilities/crm.v1.account.list/invoke'))).toBe(true);
  expect(observedRequests.some((url) => url.includes('/api/capabilities/crm.v1.account.create/invoke'))).toBe(true);

  await page.screenshot({ path: testInfo.outputPath('companies-real-wiring.png'), fullPage: true });
});
