# Global Business AI Platform｜Stage 3 Active Baseline v0.7

Status: `ACTIVE / BOUNDED SUBSTRATE HARDENING PASS / CROSS-PROVIDER SEMANTIC SUBSTITUTION PROVEN FOR BOUNDED CRM V1 SLICE / PRODUCTION CRM DECISION GATE AUTHORIZED TO OPEN / PRODUCTION UI SELECTION NOT YET MADE`

Supersedes prospectively: `GBAP_STAGE3_ACTIVE_BASELINE_v0.6.md`

Project: **全球业务智能平台｜Global Business AI Platform**

Brand: **GBAP**

Current repository: `hhhh666-888/global-business-ai-platform`

Current main baseline after PR #13 merge: `f2b4698fbd1e3f82b7444e8bd026eba2d03299e6`

This baseline advances Stage 3 after completion of the descriptive work item `Stage 3.4 bounded substrate hardening｜Canonical CRM Contract + Evidence-Governed Replacement Metadata`. It does not rewrite v0.6, reopen CLOSED substrate Authority, assign a new numeric stage, select a production CRM, select a production UI, or claim E2/E3.

---

## 1. Current Stage 3 state

- Stage 3.1 — COMPLETE
- Stage 3.2 — COMPLETE
- Stage 3.3 — PASS
- Stage 3.3.1 — PASS / COMPLETE / CLOSED
- Stage 3.4 CRM Source/Document Audit — PASS
- Stage 3.4.1 PoU-A Twenty — PASS / 34 of 34
- Stage 3.4 continuation PoU-B Atomic CRM — PASS / 15 of 15
- Stage 3.4 continuation PoU-C Frappe CRM — PASS / 36 of 36
- Stage 3.4 post-PoU synthesis — PASS / COMPLETE
- Stage 3.4 bounded substrate hardening — PASS / COMPLETE / MERGED / REMOTE READ-BACK VERIFIED

No current Authority assigns a formal numeric identifier after `Stage 3.4.1`. Descriptive names remain mandatory until explicit later Authority creates a numeric identifier.

---

## 2. Hardening outcome now authoritative

Final closure record:

`docs/architecture/GBAP_Stage3_4_Bounded_Hardening_Final_Closure_v0.1.md`

Implementation record:

`docs/architecture/GBAP_Stage3_4_Canonical_CRM_Hardening_v0.1.md`

Merged implementation:

`f2b4698fbd1e3f82b7444e8bd026eba2d03299e6`

Current decision truth:

```text
Core minimum substrate lifecycle
= RETAIN

Closed substrate Authority reopen
= NO

Cross-provider mechanical insertion
= PROVEN

Cross-provider semantic substitution
= PROVEN / BOUNDED TO GBAP CRM V1 ACCOUNT / CONTACT / OPPORTUNITY SLICE
```

---

## 3. Canonical CRM Authority

GBAP owns the provider-neutral mandatory CRM V1 contract:

```text
Account
Contact
Opportunity
```

Mandatory capabilities:

```text
crm.v1.account.create
crm.v1.account.list
crm.v1.contact.create
crm.v1.contact.list
crm.v1.opportunity.create
crm.v1.opportunity.list
crm.v1.snapshot.export
```

Provider-native Lead is not a current GBAP V1 canonical entity.

For the bounded create slice:

```text
Opportunity name_summary
= REQUIRED

Opportunity lifecycle_state
= REQUIRED

OPEN Opportunity Account context
= REQUIRED / mapped durable Account ID
```

Provider-specific nouns and field mappings remain inside adapters.

---

## 4. Dual-engine semantic substitution evidence

One shared provider-agnostic conformance harness passed unchanged against both real engines:

```text
Twenty
= PASS / canonical 14 assertions

Frappe CRM
= PASS / canonical 14 assertions
```

The harness includes positive and negative semantic proof:

- Account create + durable mapping;
- Contact create + durable mapping;
- OPEN Opportunity without Account rejected;
- canonical Lead capability unavailable;
- OPEN Opportunity created through mapped Account;
- Opportunity `nameSummary + lifecycleState` retained;
- reverse durable-ID list resolution;
- canonical export;
- mapping persistence;
- E0→E1 evidence transition;
- scope + provenance retention;
- normalized provenance inspection;
- audit evidence;
- governed mapping release.

Therefore business code for this mandatory slice no longer needs Twenty/Frappe business nouns.

This proof is bounded. It does not imply complete feature parity.

---

## 5. Candidate posture after hardening

```text
Twenty
= strongest proven schema/custom-object engine candidate

Frappe CRM
= strongest proven daily-sales / communication-surface engine candidate

Atomic CRM
= proven native source/UI reuse asset
```

Twenty and Frappe remain the only active production CRM engine candidates.

Atomic remains in the UI/source-reuse lane and is not an equivalent engine candidate.

EspoCRM remains:

`CONDITIONAL RESERVE / NOT PROMOTED`

No fourth CRM is required unless the Production CRM Decision Gate exposes a material blocker in both current engine candidates.

---

## 6. Required deltas after hardening

### DELTA-CRM-01 — Canonical CRM Contract

`PASS / IMPLEMENTED / VERIFIED`

### DELTA-CRM-02 — Evidence-Governed Replacement Level

`PASS / IMPLEMENTED / VERIFIED`

New provider evidence starts at E0 and advances stepwise through evidence-bound audited transitions.

### DELTA-CRM-03 — Canonical Re-import + Governed Cutover

`NOT IMPLEMENTED / REQUIRED BEFORE E2/E3`

