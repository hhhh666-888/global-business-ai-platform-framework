import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ECUADOR_TOP500_V46_FIELD_MAPPING,
  ECUADOR_TOP500_V46_HEADERS,
  ECUADOR_TOP500_V46_SCHEMA,
  PROTECTED_OPERATIONAL_RESEARCH_HEADERS,
  buildResearchCompanyPatch,
  protectedOperationalHeadersPresent,
  recognizeResearchSchema,
  validateEcuadorTop500Rows,
  type ResearchRow,
} from '../src/lib/crmResearchIntake';
import {
  DEVELOPMENT_STAGES,
  FOLLOW_UP_STATUS_OPTIONS,
} from '../src/lib/crmDevelopmentStage';
import {
  TOP500_V46_FIELD_COUNT,
  TOP500_V46_MODULE_HEADERS,
  assertTop500V46Contract,
} from '../src/lib/crmTop500V46Contract';

const repoRoot = resolve(import.meta.dirname, '../../..');

function source(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

test('TOP500 v46 remains a valid 75-field customer profile preset', () => {
  expect(ECUADOR_TOP500_V46_HEADERS).toHaveLength(75);
  expect(ECUADOR_TOP500_V46_FIELD_MAPPING).toHaveLength(75);
  expect(TOP500_V46_FIELD_COUNT).toBe(75);
  expect(PROTECTED_OPERATIONAL_RESEARCH_HEADERS.size).toBe(7);
  expect(ECUADOR_TOP500_V46_HEADERS.filter((header) => !PROTECTED_OPERATIONAL_RESEARCH_HEADERS.has(header))).toHaveLength(68);
  expect(new Set(ECUADOR_TOP500_V46_HEADERS).size).toBe(75);
  expect(ECUADOR_TOP500_V46_FIELD_MAPPING.map((item) => item.sourceHeader)).toEqual([...ECUADOR_TOP500_V46_HEADERS]);
  expect(TOP500_V46_MODULE_HEADERS).toEqual([...ECUADOR_TOP500_V46_HEADERS]);
  expect(assertTop500V46Contract()).toMatchObject({ ok: true, fieldCount: 75 });
  expect(recognizeResearchSchema(ECUADOR_TOP500_V46_HEADERS)).toEqual({
    recognized: true,
    schemaVersion: ECUADOR_TOP500_V46_SCHEMA,
    missingHeaders: [],
    extraHeaders: [],
    duplicateHeaders: [],
    orderMatches: true,
  });
});

test('follow-up status and development progress use the exact same stage vocabulary', () => {
  expect(FOLLOW_UP_STATUS_OPTIONS).toHaveLength(DEVELOPMENT_STAGES.length);
  expect(FOLLOW_UP_STATUS_OPTIONS.map(([key]) => key)).toEqual(DEVELOPMENT_STAGES.map((stage) => stage.key));
  expect(FOLLOW_UP_STATUS_OPTIONS.map(([, label]) => label)).toEqual(DEVELOPMENT_STAGES.map((stage) => stage.label));
});

test('v46 preset recognition still fails closed for malformed frozen preset files', () => {
  const missing = ECUADOR_TOP500_V46_HEADERS.filter((header) => header !== 'RUC');
  expect(recognizeResearchSchema(missing)).toMatchObject({ recognized: false, schemaVersion: null, missingHeaders: ['RUC'] });

  const extra = [...ECUADOR_TOP500_V46_HEADERS, '任意新增列'];
  expect(recognizeResearchSchema(extra)).toMatchObject({ recognized: false, schemaVersion: null, extraHeaders: ['任意新增列'] });

  const reordered = [...ECUADOR_TOP500_V46_HEADERS];
  [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  expect(recognizeResearchSchema(reordered)).toMatchObject({ recognized: false, orderMatches: false });
});

test('v46 compatibility patch retains stable current company-profile semantics', () => {
  const row: ResearchRow = {
    '开发排名': '1',
    'GBAP价值评分': '94',
    '销售状态': '未开发',
    '当前项目阶段': '未接触',
    '销售负责人': 'research-placeholder',
    '数据核验等级': 'A+',
    '公司名称': 'GBAP Test Ecuador S.A.',
    '商业名称': 'GBAP Test',
    RUC: '0991234567001',
    '私营企业核验': '已核验',
    '官网': 'https://example.com',
    LinkedIn: 'https://www.linkedin.com/company/example',
    '行业大类': '制造业',
    '公司电话': '+593 4 000 0000',
    '公司邮箱': 'sales@example.com',
    '2025营收USD': '12,500,000',
    '员工人数': '320',
  };

  expect(buildResearchCompanyPatch(row)).toMatchObject({
    displayName: 'GBAP Test Ecuador S.A.',
    registrationCountry: 'EC',
    registrationType: 'RUC',
    registrationId: '0991234567001',
    commercialName: 'GBAP Test',
    verificationGrade: 'A+',
    strategicValueScore: 94,
    researchRank: 1,
  });
  expect(protectedOperationalHeadersPresent(row)).toEqual(['销售状态', '当前项目阶段', '销售负责人']);
});

test('v46 research validation rejects duplicate RUC and duplicate rank', () => {
  const rows: ResearchRow[] = [
    { '公司名称': 'Company A', RUC: '0991234567001', '开发排名': '1', 'GBAP价值评分': '91' },
    { '公司名称': 'Company B', RUC: '0991234567001', '开发排名': '1', 'GBAP价值评分': '89' },
  ];
  const result = validateEcuadorTop500Rows(rows);
  expect(result.valid).toBe(false);
  expect(result.issues.map((issue) => issue.code)).toContain('RUC_DUPLICATE');
  expect(result.issues.map((issue) => issue.code)).toContain('RANK_DUPLICATE');
});

test('customer profile can render authoritative mapped values while sales fields remain protected', () => {
  const detail = source('apps/web/src/components/CompanyBasicProfile75Detail.tsx');
  const developmentBoard = source('apps/web/src/components/CompanyDevelopmentBoard.tsx');
  const transfer = source('apps/web/src/components/DataTransferSurface.tsx');
  const queries = source('apps/web/src/lib/crmEntityQueries.ts');

  expect(detail).toContain('authoritativeProfile?.fields');
  expect(detail).toContain('PROTECTED_OPERATIONAL_RESEARCH_HEADERS.has(header)');
  expect(detail).toContain('values[header] = normalizeOverride(authoritative[header])');
  expect(developmentBoard).toContain('function formatNumber(value: string | number | null | undefined');
  expect(transfer).toContain("'company-research-insights'");
  expect(queries).toContain('useCrmCompanyResearchInsightsQuery');
});

test('super-admin company master exposes filtered multi-select bulk soft delete without permanent deletion', () => {
  const table = source('apps/web/src/components/CompanyTop500Table.tsx');
  const companies = source('apps/web/src/components/LegacyCompaniesSurface.tsx');
  const adminApi = source('apps/api/crm-admin-bulk.mjs');
  expect(table).toContain('company-select-filtered');
  expect(table).toContain('company-bulk-delete');
  expect(table).toContain('全选当前筛选结果');
  expect(companies).toContain("bulkDeleteCrmRecordsInChunks('company', ids, 'soft-delete')");
  expect(companies).not.toContain("bulkDeleteCrmRecordsInChunks('company', ids, 'destroy')");
  expect(adminApi).toContain("target_business_type=? AND target_business_id=?");
  expect(adminApi).toContain('runtime_delete_has_gbap_attachments');
  expect(adminApi).toContain("DELETE FROM crm_registration_identity WHERE business_id=?");
});
