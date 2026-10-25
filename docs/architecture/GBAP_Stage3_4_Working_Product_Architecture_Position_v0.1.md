# GBAP Stage 3.4｜Working Product + Architecture Position v0.1

**Status:** `WORKING POSITION / NON-FROZEN / NON-SELECTION / SUBJECT TO REAL DEVELOPMENT EVIDENCE`

**Authority context:** `docs/architecture/GBAP_STAGE3_ACTIVE_BASELINE_v0.6.md`

**Purpose:** preserve the current product/architecture discussion without converting discussion tendencies into frozen architecture or production CRM selection.

This record is intentionally **non-authoritative for final vendor selection**. It supplements the post-PoU synthesis by clarifying what replacement, UI ownership and data ownership mean in practical GBAP use. It does not modify prior PASS evidence, does not reopen CLOSED substrate Authority, does not advance E2/E3, and does not authorize a production CRM or UI.

---

## 1. Replacement is an anti-lock-in capability, not a permanent dual-CRM hot-standby requirement

Current working position:

> GBAP does not need every business domain to keep two mature systems running in permanent hot standby.

For CRM, the normal intended operating posture is:

```text
choose the best-fit primary CRM for the current product stage
→ use it as the main operational CRM
→ keep GBAP-owned semantics / IDs / mappings / permissions / audit / exit evidence
→ preserve a governed path to replace the CRM later if business or technical conditions change
```

The primary purpose of replaceability is to prevent GBAP from becoming permanently locked to one vendor, product or framework.

It is **not** currently a requirement to:

- run Twenty and Frappe simultaneously for all normal CRM work;
- maintain real-time bidirectional synchronization between multiple CRMs;
- mirror every CRM record into every alternative CRM;
- perform blind health-based stateful failover from one CRM to another.

This working position is consistent with Active Baseline v0.6, which rejects blind cross-CRM failover until E3-grade continuity exists.

---

## 2. Current practical business context

The current CRM discussion is grounded in GBAP's actual overseas-sales workflow rather than abstract CRM feature scoring alone.

Representative daily business path:

```text
find distributors / factories / owners / decision-makers
→ create and qualify leads
→ send initial outreach / development messages
→ record replies and communication history
→ follow up continuously
→ advance qualified opportunities
→ coordinate next actions, tasks and notes
→ convert into solution / quote / project progression
```

A production CRM decision should therefore evaluate how well the candidate supports this real operating flow with low employee friction.

---

## 3. Current Frappe tendency is a working preference, not a production decision

Current discussion tendency:

> Based on the present practical workflow, Frappe CRM appears potentially closer to GBAP's day-to-day sales process than Twenty.

The reason for this tendency is the evidence already observed in PoU-C around Leads, Deals, Notes and Call Logs and the more direct daily-sales workflow surface.

However:

```text
Frappe preferred now
≠ Frappe selected

Frappe PoU PASS
≠ production authorization

Twenty not currently preferred for daily sales
≠ Twenty rejected
```

Twenty remains a strong candidate, especially where rich metadata/custom-object extensibility becomes important.

The final choice remains open and must continue to be tested against actual development, employee workflow, maintainability, data exit, operational cost and future business needs.

---

## 4. Employee UI and CRM engine are separate architecture decisions

Current working position:

> GBAP may use Frappe, Twenty or another mature system underneath while employees use a GBAP-designed unified product UI.

Preferred composition to continue evaluating:

```text
GBAP employee-facing product
        ↓
GBAP native unified UI
        ↓
GBAP-owned business semantics / canonical contract
        ↓
provider adapter
        ↓
selected mature CRM engine
```

Therefore the selected CRM engine does not automatically determine the final employee-facing UI.

GBAP should preserve control over:

- navigation and information architecture;
- account/contact/lead/opportunity presentation;
- cross-domain workflow experience;
- permissions and role-aware surfaces;
- AI interaction patterns;
- unified visual language;
- product-level workflow across prospecting, CRM, communication, quotation, project and knowledge domains.

A third-party CRM dashboard may remain available for administration, diagnostics or exceptional workflows, but it is not automatically the normal GBAP employee product shell.

---

## 5. Atomic CRM role remains UI/source reference and selective reuse material

Current role:

