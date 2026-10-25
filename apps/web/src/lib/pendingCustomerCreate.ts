const STORAGE_KEY = 'gbap.pending-customer-create';
const MAX_AGE_MS = 15 * 60 * 1000;

type PendingCustomerCreate = {
  fingerprint: string;
  businessId: string;
  createdAt: number;
};

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => [key, normalize(entry)]));
}

export function customerCreateFingerprint(value: unknown) {
  return JSON.stringify(normalize(value));
}

function readPending(): PendingCustomerCreate | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingCustomerCreate>;
    if (!parsed.fingerprint || !parsed.businessId || typeof parsed.createdAt !== 'number') return null;
    if (Date.now() - parsed.createdAt > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed as PendingCustomerCreate;
  } catch {
    return null;
  }
}

export function pendingCustomerBusinessId(fingerprint: string) {
  const pending = readPending();
  return pending?.fingerprint === fingerprint ? pending.businessId : null;
}

export function rememberPendingCustomerCreate(fingerprint: string, businessId: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ fingerprint, businessId, createdAt: Date.now() } satisfies PendingCustomerCreate));
  } catch { /* browser storage unavailable: current request still proceeds */ }
}

export function clearPendingCustomerCreate(businessId: string) {
  try {
    const pending = readPending();
    if (pending?.businessId === businessId) sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* no-op */ }
}
