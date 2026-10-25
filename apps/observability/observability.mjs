import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const REDACTED = '[REDACTED]';
const ZERO_HASH = '0'.repeat(64);
const SECRET_KEYS = new Set([
  'password', 'passwd', 'authorization', 'accesstoken', 'refreshtoken', 'apikey',
  'secret', 'clientsecret', 'privatekey', 'cookie', 'set-cookie', 'connectionstring',
]);
const VALID_ENVIRONMENTS = new Set(['dev', 'test', 'uat', 'production', 'local']);
const VALID_SOURCES = new Set(['ui', 'api', 'worker', 'scheduler', 'admin', 'automation', 'provider', 'system', 'cli']);
const VALID_AUDIT_OUTCOMES = new Set(['success', 'denied', 'failed']);
const VALID_AUDIT_RISKS = new Set(['normal', 'privileged', 'security']);
const VALID_LOG_SEVERITIES = new Set(['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']);
const VALID_METRIC_INSTRUMENTS = new Set(['counter', 'updowncounter', 'gauge', 'histogram']);
const VALID_HEALTH = new Set(['UP', 'DEGRADED', 'DOWN', 'UNKNOWN']);
const VALID_ALERT_SEVERITIES = new Set(['INFO', 'WARNING', 'CRITICAL']);

function nowIso(clock) {
  const value = clock();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function uuid(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function requireString(value, label, max = 1024) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > max) {
    throw new Error(`invalid_${label}`);
  }
  return value.trim();
}

function optionalString(value, label, max = 4096) {
  if (value === undefined || value === null || value === '') return null;
  return requireString(value, label, max);
}

function requireEnum(value, label, allowed) {
  const text = requireString(value, label, 128);
  if (!allowed.has(text)) throw new Error(`invalid_${label}`);
  return text;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sanitizeString(value) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/(api[_-]?key|client[_-]?secret|password)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]');
}

export function redact(value, keyName = '') {
  if (SECRET_KEYS.has(String(keyName).toLowerCase())) return REDACTED;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (typeof value === 'object') {
    const output = {};
    for (const [key, child] of Object.entries(value)) output[key] = redact(child, key);
    return output;
  }
  return value;
}

function parseJson(text, fallback = null) {
  if (text === null || text === undefined) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}

function retentionIso(occurredAt, days) {
  return new Date(Date.parse(occurredAt) + days * 86_400_000).toISOString();
}

function normalizeCorrelation(input = {}) {
  return redact({
    requestId: input.requestId ?? null,
    traceId: input.traceId ?? null,
    spanId: input.spanId ?? null,
    sessionIdHash: input.sessionIdHash ?? null,
  });
}

function normalizeScope(input = {}) {
  return {
    organizationId: input.organizationId ?? null,
    workspaceId: input.workspaceId ?? null,
  };
}

function toAuditView(row) {
  return {
    sequence: row.sequence,
    id: row.id,
    occurredAt: row.occurred_at,
    receivedAt: row.received_at,
    service: row.service,
    environment: row.environment,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    actor: parseJson(row.actor_json, {}),
    action: row.action,
    resource: parseJson(row.resource_json, {}),
    outcome: row.outcome,
    before: parseJson(row.before_json),
    after: parseJson(row.after_json),
    reason: row.reason,
    source: row.source,
    network: parseJson(row.network_json, {}),
    risk: row.risk,
    retentionClass: row.retention_class,
    correlation: parseJson(row.correlation_json, {}),
    attributes: parseJson(row.attributes_json, {}),
    previousHash: row.previous_hash,
    eventHash: row.event_hash,
  };
}

