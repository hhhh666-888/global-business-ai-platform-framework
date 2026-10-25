# GBAP Stage 3.4 hands-on continuation｜PoU-B Atomic CRM Native Source/UI Reuse Test v0.1

**Status:** `PASS / REAL BROWSER VERIFIED / PRODUCTION UI SELECTION NOT AUTHORIZED`

**Authority:** `docs/architecture/GBAP_STAGE3_ACTIVE_BASELINE_v0.3.md`

**Mode:** `NATIVE_LIBRARY_REUSE / SOURCE REUSE`

**Upstream:** `marmelab/atomic-crm`

**Pinned upstream commit:** `167a4cdb652b1ab2b4b030831cfa7adcf2099321`

## Purpose

This PoU does not install Atomic CRM as a sidecar business system and does not make Supabase the GBAP business contract. It tests whether selected MIT-licensed Atomic CRM / shadcn UI source can become native GBAP UI while GBAP retains its own identity, business semantics and data boundary.

The current `apps/web` remains the Stage 3 substrate verification shell. This PoU is isolated under `tests/pou/atomic-native-ui/` so that a source-reuse experiment cannot silently freeze the final GBAP UI architecture.

## Reused source slices

Representative source slices are intentionally small and attributable:

1. Atomic `src/components/ui/card.tsx` → adapted `Card` primitive.
2. Atomic `src/components/atomic-crm/companies/CompanyList.tsx` → adapted native account-list layout.
3. Atomic `src/components/atomic-crm/deals/DealCard.tsx` → adapted native opportunity card.

The PoU keeps the Atomic MIT notice and pins the exact upstream commit used for provenance.

## Required boundary

```text
GBAP Native CRM PoU UI
→ GBAP-owned CrmReadPort
→ PoU fixture adapter
```

The following are forbidden in the PoU runtime:

- `@supabase/*` dependency;
- `ra-supabase-*` dependency;
- Supabase imports or API calls;
- Atomic CRM iframe or sidecar dashboard;
- direct dependency on Atomic authentication or business persistence;
- changing the closed Stage 3 substrate merely to make this PoU pass.

## Acceptance assertions

1. Atomic upstream commit is pinned.
2. Atomic MIT notice is retained.
3. Atomic-derived Card source is compiled and rendered.
4. Atomic CompanyList-derived account surface is compiled and rendered.
5. Atomic DealCard-derived opportunity surface is compiled and rendered.
6. No Supabase package dependency exists.
7. No Supabase source import exists.
8. GBAP owns the `CrmReadPort` contract.
9. Production Vite build succeeds.
10. Native GBAP CRM shell renders in a real browser.
11. Account data renders through the GBAP port.
12. Opportunity pipeline renders through the GBAP port.
13. Native interaction from opportunity card to detail works.
14. No iframe is present.
15. No external runtime network request is made by the PoU UI.

A successful build without browser/runtime proof is not a PASS.

## Verified result

`15 / 15 assertions PASS / 0 open failure`

Verified characteristics:

- real Chromium browser rendering and interaction;
- selected Atomic MIT source adapted as native GBAP UI;
- no Supabase package dependency or source import;
- no Atomic iframe / sidecar dashboard;
- GBAP-owned `CrmReadPort` remains the business-semantic dependency;
- no external runtime network request from the PoU UI;
- pinned Atomic upstream commit and retained MIT notice;
- exact direct dependency versions and committed npm lockfile;
- Node 24 CI runtime with SHA-pinned GitHub Actions.

Permanent runtime evidence is maintained at:

`docs/evidence/GBAP_Stage3_4_Atomic_Native_Source_UI_PoU_Record_v0.1.md`

## Nonclaims

This PoU does not authorize:

- final GBAP frontend framework selection;
- replacing `apps/web` with React;
- Atomic CRM as a production CRM engine;
- Supabase as GBAP persistence;
- E2 re-import proof;
- E3 cutover proof;
- production CRM selection.

## Gate

`POU-B ATOMIC NATIVE SOURCE/UI REUSE = PASS`

`PRODUCTION UI SELECTION = NOT AUTHORIZED`

`PRODUCTION CRM SELECTION = NOT AUTHORIZED`

`E2_REIMPORT_PROVEN = NOT YET PROVEN`

`E3_CUTOVER_PROVEN = NOT YET PROVEN`
