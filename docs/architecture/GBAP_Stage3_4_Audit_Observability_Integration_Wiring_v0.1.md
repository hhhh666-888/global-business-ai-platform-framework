# GBAP Stage 3.4 continuation | Audit + Observability Integration Wiring v0.1

Status: IMPLEMENTED / CI VALIDATION PENDING / COMPANY-SERVER DEPLOYMENT NOT YET CLAIMED

Scope: Connect the accepted `gbap.audit-observability.v1` foundation to the current GBAP API and CRM runtime with minimal intrusion. This does not authorize Production Go-Live.

## 1. Objective

Turn the accepted common substrate from an isolated runnable capability into a real runtime path for the current GBAP API/CRM by wiring:

- HTTP request correlation;
- API technical logs;
- HTTP request metrics;
- API health signals;
- authentication/authorization denial audit;
- existing CRM/provider/native legacy audit evidence into the v1 append-only audit lane.

The integration MUST preserve existing CRM behavior and MUST NOT delete or silently rewrite the legacy `audit_event` evidence.

## 2. Integration Seam

The existing API already boots through `apps/api/bootstrap.mjs`, which intercepts the Node HTTP server before requests reach CRM native routes or the main substrate API.

Decision:

```text
HTTP request
   |
   v
API Observability Wrapper
   |-- requestId / W3C trace correlation
   |-- response timing / metrics / logs / health
   |
   v
CRM Native Interceptor
   |
   v
Main GBAP API / CRM capability invocation
```

This seam covers both CRM-native and main API traffic without first rewriting the large CRM/API implementation.

## 3. Runtime Store

The API uses:

```text
/data/substrate.db       existing platform/CRM state + legacy audit evidence
/data/observability.db   v1 audit/log/metric/health/alert substrate
```

Both are persisted in the current API `/data` named volume. They are separate SQLite files and have separate semantics.

The observability database is not yet claimed as included in the governed Backup/Restore script; that is a later operational wiring action.

## 4. Request Correlation

For every HTTP request the wrapper establishes:

- `x-gbap-request-id`: accepted only when syntactically sane, otherwise `req_<uuid>` is generated;
- W3C `traceparent`: valid incoming trace-id is continued with a new span-id; otherwise a new trace-id/span-id is generated;
- organization/workspace scope from existing GBAP headers;
- bounded network context: remote address, first forwarded-for value, user-agent.

The response returns `x-gbap-request-id` and a `traceparent` value so troubleshooting can correlate the response with stored technical evidence.

## 5. HTTP Telemetry Wiring

Each completed request emits:

- `http.server.request.count` counter;
- `http.server.request.duration` histogram in milliseconds;
- latest API health signal;
- WARN technical log for 4xx;
- ERROR technical log for 5xx.

A 401 or 403 also emits a v1 security audit event:

```text
action: auth.request.denied
resource: HttpRoute
outcome: denied
risk: security
requestId / traceId / spanId / organization / workspace / network context
```

This captures denied request evidence without logging credentials or bearer tokens.

## 6. Legacy CRM Audit Bridge

Current CRM/API code already produces legacy rows for selected real operations, including provider governance, mappings, CRM native files/saved views, and selected CRM boundary/provider failures.

The bridge:

1. reads legacy `audit_event` in SQLite row order;
2. preserves original actor subject/username and occurrence timestamp;
3. maps target prefixes into v1 resource type/id;
4. infers success/denied/failed outcome from existing action semantics;
5. maps existing `before` / `after` fields when legacy payload contains them;
6. recursively redacts the legacy payload before v1 persistence;
7. appends the converted event into the v1 SHA-256 audit chain;
8. records a durable legacy-id -> v1-id bridge mapping;
9. advances a persistent row cursor only after successful v1 append;
10. is idempotent and never deletes or edits the source legacy row.

### Correlation limitation

Legacy audit rows do not persist request-id/trace-id today. Therefore bridged legacy events MUST NOT be falsely attributed to the current HTTP request. The v1 attributes explicitly state:

`legacy event did not persist request/trace ids`

Direct per-operation v1 emitter migration is a subsequent step if exact request correlation and richer before/after semantics are required for every CRM write.

## 7. What Is Now Wired

After this change is deployed and verified:

- API/CRM HTTP traffic -> v1 request metrics;
- API/CRM HTTP traffic -> v1 health history;
- API/CRM HTTP 4xx/5xx -> technical logs;
- HTTP 401/403 -> v1 security audit;
- existing legacy CRM/provider/native audit -> v1 tamper-evident audit chain;
- startup -> technical log + API health signal;
- historical legacy audit rows -> one-time/idempotent v1 bridge.

## 8. What Is NOT Yet Claimed

This integration does NOT yet claim:

- every CRM create/update/delete has a direct v1 emitter;
- every CRM mutation has complete before/after snapshots;
- every legacy event has exact request/trace correlation;
- user-visible Admin Audit/Monitoring Console;
- Keycloak/Twenty/Postgres/Redis/host CPU/RAM/disk collectors;
- active alert evaluator for all baseline alert policies;
- email/Slack/WeChat/SMS notification delivery;
- observability DB included in governed backup/restore;
- off-host immutable audit retention;
- automatic service recovery/self-healing;
- Production Go-Live authorization.

## 9. Health vs Self-Healing Boundary

Health and Alert answer:

> What is unhealthy, since when, and how severe is it?

They do not automatically answer:

> Should the platform restart or mutate a stateful service?

The current Docker runtime already has `restart: unless-stopped` on major services. That is container runtime restart behavior, not observability-driven self-healing.

Future Self-Healing must be a separate bounded recovery policy. A safe future posture is:

- stateless web/api/worker: bounded automatic restart may be allowed with retry ceilings;
- stateful identity/database/CRM storage components: alert-first, no blind restart loop;
- repeated recovery failure: escalate to CRITICAL and stop automatic escalation.

No self-healing claim is made by this integration.

## 10. Acceptance Gate

Required before merge:

- integration module parses on Node 24;
- legacy CRM audit bridge is idempotent;
- actor/resource/outcome semantics preserved;
- secret redaction proven after bridge;
- v1 audit hash chain remains PASS;
- HTTP request-id/trace-id propagation proven;
- request count + duration metrics proven;
- 4xx technical log proven;
- API health persistence proven;
- 401/403 security audit correlation proven;
- Local UAT compose renders with persistent observability DB;
- API image builds with observability runtime;
- existing full CRM Local UAT regression remains green.

Status at document creation: implementation committed; CI validation pending.

## 11. Next Legal Action After Acceptance

`Audit + Observability Foundation | Direct CRM Audit Semantics + Dependency/Host Health Wiring`

Priority:

1. migrate material CRM writes to direct v1 audit with authoritative before/after;
2. make audit read/export itself auditable;
3. collect Keycloak/Twenty/Postgres/Redis/container/host health and disk capacity;
4. activate baseline alert evaluator;
5. add actual notification channel;
6. include `observability.db` in governed Backup/Restore;
7. only then assess a separate bounded Self-Healing layer.
