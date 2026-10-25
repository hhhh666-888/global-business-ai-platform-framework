# GBAP Stage 3.4 post-PoU synthesis｜Cross-PoU Decision Preparation + Substrate Delta Review v0.1

**Status:** `PASS / SYNTHESIS COMPLETE / BOUNDED FORWARD DELTAS IDENTIFIED / PRODUCTION CRM+UI SELECTION NOT AUTHORIZED`

**Authority baseline:** `docs/architecture/GBAP_STAGE3_ACTIVE_BASELINE_v0.5.md`

**Repository baseline reviewed:** `95d2f0b4d073b7398e29a9c0b560fdf70f38f9ae`

**Decision scope:** Twenty PoU-A, Atomic CRM PoU-B, Frappe CRM PoU-C, current permanent substrate implementation and the Stage 3.4 CRM Audit Decision Record.

This record completes the descriptive post-PoU synthesis authorized by Active Baseline v0.5. It does not assign a new numeric stage, reopen any CLOSED substrate Authority, select a production CRM, select a production UI, or advance E2/E3 replacement evidence.

---

## 1. Evidence set reviewed

Authoritative evidence reviewed:

- `docs/evidence/GBAP_Stage3_4_1_Twenty_Real_Engine_PoU_Record_v0.1.md`
- `docs/evidence/GBAP_Stage3_4_Atomic_Native_Source_UI_PoU_Record_v0.1.md`
- `docs/evidence/GBAP_Stage3_4_Frappe_Real_Engine_Comparator_PoU_Record_v0.1.md`
- `docs/evidence/stage3-4-frappe/frappe-vs-twenty-comparator.json`
- `docs/architecture/GBAP_Stage3_4_CRM_Audit_Decision_Record_v0.1.md`
- `docs/architecture/GBAP_Stage3_4_CRM_Technical_Product_Audit_v0.1.md`
- `docs/architecture/GBAP_STAGE3_ACTIVE_BASELINE_v0.1.md`
- `docs/architecture/GBAP_STAGE3_ACTIVE_BASELINE_v0.5.md`
- `tests/substrate/self-test.sh`
- `apps/api/server.mjs`
- `tests/pou/twenty/run.sh`
- `tests/pou/frappe/run.sh`
- `tests/pou/twenty/docker-compose.yml`
- `tests/pou/frappe/docker-compose.yml`

No conclusion below is allowed to exceed what these sources actually proved.

---

## 2. Cross-PoU factual synthesis

| Dimension | Twenty PoU-A | Frappe PoU-C | Atomic PoU-B |
|---|---|---|---|
| Role | complete CRM / metadata engine candidate | complete modern sales CRM engine candidate | native source/UI reuse asset |
| Mode | `HEADLESS_PROVIDER / MANAGED SERVICE` | `HEADLESS_PROVIDER / MANAGED SERVICE` | `NATIVE_LIBRARY_REUSE / SOURCE REUSE` |
| Result | `34/34 PASS` | `36/36 PASS` | `15/15 PASS` |
| Provider boundary | proven | proven | not an external-provider test |
| Durable mappings | proven | proven | not applicable to source-reuse PoU |
| Schema extensibility | first-class custom object proven | CRM Deal custom field + API v2 metadata proven | source-level UI reuse only |
| Daily-sales browser evidence | not part of PoU-A | Leads / Deals / Notes / Call Logs real Chromium proven | native GBAP account/opportunity surface real Chromium proven |
| Communication evidence | not specifically exercised | FCRM Note + manual Call Log proven | not a communication-engine test |
| External telephony/messaging | not proven | Twilio / Exotel / WhatsApp not exercised | not applicable |
| Export/exit | `E1_EXPORT_PROVEN` | `E1_EXPORT_PROVEN` | does not advance CRM replacement evidence |
| E2 re-import | NO | NO | NO |
| E3 cutover | NO | NO | NO |
| Complete provider removal + GBAP survival | proven | proven | not an external-provider test |
| Production selection | not authorized | not authorized | not authorized |

The three PoUs therefore prove two integration modes and three useful sourcing paths, but they do not yet prove cross-provider semantic substitution.

---

## 3. Technical posture after three PoUs

### 3.1 Twenty

Twenty remains the strongest evidence-backed candidate for **rich object/schema extensibility** in the tested set because the PoU created and used a first-class custom object through the metadata API. The earlier source/document audit also ranked Twenty first overall.

