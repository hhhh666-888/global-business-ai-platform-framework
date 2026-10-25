import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CRM_EXPORT_LIMIT,
  CRM_IMPORT_BATCH_SIZE,
  CRM_IMPORT_FILE_LIMIT,
  processImportRows,
} from '../src/lib/crmBulkTransfer';
import {
  companyRowInput,
  inspectHeaders,
  parseCsvDocument,
} from '../src/lib/crmCsvImport';

const repoRoot = resolve(import.meta.dirname, '../../..');

function invocation(records: unknown) {
  return JSON.stringify({ requestId: 'batch17-test', providerId: 'test-provider', result: records });
}

async function installEmptyAuthenticatedApi(page: any) {
  await page.route('http://127.0.0.1:8080/api/**', async (route: any) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ subject: 'remembered-user', username: 'remembered.user', roles: ['substrate-user'] }) });
    if (path === '/api/crm-native/company-profiles' || path === '/api/crm-native/customer-intelligence' || path === '/api/crm-native/opportunity-profiles') {
      const key = path.includes('opportunity') ? 'profiles' : 'profiles';
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ [key]: [] }) });
    }
    if (path.includes('/api/capabilities/')) return route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ records: [] }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

async function installAdminDataApi(page: any) {
  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'bulk-transfer-token', id_token: 'bulk-transfer-id' }));
  });
  await page.route('http://127.0.0.1:8080/api/**', async (route: any) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === '/api/me') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ subject: 'bulk-admin', username: 'bulk.admin', roles: ['substrate-user', 'substrate-admin'] }) });
    if (request.method() === 'GET' && path === '/api/crm-native/company-import/jobs') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jobs: [], total: 0, limit: 10, offset: 0 }) });
    }
    if (path === '/api/crm-native/company-profiles' || path === '/api/crm-native/customer-intelligence' || path === '/api/crm-native/opportunity-profiles') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profiles: [] }) });
    }
    if (path.includes('/api/capabilities/')) return route.fulfill({ status: 200, contentType: 'application/json', body: invocation({ records: [] }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

test('Batch 17 silently restores a remembered Keycloak SSO session without persisting tokens', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop Batch 17 acceptance');
  let authorizeCalls = 0;
  let tokenCalls = 0;

  await installEmptyAuthenticatedApi(page);
  await page.route('http://127.0.0.1:8080/realms/gbap/protocol/openid-connect/auth**', async (route) => {
    authorizeCalls += 1;
    const url = new URL(route.request().url());
    expect(url.searchParams.get('prompt')).toBe('none');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const state = url.searchParams.get('state');
    expect(state).toBeTruthy();
    await route.fulfill({ status: 302, headers: { location: `/?code=remembered-code&state=${encodeURIComponent(state!)}` } });
  });
  await page.route('http://127.0.0.1:8080/realms/gbap/protocol/openid-connect/token', async (route) => {
    tokenCalls += 1;
    expect(route.request().postData() ?? '').toContain('grant_type=authorization_code');
    expect(route.request().postData() ?? '').toContain('code=remembered-code');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: 'remembered-access-token', id_token: 'remembered-id-token', refresh_token: 'remembered-refresh-token', expires_in: 300 }),
    });
  });

  await page.goto('/');
  await expect(page.locator('aside.sidebar')).toBeVisible();
  expect(authorizeCalls).toBe(1);
  expect(tokenCalls).toBe(1);
  const session = await page.evaluate(() => ({
    sessionToken: sessionStorage.getItem('gbap.tokens'),
    localToken: localStorage.getItem('gbap.tokens'),
    pending: sessionStorage.getItem('gbap.oauth.silent.pending'),
  }));
  expect(session.sessionToken).toContain('remembered-access-token');
  expect(session.localToken).toBeNull();
  expect(session.pending).toBeNull();
});

test('Batch 17 turns a missing remembered SSO session into anonymous state without a redirect loop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop Batch 17 acceptance');
  let authorizeCalls = 0;
  await page.route('http://127.0.0.1:8080/realms/gbap/protocol/openid-connect/auth**', async (route) => {
    authorizeCalls += 1;
    const url = new URL(route.request().url());
    const state = url.searchParams.get('state');
    await route.fulfill({ status: 302, headers: { location: `/?error=login_required&state=${encodeURIComponent(state ?? '')}` } });
  });

  await page.goto('/');
  await expect(page.getByRole('button', { name: '企业登录' }).first()).toBeVisible();
  expect(authorizeCalls).toBe(1);
  await page.reload();
  await expect(page.getByRole('button', { name: '企业登录' }).first()).toBeVisible();
  expect(authorizeCalls).toBe(1);
});

test('Batch 17 renewable customer CSV maps industrial and channel collection fields', async () => {
  const parsed = parseCsvDocument([
    '公司名称,主客户分组,客户角色,国家/地区,月用电量kWh,供电稳定性,项目需求,主营产品,年采购规模,采购频率,仓储能力',
    'Alpha Plastics,工业用能客户,工厂,厄瓜多尔,850000,经常停电,"光伏;储能",,,,',
    'Beta Solar,渠道/经销商,新能源经销商,厄瓜多尔,,,,"光伏组件;逆变器;储能",2500000,每季度,有',
  ].join('\n'));
  const inspection = inspectHeaders('companies', parsed);
  expect(inspection.rows).toBe(2);
  expect(inspection.ignored).toEqual([]);

  const industrial = companyRowInput(parsed.rows[0]);
  expect(industrial.base.displayName).toBe('Alpha Plastics');
  expect(industrial.intelligence.customerSegment).toBe('INDUSTRIAL');
  expect(industrial.intelligence.customerRoles).toEqual(['FACTORY']);
  expect(industrial.intelligence.monthlyConsumptionKwh).toBe(850000);
  expect(industrial.intelligence.gridStability).toBe('FREQUENT_OUTAGE');
  expect(industrial.intelligence.projectNeeds).toEqual(['SOLAR', 'STORAGE']);

  const channel = companyRowInput(parsed.rows[1]);
  expect(channel.intelligence.customerSegment).toBe('CHANNEL');
  expect(channel.intelligence.customerRoles).toEqual(['RENEWABLE_DISTRIBUTOR']);
  expect(channel.intelligence.channelProducts).toEqual(['SOLAR_MODULE', 'INVERTER', 'STORAGE']);
  expect(channel.intelligence.annualPurchaseValue).toBe(2500000);
  expect(channel.intelligence.purchaseFrequency).toBe('QUARTERLY');
  expect(channel.intelligence.warehouseCapability).toBe(true);
});

