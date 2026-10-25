import http from 'node:http';
import { createPublicKey, randomBytes, timingSafeEqual, verify as verifySignature } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createObservabilityStore } from '../observability/observability.mjs';

const PORT = Number(process.env.PORT ?? '8083');
const HOST = '0.0.0.0';
const OIDC_ALLOWED_ISSUERS = new Set((process.env.OIDC_ALLOWED_ISSUERS ?? 'http://localhost:8080/realms/gbap').split(',').map((value) => value.trim()).filter(Boolean));
const OIDC_JWKS_URL_INTERNAL = process.env.OIDC_JWKS_URL_INTERNAL ?? 'http://keycloak:8080/realms/gbap/protocol/openid-connect/certs';
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID ?? 'gbap-web';
const KEYCLOAK_ADMIN_BASE_INTERNAL = (process.env.KEYCLOAK_ADMIN_BASE_INTERNAL ?? 'http://keycloak:8080/admin/realms/gbap').replace(/\/$/, '');
const KEYCLOAK_TOKEN_URL_INTERNAL = process.env.KEYCLOAK_TOKEN_URL_INTERNAL ?? 'http://keycloak:8080/realms/gbap/protocol/openid-connect/token';
const KEYCLOAK_ADMIN_CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID ?? 'gbap-identity-admin';
const KEYCLOAK_ADMIN_CLIENT_SECRET_FILE = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET_FILE ?? '/run/secrets/keycloak-admin-client-secret';
const GBAP_IDENTITY_RESOLVER_TOKEN_FILE = process.env.GBAP_IDENTITY_RESOLVER_TOKEN_FILE ?? '/run/gbap-secrets/identity-resolver-token';
const OBSERVABILITY_DB_PATH = process.env.OBSERVABILITY_DB_PATH ?? '/data/observability.db';
const SUBSTRATE_ENV = process.env.SUBSTRATE_ENV ?? 'local';
const APP_ROLES = ['substrate-user', 'substrate-manager', 'substrate-admin'];
const ROLE_TIER_ROLES = {
  employee: ['substrate-user'],
  manager: ['substrate-user', 'substrate-manager'],
  'super-admin': ['substrate-user', 'substrate-admin'],
};

const KEYCLOAK_ADMIN_CLIENT_SECRET = readFileSync(KEYCLOAK_ADMIN_CLIENT_SECRET_FILE, 'utf8').trim();
if (!KEYCLOAK_ADMIN_CLIENT_SECRET) throw new Error('keycloak_admin_client_secret_empty');

function readIdentityResolverToken() {
  try {
    return readFileSync(GBAP_IDENTITY_RESOLVER_TOKEN_FILE, 'utf8').trim();
  } catch {
    return '';
  }
}

function secureTokenEqual(received, expected) {
  if (
    typeof received !== 'string' ||
    !received ||
    typeof expected !== 'string' ||
    !expected
  ) {
    return false;
  }
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function requireIdentityResolver(req) {
  const expected = readIdentityResolverToken();
  if (!expected) throw httpError('identity_resolver_not_configured', 503);
  const received = req.headers['x-gbap-identity-resolver-token'];
  if (!secureTokenEqual(received, expected)) {
    throw httpError('identity_resolver_unauthorized', 401);
  }
}


const observability = createObservabilityStore({
  dbPath: OBSERVABILITY_DB_PATH,
  serviceName: 'gbap-identity-admin',
  environment: SUBSTRATE_ENV,
});

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
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
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw httpError('invalid_json', 400); }
}

