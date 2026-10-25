# GBAP Stage 3.6｜Productization Completion + UX/UI Experience Upgrade

Status: **PASS / ACCEPTED / CLOSED / MERGED**

Authorized by project owner: 2026-09-07

Start base main: `393e5c7fe7d7a7bc810a29a06f55cf8f8265a036`

Merged PR: **#106**

Product merge commit: `75d0874e0858d101fc90974776b07c46ef80459c`

Closure evidence: `docs/evidence/GBAP_STAGE3_6_PRODUCTIZATION_UX_CLOSURE_2026-09-07.md`

## 1. Purpose

Stage 3.5 proved that the selected CRM provider capabilities could be recovered through the GBAP boundary. Stage 3.6 converted that engineering capability into a complete employee/admin product experience.

The accepted provider/identity boundary remains:

```text
GBAP Browser
-> GBAP identity + authorization
-> GBAP product/capability boundary
-> provider resolver / adapter
-> Twenty v2.37.0
```

Stage 3.6 did **not** expose Twenty directly, move human identity authority away from GBAP Keycloak, authorize Production Go-Live, or weaken CI/UAT gates.

## 2. Productization definition of done

Stage 3.6 used this acceptance rule:

```text
CAPABILITY EXISTS
+ USER CAN FIND IT
+ USER CAN UNDERSTAND IT
+ USER CAN COMPLETE THE TASK
+ PERMISSION / FAILURE STATES ARE EXPLAINED
+ NO DEAD END / FALSE BUTTON
+ NO UNNECESSARY ENGINEERING TERMINOLOGY
+ MOBILE / DESKTOP RESPONSIVE BEHAVIOR IS SANE
+ REQUIRED STATE IS VERIFIED
= PRODUCT COMPLETE
```

Final result: **PASS** for the accepted Stage 3.6 scope.

## 3. Delivered productization

### 3.6A｜Capability realization

- recovered Stage 3.5 CRM capabilities remain available through the GBAP product boundary;
- standard/custom business objects, fields, relations and view/lifecycle behaviors remain represented;
- capability realization evidence found no Stage 3.5 capability loss in the accepted product scope.

### 3.6B｜Information architecture + product language

- navigation and page titles are business/task oriented;
- `完整 CRM` became `业务数据中心`;
- normal users are no longer exposed to routine provider/runtime/Stage/objectKey/Upsert/Dry Run wording;
- technical enforcement/provider details remain internal rather than being presented as fake user capabilities.

### 3.6C｜Email + Calendar product behavior

- Email/Calendar are optional self-service features;
- when provider readiness is available, every authenticated user may choose to connect their own supported Google/Microsoft account;
- no per-user super-admin approval model is used;
- ordinary employees are not told to request super-admin permission merely to connect their own account;
- provider application/bootstrap remains a legitimate one-time backend/ops prerequisite;
- secrets remain outside browser/Git/chat.

### 3.6D｜Visual + interaction upgrade

- product hierarchy, cards, focus states and restrained motion were upgraded;
- `prefers-reduced-motion` is respected;
- responsive/mobile navigation remains usable;
- keyboard/accessibility semantics were improved.

### 3.6E｜User-journey acceptance

Accepted browser coverage includes business-data-center productization, mail/calendar per-user behavior, responsive/accessibility journeys and existing CRM/admin flows.

## 4. Accepted evidence chain

```text
Stage 3.4 Twenty Full CRM Wiring #168       PASS
accepted browser/product head              bffb665b43aba348506615b5cf5ee8676a23b44c

Final #68 / run 34116251046                 substantive VM Heavy domains PASS
Final #68 head                              24adf4950fec9f821bd67249264a0f4d30e77600
runner                                      GBAP-CI-VM-CANDIDATE / VM PRIMARY

PR #108 / Fast #206                        PASS
PR #109 / Fast #208                        PASS
PR #106 / Fast #209                        PASS on VM PRIMARY

Focused VM Final Handoff #1
run 34127105035                             PASS
exact head                                  f330c493ad1f720e7a9f58e87d351a7ad72c49a2

Final merge-head Fast #210
run 34128153605                             PASS 14/14
head                                        1b20a607f38abef2de86bf4be3ad9254aa6ef5b3

PR #106                                     MERGED
merge commit                                75d0874e0858d101fc90974776b07c46ef80459c
```

The final documentation/CI-governance sync after the accepted browser head did not change Stage 3.6 product/test behavior. Impact review therefore preserved valid browser/Heavy evidence and re-ran only affected Fast/focused handoff scopes.

## 5. CI execution lesson adopted during closure

The Stage 3.6 Final tail established the durable rule:

```text
PASS EVIDENCE REUSE
+ FAILED-SCOPE RERUN
+ NO DUPLICATE HEAVY CI
```

Authority:

`docs/architecture/GBAP_CI_FAILED_SCOPE_RERUN_POLICY_v0.1.md`

The independent Final handoff failure was corrected and proved through `/gbap-final handoff` without repeating already-PASS Real Twenty, Local-UAT, persistence or backup/restore domains.

## 6. Frozen boundaries retained

- GBAP public UI remains authoritative.
- GBAP Keycloak remains human identity authority.
- Twenty remains headless/internal/replaceable.
- Browser never receives Twenty credentials or calls Twenty directly.
- GBAP business IDs remain public durable record IDs.
- Provider permissions may restrict but never widen GBAP authorization.
- Unsupported/unknown authorization behavior remains fail-closed.
- Formal Windows UAT is not mutated by ordinary GitHub development/CI.
- CI Governance v0.7 is **RE-FROZEN / PASS / CLOSED**.
- Production Go-Live remains **NOT AUTHORIZED**.

## 7. Closure gate

```text
Stage 3.6 authorization               PASS
Capability/product audit              PASS
Product-language conversion           PASS
Email/Calendar product ruling         PASS
Responsive/accessibility acceptance   PASS
Browser/user-journey acceptance       PASS
VM Heavy substantive acceptance       PASS
Focused Final handoff                 PASS
Final merge-head Fast                 PASS
PR #106 merge                         PASS
Stage 3.6 closure                     PASS / CLOSED
Formal UAT deployment                 NOT PERFORMED
Production Go-Live                    NOT AUTHORIZED
```

## 8. Current legal state

Stage 3.6 is complete and must not remain listed as an active unfinished line.

There is no automatically authorized Stage 3.7 or Formal-UAT deployment implied by this closure.

Future work must start from current GitHub/runtime facts and this accepted Stage 3.6 baseline. A new product mainline, company-UAT deployment, frozen-boundary reopen or Production Go-Live requires the corresponding owner/governance authority.
