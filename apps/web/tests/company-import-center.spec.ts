import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../../..');

function source(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

test('data transfer exposes one customer-company import product surface', () => {
  const transfer = source('apps/web/src/components/DataTransferSurface.tsx');
  const center = source('apps/web/src/components/CompanyImportCenter.tsx');

  expect(transfer).toContain("import { CompanyImportCenter } from './CompanyImportCenter'");
  expect(transfer).toContain('<CompanyImportCenter');
  expect(transfer).not.toContain('ResearchIntakePreviewSurface');
  expect(transfer).not.toContain('ResearchImportHistorySurface');
  expect(transfer).not.toContain('LegacyDataTransferSurface');

  expect(center).toContain('客户公司数据导入');
  expect(center).toContain("const STEPS = ['上传文件', '字段映射', '匹配规则', '数据预检', '确认导入', '导入完成']");
  expect(center).toContain('开始导入 ${job.rowCount.toLocaleString()} 条客户公司数据');
  expect(center).toContain('客户公司导入记录');
});

test('company import is field-catalog driven instead of frozen to one country or 75 columns', () => {
  const catalog = source('apps/web/src/lib/crmCompanyImportCatalog.ts');
  const center = source('apps/web/src/components/CompanyImportCenter.tsx');

  expect(catalog).toContain("country: '__registrationCountry'");
  expect(catalog).toContain("registrationType: '__registrationType'");
  expect(catalog).toContain("registrationId: '__registrationId'");
  expect(catalog).toContain('detectCompanyImportPreset');
  expect(catalog).toContain('GBAP 厄瓜多尔客户研究 v46');
  expect(center).toContain('导入器不绑定 TOP500，也不绑定固定字段数量');
  expect(center).toContain('支持当前 Ecuador v46，也支持列名和字段数量不同的新客户公司 CSV');
});

test('company import uses durable chunked jobs with explicit preflight and background execution', () => {
  const center = source('apps/web/src/components/CompanyImportCenter.tsx');
  const api = source('apps/api/company-import-native.mjs');

  expect(center).toContain('index += 200');
  expect(center).toContain('preflightCompanyImportJob');
  expect(center).toContain('startCompanyImportJob');
  expect(center).toContain('关闭当前页面也不会取消任务');
  expect(center).toContain('最高 50,000 行');

  expect(api).toContain('const ROW_UPLOAD_LIMIT = 200');
  expect(api).toContain('const EXECUTION_CHUNK_SIZE = 25');
  expect(api).toContain('const MAX_JOB_ROWS = 50_000');
  expect(api).toContain('crm_company_import_job');
  expect(api).toContain('crm_company_import_row');
  expect(api).toContain("setImmediate(() => { void runImportJob");
  expect(api).toContain("job.update_policy === 'FILL_BLANK'");
  expect(api).toContain('PROTECTED_FIELDS');
});

test('failed rows are explicit retry work instead of an in-process infinite retry loop', () => {
  const api = source('apps/api/company-import-native.mjs');

  expect(api).toContain("status='READY' ORDER BY row_number LIMIT ?");
  expect(api).not.toContain("status IN ('READY','FAILED') ORDER BY row_number");
  expect(api).toContain("status='READY',error_code=NULL WHERE job_id=? AND status IN ('FAILED','RUNNING')");
  expect(api).toContain("UPDATE crm_company_import_row SET status='READY'");
  expect(api).toContain("UPDATE crm_company_import_job\nSET status='PARTIAL_FAILED'");
});

test('legacy customer migration remains fail closed when exact coverage is unsafe', () => {
  const api = source('apps/api/company-import-native.mjs');

  expect(api).toContain('fullLegacyCoverageRequired');
  expect(api).toContain('legacyCoverageUnsafe');
  expect(api).toContain("reason = 'unique_exact_name_adoption'");
  expect(api).toContain("reason = 'ambiguous_exact_name_match'");
  expect(api).toContain('compatibleFingerprint');
  expect(api).toContain('canonicalAccountCount');
});

test('import history is real job history with detail pagination and failed-row export', () => {
  const center = source('apps/web/src/components/CompanyImportCenter.tsx');
  const client = source('apps/web/src/lib/crmCompanyImportClient.ts');

  expect(center).toContain('只显示真实持久化 Import Job');
  expect(center).toContain('data-testid="company-import-history-detail"');
  expect(center).toContain('downloadFailedRows');
  expect(center).toContain('下载失败数据');
  expect(center).toContain('loadHistoryDetail');
  expect(center).toContain('DETAIL_PAGE_SIZE = 50');
  expect(client).toContain('offset?: number');
  expect(client).toContain('status?: string');
});
