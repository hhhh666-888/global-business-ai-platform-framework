# GBAP CI Governance v0.7

Status: **RE-FROZEN / PASS / CLOSED**

Authority: VM-primary Final routing and failed-scope continuation governance
Frozen predecessor: `docs/architecture/GBAP_CI_GOVERNANCE_v0.6.md`
Opened: 2026-09-07
Re-frozen: 2026-09-07

## 1. Owner decision

The project owner explicitly changed normal Final execution from the v0.6 VM+WSL parallel topology to one stable VM-primary execution boundary:

```text
All normal GBAP Final Gate heavy suites run on the accepted VM PRIMARY.
WSL remains online and usable as backup / overflow capacity.
WSL is not part of the normal Final Gate.
```

This v0.7 change is bounded to Final routing/continuation. It does not reopen accepted VM physical/recovery, Formal-UAT isolation, dependency-supply, identity/security, CRM-provider or Production boundaries.

## 2. Accepted runner roles

```text
GBAP-CI-VM-CANDIDATE
  service role     PRIMARY / ACCEPTED
  selectors        gbap-ci / gbap-ci-primary / gbap-ci-vm-candidate
  responsibilities shared Fast CI capacity
                   control + CRM + Local-UAT normal Final
                   focused Final handoff verification
                   authoritative Final reporting

GBAP-CI-01
  service role     BACKUP / OVERFLOW / ACCEPTED
  selectors        gbap-ci / gbap-ci-overflow
  responsibilities shared Fast CI capacity
                   overflow / diagnostics / backup

Both runners        KEEP ONLINE / USABLE
```

The VM runner retains its historical `CANDIDATE` name; the accepted service role is PRIMARY.

WSL retirement, disabling or unregistration is not authorized.

## 3. Normal Final topology

Trusted Command Bridge:

`.github/workflows/ci-final-command.yml`

Normal Heavy workflow:

`.github/workflows/ci-final-self-hosted.yml`

Runner selector:

`[self-hosted, linux, x64, gbap-ci-primary]`

Routing:

```text
/gbap-final control    -> VM PRIMARY control
/gbap-final crm        -> VM PRIMARY control + CRM
/gbap-final local-uat  -> VM PRIMARY Local-UAT
/gbap-final all        -> VM PRIMARY serial control + CRM + Local-UAT
```

The historical v0.6 parallel workflow remains repository history/fallback code, not the normal Command Bridge target.

## 4. Focused failed-scope continuation

Accepted continuation rule:

```text
PASS EVIDENCE REUSE
+ FAILED-SCOPE RERUN
+ NO DUPLICATE HEAVY CI
```

Authority:

`docs/architecture/GBAP_CI_FAILED_SCOPE_RERUN_POLICY_v0.1.md`

Focused Final handoff workflow:

`.github/workflows/ci-final-handoff-proof.yml`

Command:

`/gbap-final handoff`

Scope:

```text
exact candidate checkout
-> exact expected SHA assertion
-> VM PRIMARY identity/boundary proof
-> GitHub Actions control-plane majority probe
-> PR result report
```

It deliberately does not repeat Real Twenty CRM, Local-UAT, identity lifecycle, restart persistence or backup/restore when those domains already have valid PASS evidence.

## 5. Trust boundary

The trusted Command Bridge fails closed when a candidate PR modifies protected Final-control files, including:

- `.github/workflows/ci-final-command.yml`
- `.github/workflows/ci-final-self-hosted.yml`
- `.github/workflows/ci-final-parallel.yml`
- `.github/workflows/ci-final-handoff-proof.yml`
- `.github/workflows/ci-final-result.yml`
- `infrastructure/ci/check-github-control-plane.sh`
- `infrastructure/ci/prepare-local-uat-ci.py`

A normal product PR therefore cannot self-authorize a weakened Heavy or focused Final gate.

The Command Bridge reads the live PR head ref/SHA and dispatches only an eligible same-repository, open, non-draft PR whose protected Final-control files are unchanged relative to current `main`.

## 6. Control-plane majority rule

The shared control-plane probe remains fail-closed.

A governed minimum of three observations is required. The strict-majority algorithm remains unchanged:

```text
3 observations -> require at least 2 successes
3/3            -> HEALTHY
2/3            -> WARN / accepted majority
0/3 or 1/3     -> FAIL
```

This prevents a historical one- or two-attempt caller from turning majority semantics into a zero-tolerance 1/1 or 2/2 gate while preserving failure on sustained control-plane loss.

