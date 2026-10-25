# GBAP Stage 3.4｜Observability Governed Backup / Restore｜v0.1

Status: IMPLEMENTED / CI VALIDATION PENDING

## Purpose

Extend the already accepted Local UAT governed backup / restore chain so the active `gbap.audit-observability.v1` runtime state is protected at the same point-in-time boundary as the CRM/application state.

This is an additive Stage 3.4 continuation. It does not reopen or rewrite the previously accepted backup/restore governance record.

## Protected state

New governed backups include:

- `gbap-substrate.db`
- `gbap-observability.db`
- Twenty PostgreSQL logical dump
- Twenty local storage
- Keycloak mutable local data
- `manifest.json` with SHA-256 for every backed-up file

Protected `.env` and `.runtime` secrets remain intentionally excluded and require their separately governed secret set for clean-machine disaster recovery.

## Observability consistency rule

The API writer is stopped before backup. A temporary API runtime opens `/data/observability.db`, executes `PRAGMA wal_checkpoint(TRUNCATE)`, runs `PRAGMA integrity_check`, and closes the database before the database file is copied.

A backup is not accepted if that validation fails.

## Manifest compatibility

The existing manifest identity remains:

- `schemaVersion = 1`
- `environment = gbap-local-uat`

The manifest is extended with:

- `observabilityIncluded = true`
- a normal SHA-256 file entry for `gbap-observability.db`

This keeps the existing isolated E -> F mirror protocol compatible because the mirror already validates the manifest file list generically and requires schema version 1.

## Restore rules

For a backup declaring `observabilityIncluded=true`:

1. `gbap-observability.db` is mandatory.
2. Manifest SHA-256 validation must pass before restore.
3. The restored database must pass SQLite `PRAGMA integrity_check`.
4. The restored append-only Audit SHA-256 chain must pass `verifyAuditChain()` before the restored application is started.
5. Full Local UAT verification must still pass after startup.

For historical backups created before Observability was governed:

- restore remains supported;
- the restore process explicitly reports that historical observability state is unavailable;
- the active runtime creates a fresh observability database after restore;
- no false claim is made that historical logs/metrics/health/audit were recovered.

## Acceptance proof

The Local UAT CI must prove all of the following in one real runtime sequence:

1. boot the real UAT stack;
2. create a CRM restore-point record;
3. create a unique Observability Audit restore-point event;
4. create the governed backup;
5. prove the manifest contains `observabilityIncluded=true` and the exact SHA-256 for `gbap-observability.db`;
6. mutate CRM after the backup;
7. create a second unique Observability Audit event after the backup;
8. restore the exact governed backup;
9. prove the CRM restore-point record returned;
10. prove the post-backup CRM mutation disappeared;
11. prove the pre-backup Observability Audit event returned exactly once;
12. prove the post-backup Observability Audit event disappeared.

## Explicit boundaries

This gate does not add:

- off-host disaster recovery;
- production Go-Live authorization;
- external alert notification delivery;
- host/dependency collectors;
- automatic self-healing / recovery controller.

F: remains a same-host, same-physical-disk logical mirror and is not off-host disaster recovery.

## Gate

PASS only when the real Local UAT backup/restore workflow completes successfully with both CRM and Observability point-in-time rollback evidence.

Next legal continuation after PASS: deploy the merged change to the company Local UAT server, validate one real E backup and isolated F mirror containing `gbap-observability.db`, then continue with notification delivery / host-dependency health collection / bounded self-healing as separate gates.
