# GBAP Stage 3.4｜Twenty UI Reuse Spike + Full CRM Surface Prototype｜Implementation v0.1

Status: **PASS / IMPLEMENTED / VALIDATED / REVERSE AUDIT COMPLETE**

Base Authority: `GBAP_STAGE3_ACTIVE_BASELINE_v0.9` + `GBAP_Stage3_4_Native_CRM_Employee_Workbench_Capability_UI_Reuse_Matrix_v0.1.md`

Current scope correction: `GBAP_Stage3_4_CRM_Only_UI_Scope_Correction_v0.1.md`

Reverse audit: `GBAP_Stage3_4_Twenty_UI_Reuse_Spike_REVERSE_AUDIT_v0.1.md`

## Goal

Upgrade `apps/web` from the Stage 3 substrate administration test page into a GBAP-owned React CRM product shell that visibly exposes the selected Twenty CRM brick's mature capability surface without coupling employee UI directly to Twenty APIs.

## Accepted implementation

- React + Vite frontend scaffold under `apps/web`.
- Twenty design-system reuse through `twenty-ui` ThemeProvider, Button and icon exports.
- Current shell is CRM-only; future GBAP bricks are deliberately not pre-reserved in navigation.
- Ordinary employee CRM surface:
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
- Permission-gated manager/admin CRM surface:
  - Dashboards
  - Import / Export
  - Workflows
  - CRM Settings / Builder
- Provider-native CRM AI / Apps remains optional inside CRM settings and is not ordinary employee primary navigation.
- Opportunity Table + Kanban prototype.
- Local interactive search, navigation, quick-create and task completion state.
- Prototype role simulation supports `?role=employee`, `?role=manager`, and `?role=super-admin` for browser acceptance only; this is not a production-auth claim.
- Existing substrate administration surface preserved at `/substrate.html`.
- Multi-stage Docker build compiles the Vite app and serves `dist`.

## Final acceptance evidence

Accepted implementation HEAD: `45992294665d508629addab97000244c2fbb9169`

GitHub Actions workflow: `Stage 3.4 Twenty UI Reuse Spike`

Accepted workflow run: `33445926544` — **SUCCESS**

Browser evidence artifact: `twenty-ui-reuse-browser-evidence` / artifact ID `9778064175`

Validated:

1. TypeScript + Vite production build — PASS.
2. Current sidebar is CRM-only; future GBAP brick placeholders are absent — PASS.
3. Broad ordinary employee CRM surface remains exposed — PASS.
4. Manager/admin CRM features are explicitly role-gated — PASS.
5. Saved Views / Favorites remains first-class — PASS.
6. CRM AI / Apps is not ordinary employee primary navigation — PASS.
7. Opportunity Table → Kanban and quick-create interaction — PASS.
8. Mobile employee surface has no page-level horizontal overflow — PASS.
9. Legacy `/substrate.html` remains reachable — PASS.
10. Production web Docker image build — PASS.
11. Desktop + mobile successful screenshots manually read back — PASS.

## Reverse-audit conclusion

The CRM-only correction resolves the earlier overreach where future GBAP bricks were pre-reserved in the current shell. The accepted UI now represents the selected CRM brick only, while retaining the broad Twenty capability surface and separating employee versus manager/admin CRM functions.

# **Twenty UI Reuse Spike + Full CRM Surface Prototype = PASS / REVERSE AUDIT COMPLETE**

## Explicit non-claims / bounded carries

- Seed data is prototype data; production CRM data is not wired yet.
- No ordinary employee page is authorized to call Twenty REST/GraphQL directly.
- `twenty-ui@1.0.0-alpha.0` remains spike-only until production license/provenance alignment is resolved.
- Query-string role simulation is prototype/test scaffolding only; production authz must replace it.
- Future GBAP bricks are outside this UI scope and can be added later when actually selected.
- Inert unreferenced CSS selectors from the rejected future-placeholder experiment may be removed during a later frontend cleanup; they do not render or reserve UI.

## Next legal action

Choose and implement the first real Twenty capability wiring slice through the GBAP-owned API/capability boundary. Do not wire ordinary browser components directly to Twenty vendor endpoints.
