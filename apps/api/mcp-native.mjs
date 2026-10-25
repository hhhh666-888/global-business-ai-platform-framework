import { getCachedJwk } from './jwks-cache.mjs';
import { createPublicKey, randomUUID, verify as verifySignature } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { MCP_GATEWAY_VERSION, getMcpTool, listMcpTools, validateMcpArguments } from './mcp-tool-registry.mjs';
import { mcpAuthorizationProfile } from './mcp-authorization.mjs';

const PORT = Number(process.env.PORT ?? '8081');
const DB_PATH = process.env.DB_PATH ?? '/data/substrate.db';
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:8080';
const OIDC_ISSUER = process.env.OIDC_ISSUER ?? 'http://localhost:8082/realms/gbap';
const OIDC_ALLOWED_ISSUERS = new Set((process.env.OIDC_ALLOWED_ISSUERS ?? OIDC_ISSUER).split(',').map((value) => value.trim()).filter(Boolean));
const OIDC_JWKS_URL_INTERNAL = process.env.OIDC_JWKS_URL_INTERNAL ?? 'http://keycloak:8080/realms/gbap/protocol/openid-connect/certs';
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID ?? 'gbap-web';
const INTERNAL_API_BASE = `http://127.0.0.1:${PORT}`;
const MAX_BODY_BYTES = 128 * 1024;
const SUPPORTED_PROTOCOLS = new Set(['2025-03-26', '2025-06-18', '2025-11-25']);
const ALLOWED_ORIGINS = new Set((process.env.MCP_ALLOWED_ORIGINS ?? CORS_ORIGIN).split(',').map(value => value.trim()).filter(Boolean));
const DEFAULT_PROTOCOL = '2025-11-25';

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 5000;');

function nowIso() { return new Date().toISOString(); }
function headers(protocolVersion = null, origin = null) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': ALLOWED_ORIGINS.has(origin) ? origin : CORS_ORIGIN.split(',')[0].trim(),
    'vary': 'Origin',
    'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, x-gbap-organization, x-gbap-workspace',
    'access-control-allow-methods': 'POST,OPTIONS',
    ...(protocolVersion ? { 'MCP-Protocol-Version': protocolVersion } : {}),
  };
}
function sendJson(res, status, body, protocolVersion = null) {
  res.writeHead(status, headers(protocolVersion, res.req?.headers.origin));
  res.end(status === 204 || status === 202 ? '' : JSON.stringify(body));
}
function rpcResult(res, id, result, protocolVersion) {
  sendJson(res, 200, { jsonrpc: '2.0', id, result }, protocolVersion);
}
function rpcError(res, id, code, message, status = 200, protocolVersion = null) {
  sendJson(res, status, { jsonrpc: '2.0', id: id ?? null, error: { code, message } }, protocolVersion);
}
function httpError(message, status = 400) {
  const error = new Error(message);
  error.httpStatus = status;
  return error;
}
async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw httpError('request_body_too_large', 413);
    chunks.push(chunk);
  }
  if (!chunks.length) throw httpError('empty_request_body', 400);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw httpError('invalid_json', 400); }
}
function decodeSegment(segment) {
  const pad = segment.length % 4 === 0 ? '' : '='.repeat(4 - (segment.length % 4));
  return Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}
