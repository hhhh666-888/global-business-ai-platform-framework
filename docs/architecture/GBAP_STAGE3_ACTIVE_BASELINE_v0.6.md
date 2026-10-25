# Global Business AI Platform｜Stage 3 Active Baseline v0.6

Status: `ACTIVE / POST-POU SYNTHESIS PASS / BOUNDED SUBSTRATE HARDENING REQUIRED / PRODUCTION CRM+UI SELECTION NOT AUTHORIZED`

Supersedes prospectively: `GBAP_STAGE3_ACTIVE_BASELINE_v0.5.md`

Project: **全球业务智能平台｜Global Business AI Platform**

Brand: **GBAP**

Current repository: `hhhh666-888/global-business-ai-platform`

Baseline before this governance update: `95d2f0b4d073b7398e29a9c0b560fdf70f38f9ae`

This baseline synchronizes Stage 3 after completion of `Stage 3.4 post-PoU synthesis｜Cross-PoU Decision Preparation + Substrate Delta Review`. It does not rewrite or invalidate v0.5, historical Stage 3 records, permanent PoU evidence or CLOSED substrate Authority.

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

No current Authority assigns a formal numeric identifier after `Stage 3.4.1`. Descriptive names remain mandatory until an explicit later Authority creates a numeric identifier.

---

## 2. Post-PoU synthesis authority

Authoritative decision record:

`docs/architecture/GBAP_Stage3_4_Post_PoU_Synthesis_Decision_Record_v0.1.md`

Machine-readable matrix:

`docs/evidence/stage3-4-post-pou/cross-pou-evidence-matrix.json`

Core decision:

```text
Core minimum substrate lifecycle
= RETAIN

Closed substrate Authority reopen
= NO

Mechanical insertion of multiple real CRM providers
= PROVEN

Cross-provider semantic substitution
= NOT YET PROVEN
```

The real-brick program validated the provider lifecycle itself but exposed a bounded semantic/governance layer that must be hardened before a production CRM selection Gate can be closed.

---

## 3. Candidate posture after evidence synthesis

```text
Twenty
= strongest proven schema/custom-object engine candidate

Frappe CRM
= strongest proven daily-sales / communication-surface engine candidate

Atomic CRM
= proven native source/UI reuse asset
```

Twenty and Frappe are not yet declared winner/loser.

Atomic is not treated as an equivalent full-engine comparator because its PoU role was source/UI reuse.

Production CRM and UI selection remain separate decisions.

---

## 4. Why semantic substitution is not yet proven

The existing PoUs use the same GBAP provider mechanism but expose provider-shaped capability names.

Representative Twenty capabilities:

```text
crm.company.create
crm.person.create
crm.opportunity.create
crm.custom-record.create
```

Representative Frappe capabilities:

```text
crm.organization.create
crm.lead.create
crm.deal.create
crm.note.create
crm.call-log.create
```

Therefore current evidence proves:

> two different CRM engines can be independently inserted and removed behind GBAP.

It does not yet prove:

> the same GBAP business code can switch between them without knowing provider-specific nouns, request shapes or response shapes.

That missing layer is now the first bounded hardening target.

---

## 5. Required forward deltas

### DELTA-CRM-01 — Canonical CRM Contract

Status:

`REQUIRED / BLOCKER BEFORE PRODUCTION CRM SELECTION GATE`

GBAP must own a versioned provider-neutral CRM business contract derived from frozen GBAP domain semantics, not from Twenty/Frappe terminology.

Both real adapters must implement the same mandatory contract slice and pass the same provider-agnostic business conformance scenario.

### DELTA-CRM-02 — Evidence-Governed Replacement Level

Status:

`REQUIRED GOVERNANCE HARDENING`

E0/E1/E2/E3 must be advanced through evidence-bound, audited transitions. A mutable registration field alone must not become production authority for replacement evidence.

The current Twenty and Frappe permanent PoU records remain valid E1 evidence.

### DELTA-CRM-03 — Canonical Re-import + Governed Cutover

Status:

`REQUIRED BEFORE E2/E3`

A real E2/E3 path requires canonical reconstitution data, durable-ID preservation, source/target mapping lineage, target verification, cutover, rollback and audit.