export function createObservabilityStore({
  dbPath,
  serviceName = 'gbap',
  environment = 'local',
  clock = () => new Date(),
  retention = {},
} = {}) {
  requireString(dbPath, 'db_path', 4096);
  requireString(serviceName, 'service_name', 128);
  requireEnum(environment, 'environment', VALID_ENVIRONMENTS);
  mkdirSync(dirname(dbPath), { recursive: true });

  const retentionPolicy = {
    logInfoDays: retention.logInfoDays ?? 30,
    logErrorDays: retention.logErrorDays ?? 90,
    metricDays: retention.metricDays ?? 30,
    healthDays: retention.healthDays ?? 90,
    alertDays: retention.alertDays ?? 365,
  };

  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS obs_audit_event (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      occurred_at TEXT NOT NULL,
      received_at TEXT NOT NULL,
      service TEXT NOT NULL,
      environment TEXT NOT NULL,
      organization_id TEXT,
      workspace_id TEXT,
      actor_json TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_json TEXT NOT NULL,
      outcome TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      reason TEXT,
      source TEXT NOT NULL,
      network_json TEXT NOT NULL,
      risk TEXT NOT NULL,
      retention_class TEXT NOT NULL,
      correlation_json TEXT NOT NULL,
      attributes_json TEXT NOT NULL,
      previous_hash TEXT NOT NULL,
      event_hash TEXT NOT NULL UNIQUE
    ) STRICT;

    CREATE TRIGGER IF NOT EXISTS obs_audit_no_update
    BEFORE UPDATE ON obs_audit_event
    BEGIN SELECT RAISE(ABORT, 'audit_immutable'); END;

    CREATE TRIGGER IF NOT EXISTS obs_audit_no_delete
    BEFORE DELETE ON obs_audit_event
    BEGIN SELECT RAISE(ABORT, 'audit_immutable'); END;

    CREATE TABLE IF NOT EXISTS obs_log_event (
      id TEXT PRIMARY KEY,
      occurred_at TEXT NOT NULL,
      service TEXT NOT NULL,
      environment TEXT NOT NULL,
      severity TEXT NOT NULL,
      body TEXT NOT NULL,
      source TEXT NOT NULL,
      correlation_json TEXT NOT NULL,
      attributes_json TEXT NOT NULL,
      retention_until TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS obs_metric_sample (
      id TEXT PRIMARY KEY,
      occurred_at TEXT NOT NULL,
      service TEXT NOT NULL,
      environment TEXT NOT NULL,
      name TEXT NOT NULL,
      instrument TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT,
      attributes_json TEXT NOT NULL,
      retention_until TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS obs_health_signal (
      id TEXT PRIMARY KEY,
      occurred_at TEXT NOT NULL,
      service TEXT NOT NULL,
      environment TEXT NOT NULL,
      component TEXT NOT NULL,
      status TEXT NOT NULL,
      latency_ms INTEGER,
      detail TEXT,
      dependencies_json TEXT NOT NULL,
      attributes_json TEXT NOT NULL,
      retention_until TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS obs_alert (
      id TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL UNIQUE,
      rule_id TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      resolved_at TEXT,
      occurrence_count INTEGER NOT NULL,
      context_json TEXT NOT NULL,
      correlation_json TEXT NOT NULL,
      retention_until TEXT NOT NULL
    ) STRICT;
  `);

  function emitAudit(input) {
    const occurredAt = input.occurredAt ? new Date(input.occurredAt).toISOString() : nowIso(clock);
    const receivedAt = nowIso(clock);
    const actor = redact(input.actor ?? {});
    requireEnum(actor.kind ?? 'user', 'actor_kind', new Set(['user', 'service', 'automation', 'system']));
    requireString(actor.id, 'actor_id', 512);
    const action = requireString(input.action, 'action', 256);
    const resource = redact(input.resource ?? {});
    requireString(resource.type, 'resource_type', 256);
    requireString(resource.id, 'resource_id', 512);
    const outcome = requireEnum(input.outcome ?? 'success', 'outcome', VALID_AUDIT_OUTCOMES);
    const source = requireEnum(input.source ?? 'api', 'source', VALID_SOURCES);
    const risk = requireEnum(input.risk ?? 'normal', 'risk', VALID_AUDIT_RISKS);
    const retentionClass = input.retentionClass ?? (risk === 'normal' ? 'auditStandard' : risk === 'privileged' ? 'auditPrivileged' : 'auditSecurity');
    if (!['auditStandard', 'auditPrivileged', 'auditSecurity'].includes(retentionClass)) throw new Error('invalid_retention_class');
    const scope = normalizeScope(input);
    const correlation = normalizeCorrelation(input);
    const network = redact(input.network ?? {});
    const before = input.before === undefined ? null : redact(input.before);
    const after = input.after === undefined ? null : redact(input.after);
    const reason = optionalString(input.reason, 'reason', 4096);
    const attributes = redact(input.attributes ?? {});
    const id = uuid('aud');

    db.exec('BEGIN IMMEDIATE');
    try {
      const previous = db.prepare('SELECT event_hash FROM obs_audit_event ORDER BY sequence DESC LIMIT 1').get();
      const previousHash = previous?.event_hash ?? ZERO_HASH;
      const hashPayload = {
        id, occurredAt, receivedAt, service: serviceName, environment,
        organizationId: scope.organizationId, workspaceId: scope.workspaceId,
        actor, action, resource, outcome, before, after, reason, source, network,
        risk, retentionClass, correlation, attributes,
      };
      const eventHash = sha256(`${previousHash}\n${stableStringify(hashPayload)}`);
      db.prepare(`
        INSERT INTO obs_audit_event(
          id,occurred_at,received_at,service,environment,organization_id,workspace_id,
          actor_json,action,resource_json,outcome,before_json,after_json,reason,source,
          network_json,risk,retention_class,correlation_json,attributes_json,previous_hash,event_hash
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        id, occurredAt, receivedAt, serviceName, environment, scope.organizationId, scope.workspaceId,
        JSON.stringify(actor), action, JSON.stringify(resource), outcome,
        before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after),
        reason, source, JSON.stringify(network), risk, retentionClass,
        JSON.stringify(correlation), JSON.stringify(attributes), previousHash, eventHash,
      );
      db.exec('COMMIT');
      return toAuditView(db.prepare('SELECT * FROM obs_audit_event WHERE id=?').get(id));
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function emitLog(input) {
    const occurredAt = input.occurredAt ? new Date(input.occurredAt).toISOString() : nowIso(clock);
    const severity = requireEnum(input.severity ?? 'INFO', 'severity', VALID_LOG_SEVERITIES);
    const body = sanitizeString(requireString(input.body, 'body', 20_000));
    const source = requireEnum(input.source ?? 'system', 'source', VALID_SOURCES);
    const id = uuid('log');
    const days = ['ERROR', 'FATAL'].includes(severity) ? retentionPolicy.logErrorDays : retentionPolicy.logInfoDays;
    db.prepare(`INSERT INTO obs_log_event(id,occurred_at,service,environment,severity,body,source,correlation_json,attributes_json,retention_until) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
      id, occurredAt, serviceName, environment, severity, body, source,
      JSON.stringify(normalizeCorrelation(input)), JSON.stringify(redact(input.attributes ?? {})), retentionIso(occurredAt, days),
    );
    return { id, occurredAt, service: serviceName, environment, severity, body, source };
  }

  function recordMetric(input) {
    const occurredAt = input.occurredAt ? new Date(input.occurredAt).toISOString() : nowIso(clock);
    const id = uuid('met');
    const name = requireString(input.name, 'metric_name', 256);
    const instrument = requireEnum(input.instrument, 'metric_instrument', VALID_METRIC_INSTRUMENTS);
    if (typeof input.value !== 'number' || !Number.isFinite(input.value)) throw new Error('invalid_metric_value');
    const unit = optionalString(input.unit, 'metric_unit', 64);
    db.prepare(`INSERT INTO obs_metric_sample(id,occurred_at,service,environment,name,instrument,value,unit,attributes_json,retention_until) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
      id, occurredAt, serviceName, environment, name, instrument, input.value, unit,
      JSON.stringify(redact(input.attributes ?? {})), retentionIso(occurredAt, retentionPolicy.metricDays),
    );
    return { id, occurredAt, name, instrument, value: input.value, unit };
  }

  function recordHealth(input) {
    const occurredAt = input.occurredAt ? new Date(input.occurredAt).toISOString() : nowIso(clock);
    const id = uuid('hlth');
    const component = requireString(input.component, 'component', 256);
    const status = requireEnum(input.status, 'health_status', VALID_HEALTH);
    const latencyMs = input.latencyMs === undefined || input.latencyMs === null ? null : Math.max(0, Math.round(Number(input.latencyMs)));
    if (latencyMs !== null && !Number.isFinite(latencyMs)) throw new Error('invalid_latency_ms');
    const detail = optionalString(input.detail, 'health_detail', 4096);
    db.prepare(`INSERT INTO obs_health_signal(id,occurred_at,service,environment,component,status,latency_ms,detail,dependencies_json,attributes_json,retention_until) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, occurredAt, serviceName, environment, component, status, latencyMs, detail,
      JSON.stringify(redact(input.dependencies ?? [])), JSON.stringify(redact(input.attributes ?? {})), retentionIso(occurredAt, retentionPolicy.healthDays),
    );
    return { id, occurredAt, component, status, latencyMs, detail };
  }

  function raiseAlert(input) {
    const seenAt = input.occurredAt ? new Date(input.occurredAt).toISOString() : nowIso(clock);
    const fingerprint = requireString(input.fingerprint, 'alert_fingerprint', 512);
    const ruleId = requireString(input.ruleId, 'alert_rule_id', 256);
    const severity = requireEnum(input.severity, 'alert_severity', VALID_ALERT_SEVERITIES);
    const title = requireString(input.title, 'alert_title', 1024);
    const context = redact(input.context ?? {});
    const correlation = normalizeCorrelation(input);
    const existing = db.prepare('SELECT * FROM obs_alert WHERE fingerprint=?').get(fingerprint);
    if (existing) {
      db.prepare(`UPDATE obs_alert SET rule_id=?,severity=?,status='OPEN',title=?,last_seen_at=?,resolved_at=NULL,occurrence_count=occurrence_count+1,context_json=?,correlation_json=?,retention_until=? WHERE fingerprint=?`).run(
        ruleId, severity, title, seenAt, JSON.stringify(context), JSON.stringify(correlation), retentionIso(seenAt, retentionPolicy.alertDays), fingerprint,
      );
      return { ...db.prepare('SELECT * FROM obs_alert WHERE fingerprint=?').get(fingerprint), context, correlation };
    }
    const id = uuid('alr');
    db.prepare(`INSERT INTO obs_alert(id,fingerprint,rule_id,severity,status,title,first_seen_at,last_seen_at,resolved_at,occurrence_count,context_json,correlation_json,retention_until) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, fingerprint, ruleId, severity, 'OPEN', title, seenAt, seenAt, null, 1,
      JSON.stringify(context), JSON.stringify(correlation), retentionIso(seenAt, retentionPolicy.alertDays),
    );
    return { id, fingerprint, ruleId, severity, status: 'OPEN', title, firstSeenAt: seenAt, lastSeenAt: seenAt, occurrenceCount: 1, context, correlation };
  }

  function resolveAlert(fingerprint, context = {}) {
    requireString(fingerprint, 'alert_fingerprint', 512);
    const resolvedAt = nowIso(clock);
    const current = db.prepare('SELECT * FROM obs_alert WHERE fingerprint=?').get(fingerprint);
    if (!current) throw new Error('alert_not_found');
    const merged = { ...parseJson(current.context_json, {}), ...redact(context) };
    db.prepare(`UPDATE obs_alert SET status='RESOLVED',resolved_at=?,last_seen_at=?,context_json=?,retention_until=? WHERE fingerprint=?`).run(
      resolvedAt, resolvedAt, JSON.stringify(merged), retentionIso(resolvedAt, retentionPolicy.alertDays), fingerprint,
    );
    return { fingerprint, status: 'RESOLVED', resolvedAt, context: merged };
  }

  function verifyAuditChain() {
    const rows = db.prepare('SELECT * FROM obs_audit_event ORDER BY sequence ASC').all();
    let expectedPrevious = ZERO_HASH;
    for (const row of rows) {
      if (row.previous_hash !== expectedPrevious) {
        return { verification: 'FAIL', sequence: row.sequence, id: row.id, reason: 'previous_hash_mismatch' };
      }
      const event = toAuditView(row);
      const hashPayload = {
        id: event.id,
        occurredAt: event.occurredAt,
        receivedAt: event.receivedAt,
        service: event.service,
        environment: event.environment,
        organizationId: event.organizationId,
        workspaceId: event.workspaceId,
        actor: event.actor,
        action: event.action,
        resource: event.resource,
        outcome: event.outcome,
        before: event.before,
        after: event.after,
        reason: event.reason,
        source: event.source,
        network: event.network,
        risk: event.risk,
        retentionClass: event.retentionClass,
        correlation: event.correlation,
        attributes: event.attributes,
      };
      const expectedHash = sha256(`${expectedPrevious}\n${stableStringify(hashPayload)}`);
      if (row.event_hash !== expectedHash) {
        return { verification: 'FAIL', sequence: row.sequence, id: row.id, reason: 'event_hash_mismatch' };
      }
      expectedPrevious = row.event_hash;
    }
    return { verification: 'PASS', eventCount: rows.length, headHash: expectedPrevious };
  }

  function listAudit({ limit = 100 } = {}) {
    const safeLimit = Math.max(1, Math.min(1000, Math.trunc(Number(limit) || 100)));
    return db.prepare(`SELECT * FROM obs_audit_event ORDER BY sequence DESC LIMIT ${safeLimit}`).all().map(toAuditView);
  }

  function getLatestHealth(component) {
    requireString(component, 'component', 256);
    const row = db.prepare('SELECT * FROM obs_health_signal WHERE component=? ORDER BY occurred_at DESC LIMIT 1').get(component);
    if (!row) return null;
    return {
      id: row.id, occurredAt: row.occurred_at, component: row.component, status: row.status,
      latencyMs: row.latency_ms, detail: row.detail, dependencies: parseJson(row.dependencies_json, []), attributes: parseJson(row.attributes_json, {}),
    };
  }

  function listOpenAlerts() {
    return db.prepare("SELECT * FROM obs_alert WHERE status!='RESOLVED' ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END, last_seen_at DESC").all().map((row) => ({
      id: row.id, fingerprint: row.fingerprint, ruleId: row.rule_id, severity: row.severity,
      status: row.status, title: row.title, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at,
      occurrenceCount: row.occurrence_count, context: parseJson(row.context_json, {}), correlation: parseJson(row.correlation_json, {}),
    }));
  }

  function sweepTelemetryRetention(referenceTime = nowIso(clock)) {
    const at = new Date(referenceTime).toISOString();
    const counts = {};
    for (const table of ['obs_log_event', 'obs_metric_sample', 'obs_health_signal']) {
      counts[table] = db.prepare(`DELETE FROM ${table} WHERE retention_until < ?`).run(at).changes;
    }
    counts.obs_alert = db.prepare("DELETE FROM obs_alert WHERE status='RESOLVED' AND retention_until < ?").run(at).changes;
    counts.obs_audit_event = 0;
    return counts;
  }

  function close() {
    db.close();
  }

  return {
    emitAudit,
    emitLog,
    recordMetric,
    recordHealth,
    raiseAlert,
    resolveAlert,
    verifyAuditChain,
    listAudit,
    getLatestHealth,
    listOpenAlerts,
    sweepTelemetryRetention,
    close,
  };
}
