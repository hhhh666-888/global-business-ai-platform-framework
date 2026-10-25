import { getCachedJwk } from './jwks-cache.mjs';
import { createPublicKey, randomUUID, verify as verifySignature } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const DB_PATH = process.env.DB_PATH ?? '/data/substrate.db';
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:8080';
const OIDC_ISSUER = process.env.OIDC_ISSUER ?? 'http://localhost:8082/realms/gbap';
const OIDC_ALLOWED_ISSUERS = new Set((process.env.OIDC_ALLOWED_ISSUERS ?? OIDC_ISSUER).split(',').map((value) => value.trim()).filter(Boolean));
const OIDC_JWKS_URL_INTERNAL = process.env.OIDC_JWKS_URL_INTERNAL ?? 'http://keycloak:8080/realms/gbap/protocol/openid-connect/certs';
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID ?? 'gbap-web';

export const FOREIGN_TRADE_STAGES = [
  'NEW',
  'CONTACTED',
  'QUALIFYING',
  'NEEDS_CONFIRMED',
  'TECHNICAL_SAMPLE',
  'QUOTATION',
  'NEGOTIATION',
  'DECISION',
  'ORDER_PENDING',
  'ON_HOLD',
  'ORDER_CONFIRMED',
];
const FOREIGN_TRADE_STAGE_SET = new Set(FOREIGN_TRADE_STAGES);

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 5000;');

function nowIso() { return new Date().toISOString(); }
function responseHeaders(extra = {}) {
  return {
    'cache-control': 'no-store',
    'access-control-allow-origin': CORS_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type, x-gbap-organization, x-gbap-workspace',
    'access-control-allow-methods': 'GET,PATCH,OPTIONS',
    ...extra,
  };
}
function json(res, status, body) {
  res.writeHead(status, responseHeaders({ 'content-type': 'application/json; charset=utf-8' }));
  res.end(JSON.stringify(body));
}
function httpError(message, status = 400) {
  const error = new Error(message);
  error.httpStatus = status;
  return error;
}
async function readJson(req, maxBytes = 64 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw httpError('request_body_too_large', 413);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw httpError('invalid_json', 400); }
}
function decodeSegment(segment) {
  const pad = segment.length % 4 === 0 ? '' : '='.repeat(4 - (segment.length % 4));
  return Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}
