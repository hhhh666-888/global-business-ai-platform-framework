# GBAP GBAP｜Twenty Candidate B v2.41 Rebuild Gate v0.1

Status: **PASS / CLOSED / OFFLINE REBUILD ACCEPTED / LIVE SYNC NOT AUTHORIZED**

Date: 2026-09-20

## 1. Entry authority

Upstream runtime target:

`Twenty v2.41.0`

Accepted source/runtime admission:

```text
PR #276 exact head    c2a2cb2e31bc5a0975cdc27ea83bd03cface0855
merge                 fa259197bf8e479a743056f8efc21dd6a6ee7e65
affected Gates        8/8 PASS
```

Accepted v2.41 SDK supply:

```text
PR #277 Stage A       PASS / MERGED
PR #278 repair        PASS / MERGED
Refresh #5            PASS
twenty-sdk             2.41.0 offline admitted
twenty-client-sdk      2.41.0 offline admitted
normal CI network      DISABLED
```

## 2. Purpose

Rebuild the existing thin Candidate B extension against the current Twenty v2.41 SDK without widening its authority.

The App remains:

```text
one read-only Knowledge logic function
+ one least-privilege application role
+ person-scoped Twenty context requirement
+ private GBAP identity/Knowledge bridge
```

It remains **not**:

- a new generic Agent runtime;
- a CRM mutation App;
- a replacement for RAGFlow Knowledge;
- a Production deployment.

## 3. Exact toolchain

```text
twenty-sdk          2.41.0
twenty-client-sdk   2.41.0
typescript          5.9.3
@types/node         24.7.2
Node                ^24.5.0
Twenty target       2.41.0
```

All packages must install through the governed offline supply.

## 4. Native extension surface retained

Candidate B continues to use:

- `defineApplication`
- `defineApplicationRole`
- `defineLogicFunction`
- `toolTriggerSettings`
- `LogicFunctionExecutionContext.workspaceMemberId`
- `LogicFunctionExecutionContext.userWorkspaceId`
- secret/non-secret server variables

The App still grants no CRM object/field access.

## 5. Build gate

The rebuild must prove:

1. v0.11 base + upgrade supply admission PASS;
2. network fallback DISABLED;
3. exact 2.41 SDK/client versions installed offline;
4. `twenty dev:build` succeeds;
5. generated manifest targets Twenty 2.41.0;
6. exactly one logic function remains;
7. exactly one least-privilege app role remains;
8. no Agent, Skill, Object, Field or CRM write capability appears;
9. built handler still requires person context;
10. built handler still calls only the private GBAP Knowledge bridge;
11. legacy v2.37 plan snapshot remains preserved and is not silently rewritten.

## 6. v2.37 first-install retirement boundary

The previously accepted v2.37 custom first-install chain remains historical evidence only.

It is no longer an automatic PR Gate for ordinary Candidate B App source changes.

Reason:

- Candidate B now targets v2.41;
- Twenty v2.41 provides the current official `plan` / `apply` lifecycle;
- the v2.37 custom multipart/install transport is not the preferred current integration path.

Historical files/evidence remain preserved for audit and rollback analysis.

## 7. Closure and next gate

PR #279 exact head `5014bd777752acf6304b652c3618be5836f9562b` passed all 8 affected exact-head Gates and merged as `0691d5c748c6f081f291e33dd67539a3f5d29c8e`.

Closure evidence: `docs/evidence/GBAP_TWENTY_AI_CANDIDATE_B_V241_REBUILD_EVIDENCE_2026-09-20.md`.

Gate B2 is PASS / CLOSED. The next active Gate is:

```text
Gate C / isolated cloned-UAT v2.37 -> v2.41 migration
-> Twenty upgrade:status PASS
-> CRM/Mail/Calendar/identity regression
-> only then company Windows UAT cutover
```

Candidate B live `plan` / `apply` occurs only after the runtime upgrade is accepted.

Production remains **NOT AUTHORIZED**.
