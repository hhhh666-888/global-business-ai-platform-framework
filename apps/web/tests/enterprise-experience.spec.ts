import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function session(page: any, options: { delayedPreference?: boolean; management?: string } = {}) {
  let preference: any = null;
  await page.addInitScript(() => sessionStorage.setItem('gbap.tokens', JSON.stringify({ access_token: 'fixture', id_token: 'fixture' })));
  await page.route('**/runtime-config.js', (route: any) => route.fulfill({ contentType: 'text/javascript', body: `window.__GBAP_RUNTIME__=${JSON.stringify({ crmManagementUrl: options.management ?? '' })}` }));
  await page.route('**/api/**', async (route: any) => {
    const url = new URL(route.request().url());
    let result: any = { profiles: [], events: [], files: [], views: [], records: [], collections: [], jobs: [], objects: [], layouts: [], result: { records: [] } };
    if (url.pathname === '/api/me') result = { subject: 'theme-user', username: 'enterprise.admin', roles: ['substrate-user', 'substrate-admin'] };
    if (url.pathname === '/api/user-preferences/appearance') {
      if (route.request().method() === 'PUT') preference = { value: route.request().postDataJSON() };
      else if (options.delayedPreference) { await new Promise(resolve => setTimeout(resolve, 1200)); result = { preference: { value: { mode: 'dark' } } }; return route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) }); }
      result = { preference };
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
  });
  await page.goto('/');
  await page.locator('aside.sidebar').getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('radio', { name: '暗色', exact: true })).toBeVisible();
}

test('four appearances persist, use keyboard navigation and honor reduced motion', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await session(page);
  const black = page.getByRole('radio', { name: '暗色', exact: true });
  await black.click();
  await expect(black).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'black');
  const background = await page.locator('html').evaluate(element => getComputedStyle(element).getPropertyValue('--fg-bg').trim());
  expect(background).toBe('#080809');
  expect(await page.evaluate(() => localStorage.getItem('gbap.appearance.theme-user'))).toBe('black');
  const duration = await black.evaluate(element => getComputedStyle(element).transitionDuration);
  expect(parseFloat(duration)).toBeLessThan(.002);
  await page.screenshot({ path: `/tmp/gbap-ui-audit/after-black-settings-${info.project.name}.png`, fullPage: false });
  await page.reload();
  await page.locator('aside.sidebar').getByRole('button', { name: '设置', exact: true }).click();
  await expect(black).toHaveAttribute('aria-checked', 'true');
  await black.focus(); await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: '深色', exact: true })).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
  await page.keyboard.press('Home');
  await expect(page.getByRole('radio', { name: '浅色', exact: true })).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});

test('a delayed account preference cannot overwrite a fresh explicit choice', async ({ page }) => {
  await session(page, { delayedPreference: true });
  await page.getByRole('radio', { name: '暗色', exact: true }).click();
  await page.waitForTimeout(1400);
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'black');
});

test('configured advanced management opens its workflow editor URL', async ({ page }) => {
  await session(page, { management: 'https://crm-admin.example/' });
  await page.locator('aside.sidebar').getByRole('button', { name: '业务自动化', exact: true }).click();
  await page.evaluate(() => { window.open = (url) => { (window as any).__openedManagementUrl = String(url); return null; }; });
  await page.getByRole('button', { name: /^管理自动化规则/ }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__openedManagementUrl)).toBe('https://crm-admin.example/objects/workflows');
});

test('custom business objects are usable without exposing another company editor', async ({ page }) => {
  await session(page);
  const field = { fieldKey: 'name', label: '项目名称', type: 'TEXT', active: true, system: false, uiEditable: true, nullable: false, relation: null };
  const project = { objectKey: 'project', objectPluralKey: 'projects', labelSingular: '项目', labelPlural: '企业项目', active: true, system: false, custom: true, uiEditable: true, uiCreatable: true, fields: [field] };
  await page.route('**/api/crm-runtime/schema*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ objects: [project, { ...project, objectKey: 'company', custom: false, labelPlural: '客户公司' }] }) }));
  let records: any[] = [];
  await page.route('**/api/crm-runtime/objects/project/records*', route => {
    if (route.request().method() === 'POST') { records = [{ businessId: 'project-record', values: route.request().postDataJSON().fields }]; return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ record: records[0] }) }); }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ records }) });
  });
  await page.locator('aside.sidebar').getByRole('button', { name: '自定义业务', exact: true }).click();
  await expect(page.locator('.rtw-objects').getByRole('button', { name: '企业项目', exact: true })).toBeVisible();
  await expect(page.locator('.rtw-objects').getByRole('button', { name: '客户公司', exact: true })).toHaveCount(0);
  await expect(page.locator('.rtw-main').getByText('导入 CSV', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '+ 新建', exact: true }).click();
  await page.getByLabel('项目名称 *', { exact: true }).fill('企业项目验收');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.rtw-main')).toContainText('企业项目验收');
  expect(records[0].values.name).toBe('企业项目验收');
  await page.getByRole('button', { name: '+ 新建', exact: true }).click();
  await page.getByLabel('项目名称 *', { exact: true }).fill('=1+1');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.rtw-main')).toContainText('=1+1');
  const downloadReady = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 CSV', exact: true }).click();
  const download = await downloadReady;
  expect(await readFile((await download.path())!, 'utf8')).toContain("project-record,'=1+1");
});


