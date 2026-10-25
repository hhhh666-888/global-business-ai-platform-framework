import { expect, test } from '@playwright/test';
import { parseCsvDocument, valueOf } from '../src/lib/crmCsvImport';
import {
  ECUADOR_TOP500_V46_HEADERS,
  buildResearchCompanyPatch,
  protectedOperationalHeadersPresent,
  recognizeResearchSchema,
  validateEcuadorTop500Rows,
  type ResearchRow,
} from '../src/lib/crmResearchIntake';

function csvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function makeCsv(values: Partial<Record<(typeof ECUADOR_TOP500_V46_HEADERS)[number], string>>) {
  const header = ECUADOR_TOP500_V46_HEADERS.map(csvCell).join(',');
  const row = ECUADOR_TOP500_V46_HEADERS.map((name) => csvCell(values[name] ?? '')).join(',');
  return `${header}\n${row}\n`;
}

function toResearchRow(csv: ReturnType<typeof parseCsvDocument>): ResearchRow {
  return Object.fromEntries(
    ECUADOR_TOP500_V46_HEADERS.map((header) => [header, valueOf(csv.rows[0], [header])]),
  ) as ResearchRow;
}

test('legacy CSV parser preserves the frozen TOP500 v46 schema for Research Intake preview', () => {
  const parsed = parseCsvDocument(makeCsv({
    '开发排名': '1',
    'GBAP价值评分': '96',
    '销售状态': '未开发',
    '当前项目阶段': '未接触',
    '销售负责人': '模板占位',
    '数据核验等级': 'A+',
    '公司名称': 'Industrial Energy Ecuador S.A.',
    '商业名称': 'Industrial Energy',
    RUC: '0991234567001',
    '私营企业核验': '已核验',
    '官网': 'https://example.com',
    '行业大类': '制造业',
    '公司电话': '+59340000000',
    '公司邮箱': 'info@example.com',
    '2025营收USD': '12500000',
    '员工人数': '320',
  }));

  expect(parsed.headers).toHaveLength(75);
  expect(recognizeResearchSchema(parsed.headers).recognized).toBe(true);

  const research = toResearchRow(parsed);
  expect(validateEcuadorTop500Rows([research])).toMatchObject({ valid: true, rowCount: 1 });

  const company = buildResearchCompanyPatch(research);
  expect(company).toMatchObject({
    displayName: 'Industrial Energy Ecuador S.A.',
    registrationCountry: 'EC',
    registrationType: 'RUC',
    registrationId: '0991234567001',
    researchRank: 1,
    strategicValueScore: 96,
    verificationGrade: 'A+',
  });
  expect(company).not.toHaveProperty('relationshipStatus');
  expect(company).not.toHaveProperty('accountOwnerUserId');
  expect(protectedOperationalHeadersPresent(research)).toEqual(['销售状态', '当前项目阶段', '销售负责人']);
});
