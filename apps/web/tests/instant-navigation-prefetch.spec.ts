import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const root = new URL('../', import.meta.url);
async function source(relativePath: string) { return readFile(new URL(relativePath, root), 'utf8'); }

test('instant navigation prefetch and global search use the governed shared query cache', async () => {
  const cache = await source('src/lib/queryCache.ts');
  const entities = await source('src/lib/crmEntityQueries.ts');
  const app = await source('src/App.tsx');
  const search = await source('src/components/GlobalSearchResults.tsx');
  const views = await source('src/components/SavedViewsSurface.tsx');
  const transfer = await source('src/components/DataTransferSurface.tsx');
  const companyImport = await source('src/components/CompanyImportCenter.tsx');
  const recycle = await source('src/components/RecycleBinSurface.tsx');

  expect(cache).toContain('export async function prefetchGbapQuery');
  expect(cache).toContain('export function invalidateGbapQuery');
  expect(cache).toContain('if (fresh) return entry.data');
  expect(entities).toContain('export async function prefetchCrmSurface');
  expect(entities).toContain("page === 'companies'");
  expect(entities).toContain('export function invalidateCrmEntities');
  expect(app).toContain('void prefetchCrmSurface(session');
  expect(app).toContain('onMouseEnter={onPrefetch}');
  expect(app).toContain('onFocus={onPrefetch}');
  expect(app).toContain('<GlobalSearchResults session={session}');

  expect(search).toContain('useCrmAccountsQuery(session, active)');
  expect(search).toContain('useCrmContactsQuery(session, active)');
  expect(search).toContain('useCrmOpportunitiesQuery(session, active)');
  expect(search).toContain('useCrmTasksQuery(session, active)');
  expect(search).toContain('useCrmNotesQuery(session, active)');
  expect(search).toContain('useCrmFilesQuery(session, active)');
  expect(search).not.toContain('globalSearch(');

  expect(views).toContain('useGbapQuery<CrmSavedView[]>');
  expect(views).toContain("actorQueryKey(actorKey, 'crm', 'saved-views')");
  expect(views).not.toContain('useEffect(() => { void load(); }');

  expect(transfer).toContain("invalidateCrmEntities(session, ['accounts', 'customer-intelligence', 'company-research-insights'])");
  expect(transfer).toContain("void prefetchCrmSurface(session, 'companies')");
  expect(transfer).toContain('<CompanyImportCenter session={session} onDataChanged={handleDataChanged} />');
  expect(companyImport).toContain('onDataChanged?.();');
  expect(companyImport).toContain('listCompanyImportJobs');
  expect(companyImport).toContain('getCompanyImportJob');
  expect(recycle).toContain("invalidateCrmEntities(session, ['files'])");
  expect(recycle).toContain("objectKey === 'task' || objectKey === 'note'");
});
