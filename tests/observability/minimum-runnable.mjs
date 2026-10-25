import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createObservabilityStore } from '../../apps/observability/observability.mjs';

const root = mkdtempSync(join(tmpdir(), 'gbap-observability-'));
const dbPath = join(root, 'observability.db');

try {
  const contract = JSON.parse(readFileSync(new URL('../../contracts/observability/v1/contract.json', import.meta.url), 'utf8'));
  assert.equal(contract.id, 'gbap.audit-observability.v1');
  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.signals.audit.integrity, 'sha256_hash_chain');
  assert.equal(contract.retention.auditStandard.automaticHardDelete, false);
  assert.match(contract.standardsAlignment.tracePropagation, /W3C Trace Context/);

  const store = createObservabilityStore({
    dbPath,
    serviceName: 'gbap-test',
    environment: 'test',
    clock: () => new Date('2026-09-02T03:30:00.000Z'),
  });

  const first = store.emitAudit({
    actor: { kind: 'user', id: 'user-1', username: 'tester', password: 'must-not-persist' },
    action: 'entity.update',
    resource: { type: 'Contact', id: 'contact-1' },
    outcome: 'success',
    source: 'api',
    risk: 'normal',
    requestId: 'req-test-1',
    traceId: '0123456789abcdef0123456789abcdef',
    sessionIdHash: 'session-hash-only',
    network: { ip: '127.0.0.1', authorization: 'Bearer forbidden' },
    before: { phone: '111', apiKey: 'secret-key' },
    after: { phone: '222', clientSecret: 'secret-value' },
    attributes: { note: 'Authorization: Bearer top.secret.token' },
  });

  assert.match(first.id, /^aud_/);
  assert.equal(first.actor.password, '[REDACTED]');
  assert.equal(first.network.authorization, '[REDACTED]');
  assert.equal(first.before.apiKey, '[REDACTED]');
  assert.equal(first.after.clientSecret, '[REDACTED]');
  assert.equal(first.correlation.requestId, 'req-test-1');
  assert.equal(first.previousHash, '0'.repeat(64));
  assert.match(first.eventHash, /^[a-f0-9]{64}$/);

  const second = store.emitAudit({
    actor: { kind: 'service', id: 'backup-service' },
    action: 'backup.complete',
    resource: { type: 'Backup', id: 'backup-20260902' },
    outcome: 'success',
    source: 'scheduler',
    risk: 'privileged',
    attributes: { manifestSha256: 'a'.repeat(64) },
  });
  assert.equal(second.previousHash, first.eventHash);
  assert.equal(second.retentionClass, 'auditPrivileged');

  const chain = store.verifyAuditChain();
  assert.deepEqual(chain.verification, 'PASS');
  assert.equal(chain.eventCount, 2);
  assert.equal(chain.headHash, second.eventHash);

  store.emitLog({
    severity: 'ERROR',
    body: 'provider failed Authorization: Bearer abc.def.ghi',
    source: 'provider',
    requestId: 'req-test-1',
    attributes: { apiKey: 'do-not-store', provider: 'test-provider' },
  });
  store.emitLog({
    severity: 'INFO',
    body: 'old info log',
    source: 'system',
    occurredAt: '2020-01-01T00:00:00.000Z',
  });

  store.recordMetric({ name: 'gbap.api.request.duration', instrument: 'histogram', value: 42.5, unit: 'ms', attributes: { route: '/api/test' } });
  store.recordHealth({ component: 'gbap-api', status: 'UP', latencyMs: 12, dependencies: [{ component: 'db', status: 'UP' }] });
  assert.equal(store.getLatestHealth('gbap-api').status, 'UP');

  const alert1 = store.raiseAlert({
    fingerprint: 'disk:C:warning',
    ruleId: 'gbap.disk.utilization.warning',
    severity: 'WARNING',
    title: 'Disk utilization is high',
    source: 'system',
    context: { usedRatio: 0.82 },
  });
  const alert2 = store.raiseAlert({
    fingerprint: 'disk:C:warning',
    ruleId: 'gbap.disk.utilization.warning',
    severity: 'WARNING',
    title: 'Disk utilization is high',
    context: { usedRatio: 0.84 },
  });
  assert.equal(alert1.id, alert2.id);
  assert.equal(alert2.occurrence_count ?? alert2.occurrenceCount, 2);
  assert.equal(store.listOpenAlerts().length, 1);
  assert.equal(store.resolveAlert('disk:C:warning', { recoveredRatio: 0.65 }).status, 'RESOLVED');
  assert.equal(store.listOpenAlerts().length, 0);

  const raw = new DatabaseSync(dbPath);
  const persistedAudit = raw.prepare('SELECT actor_json,network_json,before_json,after_json,attributes_json FROM obs_audit_event WHERE id=?').get(first.id);
  const serializedAudit = JSON.stringify(persistedAudit);
  assert.equal(serializedAudit.includes('must-not-persist'), false);
  assert.equal(serializedAudit.includes('secret-key'), false);
  assert.equal(serializedAudit.includes('secret-value'), false);
  assert.equal(serializedAudit.includes('Bearer forbidden'), false);

  const persistedLog = raw.prepare('SELECT body,attributes_json FROM obs_log_event WHERE severity=? ORDER BY occurred_at DESC LIMIT 1').get('ERROR');
  assert.equal(persistedLog.body.includes('abc.def.ghi'), false);
  assert.equal(persistedLog.attributes_json.includes('do-not-store'), false);

  assert.throws(() => {
    raw.prepare('UPDATE obs_audit_event SET action=? WHERE id=?').run('tamper.attempt', first.id);
  }, /audit_immutable/);

  const sweep = store.sweepTelemetryRetention('2026-09-02T03:30:00.000Z');
  assert.equal(sweep.obs_audit_event, 0);
  assert.equal(sweep.obs_log_event >= 1, true);
  assert.equal(raw.prepare('SELECT COUNT(*) AS count FROM obs_audit_event').get().count, 2);

  raw.exec('DROP TRIGGER obs_audit_no_update;');
  raw.prepare('UPDATE obs_audit_event SET action=? WHERE id=?').run('tampered.outside.application_boundary', first.id);
  const tampered = store.verifyAuditChain();
  assert.equal(tampered.verification, 'FAIL');
  assert.equal(tampered.id, first.id);
  assert.equal(tampered.reason, 'event_hash_mismatch');
  raw.close();

  store.close();
  console.log('PASS contract parsed');
  console.log('PASS audit append-only application boundary');
  console.log('PASS audit SHA-256 chain and tamper detection');
  console.log('PASS secret redaction before persistence');
  console.log('PASS request/trace correlation');
  console.log('PASS logs + metrics + health minimum storage');
  console.log('PASS alert deduplication + resolution lifecycle');
  console.log('PASS telemetry retention never deletes audit');
  console.log('GBAP Audit + Observability minimum runnable foundation: PASS');
} finally {
  rmSync(root, { recursive: true, force: true });
}
