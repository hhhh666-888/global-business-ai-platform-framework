# GBAP Stage 3.4 continuation | Audit + Observability Foundation v0.1

Status: PASS / ARCHITECTURE + CONTRACT ACCEPTED / MINIMUM RUNNABLE VERIFIED / INTEGRATION WIRING NOT YET STARTED

Scope: GBAP-wide common substrate. This is not CRM-specific and does not authorize Production Go-Live.

## 1. Objective

Create one durable platform boundary for:

- Audit evidence: who did what, to which resource, when, from where, with what before/after state and outcome.
- Technical logs: why a component failed or behaved unexpectedly.
- Metrics: quantitative runtime signals.
- Health: current component/dependency state.
- Alerts: policy-driven actionable incidents with deduplication and lifecycle.
- Correlation: request/session/trace linkage across UI, API, worker, scheduler, provider and automation boundaries.

Future business modules MUST integrate through this common contract rather than creating module-specific audit/log tables or coupling directly to a monitoring vendor.

## 2. Existing State / Compatibility

The current API already contains a small legacy `audit_event` table and `/api/audit` reader used by early substrate/provider operations. It is valid historical evidence but it is not the new canonical audit model because it lacks the full actor/resource envelope, before/after semantics, correlation model, retention class, redaction contract and tamper-evident chain.

Decision:

- Do not delete or rewrite legacy audit rows.
- Do not silently redefine the legacy table in-place.
- Accept `gbap.audit-observability.v1` as the new common contract.
- A later integration step will map/bridge legacy audit evidence into the v1 read model and then migrate emitters incrementally.
- CRM and other business modules remain outside this foundation acceptance.

## 3. Architecture

```text
UI / API / Worker / Scheduler / Provider / Automation / Admin
                         |
                         v
             GBAP Observability Emitter Contract
                         |
            +------------+-------------+
            |                          |
            v                          v
     AUDIT EVIDENCE LANE        TELEMETRY LANE
     append-only intent          logs / metrics / health
     redact before persist       redact before persist/export
     hash-chain integrity        replaceable sinks/adapters
            |                          |
            v                          v
   canonical audit store      OTel-compatible pipeline
            |                          |
            +------------+-------------+
                         v
                 Alert Policy Engine
                         |
                         v
              Alert Store + Dispatchers
```

Business code owns only semantic events and correlation context. It MUST NOT know whether the downstream provider is OpenTelemetry Collector, Prometheus, Grafana, Loki, a managed service, or another compliant provider.

## 4. Signal Separation

### 4.1 Audit

Audit is governance evidence, not debug logging.

Required semantic core:

- event id
- occurred/received timestamps
- service/environment
- organization/workspace scope when relevant
- actor kind + durable actor id + display username when available
- action
- resource type + durable resource id
- outcome: success / denied / failed
- before / after for material changes
- reason
- source
- network context
- risk class
- request / trace / span / session-hash correlation
- additional redacted attributes
- previous hash + event hash

Application-facing audit persistence is append-only. The minimum implementation adds SQLite triggers preventing UPDATE/DELETE and a SHA-256 chain so external database tampering is detectable. Host/database administrators remain outside the application trust boundary; hash-chain verification detects, but by itself cannot physically prevent, an administrator from destroying the whole database.

### 4.2 Technical logs

Technical logs diagnose runtime behavior and may be rotated. They never substitute for audit evidence.

Severity: TRACE / DEBUG / INFO / WARN / ERROR / FATAL.

### 4.3 Metrics

Metric instruments: counter / updowncounter / gauge / histogram.

Names and attributes should follow OpenTelemetry semantic conventions when a standard name exists. Units are metadata and should not be redundantly encoded into metric names unless meaning requires it.

### 4.4 Health

Health status: UP / DEGRADED / DOWN / UNKNOWN.

A health signal may contain latency and dependency status but must not expose secrets.

### 4.5 Alerts

Alert severity: INFO / WARNING / CRITICAL.

Alert lifecycle: OPEN -> ACKNOWLEDGED -> RESOLVED.

Repeated observations with the same fingerprint update one lifecycle rather than generate alert storms.

## 5. IDs and Correlation

Signal IDs use a typed prefix plus UUID v4:

- `aud_<uuid>`
- `log_<uuid>`
- `met_<uuid>`
- `hlth_<uuid>`
- `alr_<uuid>`

Request IDs are `req_<uuid>` or a trusted propagated request id.

Distributed trace propagation aligns with W3C Trace Context using `traceparent` / `tracestate`. GBAP persists trace-id/span-id correlation fields where present; it does not invent a competing distributed trace protocol.

## 6. Secret / Sensitive Data Boundary

The emitter MUST redact before persistence/export.

Forbidden direct fields include at least:

- passwords
- Authorization headers
- access/refresh tokens
- API keys
- client secrets
- private keys
- cookies
- connection strings

Before/after snapshots record only data needed to explain the material change. Session data uses a hash or opaque non-secret id, not authentication credentials.

The minimum implementation performs recursive key redaction plus common inline token redaction. Provider-specific DLP/classification can be added behind the same boundary later.

## 7. Retention

Baseline contract:

