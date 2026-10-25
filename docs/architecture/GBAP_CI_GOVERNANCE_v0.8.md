# GBAP CI Governance v0.8

Status: **RE-FROZEN / PASS / CLOSED**

Authority: owner-directed runner topology change
Supersedes active topology in: `docs/architecture/GBAP_CI_GOVERNANCE_v0.7.md`
Opened: 2026-09-18

## 1. Owner decision

The project owner has retired the workstation WSL CI runtime and selected one active self-hosted CI execution boundary:

```text
GBAP-CI-VM-CANDIDATE = PRIMARY / ONLY ACTIVE GBAP SELF-HOSTED RUNNER
GBAP-CI-01 / WSL     = RETIRED
```

This is an explicit topology change and therefore a valid v0.7 REOPEN trigger. v0.7 remains immutable historical closure evidence.

The local WSL2 distribution `GBAP-CI` was cleanly unregistered on 2026-09-18 and its storage path `F:\WSL\GBAP-CI` no longer exists. Windows Docker Desktop remains a separate WSL distribution and is outside this retirement action.

GitHub-side removal of any stale/offline `GBAP-CI-01` registration is an administrative cleanup step and does not change workflow routing.

## 2. Target accepted runner topology

```text
GBAP-CI-VM-CANDIDATE
  service role     PRIMARY / ONLY ACTIVE GBAP SELF-HOSTED RUNNER
  selectors        gbap-ci / gbap-ci-primary / gbap-ci-vm-candidate
  responsibilities Fast CI capacity
                   control + CRM + Local-UAT Final
                   focused Final handoff verification
                   authoritative Final reporting

GBAP-CI-01
  service role     RETIRED
  selectors        none in active workflows
  responsibilities none
```

No active workflow may require `gbap-ci-overflow`, `GBAP-CI-01`, or a WSL-only CI path.

## 3. Normal Final topology

Trusted Command Bridge:

`.github/workflows/ci-final-command.yml`

Normal Heavy workflow:

`.github/workflows/ci-final-self-hosted.yml`

Runner selector:

`[self-hosted, linux, x64, gbap-ci-primary]`

Routing remains:

```text
/gbap-final control    -> VM PRIMARY control
/gbap-final crm        -> VM PRIMARY control + CRM
/gbap-final local-uat  -> VM PRIMARY Local-UAT
/gbap-final all        -> VM PRIMARY serial control + CRM + Local-UAT
/gbap-final handoff    -> VM PRIMARY focused handoff
```

The former VM+WSL parallel Final workflow is retired from the active repository tree. Its historical evidence remains available in Git history and v0.6/v0.7 governance records.

## 4. Fast and focused CI

Fast CI may continue to select:

`[self-hosted, linux, x64, gbap-ci]`

The accepted VM runner already carries the `gbap-ci` service label.

Browser/focused CI that selects `gbap-ci-primary` continues to route to the same VM runner.

A VM-only topology proof must assert:

1. runner identity is exactly `GBAP-CI-VM-CANDIDATE`;
2. Linux/X64 runner boundary;
3. VM toolchain and Docker availability;
4. GitHub control-plane health;
5. governed dependency supply;
6. no active workflow contains `GBAP-CI-01`, `gbap-ci-overflow`, or the former WSL overflow job.

## 5. Evidence reuse and Heavy policy

This topology retirement does not change CRM behavior, Local-UAT implementation, identity lifecycle, persistence, backup/restore semantics, or Production authority.

Therefore the accepted rule remains:

```text
PASS EVIDENCE REUSE
+ FAILED/AFFECTED-SCOPE RERUN
+ NO DUPLICATE HEAVY CI
```

A duplicate full Heavy Final is not required solely to prove removal of an unused backup runner. The affected acceptance scope is VM runner identity/routing/control-plane plus Fast/static governance checks.

If the VM fails an affected proof, the topology remains open and must not be re-frozen.

## 5.1 Frozen heavyweight Knowledge acceptance

The accepted Knowledge GTE/RAGFlow evidence is already PASS/FROZEN and is not reopened by retiring WSL. The existing heavyweight Knowledge workflows require at least 10 GiB for real runtime/benchmark execution, while the current VM-primary guest reports approximately 3.2 GiB total memory under its present allocation.

Therefore these heavyweight workflows are **manual-only** under v0.8. They are not ordinary PR gates and must not be auto-run merely because runner topology changed. Re-dispatch requires an explicit Knowledge gate reopen plus a resource-capable execution decision. Normal Fast/Final CI remains VM-only.

## 6. Formal-UAT / Production isolation

Unchanged:

```text
Formal Windows UAT
  E:\GlobalBusinessAIPlatform
  Windows Docker Desktop
  formal ports / named volumes / .env / .runtime / business data
  OUTSIDE CI
```

Removing the workstation WSL CI distribution does not authorize any destructive Docker Desktop cleanup and does not change Formal Windows UAT.

Production Go-Live remains **NOT AUTHORIZED**.

## 7. Operational retirement requirements

Before v0.8 RE-FREEZE:

- local `GBAP-CI` WSL distribution absent;
- local `F:\WSL\GBAP-CI` storage absent;
- old Windows WSL keepalive task absent or disabled;
- active workflows contain no WSL/overflow selector;
- VM-only topology proof PASS;
- Fast CI PASS;
- stale GitHub runner registration, if still present, is removed administratively or explicitly recorded as offline cleanup pending.

Do not delete or stop Docker Desktop's own `docker-desktop` WSL distribution as part of this work.

## 8. Closure state

Current state:

```text
OWNER TOPOLOGY DECISION       ACCEPTED
LOCAL WSL DISTRO             RETIRED / UNREGISTERED
LOCAL WSL STORAGE            REMOVED
WINDOWS WSL KEEPALIVE        REMOVED
ACTIVE WORKFLOW CUTOVER      PASS / VM-ONLY
VM-ONLY TOPOLOGY PROOF       PASS / run 35328428903
FAST CI                      PASS / run 35328428996
GITHUB RUNNER REGISTRATION   stale/offline cleanup optional if still displayed
CI GOVERNANCE v0.8           RE-FROZEN / PASS / CLOSED
```

Closure evidence:

`docs/evidence/GBAP_CI_V0_8_CLOSURE_2026-09-18.md`

The accepted implementation head before closure-doc synchronization is `009fbf6e279b6e3c5f712c37e56803daebdf9b39`. Final closure-doc synchronization remains subject to exact-head Fast CI and VM-only topology proof before merge.