Still required for:

- canonical target reconstitution;
- source→target mapping lineage;
- target verification;
- governed cutover;
- rollback;
- E2/E3 evidence.

### DELTA-CRM-04 — Integration Provenance Normalization

`PASS / IMPLEMENTED / VERIFIED`

Provider evidence can distinguish:

- canonical contract version;
- upstream product;
- upstream version;
- upstream commit;
- immutable upstream image digest when available;
- GBAP adapter revision;
- configuration revision;
- schema/customization revision.

---

## 7. Replacement truth remains bounded

```text
Twenty E1_EXPORT_PROVEN
= YES

Frappe E1_EXPORT_PROVEN
= YES

CROSS_PROVIDER_SEMANTIC_SUBSTITUTION
= YES / mandatory CRM V1 slice

E2_REIMPORT_PROVEN
= NO

E3_CUTOVER_PROVEN
= NO
```

A Production CRM Decision may select an engine at E1. That selection must not be described as full production replaceability.

A later production go-live/freeze must state actual replacement evidence truth explicitly.

---

## 8. No automatic stateful cross-CRM failover

`BLIND HEALTH-BASED CROSS-CRM FAILOVER = REJECTED`

Current safe posture remains:

```text
provider unhealthy
→ CRM capability degrades/fails closed according to declared posture
→ GBAP remains healthy
→ recover same provider or execute a separately governed cutover
```

No second provider may receive stateful writes merely because it is healthy until E3-grade state continuity and cutover authority exist.

---

## 9. Production architecture direction remains bounded

Current direction to evaluate:

```text
GBAP / GBAP employee product
        ↓
GBAP-owned native UI
        ↓
GBAP-owned Canonical CRM Contract
        ↓
selected replaceable CRM adapter
        ↓
one selected headless CRM engine
```

Optional native UI source material:

```text
Atomic MIT slices
→ selectively reused inside GBAP-owned UI
→ never the employee-facing third-party product shell
```

CRM engine selection and UI-source selection remain separate decisions.

---

## 10. Production CRM Decision Gate is now authorized to open

The prerequisites defined by the post-PoU synthesis are satisfied:

1. canonical CRM contract is defined from frozen GBAP semantics;
2. Twenty and Frappe both implement the same mandatory contract slice;
3. identical provider-neutral real-engine conformance passes against both;
4. provider-specific semantic differences remain explicit;
5. evidence-governed E-level advancement is implemented;
6. normalized integration provenance is implemented.

Therefore:

```text
Production CRM Decision Gate
= AUTHORIZED TO OPEN

Production CRM Selection
= NOT YET DECIDED
```

E2/E3 are not prerequisites for selecting a candidate, but they remain prerequisites for claiming higher replacement/cutover evidence.

---

## 11. Required Production CRM Decision dimensions

The explicit Decision Gate must combine existing technical evidence with product/business evidence. At minimum it must compare Twenty and Frappe on:

1. mandatory GBAP workflow fit;
2. Account / Contact / Opportunity semantic fit;
3. schema/custom-object extensibility;
4. daily sales workflow usability;
5. communication/integration surface;
6. API and adapter stability;
7. data exit and future re-import feasibility;
8. deployment/operations complexity;
9. upgrade and lifecycle burden;
10. licensing and production-use constraints;
11. employee-facing localization and workflow implications;
12. lifecycle cost and maintainability;
13. future integration fit with GBAP-owned capabilities;
14. known evidence gaps and required mitigations.

The decision must distinguish `PROVEN`, `NOT TESTED`, `RISK`, and `PREFERENCE`. Untested behavior must not be silently scored as failure or success.

---

## 12. Current Gate

```text
Post-PoU synthesis
= PASS / COMPLETE

Bounded substrate hardening
= PASS / COMPLETE

Core substrate lifecycle
= RETAIN

Substrate Authority reopen
= NO

Twenty PoU
= PASS

Atomic PoU
= PASS

Frappe PoU
= PASS

Canonical CRM Contract
= PASS

Provider-agnostic dual-engine conformance
= PASS / 14 + 14

Cross-provider semantic substitution
= PROVEN / bounded CRM V1 slice

Evidence-governed E-level advancement
= PASS

Integration provenance normalization
= PASS

E2_REIMPORT_PROVEN
= NO

E3_CUTOVER_PROVEN
= NO

EspoCRM
= CONDITIONAL RESERVE / NOT PROMOTED

Production CRM Decision Gate
= AUTHORIZED TO OPEN

Production CRM Selection
= NOT YET DECIDED

Production UI Selection
= NOT YET DECIDED
```

---

## 13. Next legal Stage 3 work item

No new numeric identifier is assigned.

The next legal work item is:

> **Stage 3.4 continuation｜Production CRM Decision Gate**

Execution order:

1. freeze the Decision Gate criteria from GBAP business/product Authority;
2. reuse all existing Twenty/Frappe PoU and canonical conformance evidence;
3. verify only material current external facts that can change, such as licensing/support/production-use constraints;
4. compare Twenty and Frappe using the same explicit weighted decision dimensions;
5. identify unresolved blockers and determine whether any require targeted validation;
6. do not run another general CRM PoU unless a real blocker requires it;
7. issue one explicit engine decision: `SELECT TWENTY`, `SELECT FRAPPE`, or `NO-GO / MORE TARGETED EVIDENCE REQUIRED`;
8. state actual E1/E2/E3 truth with the decision;
9. keep Production UI selection separate;
10. update the active baseline only after the Decision Gate has an evidence-backed result.