function decodeSegment(segment) {
  const pad = segment.length % 4 === 0 ? '' : '='.repeat(4 - (segment.length % 4));
  return Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

let jwksCache = { expiresAt: 0, keys: [] };
async function getJwk(kid) {
  if (Date.now() >= jwksCache.expiresAt) {
    const response = await fetch(OIDC_JWKS_URL_INTERNAL, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw httpError(`jwks_unavailable_${response.status}`, 503);
    const body = await response.json();
    jwksCache = { expiresAt: Date.now() + 60_000, keys: Array.isArray(body.keys) ? body.keys : [] };
  }
  const jwk = jwksCache.keys.find((key) => key.kid === kid);
  if (!jwk) {
    jwksCache.expiresAt = 0;
    throw httpError('unknown_signing_key', 401);
  }
  return jwk;
}

async function authenticate(req) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) throw httpError('missing_bearer_token', 401);
  const accessToken = header.slice(7);
  const parts = accessToken.split('.');
  if (parts.length !== 3) throw httpError('invalid_jwt', 401);
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const headerJson = JSON.parse(decodeSegment(encodedHeader).toString('utf8'));
  const claims = JSON.parse(decodeSegment(encodedPayload).toString('utf8'));
  if (headerJson.alg !== 'RS256' || typeof headerJson.kid !== 'string') throw httpError('unsupported_jwt', 401);
  const jwk = await getJwk(headerJson.kid);
  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const valid = verifySignature('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), publicKey, decodeSegment(encodedSignature));
  if (!valid) throw httpError('invalid_signature', 401);
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= now) throw httpError('token_expired', 401);
  if (!OIDC_ALLOWED_ISSUERS.has(claims.iss)) throw httpError('invalid_issuer', 401);
  if (claims.azp && claims.azp !== OIDC_CLIENT_ID) throw httpError('invalid_authorized_party', 401);
  const roles = new Set(Array.isArray(claims.realm_access?.roles) ? claims.realm_access.roles : []);
  if (!roles.has('substrate-admin')) throw httpError('forbidden', 403);
  return { subject: claims.sub, username: claims.preferred_username ?? null, roles };
}

function validateString(value, label, max = 512, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) throw httpError(`invalid_${label}`, 400);
  return value.trim();
}

function optionalText(value, label, max = 512) {
  if (value === undefined || value === null || value === '') return '';
  return validateString(value, label, max, true);
}

function validateRoleTier(value) {
  if (!Object.hasOwn(ROLE_TIER_ROLES, value)) throw httpError('invalid_role_tier', 400);
  return value;
}

function validateUsername(value) {
  const username = validateString(value, 'username', 64).normalize('NFC');
  if (!/^[\p{L}\p{N}._@-]{2,64}$/u.test(username)) throw httpError('invalid_username', 400);
  return username;
}

function validateEmail(value) {
  if (value === undefined || value === null || value === '') return '';
  const email = validateString(value, 'email', 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError('invalid_email', 400);
  return email;
}

function validatePassword(value, username) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128 || value.includes('\u0000') || value === username) {
    throw httpError('invalid_password', 400);
  }
  return value;
}

function temporaryPassword() {
  return `${randomBytes(18).toString('base64url')}!9a`;
}

function resolvePasswordInput(input, username) {
  const hasCustomPassword = typeof input.password === 'string' && input.password.length > 0;
  const password = hasCustomPassword ? validatePassword(input.password, username) : temporaryPassword();
  const requirePasswordChange = input.requirePasswordChange === undefined ? !hasCustomPassword : Boolean(input.requirePasswordChange);
  return { password, passwordGenerated: !hasCustomPassword, requirePasswordChange };
}

function isSystemIdentity(user) {
  return Boolean(user?.serviceAccountClientId);
}

function requireHumanIdentity(user) {
  if (isSystemIdentity(user)) throw httpError('identity_system_user_protected', 404);
  return user;
}

let adminTokenCache = { token: '', expiresAt: 0 };
async function getKeycloakAdminToken(forceRefresh = false) {
  if (!forceRefresh && adminTokenCache.token && Date.now() < adminTokenCache.expiresAt - 5_000) return adminTokenCache.token;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: KEYCLOAK_ADMIN_CLIENT_ID,
    client_secret: KEYCLOAK_ADMIN_CLIENT_SECRET,
  });
  const response = await fetch(KEYCLOAK_TOKEN_URL_INTERNAL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok || typeof payload?.access_token !== 'string' || !payload.access_token) {
    adminTokenCache = { token: '', expiresAt: 0 };
    throw httpError('identity_admin_service_auth_failed', 503);
  }
  const ttlSeconds = Number(payload.expires_in ?? 60);
  adminTokenCache = { token: payload.access_token, expiresAt: Date.now() + Math.max(10, ttlSeconds) * 1000 };
  return adminTokenCache.token;
}

