import { randomPkceValue, sha256Base64url } from './pkce';
import { randomUuidV4 } from './randomUuid';

const GATEWAY_ORIGIN = window.location.origin;
const OIDC_BASE = import.meta.env.VITE_GBAP_OIDC_BASE ?? `${GATEWAY_ORIGIN}/realms/gbap/protocol/openid-connect`;
const CLIENT_ID = import.meta.env.VITE_GBAP_OIDC_CLIENT_ID ?? 'gbap-web';
// Call sites own the single `/api` prefix. Keep the default base at the active
// gateway origin so same-origin requests do not become `/api/api/...`.
const API_BASE = import.meta.env.VITE_GBAP_API_BASE ?? GATEWAY_ORIGIN;
const REDIRECT_URI = `${GATEWAY_ORIGIN}/`;

export type GbapIdentity = { subject: string; username: string | null; roles: string[] };

export type CanonicalAccount = {
  businessId: string | null;
  businessType: 'Account';
  externalId: string;
  externalType: string;
  displayName: string;
  website: string | null;
};

export type CanonicalContact = {
  businessId: string | null;
  businessType: 'Contact';
  externalId: string;
  externalType: string;
  personName: string;
  email: string | null;
  accountExternalId?: string | null;
  accountBusinessId?: string | null;
};

export type OpportunityLifecycleState = 'OPEN' | 'CLOSED_WON' | 'CLOSED_LOST' | 'CANCELLED';
export type OpportunityPipelineStage = 'NEW' | 'SCREENING' | 'MEETING' | 'PROPOSAL' | 'CUSTOMER';

export type CanonicalOpportunity = {
  businessId: string | null;
  businessType: 'Opportunity';
  externalId: string;
  externalType: string;
  nameSummary: string;
  lifecycleState: OpportunityLifecycleState | string;
  accountExternalId: string | null;
  accountBusinessId?: string | null;
  estimatedValue: number | null;
  currencyCode: string | null;
  pipelineStage: OpportunityPipelineStage | string | null;
  nextStep: string | null;
};

export type OperationalTarget = { businessType: 'Account' | 'Contact' | 'Opportunity'; businessId: string };

