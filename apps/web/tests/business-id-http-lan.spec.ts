import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Exercise an ordinary HTTP hostname rather than localhost so Chromium applies
// the same non-secure-context rules as the company LAN entry point. Preserve
// the governed pre-provisioned browser path on self-hosted CI. These LAN-only
// tests must use a direct local connection even when the runner service itself
// uses a proxy for GitHub control-plane traffic.
const chromiumExecutablePath = process.env.GBAP_CHROMIUM_EXECUTABLE_PATH?.trim();
test.use({
  launchOptions: {
    ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
    args: [
      '--host-resolver-rules=MAP gbap-lan.test 127.0.0.1',
      '--no-proxy-server',
    ],
  },
});

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const webRoot = fileURLToPath(new URL('..', import.meta.url));

function collectTextFiles(root: string, output: string[] = []) {
  for (const name of readdirSync(root)) {
    if (['node_modules', 'dist', 'test-results', 'playwright-report'].includes(name)) continue;
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) collectTextFiles(path, output);
    else if (/\.(?:ts|tsx|js|mjs|html)$/.test(name)) output.push(path);
  }
  return output;
}

test('apps/web has no browser-path dependency on crypto randomUUID', () => {
  const forbidden = 'crypto.' + 'randomUUID';
  const offenders = collectTextFiles(webRoot).filter((path) => readFileSync(path, 'utf8').includes(forbidden));
  expect(offenders).toEqual([]);

  const helperSource = readFileSync(join(webRoot, 'src/lib/randomUuid.ts'), 'utf8');
  expect(helperSource).toContain('crypto.getRandomValues');
  expect(helperSource).not.toContain('Math.' + 'random');
  expect(helperSource).not.toContain(forbidden);
});

