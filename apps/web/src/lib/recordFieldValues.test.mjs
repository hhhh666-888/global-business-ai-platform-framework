import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { currencyAmountInput, richTextMarkdown } from './recordFieldValues.ts';

const helpers = new URL('./recordFieldValues.ts', import.meta.url).href;
for (const [zone, summer, winter] of [
  ['UTC', '2026-10-03T03:00', '2026-01-03T03:00'],
  ['Asia/Shanghai', '2026-10-03T11:00', '2026-01-03T11:00'],
  ['America/New_York', '2026-10-02T23:00', '2026-01-02T22:00'],
  ['Europe/Berlin', '2026-10-03T05:00', '2026-01-03T04:00'],
  ['Asia/Kathmandu', '2026-10-03T08:45', '2026-01-03T08:45'],
]) {
  test(`date-time controls preserve the instant in ${zone}, including seasonal offsets`, () => {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { dateTimeLocalValue, dateTimeLocalToIso } from ${JSON.stringify(helpers)};
      for (const [instant, local] of ${JSON.stringify([['2026-10-03T03:00:00.000Z', summer], ['2026-01-03T03:00:00.000Z', winter]])}) {
        assert.equal(dateTimeLocalValue(instant), local);
        assert.equal(dateTimeLocalToIso(local), instant);
      }
      assert.equal(dateTimeLocalValue(null), '');
      assert.equal(dateTimeLocalValue('invalid'), '');
      for (const invalid of ['', 'invalid', '2026-02-30T12:30', '2026-10-03T25:00', '2026-10-03T12:30Z']) assert.equal(dateTimeLocalToIso(invalid), null);
    `], { encoding: 'utf8', env: { ...process.env, TZ: zone } });
    assert.equal(child.status, 0, child.stderr);
  });
}

test('a nonexistent local time is rejected instead of silently moving an appointment', () => {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { dateTimeLocalToIso } from ${JSON.stringify(helpers)};
    assert.equal(dateTimeLocalToIso('2026-03-08T02:30'), null);
    assert.equal(dateTimeLocalToIso('2026-03-08T01:30'), '2026-03-08T06:30:00.000Z');
    assert.equal(dateTimeLocalToIso('2026-03-08T03:30'), '2026-03-08T07:30:00.000Z');
  `], { encoding: 'utf8', env: { ...process.env, TZ: 'America/New_York' } });
  assert.equal(child.status, 0, child.stderr);
});

test('rich text reads the native Markdown composite and legacy plain text safely', () => {
  assert.equal(richTextMarkdown({ markdown: '**企业方案**\n内容', blocknote: 'old blocks' }), '**企业方案**\n内容');
  assert.equal(richTextMarkdown('已有文本'), '已有文本');
  for (const empty of [null, undefined, {}, [], { markdown: 7 }]) assert.equal(richTextMarkdown(empty), '');
});

test('currency distinguishes zero and fractional amounts from absent or invalid amounts', () => {
  assert.equal(currencyAmountInput(0), '0');
  assert.equal(currencyAmountInput('0'), '0');
  assert.equal(currencyAmountInput(1250000), '1.25');
  assert.equal(currencyAmountInput(-1250000), '-1.25');
  for (const empty of [null, undefined, '', NaN, Infinity, 'invalid']) assert.equal(currencyAmountInput(empty), '');
});
