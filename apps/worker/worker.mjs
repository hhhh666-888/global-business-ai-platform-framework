import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DB_PATH = process.env.DB_PATH ?? '/data/substrate.db';
const INTERVAL_MS = Number(process.env.HEALTH_INTERVAL_MS ?? '5000');
mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkProvider(provider) {
  const endpoint = new URL(provider.endpoint);
  const allowlist = JSON.parse(provider.egress_allowlist_json);
  const checkedAt = new Date().toISOString();
  if (!allowlist.includes(endpoint.hostname)) {
    return { status: 'BLOCKED', checkedAt, latencyMs: null, detail: 'egress_denied' };
  }
  const started = Date.now();
  try {
    const response = await fetch(new URL('/health', endpoint), { signal: AbortSignal.timeout(provider.timeout_ms) });
    const latencyMs = Date.now() - started;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { status: 'UNHEALTHY', checkedAt, latencyMs, detail: `http_${response.status}` };
    return { status: body.status === 'ok' ? 'HEALTHY' : 'DEGRADED', checkedAt, latencyMs, detail: JSON.stringify(body).slice(0, 1000) };
  } catch (error) {
    return { status: 'UNAVAILABLE', checkedAt, latencyMs: Date.now() - started, detail: error.message };
  }
}

async function tick() {
  let providers = [];
  try {
    providers = db.prepare('SELECT * FROM provider_registration WHERE enabled=1 ORDER BY id').all();
  } catch (error) {
    if (String(error.message).includes('no such table')) return;
    throw error;
  }
  for (const provider of providers) {
    const result = await checkProvider(provider);
    db.prepare(`
      INSERT INTO provider_health(provider_id, observed_status, checked_at, latency_ms, detail)
      VALUES(?,?,?,?,?)
      ON CONFLICT(provider_id) DO UPDATE SET
        observed_status=excluded.observed_status,
        checked_at=excluded.checked_at,
        latency_ms=excluded.latency_ms,
        detail=excluded.detail
    `).run(provider.id, result.status, result.checkedAt, result.latencyMs, result.detail);
    console.log(JSON.stringify({ event: 'provider.health', providerId: provider.id, ...result }));
  }
}

console.log(JSON.stringify({ event: 'substrate.worker.started', dbPath: DB_PATH, intervalMs: INTERVAL_MS }));
while (true) {
  try {
    await tick();
  } catch (error) {
    console.error(JSON.stringify({ event: 'substrate.worker.error', error: error.message }));
  }
  await sleep(INTERVAL_MS);
}
