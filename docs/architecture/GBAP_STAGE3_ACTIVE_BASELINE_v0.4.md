# Global Business AI Platform｜Stage 3 Active Baseline v0.4

Status: `ACTIVE / TWO REAL-BRICK MODES VERIFIED / PRODUCTION CRM+UI SELECTION NOT AUTHORIZED`

Supersedes: `GBAP_STAGE3_ACTIVE_BASELINE_v0.3.md`

Project: **全球业务智能平台｜Global Business AI Platform**

Brand: **GBAP**

Current repository: `hhhh666-888/global-business-ai-platform`

This baseline synchronizes Stage 3 governance after completion of CRM PoU-B. It does not rewrite or invalidate historical Stage 3.1–3.4.1 records, earlier active baselines, or permanent evidence.

---

## 1. Current Stage 3 state

- Stage 3.1 — COMPLETE
- Stage 3.2 — COMPLETE
- Stage 3.3 — PASS
- Stage 3.3.1 — PASS / COMPLETE / CLOSED
- Stage 3.4 CRM Source/Document Audit — PASS
- Stage 3.4.1 CRM PoU-A｜Twenty Real-Engine Integration Test — PASS / REAL RUNTIME VERIFIED
- Stage 3.4 hands-on continuation｜PoU-B Atomic CRM Native Source/UI Reuse Test — PASS / REAL BROWSER VERIFIED

No repository Authority currently assigns a formal numeric identifier after `Stage 3.4.1`. This baseline therefore preserves the audit's PoU-B / PoU-C naming and does not invent `Stage 3.4.2` or another number.

---

## 2. Product / sourcing rule remains unchanged

> **ASSEMBLY FIRST / REUSE FIRST / INTEGRATE FIRST / BUILD LAST.**

GBAP / GBAP remains the product subject. Mature OSS, SaaS, standards, models, tools and Agents may provide capabilities, but GBAP retains ownership of:

- employee-facing product experience;
- business semantics;
- durable identity and continuity;
- authorization boundaries;
- required data continuity;
- provider/source provenance;
- mapping and replacement rights.

Stage 3 is not building a universal plugin operating system and is not turning third-party dashboards into the employee product.

---

## 3. Twenty PoU-A state retained

Authoritative evidence:

`docs/evidence/GBAP_Stage3_4_1_Twenty_Real_Engine_PoU_Record_v0.1.md`

Validated state:

- mode: `HEADLESS_PROVIDER / MANAGED SERVICE`;
- Twenty: **v2.37.0** pinned;
- tested commit: `b955249d06e72e8b388dfc4e26b3171b31e441a4`;
- workflow run: `33388996026`;
- result: **34 / 34 PASS**;
- open failure: **0**;
- real CRUD + custom object: PASS;
- GBAP mappings: PASS;
- outage isolation / recovery: PASS;
- export: PASS;
- uninstall guard / governed release: PASS;
- complete provider removal and GBAP survival: PASS.

Replacement evidence remains:

`E1_EXPORT_PROVEN`

Twenty remains a strong CRM Provider candidate, but:

`PRODUCTION CRM SELECTION = NOT AUTHORIZED`

---

## 4. Atomic CRM PoU-B state

Authoritative specification:

`docs/architecture/GBAP_Stage3_4_Atomic_Native_Source_UI_PoU_Spec_v0.1.md`

Permanent evidence:

`docs/evidence/GBAP_Stage3_4_Atomic_Native_Source_UI_PoU_Record_v0.1.md`

Promotion PR:

`PR #6 — test(pou): validate Atomic CRM native source/UI reuse`

Merged to main as:

`d1808e95c44fe531c8ec3e0c6a713711cb531b85`

Validated source baseline:

- upstream: `marmelab/atomic-crm`;
- pinned upstream commit: `167a4cdb652b1ab2b4b030831cfa7adcf2099321`;
- upstream license for reused slices: MIT;
- mode: `NATIVE_LIBRARY_REUSE / SOURCE REUSE`.

Representative source slices tested:

1. Atomic/shadcn `Card` primitive;
2. Atomic `CompanyList`-derived account layout;
3. Atomic `DealCard`-derived opportunity card.

Validated GBAP boundary:

```text
GBAP Native CRM PoU UI
→ GBAP-owned CrmReadPort
→ PoU fixture adapter
```

The PoU deliberately did **not** adopt Atomic/Supabase as the GBAP business contract.

---

## 5. Atomic PoU-B runtime / source evidence

Final locked-dependency proof:

- tested governance commit: `3a1dd0dd37e72412679fbde7038c2eb90fc857ba`;
- push evidence run: `33399446458`;
- PR merge-head validation run: `33399451800`;
- PR validation job: `99511882738`;
- result: **15 / 15 assertions PASS**;
- open failure: **0**;
- production Vite build: PASS;
- real Chromium E2E: PASS;
- browser test: `1 passed`.

Verified assertions include:

- Atomic upstream commit pinned;
- Atomic MIT notice retained;
- Atomic-derived Card source compiled/rendered;
- CompanyList-derived account surface compiled/rendered;
- DealCard-derived opportunity surface compiled/rendered;
- no Supabase package dependency;
- no Supabase source import;
- GBAP owns `CrmReadPort`;
- production build succeeds;
- native GBAP CRM shell renders in a real browser;
- accounts render through the GBAP port;
- opportunity pipeline renders through the GBAP port;
- native opportunity-card → detail interaction works;
- no iframe;
- no external runtime network request.

Reproducibility controls:

- pinned Atomic upstream commit;
- exact direct npm dependency versions;
- committed `package-lock.json`;
- Node 24 CI runtime;
- SHA-pinned `actions/checkout` v7.0.1;
- SHA-pinned `actions/setup-node` v7.0.0.

---

## 6. What PoU-B actually proves

PoU-B proves that selected Atomic CRM MIT UI/source can be **selectively detached from Atomic/Supabase persistence assumptions** and adapted into a native GBAP surface behind a GBAP-owned business-semantic port.

This is materially different from PoU-A:

```text
PoU-A Twenty
= real external CRM engine can live behind the provider boundary

PoU-B Atomic CRM
= selected third-party UI/source can be absorbed as native GBAP source without inheriting its stock business backend contract
```

Together these prove two distinct sourcing modes are viable in the minimum substrate strategy:

- `HEADLESS_PROVIDER / MANAGED SERVICE`;
- `NATIVE_LIBRARY_REUSE / SOURCE REUSE`.

---

## 7. Explicit PoU-B nonclaims

PoU-B does **not** authorize:

- Atomic CRM as the production CRM engine;
- Supabase as GBAP persistence;
- React as the final GBAP frontend architecture;
- automatic promotion of the PoU into `apps/web`;
- Atomic's complete application shell as the GBAP employee UI;
- production UI selection;
- production CRM selection;
- `E2_REIMPORT_PROVEN`;
- `E3_CUTOVER_PROVEN`.

The current `apps/web` substrate verification shell was not rewritten by PoU-B.

---

## 8. Replacement evidence remains bounded

Current CRM replacement evidence:

- `E1_EXPORT_PROVEN` — PASS through the Twenty tested data slice;
- `E2_REIMPORT_PROVEN` — NOT YET PROVEN;
- `E3_CUTOVER_PROVEN` — NOT YET PROVEN.

Atomic PoU-B is a native source/UI reuse test, not a second CRM import target. Therefore it does **not** advance E1 to E2.

E2 requires a real second CRM Provider or neutral re-import target that accepts the governed neutral snapshot while preserving required durable business identity/continuity.

E3 requires a governed operational cutover proof.

---

## 9. Current production-selection state

```text
Twenty as production CRM
= NOT AUTHORIZED

Atomic as production CRM
= NOT AUTHORIZED

Atomic source/UI primitives
= SOURCE-REUSE FEASIBILITY PROVEN

Final GBAP frontend architecture
= NOT AUTHORIZED

Production CRM Selection
= NOT AUTHORIZED

Production UI Selection
= NOT AUTHORIZED
```

Source-reuse feasibility is not the same as production promotion. Any later promotion of Atomic-derived source into a permanent employee-facing GBAP UI must be an explicit architecture/product decision with its own acceptance and provenance controls.

---

## 10. Current Gate

```text
Stage 3.4 CRM Source/Document Audit
= PASS

PoU-A Twenty Real-Engine Integration
= PASS / REAL RUNTIME VERIFIED

Twenty Runtime
= v2.37.0 PINNED

Twenty Assertions
= 34 / 34 PASS

PoU-B Atomic Native Source/UI Reuse
= PASS / REAL BROWSER VERIFIED

Atomic Assertions
= 15 / 15 PASS

Atomic → Supabase business dependency
= NOT INHERITED

Atomic iframe / sidecar employee UI
= NOT USED

GBAP-owned CRM UI boundary
= PROVEN THROUGH CrmReadPort

Replacement Evidence
= E1_EXPORT_PROVEN

E2_REIMPORT_PROVEN
= NOT YET PROVEN

E3_CUTOVER_PROVEN
= NOT YET PROVEN

Production CRM Selection
= NOT AUTHORIZED

Production UI Selection
= NOT AUTHORIZED
```

---

## 11. Next legal Stage 3 work item

The authoritative Stage 3.4 CRM Audit Decision Record defines the remaining hands-on shortlist after PoU-A and PoU-B as:

> **PoU-C — Frappe CRM**

Mode:

`HEADLESS_PROVIDER / MANAGED SERVICE`

Purpose already defined by the audit:

- compare practical daily sales usability against Twenty;
- validate Lead / Deal workflow;
- validate communication-oriented CRM behavior;
- test Frappe's API / DocType boundary as a real independent CRM engine;
- preserve GBAP ownership and avoid scope expansion into an ERP/platform replacement.

EspoCRM remains the mature CRM depth / API / data-exit control benchmark and fallback if Twenty or Frappe exposes a material blocker.

The current repository Authority still does not assign a formal numeric identifier to PoU-C. Therefore the next legal item is recorded as:

> **Stage 3.4 hands-on continuation — PoU-C｜Frappe CRM Real-Engine Comparator**

A numeric stage identifier must be created only by an explicit later Authority/Gate record, not inferred from sequence.
