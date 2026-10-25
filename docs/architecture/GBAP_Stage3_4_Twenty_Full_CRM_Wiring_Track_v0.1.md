# GBAP Stage 3.4 continuation｜Twenty Full CRM Wiring Track v0.1

Status: **ACTIVE / IMPLEMENTATION TRACK OPEN / CLOSURE BLOCKED UNTIL ALL CRM SURFACES ARE REAL**

Base at track opening: `main@eaaf78152d0f63a4724790d0c7e476ed6a095f1f`

Predecessor: `Twenty Real Account Wiring Slice = PASS / IMPLEMENTED / VALIDATED / REVERSE AUDIT COMPLETE`

## 1. Product-owner direction

The formal target is:

> **把当前 CRM 菜单中所有功能全部从 Prototype / Seed / Placeholder 变成真实可用功能，最后再做一次全 CRM 的 REVERSE AUDIT + UI/权限/可用性总验收。**

This is the governing completion target for this continuation track.

The work is not a single People/Contact slice. The target is to make the **entire current CRM product surface real and usable**, while preserving the GBAP-owned API/capability boundary and provider replaceability.

Current implementation scope remains **CRM-only**. Future bricks such as platform AI, customer acquisition, analytics outside CRM, knowledge, quotation/solution and project execution are not pre-reserved in this track.

## 2. Completion target

At completion, no current CRM navigation entry may exist merely as fake seed data, a decorative placeholder, a prototype alert, or a non-functional imitation of a mature CRM feature.

Ordinary employee scope:

- Workbench
- Companies
- People
- Opportunities
- Tasks
- Notes / Timeline
- Email
- Calendar
- Files
- Saved Views / Favorites
- Search / command navigation
- useful record detail/context flows

Manager / power-user scope, permission-gated:

- Dashboards
- Import / Export
- governed bulk operations
- saved/custom views and workload-oriented views where supported

CRM administrator scope, permission-gated:

- Workflows
- CRM Settings / Builder
- custom objects / fields / relations
- layout configuration
- integration/application configuration

Provider-native optional CRM AI/apps may exist only inside governed CRM administration/configuration when deliberately enabled. They must not become ordinary employee primary navigation and must not be confused with future GBAP platform AI authority.

## 3. Integration rule

Normal employee UI must use:

```text
GBAP CRM UI
  -> GBAP authenticated API
  -> GBAP capability/business boundary
  -> capability binding/provider resolution
  -> selected CRM adapter/provider integration
  -> selected CRM engine
```

Normal employee React page components must not call provider REST/GraphQL endpoints directly.

GBAP continues to own:

- employee UI/UX
- authentication and permission semantics
- business semantics and durable IDs where the business truth requires them
- provider/source provenance
- mapping and replacement rights
- capability binding and provider selection authority

## 4. Capability classification

Not every useful selected-engine feature needs to become a new frozen Phase 2 canonical business entity.

### 4.1 Canonical durable business entities

These keep the already accepted canonical CRM v1 semantics:

- Account / Company
- Contact / Person
- Opportunity

### 4.2 CRM operational capabilities

Tasks, notes, activity/timeline, files, saved views/favorites, search/navigation, dashboard reads and similar operational features may be exposed through GBAP-owned capability interfaces without falsely promoting every provider-native object into a new frozen canonical domain entity.

The boundary must still be explicit, authenticated, permission-aware and replaceable.

### 4.3 Connected-service capabilities

Email and Calendar depend on external mailbox/calendar configuration.

The product must implement both states correctly:

- configured: real connected data/actions;
- not configured: a useful setup state explaining what the user/admin needs to do next.

Fake mailbox/calendar data must not be shown as if connected.

### 4.4 Administration/configuration capabilities

Dashboards, import/export, workflows, builder, layouts, custom objects/fields and integration configuration are real CRM capabilities but are permission-gated. Their implementation may use provider capabilities behind GBAP governance without exposing provider internals to ordinary employees.

## 5. Employee-facing messaging policy

This policy applies to every CRM page and is part of acceptance, not cosmetic cleanup.

### 5.1 Show information that helps the user act

Examples:

- what this page is for;
- what information is required to create a record;
- validation problems in business language;
- whether an operation succeeded or failed;
- what the user can do next;
- empty-state guidance;
- connection/setup guidance for Email/Calendar when configuration is missing;
- permission-denied guidance when the user lacks access;
- clear loading/retry states.

### 5.2 Do not show internal architecture facts to ordinary employees

The following must not appear as ordinary employee-facing explanatory text merely to prove architecture:

- `浏览器未直连 Twenty` or equivalent;
- provider names as implementation explanations;
- adapter names;
- internal ports/hosts/endpoints;
- canonical capability IDs such as `crm.v1.*`;
- raw provider IDs;
- GBAP durable IDs unless a real business workflow explicitly needs an identifier;
- mapping-table terminology;
- `Provider` / `canonical` / `adapter` / API-chain debugging language;
- test/evidence terminology.

These facts belong in engineering evidence, logs, admin diagnostics or governance documents.

### 5.3 Error policy

Do not surface raw internal error codes to ordinary employees when a useful business message can be provided.

Examples:

- good: `客户公司加载失败，请刷新后重试。`
- bad: `account_list_failed`
- good: `邮箱尚未连接，请联系管理员完成邮箱配置。`
- bad: `provider capability unavailable`

Engineering detail may remain available in structured logs/evidence for diagnosis.

### 5.4 Success/empty-state policy

Success messages should confirm the user action in plain language.

Empty states should explain the next useful action rather than exposing backend state.

## 6. Current implementation progress

### 6.1 Companies / Account

