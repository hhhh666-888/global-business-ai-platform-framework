import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT ?? '8091');
const LEGACY_PORT = Number(process.env.TWENTY_ADAPTER_LEGACY_PORT ?? '8092');
const TWENTY_URL = (process.env.TWENTY_URL ?? 'http://twenty-server:3000').replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = Number(process.env.TWENTY_REQUEST_TIMEOUT_MS ?? '5000');

const legacyEnv = { ...process.env, PORT: String(LEGACY_PORT) };
const legacy = spawn(process.execPath, ['server.mjs'], {
  env: legacyEnv,
  stdio: 'inherit',
});
legacy.on('exit', (code, signal) => {
  console.error(JSON.stringify({ event: 'twenty.adapter.legacy_exit', code, signal }));
  process.exit(code ?? 1);
});

async function readBody(req, maxBytes = 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

async function proxyLegacy(req, res, bodyBuffer = null) {
  const body = bodyBuffer ?? await readBody(req);
  const response = await fetch(`http://127.0.0.1:${LEGACY_PORT}${req.url}`, {
    method: req.method,
    headers: {
      'content-type': req.headers['content-type'] ?? 'application/json',
      accept: req.headers.accept ?? 'application/json',
    },
    body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : body,
    signal: AbortSignal.timeout(Math.max(REQUEST_TIMEOUT_MS, 20_000)),
  });
  const responseBody = Buffer.from(await response.arrayBuffer());
  res.writeHead(response.status, {
    'content-type': response.headers.get('content-type') ?? 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(responseBody);
}

async function legacyHealth() {
  const response = await fetch(`http://127.0.0.1:${LEGACY_PORT}/health`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(Math.max(REQUEST_TIMEOUT_MS, 7000)),
  });
  if (!response.ok) throw new Error(`legacy_adapter_unhealthy_${response.status}`);
  return response.json();
}

async function upstreamHealth() {
  const response = await fetch(`${TWENTY_URL}/healthz`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(Math.max(REQUEST_TIMEOUT_MS, 7000)),
  });
  if (!response.ok) throw new Error(`twenty_upstream_unhealthy_${response.status}`);
  return response.json().catch(() => ({ ok: true }));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      const [upstream, legacyStatus] = await Promise.all([upstreamHealth(), legacyHealth()]);
      return sendJson(res, 200, {
        status: 'ok',
        provider: 'twenty',
        upstream,
        legacyStatus,
        crmOnly: true,
      });
    }
    return proxyLegacy(req, res);
  } catch (error) {
    return sendJson(res, 502, {
      error: 'crm_adapter_proxy_unavailable',
      detail: error?.message ?? 'unknown_error',
    });
  }
});

function shutdown(signal) {
  legacy.kill(signal);
  server.close(() => process.exit(0));
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({
    event: 'twenty.adapter.crm_proxy_started',
    port: PORT,
    legacyPort: LEGACY_PORT,
    twentyUrl: TWENTY_URL,
  }));
});
