# GBAP CI Governance v0.6

Status: **RE-FROZEN / PASS / CLOSED**
Authority: Stage 3.4 engineering governance
Frozen predecessor: `docs/architecture/GBAP_CI_GOVERNANCE_v0.5.md`
Opened: 2026-09-06
Re-frozen: 2026-09-06

## 1. Purpose and closure

This bounded REOPEN changed only the self-hosted CI runner topology after the dedicated Hyper-V VM passed physical recovery and Formal-UAT isolation gates, and after the operator explicitly required the existing WSL runner to remain online and usable as backup / overflow capacity.

No CRM product behavior, Formal Windows UAT deployment, business data, or Production Go-Live authority changed.

The v0.6 acceptance sequence is now complete. This document supersedes v0.5 for the current CI runner topology and Final routing decisions.

## 2. Accepted prerequisites

Before routing changes, the dedicated VM had already passed:

- whole-host Windows reboot / no-interactive-login recovery;
- SYSTEM supervisor VM recovery before real user desktop use;
- guest Docker / Hyper-V FCOPY / Xray / Xray apply / GitHub runner automatic recovery;
- exactly one idle `Runner.Listener` and zero idle `Runner.Worker`;
- Xray current / LKG match;
- governed GitHub control-plane probes;
- Formal-UAT isolation from `E:\GlobalBusinessAIPlatform`, Windows Docker Desktop, formal ports, volumes, `.env`, `.runtime`, and company data.

The dual-runner proof line additionally established:

- VM explicit selector `gbap-ci-primary` routes to `GBAP-CI-VM-CANDIDATE`;
- WSL explicit selector `gbap-ci-overflow` routes to `GBAP-CI-01`;
- shared `gbap-ci` Fast CI may execute on either matching online runner;
- both runner roles remain independently usable.

## 3. Frozen steady-state topology

```text
GBAP-CI-VM-CANDIDATE
  role: PRIMARY
  host: dedicated Hyper-V Ubuntu VM
  status: always online
  selectors:
    - gbap-ci
    - gbap-ci-primary
    - gbap-ci-vm-candidate
  responsibilities:
    - shared Fast CI capacity
    - control / CRM heavy Final branch
    - Final aggregation / authoritative PASS-FAIL reporting

GBAP-CI-01
  role: BACKUP / OVERFLOW + PARALLEL FINAL WORKER
  host: dedicated WSL2 GBAP-CI distro
  status: always online
  selectors:
    - gbap-ci
    - gbap-ci-overflow
  responsibilities:
    - shared Fast CI capacity
    - overflow capacity
    - Local-UAT heavy Final branch
    - backup / diagnostics
```

The WSL runner is **not retired, disabled, stopped, or unregistered**. Its Windows keepalive remains part of its availability boundary.

## 4. Native GitHub routing constraint

GitHub Actions may assign a job to any online and idle self-hosted runner matching every `runs-on` label. There is no native strict priority primitive equivalent to `prefer VM, otherwise WSL` for two runners sharing the same selector.

Therefore:

- shared Fast CI deliberately uses `gbap-ci` and may run on either runner;
- explicit heavy branches use role labels;
- Final authority is not based on scheduler preference;
- authoritative Final aggregation / reporting is explicitly pinned to the VM primary.

## 5. Frozen Parallel Final model

The governed `/gbap-final all` topology is:

```text
                    /gbap-final all
                           |
             +-------------+-------------+
             |                           |
             v                           v
VM PRIMARY                        WSL OVERFLOW
control + CRM branch              Local-UAT branch
- exact source                    - exact source
- toolchain                       - toolchain
- control-plane                   - control-plane
- governed supply                 - governed supply
- static preflight                - static preflight
- Web / offline inputs            - Web / offline inputs
- real Twenty CRM proof           - isolated Local-UAT render
                                  - boot / health / identity
                                  - restart persistence
                                  - backup / restore rollback
                                  - cleanup
             |                           |
             +-------------+-------------+
                           |
                           v
                    VM PRIMARY
                 Final aggregate
              - validate selected branch results
              - verify VM aggregate identity
              - one authoritative PR PASS/FAIL report
```

Suite routing is frozen as:

- `/gbap-final control`: VM control branch -> VM aggregate;
- `/gbap-final crm`: VM control + CRM branch -> VM aggregate;
- `/gbap-final local-uat`: WSL Local-UAT branch -> VM aggregate;
- `/gbap-final all`: VM control + CRM and WSL Local-UAT execute concurrently -> VM aggregate.

There is no random heavy-job routing and no implicit Final failover.

## 6. Isolation boundary

Parallel branches execute on different accepted runtime boundaries:

```text
VM CI primary
  independent Ubuntu filesystem
  independent Docker daemon
  independent runner workspace

WSL CI worker
  independent WSL filesystem
  independent Docker daemon
  independent runner workspace

Formal Windows UAT
  E:\GlobalBusinessAIPlatform
  Windows Docker Desktop
  outside both CI runtimes
```

