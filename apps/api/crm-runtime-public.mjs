import { createHash } from 'node:crypto';
import { createCrmRuntimeHandler } from './crm-runtime.mjs';

function publicKey(prefix, value) {
  const digest = createHash('sha256').update(String(value)).digest('hex').slice(0, 20);
  return `${prefix}:${digest}`;
}
function rewriteRuntimeKey(value) {
  if (typeof value !== 'string') return value;
  const rules = [
    ['provider-view:', 'view'],
    ['provider-layout:', 'layout'],
    ['provider-tab:', 'tab'],
    ['provider-widget:', 'widget'],
  ];
  for (const [source, target] of rules) if (value.startsWith(source)) return publicKey(target, value);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return publicKey('meta', value);
  return value;
}
function sanitize(value, key = '') {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (typeof value !== 'object') return rewriteRuntimeKey(value);
  const output = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    if (childKey !== 'businessId' && /(?:^id$|Id$|IDs$|Ids$)/.test(childKey)) continue;
    output[childKey] = sanitize(childValue, childKey);
  }
  return output;
}
function metadataRoute(url) {
  return ['/api/crm-runtime/schema', '/api/crm-runtime/views', '/api/crm-runtime/layouts'].includes(url.pathname);
}
function publicMetadataBody(url, body) {
  const output = sanitize(body);
  if (url.pathname === '/api/crm-runtime/schema' && Array.isArray(output?.objects)) {
    output.objects = output.objects.filter((object) => object?.active !== false && object?.system !== true);
  }
  return output;
}
function sendJson(res, status, headers, body) {
  res.writeHead(status, {
    ...headers,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

export function createPublicCrmRuntimeHandler() {
  const inner = createCrmRuntimeHandler();
  return async function publicCrmRuntimeHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (!metadataRoute(url)) return inner(req, res);

    let status = 200;
    let headers = {};
    let bodyText = '';
    const capture = {
      headersSent: false,
      writeHead(nextStatus, nextHeaders = {}) {
        status = nextStatus;
        headers = nextHeaders;
        this.headersSent = true;
        return this;
      },
      end(chunk = '') {
        bodyText += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk ?? '');
        this.headersSent = true;
        return this;
      },
      destroy(error) { throw error; },
    };
    const handled = await inner(req, capture);
    if (!handled) return false;
    let body;
    try { body = bodyText ? JSON.parse(bodyText) : {}; }
    catch { body = { error: 'crm_runtime_invalid_public_json' }; status = 500; }
    sendJson(res, status, headers, publicMetadataBody(url, body));
    return true;
  };
}
