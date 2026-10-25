const GATEWAY_ORIGIN = window.location.origin;
const OIDC_BASE = `${GATEWAY_ORIGIN}/realms/gbap/protocol/openid-connect`;
const CLIENT_ID = 'gbap-web';
const REDIRECT_URI = `${GATEWAY_ORIGIN}/substrate.html`;
// All legacy console call sites include `/api`; keep one prefix through the gateway.
const API_BASE = GATEWAY_ORIGIN;

const state = {
  tokens: JSON.parse(sessionStorage.getItem('gbap.tokens') ?? 'null'),
  me: null,
};

const $ = (id) => document.getElementById(id);
const output = $('output');
const providersEl = $('providers');
const adminControls = $('adminControls');
const accessMessage = $('accessMessage');

function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256(text) {
  const input = new TextEncoder().encode(text);
  if (input.length > 0x1fffffff) throw new Error('SHA-256 input is too large');
  const initial = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const constants = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const rotateRight = (value, bits) => (value >>> bits) | (value << (32 - bits));
  const message = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64);
  message.set(input); message[input.length] = 0x80;
  const bitLength = input.length * 8;
  message[message.length - 4] = bitLength >>> 24; message[message.length - 3] = bitLength >>> 16;
  message[message.length - 2] = bitLength >>> 8; message[message.length - 1] = bitLength;
  const hash = new Uint32Array(initial); const words = new Uint32Array(64);
  for (let offset = 0; offset < message.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) { const j = offset + i * 4; words[i] = (message[j] << 24) | (message[j + 1] << 16) | (message[j + 2] << 8) | message[j + 3]; }
    for (let i = 16; i < 64; i += 1) { const s0 = rotateRight(words[i - 15], 7) ^ rotateRight(words[i - 15], 18) ^ (words[i - 15] >>> 3); const s1 = rotateRight(words[i - 2], 17) ^ rotateRight(words[i - 2], 19) ^ (words[i - 2] >>> 10); words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0; }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i += 1) { const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25); const choice = (e & f) ^ (~e & g); const temp1 = (h + s1 + choice + constants[i] + words[i]) >>> 0; const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22); const majority = (a & b) ^ (a & c) ^ (b & c); const temp2 = (s0 + majority) >>> 0; h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0; }
    hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0; hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0; hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0; hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0;
  }
  const output = new Uint8Array(32);
  for (let i = 0; i < hash.length; i += 1) { output[i * 4] = hash[i] >>> 24; output[i * 4 + 1] = hash[i] >>> 16; output[i * 4 + 2] = hash[i] >>> 8; output[i * 4 + 3] = hash[i]; }
  return output;
}

function randomVerifier() {
  return base64url(crypto.getRandomValues(new Uint8Array(64)));
}

async function login() {
  const verifier = randomVerifier();
  const challenge = base64url(await sha256(verifier));
  const oauthState = base64url(crypto.getRandomValues(new Uint8Array(32)));
  sessionStorage.setItem('gbap.pkce.verifier', verifier);
  sessionStorage.setItem('gbap.oauth.state', oauthState);
  const url = new URL(`${OIDC_BASE}/auth`);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', oauthState);
  location.assign(url.toString());
}

async function exchangeCode() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (!code) return;
  const returnedState = params.get('state');
  const expectedState = sessionStorage.getItem('gbap.oauth.state');
  const verifier = sessionStorage.getItem('gbap.pkce.verifier');
  if (!returnedState || returnedState !== expectedState || !verifier) throw new Error('OAuth state/PKCE validation failed');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code,
    code_verifier: verifier,
  });
  const response = await fetch(`${OIDC_BASE}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`);
  state.tokens = await response.json();
  sessionStorage.setItem('gbap.tokens', JSON.stringify(state.tokens));
  sessionStorage.removeItem('gbap.pkce.verifier');
  sessionStorage.removeItem('gbap.oauth.state');
  history.replaceState({}, document.title, '/substrate.html');
}

function logout() {
  const idToken = state.tokens?.id_token;
  sessionStorage.clear();
  state.tokens = null;
  const url = new URL(`${OIDC_BASE}/logout`);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('post_logout_redirect_uri', REDIRECT_URI);
  if (idToken) url.searchParams.set('id_token_hint', idToken);
  location.assign(url.toString());
}

