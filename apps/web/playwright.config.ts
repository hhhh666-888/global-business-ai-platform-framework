import { defineConfig, devices } from '@playwright/test';

const webTestPort = Number(process.env.WEB_TEST_PORT ?? '8080');
const webTestBaseUrl = `http://127.0.0.1:${webTestPort}`;
const chromiumExecutablePath = process.env.GBAP_CHROMIUM_EXECUTABLE_PATH?.trim();
const mailOnlyAcceptance = String(process.env.STAGE3_7_MAIL_ONLY ?? '').trim().toLowerCase() === 'true';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  // The focused mail suite shares one local web server and exercises many mocked
  // navigation/download/dialog flows. Serializing this affected suite prevents
  // cross-worker navigation aborts without slowing unrelated browser acceptance.
  workers: mailOnlyAcceptance ? 1 : undefined,
  use: {
    baseURL: webTestBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : undefined,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile-chromium', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'node server.mjs',
    env: { WEB_ROOT: 'dist', PORT: String(webTestPort) },
    port: webTestPort,
    reuseExistingServer: true,
  },
});
