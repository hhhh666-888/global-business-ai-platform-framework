# GBAP Stage 3.4 continuation｜Native CRM Employee Workbench Capability + UI Reuse Matrix v0.1

**Status:** `DESIGN / CAPABILITY-SURFACE INVENTORY + UI REUSE DECISION / IMPLEMENTATION NOT YET STARTED`

**Authority baseline:** `docs/architecture/GBAP_STAGE3_ACTIVE_BASELINE_v0.9.md`

**Selected CRM engine:** `Twenty`

**Purpose:** define what the selected Twenty CRM brick should expose through the GBAP employee product surface, what UI assets can be directly reused, what remains provider-native/optional, and what belongs to other independent bricks.

This record corrects an overly narrow interpretation attempted after the Twenty production-integration foundation. The rejected experimental branch was reset to `main` before this record was created; no handwritten narrow CRM workbench implementation is accepted.

---

## 1. Phase 2 role is limited and explicit

Phase 2 is historical frozen Authority for **GBAP-owned domain/data truth**. It remains relevant only when a new implementation might contradict previously frozen business identity, lifecycle, ownership, authorization or truth-boundary rules.

Phase 2 is **not**:

- the current Stage 3 feature backlog;
- the Twenty product capability inventory;
- the employee UI navigation specification;
- a reason to hide mature capabilities already provided by the selected CRM engine;
- a requirement that every useful provider feature must first become a new canonical GBAP entity.

Implementation rule:

```text
Current provider capability / UX scope
= determined by current provider evidence + current Stage 3 decisions

GBAP durable business truth
= constrained by frozen Authority where applicable
```

Therefore the selected Twenty brick should be used substantially, not reduced to the minimum cross-provider PoU slice.

---

## 2. Correct product strategy

The CRM part of GBAP should not be a simplified reimplementation of Twenty.

Correct direction:

```text
GBAP global product shell
  -> CRM workspace built with mature Twenty visual/interaction patterns
  -> GBAP API / capability boundary
  -> Twenty adapter / selected engine
```

The employee should experience one GBAP product, while the CRM workspace exposes the useful capabilities of the selected CRM engine.

`ASSEMBLY FIRST / REUSE FIRST / INTEGRATE FIRST / BUILD LAST` remains mandatory.

---

## 3. UI source/reuse decision

Twenty's current upstream license states:

- most of the Twenty product remains AGPLv3 unless otherwise marked;
- `twenty-ui` is explicitly MIT-licensed;
- `twenty-sdk`, `twenty-client-sdk`, `create-twenty-app`, `twenty-shared`, `twenty-ui`, and applications under `packages/twenty-apps` are listed as MIT packages in the upstream license.

Upstream evidence:

- `https://github.com/twentyhq/twenty/blob/main/LICENSE`
- `https://github.com/twentyhq/twenty/blob/main/packages/twenty-ui/package.json`

### Directly reusable in GBAP

```text
twenty-ui
```

Initial reuse target includes the MIT library's exported families:

- navigation;
- layout;
- surfaces;
- input;
- data-display;
- feedback;
- icons;
- theme/theme constants;
- typography;
- utilities;
- accessibility primitives.

### Not automatically copied into GBAP

Twenty's main application frontend pages remain outside the MIT `twenty-ui` boundary unless the specific source file/package proves otherwise.

Default rule:

```text
DO NOT copy AGPL Twenty application pages into proprietary GBAP UI as ordinary source reuse.
```

Instead:

- reuse MIT `twenty-ui` components directly;
- reuse Twenty interaction/layout patterns as design references;
- implement GBAP screens against GBAP APIs;
- use provider APIs only behind adapters/capability boundaries.

### Data-access rule

`twenty-client-sdk` may be useful in provider/adapter implementation, but the employee UI must not directly bind normal business code to Twenty-specific APIs merely because the SDK is MIT.

Visual reuse and provider replaceability are separate concerns.

---

## 4. Twenty capability surface to expose

The current Twenty product/release evidence demonstrates a broad CRM workspace, including substantially more than Account/Contact/Opportunity.

### Tier A｜ordinary employee CRM surface

These should be first-class GBAP CRM UX, subject to availability/configuration:

1. **Companies / Accounts**
   - table/list views;
   - fields, owners, relations;
   - filtering/sorting;
   - record detail.

2. **People / Contacts**
   - table/list views;
   - company relations;
   - contact details;
   - record detail.

3. **Opportunities / Pipeline**
   - table;
   - Kanban;
   - stage movement;
   - amount/value;
   - ownership;
   - close context;
   - related company/contact context.

4. **Tasks**
   - task lists;
   - due dates;
   - assignees;
   - task status;
   - record-linked tasks.

5. **Notes**
   - rich notes;
   - record-linked notes;
   - timeline/context placement.

6. **Email**
   - connected mailbox experience where configured;
   - record-linked threads/messages;
   - compose/send/reply paths where governed;
   - shared/inbound email capabilities when selected.

7. **Calendar**
   - connected calendar events where configured;
   - events linked to CRM records;
   - calendar-oriented views.

8. **Files / Attachments**
   - upload;
   - preview where supported;
   - rename/download/delete subject to permissions;
   - record-linked attachments.

9. **Timeline / Activity context**
   - unified record-context chronology where available;
   - CRM task/note/email/calendar/file context should be visible close to the record.

10. **Search / Command palette**
    - fast cross-record navigation;
    - preview before opening where supported;
    - keyboard-first actions.

11. **Favorites / saved navigation**
    - favorite records/views/objects where useful.

12. **Multiple data views**
    - table;
    - Kanban;
    - calendar;
    - grouped table;
    - relationship-driven views where supported.

### Tier B｜manager / power-user CRM surface