Independent E1 exports are not E2.

### DELTA-CRM-04 — Integration Provenance Normalization

Status:

`REQUIRED PRODUCTION HARDENING`

Production integration state must distinguish upstream version/digest, adapter revision, contract version and relevant configuration/schema revision.

---

## 6. No automatic stateful CRM failover

Current decision:

`BLIND HEALTH-BASED CROSS-CRM FAILOVER = REJECTED`

Until E3-grade state continuity exists, an unhealthy source CRM must not automatically route writes to a second CRM merely because it is healthy.

The safe current posture remains:

```text
provider unhealthy
→ CRM capability degrades/fails closed according to declared posture
→ GBAP remains healthy
→ recovery or governed cutover
```

This prevents split business truth.

---

## 7. EspoCRM control benchmark

Current state:

`NOT PROMOTED / CONDITIONAL RESERVE`

The original audit required EspoCRM promotion only if Twenty/Frappe exposed a material problem in CRM depth, API quality, data exit, operations or licensing.

No such blocker was demonstrated in the tested PoU scope.

Therefore the highest-value next test is not another CRM installation. It is a common GBAP contract/conformance test across the two already-proven engines.

EspoCRM remains available if that work exposes a material blocker.

---

## 8. Replacement truth remains bounded

```text
Twenty E1_EXPORT_PROVEN
= YES

Frappe E1_EXPORT_PROVEN
= YES

E2_REIMPORT_PROVEN
= NO

E3_CUTOVER_PROVEN
= NO
```

A later production decision or go-live record must state these levels exactly and must not describe the CRM as fully replaceable unless the required higher evidence exists.

---

## 9. Current architecture direction to evaluate — not selected production architecture

The synthesis prepares this composition for the next hardening test:

```text
GBAP / GBAP employee product
        ↓
GBAP-owned native UI
        ↓
GBAP-owned Canonical CRM Contract
        ↓
replaceable provider adapter
        ↓
selected headless CRM engine

Optional UI source reuse
Atomic MIT slices → native GBAP UI only
```

The engine choice and native UI-source choice remain independent.

This direction preserves:

- GBAP employee experience ownership;
- GBAP business semantics;
- durable IDs;
- provider replacement rights;
- no third-party dashboard as the normal product shell.

---

## 10. Current Gate

```text
Post-PoU synthesis
= PASS / COMPLETE

Core substrate lifecycle
= RETAIN

Substrate Authority reopen
= NO

Twenty PoU
= PASS / 34 of 34

Atomic PoU
= PASS / 15 of 15

Frappe PoU
= PASS / 36 of 36

Canonical CRM Contract
= REQUIRED / NOT YET IMPLEMENTED

Provider-agnostic dual-engine conformance
= NOT YET PROVEN

Evidence-governed E-level advancement
= REQUIRED / NOT YET IMPLEMENTED

E2_REIMPORT_PROVEN
= NO

E3_CUTOVER_PROVEN
= NO

EspoCRM
= CONDITIONAL RESERVE / NOT PROMOTED

Production CRM Selection
= NOT AUTHORIZED

Production UI Selection
= NOT AUTHORIZED
```

---

## 11. Next legal Stage 3 work item

The next legal work item is descriptive and does not invent a numeric stage:

> **Stage 3.4 bounded substrate hardening｜Canonical CRM Contract + Evidence-Governed Replacement Metadata**

Required implementation order:

1. reconcile the canonical CRM semantics against frozen GBAP business/domain Authority;
2. define and version the provider-neutral CRM capability/request/response/error contract;
3. refactor Twenty and Frappe adapters to implement the same mandatory contract slice;
4. build one provider-agnostic conformance harness and run the identical business scenario against both engines;
5. implement evidence-governed E-level advancement and normalized integration provenance;
6. rerun the permanent substrate self-test;
7. rerun both real CRM tests against the new common contract;
8. preserve every existing PoU assertion and do not lower historical acceptance.

Only after this bounded hardening passes may the repository open the later explicit Production CRM Decision Gate or proceed into separately governed E2 re-import work based on the resulting evidence.