export type CrmTask = {
  businessId: string;
  businessType: 'CrmTask';
  title: string;
  bodyMarkdown: string | null;
  dueAt: string | null;
  status: 'TODO' | 'DONE';
  targets: OperationalTarget[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type CrmNote = {
  businessId: string;
  businessType: 'CrmNote';
  title: string;
  bodyMarkdown: string | null;
  targets: OperationalTarget[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type CrmActivity = (CrmTask & { kind: 'TASK' }) | (CrmNote & { kind: 'NOTE' });

export type CrmFile = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  target: OperationalTarget | null;
  createdBy: string;
  createdAt: string;
};

export type CrmSavedView = {
  id: string;
  name: string;
  pageKey: 'companies' | 'people' | 'opportunities' | 'tasks' | 'notes' | 'files';
  query: Record<string, unknown>;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GlobalSearchItem = {
  kind: 'company' | 'contact' | 'opportunity' | 'task' | 'note' | 'file';
  pageKey: 'companies' | 'people' | 'opportunities' | 'tasks' | 'notes' | 'files';
  title: string;
  detail: string;
};

type StoredTokens = {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  expires_at?: number;
  session_started_at?: number;
};
type InvocationResponse<T> = { requestId: string; providerId: string; result: T & { ok?: boolean; provider?: string; capability?: string } };

const TOKEN_KEY = 'gbap.tokens';
const PKCE_VERIFIER_KEY = 'gbap.pkce.verifier';
const OAUTH_STATE_KEY = 'gbap.oauth.state';
const RETURN_PAGE_KEY = 'gbap.ui.returnPage';
// Defense-in-depth only. Keycloak remains authoritative for ordinary (30d max)
// and Remember Me (90d max) SSO lifetimes; this client guard must not shorten them.
const SESSION_MAX_MS = 90 * 24 * 60 * 60 * 1000;
const REFRESH_SKEW_MS = 60_000;
let refreshPromise: Promise<StoredTokens> | null = null;

function clearTokens() { sessionStorage.removeItem(TOKEN_KEY); }
function readTokens(): StoredTokens | null {
  try { return JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as StoredTokens | null; }
  catch { clearTokens(); return null; }
}
function decodeAccessTokenExpiry(accessToken?: string) {
  if (!accessToken) return 0;
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return 0;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as { exp?: number };
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : 0;
  } catch { return 0; }
}
function sessionExceeded(tokens: StoredTokens) {
  return typeof tokens.session_started_at === 'number' && Date.now() - tokens.session_started_at >= SESSION_MAX_MS;
}
function storeTokens(next: StoredTokens, previous: StoredTokens | null = null) {
  const now = Date.now();
  const ttlSeconds = Number(next.expires_in ?? previous?.expires_in ?? 300);
  const stored: StoredTokens = {
    ...(previous ?? {}),
    ...next,
    refresh_token: next.refresh_token ?? previous?.refresh_token,
    expires_at: now + Math.max(30, Number.isFinite(ttlSeconds) ? ttlSeconds : 300) * 1000,
    session_started_at: previous?.session_started_at ?? now,
  };
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(stored));
  return stored;
}
function accessTokenNeedsRefresh(tokens: StoredTokens) {
  const expiresAt = tokens.expires_at ?? decodeAccessTokenExpiry(tokens.access_token);
  return Boolean(expiresAt && expiresAt <= Date.now() + REFRESH_SKEW_MS);
}
async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;
  const current = readTokens();
  if (!current?.refresh_token || sessionExceeded(current)) {
    clearTokens();
    throw Object.assign(new Error('authentication_required'), { status: 401 });
  }
  refreshPromise = (async () => {
    const body = new URLSearchParams({ grant_type: 'refresh_token', client_id: CLIENT_ID, refresh_token: current.refresh_token! });
    const response = await fetch(`${OIDC_BASE}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    if (!response.ok) {
      clearTokens();
      throw Object.assign(new Error('session_refresh_failed'), { status: response.status });
    }
    return storeTokens(await response.json() as StoredTokens, current);
  })();
  try { return await refreshPromise; }
  finally { refreshPromise = null; }
}
async function getActiveAccessToken(forceRefresh = false) {
  const tokens = readTokens();
  if (!tokens?.access_token || sessionExceeded(tokens)) {
    clearTokens();
    throw Object.assign(new Error('authentication_required'), { status: 401 });
  }
  if ((forceRefresh || accessTokenNeedsRefresh(tokens)) && tokens.refresh_token) {
    return (await refreshAccessToken()).access_token!;
  }
  return tokens.access_token;
}
async function authenticatedFetch(url: string, options: RequestInit = {}) {
  const request = async (forceRefresh = false) => fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${await getActiveAccessToken(forceRefresh)}`,
      ...(options.headers ?? {}),
    },
  });
  let response = await request(false);
  if (response.status === 401 && readTokens()?.refresh_token) {
    try { response = await request(true); }
    catch { clearTokens(); }
  }
  if (response.status === 401) clearTokens();
  return response;
}

function randomVerifier() { return randomPkceValue(64); }
export function hasStoredSession() {
  const tokens = readTokens();
  if (!tokens?.access_token || sessionExceeded(tokens)) {
    if (tokens && sessionExceeded(tokens)) clearTokens();
    return false;
  }
  return true;
}

export async function beginLogin(returnPage = 'companies') {
  const verifier = randomVerifier();
  const challenge = sha256Base64url(verifier);
  const oauthState = randomPkceValue(32);
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(OAUTH_STATE_KEY, oauthState);
  sessionStorage.setItem(RETURN_PAGE_KEY, returnPage);
  const url = new URL(`${OIDC_BASE}/auth`);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', oauthState);
  window.location.assign(url.toString());
}

export async function exchangeOidcCodeIfPresent() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return false;
  const returnedState = params.get('state');
  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  if (!returnedState || returnedState !== expectedState || !verifier) throw new Error('OAuth state/PKCE validation failed');
  const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, code, code_verifier: verifier });
  const response = await fetch(`${OIDC_BASE}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`);
  storeTokens(await response.json() as StoredTokens);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  window.history.replaceState({}, document.title, '/');
  return true;
}

export function consumeReturnPage() { const value = sessionStorage.getItem(RETURN_PAGE_KEY); sessionStorage.removeItem(RETURN_PAGE_KEY); return value; }
export function logout() {
  const tokens = readTokens();
  clearTokens();
  const url = new URL(`${OIDC_BASE}/logout`);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('post_logout_redirect_uri', REDIRECT_URI);
  if (tokens?.id_token) url.searchParams.set('id_token_hint', tokens.id_token);
  window.location.assign(url.toString());
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await authenticatedFetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error ?? `HTTP ${response.status}`), { body, status: response.status });
  return body as T;
}