test('Batch 17 accepts common semicolon CSV exports and rejects renamed Excel workbooks', async () => {
  const semicolon = parseCsvDocument('公司名称;国家/地区;行业\nGamma Foods;洪都拉斯;食品加工\n');
  expect(semicolon.delimiter).toBe(';');
  expect(semicolon.rows[0].data).toBeTruthy();
  expect(() => parseCsvDocument('PK\u0003\u0004fake-xlsx-binary')).toThrow('实际仍是 Excel .xlsx');
});

test('Batch 17 automatically processes more than the old 300-row ceiling in 60-row batches', async () => {
  const rows = Array.from({ length: 301 }, (_, index) => index + 1);
  const checkpoints: number[] = [];
  let handled = 0;
  await processImportRows(rows, async () => { handled += 1; }, (value) => checkpoints.push(value.processed));

  expect(CRM_IMPORT_FILE_LIMIT).toBe(10_000);
  expect(CRM_IMPORT_BATCH_SIZE).toBe(60);
  expect(CRM_EXPORT_LIMIT).toBe(10_000);
  expect(handled).toBe(301);
  expect(checkpoints).toEqual([60, 120, 180, 240, 300, 301]);
});

test('Batch 17 accepts a 301-row CSV in the customer-company import center without legacy split limits', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop Batch 17 company-import acceptance');
  await installAdminDataApi(page);
  await page.goto('/');
  await page.locator('aside.sidebar').getByRole('button', { name: '数据导入与导出', exact: true }).click();

  const csv = [
    '公司名称,国家/地区',
    ...Array.from({ length: 301 }, (_, index) => `批量客户 ${index + 1},EC`),
  ].join('\n');
  const center = page.getByTestId('company-import-center');
  await expect(center).toBeVisible();
  await center.locator('input[type="file"]').setInputFiles({
    name: 'bulk-301.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });

  await expect(center.getByRole('heading', { name: '字段映射', exact: true })).toBeVisible();
  await expect(center.getByText(/bulk-301\.csv · 301 行 · 2 列/)).toBeVisible();
  await expect(center.getByRole('alert')).toHaveCount(0);
});

test('Batch 17 customer-company import uses bounded uploads and paginated durable history instead of legacy provider-list coupling', async () => {
  const provider = readFileSync(resolve(repoRoot, 'providers/twenty-adapter/server.mjs'), 'utf8');
  const surface = readFileSync(resolve(repoRoot, 'apps/web/src/components/DataTransferSurface.tsx'), 'utf8');
  const center = readFileSync(resolve(repoRoot, 'apps/web/src/components/CompanyImportCenter.tsx'), 'utf8');
  const client = readFileSync(resolve(repoRoot, 'apps/web/src/lib/crmCompanyImportClient.ts'), 'utf8');
  const api = readFileSync(resolve(repoRoot, 'apps/api/company-import-native.mjs'), 'utf8');

  expect(provider).toContain('MAX_CANONICAL_LIST_LIMIT = 10_000');
  expect(surface).toContain("import { CompanyImportCenter } from './CompanyImportCenter'");
  expect(surface).not.toContain('LegacyDataTransferSurface');
  expect(center).toContain('index += 200');
  expect(center).toContain('HISTORY_PAGE_SIZE = 10');
  expect(center).toContain('DETAIL_PAGE_SIZE = 50');
  expect(client).toContain('listCompanyImportJobs(limit = 20, offset = 0)');
  expect(client).toContain('offset?: number');
  expect(api).toContain('const ROW_UPLOAD_LIMIT = 200');
  expect(api).toContain('const MAX_JOB_ROWS = 50_000');
});

test('Batch 17 source keeps bounded server SSO policy and sessionStorage-only access tokens', async () => {
  const bootstrap = readFileSync(resolve(repoRoot, 'infrastructure/keycloak/bootstrap-identity-admin.sh'), 'utf8');
  const client = readFileSync(resolve(repoRoot, 'apps/web/src/lib/gbapClient.ts'), 'utf8');
  const silent = readFileSync(resolve(repoRoot, 'apps/web/src/lib/silentOidcRecovery.ts'), 'utf8');
  expect(bootstrap).toContain('ssoSessionIdleTimeout=604800');
  expect(bootstrap).toContain('ssoSessionMaxLifespan=2592000');
  expect(bootstrap).toContain('ssoSessionIdleTimeoutRememberMe=2592000');
  expect(bootstrap).toContain('ssoSessionMaxLifespanRememberMe=7776000');
  expect(client).toContain('90 * 24 * 60 * 60 * 1000');
  expect(client).toContain('sessionStorage.setItem(TOKEN_KEY');
  expect(client).not.toContain('localStorage.setItem(TOKEN_KEY');
  expect(silent).toContain("url.searchParams.set('prompt', 'none')");
});