The VM does not mount Formal UAT or reuse its Docker daemon / ports / runtime. Existing WSL CI isolation remains governed. Parallel Final branches therefore do not share a Docker daemon, container namespace, named volumes, local ports, or CI workspace.

## 7. Workflow control-plane decision

- `GBAP PR Fast CI` uses `runs-on: [self-hosted, linux, x64, gbap-ci]`;
- `GBAP Dual Runner Capacity Proof` is the explicit role-selector proof;
- `GBAP Final Gate - Parallel Self Hosted` is the normal Final orchestration workflow;
- the historical serial `ci-final-self-hosted.yml` remains repository evidence / fallback code, not the normal v0.6 Command Bridge target;
- Command Bridge protects both serial and parallel Final control files from PR self-authorization;
- exactly one owner command creates one governed Final orchestration run;
- only the VM aggregate reports the authoritative Final result.

## 8. Fail-closed behavior

- If either required heavy branch fails, the aggregate result is FAIL.
- If a required runner is unavailable, the required branch remains queued; authority is not silently rerouted.
- If the VM primary is unavailable, the authoritative aggregate cannot complete even if WSL succeeds.
- If WSL is unavailable for `local-uat` / `all`, Local-UAT acceptance is not silently moved to the VM without a new governed decision.
- Do not restart or re-register either runner while a GitHub job is queued, assigned, running, or finalizing on that runner.
- Do not weaken fail-closed local dependency supply.
- Do not touch Formal Windows UAT to accelerate CI.

## 9. Final acceptance evidence

Accepted proof PR: **#103**, evidence-only, closed unmerged.

Accepted exact proof head:

`0e1886a4a955e5b220a3697c2c3b7960478752fd`

Acceptance chain:

```text
Fast CI #158
run 34047349868
result SUCCESS

Dual Runner Capacity Proof #3
run 34047349885
result SUCCESS

Focused Parallel Final local-uat #2
run 34047536499
result SUCCESS
WSL Local-UAT branch SUCCESS
VM authoritative aggregate SUCCESS

Authoritative Parallel Final all #3
run 34048683507
result SUCCESS
VM primary control + CRM SUCCESS
WSL overflow Local-UAT SUCCESS
VM authoritative aggregate SUCCESS
all required Complete job steps SUCCESS

PR #103
result CLOSED / UNMERGED as required
```

The exact-head `all` run began at 2026-09-06T17:27:55Z and completed at 2026-09-06T17:49:36Z. The measured wall-clock improvement over the older successful serial Final is modest because both runners share one physical Windows host and current CRM/UAT cold-start work is heavier; this is a performance observation only and does not weaken acceptance.

## 10. Acceptance sequence closure

All required v0.6 gates are complete:

1. dual-runner role labels present and both roles usable — PASS;
2. protected topology change merged under REOPEN authority — PASS;
3. independent post-merge role/capacity proof — PASS;
4. parallel-Final protected control-plane Fast CI — PASS;
5. control-plane fix merged — PASS;
6. fresh marker-only proof PR from new main — PASS;
7. exact-head shared Fast CI + dual-runner proof — PASS;
8. one governed `/gbap-final all` acceptance command — PASS;
9. one parallel Final orchestration — PASS;
10. VM control/CRM + WSL Local-UAT exact-head branches — PASS;
11. VM authoritative aggregate — PASS;
12. terminal `Complete job` on all required jobs — PASS;
13. proof PR closed without merge — PASS;
14. living state / evidence updated and v0.6 RE-FROZEN — PASS.

No old Candidate Proof, listener-kill test, idle supervisor test, reboot proof, or Formal-UAT isolation proof is repeated unless new evidence invalidates an accepted gate.

## 11. Final frozen decision

```text
PHYSICAL VM CANDIDATE                    PASS / CLOSED
WHOLE-HOST / NO-LOGIN RECOVERY           PASS / CLOSED
FORMAL-UAT ISOLATION                     PASS / CLOSED
WSL RETIREMENT                           CANCELLED / NOT AUTHORIZED
VM + WSL LONG-TERM ONLINE                REQUIRED
VM PRIMARY ROLE                          ACCEPTED
WSL BACKUP / OVERFLOW ROLE               ACCEPTED
DUAL-RUNNER ROLE PROOF                   PASS
SHARED FAST CAPACITY                     PASS
PARALLEL FINAL CONTROL PLANE              PASS / ACCEPTED
VM AUTHORITATIVE AGGREGATE                PASS / ACCEPTED
EXACT-HEAD PARALLEL FINAL                 PASS / ACCEPTED
CI GOVERNANCE V0.6                        RE-FROZEN / PASS / CLOSED
FORMAL WINDOWS UAT                        UNCHANGED
PRODUCTION GO-LIVE                        NOT AUTHORIZED
```