async function getJwk(kid) { return getCachedJwk(kid, OIDC_JWKS_URL_INTERNAL); }
async function authenticate(req, requiredAudience = null) {
  const authorization = req.headers.authorization ?? '';
  if (!authorization.startsWith('Bearer ')) throw httpError('missing_bearer_token', 401);
  const parts = authorization.slice(7).split('.');
  if (parts.length !== 3) throw httpError('invalid_jwt', 401);
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  let headerJson;
  let claims;
  try {
    headerJson = JSON.parse(decodeSegment(encodedHeader).toString('utf8'));
    claims = JSON.parse(decodeSegment(encodedPayload).toString('utf8'));
  } catch {
    throw httpError('invalid_jwt', 401);
  }
  if (headerJson.alg !== 'RS256' || typeof headerJson.kid !== 'string') throw httpError('unsupported_jwt', 401);
  const publicKey = createPublicKey({ key: await getJwk(headerJson.kid), format: 'jwk' });
  if (!verifySignature('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), publicKey, decodeSegment(encodedSignature))) {
    throw httpError('invalid_signature', 401);
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= now) throw httpError('token_expired', 401);
  if (claims.nbf && claims.nbf > now + 30) throw httpError('token_not_yet_valid', 401);
  if (!OIDC_ALLOWED_ISSUERS.has(claims.iss)) throw httpError('invalid_issuer', 401);
  if (claims.azp && claims.azp !== OIDC_CLIENT_ID) throw httpError('invalid_authorized_party', 401);
  const audiences = typeof claims.aud === 'string' ? [claims.aud] : Array.isArray(claims.aud) ? claims.aud : [];
  if (requiredAudience && !audiences.includes(requiredAudience)) throw httpError('invalid_mcp_audience', 401);
  if (typeof claims.sub !== 'string' || !claims.sub.trim()) throw httpError('invalid_subject', 401);
  const roles = new Set(Array.isArray(claims.realm_access?.roles) ? claims.realm_access.roles : []);
  if (!roles.has('substrate-user') && !roles.has('substrate-manager') && !roles.has('substrate-admin')) throw httpError('forbidden', 403);
  return { subject: claims.sub, username: claims.preferred_username ?? null };
}
function audit(actor, action, target, payload = {}) {
  const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='audit_event'").get();
  if (!table) return;
  db.prepare('INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)').run(
    randomUUID(),
    actor.subject,
    actor.username,
    action,
    target,
    nowIso(),
    JSON.stringify(payload),
  );
}
function protocolVersion(req, input) {
  const requested = String(input?.params?.protocolVersion ?? req.headers['mcp-protocol-version'] ?? '').trim();
  return SUPPORTED_PROTOCOLS.has(requested) ? requested : DEFAULT_PROTOCOL;
}
function forwardedHeaders(req) {
  const result = {
    authorization: req.headers.authorization,
    'content-type': 'application/json',
  };
  for (const name of ['x-gbap-organization', 'x-gbap-workspace']) {
    const value = req.headers[name];
    if (typeof value === 'string' && value) result[name] = value;
  }
  return result;
}
async function invokeTool(req, tool, input) {
  let method = 'POST';
  let path;
  let body;
  if (tool.target.kind === 'CAPABILITY') {
    path = `/api/capabilities/${encodeURIComponent(tool.target.capability)}/invoke`;
    body = JSON.stringify({ payload: input });
  } else if (tool.target.kind === 'NATIVE') {
    method = tool.target.method;
    path = tool.target.path;
    body = method === 'GET' ? undefined : JSON.stringify(input);
  } else {
    throw httpError('mcp_tool_target_unsupported', 500);
  }
  const response = await fetch(new URL(path, INTERNAL_API_BASE), {
    method,
    headers: forwardedHeaders(req),
    body,
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({ error: 'invalid_downstream_json' }));
  if (!response.ok) {
    const code = typeof payload?.error === 'string' ? payload.error : `downstream_http_${response.status}`;
    throw httpError(code, response.status);
  }
  return tool.target.kind === 'CAPABILITY' && payload?.result !== undefined ? payload.result : payload;
}
function asToolResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value && typeof value === 'object' && !Array.isArray(value) ? value : { value },
    isError: false,
  };
}