async function performKeycloakRequest(path, { method = 'GET', body } = {}, forceRefresh = false) {
  const token = await getKeycloakAdminToken(forceRefresh);
  return fetch(`${KEYCLOAK_ADMIN_BASE_INTERNAL}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
}

async function keycloakRequest(_actor, path, options = {}) {
  let response = await performKeycloakRequest(path, options, false);
  if (response.status === 401) {
    adminTokenCache = { token: '', expiresAt: 0 };
    response = await performKeycloakRequest(path, options, true);
  }
  const text = await response.text();
  let parsed = null;
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = { message: text.slice(0, 1000) }; }
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw httpError('identity_admin_service_permission_denied', 503);
    if (response.status === 404) throw httpError('identity_user_not_found', 404);
    if (response.status === 409) throw httpError('identity_conflict', 409);
    throw httpError(`keycloak_admin_http_${response.status}`, 502);
  }
  return { body: parsed, headers: response.headers, status: response.status };
}

async function getRealmRole(actor, roleName) {
  return (await keycloakRequest(actor, `/roles/${encodeURIComponent(roleName)}`)).body;
}

async function getDirectRoles(actor, userId) {
  const roles = (await keycloakRequest(actor, `/users/${encodeURIComponent(userId)}/role-mappings/realm`)).body;
  return Array.isArray(roles) ? roles : [];
}

function roleTierFromRoles(roles) {
  const names = new Set(roles.map((role) => role.name));
  if (names.has('substrate-admin')) return 'super-admin';
  if (names.has('substrate-manager')) return 'manager';
  return 'employee';
}

async function toIdentityUser(actor, user) {
  requireHumanIdentity(user);
  const directRoles = await getDirectRoles(actor, user.id);
  const roles = directRoles.map((role) => role.name).filter((name) => APP_ROLES.includes(name));
  return {
    id: user.id,
    username: user.username ?? '',
    email: user.email ?? '',
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    enabled: user.enabled !== false,
    emailVerified: Boolean(user.emailVerified),
    roles,
    roleTier: roleTierFromRoles(directRoles),
  };
}

async function getUser(actor, userId) {
  const user = (await keycloakRequest(actor, `/users/${encodeURIComponent(userId)}`)).body;
  return requireHumanIdentity(user);
}

async function setAppRoles(actor, userId, roleTier) {
  const desiredNames = ROLE_TIER_ROLES[validateRoleTier(roleTier)];
  const current = await getDirectRoles(actor, userId);
  const currentApp = current.filter((role) => APP_ROLES.includes(role.name));
  if (currentApp.length > 0) {
    await keycloakRequest(actor, `/users/${encodeURIComponent(userId)}/role-mappings/realm`, { method: 'DELETE', body: currentApp });
  }
  const desired = [];
  for (const roleName of desiredNames) desired.push(await getRealmRole(actor, roleName));
  await keycloakRequest(actor, `/users/${encodeURIComponent(userId)}/role-mappings/realm`, { method: 'POST', body: desired });
}

async function protectLastSuperAdmin(actor, userId, before, nextEnabled, nextRoleTier) {
  const beforeRoles = await getDirectRoles(actor, userId);
  const wasAdmin = beforeRoles.some((role) => role.name === 'substrate-admin');
  const remainsEnabledAdmin = nextEnabled !== false && nextRoleTier === 'super-admin';
  if (!wasAdmin || remainsEnabledAdmin) return;
  const roleUsers = (await keycloakRequest(actor, '/roles/substrate-admin/users?first=0&max=500')).body;
  const enabledAdmins = Array.isArray(roleUsers) ? roleUsers.filter((user) => user.enabled !== false && !isSystemIdentity(user)) : [];
  if (enabledAdmins.length <= 1) throw httpError('last_super_admin_protected', 409);
}

function audit(actor, action, userId, { before, after, outcome = 'success', reason, requestId } = {}) {
  try {
    observability.emitAudit({
      actor: { kind: 'user', id: actor.subject, username: actor.username },
      action,
      resource: { type: 'identity-user', id: userId },
      outcome,
      before,
      after,
      reason,
      source: 'admin',
      risk: 'privileged',
      requestId,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'identity.audit_write_failed', action, userId, detail: error.message }));
  }
}

async function listUsers(actor) {
  const result = (await keycloakRequest(actor, '/users?first=0&max=500&briefRepresentation=false')).body;
  const users = Array.isArray(result) ? result.filter((user) => !isSystemIdentity(user)) : [];
  const output = [];
  for (const user of users) output.push(await toIdentityUser(actor, user));
  return output.sort((a, b) => a.username.localeCompare(b.username));
}

async function createUser(actor, input, requestId) {
  const username = validateUsername(input.username);
  const email = validateEmail(input.email);
  const firstName = optionalText(input.firstName, 'first_name', 128);
  const lastName = optionalText(input.lastName, 'last_name', 128);
  const roleTier = validateRoleTier(input.roleTier ?? 'employee');
  const credential = resolvePasswordInput(input, username);
  const response = await keycloakRequest(actor, '/users', {
    method: 'POST',
    body: { username, email: email || undefined, firstName: firstName || undefined, lastName: lastName || undefined, enabled: true, emailVerified: false },
  });
  let userId = response.headers.get('location')?.split('/').filter(Boolean).pop() ?? null;
  if (!userId) {
    const matches = (await keycloakRequest(actor, `/users?username=${encodeURIComponent(username)}&exact=true&max=2`)).body;
    userId = Array.isArray(matches) && matches.length === 1 ? matches[0].id : null;
  }
  if (!userId) throw httpError('created_user_id_unavailable', 502);
  try {
    await keycloakRequest(actor, `/users/${encodeURIComponent(userId)}/reset-password`, {
      method: 'PUT',
      body: { type: 'password', value: credential.password, temporary: credential.requirePasswordChange },
    });
    await setAppRoles(actor, userId, roleTier);
    const user = await toIdentityUser(actor, await getUser(actor, userId));
    audit(actor, 'identity.user.create', userId, { after: user, requestId });
    return {
      user,
      ...(credential.passwordGenerated ? { generatedPassword: credential.password } : {}),
      passwordGenerated: credential.passwordGenerated,
      requirePasswordChange: credential.requirePasswordChange,
    };
  } catch (error) {
    await keycloakRequest(actor, `/users/${encodeURIComponent(userId)}`, { method: 'DELETE' }).catch(() => {});
    audit(actor, 'identity.user.create', userId, { outcome: 'failed', reason: error.message, requestId });
    throw error;
  }
}

async function updateUser(actor, userId, input, requestId) {
  const beforeRaw = await getUser(actor, userId);
  const before = await toIdentityUser(actor, beforeRaw);
  const roleTier = input.roleTier === undefined ? before.roleTier : validateRoleTier(input.roleTier);
  const enabled = input.enabled === undefined ? before.enabled : Boolean(input.enabled);
  if (actor.subject === userId && (!enabled || roleTier !== 'super-admin')) throw httpError('self_admin_lockout_protected', 409);
  await protectLastSuperAdmin(actor, userId, beforeRaw, enabled, roleTier);
  const next = {
    username: beforeRaw.username,
    enabled,
    email: input.email === undefined ? (beforeRaw.email ?? '') : validateEmail(input.email),
    firstName: input.firstName === undefined ? (beforeRaw.firstName ?? '') : optionalText(input.firstName, 'first_name', 128),
    lastName: input.lastName === undefined ? (beforeRaw.lastName ?? '') : optionalText(input.lastName, 'last_name', 128),
    emailVerified: Boolean(beforeRaw.emailVerified),
  };
  await keycloakRequest(actor, `/users/${encodeURIComponent(userId)}`, { method: 'PUT', body: next });
  await setAppRoles(actor, userId, roleTier);
  const after = await toIdentityUser(actor, await getUser(actor, userId));
  audit(actor, 'identity.user.update', userId, { before, after, requestId });
  return after;
}

async function resetPassword(actor, userId, input, requestId) {
  const user = await toIdentityUser(actor, await getUser(actor, userId));
  const credential = resolvePasswordInput(input, user.username);
  await keycloakRequest(actor, `/users/${encodeURIComponent(userId)}/reset-password`, {
    method: 'PUT',
    body: { type: 'password', value: credential.password, temporary: credential.requirePasswordChange },
  });
  audit(actor, 'identity.user.password.reset', userId, { before: user, after: user, requestId });
  return {
    user,
    ...(credential.passwordGenerated ? { generatedPassword: credential.password } : {}),
    passwordGenerated: credential.passwordGenerated,
    requirePasswordChange: credential.requirePasswordChange,
  };
}

async function deleteUser(actor, userId, requestId) {
  if (actor.subject === userId) throw httpError('self_delete_protected', 409);
  const beforeRaw = await getUser(actor, userId);
  const before = await toIdentityUser(actor, beforeRaw);
  await protectLastSuperAdmin(actor, userId, beforeRaw, false, 'employee');
  await keycloakRequest(actor, `/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
  audit(actor, 'identity.user.delete', userId, { before, after: null, requestId });
}

async function handle(req, res) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'identity-admin'}`);
  if (url.pathname === '/healthz') return json(res, 200, { status: 'ok', service: 'gbap-identity-admin' });

  if (
    req.method === 'POST' &&
    url.pathname === '/internal/identity/resolve-subject'
  ) {
    try {
      requireIdentityResolver(req);
      const input = await readJson(req, 16 * 1024);
      const subject = validateString(input.subject, 'subject', 128);
      const user = await toIdentityUser(
        { subject: 'internal:gbap-api', username: 'gbap-api', roles: new Set() },
        await getUser(
          { subject: 'internal:gbap-api', username: 'gbap-api', roles: new Set() },
          subject,
        ),
      );
      return json(res, 200, {
        subject: user.id,
        username: user.username,
        enabled: user.enabled,
        roles: user.roles,
      });
    } catch (error) {
      return json(res, error.httpStatus ?? 500, {
        error: error.message ?? 'identity_resolver_failed',
      });
    }
  }

  let actor;
  try { actor = await authenticate(req); }
  catch (error) { return json(res, error.httpStatus ?? 401, { error: error.message }); }

  const requestId = String(req.headers['x-gbap-request-id'] ?? randomBytes(12).toString('hex'));
  try {
    if (req.method === 'GET' && url.pathname === '/api/identity/users') {
      return json(res, 200, { users: await listUsers(actor) });
    }
    if (req.method === 'POST' && url.pathname === '/api/identity/users') {
      return json(res, 201, await createUser(actor, await readJson(req), requestId));
    }
    const userMatch = url.pathname.match(/^\/api\/identity\/users\/([^/]+)$/);
    if (userMatch && req.method === 'PATCH') {
      const userId = decodeURIComponent(userMatch[1]);
      return json(res, 200, { user: await updateUser(actor, userId, await readJson(req), requestId) });
    }
    if (userMatch && req.method === 'DELETE') {
      const userId = decodeURIComponent(userMatch[1]);
      await deleteUser(actor, userId, requestId);
      return json(res, 200, { removed: userId });
    }
    const passwordMatch = url.pathname.match(/^\/api\/identity\/users\/([^/]+)\/reset-password$/);
    if (passwordMatch && req.method === 'POST') {
      return json(res, 200, await resetPassword(actor, decodeURIComponent(passwordMatch[1]), await readJson(req), requestId));
    }
    return json(res, 404, { error: 'not_found' });
  } catch (error) {
    return json(res, error.httpStatus ?? 500, { error: error.message ?? 'identity_admin_failed' });
  }
}

const server = http.createServer((req, res) => { void handle(req, res); });
server.listen(PORT, HOST, () => console.log(JSON.stringify({ event: 'identity-admin.started', port: PORT })));

function shutdown() {
  observability.close();
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);