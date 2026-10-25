import { expect, test } from '@playwright/test';

test('People and Opportunities use real GBAP CRM boundaries without vendor-facing UI leakage', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop core CRM wiring acceptance');

  const observedRequests: string[] = [];
  const createdContacts: Array<{ personName: string; email?: string; businessId: string }> = [];
  const contactUpdates: Array<Record<string, unknown>> = [];
  const createdOpportunities: Array<Record<string, unknown>> = [];
  const opportunityUpdates: Array<Record<string, unknown>> = [];

  let baseContact = {
    businessId: 'contact-business-1', businessType: 'Contact', externalId: 'person-ext-1', externalType: 'person',
    personName: 'Carlos Mendoza', email: 'carlos@example.com', accountExternalId: 'company-ext-1', accountBusinessId: 'account-business-1',
  };
  let baseOpportunity = {
    businessId: 'opp-business-1', businessType: 'Opportunity', externalId: 'opp-ext-1', externalType: 'opportunity',
    nameSummary: '厄瓜多尔园区能源改造', lifecycleState: 'OPEN', accountExternalId: 'company-ext-1', accountBusinessId: 'account-business-1',
    estimatedValue: 880000, currencyCode: 'USD', pipelineStage: 'NEW', nextStep: null as string | null,
  };

  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'test-access-token', id_token: 'test-id-token' }));
  });
  page.on('request', (request) => observedRequests.push(request.url()));

  await page.route('**/api/crm-native/opportunity-profiles', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profiles: [] }) }));
  await page.route('**/api/crm-native/opportunity-profiles/*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profile: { businessId: 'opp-business-1', tradeStage: route.request().postDataJSON().tradeStage, profileUpdatedAt: '2026-10-03T09:00:00Z' } }) }));
  await page.route('http://127.0.0.1:8080/api/me', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ subject: 'test-user', username: 'sales.user', roles: ['substrate-user'] }) });
  });

  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.account.list/invoke', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requestId: 'accounts-list', providerId: 'internal-test-provider', result: { ok: true, records: [
      { businessId: 'account-business-1', businessType: 'Account', externalId: 'company-ext-1', externalType: 'company', displayName: 'Andes Plastics Group', website: null },
    ] } }) });
  });

  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.contact.list/invoke', async (route) => {
    const records = [
      baseContact,
      ...createdContacts.map((contact, index) => ({ businessId: contact.businessId, businessType: 'Contact', externalId: `person-created-${index + 1}`, externalType: 'person', personName: contact.personName, email: contact.email ?? null, accountBusinessId: null, accountExternalId: null })),
    ];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requestId: 'contacts-list', providerId: 'internal-test-provider', result: { ok: true, records } }) });
  });

  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.contact.create/invoke', async (route) => {
    const input = route.request().postDataJSON() as { payload: { personName: string; email?: string; businessId: string } };
    createdContacts.push(input.payload);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requestId: 'contact-create', providerId: 'internal-test-provider', result: { ok: true, record: { businessId: input.payload.businessId, businessType: 'Contact', externalId: 'person-created-1', externalType: 'person', personName: input.payload.personName, email: input.payload.email ?? null } } }) });
  });

  await page.route('http://127.0.0.1:8080/api/capabilities/crm.ops.v1.contact.update/invoke', async (route) => {
    const input = route.request().postDataJSON() as { payload: Record<string, unknown> };
    contactUpdates.push(input.payload);
    if (input.payload.businessId === 'contact-business-1') {
      baseContact = {
        ...baseContact,
        personName: String(input.payload.personName ?? baseContact.personName),
        email: input.payload.email === null ? null as unknown as string : String(input.payload.email ?? baseContact.email),
        accountBusinessId: String(input.payload.accountBusinessId ?? baseContact.accountBusinessId),
      };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requestId: 'contact-update', providerId: 'internal-test-provider', result: { ok: true, record: baseContact } }) });
  });

  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.opportunity.list/invoke', async (route) => {
    const records = [
      baseOpportunity,
      ...createdOpportunities.map((item, index) => ({ businessId: String(item.businessId), businessType: 'Opportunity', externalId: `opp-created-${index + 1}`, externalType: 'opportunity', nameSummary: String(item.nameSummary), lifecycleState: String(item.lifecycleState), accountExternalId: 'company-ext-1', accountBusinessId: String(item.accountBusinessId), estimatedValue: Number(item.estimatedValue), currencyCode: String(item.currencyCode), pipelineStage: 'NEW', nextStep: null })),
    ];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requestId: 'opportunities-list', providerId: 'internal-test-provider', result: { ok: true, records } }) });
  });

  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.opportunity.create/invoke', async (route) => {
    const input = route.request().postDataJSON() as { payload: Record<string, unknown> };
    createdOpportunities.push(input.payload);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requestId: 'opportunity-create', providerId: 'internal-test-provider', result: { ok: true, record: { ...input.payload, businessType: 'Opportunity', externalId: 'opp-created-1', externalType: 'opportunity', accountExternalId: 'company-ext-1', pipelineStage: 'NEW', nextStep: null } } }) });
  });

  await page.route('http://127.0.0.1:8080/api/capabilities/crm.ops.v1.opportunity.update/invoke', async (route) => {
    const input = route.request().postDataJSON() as { payload: Record<string, unknown> };
    opportunityUpdates.push(input.payload);
    baseOpportunity = {
      ...baseOpportunity,
      nameSummary: String(input.payload.nameSummary ?? baseOpportunity.nameSummary),
      estimatedValue: Number(input.payload.estimatedValue ?? baseOpportunity.estimatedValue),
      currencyCode: String(input.payload.currencyCode ?? baseOpportunity.currencyCode),
      pipelineStage: String(input.payload.pipelineStage ?? baseOpportunity.pipelineStage),
      lifecycleState: String(input.payload.lifecycleState ?? baseOpportunity.lifecycleState),
      nextStep: input.payload.nextStep === null ? null : String(input.payload.nextStep ?? baseOpportunity.nextStep ?? ''),
      accountBusinessId: String(input.payload.accountBusinessId ?? baseOpportunity.accountBusinessId),
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requestId: 'opportunity-update', providerId: 'internal-test-provider', result: { ok: true, record: baseOpportunity } }) });
  });

  await page.goto('/');
  const sidebar = page.locator('aside.sidebar');

  await sidebar.getByRole('button', { name: '联系人', exact: true }).click();
  const peopleSurface = page.locator('[data-surface="real-contact-wiring"]');
  await expect(peopleSurface).toBeVisible();
  await expect(page.getByText('Carlos Mendoza', { exact: true })).toBeVisible();
  await expect(peopleSurface.getByText('Andes Plastics Group', { exact: true })).toBeVisible();

  await peopleSurface.getByRole('button', { name: '查看 / 编辑' }).first().click();
  await page.getByLabel('联系人详情姓名').fill('Carlos Mendoza Ruiz');
  await page.getByLabel('联系人详情邮箱').fill('carlos.ruiz@example.com');
  await page.getByRole('combobox', { name: '联系人详情所属客户公司', exact: true }).fill('Andes');
  await page.getByRole('option', { name: 'Andes Plastics Group', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^保存修改/ }).click();
  await expect.poll(() => contactUpdates.length).toBe(1);
  expect(contactUpdates[0]).toMatchObject({ businessId: 'contact-business-1', personName: 'Carlos Mendoza Ruiz', email: 'carlos.ruiz@example.com', accountBusinessId: 'account-business-1' });
  await expect(page.getByText('Carlos Mendoza Ruiz', { exact: true })).toBeVisible();

  await page.locator('.top-actions').getByRole('button', { name: '新建联系人', exact: true }).click();
  await page.getByLabel('新建联系人姓名').fill('María Torres');
  await page.getByLabel('新建联系人邮箱').fill('maria@example.com');
  await page.getByRole('combobox', { name: '新建联系人所属客户公司', exact: true }).fill('Andes');
  await page.getByRole('option', { name: 'Andes Plastics Group', exact: true }).click();
  await page.getByRole('dialog').locator('.crm-form-actions button').filter({ hasText: /^创建/ }).click();
  await expect.poll(() => createdContacts.length).toBe(1);
  expect(createdContacts[0].businessId).toMatch(/^[0-9a-f-]{36}$/i);
  await expect.poll(() => contactUpdates.length).toBe(2);
  expect(contactUpdates[1].accountBusinessId).toBe('account-business-1');

  await sidebar.getByRole('button', { name: '商机', exact: true }).click();
  await page.locator('.top-actions').getByRole('button', { name: '新建商机', exact: true }).click();
  const opportunitySurface = page.locator('[data-surface="real-opportunity-wiring"]');
  await expect(opportunitySurface).toBeVisible();
  await expect(opportunitySurface.getByText('厄瓜多尔园区能源改造', { exact: true })).toBeVisible();
  await page.getByLabel('商机名称').fill('新建储能项目');
  await page.getByRole('combobox', { name: '客户公司', exact: true }).fill('Andes');
  await page.getByRole('option', { name: 'Andes Plastics Group', exact: true }).click();
  await page.getByLabel('预计金额').fill('1250000');
  await page.getByLabel('币种').selectOption('USD');
  await page.getByRole('dialog').locator('.crm-form-actions button').filter({ hasText: /^创建/ }).click();
  await expect.poll(() => createdOpportunities.length).toBe(1);
  expect(createdOpportunities[0]).toMatchObject({ nameSummary: '新建储能项目', lifecycleState: 'OPEN', accountBusinessId: 'account-business-1', estimatedValue: 1250000 });

  await opportunitySurface.getByRole('row').filter({ hasText: '厄瓜多尔园区能源改造' }).getByRole('button', { name: '查看 / 编辑', exact: true }).click();
  await page.getByLabel('编辑商机名称').fill('厄瓜多尔园区能源改造 V2');
  await page.getByRole('combobox', { name: '编辑商机客户公司', exact: true }).fill('Andes');
  await page.getByRole('option', { name: 'Andes Plastics Group', exact: true }).click();
  await page.getByLabel('编辑预计金额').fill('990000');
  await page.getByLabel('编辑外贸推进阶段').selectOption('QUOTATION');
  await page.getByLabel('编辑商机结果').selectOption('CLOSED_LOST');
  await page.getByLabel('编辑下一步').fill('下季度重新联系并更新负荷资料');
  await page.getByRole('dialog').getByRole('button', { name: /^保存修改/ }).click();
  await expect.poll(() => opportunityUpdates.length).toBe(1);
  expect(opportunityUpdates[0]).toMatchObject({
    businessId: 'opp-business-1',
    nameSummary: '厄瓜多尔园区能源改造 V2',
    accountBusinessId: 'account-business-1',
    estimatedValue: 990000,
    pipelineStage: 'PROPOSAL',
    lifecycleState: 'CLOSED_LOST',
    nextStep: '下季度重新联系并更新负荷资料',
  });
  await expect(opportunitySurface.getByText('厄瓜多尔园区能源改造 V2', { exact: true })).toBeVisible();
  await expect(page.getByText('已丢单', { exact: true })).toBeVisible();
  await expect(opportunitySurface.getByRole('cell', { name: '下季度重新联系并更新负荷资料', exact: true })).toBeVisible();

  for (const forbiddenText of ['Twenty', 'Provider', 'Adapter', 'crm.v1.', 'crm.ops.v1.', '浏览器未直连', 'company-ext-1', 'account-business-1', 'opp-business-1', 'contact-business-1']) {
    await expect(page.getByText(forbiddenText, { exact: false })).toHaveCount(0);
  }

  const vendorDirectCalls = observedRequests.filter((url) => url.includes(':3000') || url.includes('/rest/people') || url.includes('/rest/opportunities') || url.includes('twenty-server'));
  expect(vendorDirectCalls).toEqual([]);
  for (const path of [
    'crm.v1.contact.list', 'crm.v1.contact.create', 'crm.ops.v1.contact.update',
    'crm.v1.opportunity.list', 'crm.v1.opportunity.create', 'crm.ops.v1.opportunity.update',
  ]) {
    expect(observedRequests.some((url) => url.includes(`/api/capabilities/${path}/invoke`))).toBe(true);
  }

  await page.screenshot({ path: testInfo.outputPath('core-crm-real-wiring.png'), fullPage: true });
});
