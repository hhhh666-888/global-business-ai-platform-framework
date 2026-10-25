# GBAP Stateful UAT Release Safety v1.0

Status: ACTIVE / PRE-PRODUCTION UAT AUTHORITY  
Date: 2026-09-23  
Scope: Windows company UAT upgrades that retain GBAP/Twenty/Knowledge state.

## Problem closed by this authority

A clean source/build/browser CI can prove that a new revision is internally consistent while still missing defects that exist only when the new revision meets persisted state from an older revision.

The 2026-09-23 Enterprise AI UAT sequence proved this gap twice:

1. a new CRM-AI Provider bootstrap path incorrectly keyed creation from the base CRM Provider;
2. after that was corrected, the persisted CRM-AI Provider reached synchronization and exposed a second assumption: shared migration helpers only admitted the base `twenty-crm / gbap.crm.v1` profile.

Therefore a source-only or fresh-install gate is not sufficient evidence for a retained-state company update.

## Required release sequence

```text
EXACT SOURCE CI
-> EXPLICIT PROVIDER TYPE / CONTRACT MIGRATION MATRIX
-> STATEFUL N-1 -> N SQLITE FIXTURE TEST
-> GOVERNED BACKUP
-> SHADOW MIGRATION ON A COPY OF THAT EXACT BACKUP
-> IDEMPOTENCY SECOND PASS MUST BE UNCHANGED
-> LIVE UAT START / RECONCILE
-> POST-UPDATE UAT
-> ENTERPRISE AI ADMISSION
-> REAL BROWSER / BUSINESS FLOW
```

No later stage may convert an earlier failure into a warning.

## Provider migration matrix

| Provider component | Contract | Allowed migration scope |
|---|---|---|
| `twenty-crm` | `gbap.crm.v1` | canonical CRM / metadata / operational CRM capabilities |
| `twenty-crm-ai` | `gbap.crm-ai.v1` | exactly `crm.ai.v1.reason` |

Unknown component, wrong contract, or capability namespace drift fails closed.

Capability and runtime-provenance migration use the same typed profile authority. A new Provider class must first extend the matrix and stateful tests; callers must not bypass the migration contract.

## Stateful rehearsal

`Test-GBAP-UAT-ProviderMigrationPreflight.ps1` receives the governed pre-update backup path, copies `gbap-substrate.db` into an isolated runtime directory, mounts only that clone plus the candidate migration source into an ephemeral Node container, and runs the candidate migrations there.

The real backed-up database is never modified by the rehearsal.

For every persisted governed Provider covered by the candidate revision:

1. candidate capability migration must succeed;
2. the same capability migration immediately repeated must return `UNCHANGED`;
3. candidate provenance migration must succeed;
4. the same provenance migration immediately repeated must return `UNCHANGED`.

A Provider that does not yet exist in the old snapshot is classified as `BOOTSTRAP_REQUIRED`, not as a migration failure, only when the snapshot contains no conflicting row with that Provider's governed component or contract. A conflicting historical ID/component/contract remains fail-closed as `provider_identity_conflict`.

The normal UAT start path must independently prove and perform both canonical registrations when absent:

- `twenty-crm-uat / twenty-crm / gbap.crm.v1`;
- `twenty-crm-ai-uat / twenty-crm-ai / gbap.crm-ai.v1`.

This distinction is required because retained company UAT may legitimately predate persisted Provider Registry bootstrap even though the surrounding runtime/data is valid.

## Admission dependency

A normal governed `Update-GBAP-UAT.ps1` records:

```text
providerMigrationPreflight = PASS
```

only after the backup-clone rehearsal succeeds.

The preflight also writes `.runtime/provider-migration-preflight.json` binding the PASS to the candidate Git SHA, exact backup path, and SHA-256 of that backup's `manifest.json`.

The first rollout of this gate has an updater self-handoff constraint: an already-running old `Update-GBAP-UAT.ps1` cannot acquire newly added statements after it fast-forwards the working tree. Therefore the newly installed `Start-GBAP-UAT.ps1` independently checks `.runtime/last-backup.txt` and requires or creates matching shadow-migration evidence **before live Provider synchronization**. Future updates reuse exact matching evidence and avoid a duplicate rehearsal.

`Invoke-GBAP-EnterpriseAiAdmission.ps1 -AuthorizeAdmission` requires exact shadow evidence matching current HEAD and the update's pre-update backup. When a newer updater wrote `providerMigrationPreflight`, that field must also be PASS. A source update performed with `-SkipBackup` can never satisfy final Enterprise AI admission.

## Rollback / blast-radius rule

The pre-update governed backup remains the rollback anchor. Stateful rehearsal happens before live Provider-state mutation. Production authorization remains false.

A later production release must add a separate progressive-delivery gate (blue/green or canary/rings with traffic switching and rollback); this UAT authority does not claim Production readiness.