export function createMcpNativeHandler(options) {
  const authorizationProfile = mcpAuthorizationProfile(options);
  return async function mcpNativeHandler(req, res) {
    const url = new URL(req.url ?? '/', 'http://gbap.internal');
    const metadataRequest = authorizationProfile && [authorizationProfile.metadataPath, '/.well-known/oauth-protected-resource'].includes(url.pathname);
    if (metadataRequest) {
      if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); sendJson(res, 405, { error: 'method_not_allowed' }); return true; }
      sendJson(res, 200, authorizationProfile.metadata); return true;
    }
    if (url.pathname !== '/api/mcp' && url.pathname !== '/mcp') return false;

    if (req.headers.origin && !ALLOWED_ORIGINS.has(req.headers.origin)) {
      sendJson(res, 403, { error: 'forbidden_origin' });
      return true;
    }

    if (req.method === 'OPTIONS') {
      sendJson(res, 204, null);
      return true;
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      sendJson(res, 405, { error: 'method_not_allowed' });
      return true;
    }

    let input;
    let version = DEFAULT_PROTOCOL;
    try {
      const actor = await authenticate(req, authorizationProfile?.resource);
      input = await readJson(req);
      version = protocolVersion(req, input);
      if (input?.jsonrpc !== '2.0' || typeof input?.method !== 'string') {
        rpcError(res, input?.id ?? null, -32600, 'Invalid Request', 200, version);
        return true;
      }
      if (input.id !== undefined && (typeof input.id !== 'string' && (typeof input.id !== 'number' || !Number.isFinite(input.id)))) {
        rpcError(res, null, -32600, 'Invalid Request', 200, version);
        return true;
      }
      const requestedProtocol = req.headers['mcp-protocol-version'];
      if (requestedProtocol && !SUPPORTED_PROTOCOLS.has(requestedProtocol)) {
        sendJson(res, 400, { error: 'unsupported_protocol_version' });
        return true;
      }

      if (input.method === 'notifications/initialized' && input.id === undefined) {
        sendJson(res, 202, null, version);
        return true;
      }
      if (input.id === undefined) {
        sendJson(res, 202, null, version);
        return true;
      }

      if (input.method === 'initialize') {
        audit(actor, 'mcp.initialize', 'McpGateway', { protocolVersion: version });
        rpcResult(res, input.id, {
          protocolVersion: version,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'gbap-gbap', version: MCP_GATEWAY_VERSION },
          instructions: 'Read-only GBAP CRM and Enterprise Knowledge gateway. Access is restricted by the signed-in GBAP user identity and existing GBAP ACLs.',
        }, version);
        return true;
      }
      if (input.method === 'ping') {
        rpcResult(res, input.id, {}, version);
        return true;
      }
      if (input.method === 'tools/list') {
        audit(actor, 'mcp.tools.list', 'McpGateway', { toolCount: listMcpTools().length });
        rpcResult(res, input.id, { tools: listMcpTools() }, version);
        return true;
      }
      if (input.method === 'tools/call') {
        const name = typeof input?.params?.name === 'string' ? input.params.name : '';
        const tool = getMcpTool(name);
        if (!tool) {
          rpcError(res, input.id, -32602, 'Unknown tool', 200, version);
          return true;
        }
        let args;
        try { args = validateMcpArguments(tool, input?.params?.arguments); }
        catch (error) {
          rpcError(res, input.id, -32602, error.message, 200, version);
          return true;
        }
        try {
          const result = await invokeTool(req, tool, args);
          audit(actor, 'mcp.tool.call', `McpTool:${name}`, { success: true });
          rpcResult(res, input.id, asToolResult(result), version);
        } catch (error) {
          audit(actor, 'mcp.tool.call', `McpTool:${name}`, { success: false, status: error.httpStatus ?? 500 });
          const status = error.httpStatus ?? 500;
          const code = ({ 400: 'invalid_arguments', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 429: 'rate_limited' })[status] ?? 'service_unavailable';
          rpcResult(res, input.id, {
            content: [{ type: 'text', text: `GBAP tool call failed: ${code}.` }],
            structuredContent: { error: { code, retryable: status === 429 || status >= 500 } },
            isError: true,
          }, version);
        }
        return true;
      }

      rpcError(res, input.id, -32601, 'Method not found', 200, version);
      return true;
    } catch (error) {
      const status = error.httpStatus ?? 500;
      if (status === 401) {
        res.writeHead(401, {
          ...headers(version),
          'WWW-Authenticate': `Bearer realm="GBAP GBAP MCP"${authorizationProfile ? `, resource_metadata="${authorizationProfile.metadataUrl}"` : ''}`,
        });
        res.end(JSON.stringify({ error: error.message ?? 'unauthorized' }));
        return true;
      }
      if (status === 403) {
        sendJson(res, 403, { error: 'forbidden' }, version);
        return true;
      }
      if (error.message === 'invalid_json') {
        rpcError(res, null, -32700, 'Parse error', 400, version);
        return true;
      }
      if (status === 413 || error.message === 'empty_request_body') {
        rpcError(res, null, -32600, 'Invalid Request', status, version);
        return true;
      }
      rpcError(res, input?.id ?? null, -32603, status >= 500 ? 'Internal error' : (error.message ?? 'Request failed'), status >= 500 ? 500 : 200, version);
      return true;
    }
  };
}