| Data | Baseline |
| --- | ---: |
| standard audit | minimum 730 days; no automatic hard delete |
| privileged audit | minimum 1095 days; no automatic hard delete |
| security audit | minimum 1095 days; no automatic hard delete |
| INFO/normal technical logs | 30 days |
| ERROR/FATAL technical logs | 90 days |
| metrics | 30 days |
| health history | 90 days |
| alert lifecycle | 365 days |

Legal/contract/country requirements may extend retention. Shortening audit retention requires an explicit governance decision. The minimum implementation's retention sweep explicitly never deletes audit events.

## 8. Permission Boundary

Baseline roles/capabilities:

- `substrate-user`: causes business audit emission indirectly through authorized actions; no platform audit reader.
- `substrate-manager`: future scope-limited business audit read when enabled by module policy.
- `substrate-admin`: platform audit/log/health/alert read, alert acknowledgement and reasoned audit export.
- `ops-service`: technical signal emission and alert evaluation.
- `backup-service`: backup/mirror audit and health emission only.

No application role receives UPDATE/DELETE permission over audit evidence.

Reading/exporting audit evidence is itself an auditable action when the read API is wired.

## 9. Storage Boundary

Minimum runnable implementation:

- dedicated SQLite observability DB, separate from CRM/provider state;
- WAL + busy timeout;
- append-only audit triggers;
- SHA-256 event chain;
- telemetry tables with explicit retention timestamps;
- deduplicated alert lifecycle.

Production target:

- durable centralized audit store with stronger physical/administrative separation;
- OpenTelemetry-compatible telemetry pipeline;
- replaceable log/metric/trace/alert providers behind adapters.

Provider selection is deliberately not frozen by this foundation.

## 10. Baseline Alert Policy

Initial contract rules:

- API unavailable >= 3 min -> CRITICAL
- database DOWN >= 1 min -> CRITICAL
- no successful governed source backup > 26 h -> WARNING
- no successful governed source backup > 50 h -> CRITICAL
- no PASS isolated mirror verification > 27 h -> WARNING
- disk used ratio >= 80% -> WARNING
- disk used ratio >= 90% -> CRITICAL
- authentication failures >= 10 / 5 min -> WARNING
- required provider unavailable >= 5 min -> WARNING

These are policy definitions. Actual collectors/evaluators and notification channels are a later wiring step.

## 11. Minimum Runnable Implementation

Files:

- `contracts/observability/v1/contract.json`
- `apps/observability/observability.mjs`
- `tests/observability/minimum-runnable.mjs`
- `.github/workflows/stage3-4-audit-observability-foundation.yml`

Verified capabilities:

1. contract parse and invariant enforcement;
2. typed audit events;
3. before/after and actor/resource semantics;
4. recursive secret redaction before persistence;
5. request/trace correlation;
6. append-only audit boundary;
7. SHA-256 chain verification;
8. detection of tampering performed outside the application boundary;
9. technical log persistence;
10. metrics persistence;
11. health persistence/query;
12. alert fingerprint deduplication and resolution;
13. telemetry retention while audit remains untouched.

Acceptance evidence:

- workflow: `Stage 3.4 Audit + Observability Foundation`
- run: `33550943598`
- job: `Contract + minimum runnable proof`
- result: `SUCCESS`
- proof steps: contract/module parse PASS; minimum runnable proof PASS; foundation boundary enforcement PASS.

## 12. Not Yet Claimed

This foundation does NOT yet claim:

- CRM emitters migrated to v1;
- user-visible Admin Audit Console;
- OpenTelemetry Collector deployed;
- Prometheus/Grafana/Loki or equivalent selected/deployed;
- host metrics collector deployed;
- email/Slack/WeChat/SMS notification channel deployed;
- audit database included in governed server backup;
- off-host immutable audit retention;
- Production Go-Live authorization.

Those are subsequent integration/deployment steps after the common contract is accepted.

## 13. External Alignment

Design references used for the foundation:

- OpenTelemetry Semantic Conventions: https://opentelemetry.io/docs/specs/semconv/
- OpenTelemetry Logs Data Model: https://opentelemetry.io/docs/specs/otel/logs/data-model/
- W3C Trace Context: https://www.w3.org/TR/trace-context/
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

OpenTelemetry is used as a compatibility target, not as a mandatory vendor/runtime dependency at this stage.

## 14. Gate

Architecture + Contract Gate: PASS

- unified signals defined: YES
- ID/correlation model defined: YES
- storage boundary defined: YES
- retention defined: YES
- permission boundary defined: YES
- secret boundary defined: YES
- integration interface defined: YES
- vendor neutrality preserved: YES

Minimum Runnable Gate: PASS

- implementation committed: YES
- CI proof: SUCCESS
- deliberate tamper detection: PASS
- secret redaction proof: PASS
- audit-preserving retention proof: PASS

Frozen/accepted at this gate:

- `gbap.audit-observability.v1` signal separation and common envelope;
- audit append-only application boundary and tamper-detection requirement;
- vendor-neutral emitter boundary;
- baseline retention and secret-exclusion rules;
- W3C-compatible trace correlation approach.

Not frozen:

- production telemetry vendor/provider selection;
- notification channels;
- production physical audit-store technology;
- module-specific event taxonomy extensions.

Next legal action:

`Audit + Observability Foundation | Integration Wiring` — connect the current API/legacy audit path, HTTP request correlation, backup/update/restore events and health/alert producers to the accepted common substrate without coupling business modules to a vendor.