export async function apiBlob(path: string, options: RequestInit = {}) {
  const response = await authenticatedFetch(`${API_BASE}${path}`, options);
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
  return response.blob();
}

export function getIdentity() { return api<GbapIdentity>('/api/me'); }
async function invokeCapability<T>(capability: string, payload: Record<string, unknown>) {
  return api<InvocationResponse<T>>(`/api/capabilities/${encodeURIComponent(capability)}/invoke`, { method: 'POST', body: JSON.stringify({ payload }) });
}

export async function listAccounts(limit = 100) { return (await invokeCapability<{ records: CanonicalAccount[] }>('crm.v1.account.list', { limit })).result.records; }
export async function createAccount(displayName: string) {
  const businessId = randomUuidV4();
  return (await invokeCapability<{ record: CanonicalAccount }>('crm.v1.account.create', { businessId, displayName: displayName.trim() })).result.record;
}
export async function listContacts(limit = 100) { return (await invokeCapability<{ records: CanonicalContact[] }>('crm.v1.contact.list', { limit })).result.records; }
export async function createContact(personName: string, email?: string) {
  const businessId = randomUuidV4();
  return (await invokeCapability<{ record: CanonicalContact }>('crm.v1.contact.create', { businessId, personName: personName.trim(), ...(email?.trim() ? { email: email.trim() } : {}) })).result.record;
}
export async function updateContact(businessId: string, changes: { personName?: string; email?: string | null; accountBusinessId?: string | null }) {
  return (await invokeCapability<{ record: CanonicalContact }>('crm.ops.v1.contact.update', { businessId, ...changes })).result.record;
}
export async function listOpportunities(limit = 100) { return (await invokeCapability<{ records: CanonicalOpportunity[] }>('crm.v1.opportunity.list', { limit })).result.records; }
export async function createOpportunity(input: { nameSummary: string; accountBusinessId: string; estimatedValue?: number; currencyCode?: string }) {
  const businessId = randomUuidV4();
  return (await invokeCapability<{ record: CanonicalOpportunity }>('crm.v1.opportunity.create', {
    businessId, nameSummary: input.nameSummary.trim(), lifecycleState: 'OPEN', accountBusinessId: input.accountBusinessId,
    ...(typeof input.estimatedValue === 'number' ? { estimatedValue: input.estimatedValue } : {}), ...(input.currencyCode ? { currencyCode: input.currencyCode } : {}),
  })).result.record;
}
export async function updateOpportunity(businessId: string, changes: { nameSummary?: string; accountBusinessId?: string | null; estimatedValue?: number; currencyCode?: string; pipelineStage?: OpportunityPipelineStage; lifecycleState?: OpportunityLifecycleState; nextStep?: string | null }) {
  return (await invokeCapability<{ record: CanonicalOpportunity }>('crm.ops.v1.opportunity.update', { businessId, ...changes })).result.record;
}
export async function listTasks(limit = 100) { return (await invokeCapability<{ records: CrmTask[] }>('crm.ops.v1.task.list', { limit })).result.records; }
export async function createTask(input: { title: string; bodyMarkdown?: string; dueAt?: string; targets?: OperationalTarget[] }) {
  return (await invokeCapability<{ record: CrmTask }>('crm.ops.v1.task.create', { businessId: randomUuidV4(), title: input.title.trim(), status: 'TODO', ...(input.bodyMarkdown?.trim() ? { bodyMarkdown: input.bodyMarkdown.trim() } : {}), ...(input.dueAt ? { dueAt: input.dueAt } : {}), targets: input.targets ?? [] })).result.record;
}
export async function updateTask(businessId: string, changes: { title?: string; bodyMarkdown?: string; dueAt?: string | null; status?: 'TODO' | 'DONE' }) {
  return (await invokeCapability<{ record: CrmTask }>('crm.ops.v1.task.update', { businessId, ...changes })).result.record;
}
export async function listNotes(limit = 100) { return (await invokeCapability<{ records: CrmNote[] }>('crm.ops.v1.note.list', { limit })).result.records; }
export async function createNote(input: { title: string; bodyMarkdown?: string; targets?: OperationalTarget[] }) {
  return (await invokeCapability<{ record: CrmNote }>('crm.ops.v1.note.create', { businessId: randomUuidV4(), title: input.title.trim(), ...(input.bodyMarkdown?.trim() ? { bodyMarkdown: input.bodyMarkdown.trim() } : {}), targets: input.targets ?? [] })).result.record;
}
export async function updateNote(businessId: string, changes: { title?: string; bodyMarkdown?: string }) { return (await invokeCapability<{ record: CrmNote }>('crm.ops.v1.note.update', { businessId, ...changes })).result.record; }
export async function listActivity(limit = 100) { return (await invokeCapability<{ records: CrmActivity[] }>('crm.ops.v1.activity.list', { limit })).result.records; }

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  return btoa(binary);
}

