import { expect, test } from '@playwright/test';

test('Tasks and Notes are real employee workflows behind GBAP operational boundaries', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop operational CRM acceptance');

  const observedRequests: string[] = [];
  const tasks: Array<Record<string, unknown>> = [];
  const notes: Array<Record<string, unknown>> = [];
  const createdTaskPayloads: Array<Record<string, unknown>> = [];
  const updatedTaskPayloads: Array<Record<string, unknown>> = [];
  const createdNotePayloads: Array<Record<string, unknown>> = [];
  const updatedNotePayloads: Array<Record<string, unknown>> = [];

  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'test-access-token', id_token: 'test-id-token' }));
  });
  page.on('request', (request) => observedRequests.push(request.url()));

  await page.route('http://127.0.0.1:8080/api/me', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ subject: 'test-user', username: 'sales.user', roles: ['substrate-user'] }) });
  });

  const fulfillList = (records: unknown[]) => JSON.stringify({ requestId: 'test-list', providerId: 'internal-test-provider', result: { ok: true, records } });

  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.account.list/invoke', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: fulfillList([{ businessId: 'account-business-1', businessType: 'Account', externalId: 'provider-company-1', externalType: 'company', displayName: 'Andes Plastics Group', website: null }]) });
  });
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.contact.list/invoke', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: fulfillList([{ businessId: 'contact-business-1', businessType: 'Contact', externalId: 'provider-person-1', externalType: 'person', personName: 'Carlos Mendoza', email: 'carlos@example.com' }]) });
  });
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.opportunity.list/invoke', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: fulfillList([{ businessId: 'opp-business-1', businessType: 'Opportunity', externalId: 'provider-opp-1', externalType: 'opportunity', nameSummary: '厄瓜多尔园区能源改造', lifecycleState: 'OPEN', accountExternalId: 'provider-company-1', estimatedValue: 880000, currencyCode: 'USD', pipelineStage: 'NEW', nextStep: null }]) });
  });

  await page.route('http://127.0.0.1:8080/api/capabilities/crm.ops.v1.task.list/invoke', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: fulfillList(tasks) });
  });
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.ops.v1.task.create/invoke', async (route) => {
    const input = route.request().postDataJSON() as { payload: Record<string, unknown> };
    createdTaskPayloads.push(input.payload);
    const record = { businessId: input.payload.businessId, businessType: 'CrmTask', title: input.payload.title, bodyMarkdown: input.payload.bodyMarkdown ?? null, dueAt: input.payload.dueAt ?? null, status: 'TODO', targets: input.payload.targets ?? [], createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' };
    tasks.push(record);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requestId: 'task-create', providerId: 'internal-test-provider', result: { ok: true, record } }) });
  });
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.ops.v1.task.update/invoke', async (route) => {
    const input = route.request().postDataJSON() as { payload: Record<string, unknown> };
    updatedTaskPayloads.push(input.payload);
    const index = tasks.findIndex((item) => item.businessId === input.payload.businessId);
    if (index >= 0) tasks[index] = { ...tasks[index], ...input.payload, updatedAt: '2026-09-01T00:05:00Z' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requestId: 'task-update', providerId: 'internal-test-provider', result: { ok: true, record: tasks[index] } }) });
  });

  await page.route('http://127.0.0.1:8080/api/capabilities/crm.ops.v1.note.list/invoke', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: fulfillList(notes) });
  });
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.ops.v1.note.create/invoke', async (route) => {
    const input = route.request().postDataJSON() as { payload: Record<string, unknown> };
    createdNotePayloads.push(input.payload);
    const record = { businessId: input.payload.businessId, businessType: 'CrmNote', title: input.payload.title, bodyMarkdown: input.payload.bodyMarkdown ?? null, targets: input.payload.targets ?? [], createdAt: '2026-09-01T00:06:00Z', updatedAt: '2026-09-01T00:06:00Z' };
    notes.push(record);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requestId: 'note-create', providerId: 'internal-test-provider', result: { ok: true, record } }) });
  });
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.ops.v1.note.update/invoke', async (route) => {
    const input = route.request().postDataJSON() as { payload: Record<string, unknown> };
    updatedNotePayloads.push(input.payload);
    const index = notes.findIndex((item) => item.businessId === input.payload.businessId);
    if (index >= 0) notes[index] = { ...notes[index], ...input.payload, updatedAt: '2026-09-01T00:10:00Z' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requestId: 'note-update', providerId: 'internal-test-provider', result: { ok: true, record: notes[index] } }) });
  });
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.ops.v1.activity.list/invoke', async (route) => {
    const activity = [
      ...tasks.map((item) => ({ kind: 'TASK', ...item })),
      ...notes.map((item) => ({ kind: 'NOTE', ...item })),
    ];
    await route.fulfill({ status: 200, contentType: 'application/json', body: fulfillList(activity) });
  });

  await page.goto('/');
  const sidebar = page.locator('aside.sidebar');

  await sidebar.getByRole('button', { name: '任务', exact: true }).click();
  await expect(page.locator('[data-surface="real-task-wiring"]')).toBeVisible();
  await expect(page.getByText('还没有任务。点击“新建任务”开始安排跟进。')).toBeVisible();
  await page.locator('.top-actions').getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByLabel('任务标题').fill('跟进客户电费账单');
  await page.getByRole('combobox', { name: '任务关联记录', exact: true }).fill('Andes');
  await page.getByRole('option').filter({ hasText: 'Andes Plastics Group' }).click();
  await page.getByLabel('任务说明').fill('索取最近12个月完整账单');
  await page.getByRole('dialog').locator('.crm-form-actions button').filter({ hasText: /^创建/ }).click();

  await expect.poll(() => createdTaskPayloads.length).toBe(1);
  expect(createdTaskPayloads[0].businessId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(createdTaskPayloads[0].targets).toEqual([{ businessType: 'Account', businessId: 'account-business-1' }]);
  expect(JSON.stringify(createdTaskPayloads[0])).not.toContain('provider-company-1');
  await expect(page.getByText('跟进客户电费账单', { exact: true })).toBeVisible();
  await expect(page.getByText('客户公司 · Andes Plastics Group', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: /跟进客户电费账单/ }).click();
  await expect.poll(() => updatedTaskPayloads.length).toBe(1);
  expect(updatedTaskPayloads[0]).toMatchObject({ businessId: createdTaskPayloads[0].businessId, status: 'DONE' });
  expect(JSON.stringify(updatedTaskPayloads[0])).not.toContain('provider-company-1');
  await expect(page.getByText('任务已完成。', { exact: true })).toBeVisible();

  await sidebar.getByRole('button', { name: '笔记', exact: true }).click();
  await expect(page.locator('[data-surface="real-note-wiring"]')).toBeVisible();
  await page.locator('.top-actions').getByRole('button', { name: '新建笔记', exact: true }).click();
  await page.getByLabel('笔记标题').fill('客户需求沟通记录');
  await page.getByRole('combobox', { name: '笔记关联记录', exact: true }).fill('厄瓜多尔');
  await page.getByRole('option').filter({ hasText: '厄瓜多尔' }).click();
  await page.getByLabel('笔记内容').fill('客户优先考虑一期光储方案');
  await page.getByRole('dialog').locator('.crm-form-actions button').filter({ hasText: /^创建/ }).click();

  await expect.poll(() => createdNotePayloads.length).toBe(1);
  expect(createdNotePayloads[0].targets).toEqual([{ businessType: 'Opportunity', businessId: 'opp-business-1' }]);
  expect(JSON.stringify(createdNotePayloads[0])).not.toContain('provider-opp-1');
  await expect(page.getByText('客户需求沟通记录', { exact: true }).first()).toBeVisible();

  await page.locator('.crm-note-card').filter({ hasText: '客户需求沟通记录' }).getByRole('button', { name: '查看 / 编辑', exact: true }).click();
  await page.getByLabel('笔记内容').fill('客户确认一期先做光伏+储能，二期再扩容');
  await page.getByRole('dialog').locator('.crm-form-actions button').filter({ hasText: '保存修改' }).click();
  await expect.poll(() => updatedNotePayloads.length).toBe(1);
  expect(updatedNotePayloads[0].businessId).toBe(createdNotePayloads[0].businessId);
  expect(JSON.stringify(updatedNotePayloads[0])).not.toContain('provider-opp-1');
  await expect(page.getByText('客户确认一期先做光伏+储能，二期再扩容', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: '活动时间线' })).toBeVisible();

  for (const forbiddenText of ['Twenty', 'Provider', 'Adapter', 'crm.ops.v1.', 'TaskTarget', 'NoteTarget', 'provider-company-1', 'provider-person-1', 'provider-opp-1']) {
    await expect(page.getByText(forbiddenText, { exact: false })).toHaveCount(0);
  }

  const vendorDirectCalls = observedRequests.filter((url) => url.includes(':3000') || url.includes('/rest/tasks') || url.includes('/rest/notes') || url.includes('/rest/taskTargets') || url.includes('/rest/noteTargets') || url.includes('twenty-server'));
  expect(vendorDirectCalls).toEqual([]);
  for (const capability of ['task.list', 'task.create', 'task.update', 'note.list', 'note.create', 'note.update', 'activity.list']) {
    expect(observedRequests.some((url) => url.includes(`/api/capabilities/crm.ops.v1.${capability}/invoke`))).toBe(true);
  }

  await page.screenshot({ path: testInfo.outputPath('tasks-notes-real-wiring.png'), fullPage: true });
});
