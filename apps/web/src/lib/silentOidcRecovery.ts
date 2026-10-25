import { randomPkceValue, sha256Base64url } from './pkce';

const GATEWAY_ORIGIN = window.location.origin;
const OIDC_BASE = import.meta.env.VITE_GBAP_OIDC_BASE ?? `${GATEWAY_ORIGIN}/realms/gbap/protocol/openid-connect`;
const CLIENT_ID = import.meta.env.VITE_GBAP_OIDC_CLIENT_ID ?? 'gbap-web';
const REDIRECT_URI = `${GATEWAY_ORIGIN}/`;

// These keys deliberately match foguංගClient's transient PKCE state. Tokens
// remain in sessionStorage; only Keycloak's HttpOnly SSO cookie persists when
// the user selected Remember Me.
const PKCE_VERIFIER_KEY = 'gbap.pkce.verifier';
const OAUTH_STATE_KEY = 'gbap.oauth.state';
const RETURN_PAGE_KEY = 'gbap.ui.returnPage';
const SILENT_PENDING_KEY = 'gbap.oauth.silent.pending';
const SILENT_FAILED_KEY = 'gbap.oauth.silent.failed';
const EXPLICIT_LOGOUT_KEY = 'gbap.oauth.explicit-logout';

export function consumeSilentOidcFailureIfPresent() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  if (!error || sessionStorage.getItem(SILENT_PENDING_KEY) !== '1') return false;

  const returnedState = params.get('state');
  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
  if (returnedState && expectedState && returnedState !== expectedState) {
    throw new Error('Silent OAuth state validation failed');
  }

  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(SILENT_PENDING_KEY);
  sessionStorage.setItem(SILENT_FAILED_KEY, error);
  window.history.replaceState({}, document.title, '/');
  return true;
}

export function canAttemptSilentOidcRecovery() {
  if (sessionStorage.getItem(EXPLICIT_LOGOUT_KEY) === '1') return false;
  if (sessionStorage.getItem(SILENT_FAILED_KEY)) return false;
  const params = new URLSearchParams(window.location.search);
  return !params.has('code') && !params.has('error');
}

export function beginSilentOidcRecovery(returnPage = 'companies') {
  const verifier = randomPkceValue(64);
  const challenge = sha256Base64url(verifier);
  const oauthState = randomPkceValue(32);

  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(OAUTH_STATE_KEY, oauthState);
  sessionStorage.setItem(RETURN_PAGE_KEY, returnPage);
  sessionStorage.setItem(SILENT_PENDING_KEY, '1');

  const url = new URL(`${OIDC_BASE}/auth`);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', oauthState);
  url.searchParams.set('prompt', 'none');
  window.location.assign(url.toString());
}

export function completeSilentOidcRecovery() {
  sessionStorage.removeItem(SILENT_PENDING_KEY);
  sessionStorage.removeItem(SILENT_FAILED_KEY);
  sessionStorage.removeItem(EXPLICIT_LOGOUT_KEY);
}

export function markExplicitLogout() {
  sessionStorage.setItem(EXPLICIT_LOGOUT_KEY, '1');
  sessionStorage.removeItem(SILENT_PENDING_KEY);
  sessionStorage.removeItem(SILENT_FAILED_KEY);
}