async function api(path, options = {}) {
  if (!state.tokens?.access_token) throw new Error('请先登录');
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${state.tokens.access_token}`,
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error ?? `HTTP ${response.status}`), { body, status: response.status });
  return body;
}

function show(value) {
  if (output) output.textContent = JSON.stringify(value, null, 2);
}

function setAdminAccess(enabled, message) {
  if (adminControls) adminControls.hidden = !enabled;
  if (accessMessage) accessMessage.textContent = message;
}

function healthBadge(health) {
  if (!health) return '<span class="badge">UNKNOWN</span>';
  const good = health.status === 'HEALTHY';
  return `<span class="badge ${good ? 'ok' : 'bad'}">${health.status}</span>`;
}

async function refresh() {
  if (!state.tokens?.access_token) {
    $('identity').textContent = '未登录';
    $('login').hidden = false;
    $('logout').hidden = true;
    setAdminAccess(false, '请使用超级管理员账号登录后进入平台管理控制台。');
    return;
  }
  try {
    state.me = await api('/api/me');
    $('identity').textContent = `${state.me.username} · ${state.me.roles.join(', ')}`;
    $('login').hidden = true;
    $('logout').hidden = false;
    const isAdmin = Array.isArray(state.me.roles) && state.me.roles.includes('substrate-admin');
    if (!isAdmin) {
      setAdminAccess(false, '当前账号没有平台管理权限。请返回 GBAP CRM 使用已授权的业务功能。');
      return;
    }
    setAdminAccess(true, '超级管理员权限已验证。以下为平台底座管理控制台。');
    const data = await api('/api/providers');
    if (data.providers.length === 0) {
      providersEl.innerHTML = '<span class="muted">当前没有 Provider。GBAP 底座仍可运行。</span>';
      return;
    }
    providersEl.innerHTML = `<table><thead><tr><th>ID</th><th>Capability</th><th>Version</th><th>Status</th><th>Health</th><th>Replacement</th></tr></thead><tbody>${data.providers.map((provider) => `
      <tr>
        <td>${provider.id}</td>
        <td>${provider.capabilities.map((c) => c.name).join(', ')}</td>
        <td>${provider.version}</td>
        <td>${provider.enabled ? 'ENABLED' : 'DISABLED'}</td>
        <td>${healthBadge(provider.health)}</td>
        <td>${provider.replacementClass}/${provider.replacementEvidence}</td>
      </tr>`).join('')}</tbody></table>`;
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem('gbap.tokens');
      state.tokens = null;
      setAdminAccess(false, '登录已失效，请重新登录。');
    }
    throw error;
  }
}

async function registerReference() {
  return api('/api/providers', {
    method: 'POST',
    body: JSON.stringify({
      id: 'reference-echo',
      component: 'gbap-reference-provider',
      version: '0.1.0',
      integrationMode: 'HEADLESS_PROVIDER',
      endpoint: 'http://reference-provider:8090',
      environmentScope: 'local',
      lifecycleOwner: 'GBAP_MANAGED',
      replacementClass: 'R1',
      replacementEvidence: 'E0',
      egressAllowlist: ['reference-provider'],
      timeoutMs: 2000,
      retryCount: 0,
      failureMode: 'DEGRADE',
      capabilities: [{ name: 'demo.echo', priority: 100 }],
    }),
  });
}

async function setProviderEnabled(enabled) {
  return api('/api/providers/reference-echo/status', {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

async function removeProvider() {
  return api('/api/providers/reference-echo', { method: 'DELETE' });
}

async function invokeEcho() {
  return api('/api/capabilities/demo.echo/invoke', {
    method: 'POST',
    body: JSON.stringify({ payload: { message: 'GBAP substrate is alive', at: new Date().toISOString() } }),
  });
}

async function loadAudit() {
  const data = await api('/api/audit');
  $('auditOutput').textContent = JSON.stringify(data, null, 2);
  return { auditEvents: data.events.length };
}

async function run(action) {
  try {
    const result = await action();
    show(result);
    await refresh();
  } catch (error) {
    show({ error: error.message, detail: error.body ?? null });
  }
}

$('login').addEventListener('click', login);
$('logout').addEventListener('click', logout);
$('refresh').addEventListener('click', () => run(async () => { await refresh(); return { refreshed: true }; }));
$('register').addEventListener('click', () => run(registerReference));
$('invoke').addEventListener('click', () => run(invokeEcho));
$('disable').addEventListener('click', () => run(() => setProviderEnabled(false)));
$('enable').addEventListener('click', () => run(() => setProviderEnabled(true)));
$('remove').addEventListener('click', () => run(removeProvider));
$('audit').addEventListener('click', () => run(loadAudit));

exchangeCode().then(refresh).catch((error) => show({ error: error.message }));
