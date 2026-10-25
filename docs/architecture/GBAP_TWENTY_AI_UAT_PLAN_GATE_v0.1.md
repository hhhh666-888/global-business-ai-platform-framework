# GBAP Twenty AI Windows UAT Plan Gate v0.1

Status: **SOURCE/CONTRACT PASS / LIVE WINDOWS UAT PLAN NEXT / APPLY NOT AUTHORIZED**

Date: 2026-09-20

Authority:
- `docs/architecture/GBAP_TWENTY_AI_APP_CANDIDATE_B_v0.1.md`
- `docs/architecture/GBAP_TWENTY_AI_IDENTITY_BRIDGE_FOUNDATION_v0.1.md`
- `docs/evidence/GBAP_TWENTY_AI_IDENTITY_BRIDGE_FOUNDATION_EVIDENCE_2026-09-20.md`
- Twenty exact upstream: `twentyhq/twenty@twenty/v2.37.0`

## 1. Purpose

This gate answers one question only:

> What exact metadata changes would Twenty v2.37.0 plan for the accepted GBAP Knowledge App on the real Windows UAT workspace?

It does **not** install or apply the App.

## 2. Exact provider semantics

Twenty v2.37.0 implements `twenty plan` by calling:

`syncApplication(manifest, { dryRun: true })`

The exact metadata mutation is:

```graphql
mutation SyncApplication($manifest: JSON!, $dryRun: Boolean) {
  syncApplication(manifest: $manifest, dryRun: $dryRun) {
    applicationUniversalIdentifier
    actions
  }
}
```

This gate calls that same provider operation with `dryRun = true`.

## 3. Governed manifest snapshot

Windows UAT does not build its own App manifest.

The manifest is generated only by the accepted Stage B native build using the governed offline Twenty v2.37.0 toolchain.

Frozen plan snapshot:

`providers/twenty-adapter/ai-app/uat-plan-manifest.json`

Stage B CI must deep-compare the generated:

`.twenty/output/manifest.json`

against the committed snapshot.

Any structural drift fails CI before a new UAT plan may be trusted.

## 4. Frozen manifest capability

The snapshot must contain:

```text
application universalIdentifier  8b39838e-3f6e-4a26-95f5-b4ac0d686001
required server                   2.37.0
roles                             1
logic functions                   1
logic function                    search-gbap-knowledge
CRM objects                       0
CRM fields                        0
Twenty Agents                     0
Twenty skills                     0
connection providers              0
front components                  0
```

The single role must grant no read-all/update-all/delete-all/destroy-all CRM authority and no object/field permissions.

## 5. Windows UAT execution surface

Script:

`infrastructure/local-uat/Test-GBAP-TwentyAiPlan.ps1`

Default target:

`http://localhost:3000`

The script reuses the existing protected credential:

`infrastructure/local-uat/.runtime/twenty-api-key`

It does not create another Twenty API key.

Evidence output:

`infrastructure/local-uat/.runtime/twenty-ai-plan-evidence.json`

The runtime directory remains gitignored.

## 6. Plan safety rules

The returned Twenty `SyncAction[]` may contain:

```text
create
update
delete
```

GBAP v0.1 is intentionally stricter than the upstream destructive-data check.

The plan is **BLOCKED** when:

- any `delete` action exists;
- any unknown action type exists;
- any action touches:
  - `objectMetadata`;
  - `fieldMetadata`;
  - `agent`;
  - `skill`;
  - `connectionProvider`.

The plan evidence records every returned action for review.

## 7. Explicitly forbidden in this gate

This gate does not call or authorize:

- `createApplicationRegistration`;
- `createDevelopmentApplication`;
- `uploadApplicationFile`;
- `completeApplicationFileUploads`;
- `generateApplicationToken`;
- `twenty apply`;
- `twenty dev --once`;
- `syncApplication(... dryRun: false)`;
- App installation;
- server-variable value mutation;
- Production.

## 8. CI responsibility

GitHub CI validates:

- native Stage B manifest == UAT plan snapshot;
- Windows script contract;
- PowerShell 5.1 compatible source assumptions used by the gate;
- dry-run-only semantics;
- use of the existing API key path;
- no live UAT invocation from GitHub Actions.

GitHub CI cannot claim the live Windows plan ran because the accepted Twenty UAT endpoint is loopback-bound to the Windows host.

## 9. Source/contract closure

Accepted PR:

`#264 feat(ai): admit Twenty Candidate B UAT plan-only gate`

Accepted exact head:

`67a84bad84ccaa235e08ef13e892d863466d445b`

Merged main:

`5412172d8dbd4ac4595a8551404f576f04ca54f9`

Evidence:

`docs/evidence/GBAP_TWENTY_AI_UAT_PLAN_CONTRACT_EVIDENCE_2026-09-20.md`

Exact-head result:

```text
8 triggered checks
8 PASS
0 FAIL
```

The source/contract gate is **PASS**. The live Windows UAT plan remains the next legal action.

## 10. Live Windows evidence requirement

After this source/contract PR is merged and the company Windows UAT is updated through the governed updater, the operator may run:

```powershell
cd E:\GlobalBusinessAIPlatform
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\infrastructure\local-uat\Test-GBAP-TwentyAiPlan.ps1
```

Required successful output includes:

```text
TWENTY_AI_UAT_PLAN_RESULT=PASS
TWENTY_AI_UAT_PLAN_DELETE=0
TWENTY_AI_UAT_APPLY_AUTHORIZED=false
TWENTY_AI_PRODUCTION_AUTHORIZED=false
```

The generated evidence JSON must be inspected before any first-install/apply decision.

## 10. Next gate

Only after real Windows plan evidence is accepted may GBAP open a **separate first-install/apply admission**.

That later gate must separately govern:
- application registration;
- App file upload;
- App installation/sync;
- rollback/uninstall boundary;
- server-variable values;
- live mapped/unmapped/two-employee authorization tests.

Production remains **NOT AUTHORIZED**.
