import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csvCell } from './csvCell.ts';

test('CSV exports neutralize formulas including whitespace and control prefixes', () => {
  for (const text of ['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)', '\t=1+1', '\uFEFF=1+1', '  =1+1']) {
    assert.equal(csvCell(text), `'${text}`);
  }
  assert.equal(csvCell('=HYPERLINK("https://example.com")'), '"\'=HYPERLINK(""https://example.com"")"');
});

test('CSV exports preserve numeric data, Chinese text, quotes and line breaks', () => {
  assert.equal(csvCell(-123.5), '-123.5'); assert.equal(csvCell('-1.5e-3'), '-1.5e-3');
  assert.equal(csvCell('客户资料'), '客户资料'); assert.equal(csvCell(null), '');
  assert.equal(csvCell('one,"two"\nthree'), '"one,""two""\nthree"');
});