test('business forms keep background controls inert and restore keyboard focus after Escape', async ({ page }) => {
  await session(page);
  await page.locator('aside.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  const trigger = page.getByRole('button', { name: '新建任务', exact: true });
  await trigger.click();
  const form = page.getByRole('dialog', { name: '新建任务', exact: true });
  await expect(form.getByLabel('任务标题', { exact: true })).toBeFocused();
  await page.locator('aside.sidebar').evaluate(element => element.querySelector('button')?.focus());
  expect(await form.evaluate(element => element.contains(document.activeElement))).toBe(true);
  for (let index = 0; index < 14; index++) {
    await page.keyboard.press('Tab');
    expect(await page.locator('aside.sidebar').evaluate(element => element.contains(document.activeElement))).toBe(false);
  }
  const picker = form.getByRole('combobox', { name: '任务关联记录' });
  await picker.focus();
  await expect(picker).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(picker).toHaveAttribute('aria-expanded', 'false');
  await expect(form).toBeVisible();
  await form.getByLabel('任务标题', { exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(form).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test.describe('custom CRM field editing', () => {
  test.use({ timezoneId: 'Asia/Shanghai' });

  async function editableProject(page: any, options: { failedRelation?: boolean; multipleTimes?: boolean } = {}) {
    await session(page);
    const fields: any[] = [
      ['name', '项目名称', 'TEXT'], ['startsAt', '项目开始时间', 'DATE_TIME'],
      ['description', '项目说明', 'RICH_TEXT'], ['budget', '项目预算', 'CURRENCY'],
    ].map(([fieldKey, label, type]) => ({ fieldKey, label, type, active: true, system: false, uiEditable: true, nullable: true, relation: null }));
    if (options.failedRelation) fields.push({ ...fields[0], fieldKey: 'relatedProject', label: '关联项目', type: 'RELATION', relation: { targetObjectKey: 'project' } });
    if (options.multipleTimes) fields.push({ ...fields[0], fieldKey: 'endsAt', label: '项目结束时间', type: 'DATE_TIME' });
    const project = { objectKey: 'project', objectPluralKey: 'projects', labelSingular: '项目', labelPlural: '企业项目', active: true, custom: true, uiEditable: true, uiCreatable: true, fields };
    const record = { businessId: 'field-project', objectKey: 'project', values: { name: '字段验收项目', startsAt: '2026-10-03T03:00:00.000Z', description: { markdown: '**项目方案**\n保留企业内容', blocknote: '[{"type":"paragraph"}]' }, budget: { amountMicros: 0, currencyCode: 'CNY' } } };
    const saved: Record<string, any>[] = [];
    if (options.failedRelation) Object.assign(record.values, { relatedProject: { businessId: 'field-project', objectKey: 'project' } });
    let schemaReads = 0;
    await page.route('**/api/crm-runtime/schema*', (route: any) => {
      if (options.failedRelation && ++schemaReads === 2) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'fixture_unavailable' }) });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ objects: [project] }) });
    });
    await page.route('**/api/crm-runtime/objects/project/records**', (route: any) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === 'PATCH') {
        const patch = route.request().postDataJSON().fields;
        saved.push(patch); Object.assign(record.values, patch);
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ record }) });
      }
      const result = path.endsWith('/context') ? { tasks: [], notes: [], files: [] } : { records: [record] };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
    });
    await page.locator('aside.sidebar').getByRole('button', { name: '自定义业务', exact: true }).click();
    await page.getByRole('row').filter({ hasText: '字段验收项目' }).getByRole('button', { name: '打开', exact: true }).click();
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    return saved;
  }

  test('datetime editor shows local wall time and saves the corresponding instant', async ({ page }) => {
    const saved = await editableProject(page);
    await expect(page.getByLabel('项目开始时间', { exact: true })).toHaveValue('2026-10-03T11:00');
    await page.getByLabel('项目开始时间', { exact: true }).fill('2026-10-03T12:30');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.locator('.rtw-main')).toContainText('记录已保存。');
    expect(saved[0].startsAt).toBe('2026-10-03T04:30:00.000Z');
  });

  test('rich text reads Markdown and writes the native composite with stale blocks cleared', async ({ page }) => {
    const saved = await editableProject(page);
    const description = page.getByLabel('项目说明');
    await expect(description).toHaveAccessibleName('项目说明');
    await expect(description).toHaveValue('**项目方案**\n保留企业内容');
    await description.fill('更新后的企业方案');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.locator('.rtw-main')).toContainText('记录已保存。');
    expect(saved[0].description).toEqual({ markdown: '更新后的企业方案', blocknote: null });
  });

  test('zero currency remains visible and an unrelated edit preserves native content', async ({ page }, info) => {
    const saved = await editableProject(page);
    await expect(page.locator('.rtw-editor').getByPlaceholder('金额', { exact: true })).toHaveValue('0');
    await page.screenshot({ path: `/tmp/gbap-field-editor-after-${info.project.name}.png` });
    await page.getByLabel('项目名称', { exact: true }).fill('仅修改项目名称');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.locator('.rtw-main')).toContainText('记录已保存。');
    expect(saved[0].budget).toEqual({ amountMicros: 0, currencyCode: 'CNY' });
    expect(saved[0].description.blocknote).toBe('[{"type":"paragraph"}]');
    expect(saved[0].startsAt).toBe('2026-10-03T03:00:00.000Z');
  });

  test.describe('daylight-saving boundary', () => {
    test.use({ timezoneId: 'America/New_York' });
    test('a nonexistent appointment cannot submit and a corrected time can', async ({ page }) => {
      const saved = await editableProject(page);
      const startsAt = page.getByLabel('项目开始时间', { exact: true });
      await startsAt.fill('2026-03-08T02:30');
      await expect(startsAt).toHaveValue('2026-03-08T02:30');
      expect(await startsAt.evaluate((element: HTMLInputElement) => element.validity.valid)).toBe(false);
      await page.getByRole('button', { name: '保存', exact: true }).click();
      expect(saved).toHaveLength(0);
      await startsAt.fill('2026-03-08T03:30');
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await expect(page.locator('.rtw-main')).toContainText('记录已保存。');
      expect(saved[0].startsAt).toBe('2026-03-08T07:30:00.000Z');
    });

    test('bulk update blocks nonexistent times and resets validity when the field changes', async ({ page }) => {
      const saved = await editableProject(page, { multipleTimes: true });
      await page.locator('.rtw-editor').getByRole('button', { name: '关闭', exact: true }).click();
      await page.getByRole('row').filter({ hasText: '字段验收项目' }).getByRole('checkbox').check();
      await page.getByLabel('选择批量更新字段', { exact: true }).selectOption('startsAt');
      const startsAt = page.getByLabel('项目开始时间', { exact: true });
      await startsAt.fill('2026-03-08T02:30');
      await page.getByRole('button', { name: '批量更新', exact: true }).click();
      expect(saved).toHaveLength(0);
      await page.getByLabel('选择批量更新字段', { exact: true }).selectOption('endsAt');
      const endsAt = page.getByLabel('项目结束时间', { exact: true });
      await expect(endsAt).toHaveValue('');
      expect(await endsAt.evaluate((element: HTMLInputElement) => element.validity.valid)).toBe(true);
      await endsAt.fill('2026-03-08T03:30');
      await page.getByRole('button', { name: '批量更新', exact: true }).click();
      await expect(page.locator('.rtw-bulk')).toHaveCount(0);
      expect(saved[0]).toEqual({ endsAt: '2026-03-08T07:30:00.000Z' });
    });
  });

  test('relation loading fails safely, retries and preserves the existing relation', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const saved = await editableProject(page, { failedRelation: true });
    await expect(page.getByText('关联记录暂时无法加载，请重试。', { exact: true })).toBeVisible();
    const relation = page.locator('.rtw-editor .rtw-relation-picker select');
    await expect(relation).toBeDisabled();
    await page.getByRole('button', { name: '重新加载关联记录', exact: true }).click();
    await expect(relation).toBeEnabled();
    await expect(relation).toHaveValue('field-project');
    await page.locator('.rtw-editor .rtw-relation-picker input').fill('字段验收');
    await page.locator('.rtw-editor .rtw-relation-picker input').press('Enter');
    expect(saved).toHaveLength(0);
    await expect(page.locator('.rtw-editor')).toBeVisible();
    await page.getByLabel('项目名称', { exact: true }).fill('保留关联的企业项目');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.locator('.rtw-main')).toContainText('记录已保存。');
    expect(saved[0].relatedProject).toEqual({ businessId: 'field-project', objectKey: 'project' });
    await page.getByRole('row').filter({ hasText: '保留关联的企业项目' }).getByRole('checkbox').check();
    await page.getByLabel('选择批量更新字段', { exact: true }).selectOption('relatedProject');
    const bulkSearch = page.locator('.rtw-bulk .rtw-relation-picker input');
    await expect(bulkSearch).toBeEnabled();
    await bulkSearch.fill('企业项目');
    await bulkSearch.press('Enter');
    expect(saved).toHaveLength(1);
    expect(errors).toEqual([]);
  });
});
