# GBAP Stage 3.5｜CRM Full Capability Recovery

Status: **PASS / ACCEPTED / MERGED / GITHUB CLOSURE COMPLETE**

Authorized: 2026-09-04

Accepted: 2026-09-06

Original base main: `e9ce016bcd7a0e8cb6e99f3ae7dd996205e2a9d9`

Accepted branch: `feat/stage3-5-crm-capability-recovery`

Accepted final head: `17f61c39950451551cc9b8addf442ef55358d7ee`

Merged main: `3ff57cd3b1c44251043f0fc1b1201920f8531c96`

Closure evidence: `docs/evidence/GBAP_Stage3_5_CRM_Full_Capability_Recovery_Closure_v1.0.md`

> This document records the accepted Stage 3.5 capability-recovery implementation. It does not authorize Production Go-Live, does not authorize direct Twenty exposure, and does not mean formal company Windows UAT has been updated. Current GitHub/runtime evidence must still be re-read before any later deployment or CI-infrastructure change.

## 1. Purpose

Stage 3.5 converts the accepted Stage 3.4 minimum CRM slice into a substantially complete, production-usable CRM product surface by recovering business capabilities already available in the selected Twenty CRM provider instead of continuing to hand-code a reduced subset.

Permanent boundary:

```text
GBAP Browser
-> GBAP Keycloak
-> GBAP CRM Runtime API
-> provider-neutral CRM runtime contract
-> Provider Resolver
-> Twenty Adapter
-> Twenty
```

Frozen invariants remain:

- GBAP Keycloak is the human identity authority.
- GBAP owns the public product UI/UX and business semantics.
- Browser code never receives Twenty credentials or calls Twenty directly.
- Twenty `:3000` remains internal/admin only.
- GBAP durable `businessId` remains the public record identity.
- Provider object, field, record, View, Layout and Timeline IDs are translated or redacted at the server boundary.
- Twenty remains replaceable; browser/business code must not depend on Twenty-specific IDs.
- One governed Twenty workspace remains the current integration architecture.
- `IS_MULTIWORKSPACE_ENABLED=false` remains the accepted Twenty topology.

## 2. Root problem corrected

Stage 3.4 correctly proved a provider-neutral minimum CRM contract, but the public product surface still hand-coded small subsets of the selected provider:

```text
CompaniesSurface
PeopleSurface
OpportunitiesSurface
TasksSurface
NotesSurface
...
```

That pattern loses capability whenever Twenty supports a field, relation, View, object, layout, lifecycle action or record-page capability that GBAP has not explicitly reimplemented.

Stage 3.5 establishes a metadata-driven runtime so GBAP can expose provider capability without exposing provider identity or provider credentials.

## 3. Accepted runtime model

```text
Twenty
  Object metadata
  Field metadata
  Relation metadata
  View metadata
  Record-page layout metadata
  Record data
  Timeline / email / calendar context
       |
       v
GBAP CRM Runtime Boundary
  objectKey / fieldKey
  GBAP businessId
  permission intersection
  provider identity translation/redaction
       |
       v
GBAP Generic CRM Renderer
  Object navigation
  Table / List / Kanban / Calendar
  Deep View editor
  Generic forms + relation picker
  Record Page tabs/widgets
  Timeline / tasks / notes / files
  Current-user email / calendar
  CSV Upsert / bulk operations / Merge preview
  Recycle / restore / governed destroy
```

## 4. Capability recovery accepted

### 4.1 Objects, fields and relations

The public runtime consumes live Twenty object/field metadata for active non-system objects. It supports representative business field classes including:

- text / long text / rich text;
- number / rating / boolean;
- date / date-time;
- currency;
- select / multi-select;
- address;
- emails / phones;
- links / domain;
- relations;
- JSON/raw structures where policy permits.

Relations are resolved through GBAP `businessId`; the user does not manually enter Twenty IDs.

System-only objects are removed from the public metadata navigation and are additionally denied at the provider permission boundary if a direct URL is attempted.

### 4.2 Twenty-native Views

Stage 3.5 restores provider-backed View semantics rather than reducing a View to a local saved-search string.

Accepted:

- TABLE / LIST / KANBAN / CALENDAR;
- visible fields;
- field order and width;
- View-level search;
- filters;
- nested AND/OR filter groups;
- sorting;
- Kanban main group field;
- Kanban group visibility and persisted group order;
- Kanban COUNT/SUM/AVG/MIN/MAX aggregation with required aggregate-field validation;
- Calendar start/end field;
- Calendar DAY/WEEK/MONTH layout, with MONTH provider default;
- PERSONAL and WORKSPACE exposure scope;
- owner/manager edit/delete rules.

Provider-boundary validation rejects invalid Calendar/Kanban specifications, missing filter-group parents, duplicate group keys and parent cycles before the View mutation begins.

The accepted adapter reconciles provider-native Kanban groups and ViewFields rather than duplicating/deleting provider-native metadata that Twenty manages through its own lifecycle.

### 4.3 Record Page and business context

Provider page-layout/tabs/widgets are represented through the GBAP renderer. Accepted recovery includes:

- fields;
- related records / record-table-style relation recovery;
- Timeline;
- tasks;
- notes;
- files;
- email;
- calendar;
- charts;
- rich text;
- governed external-content handoff where allowed.

Timeline is backed by Twenty `timelineActivity`, not a synthetic Tasks+Notes approximation. Timeline properties are sanitized before browser delivery so provider UUID identity does not cross the GBAP public boundary while the legitimate GBAP `businessId` remains the public record identity.

Email and calendar context remain current-GBAP-user isolated through the persisted GBAP-principal -> Twenty-member mapping. Shared-service-account visibility is not accepted as the user-facing isolation model.

### 4.4 Lifecycle

Normal delete remains soft delete:

```text
active -> soft deleted -> restored
                      -> permanently destroyed
```

Permanent destroy remains high-privilege and fail-closed while governed GBAP attachments remain.

### 4.5 Merge

The public merge workflow is:

```text
select duplicate records
-> Twenty native merge dry-run
-> show survivor + field conflicts
-> no mapping/file mutation during preview
-> explicit user confirmation
-> Twenty native merge commit
-> preserve survivor GBAP businessId
-> remove duplicate mappings only after upstream success
-> migrate governed attachments to survivor
```

The preview is therefore a real provider dry-run, not a GBAP-only guessed preview.

### 4.6 Import / export and bulk operations

CSV import/export is metadata-driven. Import supports bounded Upsert using:

1. explicit GBAP `businessId`; or
2. provider metadata field marked unique.

Bulk update/delete operate through the same governed runtime boundary. Relation values remain business-ID based.

## 5. Authorization intersection

GBAP remains the public authorization authority. Twenty can only further restrict access; it can never widen it.

Effective rule:

```text
GBAP allow AND provider allow -> continue to the normal GBAP business handler
GBAP deny                      -> deny
provider deny                     -> deny
provider permission unavailable   -> fail closed
```

The Stage 3.5 permission preflight consumes Twenty's real role model:

```text
principal_provider_mapping
-> userWorkspaceId
-> roleTarget
-> role
-> objectPermission
-> fieldPermission / row-level permission presence
```

Object permission calculation follows the provider's all-object defaults plus object-specific override semantics.

Because the current headless record path uses a governed adapter credential rather than the user's native Twenty browser session, Stage 3.5 does **not** pretend that unsupported provider field/RLS enforcement is equivalent. If a role contains field-level restrictions or row-level predicates that this path cannot prove equivalent, the operation is rejected fail-closed.

First-use principal bootstrapping is governed: when the permission preflight finds no persisted principal mapping, it invokes the existing per-user bridge-session establishment once, persists the mapping through the frozen Twenty invitation/provisioning path, then retries permission checking. Missing mapping does not silently bypass permission checking.

## 6. Durable identity adoption

Provider records that pre-date GBAP mapping are adopted into durable GBAP mappings when legitimately discovered through the governed runtime.

Standard namespaces:

- `company -> Account`
- `person -> Contact`
- `opportunity -> Opportunity`
- `task -> CrmTask`
- `note -> CrmNote`

Custom business objects receive a stable GBAP dynamic-object namespace. Provider record IDs remain internal translation values.

Provider removal remains protected by durable mappings. The accepted Stage 3.5 PoU enumerates all mappings owned by the tested provider, releases them through the governed mapping API, verifies zero remaining provider mappings, and only then permits provider unregister.

