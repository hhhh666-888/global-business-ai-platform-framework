import { randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createObservabilityStore } from '../observability/observability.mjs';

const TRACEPARENT_RE = /^[\da-f]{2}-([\da-f]{32})-([\da-f]{16})-([\da-f]{2})$/i;
const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,160}$/;

function randomHex(bytes) {
  return randomBytes(bytes).toString('hex');
}

function safeRequestId(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return REQUEST_ID_RE.test(text) ? text : `req_${randomUUID()}`;
}

function traceContextFromHeaders(headers = {}) {
  const incoming = String(headers.traceparent ?? '').trim();
  const match = TRACEPARENT_RE.exec(incoming);
  if (match && !/^0+$/.test(match[1]) && !/^0+$/.test(match[2])) {
    return {
      traceId: match[1].toLowerCase(),
      parentSpanId: match[2].toLowerCase(),
      spanId: randomHex(8),
      traceFlags: match[3].toLowerCase(),
      incomingTraceparent: incoming,
    };
  }
  return {
    traceId: randomHex(16),
    parentSpanId: null,
    spanId: randomHex(8),
    traceFlags: '01',
    incomingTraceparent: null,
  };
}

function resourceFromLegacyTarget(target) {
  const text = String(target ?? 'legacy:unknown');
  const separator = text.indexOf(':');
  if (separator < 1) return { type: 'LegacyResource', id: text };
  const prefix = text.slice(0, separator);
  const id = text.slice(separator + 1) || text;
  const types = {
    provider: 'Provider',
    mapping: 'Mapping',
    'crm-file': 'CrmFile',
    'saved-view': 'SavedView',
    account: 'Account',
    contact: 'Contact',
    opportunity: 'Opportunity',
    task: 'CrmTask',
    note: 'CrmNote',
  };
  return { type: types[prefix] ?? prefix, id };
}

function legacyOutcome(action) {
  if (/rejected|denied/i.test(action)) return 'denied';
  if (/failed|error/i.test(action)) return 'failed';
  return 'success';
}

function legacyRisk(action) {
  if (/rejected|denied|auth|security/i.test(action)) return 'security';
  if (/^provider\.|^mapping\.|permission|role|admin/i.test(action)) return 'privileged';
  return 'normal';
}

