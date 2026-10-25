function failure(code, status) { return Object.assign(new Error(code), { httpStatus: status }); }
function signingKey(key) {
  if (key.kty !== 'RSA' || (key.use && key.use !== 'sig') || (key.alg && key.alg !== 'RS256')) throw failure('unsupported_signing_key', 401);
  return key;
}

/** Shared bounded signing-key cache: unknown kids cannot invalidate valid keys. */
export function createJwksCache({ fetchImpl = fetch, now = Date.now, ttlMs = 60_000, retryMs = 5_000 } = {}) {
  const caches = new Map();
  return async function getJwk(kid, url) {
    if (typeof kid !== 'string' || !kid.trim() || kid.length > 256 || /[\u0000-\u001f\u007f]/u.test(kid)) throw failure('unsupported_signing_key', 401);
    let cache = caches.get(url);
    if (!cache) {
      cache = { keys: [], expiresAt: 0, nextRefreshAt: 0, inFlight: null, error: null };
      caches.set(url, cache);
      if (caches.size > 32) caches.delete(caches.keys().next().value);
    }
    const key = cache.keys.find(value => value.kid === kid);
    if (now() < cache.expiresAt && key) return signingKey(key);
    if (!cache.inFlight && now() >= cache.nextRefreshAt) {
      cache.nextRefreshAt = now() + retryMs;
      cache.inFlight = (async () => {
        try {
          const response = await fetchImpl(url, { signal: AbortSignal.timeout(3000), redirect: 'error' });
          if (!response.ok || !response.body) throw failure('jwks_unavailable', 503);
          const reader = response.body.getReader();
          const chunks = []; let size = 0;
          try {
            for (;;) {
              const { value, done } = await reader.read(); if (done) break;
              size += value.length;
              if (size > 256 * 1024) throw failure('jwks_response_too_large', 503);
              chunks.push(value);
            }
          } finally { await reader.cancel().catch(() => {}); }
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!Array.isArray(body.keys) || !body.keys.length || body.keys.length > 128) throw failure('jwks_invalid_response', 503);
          const seen = new Set();
          for (const value of body.keys) {
            if (!value || typeof value !== 'object' || typeof value.kid !== 'string' || value.kid.length > 256 || seen.has(value.kid)) throw failure('jwks_invalid_response', 503);
            seen.add(value.kid);
          }
          cache.keys = body.keys; cache.expiresAt = now() + ttlMs; cache.error = null;
        } catch (error) {
          cache.error = error?.httpStatus ? error : failure('jwks_unavailable', 503);
          throw cache.error;
        } finally { cache.inFlight = null; }
      })();
    }
    if (cache.inFlight) await cache.inFlight;
    const current = cache.keys.find(value => value.kid === kid);
    if (now() < cache.expiresAt && current) return signingKey(current);
    if (cache.error || now() >= cache.expiresAt) throw cache.error ?? failure('jwks_refresh_wait', 503);
    throw failure('unknown_signing_key', 401);
  };
}

export const getCachedJwk = createJwksCache();