## 7. Compatibility

Existing Stage 3.4 focused surfaces remain compatibility/domain-specific product surfaces. Stage 3.5 generic runtime is the expandable base.

A specialized GBAP surface may remain when it adds real domain value, but it must not create a permanent capability ceiling that prevents access to supported provider fields/relations/lifecycle operations.

## 8. Governed proof accepted

The exact accepted Stage 3.5 head passed real Twenty proof covering, among other Stage 3.4 guarantees:

1. real schema and provider-neutral metadata;
2. Personal View create/owner persistence/delete;
3. employee/user cannot publish Workspace View;
4. manager Workspace View publishing;
5. nested AND/OR filter groups and column width persistence;
6. native Kanban grouping/aggregate/group visibility metadata;
7. invalid Calendar View rejected without partial provider View creation;
8. native Merge dry-run does not mutate GBAP mapping or attachment ownership;
9. committed native Merge preserves survivor identity and moves governed attachments;
10. permanent destroy remains blocked by governed attachments;
11. GBAP + Twenty permission intersection permits normal business records and denies system-object direct URLs;
12. real Twenty Timeline materializes after a real record create/update;
13. Timeline browser payload contains public runtime identity and does not expose provider UUIDs;
14. current-user email/calendar governed endpoints remain live and business-safe;
15. provider uninstall remains blocked while durable mappings exist and succeeds only after all provider mappings are governed-released and verified absent.

## 9. Acceptance gates — CLOSED

Required closure proof is complete:

```text
[PASS] real Twenty metadata/schema runtime
[PASS] standard + custom business object recovery
[PASS] dynamic field render/edit
[PASS] business-ID relation translation
[PASS] durable provider-record adoption
[PASS] Table/List/Kanban/Calendar View recovery
[PASS] deep View metadata write/read
[PASS] Record Page layout/widget recovery
[PASS] real Twenty Timeline
[PASS] current-user mail/calendar context
[PASS] create/update/soft-delete/restore/destroy lifecycle
[PASS] native Merge dry-run + commit
[PASS] metadata-driven CSV Upsert/bulk operations
[PASS] GBAP AND provider permission intersection
[PASS] exact final-head Fast CI #123 / run 33984451220
[PASS] one exact-head governed /gbap-final all dispatch
[PASS] Command Bridge #62 / run 33984577718
[PASS] Final Gate #60 / run 33984595229
[PASS] isolated UAT boot + identity lifecycle + restart persistence
[PASS] governed backup/restore rollback
[PASS] final control-plane handoff and inline result reporting
[PASS] PR #73 merged
[PASS] main = 3ff57cd3b1c44251043f0fc1b1201920f8531c96 at closure snapshot
```

Accepted final head:

`17f61c39950451551cc9b8addf442ef55358d7ee`

Inline Final result comment:

`5554089841` — PASS.

## 10. Explicit non-goals / non-claims retained

- No public Twenty login.
- No direct Twenty browser API access.
- No Twenty billing/workspace-creation UX in GBAP.
- No duplication of Twenty workflow engine.
- No claim that Twenty-specific AI is the GBAP AI authority.
- No Production Go-Live authorization.
- No claim that external Google/Microsoft OAuth User-A/User-B isolation has been proven solely by synthetic CI.
- No claim that formal company Windows UAT was updated by this GitHub merge.
- No company Windows UAT deployment until the project owner explicitly authorizes the later single governed deployment.
- No claim that the whole GBAP program is complete.

## 11. Closure decision / next authority

Stage 3.5 is **PASS / ACCEPTED / MERGED / CLOSED on GitHub main**.

Closure evidence:

`docs/evidence/GBAP_Stage3_5_CRM_Full_Capability_Recovery_Closure_v1.0.md`

The repository does not define a Stage 3.6 at this closure snapshot. Future work must be selected from current repository truth rather than inventing a new Stage label.

At closure, the only existing open engineering PR is PR #77 (`infra/ci-dedicated-vm-runner`). It is a separate CI-infrastructure candidate, was created before the Stage 3.5 merge, and must be reconciled/re-audited against current main before any acceptance. Its existence does not authorize VM cutover, formal UAT deployment or Production Go-Live.
