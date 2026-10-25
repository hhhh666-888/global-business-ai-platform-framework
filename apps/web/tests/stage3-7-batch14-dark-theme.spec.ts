import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../../..');

function invocation(result: Record<string, unknown>) {
  return JSON.stringify({ requestId: 'stage3-7-batch14', providerId: 'test-provider', result: { ok: true, ...result } });
}

async function installSessionAndCustomerMocks(page: any) {
  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'batch14-access-token', id_token: 'batch14-id-token' }));
    localStorage.setItem('gbap.appearance.employee-id', 'dark');
  });
  await page.route('http://127.0.0.1:8080/api/me', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ subject: 'employee-id', username: 'dark.user', roles: ['substrate-user'] }),
  }));
  await page.route('http://127.0.0.1:8080/api/crm-native/company-profiles', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ profiles: [{ businessId: 'dark-factory', customerType: 'FACTORY', relationshipStatus: 'PROSPECT', industry: '制造业' }] }),
  }));
  await page.route('http://127.0.0.1:8080/api/crm-native/customer-intelligence', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ profiles: [] }),
  }));
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.account.list/invoke', (route: any) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: invocation({ records: [{ businessId: 'dark-factory', businessType: 'Account', externalId: 'dark-factory-external', externalType: 'company', displayName: '深色模式测试工厂', website: null }] }),
  }));
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.contact.list/invoke', (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ records: [] }) }));
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.opportunity.list/invoke', (route: any) => route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ records: [] }) }));
}

function rgbChannels(value: string) {
  const match = value.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/i);
  if (!match) throw new Error(`Unexpected color: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

async function expectDarkNeutral(locator: any) {
  await expect(locator).toBeVisible();
  const background = await locator.evaluate((element: Element) => getComputedStyle(element).backgroundColor);
  const channels = rgbChannels(background);
  expect(Math.max(...channels)).toBeLessThan(180);
  expect(background).not.toBe('rgb(245, 247, 249)');
  expect(background).not.toBe('rgb(248, 249, 251)');
}

test('Stage 3.7 Batch 14 defines the missing elevated token at the final visual cascade', () => {
  const main = readFileSync(resolve(repoRoot, 'apps/web/src/main.tsx'), 'utf8');
  const dark = readFileSync(resolve(repoRoot, 'apps/web/src/batch14-dark-theme.css'), 'utf8');
  expect(dark).toContain('--fg-elevated: var(--fg-surface-soft)');
  expect(main.indexOf("import './batch14-dark-theme.css'"))
    .toBeGreaterThan(main.indexOf("import './crm-visual-system.css'"));
});

test('Stage 3.7 Batch 14 keeps owner-observed customer role and unknown-grade chips dark', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop dark-theme acceptance');
  await installSessionAndCustomerMocks(page);
  await page.goto('/');
  await page.locator('aside.sidebar').getByRole('button', { name: '客户公司', exact: true }).click();
  const surface = page.locator('[data-surface="real-account-wiring"]');
  await expect(surface).toBeVisible();
  await expect(surface.getByText('深色模式测试工厂', { exact: true })).toBeVisible();
  await expectDarkNeutral(surface.locator('.customer-role-tags > span').first());
  await expectDarkNeutral(surface.locator('.opportunity-grade.grade-unknown').first());
});