export async function listCrmFiles(target?: OperationalTarget) {
  const query = target ? `?${new URLSearchParams({ businessType: target.businessType, businessId: target.businessId })}` : '';
  return api<{ files: CrmFile[]; maxFileBytes: number }>(`/api/crm-native/files${query}`);
}
export async function uploadCrmFile(file: File, target?: OperationalTarget | null) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return api<{ file: CrmFile }>('/api/crm-native/files', { method: 'POST', body: JSON.stringify({ fileName: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, contentBase64: bytesToBase64(bytes), target: target ?? null }) });
}
export function getCrmFileContent(id: string, signal?: AbortSignal) {
  return apiBlob(`/api/crm-native/files/${encodeURIComponent(id)}/content`, { signal });
}
export async function downloadCrmFile(id: string, fileName: string) {
  const blob = await getCrmFileContent(id);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export async function deleteCrmFile(id: string) { return api<{ removed: string }>(`/api/crm-native/files/${encodeURIComponent(id)}`, { method: 'DELETE' }); }

export async function listSavedViews() { return (await api<{ views: CrmSavedView[] }>('/api/crm-native/views')).views; }
export async function createSavedView(input: { name: string; pageKey: CrmSavedView['pageKey']; query: Record<string, unknown>; favorite?: boolean }) {
  return (await api<{ view: CrmSavedView }>('/api/crm-native/views', { method: 'POST', body: JSON.stringify(input) })).view;
}
export async function updateSavedView(id: string, changes: { name?: string; query?: Record<string, unknown>; favorite?: boolean }) {
  return (await api<{ view: CrmSavedView }>(`/api/crm-native/views/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(changes) })).view;
}
export async function deleteSavedView(id: string) { return api<{ removed: string }>(`/api/crm-native/views/${encodeURIComponent(id)}`, { method: 'DELETE' }); }

export async function globalSearch(query: string): Promise<GlobalSearchItem[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const [accounts, contacts, opportunities, tasks, notes, fileResult] = await Promise.all([
    listAccounts(200), listContacts(200), listOpportunities(200), listTasks(200), listNotes(200), listCrmFiles(),
  ]);
  const items: GlobalSearchItem[] = [];
  for (const item of accounts) if (`${item.displayName} ${item.website ?? ''}`.toLowerCase().includes(q)) items.push({ kind: 'company', pageKey: 'companies', title: item.displayName, detail: item.website ?? '客户公司' });
  for (const item of contacts) if (`${item.personName} ${item.email ?? ''}`.toLowerCase().includes(q)) items.push({ kind: 'contact', pageKey: 'people', title: item.personName, detail: item.email ?? '联系人' });
  for (const item of opportunities) if (`${item.nameSummary} ${item.nextStep ?? ''} ${item.pipelineStage ?? ''}`.toLowerCase().includes(q)) items.push({ kind: 'opportunity', pageKey: 'opportunities', title: item.nameSummary, detail: item.nextStep ?? item.pipelineStage ?? '商机' });
  for (const item of tasks) if (`${item.title} ${item.bodyMarkdown ?? ''}`.toLowerCase().includes(q)) items.push({ kind: 'task', pageKey: 'tasks', title: item.title, detail: item.status === 'DONE' ? '已完成任务' : '待办任务' });
  for (const item of notes) if (`${item.title} ${item.bodyMarkdown ?? ''}`.toLowerCase().includes(q)) items.push({ kind: 'note', pageKey: 'notes', title: item.title, detail: (item.bodyMarkdown ?? '笔记').slice(0, 80) });
  for (const item of fileResult.files) if (item.fileName.toLowerCase().includes(q)) items.push({ kind: 'file', pageKey: 'files', title: item.fileName, detail: `${Math.max(1, Math.round(item.sizeBytes / 1024))} KB` });
  return items.slice(0, 30);
}