`NATIVE_LIBRARY_REUSE / SOURCE REUSE`

Atomic CRM is currently more useful to GBAP as:

- UI reference;
- account/contact list pattern reference;
- deal/opportunity card and Kanban reference;
- component/source reuse material where licensing and implementation fit;
- a reference for building a native GBAP sales experience.

It is not currently being treated as the leading production CRM engine.

This preserves the PoU-B conclusion without over-promoting Atomic's full application/backend assumptions.

---

## 6. Data architecture does not require permanent cross-CRM duplication

Current working position:

> GBAP does not need Frappe and Twenty to continuously synchronize full CRM state with each other merely to claim provider replaceability.

GBAP's more important durable control points are:

1. **business semantics** — GBAP definitions of Account, Contact, Lead, Opportunity/Deal, Activity, Communication and related domain concepts;
2. **core durable IDs** — stable GBAP identity for business entities that must survive provider replacement;
3. **external mappings** — explicit relation between GBAP durable IDs and provider-specific IDs;
4. **authorization meaning** — role/organization/workspace boundaries owned by GBAP;
5. **audit** — who changed provider, mappings, configuration or lifecycle state;
6. **data exit** — evidence that required business data and schema can leave the provider;
7. **provenance** — provider version, adapter version, contract version and relevant configuration/schema revision.

Provider-native runtime state may remain inside the selected provider while it is in use.

The objective is **continuity and exit**, not indiscriminate duplication of every provider table.

---

## 7. Replaceability should be proportional to actual business risk

Not every capability requires the same replacement posture.

For CRM, current working posture is:

```text
one primary operational CRM
+ GBAP-owned semantics and durable identity
+ export/exit evidence
+ explicit mappings
+ replaceable adapter boundary
+ later governed migration/cutover if necessary
```

Higher-cost E2/E3 migration proof should be executed where it materially reduces business lock-in risk or before a production commitment makes replacement materially expensive.

This record does not itself decide when E2/E3 must be executed; Active Baseline v0.6 remains authoritative that they are currently unproven.

---

## 8. What is deliberately NOT frozen by this record

The following remain open:

- final production CRM engine;
- final employee-facing CRM UI architecture;
- whether Frappe ultimately becomes the primary CRM;
- whether Twenty is retained as a reserve, later rejected, or used for another bounded role;
- exact amount of Atomic-derived source reused in production;
- final canonical CRM contract shape;
- timing and scope of E2 re-import proof;
- timing and scope of E3 cutover proof;
- whether a later business need triggers EspoCRM or another control candidate.

These decisions must continue to be made through actual implementation and test evidence.

---

## 9. Working decision summary

```text
Permanent dual-CRM hot standby
= NOT A CURRENT REQUIREMENT

Real-time Twenty ↔ Frappe synchronization
= NOT A CURRENT REQUIREMENT

Replaceability objective
= AVOID LONG-TERM VENDOR / SOFTWARE LOCK-IN

Normal operating posture
= ONE PRIMARY CRM AT A TIME

Current practical tendency
= FRAPPE APPEARS CLOSER TO DAILY SALES WORKFLOW

Frappe production selection
= NOT DECIDED

Twenty rejection
= NO

GBAP-owned unified employee UI
= PREFERRED DIRECTION TO CONTINUE TESTING

Atomic CRM
= UI / SOURCE REUSE REFERENCE

GBAP durable control
= SEMANTICS + CORE IDs + MAPPINGS + PERMISSIONS + AUDIT + EXIT + PROVENANCE

Production CRM Selection
= NOT AUTHORIZED

Production UI Selection
= NOT AUTHORIZED
```

---

## 10. Relationship to the next implementation work

This working position does not replace the next legal item in Active Baseline v0.6:

> **Stage 3.4 bounded substrate hardening｜Canonical CRM Contract + Evidence-Governed Replacement Metadata**

It clarifies how that work should be interpreted:

- the Canonical CRM Contract exists to keep GBAP business code independent from the chosen CRM;
- it is not being built to force permanent dual-provider operation;
- adapters should allow later replacement without requiring daily multi-CRM synchronization;
- employee UI and engine choice remain decoupled;
- current Frappe preference may guide realistic conformance scenarios, but must not be encoded as a frozen provider decision.
