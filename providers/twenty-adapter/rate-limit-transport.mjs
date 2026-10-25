const TWENTY_URL = (process.env.TWENTY_URL ?? 'http://twenty-server:3000').replace(/\/$/, '');
const TWENTY_AUTH_ORIGIN = process.env.TWENTY_AUTH_ORIGIN ?? 'http://localhost:3000';
// Propagate this exact module into legacy child processes without assuming the
// adapter is running from Docker's /app path. import.meta.url is stable in the
// production image and in host-side CI/Windows execution, and NODE_OPTIONS
// accepts file: module specifiers for --import.
const PRELOAD_FLAG = `--import=${import.meta.url}`;
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE']);
const INVITED_SIGNUP_TOKEN_TTL_MS = 5 * 60 * 1000;

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

const MAX_RETRIES = boundedInteger(process.env.TWENTY_RATE_LIMIT_MAX_RETRIES, 2, 0, 5);
const FALLBACK_DELAY_MS = boundedInteger(process.env.TWENTY_RATE_LIMIT_FALLBACK_MS, 1100, 100, 10_000);
const MAX_DELAY_MS = boundedInteger(process.env.TWENTY_RATE_LIMIT_MAX_DELAY_MS, 5000, 100, 30_000);
const originalFetch = globalThis.fetch.bind(globalThis);
const invitedSignupCredentials = new Map();

function requestUrl(input) {
  if (typeof input === 'string' || input instanceof URL) return String(input);
  return typeof input?.url === 'string' ? input.url : '';
}

function requestMethod(input, init) {
  const method = init?.method ?? input?.method ?? 'GET';
  return String(method).toUpperCase();
}

function isTwentyUrl(url) {
  return url === TWENTY_URL || url.startsWith(`${TWENTY_URL}/`);
}

function retryDelayMs(response) {
  const retryAfter = response.headers.get('retry-after');
  let delay = Number.NaN;

  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) delay = seconds * 1000;
    else {
      const retryAt = Date.parse(retryAfter);
      if (Number.isFinite(retryAt)) delay = retryAt - Date.now();
    }
  }

  if (!Number.isFinite(delay) || delay <= 0) delay = FALLBACK_DELAY_MS;
  return Math.min(MAX_DELAY_MS, Math.max(100, Math.ceil(delay)));
}

function safePath(url) {
  try { return new URL(url).pathname; }
  catch { return '/'; }
}

function ensureLegacyPreload() {
  const current = process.env.NODE_OPTIONS ?? '';
  if (!current.split(/\s+/).filter(Boolean).includes(PRELOAD_FLAG)) {
    process.env.NODE_OPTIONS = `${current} ${PRELOAD_FLAG}`.trim();
  }
}

function requestJson(init) {
  if (typeof init?.body !== 'string') return null;
  try { return JSON.parse(init.body); }
  catch { return null; }
}

function cleanupInvitedSignupCredentials() {
  const cutoff = Date.now() - INVITED_SIGNUP_TOKEN_TTL_MS;
  for (const [token, value] of invitedSignupCredentials) {
    if (value.createdAt < cutoff) invitedSignupCredentials.delete(token);
  }
}

function isMetadataGraphql(url, method) {
  return method === 'POST' && url === `${TWENTY_URL}/metadata`;
}

function isInvitedSignup(envelope) {
  return typeof envelope?.query === 'string' && /\bsignUpInWorkspace\s*\(/.test(envelope.query);
}

function isLoginTokenExchange(envelope) {
  return typeof envelope?.query === 'string' && /\bgetAuthTokensFromLoginToken\s*\(/.test(envelope.query);
}

async function rememberInvitedSignupToken(response, envelope) {
  if (!response.ok) return;
  const email = String(envelope?.variables?.email ?? '').trim();
  const password = String(envelope?.variables?.password ?? '');
  if (!email || !password) return;
  let body;
  try { body = await response.clone().json(); }
  catch { return; }
  const token = body?.data?.signUpInWorkspace?.loginToken?.token;
  if (typeof token !== 'string' || !token) return;
  invitedSignupCredentials.set(token, { email, password, createdAt: Date.now() });
}

async function canonicalPasswordLoginToken(credentials) {
  const query = `
    mutation GetLoginTokenFromCredentials($email:String!,$password:String!,$origin:String!){
      getLoginTokenFromCredentials(email:$email,password:$password,origin:$origin){loginToken{token expiresAt}}
    }
  `;
  const response = await originalFetch(`${TWENTY_URL}/metadata`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: { email: credentials.email, password: credentials.password, origin: TWENTY_AUTH_ORIGIN } }),
  });
  let body;
  try { body = await response.json(); }
  catch { throw new Error(`twenty_canonical_password_login_invalid_json_${response.status}`); }
  const token = body?.data?.getLoginTokenFromCredentials?.loginToken?.token;
  if (!response.ok || (Array.isArray(body?.errors) && body.errors.length > 0) || typeof token !== 'string' || !token) {
    throw new Error(`twenty_canonical_password_login_failed_${response.status}`);
  }
  return token;
}

async function fetchWithRateLimit(input, init, url, method) {
  if (!isTwentyUrl(url) || !IDEMPOTENT_METHODS.has(method) || MAX_RETRIES === 0) {
    return originalFetch(input, init);
  }

  for (let retry = 0; ; retry += 1) {
    const response = await originalFetch(input, init);
    if (response.status !== 429 || retry >= MAX_RETRIES) return response;

    const delayMs = retryDelayMs(response);
    await response.arrayBuffer().catch(() => {});
    console.warn(JSON.stringify({
      event: 'twenty.adapter.rate_limit_retry',
      method,
      path: safePath(url),
      retry: retry + 1,
      maxRetries: MAX_RETRIES,
      delayMs,
    }));
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

ensureLegacyPreload();

globalThis.fetch = async function rateLimitAwareFetch(input, init) {
  const url = requestUrl(input);
  const method = requestMethod(input, init);
  cleanupInvitedSignupCredentials();

  if (isTwentyUrl(url) && isMetadataGraphql(url, method)) {
    const envelope = requestJson(init);
    if (envelope && isLoginTokenExchange(envelope)) {
      const signupToken = envelope?.variables?.loginToken;
      const credentials = invitedSignupCredentials.get(signupToken);
      if (credentials) {
        invitedSignupCredentials.delete(signupToken);
        const canonicalToken = await canonicalPasswordLoginToken(credentials);
        const canonicalInit = {
          ...init,
          body: JSON.stringify({
            ...envelope,
            variables: { ...envelope.variables, loginToken: canonicalToken },
          }),
        };
        return fetchWithRateLimit(input, canonicalInit, url, method);
      }
    }

    const response = await fetchWithRateLimit(input, init, url, method);
    if (envelope && isInvitedSignup(envelope)) await rememberInvitedSignupToken(response, envelope);
    return response;
  }

  return fetchWithRateLimit(input, init, url, method);
};
