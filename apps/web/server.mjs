import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
// Public addresses only. Never serialize process.env or credentials to the browser.
function runtimeConfigScript(value) {
  let crmManagementUrl = '';
  if (String(value ?? '').trim()) {
    try {
      const url = new URL(String(value).trim());
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash) crmManagementUrl = url.toString();
    } catch { /* Invalid configuration does not become an executable URL. */ }
  }
  return `window.__GBAP_RUNTIME__ = Object.freeze(${JSON.stringify({ crmManagementUrl }).replaceAll('<', '\\u003c')});`;
}

const PORT = Number(process.env.PORT ?? '8080');
const HOST = '0.0.0.0';
const ROOT = resolve(process.env.WEB_ROOT ?? '/app/dist');

const PROXY_TARGETS = [
  { prefix: '/.well-known/oauth-protected-resource', host: 'api', port: 8081 },
  { prefix: '/api/identity/', host: 'identity-admin', port: 8083 },
  { prefix: '/api/healthz', host: 'api', port: 8081, path: '/healthz' },
  { prefix: '/api/', host: 'api', port: 8081 },
  { prefix: '/realms/', host: 'keycloak', port: 8080 },
  { prefix: '/resources/', host: 'keycloak', port: 8080 },
];

const GATEWAY_ORIGINS = new Map([
  ['localhost:8080', { host: 'localhost:8080', proto: 'http', port: '8080' }],
  ['192.0.2.10:3030', { host: '192.0.2.10:3030', proto: 'http', port: '3030' }],
  ['portal.example.com', { host: 'portal.example.com', proto: 'https', port: '443' }],
]);

function registerAdditionalGatewayOrigin(value) {
  const candidate = String(value ?? '').trim();
  if (!candidate) return;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`invalid_additional_gateway_origin:${candidate}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`invalid_additional_gateway_origin:${candidate}`);
  }
  const host = parsed.host.toLowerCase();
  const proto = parsed.protocol.slice(0, -1);
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
  GATEWAY_ORIGINS.set(host, { host, proto, port });
}

for (const origin of String(process.env.GBAP_ADDITIONAL_GATEWAY_ORIGINS ?? '').split(',')) {
  registerAdditionalGatewayOrigin(origin);
}

const HOP_BY_HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
]);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function gatewayOrigin(req) {
  const requestedHost = String(req.headers.host ?? '').toLowerCase();
  return GATEWAY_ORIGINS.get(requestedHost) ?? null;
}

function proxyRequest(req, res, target) {
  const origin = gatewayOrigin(req);
  if (!origin) {
    res.writeHead(421, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ error: 'unsupported_gateway_origin' }));
    return;
  }

  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined && !HOP_BY_HOP_HEADERS.has(name.toLowerCase())) headers[name] = value;
  }
  headers.host = origin.host;
  headers['x-forwarded-host'] = origin.host;
  headers['x-forwarded-proto'] = origin.proto;
  headers['x-forwarded-port'] = origin.port;
  headers['x-forwarded-for'] = req.socket.remoteAddress ?? '';

  const upstream = http.request({
    host: target.host,
    port: target.port,
    method: req.method,
    path: target.path ?? req.url,
    headers,
  }, (upstreamResponse) => {
    const responseHeaders = {};
    for (const [name, value] of Object.entries(upstreamResponse.headers)) {
      if (value !== undefined && !HOP_BY_HOP_HEADERS.has(name.toLowerCase())) responseHeaders[name] = value;
    }
    res.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);
    upstreamResponse.pipe(res);
  });

  upstream.setTimeout(30_000, () => upstream.destroy(new Error('upstream_timeout')));
  upstream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ error: 'gateway_upstream_unavailable' }));
    } else {
      res.destroy();
    }
  });
  req.pipe(upstream);
}

function applyAppPolicy(res, embedded = false) {
  res.setHeader('content-security-policy', `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob:; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors ${embedded ? "'self'" : "'none'"}`);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  let url;
  try { url = new URL(req.url ?? '/', 'http://gateway.local'); } catch { res.writeHead(400); return res.end('Bad request'); }
  if (url.pathname === '/runtime-config.js' && ['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(req.method === 'HEAD' ? undefined : runtimeConfigScript(process.env.GBAP_CRM_MANAGEMENT_URL));
  }
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ status: 'ok', service: 'gbap-web', surface: 'crm-knowledge-mcp' }));
  }

  const target = PROXY_TARGETS.find((item) => url.pathname.startsWith(item.prefix));
  if (target) return proxyRequest(req, res, target);

  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { allow: 'GET, HEAD' }); return res.end('Method not allowed'); }
  let decodedPath;
  try { decodedPath = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end('Bad request'); }
  if (decodedPath.includes('\\') || decodedPath.includes('\0') || decodedPath.split('/').some(part => part.startsWith('.'))) { res.writeHead(404); return res.end('Not found'); }
  const requested = decodedPath === '/' ? '/index.html' : decodedPath;
  const safePath = normalize(requested).replace(/^([.][.][/\\])+/, '');
  const filePath = join(ROOT, safePath);
  if (!filePath.startsWith(`${ROOT}${sep}`)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  try {
    const actualRoot = await realpath(ROOT);
    const actualPath = await realpath(filePath);
    if (!actualPath.startsWith(`${actualRoot}${sep}`)) { res.writeHead(403); return res.end('Forbidden'); }
    const body = await readFile(actualPath);
    if (filePath === join(ROOT, 'index.html')) applyAppPolicy(res);
    if (filePath === join(ROOT, 'preview', 'excel.html')) applyAppPolicy(res, true);
    const cacheControl = filePath.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store';
    res.writeHead(200, { 'content-type': TYPES[extname(filePath)] ?? 'application/octet-stream', 'cache-control': cacheControl });
    return res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    if (extname(decodedPath)) { res.writeHead(404); return res.end('Not found'); }
    try {
      const body = await readFile(join(ROOT, 'index.html'));
      applyAppPolicy(res);
      res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404);
      return res.end('Not found');
    }
  }
});

server.listen(PORT, HOST, () => console.log(JSON.stringify({ event: 'web.started', port: PORT, root: ROOT })));
