# GBAP CI Governance v0.4

Status: REOPEN / PROXY-INDEPENDENT CI CANDIDATE / NOT FROZEN
Authority: Stage 3.4 engineering governance
Last frozen authority: `GBAP_CI_GOVERNANCE_v0.3.md`
Date: 2026-09-03

## Governance change record

This document explicitly REOPENS the frozen v0.3 CI control plane for one bounded change: make normal self-hosted Fast CI and Final Gate independent of the Windows desktop proxy for Docker/image/npm dependency supply.

The frozen v0.3 facts are not silently rewritten. Until a fresh proxy-OFF proof passes and a later governance version re-freezes the result, `PROXY-INDEPENDENT CI` is NOT authorized as PASS.

## Evidence already established before this reopen

- GBAP-CI remains isolated from formal Windows UAT, Docker Desktop, formal volumes, networks, ports and data.
- PR #62 established persistent CI dependency supply Stage A and was merged.
- PR #63 completed offline dependency-supply inputs and was merged.
- Governed `GBAP CI Dependency Supply Refresh` run #1 on main completed successfully with network refresh enabled.
- PR #64 Fast CI #42 passed while consuming the governed local supply.
- The Windows desktop proxy has been turned OFF for the final acceptance phase.

## Candidate control-plane change

PR #64 changes the protected self-hosted Final Gate, therefore it MUST NOT self-authorize through the Command Bridge. The Command Bridge refusal is expected governance behavior.

Candidate behavior:

```text
normal Fast CI / Final Gate
-> verify governed local supply
-> restore exact cached Docker images when required
-> npm install --offline only
-> prebuild Web on runner from local npm cache
-> materialize Twenty Adapter dependencies from local npm cache
-> CI-only runtime Dockerfiles package prebuilt outputs
-> third-party Compose images use pull_policy: never
-> no Docker Hub / Quay / npm fallback in normal CI
```

Formal Windows UAT source behavior and Docker Desktop remain outside this candidate mechanism.

## Authorized transition procedure

Because the candidate modifies protected Final Gate control files, the legal transition is:

```text
REOPEN governance
-> Fast CI on protected-change PR
-> merge candidate control-plane implementation
-> create fresh test-only proof PR from new main
-> keep Windows desktop proxy OFF
-> Fast CI PASS on proof PR
-> exactly one /gbap-final all
-> Command Bridge PASS
-> all Final Gate PASS
-> inline PASS result
-> close proof PR without merge
-> RE-FREEZE governance in a later version
```

This follows the previously proven protected-control-plane pattern used for the self-hosted CI control loop: protected workflow changes are merged as candidates, then independently proven from a fresh non-protected test-only PR.

## Mandatory proxy-OFF acceptance

The proof is valid only if all of the following are true while the Windows desktop proxy remains OFF:

- Fast CI consumes `infrastructure/ci/ensure-ci-supply.sh` successfully.
- No normal npm install is allowed to reach the public network.
- Third-party Docker images are local-only and fail closed if absent.
- Product Web build passes.
- Real Twenty CRM proof passes.
- Isolated Local UAT preparation/boot/health/identity/persistence/backup-restore/cleanup passes.
- Command Bridge dispatches automatically from the test-only proof PR.
- Inline PASS is written back to the proof PR.
- Formal Windows UAT remains untouched.

## Gate

Current state:

```text
DEPENDENCY SUPPLY REFRESH        PASS
PR #64 FAST CI                  PASS
PROTECTED SELF-AUTHORIZATION    REFUSED / EXPECTED
PROXY-INDEPENDENT FINAL GATE    NOT YET PROVEN
CI GOVERNANCE                   REOPEN
```

No `PROXY-INDEPENDENT CI = PASS` declaration is permitted until the post-merge test-only proof succeeds and governance is explicitly re-frozen.