Its PoU did not include real daily-sales browser testing and did not specifically exercise communication workflow. Those absences must remain `NOT TESTED`, not be inferred as failures.

The tested Twenty PoU topology contains five services including the GBAP adapter: PostgreSQL, Redis, Twenty server, Twenty worker and `twenty-adapter`. The permanent record already classifies Twenty as structurally heavy (`R4`).

### 3.2 Frappe CRM

Frappe is the stronger tested candidate for **daily sales workflow evidence** because the PoU verified real Chromium Leads, Deals, Notes and Call Logs and exercised Organization, Lead, Deal, Note and manual Call Log through the GBAP boundary.

The PoU proved custom-field metadata, not a Twenty-equivalent first-class custom-object exercise. External Twilio, Exotel and WhatsApp delivery was not tested.

The tested Frappe PoU topology contains eleven compose services including setup services and the GBAP adapter: MariaDB, two Redis roles, configurator, create-site, backend, websocket, queue worker, scheduler, frontend and `frappe-adapter`. This is a materially larger tested orchestration surface than the Twenty PoU, although the setup services are not all steady-state application roles.

### 3.3 Atomic CRM

Atomic must remain in a different decision lane. It proved that selected MIT account/opportunity UI source can be detached from Supabase assumptions and run natively behind a GBAP-owned `CrmReadPort` without iframe or external runtime network dependency.

Atomic therefore informs the **employee-facing UI sourcing strategy**, not the Twenty-versus-Frappe engine decision.

---

## 4. Core substrate verdict

**Verdict:** `RETAIN / NO CLOSED-AUTHORITY REOPEN REQUIRED`

The core minimum substrate mechanisms survived two materially different real CRM engines:

- provider registration;
- provider-scoped secret references;
- capability binding and invocation;
- egress allowlisting;
- timeout / retry / failure posture;
- dynamic provider health;
- provider outage isolation;
- durable external mappings;
- mapped-provider uninstall guard;
- governed mapping release;
- lifecycle audit;
- provider unregister;
- zero-provider GBAP survival.

Neither Twenty nor Frappe required direct provider-database coupling, replacement of GBAP IAM, replacement of GBAP durable IDs, replacement of the provider registry, or adoption of a third-party application framework as the GBAP substrate.

The MariaDB readiness issue and long-run access-token expiry found during Frappe PoU were implementation/orchestration issues and were corrected without changing the substrate constitution or weakening acceptance criteria.

Therefore Stage 3.3 / Stage 3.3.1 are not reopened.

---

## 5. Material post-PoU delta: Canonical CRM Contract

**Delta ID:** `DELTA-CRM-01`

**Classification:** `REQUIRED / BLOCKER BEFORE PRODUCTION CRM SELECTION GATE`

The most important cross-PoU finding is that both CRM engines work behind the same mechanical provider boundary, but the provider-facing capability vocabulary is still provider-shaped.

Twenty PoU registered capabilities such as:

- `crm.company.create`
- `crm.person.create`
- `crm.opportunity.create`
- `crm.custom-record.create`

Frappe PoU registered capabilities such as:

- `crm.organization.create`
- `crm.lead.create`
- `crm.deal.create`
- `crm.note.create`
- `crm.call-log.create`

This proves **multi-provider insertion**, but it does not yet prove **provider substitution without GBAP business-code knowledge of provider semantics**.

### Required correction

GBAP must define a provider-neutral **Canonical CRM Contract** derived from GBAP/GBAP business semantics and frozen domain authority, not from Twenty or Frappe nouns.

Provider-specific translation must live only inside adapters.

The contract must define:

- canonical capability names;
- canonical request schemas;
- canonical response schemas;
- canonical error semantics;
- canonical pagination/list semantics;
- canonical durable-ID linkage expectations;
- optional-capability declaration where a provider cannot implement a non-mandatory feature;
- contract version.

The exact canonical entity vocabulary must be reconciled against the frozen GBAP domain model before implementation. The next implementation must not silently decide that `Company`, `Organization`, `Lead`, `Person`, `Deal` or `Opportunity` are interchangeable merely because a provider uses those words.

### Conformance requirement

The same business-level test fixture and the same GBAP capability calls must run unchanged against Twenty and Frappe adapters. Provider-specific scripts may bootstrap the upstream systems, but the business scenario itself must be contract-identical.

Until that passes:

`CROSS_PROVIDER_SEMANTIC_SUBSTITUTION = NOT PROVEN`

