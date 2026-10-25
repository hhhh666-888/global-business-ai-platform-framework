# GBAP Stage 3.4 bounded substrate hardening｜Canonical CRM Contract + Evidence-Governed Replacement Metadata v0.1

**Status:** `PRE-MERGE ACCEPTANCE PASS / FINAL MERGE + REMOTE READ-BACK PENDING`

**Authority baseline:** `docs/architecture/GBAP_STAGE3_ACTIVE_BASELINE_v0.6.md`

**Scope:** descriptive Stage 3.4 continuation only. This record does not assign a new numeric stage, reopen Stage 3.3/3.3.1 CLOSED Authority, select a production CRM/UI, or claim E2/E3.

---

## 1. Authority correction applied before acceptance

The first implementation draft used a provider-shaped `Account / Lead / Opportunity` canonical slice. That was rejected during reverse audit because Phase 2 FINAL_CLOSED v1.7 freezes GBAP V1 Customer & Sales truth around `Account / Contact / Opportunity` and explicitly keeps `Lead` out of the current V1 entity model.

The canonical contract is therefore owned by GBAP business semantics, not by Twenty or Frappe vocabulary.

Final bounded canonical V1 slice:

```text
Account
Contact
Opportunity
```

Provider-native Lead remains allowed only as provider-specific/historical compatibility evidence. It is not a GBAP canonical V1 business entity.

For Opportunity, the bounded slice also preserves the frozen Phase 2 semantics that:

- `name_summary` is creation-required business meaning;
- `lifecycle_state` is required;
- an `OPEN` Opportunity must resolve to a valid Account context.

This hardening does not normalize every later Opportunity lifecycle transition. The current conformance slice proves bounded `OPEN` creation only.

---

## 2. DELTA-CRM-01｜Canonical CRM Contract

**Implementation:** `contracts/crm/v1/contract.json`

Mandatory provider-neutral capabilities:

```text
crm.v1.account.create
crm.v1.account.list
crm.v1.contact.create
crm.v1.contact.list
crm.v1.opportunity.create
crm.v1.opportunity.list
crm.v1.snapshot.export
```

Business callers submit GBAP durable `businessId` values. Provider external IDs are resolved only inside the GBAP mapping/provider boundary.

Adapters normalize provider records back to provider-neutral forms, after which GBAP restores durable business IDs from mapping state.

Historical provider-specific capabilities remain available only for PoU compatibility and regression evidence. They are not the canonical business protocol.

---

## 3. Twenty adapter translation

Twenty remains a headless provider candidate.

Canonical mapping:

```text
GBAP Account      -> Twenty Company
GBAP Contact      -> Twenty Person
GBAP Opportunity  -> Twenty Opportunity
```

The adapter translates GBAP `displayName`, `personName`, `nameSummary`, Account relation and bounded Opportunity semantics into Twenty-specific fields without exposing Twenty nouns to GBAP business callers.

Historical `crm.company.*`, `crm.person.*`, `crm.opportunity.*`, custom-object and snapshot PoU capabilities remain intact for regression evidence.

---

## 4. Frappe adapter translation

Frappe CRM remains a headless provider candidate.

Canonical mapping:

```text
GBAP Account      -> CRM Organization
GBAP Contact      -> Frappe Contact
GBAP Opportunity  -> CRM Deal
```

Frappe CRM Deal does not provide a separate native field that is semantically equivalent to frozen GBAP `opportunity.name_summary`. The PoU choreography therefore creates a dedicated custom field:

```text
gbap_opportunity_name_summary
```

This field is distinct from the historical PoU field `gbap_project_code`; the two meanings are not conflated.

Frappe-native Lead, Note and Call Log capabilities remain historical/provider-specific compatibility evidence and are not promoted into the GBAP canonical V1 contract.

---

## 5. Provider-neutral semantic conformance

**Harness:** `tests/conformance/crm/canonical-conformance.sh`

The exact same business-level scenario is injected into the existing Twenty and Frappe real-engine PoU runners. The shared scenario contains no provider-specific business vocabulary.

Current acceptance set contains 14 canonical assertions covering:

1. Account create + automatic durable mapping;
2. independent Contact create + mapping;
3. negative proof that an `OPEN` Opportunity without Account is rejected with the canonical Account gate;
4. negative proof that `crm.v1.lead.create` is unavailable because Lead is not a current GBAP V1 canonical entity;
5. OPEN Opportunity creation through Account business ID resolution;
6. frozen Opportunity `nameSummary + lifecycleState` semantics;
7. provider-neutral lists with reverse durable-ID resolution;
8. provider-neutral canonical export;
9. all canonical mappings persisted;
10. E0→E1 evidence transition bound to evidence + scope + integration provenance;
11. replacement evidence history retains scope + provenance snapshot;
12. normalized provider provenance is inspectable;
13. canonical mapping and evidence actions are audited;
14. conformance mappings are released through the governed API.

The same 14-assertion harness passed unchanged against both real Twenty and real Frappe on the accepted pre-merge HEAD. Therefore:

```text
CROSS_PROVIDER_SEMANTIC_SUBSTITUTION
= PROVEN
= BOUNDED TO GBAP CRM V1 ACCOUNT / CONTACT / OPPORTUNITY CONTRACT SLICE
```