1. **Dashboards**
   - aggregate/bar/line/pie widgets;
   - filtered metrics;
   - CRM operational dashboards;
   - table/Kanban/calendar style widgets where supported.

2. **Saved/custom views**
   - filters;
   - sorts;
   - grouping;
   - visible fields;
   - layout choices.

3. **Bulk operations**
   - selection-oriented actions where authorized;
   - import/export workflows.

4. **Record assignment / workload views**
   - owners/assignees;
   - workflow-driven assignment options where configured.

### Tier C｜CRM administrator / builder surface

1. **Data model customization**
   - custom objects;
   - custom fields;
   - relations;
   - indexes/settings only when appropriate to the selected deployment.

2. **Layout customization**
   - record-page layouts;
   - tabs;
   - widgets;
   - relation layouts.

3. **Workflow builder**
   - triggers;
   - filters;
   - search/update/create record actions;
   - HTTP/code/email/AI steps only where enabled and governed.

4. **Import/export administration**
   - CSV/spreadsheet import;
   - field mapping;
   - relation mapping;
   - export.

5. **Integration/application configuration**
   - selected supported provider/application setup;
   - must remain under GBAP governance and license/security review.

### Tier D｜provider-native optional/advanced capabilities

Twenty also exposes AI/app/agent and marketplace-style capabilities in current releases.

These may be surfaced inside the CRM workspace when useful, but they do **not** automatically become GBAP's global AI/application Authority.

Examples:

- CRM-local AI chat;
- CRM-local agent/workflow assistance;
- marketplace applications;
- call insight integrations;
- third-party enrichment integrations.

Policy:

```text
Provider-native advanced capability
= may be used as an optional CRM feature
!= permanent platform-wide dependency
```

---

## 5. Separate bricks remain separate

The following should not be forced into Twenty merely because Twenty is the selected CRM engine:

- customer acquisition/search;
- Google Maps / public web / trade-data sourcing;
- contact enrichment/verification;
- social-media acquisition;
- WhatsApp and other channel-specific providers where separate providers are better;
- platform-wide AI model/provider routing;
- enterprise knowledge/RAG;
- quotation/BOM/pricing;
- energy-system calculation/EPC design;
- project/engineering execution;
- other GBAP-specific business domains.

These bricks can exchange governed data with CRM, but Twenty must not become the universal platform database or universal UI shell.

---

## 6. Proposed GBAP shell + CRM IA

The permanent shell should distinguish global platform navigation from CRM-local navigation.

Illustrative global shell:

```text
GBAP
├─ 首页 / My Work
├─ CRM
├─ 找客户
├─ 沟通 / Channels
├─ AI
├─ 知识库
├─ 报价 / 方案
├─ 项目
├─ 数据 / Analytics
└─ 管理后台
```

Inside **CRM**, expose a Twenty-inspired workspace rather than a handmade card dashboard:

```text
CRM
├─ Dashboard
├─ Companies
├─ People
├─ Opportunities
├─ Tasks
├─ Notes
├─ Email
├─ Calendar
├─ Files
├─ Saved/Favorite Views
└─ CRM Settings / Builder   [permission-gated]
```

This is an IA direction, not a final frozen navigation label set.

---

## 7. Visual language decision

Do not invent a new visual system for CRM if Twenty already has a stronger one.

Reuse/borrow these Twenty patterns:

- compact left navigation;
- high-information table views;
- filter/sort chips and view controls;
- keyboard/command palette navigation;
- record side-panel / fast context switching;
- table ↔ Kanban ↔ calendar view switching;
- record pages with tabs/widgets/relations;
- subtle neutral palette and low-chrome UI;
- dense but readable CRM information architecture;
- consistent icons, spacing, typography and empty/loading states from `twenty-ui`.

GBAP branding should be applied at shell/theme/brand level rather than redesigning every CRM primitive.

---

## 8. Implementation technology direction

Current `apps/web` is a minimum static substrate UI and is not an acceptable final employee product surface.

For the Native CRM Employee Workbench implementation:

```text
React + Vite
+ twenty-ui (MIT)
+ GBAP auth/session client
+ GBAP API/capability client
```

Do not use direct Twenty REST/GraphQL calls in ordinary GBAP page components.

Do not force the existing static `index.html/app.js` substrate page to grow into the production product UI.

The substrate/admin diagnostic screen should remain available as an engineering/admin surface, but separated from the employee product shell.

---

## 9. Acceptance before implementation

Before visual implementation is accepted, the workbench track must prove:

1. Twenty capability inventory is not reduced to the minimum PoU slice;
2. employee navigation exposes the useful selected-engine CRM surface;
3. manager/admin features are permission-gated rather than deleted;
4. `twenty-ui` license/reuse boundary is documented;
5. no normal employee page directly calls Twenty vendor endpoints;
6. global platform shell and CRM-local IA are separated;
7. other business bricks remain separately replaceable;
8. UI is built from a mature reusable design system rather than ad-hoc handwritten CSS;
9. Twenty-inspired interaction patterns are visually reviewed before implementation is merged;
10. Phase 2 is used only as an invariant/truth guard, not as the UI feature inventory.

---

## 10. Next action inside this descriptive Stage 3.4 continuation

Next implementation work:

> **Twenty UI Reuse Spike + Full CRM Surface Prototype**

Scope:

- convert `apps/web` from minimum static substrate UI toward a React/Vite product shell;
- install/pin `twenty-ui` under an explicit MIT dependency record;
- preserve the old substrate diagnostic functionality in an admin/engineering route;
- build a visually faithful CRM shell using Twenty UI primitives;
- expose the broad CRM navigation/surface above with provider capability-aware placeholders/data adapters;
- do not yet claim every capability has production API wiring merely because its visual surface exists;
- separately prove each provider-backed interaction before production go-live.

No new numeric Stage is created by this record.