async function getJwk(kid) { return getCachedJwk(kid, OIDC_JWKS_URL_INTERNAL); }
async function authenticate(req) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) throw httpError('missing_bearer_token', 401);
  const parts = header.slice(7).split('.');
  if (parts.length !== 3) throw httpError('invalid_jwt', 401);
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  let headerJson;
  let claims;
  try {
    headerJson = JSON.parse(decodeSegment(encodedHeader).toString('utf8'));
    claims = JSON.parse(decodeSegment(encodedPayload).toString('utf8'));
  } catch { throw httpError('invalid_jwt', 401); }
  if (headerJson.alg !== 'RS256' || typeof headerJson.kid !== 'string') throw httpError('unsupported_jwt', 401);
  const publicKey = createPublicKey({ key: await getJwk(headerJson.kid), format: 'jwk' });
  if (!verifySignature('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), publicKey, decodeSegment(encodedSignature))) throw httpError('invalid_signature', 401);
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= now) throw httpError('token_expired', 401);
  if (claims.nbf && claims.nbf > now + 30) throw httpError('token_not_yet_valid', 401);
  if (!OIDC_ALLOWED_ISSUERS.has(claims.iss)) throw httpError('invalid_issuer', 401);
  if (claims.azp && claims.azp !== OIDC_CLIENT_ID) throw httpError('invalid_authorized_party', 401);
  return {
    subject: claims.sub,
    username: claims.preferred_username ?? null,
    roles: new Set(Array.isArray(claims.realm_access?.roles) ? claims.realm_access.roles : []),
  };
}
function requireUser(actor) {
  if (!actor.roles.has('substrate-user') && !actor.roles.has('substrate-admin')) throw httpError('forbidden', 403);
}
function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
function parseState(value) {
  try { return value ? JSON.parse(value) : {}; }
  catch { return {}; }
}
function profileView(row) {
  const state = parseState(row.state_json);
  return {
    businessId: row.business_id,
    tradeStage: FOREIGN_TRADE_STAGE_SET.has(state.tradeStage) ? state.tradeStage : null,
    profileUpdatedAt: row.updated_at ?? null,
  };
}
function validateTradeStage(value) {
  if (typeof value !== 'string') throw httpError('invalid_trade_stage', 400);
  const normalized = value.trim().toUpperCase();
  if (!FOREIGN_TRADE_STAGE_SET.has(normalized)) throw httpError('invalid_trade_stage', 400);
  return normalized;
}
function opportunityExists(businessId) {
  return Boolean(db.prepare("SELECT 1 FROM external_mapping WHERE business_type='Opportunity' AND business_id=? LIMIT 1").get(businessId));
}
function recordAudit(actor, businessId, tradeStage) {
  if (!tableExists('audit_event')) return;
  db.prepare(`INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)`).run(
    randomUUID(), actor.subject, actor.username, 'crm.opportunity.trade_stage.update', `Opportunity:${businessId}`, nowIso(), JSON.stringify({ tradeStage }),
  );
}
function updateProfile(actor, businessId, tradeStage) {
  if (!opportunityExists(businessId)) throw httpError('opportunity_not_found', 404);
  const current = db.prepare("SELECT state_json FROM crm_business_state WHERE business_type='Opportunity' AND business_id=?").get(businessId);
  const next = { ...parseState(current?.state_json), tradeStage };
  const updatedAt = nowIso();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`INSERT INTO crm_business_state(business_type,business_id,state_json,updated_at) VALUES('Opportunity',?,?,?)
      ON CONFLICT(business_type,business_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`).run(businessId, JSON.stringify(next), updatedAt);
    recordAudit(actor, businessId, tradeStage);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { businessId, tradeStage, profileUpdatedAt: updatedAt };
}

export function createOpportunityProfileHandler() {
  return async function opportunityProfileHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const listRoute = url.pathname === '/api/crm-native/opportunity-profiles';
    const updateMatch = url.pathname.match(/^\/api\/crm-native\/opportunity-profiles\/([^/]+)$/);
    if (!listRoute && !updateMatch) return false;
    if (req.method === 'OPTIONS') { res.writeHead(204, responseHeaders()); res.end(); return true; }

    try {
      const actor = await authenticate(req);
      requireUser(actor);
      if (listRoute && req.method === 'GET') {
        const rows = db.prepare("SELECT business_id,state_json,updated_at FROM crm_business_state WHERE business_type='Opportunity' ORDER BY updated_at DESC").all();
        json(res, 200, { profiles: rows.map(profileView) });
        return true;
      }
      if (updateMatch && req.method === 'GET') {
        const businessId = decodeURIComponent(updateMatch[1]);
        if (!businessId || businessId.length > 255) throw httpError('invalid_business_id', 400);
        if (!opportunityExists(businessId)) throw httpError('opportunity_not_found', 404);
        const row = db.prepare("SELECT business_id,state_json,updated_at FROM crm_business_state WHERE business_type='Opportunity' AND business_id=?").get(businessId);
        json(res, 200, {
          profile: row
            ? profileView(row)
            : { businessId, tradeStage: null, profileUpdatedAt: null },
        });
        return true;
      }
      if (updateMatch && req.method === 'PATCH') {
        const businessId = decodeURIComponent(updateMatch[1]);
        if (!businessId || businessId.length > 255) throw httpError('invalid_business_id', 400);
        const input = await readJson(req);
        const tradeStage = validateTradeStage(input.tradeStage);
        json(res, 200, { profile: updateProfile(actor, businessId, tradeStage) });
        return true;
      }
      json(res, 405, { error: 'method_not_allowed' });
      return true;
    } catch (error) {
      const busy = String(error?.code ?? '').startsWith('SQLITE_BUSY') || String(error?.message ?? '').includes('database is locked');
      json(res, busy ? 503 : (error.httpStatus ?? 500), { error: busy ? 'opportunity_profile_busy' : (error.message ?? 'opportunity_profile_failed') });
      return true;
    }
  };
}
