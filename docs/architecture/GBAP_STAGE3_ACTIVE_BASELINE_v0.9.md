# Global Business AI Platform｜Stage 3 Active Baseline v0.9

Status: `ACTIVE / TWENTY PRODUCTION INTEGRATION FOUNDATION PASS / TWENTY REMAINS SELECTED HEADLESS CRM ENGINE / DAILY-SALES CRM CORE BOUNDARY CONFIRMED / PRODUCTION UI NOT YET CLOSED / E2-E3 NOT PROVEN`

Supersedes prospectively: `GBAP_STAGE3_ACTIVE_BASELINE_v0.8.md`

Project: **全球业务智能平台｜Global Business AI Platform**

Brand: **GBAP**

Current repository: `hhhh666-888/global-business-ai-platform`

This baseline advances Stage 3 after the descriptive `Stage 3.4 continuation｜Selected Twenty Production Integration Foundation`. It does not create a new numeric stage, authorize production go-live, claim E2/E3, or authorize automatic Twenty→Frappe failover.

---

## 1. Selected CRM direction

```text
Production CRM engine
= TWENTY

Role
= HEADLESS CRM ENGINE BEHIND GBAP-OWNED CANONICAL CONTRACT

Initial semantic baseline
= Twenty v2.37.0

Production integration foundation
= PASS
```

GBAP business code remains bound to `gbap.crm.v1`; Twenty-specific nouns and fields remain adapter details.

---

## 2. Daily-sales boundary now confirmed

For this implementation track Twenty is accepted as the engine substrate for ordinary CRM sales mechanics:

```text
Account / customer company records
Contact records
Opportunity / pipeline mechanics
follow-up / task / reminder mechanics
CRM activity/history substrate
```

Employees are still intended to use the GBAP/GBAP product surface, not a vendor dashboard as the permanent shell.

The following remain independent bricks/providers and are not made permanent Twenty dependencies:

```text
customer acquisition/search
Google Maps / trade-data / public-data sourcing
contact enrichment/verification
WhatsApp / messaging providers
AI models / agents / assistants
knowledge/document engines
quotation/BOM/pricing
energy solution / EPC calculation
other GBAP business-domain capabilities
```

`ASSEMBLY FIRST / REUSE FIRST / INTEGRATE FIRST / BUILD LAST` remains in force.

---

## 3. Production foundation controls

Authoritative record:

`docs/architecture/GBAP_Stage3_4_Selected_Twenty_Production_Integration_Foundation_v0.1.md`

Implemented controls include:

- immutable Twenty image-digest contract;
- deployment-governed Postgres/Redis image identities;
- external secret injection;
- dedicated adapter API-key file;
- private Twenty engine network;
- adapter-only bridge to the GBAP runtime network;
- no production Twenty host port in the foundation;
- `SUBSTRATE_ENV=production` aligned with provider `environmentScope=production`;
- production-global initial provider scope until an explicit scoped-provider decision;
- production provider starts at E0;
- canonical-only mandatory production capability binding;
- backup/restore minimum contract;
- upgrade/revalidation and rollback contract;
- Frappe excluded from normal runtime routing.

---

## 4. Acceptance evidence

```text
PR
= #17

Full foundation workflow
= 33440165387
= PASS

Foundation governance self-test
= 12 / 12 PASS

Production compose render
= PASS

Permanent substrate regression
= historical 63 assertions PASS

Final resolver/provider scope alignment static workflow
= 33440500268
= static foundation check PASS
= production compose render PASS
```

No repeated real-engine Twenty/Frappe PoU was required because this work did not alter the tested adapter/upstream semantic path.

---

## 5. Provider lifecycle truth

Initial production provider:

```text
providerId
= twenty-crm-production

environmentScope
= production

replacementEvidence
= E0

contractVersion
= gbap.crm.v1
```

The production integration does not automatically inherit PoU E1 merely because the product/version is Twenty v2.37.0. E-level advancement belongs to the exact deployed upstream image + adapter + config + schema identity and must use the evidence-governed transition API.

---

## 6. Frappe remains retained evidence

```text
Frappe adapter
= RETAIN

Frappe PoU / canonical conformance / E1 export evidence
= RETAIN PASS

Normal production runtime routing
= NO

Automatic hot standby
= NO

Automatic Twenty -> Frappe writes
= NO
```

Frappe remains a validated alternate/control comparator, not a synchronized secondary CRM.

---

## 7. Replacement truth

```text
Twenty E1 PoU export evidence
= YES

Frappe E1 PoU export evidence
= YES

Production Twenty registration initial level
= E0

E2_REIMPORT_PROVEN
= NO

E3_CUTOVER_PROVEN
= NO

Full production replaceability
= NOT CLAIMED
```

---

## 8. Production go-live remains blocked

The production integration foundation is configuration/governance readiness, not a live production deployment.

Before production go-live, later Authority must still cover at least:

- real production deployment identity/digests;
- production secret provisioning;
- production provider registration and health;
- production schema/bootstrap acceptance;
- backup + clean restore drill;
- license/legal review;
- employee product/UI operational acceptance;
- relevant monitoring/operations evidence;
- explicit go-live Gate.

---

## 9. Current Gate

```text
Production CRM Decision Gate
= PASS

Selected CRM engine
= TWENTY

Selected Twenty Production Integration Foundation
= PASS

Daily-sales CRM core boundary
= CONFIRMED

External acquisition/AI/messaging/etc.
= SEPARATE BRICKS / NOT TWENTY-LOCKED

Production UI
= GBAP-OWNED DIRECTION / IMPLEMENTATION NOT YET CLOSED

DELTA-CRM-03 E2/E3
= NOT IMPLEMENTED

Production go-live
= NOT AUTHORIZED
```

---

## 10. Next legal Stage 3 work item

No new numeric identifier is assigned.

The next legal work item is:

> **Stage 3.4 continuation｜GBAP Native CRM Employee Workbench Foundation**

Purpose:

- expose customer/company and contact work through GBAP;
- expose opportunity/pipeline work through GBAP;
- expose follow-up/tasks/reminders/activity history through GBAP;
- call only GBAP canonical/business-service boundaries;
- keep Twenty-specific UI/API semantics behind the adapter;
- leave acquisition, WhatsApp, AI, quotation/EPC and later modules for separately selected bricks.

This is implementation of the already-selected architecture, not another CRM PoU or selection exercise.
