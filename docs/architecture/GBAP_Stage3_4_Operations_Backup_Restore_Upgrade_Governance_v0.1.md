# GBAP Stage 3.4 continuation｜Operations Backup / Restore / Upgrade Governance v0.1

Status: `IMPLEMENTED FOR VALIDATION / COMPANY UAT OPERATIONS FOUNDATION / PRODUCTION GO-LIVE NOT AUTHORIZED`

Authority baseline: `docs/architecture/GBAP_STAGE3_ACTIVE_BASELINE_v1.0.md`

Scope: harden the already-deployed company Local UAT so real trial data can be maintained, backed up, restored and upgraded through governed repeatable procedures.

---

## 1. Purpose

This continuation does not add CRM business features and does not reopen the accepted Full CRM Real Wiring closure.

It establishes an operations reliability boundary around the accepted CRM:

```text
GitHub main
→ governed deployment clone
→ mandatory pre-update backup
→ fast-forward update only
→ persistent Docker data
→ post-update UAT verification
→ recorded update evidence
```

and:

```text
running UAT data
→ quiesced writers
→ integrity-checked backup
→ optional independent mirror
→ governed restore
→ startup
→ full UAT verification
```

---

## 2. Data authority and backup contents

A governed business-data backup contains:

- GBAP SQLite substrate/native CRM state;
- Twenty PostgreSQL database dump;
- Twenty local file storage;
- Keycloak local UAT state;
- human-readable backup README;
- machine-readable `manifest.json`.

`manifest.json` records:

- backup schema version;
- environment identity;
- UTC creation time;
- installed Git SHA;
- Docker Compose SHA-256;
- retention policy used;
- file path, size and SHA-256 for every backed-up file.

A backup is not accepted for governed one-click restore if the manifest identity is unsupported or any required file/hash validation fails.

---

## 3. Secret boundary

Ordinary business-data backups intentionally exclude:

```text
infrastructure/local-uat/.env
infrastructure/local-uat/.runtime
```

These contain credentials, API keys and generated runtime secrets.

Therefore:

```text
IN-PLACE DATA RESTORE
= supported by Restore-GBAP-UAT.ps1 when the matching current secret set still exists

CLEAN-MACHINE / OFF-HOST DISASTER RECOVERY
= requires separately protected recovery of the matching .env/.runtime secret set
= NOT YET CLAIMED AS PROVEN by this record
```

Secrets must never be committed to Git or copied unencrypted into ordinary shared backup locations.

---

## 4. Backup policy

Current company-UAT default policy:

```text
Automatic local backup cadence = DAILY
Default local scheduled time = 02:00 local time
Default retention = 30 days
Pre-update backup = MANDATORY
Pre-restore safety backup = DEFAULT ON
Independent mirror = SUPPORTED / operator-configured
```

The backup scheduler is intentionally installed in the interactive Windows user context because the current topology uses Docker Desktop. This is a UAT operating constraint, not a target production service model.

An independent mirror should point to a different physical disk, protected NAS, or other separately administered storage when available. Copying into another folder on the same physical failure domain does not constitute full disaster recovery.

---

## 5. Restore policy

`Restore-GBAP-UAT.ps1` is the single governed in-place restore path.

Required sequence:

1. select explicit backup path or explicit `-Latest`;
2. validate manifest identity and all SHA-256 hashes;
3. create current-state safety backup unless explicitly suppressed for controlled CI/emergency use;
4. quiesce application writers;
5. restore Twenty PostgreSQL;
6. replace GBAP SQLite state;
7. replace Twenty local storage;
8. replace Keycloak local state;
9. restart through the standard Start script;
10. run full Local UAT verification;
11. record local restore evidence.

A restore is not PASS merely because files were copied. The environment must start and the UAT verifier must pass.

---

## 6. Real restore proof required by CI

The Local UAT workflow is extended from restart persistence proof to actual restore semantics.

CI must prove:

```text
create CRM Account A
→ backup
→ create CRM Account B after backup
→ restore exact backup
→ Account A exists
→ Account B does not exist
→ health / auth / provider / CRM verification PASS
```

This distinguishes true recovery-point restoration from simple container restart persistence.

---

## 7. Upgrade governance

`Update-GBAP-UAT.ps1` remains the only normal company-UAT source upgrade path.

Controls:

- deployment must be a Git clone;
- working tree must be clean;
- branch is normalized to `main`;
- `origin/main` is fetched first;
- installed revision must be an ancestor of target revision;
- update is `--ff-only`;
- governed backup is mandatory by default;
- named data volumes are retained;
- Start + full UAT Test must pass after update;
- `.runtime/last-update.json` records from/target/installed SHAs and pre-update backup path.

`-SkipBackup` remains an exceptional automation/testing switch and is not the normal operator path.

---

## 8. Update rollback governance

`Rollback-GBAP-UAT-Update.ps1` is the governed rollback path for the last recorded update.

It requires:

- clean deployment working tree;
- previous Git commit still available;
- valid pre-update governed backup;
- current-state safety backup by default.

Rollback restores the pair:

```text
previous application revision
+
matching pre-update business-data recovery point
```

and then reruns the same UAT verification.

Blind source-code rollback without matching data restore is not accepted when a failed update may have changed persistent state.

---

## 9. Operator prohibitions

Company UAT operators must not:

- use `docker compose down -v` on the live company environment;
- run `docker volume prune` or `docker system prune --volumes` against the live data set;
- manually replace Twenty/PostgreSQL/SQLite data while writers are running;
- manually edit the deployment clone and then run the governed updater;
- delete `.env`, `.runtime`, or Docker Desktop data roots as cleanup;
- treat a backup file as valid without integrity validation;
- treat a backup as DR proof without a restore drill.

---

## 10. Review cadence

Current minimum UAT operating cadence:

- daily automatic backup;
- backup before every material update;
- monthly real restore drill;
- restore drill after material backup/restore implementation changes;
- periodic verification that independent mirror storage is actually reachable and receiving valid manifests;
- preserve update/restore/rollback evidence under `.runtime` locally.

No fixed production RPO/RTO is declared by this record because measured production recovery timing has not yet been proven.

---

## 11. Production boundary

This record materially improves operational safety but does not authorize Production Go-Live.

Still required for production closure:

- immutable production image/config/schema identity;
- production-grade secret storage, rotation and service identities;
- clean-machine/off-host recovery including protected secret recovery;
- measured restore timing and approved RPO/RTO;
- production monitoring/alerting and named operational ownership;
- production host/network hardening;
- license/legal acceptance;
- explicit Production Go-Live Gate.

---

## 12. Acceptance gate for this continuation

This implementation can be accepted only when:

```text
PowerShell static parse = PASS
Compose render = PASS
Local UAT first boot = PASS
Restart persistence = PASS
Governed backup creation = PASS
Backup manifest/hash validation = PASS
Exact backup restore = PASS
Restore-point record present = PASS
Post-backup record absent = PASS
Post-restore full UAT = PASS
```

Until those checks pass on the implementation HEAD, status remains `IMPLEMENTED FOR VALIDATION`, not frozen.