## 7. Formal-UAT / Production isolation

CI runs are CI-only and must not attach to or mutate Formal Windows UAT.

```text
Formal Windows UAT
  E:\GlobalBusinessAIPlatform
  Windows Docker Desktop
  formal ports / named volumes / .env / .runtime / business data
  OUTSIDE CI
```

Normal VM Final uses isolated CI project names/ports and CI-only cleanup.

No Production Go-Live authority changes.

## 8. Acceptance evidence

### Routing governance

```text
PR #107
Fast CI #204
PASS
merge main f1508d4d1e575585a910feefb39bc15af2b0cd0b
```

This changed the normal Command Bridge to the existing VM-primary serial Final.

### Unique Heavy Final

```text
PR #106
workflow GBAP Final Gate - Self Hosted
run 34116251046 / #68
head 24adf4950fec9f821bd67249264a0f4d30e77600
runner GBAP-CI-VM-CANDIDATE / gbap-ci-primary
WSL not used
```

Substantive Heavy chain PASS:

- exact checkout;
- VM toolchain and initial control-plane;
- governed dependency supply;
- static final preflight;
- Web build/offline compose;
- Real Twenty CRM;
- isolated Local-UAT boot/health;
- identity lifecycle;
- restart persistence;
- governed backup/restore rollback;
- CI-only cleanup.

Only the final GitHub control-plane handoff failed.

### Handoff incident correction

Root cause: the final handoff caller requested two observations. Under strict majority, two observations require 2/2, so one transient HTTPS loss marked the run red even though all substantive Heavy domains had passed.

```text
PR #108
Fast CI #206
PASS
merge main eeef5f0f99b80de53dde02fe0795017c0c121001
```

Correction: enforce minimum three observations and protect the shared control-plane probe as Final-control code.

### Focused continuation governance

```text
PR #109
Fast CI #208
PASS
merge main 700b05a691035c451dc32f84729be6447bdd827c
```

This added `/gbap-final handoff` and the protected focused workflow.

### Current-candidate proof

```text
PR #106 head f330c493ad1f720e7a9f58e87d351a7ad72c49a2
Fast CI #209 / run 34126827055
PASS on GBAP-CI-VM-CANDIDATE

GBAP Final Handoff Proof - VM Primary #1
run 34127105035
PASS
exact-head assertion PASS
VM PRIMARY identity PASS
final GitHub control-plane handoff PASS
previous Heavy domains intentionally not re-run
```

The focused proof reached all four governed GitHub control-plane targets with healthy majority evidence and reported PASS to PR #106.

## 9. Closure decision

The evidence chain proves the intended v0.7 model without requiring a duplicate Heavy Final:

```text
VM PRIMARY normal Final routing                    PASS
control + CRM + Local-UAT on one VM Heavy run     PASS substantively
WSL absent from normal Final                       PASS
Formal-UAT isolation                              PRESERVED
final handoff root cause                          CONFIRMED
control-plane correction                          PASS
focused failed-scope continuation                 PASS
exact current candidate handoff                   PASS
fail-closed majority semantics                    PRESERVED
```

The red overall conclusion of Final #68 is not reinterpreted as a full-run PASS. Instead, its successful Heavy domain evidence is combined with the independently corrected and exact-head focused handoff proof under the accepted failed-scope rerun policy. No product/runtime behavior changed between the accepted Heavy/browser evidence and the focused continuation except isolated CI governance/evidence changes that were Fast-validated.

Therefore:

```text
CI GOVERNANCE v0.7        RE-FROZEN / PASS / CLOSED
NORMAL FINAL RUNNER       VM PRIMARY ONLY
NORMAL FINAL WORKFLOW     ci-final-self-hosted.yml
FOCUSED HANDOFF           ACCEPTED
WSL ROLE                  BACKUP / OVERFLOW / KEEP ONLINE
FORMAL WINDOWS UAT        UNCHANGED
PRODUCTION GO-LIVE        NOT AUTHORIZED
```

Closure evidence:

`docs/evidence/GBAP_CI_V0_7_CLOSURE_2026-09-07.md`

## 10. Reopen triggers

Do not reopen v0.7 merely because a docs-only main SHA changes.

Reopen only if new evidence materially invalidates an accepted boundary, such as:

- VM PRIMARY unable to run a required Final domain;
- focused evidence reuse shown to accept behavior changed by the candidate;
- protected Final-control bypass discovered;
- Formal-UAT isolation broken;
- sustained control-plane failures hidden by the majority rule;
- owner changes the runner topology again.