test('HTTP LAN-equivalent browser can create company, contact, opportunity, task and note IDs', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop LAN business-ID acceptance');

  const baseUrl = String(testInfo.project.use.baseURL);
  const lanOrigin = baseUrl.replace('127.0.0.1', 'gbap-lan.test');
  const accounts: Array<Record<string, unknown>> = [{
    businessId: 'account-business-1', businessType: 'Account', externalId: 'company-ext-1', externalType: 'company', displayName: 'Andes Plastics Group', website: null,
  }];
  const contacts: Array<Record<string, unknown>> = [];
  const opportunities: Array<Record<string, unknown>> = [];
  const tasks: Array<Record<string, unknown>> = [];
  const notes: Array<Record<string, unknown>> = [];
  const createdIds: string[] = [];

  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'test-access-token', id_token: 'test-id-token' }));
  });

  const listBody = (records: unknown[]) => JSON.stringify({ requestId: 'lan-list', providerId: 'internal-test-provider', result: { ok: true, records } });
  const recordBody = (record: unknown) => JSON.stringify({ requestId: 'lan-create', providerId: 'internal-test-provider', result: { ok: true, record } });

  await page.route(`${lanOrigin}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/me') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ subject: 'test-user', username: 'sales.user', roles: ['substrate-user'] }) });
      return;
    }
    if (path === '/api/crm-native/company-profiles') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profiles: [] }) });
      return;
    }

    if (path === '/api/crm-native/customer-intelligence') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ profiles: [] }) });
    if (path.startsWith('/api/crm-native/customer-intelligence/') && route.request().method() === 'PATCH') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ profile: { businessId: path.split('/').pop(), ...route.request().postDataJSON() } }) });

    const capability = decodeURIComponent(path.match(/^\/api\/capabilities\/(.+)\/invoke$/)?.[1] ?? '');
    const payload = (route.request().postDataJSON() as { payload?: Record<string, unknown> } | null)?.payload ?? {};

    if (capability === 'crm.v1.account.list') return route.fulfill({ status: 200, contentType: 'application/json', body: listBody(accounts) });
    if (capability === 'crm.v1.contact.list') return route.fulfill({ status: 200, contentType: 'application/json', body: listBody(contacts) });
    if (capability === 'crm.v1.opportunity.list') return route.fulfill({ status: 200, contentType: 'application/json', body: listBody(opportunities) });
    if (capability === 'crm.ops.v1.task.list') return route.fulfill({ status: 200, contentType: 'application/json', body: listBody(tasks) });
    if (capability === 'crm.ops.v1.note.list') return route.fulfill({ status: 200, contentType: 'application/json', body: listBody(notes) });
    if (capability === 'crm.ops.v1.activity.list') return route.fulfill({ status: 200, contentType: 'application/json', body: listBody([
      ...tasks.map((item) => ({ kind: 'TASK', ...item })), ...notes.map((item) => ({ kind: 'NOTE', ...item })),
    ]) });

    if (capability === 'crm.v1.account.create') {
      const businessId = String(payload.businessId);
      createdIds.push(businessId);
      const record = { businessId, businessType: 'Account', externalId: 'company-created', externalType: 'company', displayName: payload.displayName, website: null };
      accounts.push(record);
      return route.fulfill({ status: 200, contentType: 'application/json', body: recordBody(record) });
    }
    if (capability === 'crm.ops.v1.account.update') {
      const index = accounts.findIndex((item) => item.businessId === payload.businessId);
      if (index >= 0) accounts[index] = { ...accounts[index], ...payload };
      return route.fulfill({ status: 200, contentType: 'application/json', body: recordBody(accounts[index]) });
    }
    if (capability === 'crm.v1.contact.create') {
      const businessId = String(payload.businessId);
      createdIds.push(businessId);
      const record = { businessId, businessType: 'Contact', externalId: 'contact-created', externalType: 'person', personName: payload.personName, email: payload.email ?? null, accountBusinessId: null, accountExternalId: null };
      contacts.push(record);
      return route.fulfill({ status: 200, contentType: 'application/json', body: recordBody(record) });
    }
    if (capability === 'crm.ops.v1.contact.update') {
      const index = contacts.findIndex((item) => item.businessId === payload.businessId);
      if (index >= 0) contacts[index] = { ...contacts[index], ...payload };
      return route.fulfill({ status: 200, contentType: 'application/json', body: recordBody(contacts[index]) });
    }
    if (capability === 'crm.v1.opportunity.create') {
      const businessId = String(payload.businessId);
      createdIds.push(businessId);
      const record = { ...payload, businessId, businessType: 'Opportunity', externalId: 'opportunity-created', externalType: 'opportunity', accountExternalId: 'company-ext-1', pipelineStage: 'NEW', nextStep: null };
      opportunities.push(record);
      return route.fulfill({ status: 200, contentType: 'application/json', body: recordBody(record) });
    }
    if (capability === 'crm.ops.v1.task.create') {
      const businessId = String(payload.businessId);
      createdIds.push(businessId);
      const record = { businessId, businessType: 'CrmTask', title: payload.title, bodyMarkdown: payload.bodyMarkdown ?? null, dueAt: payload.dueAt ?? null, status: 'TODO', targets: payload.targets ?? [], createdAt: '2026-09-02T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z' };
      tasks.push(record);
      return route.fulfill({ status: 200, contentType: 'application/json', body: recordBody(record) });
    }
    if (capability === 'crm.ops.v1.note.create') {
      const businessId = String(payload.businessId);
      createdIds.push(businessId);
      const record = { businessId, businessType: 'CrmNote', title: payload.title, bodyMarkdown: payload.bodyMarkdown ?? null, targets: payload.targets ?? [], createdAt: '2026-09-02T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z' };
      notes.push(record);
      return route.fulfill({ status: 200, contentType: 'application/json', body: recordBody(record) });
    }

    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: `unhandled_test_route:${path}` }) });
  });

  await page.goto(`${lanOrigin}/`);
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  expect(await page.evaluate(() => typeof (crypto as unknown as Record<string, unknown>)['random' + 'UUID'])).toBe('undefined');
  expect(await page.evaluate(() => typeof crypto.getRandomValues)).toBe('function');

  const sidebar = page.locator('aside.sidebar');

  await sidebar.getByRole('button', { name: '客户公司', exact: true }).click();
  const companySurface = page.locator('[data-surface="real-account-wiring"]');
  await page.locator('#page-action-slot').getByRole('button', { name: '新建客户公司', exact: true }).click();
  await page.getByRole('dialog', { name: '新建客户公司' }).getByLabel('公司名称', { exact: true }).fill('LAN Company');
  await page.getByRole('dialog', { name: '新建客户公司' }).getByRole('button', { name: '创建客户公司', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'LAN Company', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭客户详情', exact: true }).click();
  await expect(companySurface.getByRole('cell', { name: 'LAN Company', exact: true })).toBeVisible();

  await sidebar.getByRole('button', { name: '联系人', exact: true }).click();
  const peopleSurface = page.locator('[data-surface="real-contact-wiring"]');
  await page.locator('#page-action-slot').getByRole('button', { name: '新建联系人', exact: true }).click();
  await page.getByLabel('新建联系人姓名').fill('LAN Contact');
  await page.getByLabel('新建联系人邮箱').fill('lan.contact@example.com');
  await page.getByRole('combobox', { name: '新建联系人所属客户公司' }).fill('Andes');
  await page.getByRole('option', { name: 'Andes Plastics Group', exact: true }).click();
  await page.getByRole('dialog', { name: '新建联系人' }).getByRole('button', { name: /^创建/ }).click();
  await expect(peopleSurface.getByText('LAN Contact', { exact: true })).toBeVisible();

  await sidebar.getByRole('button', { name: '商机', exact: true }).click();
  await page.locator('#page-action-slot').getByRole('button', { name: '新建商机', exact: true }).click();
  const opportunitySurface = page.locator('[data-surface="real-opportunity-wiring"]');
  await page.getByLabel('商机名称').fill('LAN Opportunity');
  await page.getByRole('combobox', { name: '客户公司', exact: true }).fill('Andes');
  await page.getByRole('option', { name: 'Andes Plastics Group', exact: true }).click();
  await page.getByLabel('预计金额').fill('100000');
  await page.getByLabel('币种').selectOption('USD');
  await page.getByRole('dialog', { name: '新建商机' }).getByRole('button', { name: /^创建/ }).click();
  await expect(opportunitySurface.getByText('LAN Opportunity', { exact: true })).toBeVisible();

  await sidebar.getByRole('button', { name: '任务', exact: true }).click();
  const taskSurface = page.locator('[data-surface="real-task-wiring"]');
  await page.locator('#page-action-slot').getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByLabel('任务标题').fill('LAN Task');
  await page.getByRole('combobox', { name: '任务关联记录' }).fill('Andes');
  await page.getByRole('option', { name: '客户公司 · Andes Plastics Group', exact: true }).click();
  await page.getByRole('dialog', { name: '新建任务' }).getByRole('button', { name: /^创建/ }).click();
  await expect(taskSurface.getByText('LAN Task', { exact: true })).toBeVisible();

  await sidebar.getByRole('button', { name: '笔记', exact: true }).click();
  const noteSurface = page.locator('[data-surface="real-note-wiring"]');
  await page.locator('#page-action-slot').getByRole('button', { name: '新建笔记', exact: true }).click();
  await page.getByLabel('笔记标题').fill('LAN Note');
  await page.getByRole('combobox', { name: '笔记关联记录' }).fill('Andes');
  await page.getByRole('option', { name: '客户公司 · Andes Plastics Group', exact: true }).click();
  await page.getByLabel('笔记内容').fill('Created from an HTTP LAN-equivalent browser context.');
  await page.getByRole('dialog', { name: '新建笔记' }).getByRole('button', { name: /^创建/ }).click();
  await expect(noteSurface.getByText('LAN Note', { exact: true }).first()).toBeVisible();

  expect(createdIds).toHaveLength(5);
  expect(new Set(createdIds).size).toBe(5);
  for (const id of createdIds) expect(id).toMatch(uuidV4);
});
