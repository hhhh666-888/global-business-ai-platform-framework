# GBAP Stage 3.4｜Working Product + Architecture Position v0.2

**Status:** `WORKING POSITION / NON-FROZEN / NON-SELECTION / SUBJECT TO REAL DEVELOPMENT EVIDENCE`

**Supersedes prospectively:** `GBAP_Stage3_4_Working_Product_Architecture_Position_v0.1.md`

**Authority context:** `docs/architecture/GBAP_STAGE3_ACTIVE_BASELINE_v0.6.md`

**Purpose:** preserve the current product/architecture discussion without converting discussion tendencies into frozen architecture, final vendor selection, final frontend architecture, or a CRM-only product definition.

This record retains the v0.1 working positions and adds one important clarification: the current Stage 3 hands-on work is focused on the CRM business block only. GBAP is a broader global-business platform whose employee-facing GBAP UI will expand as additional business capabilities are integrated and proven.

## 1. Current Stage 3 work is CRM-first, not CRM-only

Current implementation focus is CRM. This does not mean the final GBAP product is CRM only.

The CRM work is the first substantial business brick used to validate the minimum substrate against a real operational system.

Later business blocks may include, subject to separate evidence and implementation decisions:

- prospect discovery / finding customers;
- company and decision-maker research;
- outreach and communication;
- AI models, assistants and agents;
- enterprise knowledge and retrieval;
- tasks and workflow;
- technical requirement capture;
- solution / quotation support;
- project / delivery / service progression;
- analytics and management views;
- other global-business capabilities required by real operations.

Each later block may use mature OSS, SaaS, standards, models, agents, libraries or GBAP-native implementation according to `ASSEMBLY FIRST / REUSE FIRST / INTEGRATE FIRST / BUILD LAST`.

## 2. GBAP unified UI should grow with the business capability map

The employee-facing UI must not be frozen today around the CRM-only navigation or screen model.

Working direction:

```text
GBAP unified employee product
├─ CRM / customers / opportunities
├─ prospect discovery / customer acquisition
├─ communications / follow-up
├─ AI / agents
├─ knowledge
├─ solution / quote / project work
├─ workflow / tasks
└─ analytics / administration
```

The exact modules, information architecture, navigation and frontend implementation remain open to evidence from later development.

Therefore:

- current Frappe / Twenty screens are not the final GBAP information architecture;
- Atomic-derived UI slices are references/reuse assets, not the final shell;
- current `apps/web` is not silently declared the final production frontend architecture;
- adding later business capabilities may legitimately expand or reorganize the GBAP UI;
- UI coherence must be evaluated at the whole-product level, not only inside CRM.

## 3. Mature engines may sit underneath one GBAP product surface

A mature CRM such as Frappe or Twenty may provide bounded backend business capability while employees primarily interact with GBAP-owned UI.

The same pattern may later apply to other business blocks when appropriate:

```text
GBAP employee UI
        ↓
GBAP business semantics / application contract
        ↓
replaceable sourced capability
```

Not every sourced system must expose its own dashboard as the normal employee experience.

## 4. Replacement remains anti-lock-in, not permanent multi-system mirroring

Replaceability primarily protects GBAP from long-term vendor / framework lock-in.

Normal posture for a stateful business domain such as CRM is expected to be:

```text
select one best-fit primary system
→ operate primarily on that system
→ preserve GBAP semantics, durable IDs, mappings, permissions, audit, exit and provenance
→ replace through governed migration/cutover later if needed
```

No current requirement exists to keep Twenty and Frappe in permanent hot standby, mirror every record, or maintain continuous bidirectional synchronization.

Blind stateful cross-provider failover remains rejected until the required continuity evidence exists.

## 5. Current CRM tendency remains non-final

Current working tendency remains that Frappe CRM appears closer to the present day-to-day overseas-sales workflow than Twenty, based on the currently proven Lead / Deal / Note / Call Log flow.

This remains only a development tendency. Frappe current tendency does not equal production CRM selection, and Twenty not currently preferred for daily workflow does not equal Twenty rejected.

Twenty remains the stronger currently proven custom-object / metadata-platform candidate.

The final CRM decision must continue to follow actual implementation, common-contract conformance, employee workflow usability, operations, exit evidence and product needs.

## 6. Actual business workflow remains the product test

Current representative overseas-sales flow:

```text
find distributors / factories / owners / decision-makers
→ research and qualify
→ create lead / account context
→ send development outreach
→ capture replies and communication history
→ follow up continuously
→ advance opportunity
→ coordinate next actions
→ prepare solution / quote
→ progress toward contract / project / delivery / service
```

CRM implements only part of this end-to-end path.

Later prospecting, AI, knowledge, communication, quotation and project blocks must connect into the same GBAP product rather than becoming unrelated standalone applications.

## 7. What GBAP must own long term

GBAP does not need to own every internal provider table or reimplement every mature system.

GBAP must preserve the information and control required to keep the overall product coherent and replaceable, including where applicable:

- canonical business semantics;
- durable business IDs and continuity;
- provider/external mappings;
- identity / authorization boundaries;
- permissions and action authority;
- audit and evidence;
- source/provenance information;
- data exit / reconstruction requirements;
- application-level contracts between GBAP and sourced capabilities;
- unified employee product experience.

This ownership principle applies beyond CRM to future sourced business blocks.

## 8. Atomic CRM role remains UI/source reference

Atomic remains useful as native UI/source reuse evidence, component/layout reference, interaction and visual pattern source, and possible input to later GBAP-native employee UI work.

Atomic is not currently selected as the production CRM engine or final application shell.

Future UI work may also draw from other mature products and design systems; no single third-party UI source is frozen as the whole-product design authority.

## 9. Current non-decisions

```text
Production CRM Selection = NOT AUTHORIZED
Production UI Selection = NOT AUTHORIZED
Final Frontend Architecture = NOT AUTHORIZED
Frappe as final CRM = NOT SELECTED
Twenty as final CRM = NOT SELECTED
Atomic as final UI = NOT SELECTED
Permanent dual-CRM hot standby = NOT REQUIRED
Cross-CRM continuous synchronization = NOT REQUIRED
E2_REIMPORT_PROVEN = NO
E3_CUTOVER_PROVEN = NO
```

Likewise, no later business block such as prospecting or AI is pre-selected to a provider in this record.

## 10. Relationship to current next legal work

The formal next legal Stage 3 work remains:

> **Stage 3.4 bounded substrate hardening｜Canonical CRM Contract + Evidence-Governed Replacement Metadata**

This remains correct because CRM is the currently active real business brick.

However, the canonical CRM contract must be designed as one bounded domain contract inside a broader GBAP architecture, not as the universal contract for the whole product.

Future business blocks should repeat the same discipline only where substitution has real value:

```text
business semantics owned by GBAP
→ thin appropriate boundary
→ mature sourced capability where useful
→ unified GBAP product surface
```

The platform should not create a universal plugin abstraction merely for symmetry.

## 11. Working product direction

```text
GBAP / GBAP unified employee product
        ↓
multiple business modules added progressively
        ↓
GBAP-owned semantics / IDs / permissions / audit / UI
        ↓
replaceable mature engines, services, models, agents and source assets
```

CRM is the current implementation focus, not the final product boundary.

The final platform UI and final provider selections will continue to evolve through actual development and testing rather than being frozen by the current CRM PoUs.
