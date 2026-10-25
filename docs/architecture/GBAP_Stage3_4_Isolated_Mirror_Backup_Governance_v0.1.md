# GBAP Stage 3.4 continuation｜Isolated Mirror Backup Governance v0.1

Status: `PASS / SAME-HOST LOGICALLY ISOLATED MIRROR ACCEPTED / PRODUCTION GO-LIVE NOT AUTHORIZED`

## 1. Purpose

Separate the Docker-dependent governed backup producer from the ACL-protected mirror writer.

```text
02:00  ming / interactive Docker Desktop session
→ Backup-GBAP-UAT.ps1
→ E:\GlobalBusinessAIPlatform\infrastructure\local-uat\.backups

03:00  DESKTOP-...\GBAPBackupSvc / password logon scheduled task
→ Mirror-GBAP-UAT-Backup.ps1
→ validate source manifest + SHA-256
→ copy through staging
→ validate copied files + provenance
→ F:\GBAP-Backups
```

## 2. Permission model

`E:\...\.backups`:

- SYSTEM: Full Control
- Administrators: Full Control
- `ming`: Modify
- `GBAPBackupSvc`: Read & Execute
- inherited broad `Authenticated Users: Modify` must be removed from this directory

`F:\GBAP-Backups`:

- SYSTEM: Full Control
- Administrators: Full Control
- `GBAPBackupSvc`: Modify
- `ming`: Read & Execute only
- inheritance removed

This means ordinary processes running as `ming`, including Codex/IDE/ordinary scripts, cannot create, modify or delete mirror backups on F:.

## 3. Operational separation

The normal daily backup task must not use `-MirrorRoot` after ACL separation because it runs as `ming` and intentionally cannot write F:.

Tasks:

- `GBAP-GBAP-UAT-DailyBackup` — 02:00 — `ming` — produces governed E: backup
- `GBAP-GBAP-UAT-MirrorBackup` — 03:00 — `GBAPBackupSvc` — copies latest completed governed backup E: → F:

The mirror task does not access Docker and does not require the Docker Desktop interactive session to remain logged on.

## 4. Mirror acceptance

A mirror is accepted only when:

1. source `manifest.json` exists and is schemaVersion 1 for `gbap-local-uat`;
2. every source manifest file exists, has the expected byte length and SHA-256;
3. manifest paths cannot escape the backup root;
4. copy completes into a staging directory;
5. every staged mirror file again passes byte-length and SHA-256 validation;
6. Git SHA and Compose SHA-256 provenance match source;
7. staging directory is renamed to the timestamped final mirror path;
8. `mirror-verification.json` records PASS evidence;
9. retention cleanup removes only timestamped mirror backups older than the configured policy.

Existing timestamped mirror directories are never silently overwritten; they are re-verified instead.

## 5. CI acceptance evidence

Workflow: `Stage 3.4 Isolated Mirror Backup`

Accepted run: `33542195356` / run #1

Accepted implementation HEAD before this evidence-only status update: `f463c231504684465438a57e0e5d4eac87ae81b6`

Results:

- PowerShell parse — PASS
- synthetic governed source backup — PASS
- isolated staging copy — PASS
- source SHA-256 verification — PASS
- destination SHA-256 verification — PASS
- `mirror-verification.json` creation — PASS
- deliberate destination tamper rejection — PASS

The evidence-only status update must itself retain green CI before merge.

## 6. Threat boundary

This materially reduces risk from accidental or regression-driven deletion by tools running as the daily development account.

It does **not** protect against:

- administrator/root-equivalent destructive actions;
- physical failure of Disk 0 when E: and F: are partitions on the same physical disk;
- ransomware/processes running with administrator or backup-account credentials;
- loss of separately protected `.env` / `.runtime` secrets required for clean-machine recovery.

Therefore this is classified as:

`SAME-HOST / LOGICALLY SEPARATED MIRROR`

not:

`OFF-HOST DISASTER RECOVERY`.

## 7. Production boundary

Production Go-Live remains NOT AUTHORIZED. True off-host disaster recovery still requires a second physical failure domain or protected remote storage plus protected secret recovery and a clean-machine restore drill.