function parsePayload(text) {
  try {
    const value = JSON.parse(text ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : { value };
  } catch {
    return { legacyPayloadParseError: true };
  }
}

export function createApiObservabilityWiring({
  dbPath = process.env.DB_PATH ?? '/data/substrate.db',
  observabilityDbPath = process.env.OBSERVABILITY_DB_PATH ?? '/data/observability.db',
  environment = process.env.SUBSTRATE_ENV ?? 'local',
  serviceName = 'gbap-substrate-api',
  clock = () => new Date(),
} = {}) {
  const store = createObservabilityStore({ dbPath: observabilityDbPath, environment, serviceName, clock });
  const legacyDb = new DatabaseSync(dbPath);
  const bridgeDb = new DatabaseSync(observabilityDbPath);
  bridgeDb.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS obs_bridge_state (
      bridge_key TEXT PRIMARY KEY,
      cursor_value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS obs_legacy_audit_bridge (
      legacy_event_id TEXT PRIMARY KEY,
      legacy_rowid INTEGER NOT NULL UNIQUE,
      v1_event_id TEXT NOT NULL UNIQUE,
      bridged_at TEXT NOT NULL
    ) STRICT;
  `);

  let bridgeQueue = Promise.resolve();
  let closing = false;

  function bridgeCursor() {
    const row = bridgeDb.prepare("SELECT cursor_value FROM obs_bridge_state WHERE bridge_key='legacy_audit_rowid'").get();
    return Number(row?.cursor_value ?? 0) || 0;
  }

  function setBridgeCursor(value) {
    const at = clock().toISOString();
    bridgeDb.prepare(`
      INSERT INTO obs_bridge_state(bridge_key,cursor_value,updated_at)
      VALUES('legacy_audit_rowid',?,?)
      ON CONFLICT(bridge_key) DO UPDATE SET cursor_value=excluded.cursor_value, updated_at=excluded.updated_at
    `).run(String(value), at);
  }

  function bridgeLegacyAuditNow({ batchSize = 500 } = {}) {
    let cursor = bridgeCursor();
    let bridged = 0;
    while (true) {
      let rows;
      try {
        rows = legacyDb.prepare(`
          SELECT rowid AS legacy_rowid, id, actor_subject, actor_username, action, target, occurred_at, payload_json
          FROM audit_event
          WHERE rowid > ?
          ORDER BY rowid ASC
          LIMIT ?
        `).all(cursor, batchSize);
      } catch (error) {
        if (String(error?.message ?? '').includes('no such table')) return { bridged, cursor, legacyAuditAvailable: false };
        throw error;
      }
      if (rows.length === 0) break;
      for (const row of rows) {
        const already = bridgeDb.prepare('SELECT v1_event_id FROM obs_legacy_audit_bridge WHERE legacy_event_id=?').get(row.id);
        if (already) {
          cursor = row.legacy_rowid;
          setBridgeCursor(cursor);
          continue;
        }
        const payload = parsePayload(row.payload_json);
        const before = Object.prototype.hasOwnProperty.call(payload, 'before') ? payload.before : undefined;
        const after = Object.prototype.hasOwnProperty.call(payload, 'after') ? payload.after : undefined;
        const reason = typeof payload.reason === 'string' ? payload.reason : (typeof payload.error === 'string' ? payload.error : undefined);
        const event = store.emitAudit({
          occurredAt: row.occurred_at,
          actor: { kind: 'user', id: row.actor_subject, username: row.actor_username ?? null },
          action: row.action,
          resource: resourceFromLegacyTarget(row.target),
          outcome: legacyOutcome(row.action),
          before,
          after,
          reason,
          source: 'api',
          risk: legacyRisk(row.action),
          attributes: {
            legacyEventId: row.id,
            legacyTarget: row.target,
            legacyPayload: payload,
            bridgeMode: 'legacy-audit-to-gbap.audit-observability.v1',
            correlationLimitation: 'legacy event did not persist request/trace ids',
          },
        });
        const bridgedAt = clock().toISOString();
        bridgeDb.prepare('INSERT INTO obs_legacy_audit_bridge(legacy_event_id,legacy_rowid,v1_event_id,bridged_at) VALUES(?,?,?,?)')
          .run(row.id, row.legacy_rowid, event.id, bridgedAt);
        cursor = row.legacy_rowid;
        setBridgeCursor(cursor);
        bridged += 1;
      }
      if (rows.length < batchSize) break;
    }
    return { bridged, cursor, legacyAuditAvailable: true };
  }

  function bridgeLegacyAudit(options) {
    if (closing) return Promise.resolve({ bridged: 0, cursor: null, legacyAuditAvailable: false, closing: true });
    bridgeQueue = bridgeQueue.catch(() => undefined).then(() => {
      if (closing) return { bridged: 0, cursor: null, legacyAuditAvailable: false, closing: true };
      return bridgeLegacyAuditNow(options);
    });
    return bridgeQueue;
  }

  function requestContext(req) {
    const trace = traceContextFromHeaders(req.headers ?? {});
    const requestId = safeRequestId(req.headers?.['x-gbap-request-id']);
    const rawUrl = req.url ?? '/';
    const url = new URL(rawUrl, `http://${req.headers?.host ?? 'localhost'}`);
    return {
      requestId,
      traceId: trace.traceId,
      spanId: trace.spanId,
      traceFlags: trace.traceFlags,
      responseTraceparent: `00-${trace.traceId}-${trace.spanId}-${trace.traceFlags}`,
      method: req.method ?? 'GET',
      path: url.pathname,
      organizationId: req.headers?.['x-gbap-organization']?.toString() ?? null,
      workspaceId: req.headers?.['x-gbap-workspace']?.toString() ?? null,
      network: {
        remoteAddress: req.socket?.remoteAddress ?? null,
        forwardedFor: req.headers?.['x-forwarded-for']?.toString().split(',')[0]?.trim() ?? null,
        userAgent: req.headers?.['user-agent']?.toString() ?? null,
      },
      startedNs: process.hrtime.bigint(),
    };
  }

  function observeHttpResult(context, statusCode) {
    const durationMs = Number(process.hrtime.bigint() - context.startedNs) / 1_000_000;
    const attributes = {
      method: context.method,
      route: context.path,
      statusCode,
    };
    store.recordMetric({
      name: 'http.server.request.count',
      instrument: 'counter',
      value: 1,
      unit: '{request}',
      attributes,
    });
    store.recordMetric({
      name: 'http.server.request.duration',
      instrument: 'histogram',
      value: durationMs,
      unit: 'ms',
      attributes,
    });
    if (statusCode >= 400) {
      store.emitLog({
        severity: statusCode >= 500 ? 'ERROR' : 'WARN',
        body: `HTTP ${context.method} ${context.path} completed with ${statusCode}`,
        source: 'api',
        requestId: context.requestId,
        traceId: context.traceId,
        spanId: context.spanId,
        attributes,
      });
    }
    store.recordHealth({
      component: 'gbap-substrate-api',
      status: statusCode >= 500 ? 'DEGRADED' : 'UP',
      latencyMs: durationMs,
      detail: statusCode >= 500 ? `request_failed_${statusCode}` : 'request_completed',
      attributes,
    });
    if (statusCode === 401 || statusCode === 403) {
      store.emitAudit({
        actor: { kind: 'system', id: 'unauthenticated-or-unresolved-principal' },
        action: 'auth.request.denied',
        resource: { type: 'HttpRoute', id: context.path },
        outcome: 'denied',
        reason: `http_${statusCode}`,
        source: 'api',
        risk: 'security',
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        network: context.network,
        requestId: context.requestId,
        traceId: context.traceId,
        spanId: context.spanId,
        attributes: { method: context.method, statusCode },
      });
    }
    void bridgeLegacyAudit().catch((error) => {
      if (closing) return;
      store.emitLog({
        severity: 'ERROR',
        body: `Legacy audit bridge failed: ${error.message}`,
        source: 'system',
        requestId: context.requestId,
        traceId: context.traceId,
        spanId: context.spanId,
      });
    });
    return { durationMs };
  }

  function wrapListener(listener) {
    return (req, res) => {
      const context = requestContext(req);
      req.headers['x-gbap-request-id'] = context.requestId;
      if (!res.headersSent) {
        res.setHeader('x-gbap-request-id', context.requestId);
        res.setHeader('traceparent', context.responseTraceparent);
      }
      let observed = false;
      const finish = () => {
        if (observed) return;
        observed = true;
        observeHttpResult(context, Number(res.statusCode || 0));
      };
      res.once('finish', finish);
      res.once('close', finish);
      try {
        return listener(req, res);
      } catch (error) {
        store.emitLog({
          severity: 'ERROR',
          body: `HTTP listener failed: ${error.message}`,
          source: 'api',
          requestId: context.requestId,
          traceId: context.traceId,
          spanId: context.spanId,
          attributes: { method: context.method, route: context.path },
        });
        throw error;
      }
    };
  }

  function recordStartup() {
    store.emitLog({ severity: 'INFO', body: 'GBAP API observability wiring started', source: 'system' });
    store.recordHealth({ component: 'gbap-substrate-api', status: 'UP', detail: 'observability_wiring_started' });
    return bridgeLegacyAudit();
  }

  async function close() {
    closing = true;
    await bridgeQueue.catch(() => undefined);
    legacyDb.close();
    bridgeDb.close();
    store.close();
  }

  return {
    store,
    wrapListener,
    requestContext,
    observeHttpResult,
    bridgeLegacyAudit,
    bridgeLegacyAuditNow,
    recordStartup,
    close,
  };
}