This proof does not imply E2 re-import, E3 cutover, full feature parity, or production-provider selection.

---

## 6. DELTA-CRM-02｜Evidence-Governed Replacement Level

New providers cannot self-assert E1/E2/E3. Registration begins at `E0`.

Advancement is stepwise only:

```text
E0 -> E1 -> E2 -> E3
```

Each transition binds and preserves:

- previous level;
- new level;
- evidence reference;
- SHA-256 evidence digest;
- decision reference when supplied;
- explicit evidence scope;
- actor;
- timestamp;
- immutable snapshot of the registered integration provenance at the time of transition;
- audit event.

A provider/adapter version change therefore cannot be treated as if a previous evidence transition automatically proves the changed integration.

The dedicated destructive governance test is `tests/substrate/replacement-metadata-self-test.sh`. It preserves all previous assertions and adds an explicit negative assertion that an evidence transition without scope is rejected.

---

## 7. DELTA-CRM-04｜Integration Provenance Normalization

Canonical provider metadata now distinguishes:

```text
Canonical Contract version
Upstream product
Upstream version
Upstream commit (when known/applicable)
Immutable upstream image digest (when available)
GBAP adapter revision
Configuration revision
Schema/customization revision
```

Canonical CRM registration requires product, version and adapter identity plus at least an upstream commit or immutable image digest. A supplied image digest must be a valid SHA-256 digest.

Real PoU registration posture:

- Twenty: product + v2.37.0 + immutable running image digest + adapter/config/schema revision;
- Frappe CRM: product + v1.82.0 + pinned upstream commit `48cb3cccec12ef798f8faacc165fff3dc008a8fa` + immutable running image digest + adapter/config/schema revision.

The provenance snapshot is copied into every replacement-evidence transition record, so later registry mutation cannot silently rewrite what integration the evidence originally proved.

---

## 8. DELTA-CRM-03 remains outside this bounded implementation

This work does not claim:

```text
E2_REIMPORT_PROVEN
E3_CUTOVER_PROVEN
```

The following remain future governed work before E2/E3 can be claimed:

- canonical re-import/reconstitution;
- source→target mapping lineage;
- target validation;
- governed capability-binding cutover;
- rollback;
- cutover audit evidence.

Blind automatic cross-CRM write failover remains rejected because it can create split business truth.

---

## 9. Permanent regression requirements

Final acceptance must retain all previously proven behavior. No historical acceptance may be reduced to make this hardening pass.

Required final CI evidence:

```text
Existing substrate destructive self-test
= PASS / existing 63 assertions retained

Replacement metadata governance self-test
= PASS / 11 assertions

Twenty historical real-engine PoU + canonical CRM conformance
= PASS / canonical 14 assertions

Frappe historical real-engine PoU + canonical CRM conformance
= PASS / canonical 14 assertions

Independent Frappe real-engine/browser comparator
= PASS
```

Accepted pre-merge evidence:

```text
Accepted source HEAD
= a1a16e6efc6c7382e2466a90ab91eee9075efc22

Canonical hardening workflow
= run 33434899418

Existing substrate regression + replacement metadata governance
= SUCCESS

Twenty / same canonical CRM v1 business scenario
= SUCCESS

Frappe / same canonical CRM v1 business scenario
= SUCCESS

Independent Frappe real-engine/browser comparator workflow
= run 33434899338
= SUCCESS
```

The governance-record-only commit that records this evidence must itself pass the final canonical hardening workflow before merge.

---

## 10. Current Gate

```text
Canonical CRM Authority alignment
= PASS

Canonical Account / Contact / Opportunity contract
= PASS

Lead as current GBAP canonical V1 entity
= REJECTED / runtime negative gate PASS

OPEN Opportunity without Account
= REJECTED / runtime negative gate PASS

Twenty canonical adapter
= PASS

Frappe canonical adapter
= PASS

Provider-neutral dual-engine conformance harness
= PASS / 14 assertions on each real engine

CROSS_PROVIDER_SEMANTIC_SUBSTITUTION
= PROVEN / bounded canonical contract slice only

Evidence-governed E-level transition
= PASS

Evidence scope binding
= PASS

Transition provenance snapshot
= PASS

Normalized product/version/commit/image/adapter/contract provenance
= PASS

Permanent substrate regression
= PASS / 63 assertions retained

Replacement metadata governance
= PASS / 11 assertions

Independent Frappe historical/browser comparator
= PASS

DELTA-CRM-03 E2/E3 re-import + cutover
= NOT IMPLEMENTED / NOT CLAIMED

Production CRM Selection
= NOT AUTHORIZED

Production UI Selection
= NOT AUTHORIZED

Pre-merge hardening status
= ACCEPTANCE PASS

Final hardening declaration
= PENDING SQUASH MERGE + MAIN REMOTE READ-BACK
```

A final PASS/COMPLETE declaration is authorized only after this governance-record commit passes the final CI gate, PR #13 is squash-merged, and the merged `main` state is remotely read back and confirms the accepted contract, implementation, governance record, and nonclaims.
