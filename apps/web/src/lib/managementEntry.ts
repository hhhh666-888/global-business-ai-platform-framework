const configuredRuntime = (window as Window & { __GBAP_RUNTIME__?: { crmManagementUrl?: string } }).__GBAP_RUNTIME__?.crmManagementUrl;
const rawManagementBase = (configuredRuntime?.trim() || import.meta.env.VITE_GBAP_CRM_MANAGEMENT_URL || '').trim();

export function managedCrmUrl(path: string) {
  if (!rawManagementBase) return null;
  try {
    const base = new URL(rawManagementBase);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) return null;
    if (window.location.protocol === 'https:' && base.protocol !== 'https:') return null;
    const local = new Set(['localhost', '127.0.0.1', '[::1]']);
    if (local.has(base.hostname) && !local.has(window.location.hostname)) return null;
    return new URL(path.replace(/^\//, ''), `${base.toString().replace(/\/$/, '')}/`).toString();
  } catch {
    return null;
  }
}

export function sameOriginUrl(path: string) {
  return new URL(path, `${window.location.origin}/`).toString();
}
