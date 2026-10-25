import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApiObservabilityWiring } from '../../apps/api/observability-wiring.mjs';

const root = mkdtempSync(join(tmpdir(), 'gbap-obs-wiring-'));
const appDbPath = join(root, 'substrate.db');
const obsDbPath = join(root, 'observability.db');
const appDb = new DatabaseSync(appDbPath);

appDb.exec(`
  CREATE TABLE audit_event (
    id TEXT PRIMARY KEY,
    actor_subject TEXT NOT NULL,
    actor_username TEXT,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
  ) STRICT;
`);

appDb.prepare('INSERT INTO audit_event VALUES(?,?,?,?,?,?,?)').run(
  'legacy-1',
  'user-1',
  'alice',
  'crm.file.create',
  'crm-file:file-1',
  '2026-09-02T00:00:00.000Z',
  JSON.stringify({ fileName: 'proposal.pdf', password: 'must-not-survive', target: { businessType: 'Account', businessId: 'acct-1' } }),
);
appDb.prepare('INSERT INTO audit_event VALUES(?,?,?,?,?,?,?)').run(
  'legacy-2',
  'user-2',
  'bob',
  'crm.boundary.rejected',
  'provider:twenty-uat',
  '2026-09-02T00:01:00.000Z',
  JSON.stringify({ capability: 'crm.ops.v1.contact.update', error: 'forbidden' }),
);
appDb.close();

const wiring = createApiObservabilityWiring({
  dbPath: appDbPath,
  observabilityDbPath: obsDbPath,
  environment: 'test',
});

const first = await wiring.bridgeLegacyAudit();
assert.equal(first.bridged, 2);
assert.equal(first.legacyAuditAvailable, true);

const second = await wiring.bridgeLegacyAudit();
assert.equal(second.bridged, 0, 'legacy bridge must be idempotent');

let events = wiring.store.listAudit({ limit: 20 });
assert.equal(events.length, 2);
const fileEvent = events.find((item) => item.attributes?.legacyEventId === 'legacy-1');
assert.ok(fileEvent);
assert.equal(fileEvent.actor.id, 'user-1');
assert.equal(fileEvent.actor.username, 'alice');
assert.equal(fileEvent.resource.type, 'CrmFile');
assert.equal(fileEvent.resource.id, 'file-1');
assert.equal(fileEvent.outcome, 'success');
assert.equal(fileEvent.attributes.legacyPayload.password, '[REDACTED]');
assert.equal(fileEvent.attributes.correlationLimitation, 'legacy event did not persist request/trace ids');

const rejected = events.find((item) => item.attributes?.legacyEventId === 'legacy-2');
assert.ok(rejected);
assert.equal(rejected.outcome, 'denied');
assert.equal(rejected.risk, 'security');
assert.equal(rejected.reason, 'forbidden');
assert.equal(wiring.store.verifyAuditChain().verification, 'PASS');

const traceId = '11111111111111111111111111111111';
const parentSpanId = '2222222222222222';
const fakeReq = {
  method: 'PATCH',
  url: '/api/capabilities/crm.ops.v1.contact.update/invoke?debug=1',
  headers: {
    host: 'localhost',
    traceparent: `00-${traceId}-${parentSpanId}-01`,
    'x-gbap-request-id': 'req_external_12345',
    'x-gbap-organization': 'org-1',
    'x-gbap-workspace': 'workspace-1',
    'x-forwarded-for': '203.0.113.10, 10.0.0.1',
    'user-agent': 'GBAP-Test/1.0',
  },
  socket: { remoteAddress: '127.0.0.1' },
};
const context = wiring.requestContext(fakeReq);
assert.equal(context.requestId, 'req_external_12345');
assert.equal(context.traceId, traceId);
assert.equal(context.path, '/api/capabilities/crm.ops.v1.contact.update/invoke');
assert.equal(context.organizationId, 'org-1');
assert.equal(context.network.forwardedFor, '203.0.113.10');

wiring.observeHttpResult(context, 403);
await wiring.bridgeLegacyAudit();
events = wiring.store.listAudit({ limit: 20 });
const denied = events.find((item) => item.action === 'auth.request.denied');
assert.ok(denied);
assert.equal(denied.outcome, 'denied');
assert.equal(denied.risk, 'security');
assert.equal(denied.correlation.requestId, 'req_external_12345');
assert.equal(denied.correlation.traceId, traceId);
assert.equal(denied.organizationId, 'org-1');
assert.equal(denied.network.forwardedFor, '203.0.113.10');
assert.equal(wiring.store.verifyAuditChain().verification, 'PASS');

const obsDb = new DatabaseSync(obsDbPath);
const metrics = obsDb.prepare('SELECT name,value FROM obs_metric_sample ORDER BY rowid').all();
assert.equal(metrics.length, 2);
assert.deepEqual(metrics.map((row) => row.name), ['http.server.request.count', 'http.server.request.duration']);
const logs = obsDb.prepare('SELECT severity,body FROM obs_log_event ORDER BY rowid').all();
assert.ok(logs.some((row) => row.severity === 'WARN' && row.body.includes('completed with 403')));
const health = obsDb.prepare("SELECT component,status FROM obs_health_signal ORDER BY rowid DESC LIMIT 1").get();
assert.equal(health.component, 'gbap-substrate-api');
assert.equal(health.status, 'UP');
const bridgeRows = obsDb.prepare('SELECT COUNT(*) AS count FROM obs_legacy_audit_bridge').get();
assert.equal(bridgeRows.count, 2);
obsDb.close();

await wiring.close();
rmSync(root, { recursive: true, force: true });
console.log('PASS audit + observability integration wiring');
