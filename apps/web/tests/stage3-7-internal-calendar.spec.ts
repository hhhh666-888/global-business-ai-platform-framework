import { expect, test } from '@playwright/test';

const now = new Date('2026-09-15T01:00:00.000Z');

async function installApi(page: any, captures: Record<string, any>) {
  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'calendar-test-token', id_token: 'calendar-test-id' }));
  });

  let events: any[] = [];
  await page.route('http://127.0.0.1:8080/api/**', async (route: any) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    if (path === '/api/me') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ subject: 'calendar-user', username: 'calendar.user', roles: ['substrate-user'] }) });
    }
    if (path === '/api/calendar-events' && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events }) });
    }
    if (path === '/api/calendar-events' && method === 'POST') {
      captures.create = JSON.parse(route.request().postData() ?? '{}');
      const created = {
        id: 'calendar-event-1',
        title: captures.create.title,
        description: captures.create.description ?? null,
        location: captures.create.location ?? null,
        startsAt: captures.create.startsAt,
        endsAt: captures.create.endsAt,
        fullDay: Boolean(captures.create.fullDay),
        timeZone: captures.create.timeZone ?? null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      events = [created];
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ event: created }) });
    }
    if (path === '/api/calendar-events/calendar-event-1' && method === 'PATCH') {
      captures.update = JSON.parse(route.request().postData() ?? '{}');
      events = [{ ...events[0], ...captures.update, updatedAt: new Date(now.getTime() + 60_000).toISOString() }];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ event: events[0] }) });
    }
    if (path === '/api/calendar-events/calendar-event-1' && method === 'DELETE') {
      captures.deleted = true;
      events = [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ removed: 'calendar-event-1' }) });
    }
    if (path === '/api/crm-native/company-profiles' || path === '/api/crm-native/customer-intelligence' || path === '/api/crm-native/opportunity-profiles') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profiles: [] }) });
    }
    if (path.includes('/api/capabilities/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requestId: 'calendar-test', providerId: 'test-provider', result: { ok: true, records: [] } }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

test('ordinary employee calendar works directly without connecting email or an external calendar provider', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop internal calendar acceptance');
  const captures: Record<string, any> = {};
  await installApi(page, captures);
  await page.goto('/');

  const sidebar = page.locator('aside.sidebar');
  await sidebar.getByRole('button', { name: '日历', exact: true }).click();
  const surface = page.locator('[data-surface="real-calendar-wiring"]');
  await expect(surface).toBeVisible();
  await expect(surface.getByText('个人日历', { exact: true })).toBeVisible();
  await expect(surface.getByText(/连接你的工作日历/)).toHaveCount(0);
  await expect(surface.getByText(/Google|Microsoft 365|邮箱授权|日历连接/)).toHaveCount(0);

  // The governed PageActionBridge moves the visible page action into the desktop topbar.
  await page.getByRole('button', { name: '新建日程', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: '新建日程' });
  await expect(dialog.getByText('不连接邮箱，也不向外部日历同步')).toBeVisible();
  await dialog.getByLabel('日程标题').fill('厄瓜多尔客户跟进');
  await dialog.getByLabel('地点').fill('会议室');
  await dialog.getByLabel('日程说明').fill('确认工厂用电数据');
  await dialog.getByRole('button', { name: '创建日程', exact: true }).click();
  await expect(surface.getByRole('status')).toContainText('日程已创建');
  expect(captures.create.title).toBe('厄瓜多尔客户跟进');
  expect(captures.create).not.toHaveProperty('connectedAccountId');
  expect(captures.create).not.toHaveProperty('attendees');
  expect(captures.create).not.toHaveProperty('addConferencing');

  await surface.getByRole('button', { name: '编辑', exact: true }).click();
  const edit = page.getByRole('dialog', { name: '编辑日程' });
  await edit.getByLabel('地点').fill('线上会议');
  await edit.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(surface.getByRole('status')).toContainText('日程已保存');
  expect(captures.update.location).toBe('线上会议');

  page.on('dialog', (browserDialog) => void browserDialog.accept());
  await surface.getByRole('button', { name: '删除日程', exact: true }).click();
  await expect(surface.getByRole('status')).toContainText('日程已删除');
  expect(captures.deleted).toBe(true);
});
