import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const root = new URL('../', import.meta.url);

async function source(relativePath: string) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('instant navigation architecture preserves visited surfaces without weakening actor isolation', async () => {
  const app = await source('src/App.tsx');
  const cache = await source('src/lib/queryCache.ts');
  const entities = await source('src/lib/crmEntityQueries.ts');

  const reactImports = app.match(/import \{([^}]+)\} from 'react'/)?.[1] ?? '';
  for (const symbol of ['Activity', 'useEffect', 'useLayoutEffect', 'useRef', 'useState']) expect(reactImports.split(',').map(value => value.trim())).toContain(symbol);
  expect(app).toContain('const [visitedPages, setVisitedPages]');
  expect(app).toContain('key={`${surfaceActorKey}-${key}`}');
  expect(app).toContain("mode={page === key ? 'visible' : 'hidden'}");
  expect(app).toContain('setVisitedPages(new Set<PageKey>([page]))');
  expect(app).toContain('const pageScrollPositions = useRef<Partial<Record<PageKey, number>>>({})');
  expect(app).toContain('pageScrollPositions.current[page] = window.scrollY');
  expect(app).toContain('window.scrollTo(0, restoreY)');
  expect(app).toContain('pageScrollPositions.current = {}');

  // Retired mail surfaces must never return through the persistent-page cache.
  expect(app).toContain('group.items.filter(canAccess).map');
  expect(app).not.toContain("key: 'email'");
  expect(app).not.toContain('EmailSurface');
  expect(app).not.toContain("renderPersistentSurface('email'");

  expect(cache).toContain('export const GBAP_QUERY_STALE_MS = 30_000');
  expect(cache).toContain('if (entry.promise) return entry.promise');
  expect(cache).toContain("window.addEventListener('focus', onFocus)");
  expect(cache).toContain("window.addEventListener('online', onOnline)");
  expect(cache).toContain("return ['gbap', actorSubject ?? 'anonymous', ...parts] as const");

  expect(entities).toContain("return actorQueryKey(actorKey(session), 'crm', entity)");
  for (const key of ['accounts', 'contacts', 'opportunities', 'tasks', 'notes', 'activity', 'files', 'customer-intelligence']) {
    expect(entities).toContain(`crmKey(session, '${key}')`);
  }
  expect(await source('src/components/PeopleSurface.tsx')).toContain('useCrmAccountsQuery');
  expect(await source('src/components/PeopleSurface.tsx')).toContain('useCrmContactsQuery');
  expect(await source('src/components/OpportunitiesSurface.tsx')).toContain('useCrmAccountsQuery');
  expect(await source('src/components/OpportunitiesSurface.tsx')).toContain('useCrmOpportunitiesQuery');
  const companyComposition = [
    await source('src/components/CompaniesSurface.tsx'),
    await source('src/components/CompanyDevelopmentBoard.tsx'),
    await source('src/components/LegacyCompaniesSurface.tsx'),
  ].join('\n');
  expect(companyComposition).toContain('useCrmAccountsQuery');
  expect(companyComposition).toContain('useCrmContactsQuery');
  expect(companyComposition).toContain('useCrmOpportunitiesQuery');
  expect(companyComposition).toContain('useCrmCustomerIntelligenceQuery');
  expect(companyComposition).not.toContain('listAccounts(500)');

  const tasks = await source('src/components/TasksSurface.tsx');
  expect(tasks).toContain('useCrmTasksQuery');
  expect(tasks).toContain('useCrmAccountsQuery');
  expect(tasks).not.toContain('listAccounts()');
  const notes = await source('src/components/NotesSurface.tsx');
  expect(notes).toContain('useCrmNotesQuery');
  expect(notes).toContain('useCrmActivityQuery');
  expect(notes).not.toContain('listAccounts()');
  const workbench = await source('src/components/WorkbenchSurface.tsx');
  expect(workbench).toContain('useCrmOpportunitiesQuery');
  expect(workbench).toContain('useCrmTasksQuery');
  expect(workbench).toContain('useCrmActivityQuery');
  const dashboard = await source('src/components/DashboardSurface.tsx');
  expect(dashboard).toContain('useCrmAccountsQuery');
  expect(dashboard).toContain('useCrmTasksQuery');
  const files = await source('src/components/FilesSurface.tsx');
  expect(files).toContain('useCrmFilesQuery');
  expect(files).toContain('useCrmAccountsQuery');
  expect(files).not.toContain('listAccounts(300)');

  expect(await source('src/components/CalendarSurface.tsx')).toContain('useGbapQuery');
});