---

## 6. Replacement evidence governance hardening

**Delta ID:** `DELTA-CRM-02`

**Classification:** `REQUIRED GOVERNANCE HARDENING BEFORE PRODUCTION SELECTION AUTHORITY IS CLOSED`

The current provider registry stores `replacementEvidence` as a registration field whose allowed enum is `E0/E1/E2/E3`. The real Twenty and Frappe PoUs correctly registered themselves at `E0` and wrote separate permanent evidence proving `E1`.

However, the substrate currently has no dedicated evidence-governed transition that binds:

- previous replacement level;
- new replacement level;
- immutable or durable evidence reference;
- tested provider/upstream/adapter version;
- actor;
- timestamp;
- scope;
- audit event.

Therefore the registry field by itself is not yet sufficient authority for E1/E2/E3.

### Required correction

Replacement evidence must be advanced through a governed transition rather than arbitrary provider registration metadata.

At minimum:

1. new provider registration starts at `E0` unless a separately governed import of pre-existing authority is explicitly supported;
2. E1/E2/E3 advancement requires an evidence reference and audit event;
3. the evidence record captures the exact provider/upstream/adapter identity that was tested;
4. later provider upgrades do not silently inherit old evidence without an explicit compatibility/revalidation rule;
5. the system can represent evidence invalidation or supersession without deleting historical evidence.

Existing permanent Twenty/Frappe PoU records remain authoritative evidence. This delta does not invalidate them.

---

## 7. Re-import and cutover remain separate, real gaps

**Delta ID:** `DELTA-CRM-03`

**Classification:** `REQUIRED BEFORE E2/E3 CAN BE CLAIMED / NOT RETROACTIVELY REQUIRED FOR CURRENT E1 POU PASS`

Two independent provider exports do not constitute re-import.

A real E2/E3 path requires:

- a canonical CRM exchange/reconstitution schema for the selected portable business slice;
- preservation of GBAP durable business IDs;
- source and target mapping coexistence during migration;
- explicit source→target mapping lineage;
- re-import verification into the target engine;
- pre-cutover validation;
- a governed capability-binding cutover operation;
- rollback posture;
- audit evidence.

### No automatic cross-provider failover

The synthesis explicitly rejects adding blind health-based automatic failover between stateful CRM providers as a shortcut.

An unhealthy Twenty instance must not automatically cause writes to Frappe, or vice versa, unless the target has a proven synchronized state and an explicitly authorized cutover policy. For stateful business systems, automatic provider failover without data-continuity proof can create split truth.

The current fail-degraded behavior is therefore retained until E3-grade cutover semantics are deliberately implemented.

---

## 8. Provider provenance normalization

**Delta ID:** `DELTA-CRM-04`

**Classification:** `REQUIRED PRODUCTION HARDENING / MAY BE IMPLEMENTED WITH DELTA-CRM-02`

The current registry has one general `version` field. The two real PoUs demonstrate that production governance needs to distinguish at least:

- upstream product/version;
- upstream commit or immutable image digest;
- GBAP adapter revision/build;
- canonical capability-contract version;
- relevant configuration/schema revision.

This is required so that health, evidence and replacement claims are attached to the exact tested integration, not only to a mutable provider name.

---

## 9. Deltas explicitly NOT required by current evidence

The post-PoU evidence does **not** justify adding or reopening any of the following:

- universal plugin operating system;
- Kafka / NATS / RabbitMQ solely for CRM integration;
- Kubernetes or service mesh solely because Frappe/Twenty are multi-service;
- Frappe Framework or ERPNext as the GBAP substrate;
- Twenty as the GBAP substrate;
- direct CRM database writes from GBAP;
- automatic stateful cross-provider failover;
- replacement of Keycloak/OIDC;
- rewrite of `apps/web` to a vendor UI;
- adoption of Atomic/Supabase as business persistence.

`BUILD LAST` remains in force.

---

## 10. EspoCRM control benchmark decision

**Decision:** `DO NOT PROMOTE NOW / KEEP AS CONDITIONAL CONTROL BENCHMARK`

The Stage 3.4 audit instructed GBAP to promote EspoCRM if Twenty or Frappe exposed a material blocker in CRM depth, API quality, data exit, operational fit or licensing boundaries.

The hands-on PoUs did not expose such a blocker in the tested scope:

- both engines passed real API/provider-boundary use;
- both produced E1 export evidence;
- both survived outage/recovery tests at the GBAP boundary;
- both could be fully removed without collapsing GBAP;
- no tested licensing boundary blocked the PoU architecture.

Therefore a fourth CRM installation now would add cost without answering the most important unresolved question, which is the missing **common GBAP CRM semantic contract** between the two already-proven engines.

EspoCRM is promoted only if the next common-contract/conformance work reveals a material unmet mandatory CRM requirement, API limitation, exit limitation, licensing issue or unacceptable operational constraint in both/current leading candidates.

---

## 11. Decision preparation posture — not production selection

Current evidence supports the following role-specific posture:

```text
Twenty
= strongest proven schema/custom-object engine candidate

Frappe CRM
= strongest proven daily-sales / communication-surface engine candidate

Atomic CRM
= strongest proven native source/UI reuse asset among the tested PoUs
```

This does **not** create a winner.

The composition that should be evaluated next is:

```text
GBAP / GBAP employee product
→ GBAP-owned native UI
→ GBAP-owned Canonical CRM Contract
→ replaceable CRM adapter
→ one selected headless CRM engine

Optional UI source material
→ selectively reused Atomic MIT primitives/components
→ still behind GBAP-owned semantic ports
```

This preserves product ownership while allowing the backend engine decision and UI-source decision to remain independent.

---

## 12. Later Production CRM Decision Gate — prerequisites prepared by this synthesis

A later explicit production CRM decision may be opened only after the following minimum technical preparation exists:

1. `DELTA-CRM-01` canonical CRM contract is defined from GBAP business semantics;
2. Twenty and Frappe adapters both implement the same mandatory contract slice;
3. one identical GBAP-level conformance scenario passes against both providers without business-test code knowing the provider;
4. provider-specific semantic differences and unsupported optional features are documented, not hidden;
5. `DELTA-CRM-02` evidence-governance hardening prevents unproven E-level self-assertion;
6. `DELTA-CRM-04` provider/upstream/adapter/contract provenance is recorded distinctly;
7. technical evidence is then combined with a separate product/business decision covering required workflow fit, employee usability, operations, licensing and lifecycle cost.

`E2_REIMPORT_PROVEN` and `E3_CUTOVER_PROVEN` are not silently made prerequisites for merely choosing a candidate, but the project may not claim proven production replaceability beyond E1 until `DELTA-CRM-03` is executed and evidenced.

A production go-live/freeze must state the actual E-level truth explicitly.

---

## 13. Current Gate

```text
Stage 3.4 post-PoU synthesis
= PASS / COMPLETE

Core minimum substrate
= RETAIN

Closed substrate Authority reopen
= NO

Three real-brick PoUs
= RETAINED PASS

Cross-provider mechanical insertion
= PROVEN

Cross-provider semantic substitution
= NOT YET PROVEN

DELTA-CRM-01 Canonical CRM Contract
= REQUIRED

DELTA-CRM-02 Evidence-Governed Replacement Level
= REQUIRED

DELTA-CRM-03 Re-import + Governed Cutover
= REQUIRED BEFORE E2/E3

DELTA-CRM-04 Integration Provenance Normalization
= REQUIRED PRODUCTION HARDENING

EspoCRM control benchmark
= NOT PROMOTED / CONDITIONAL RESERVE

Production CRM Selection
= NOT AUTHORIZED

Production UI Selection
= NOT AUTHORIZED

E2_REIMPORT_PROVEN
= NO

E3_CUTOVER_PROVEN
= NO
```

---

## 14. Next legal Stage 3 work item

No formal numeric identifier is assigned by current Authority. The next work item is therefore descriptive:

> **Stage 3.4 bounded substrate hardening｜Canonical CRM Contract + Evidence-Governed Replacement Metadata**

Required first implementation slice:

1. define the GBAP-owned canonical CRM capability contract from frozen business semantics;
2. version the contract;
3. refactor Twenty and Frappe adapters to implement the same mandatory slice without leaking provider nouns into GBAP business calls;
4. add a provider-agnostic conformance harness that runs the same business scenario against both;
5. harden replacement-evidence advancement with evidence references and audit;
6. normalize upstream/adapter/contract provenance fields;
7. rerun the permanent substrate self-test plus both real CRM contract tests without weakening prior gates.

Only after that bounded hardening passes should the repository prepare the explicit Production CRM Decision Gate or proceed to E2 re-import testing, depending on the resulting evidence.