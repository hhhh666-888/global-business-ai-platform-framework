# GBAP CI Failed-Scope Rerun Policy v0.1

Status: **ACCEPTED / PASS / ACTIVE**

Opened: 2026-09-07
Accepted: 2026-09-07

## 1. Purpose

Prevent repeated expensive CI work when a candidate already has valid PASS evidence for unaffected domains.

Core rule:

```text
PASS EVIDENCE REUSE
+ FAILED-SCOPE RERUN
+ NO DUPLICATE HEAVY CI
```

## 2. Same exact head

For the same exact candidate SHA:

- a completed PASS job/domain remains accepted unless new evidence invalidates it;
- retry only the failed job/domain;
- do not repeat CRM, browser, Local-UAT, persistence, backup/restore or other Heavy domains merely because a later independent step failed;
- never start a second equivalent Heavy run while one is queued, running or finalizing.

## 3. Changed head

When the SHA changes, classify impact before deciding what must repeat.

```text
documentation-only or isolated CI/evidence change
-> Fast CI read-back
-> preserve unrelated PASS evidence
-> re-run only the affected acceptance domain when required

shared product/runtime/security/data/migration change
-> invalidate affected dependent evidence
-> re-run the relevant dependent gates
```

A new SHA does not automatically invalidate every historical PASS. Evidence validity is impact-based, not ritual-based.

Evidence reuse must never be used to hide a change that could affect the previously accepted behavior.

## 4. Job versus step limitation

GitHub Actions supports re-running a failed job but cannot resume from an arbitrary internal step.

Therefore repeated real incidents may justify decomposing long Heavy chains into independently rerunnable governed domains:

```text
Control
CRM
Local-UAT
Persistence
Backup/Restore
Final Handoff
Aggregate / Closure
```

Do not duplicate the whole Final architecture pre-emptively. Add a focused continuation only where evidence shows it materially reduces repeated work without weakening acceptance.

## 5. Focused Final Handoff proof

Accepted entrypoint:

`/gbap-final handoff`

Workflow:

`.github/workflows/ci-final-handoff-proof.yml`

Runner:

`GBAP-CI-VM-CANDIDATE / gbap-ci-primary`

Scope:

```text
exact candidate checkout
-> assert actual head == dispatched expected head
-> prove VM PRIMARY execution boundary
-> run governed GitHub control-plane majority probe
-> report result to PR
```

Explicit non-scope:

- no Real Twenty CRM;
- no Local-UAT boot;
- no identity lifecycle;
- no restart persistence;
- no backup/restore rollback;
- no Formal Windows UAT mutation;
- no Production operation.

## 6. Trust boundary

The focused workflow and its shared control-plane probe are protected Final-control files.

A normal product PR that modifies protected Final-control code is refused by the Command Bridge and cannot self-authorize a weakened focused proof.

## 7. Acceptance evidence

Motivating incident:

Final #68 / run `34116251046` on PR #106.

That Heavy run proved CRM, Local-UAT, identity lifecycle, restart persistence, backup/restore rollback and CI-only cleanup. Only the independent final GitHub control-plane handoff failed.

Root cause and correction:

- historical final caller requested only two observations;
- majority semantics therefore required 2/2;
- one transient HTTPS loss marked the handoff red;
- PR #108 enforced at least three observations while retaining strict-majority fail-closed behavior;
- Fast #206 PASS.

Focused continuation implementation:

```text
PR #109
Fast CI #208
PASS
merge 700b05a691035c451dc32f84729be6447bdd827c
```

First production use of the policy:

```text
PR #106 candidate     f330c493ad1f720e7a9f58e87d351a7ad72c49a2
Fast CI #209          PASS on VM PRIMARY
Command Bridge #82    PASS
Focused Handoff #1
run 34127105035       PASS
exact-head assertion  PASS
VM PRIMARY identity   PASS
control-plane handoff PASS
```

The focused run did not start CRM, Local-UAT, persistence or backup/restore. This proves the intended failed-scope continuation behavior.

## 8. Accepted decision

```text
PASS evidence reuse               ACCEPTED
failed-job/domain rerun            ACCEPTED
focused Final handoff             ACCEPTED
unrelated Heavy repetition        NOT REQUIRED
impact classification on new SHA  REQUIRED
fail-closed Final trust boundary  PRESERVED
```

This policy is active execution governance and should be followed by ChatGPT, Codex, developers, operators and scheduled relays.

Related authority/evidence:

- `docs/architecture/GBAP_CI_GOVERNANCE_v0.7.md`
- `docs/evidence/GBAP_CI_V0_7_CLOSURE_2026-09-07.md`
- `docs/GBAP_EXECUTION_PROTOCOL.md`