State: **REAL / PREVIOUSLY ACCEPTED; EMPLOYEE MESSAGING CLEANUP APPLIED IN THIS TRACK**

- real Account list/create remains through the GBAP boundary;
- durable mapping remains intact;
- engineering-only UI text has been removed;
- raw internal IDs are no longer shown to ordinary employees;
- business-language success/error/empty states are used.

### 6.2 People / Contact

State: **REAL LIST/CREATE IMPLEMENTED IN CURRENT BRANCH / CI VALIDATION PENDING**

- seed People rows removed from the product surface;
- real Contact list/create added through `crm.v1.contact.list/create`;
- employee UI shows business fields only;
- creation success/error/empty states are actionable.

Still closure-blocking:

- Contact -> Company relation is not yet exposed by the current canonical Contact v1 result/create shape and must be implemented through a governed GBAP boundary before People is considered fully complete;
- record-detail/edit flows remain to be wired.

### 6.3 Opportunities

State: **REAL LIST/CREATE IMPLEMENTED IN CURRENT BRANCH / CI VALIDATION PENDING**

- seed Opportunity rows removed;
- real list/create added through `crm.v1.opportunity.list/create`;
- create requires a mapped GBAP Account business ID as already required by the canonical contract;
- UI joins returned Account context to display company names instead of internal IDs;
- table and lifecycle-oriented Kanban read views use real records;
- global `新建商机` action opens the real creation form.

Still closure-blocking:

- stage transition / drag-and-drop mutation is not yet wired;
- edit/detail flows are not yet wired;
- lifecycle transitions beyond the accepted bounded OPEN create contract remain unresolved and may require an operational extension rather than silently changing frozen canonical semantics.

### 6.4 Workbench

State: **FAKE METRICS/SEED ACTIVITY REMOVED; REAL AGGREGATE WORKBENCH STILL BLOCKED**

- fake pipeline totals, fake tasks and fake activity feed were removed from the main workbench;
- the workbench currently exposes only useful navigation into already-real CRM surfaces.

It is not complete until real current-user work, aggregates and activity are connected.

### 6.5 Remaining CRM menu surfaces

State: **NOT COMPLETE / EXPLICIT CLOSURE BLOCKERS**

- Tasks
- Notes / Timeline
- Email
- Calendar
- Files
- Saved Views / Favorites
- Search / command navigation beyond current local filtering
- Dashboards
- Import / Export and bulk operations
- Workflows
- CRM Settings / Builder / custom schema/layout/integration configuration

Temporary pages may explain the current business limitation, but these states are not accepted as completion and must disappear or become real governed setup states before closure.

## 7. Execution order

This is one **Full CRM Wiring Track**, executed in dependency-safe batches rather than one unsafe monolithic change.

1. UI messaging policy + existing Companies cleanup. **IMPLEMENTED; validation in progress**
2. People / Contact real list/create + company relation + detail. **LIST/CREATE IMPLEMENTED; relation/detail remain**
3. Opportunities real list/create/detail + table/Kanban + Account gate + lifecycle semantics. **LIST/CREATE + real read views implemented; mutations/detail remain**
4. Workbench conversion to real CRM aggregates and current-user work.
5. Tasks + Notes + Timeline/activity context.
6. Files / attachments.
7. Search / command navigation + saved views/favorites + multiple data views.
8. Email connected/unconfigured flows.
9. Calendar connected/unconfigured flows.
10. Manager dashboards + bulk operations + import/export.
11. Admin workflows + CRM Settings/Builder + custom schema/layout/integration configuration.
12. Cross-surface reverse audit, usability audit and final CRM completion closure.

The sequence may combine adjacent items when the same provider/API foundation makes a combined slice safer, but completion requires the full scope above.

## 8. Per-batch acceptance gate

Every batch must prove as applicable:

1. real data/action path, not seed data;
2. authenticated GBAP API/capability boundary;
3. no direct browser-to-provider coupling;
4. correct durable-ID/mapping behavior where relevant;
5. correct employee vs manager/admin permission semantics;
6. actionable employee-facing messages only;
7. raw architecture/debug jargon absent from ordinary employee UI;
8. loading, empty, error and success states are usable;
9. React/TypeScript production build PASS;
10. browser acceptance PASS;
11. real selected-engine evidence PASS for provider-backed behavior;
12. production web container build PASS where applicable;
13. regression of previously accepted real CRM slices remains PASS.

## 9. Full-track closure gate

This track cannot be declared complete until:

- every current CRM navigation surface is real and usable or, for externally configured capabilities, has a real governed setup/connection flow;
- every visible control that implies a business action actually performs that governed action or is intentionally unavailable with useful user guidance;
- fake seed data is not presented as live business truth;
- no placeholder/prototype copy or prototype alert remains in the employee product;
- record relationships required for normal CRM work are functional;
- table/Kanban/calendar/saved-view interactions advertised by the product are real, not decorative;
- all permission-gated features are correctly hidden/denied for ordinary employees;
- ordinary employees do not see internal integration/protocol/debug explanations;
- cross-surface browser evidence is visually reviewed;
- full real-engine evidence is reviewed;
- reverse audit attacks vendor coupling, fake data, permission leakage, misleading UI hints, dead controls, error leakage and overclaiming;
- UI review checks clarity, density, responsive behavior, empty/loading/error/setup states and consistent component usage;
- usability review verifies common employee workflows end-to-end;
- governance status is written back before final merge/closure.

Only after all of the above may the track be marked:

`PASS / FULL CRM REAL WIRING COMPLETE / REVERSE AUDIT COMPLETE / UI + PERMISSION + USABILITY ACCEPTED`

No new numeric Stage is created by this track.