test('shared CRM entity cache survives navigation and prevents duplicate entity list loads', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop navigation persistence acceptance');

  let accountListCalls = 0;
  let contactListCalls = 0;
  let opportunityListCalls = 0;
  let taskListCalls = 0;
  let noteListCalls = 0;
  let activityListCalls = 0;
  let filesCalls = 0;
  let intelligenceCalls = 0;

  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'instant-nav-token', id_token: 'instant-nav-id' }));
  });

  await page.route('http://127.0.0.1:8080/api/me', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ subject: 'instant-nav-user', username: 'instant.nav', roles: ['substrate-user'] }) });
  });
  await page.route('http://127.0.0.1:8080/api/crm-native/company-profiles', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profiles: [] }) });
  });
  await page.route('http://127.0.0.1:8080/api/crm-native/customer-intelligence', async (route) => {
    intelligenceCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profiles: [
      { businessId: 'account-1', customerSegment: 'INDUSTRIAL', customerRoles: ['FACTORY'], monthlyConsumptionKwh: 120000 },
    ] }) });
  });
  await page.route('http://127.0.0.1:8080/api/crm-native/opportunity-profiles', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profiles: [] }) });
  });
  await page.route('http://127.0.0.1:8080/api/crm-native/files', async (route) => {
    filesCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [
      { id: 'file-1', fileName: 'instant.pdf', mimeType: 'application/pdf', sizeBytes: 1024, target: { businessType: 'Account', businessId: 'account-1' }, createdBy: 'instant-nav-user', createdAt: '2026-09-14T00:00:00Z' },
    ], maxFileBytes: 314572800 }) });
  });
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.account.list/invoke', async (route) => {
    accountListCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requestId: `accounts-${accountListCalls}`, providerId: 'test-provider', result: { ok: true, records: [
      { businessId: 'account-1', businessType: 'Account', externalId: 'account-ext-1', externalType: 'company', displayName: 'Instant Navigation Customer' },
    ] } }) });
  });
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.contact.list/invoke', async (route) => {
    contactListCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requestId: `contacts-${contactListCalls}`, providerId: 'test-provider', result: { ok: true, records: [
      { businessId: 'contact-1', businessType: 'Contact', externalId: 'contact-ext-1', externalType: 'person', personName: 'Instant Contact', email: 'instant@example.com', accountBusinessId: 'account-1', accountExternalId: 'account-ext-1' },
    ] } }) });
  });
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.v1.opportunity.list/invoke', async (route) => {
    opportunityListCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requestId: `opportunities-${opportunityListCalls}`, providerId: 'test-provider', result: { ok: true, records: [
      { businessId: 'opportunity-1', businessType: 'Opportunity', externalId: 'opportunity-ext-1', externalType: 'opportunity', nameSummary: 'Instant Opportunity', lifecycleState: 'OPEN', accountBusinessId: 'account-1', estimatedValue: 100000, currencyCode: 'USD', pipelineStage: 'NEW', nextStep: null },
    ] } }) });
  });
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.ops.v1.task.list/invoke', async (route) => {
    taskListCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requestId: `tasks-${taskListCalls}`, providerId: 'test-provider', result: { ok: true, records: [
      { businessId: 'task-1', businessType: 'CrmTask', title: 'Instant Task', bodyMarkdown: null, dueAt: null, status: 'TODO', targets: [{ businessType: 'Account', businessId: 'account-1' }], createdAt: null, updatedAt: null },
    ] } }) });
  });
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.ops.v1.note.list/invoke', async (route) => {
    noteListCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requestId: `notes-${noteListCalls}`, providerId: 'test-provider', result: { ok: true, records: [
      { businessId: 'note-1', businessType: 'CrmNote', title: 'Instant Note', bodyMarkdown: null, targets: [{ businessType: 'Account', businessId: 'account-1' }], createdAt: null, updatedAt: null },
    ] } }) });
  });
  await page.route('http://127.0.0.1:8080/api/capabilities/crm.ops.v1.activity.list/invoke', async (route) => {
    activityListCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requestId: `activity-${activityListCalls}`, providerId: 'test-provider', result: { ok: true, records: [
      { businessId: 'task-1', businessType: 'CrmTask', kind: 'TASK', title: 'Instant Task', bodyMarkdown: null, dueAt: null, status: 'TODO', targets: [{ businessType: 'Account', businessId: 'account-1' }], createdAt: null, updatedAt: null },
    ] } }) });
  });

  await page.goto('/');
  const sidebar = page.locator('aside.sidebar');
  await expect.poll(() => opportunityListCalls).toBe(1);
  await expect.poll(() => taskListCalls).toBe(1);
  await expect.poll(() => activityListCalls).toBe(1);

  await sidebar.getByRole('button', { name: '联系人', exact: true }).click();
  const peopleSurface = page.locator('[data-surface="real-contact-wiring"]');
  await expect(peopleSurface).toBeVisible();
  await expect(peopleSurface.getByText('Instant Contact', { exact: true })).toBeVisible();
  await expect.poll(() => contactListCalls).toBe(1);
  await expect.poll(() => accountListCalls).toBe(1);

  await sidebar.getByRole('button', { name: '商机', exact: true }).click();
  const opportunitiesSurface = page.locator('[data-surface="real-opportunity-wiring"]');
  await expect(opportunitiesSurface).toBeVisible();
  await expect(opportunitiesSurface.getByText('Instant Opportunity', { exact: true })).toBeVisible();
  expect(opportunityListCalls).toBe(1);
  expect(accountListCalls).toBe(1);

  await sidebar.getByRole('button', { name: '客户公司', exact: true }).click();
  const companiesSurface = page.locator('[data-surface="real-account-wiring"]');
  await expect(companiesSurface).toBeVisible();
  await expect(companiesSurface.getByText('Instant Navigation Customer', { exact: true })).toBeVisible();
  await expect.poll(() => intelligenceCalls).toBe(1);
  expect(accountListCalls).toBe(1);
  expect(contactListCalls).toBe(1);
  expect(opportunityListCalls).toBe(1);

  await sidebar.getByRole('button', { name: '任务', exact: true }).click();
  const taskSurface = page.locator('[data-surface="real-task-wiring"]');
  await expect(taskSurface).toBeVisible();
  await expect(taskSurface.getByText('Instant Task', { exact: true })).toBeVisible();
  expect(taskListCalls).toBe(1);
  expect(accountListCalls).toBe(1);
  expect(contactListCalls).toBe(1);
  expect(opportunityListCalls).toBe(1);

  await sidebar.getByRole('button', { name: '笔记', exact: true }).click();
  const noteSurface = page.locator('[data-surface="real-note-wiring"]');
  await expect(noteSurface).toBeVisible();
  await expect(noteSurface.getByText('Instant Note', { exact: true })).toBeVisible();
  await expect.poll(() => noteListCalls).toBe(1);
  expect(activityListCalls).toBe(1);
  expect(accountListCalls).toBe(1);
  expect(contactListCalls).toBe(1);
  expect(opportunityListCalls).toBe(1);

  await sidebar.getByRole('button', { name: '文件', exact: true }).click();
  const filesSurface = page.locator('[data-surface="real-files-wiring"]');
  await expect(filesSurface).toBeVisible();
  await expect(filesSurface.getByText('instant.pdf', { exact: true })).toBeVisible();
  await expect.poll(() => filesCalls).toBe(1);
  expect(accountListCalls).toBe(1);
  expect(contactListCalls).toBe(1);
  expect(opportunityListCalls).toBe(1);

  await sidebar.getByRole('button', { name: '设置', exact: true }).click();
  await sidebar.getByRole('button', { name: '联系人', exact: true }).click();
  await expect(peopleSurface).toBeVisible();
  await expect(peopleSurface.getByText('Instant Contact', { exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  expect(contactListCalls).toBe(1);
  expect(accountListCalls).toBe(1);
  expect(opportunityListCalls).toBe(1);
  expect(taskListCalls).toBe(1);
  expect(noteListCalls).toBe(1);
  expect(activityListCalls).toBe(1);
  expect(filesCalls).toBe(1);
});
