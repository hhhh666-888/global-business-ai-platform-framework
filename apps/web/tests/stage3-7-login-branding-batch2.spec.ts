import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../../..');
const cssPath = resolve(repoRoot, 'infrastructure/keycloak/themes/gbap/login/resources/css/login.css');
const messagesPath = resolve(repoRoot, 'infrastructure/keycloak/themes/gbap/login/messages/messages_en.properties');

function decodeJavaPropertiesUnicode(value: string) {
  return value.replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function property(source: string, name: string) {
  const line = source.split(/\r?\n/).find((candidate) => candidate.startsWith(`${name}=`));
  if (!line) throw new Error(`Missing Keycloak message property: ${name}`);
  return line.slice(name.length + 1);
}

test('Stage 3.7 Batch 2 renders an encoding-safe bilingual brand with brand-left login-right layout', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop login branding acceptance');

  const css = readFileSync(cssPath, 'utf8');
  const messages = readFileSync(messagesPath, 'ascii');
  const productName = '佛光全球业务智能平台';
  const englishName = 'GBAP Global Business AI Platform';

  const decodedTitle = decodeJavaPropertiesUnicode(property(messages, 'loginTitle'));
  const decodedTitleHtml = decodeJavaPropertiesUnicode(property(messages, 'loginTitleHtml'));
  expect(decodedTitle).toBe(`${productName} | ${englishName}`);
  expect(decodedTitleHtml).toContain(`<span class="gbap-login-brand-cn">${productName}</span>`);
  expect(decodedTitleHtml).toContain(`<span class="gbap-login-brand-en">${englishName}</span>`);
  expect(decodedTitleHtml).not.toContain('?');

  await page.setContent(`
    <!doctype html>
    <html>
      <head><style>${css}</style></head>
      <body id="keycloak-bg">
        <div class="pf-v5-c-login">
          <div class="pf-v5-c-login__container">
            <header id="kc-header" class="pf-v5-c-login__header">
              <div id="kc-header-wrapper" class="pf-v5-c-brand">
                <span class="gbap-login-brand">
                  <span class="gbap-login-brand-cn">${productName}</span>
                  <span class="gbap-login-brand-en">${englishName}</span>
                </span>
              </div>
            </header>
            <main class="pf-v5-c-login__main">
              <div class="pf-v5-c-login__main-header"><h1 id="kc-page-title">登录</h1></div>
              <div class="pf-v5-c-login__main-body">
                <form class="pf-v5-c-form">
                  <label>用户名或邮箱<input class="pf-v5-c-form-control" /></label>
                  <label>密码<input class="pf-v5-c-form-control" type="password" /></label>
                  <button class="pf-v5-c-button pf-m-primary" type="button">登录</button>
                </form>
              </div>
            </main>
          </div>
        </div>
      </body>
    </html>
  `);

  const brand = page.locator('#kc-header');
  const login = page.locator('.pf-v5-c-login__main');
  const brandBox = await brand.boundingBox();
  const loginBox = await login.boundingBox();
  expect(brandBox).not.toBeNull();
  expect(loginBox).not.toBeNull();
  expect((brandBox?.x ?? 0) + (brandBox?.width ?? 0)).toBeLessThan(loginBox?.x ?? 0);
  expect(loginBox?.width ?? 9999).toBeLessThanOrEqual(510);
  await expect(brand.locator('.gbap-login-brand > *')).toHaveCount(2);

  const background = await page.locator('#keycloak-bg').evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(background).toContain('radial-gradient');
  expect(background).toContain('linear-gradient');
  expect(css).toContain('grid-template-areas: "brand login"');
  expect(css).toContain('grid-area: brand');
  expect(css).toContain('grid-area: login');
});

test('Stage 3.7 Batch 2 survives a broken persisted realm title in real Keycloak', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop login branding acceptance');
  const loginUrl = process.env.STAGE3_7_KEYCLOAK_LOGIN_URL;
  test.skip(!loginUrl, 'isolated Keycloak runtime is supplied only by the focused Stage 3.7 CI');

  const productName = '佛光全球业务智能平台';
  const englishName = 'GBAP Global Business AI Platform';

  await page.goto(loginUrl!);

  await expect(page.locator('.gbap-login-brand-cn')).toHaveText(productName);
  await expect(page.locator('.gbap-login-brand-en')).toHaveText(englishName);
  await expect(page.locator('#kc-header-wrapper')).not.toContainText('?');
  await expect(page.locator('#kc-page-title')).toHaveText('登录');
  await expect(page.locator('label[for="username"]')).toContainText('用户名或邮箱');
  await expect(page.locator('label[for="password"]')).toContainText('密码');
  await expect(page.locator('#kc-login')).toHaveText('登录');
  await expect(page).toHaveTitle(`${productName} | ${englishName}`);

  const brandBox = await page.locator('#kc-header').boundingBox();
  const loginBox = await page.locator('.pf-v5-c-login__main').boundingBox();
  expect(brandBox).not.toBeNull();
  expect(loginBox).not.toBeNull();
  expect((brandBox?.x ?? 0) + (brandBox?.width ?? 0)).toBeLessThan(loginBox?.x ?? 0);

  const background = await page.locator('#keycloak-bg').evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(background).toContain('radial-gradient');
  expect(background).toContain('linear-gradient');
});
