import { expect, test } from '@playwright/test';
import { sha256Base64url, sha256Bytes } from '../src/lib/pkce';

// GitHub runners cannot route to the company's 192.0.2.10 address. Map an
// HTTP-only test hostname to the local gateway to exercise the same insecure
// browser context that LAN HTTP uses. Preserve the governed pre-provisioned
// browser path when self-hosted CI supplies one. These LAN-only tests must use
// a direct local connection even when the runner service itself uses a proxy.
const chromiumExecutablePath = process.env.GBAP_CHROMIUM_EXECUTABLE_PATH?.trim();
test.use({
  launchOptions: {
    ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
    args: [
      '--host-resolver-rules=MAP gbap-lan.test 127.0.0.1',
      '--no-proxy-server',
    ],
  },
});

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

test('SHA-256 implementation matches standard and RFC 7636 S256 test vectors', () => {
  expect(hex(sha256Bytes(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  expect(hex(sha256Bytes('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  expect(sha256Base64url('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('HTTP LAN-equivalent login creates a cryptographic S256 PKCE request without SubtleCrypto', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop LAN PKCE acceptance');
  const baseUrl = String(testInfo.project.use.baseURL);
  const lanOrigin = baseUrl.replace('127.0.0.1', 'gbap-lan.test');
  // Observe PKCE storage before the authorization navigation destroys the app
  // document. The identity response is a fixture; no real login is claimed.
  const captured: Record<string, string> = {};
  await page.exposeFunction('__capturePkceFixture', (key: string, value: string) => { captured[key] = value; });
  await page.addInitScript(() => {
    sessionStorage.setItem('gbap.oauth.explicit-logout', '1');
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      original.call(this, key, value);
      if (this === sessionStorage && ['gbap.pkce.verifier', 'gbap.oauth.state'].includes(key)) void (window as any).__capturePkceFixture(key, value);
    };
  });
  await page.route(`${lanOrigin}/realms/gbap/protocol/openid-connect/auth*`, route => route.fulfill({ contentType: 'text/html', body: '<title>Identity boundary fixture</title>' }));
  await page.goto(`${lanOrigin}/`);
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  expect(await page.evaluate(() => typeof crypto.subtle)).toBe('undefined');

  const authorizationRequest = page.waitForRequest((request) => request.url().startsWith(`${lanOrigin}/realms/gbap/protocol/openid-connect/auth`));
  await page.getByTitle('企业登录').click();
  const request = await authorizationRequest;
  const authorizeUrl = new URL(request.url());
  await expect.poll(() => Boolean(captured['gbap.oauth.state'])).toBe(true);
  const verifier = captured['gbap.pkce.verifier'];
  const state = captured['gbap.oauth.state'];

  expect(verifier).toMatch(/^[A-Za-z0-9_-]{86}$/);
  expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(`${lanOrigin}/`);
  expect(authorizeUrl.searchParams.get('state')).toBe(state);
  expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256');
  expect(authorizeUrl.searchParams.get('code_challenge')).toBe(sha256Base64url(verifier!));
});
