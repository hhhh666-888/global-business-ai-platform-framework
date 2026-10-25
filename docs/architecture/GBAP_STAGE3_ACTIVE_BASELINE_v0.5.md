# Global Business AI Platform｜Stage 3 Active Baseline v0.5

Status: `ACTIVE / THREE REAL-BRICK POU CANDIDATES VERIFIED / TWO INTEGRATION MODES PROVEN / PRODUCTION CRM+UI SELECTION NOT AUTHORIZED`

Supersedes prospectively: `GBAP_STAGE3_ACTIVE_BASELINE_v0.4.md`

Project: **全球业务智能平台｜Global Business AI Platform**

Brand: **GBAP**

Current repository: `hhhh666-888/global-business-ai-platform`

Baseline merge point before this governance update: `5bf82468ab2c05477ad998227ea1e1462a32644c`

This baseline synchronizes Stage 3 governance after completion and merge of CRM PoU-C. It does not rewrite, invalidate or silently modify historical Stage 3.1–3.4.1 records, earlier active baselines, the Stage 3.4 CRM Audit Decision Record, or permanent PoU evidence.

---

## 1. Current Stage 3 state

- Stage 3.1 — COMPLETE
- Stage 3.2 — COMPLETE
- Stage 3.3 — PASS
- Stage 3.3.1 — PASS / COMPLETE / CLOSED
- Stage 3.4 CRM Source/Document Audit — PASS
- Stage 3.4.1 CRM PoU-A｜Twenty Real-Engine Integration Test — PASS / REAL RUNTIME VERIFIED
- Stage 3.4 hands-on continuation｜PoU-B Atomic CRM Native Source/UI Reuse Test — PASS / REAL BROWSER VERIFIED
- Stage 3.4 hands-on continuation｜PoU-C Frappe CRM Real-Engine Comparator — PASS / REAL ENGINE + REAL BROWSER VERIFIED

No repository Authority currently assigns a formal numeric identifier after `Stage 3.4.1`. This baseline therefore preserves the descriptive PoU-B / PoU-C naming and does not invent `Stage 3.4.2` or another numeric stage.

---

## 2. Product / sourcing rule remains unchanged

> **ASSEMBLY FIRST / REUSE FIRST / INTEGRATE FIRST / BUILD LAST.**

GBAP / GBAP remains the product subject. Mature OSS, SaaS, standards, models, tools and Agents may provide replaceable capabilities or source material, but GBAP retains ownership of:

- employee-facing product experience;
- business semantics;
- durable identity and continuity;
- authentication and authorization boundaries;
- required data continuity;
- provider/source provenance;
- mapping and replacement rights;
- final production selection authority.

Stage 3 is not building a universal plugin operating system and is not turning third-party dashboards into the normal employee-facing product.

---

## 3. PoU-A｜Twenty state retained

Authoritative evidence:

`docs/evidence/GBAP_Stage3_4_1_Twenty_Real_Engine_PoU_Record_v0.1.md`

Validated state:

- mode: `HEADLESS_PROVIDER / MANAGED SERVICE`;
- Twenty: `v2.37.0` pinned;
- result: **34 / 34 PASS**;
- open failure: **0**;
- real Company / Person / Opportunity CRUD: PASS;
- real custom object `gbapProject`: PASS;
- GBAP canonical mappings: PASS;
- provider-neutral export: PASS;
- outage isolation / recovery continuity: PASS;
- uninstall guard / governed mapping release: PASS;
- provider unregister / complete Twenty removal / GBAP survival: PASS.

Replacement evidence:

- `E1_EXPORT_PROVEN` — YES;
- `E2_REIMPORT_PROVEN` — NO;
- `E3_CUTOVER_PROVEN` — NO.

Twenty remains the strongest technically audited complete CRM/metadata-platform candidate from the Stage 3.4 source/document audit, but:

`PRODUCTION CRM SELECTION = NOT AUTHORIZED`

---

## 4. PoU-B｜Atomic CRM state retained

Authoritative specification:

`docs/architecture/GBAP_Stage3_4_Atomic_Native_Source_UI_PoU_Spec_v0.1.md`

Permanent evidence:

`docs/evidence/GBAP_Stage3_4_Atomic_Native_Source_UI_PoU_Record_v0.1.md`

Promotion PR:

`PR #6 — test(pou): validate Atomic CRM native source/UI reuse`

Merged to main as:

`d1808e95c44fe531c8ec3e0c6a713711cb531b85`

Validated state:

- upstream: `marmelab/atomic-crm`;
- pinned upstream commit: `167a4cdb652b1ab2b4b030831cfa7adcf2099321`;
- reused source license: MIT;
- mode: `NATIVE_LIBRARY_REUSE / SOURCE REUSE`;
- result: **15 / 15 PASS**;
- open failure: **0**;
- production build: PASS;
- real Chromium E2E: PASS;
- no Supabase package/business dependency inherited;
- no iframe / sidecar employee UI;
- GBAP-owned `CrmReadPort`: PASS;
- selected Atomic-derived account/opportunity UI source can render behind the GBAP-owned semantic port.

PoU-B proves selective native source reuse feasibility. It does not select Atomic CRM as a production engine, Supabase as persistence, React as final frontend architecture, or Atomic's full application shell as the final GBAP employee UI.

---

## 5. PoU-C｜Frappe CRM state

Authoritative specification:

`docs/architecture/GBAP_Stage3_4_Frappe_Real_Engine_Comparator_PoU_Spec_v0.1.md`

Permanent evidence:

`docs/evidence/GBAP_Stage3_4_Frappe_Real_Engine_Comparator_PoU_Record_v0.1.md`

Machine evidence:

`docs/evidence/stage3-4-frappe/runtime-summary.json`

Promotion PR:

`PR #8 — test(pou): compare Frappe CRM as real GBAP provider`

Squash merged to main as:

`5bf82468ab2c05477ad998227ea1e1462a32644c`

Validated upstream:

- repository: `frappe/crm`;
- release: `v1.82.0`;
- pinned upstream commit: `48cb3cccec12ef798f8faacc165fff3dc008a8fa`;
- mode: `HEADLESS_PROVIDER / MANAGED SERVICE`.

Permanent evidence run:

- branch-push evidence run: `33410980484`;
- result: **36 / 36 PASS**;
- open failure: **0**.

Final locked PR-head revalidation:

- PR run: `33410987005`;
- tested governance head: `91286f9c917a8d8e605fbdfb1480e80d14a55f3a` in merge context;
- result: **36 / 36 PASS**;
- real Chromium: PASS;
- browser test: `1 passed`;
- no executable-code delta was introduced by the subsequent evidence-only bot commit before merge.

Validated Frappe capabilities include:

- dedicated service identity + API key/secret;
- `CRM Lead` and `CRM Deal` metadata access;
- real `CRM Deal` custom field + API v2 metadata reflection;
- GBAP provider registration without raw-secret persistence;
- real Organization / Lead / Deal creation and listing through GBAP;
- Deal update through the custom field;
- FCRM Note + manual CRM Call Log;
- five durable GBAP canonical mappings;
- provider-neutral CRM snapshot export;
- real Chromium Leads / Deals / Notes / Call Logs surfaces;
- real upstream outage → provider `UNHEALTHY` while GBAP stays healthy;
- recovery with Lead / Deal continuity;
- mapped-provider uninstall guard;
- governed mapping release + audit evidence;
- provider unregister;
- complete Frappe runtime removal while GBAP survives.

External Twilio, Exotel and WhatsApp integrations were not exercised because this PoU did not provide third-party communication credentials. No operational claim is made for those integrations.

Replacement evidence:

- `E1_EXPORT_PROVEN` — YES;
- `E2_REIMPORT_PROVEN` — NO;
- `E3_CUTOVER_PROVEN` — NO.

---

## 6. What the three PoUs now prove

The real-brick program has now demonstrated three candidate/reuse paths across two integration modes:

```text
PoU-A Twenty
= a rich external CRM/metadata engine can operate behind the GBAP provider boundary

PoU-B Atomic CRM
= selected third-party UI/source can be detached from its stock backend assumptions and reused natively behind a GBAP-owned semantic port

PoU-C Frappe CRM
= a second independent real CRM engine can operate behind the same provider boundary while exposing practical Lead/Deal/Note/Call-Log sales workflows and real browser surfaces
```

Two sourcing/integration modes are therefore empirically proven in the minimum substrate strategy:

1. `HEADLESS_PROVIDER / MANAGED SERVICE` — Twenty and Frappe;
2. `NATIVE_LIBRARY_REUSE / SOURCE REUSE` — Atomic CRM selected source slices.

This is sufficient to show that the substrate is not tied to one CRM vendor or one source-integration style.

---

## 7. Substrate delta after PoU-C

PoU-C exposed implementation/orchestration issues during testing, including MariaDB readiness/bootstrap handling and expiry of short-lived GBAP access tokens during a long exact-source Frappe build. Those issues were corrected in the PoU orchestration and durable runner without weakening the 36 acceptance assertions.

The successful final runs did **not** require:

- replacing GBAP identity/authentication;
- changing GBAP provider-registry semantics;
- changing GBAP canonical mapping semantics;
- direct Frappe database coupling;
- making Frappe Framework or ERPNext the GBAP substrate;
- rewriting `apps/web`;
- weakening outage, uninstall, audit or replacement gates.

Therefore no previously closed substrate Authority is reopened by PoU-C on present evidence.

A later post-PoU synthesis may still identify product-level or operational improvements, but such improvements must be recorded explicitly rather than retroactively changing closed Authority.

---

## 8. Replacement evidence remains bounded

Current CRM replacement state:

```text
Twenty E1_EXPORT_PROVEN
= YES

Frappe E1_EXPORT_PROVEN
= YES

E2_REIMPORT_PROVEN
= NO

E3_CUTOVER_PROVEN
= NO
```

Having two providers independently export data does not prove E2.

`E2_REIMPORT_PROVEN` requires a governed real re-import/reconstitution exercise into a second target while preserving the required GBAP durable business identity and continuity semantics.

`E3_CUTOVER_PROVEN` requires a governed operational provider cutover proof.

Neither may be inferred from the three current PoUs.

---

## 9. Current production-selection state

```text
Twenty as production CRM
= NOT AUTHORIZED

Frappe CRM as production CRM
= NOT AUTHORIZED

Atomic CRM as production CRM
= NOT AUTHORIZED

Atomic-derived source/UI feasibility
= PROVEN

Final GBAP frontend architecture
= NOT AUTHORIZED

Production CRM Selection
= NOT AUTHORIZED

Production UI Selection
= NOT AUTHORIZED
```

A PoU PASS proves technical feasibility within the tested scope. It is not itself a production-selection decision.

---

## 10. Current Gate

```text
Stage 3.4 CRM Source/Document Audit
= PASS

PoU-A Twenty Real-Engine Integration
= PASS / REAL RUNTIME VERIFIED

Twenty Assertions
= 34 / 34 PASS

PoU-B Atomic Native Source/UI Reuse
= PASS / REAL BROWSER VERIFIED

Atomic Assertions
= 15 / 15 PASS

PoU-C Frappe CRM Real-Engine Comparator
= PASS / REAL ENGINE + REAL BROWSER VERIFIED

Frappe Assertions
= 36 / 36 PASS

Frappe final locked PR-head revalidation
= PASS

Real-brick PoU candidates verified
= 3

Integration modes empirically proven
= 2

Replacement Evidence
= E1_EXPORT_PROVEN for Twenty + Frappe

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

The Stage 3.4 CRM Audit Decision Record authorized hands-on PoUs and explicitly withheld production CRM selection. PoU-A, PoU-B and PoU-C are now complete, so the repository must not invent another numeric stage or silently turn a PoU result into a production decision.

The next legal work item is therefore recorded descriptively as:

> **Stage 3.4 post-PoU synthesis｜Cross-PoU Decision Preparation + Substrate Delta Review**

Required work:

1. compare Twenty and Frappe on the real evidence actually proven, including provider-boundary fit, schema extensibility, practical sales workflow, communication surfaces, operational footprint, data exit and failure/recovery behavior;
2. keep Atomic CRM in its correct role as native source/UI reuse evidence rather than falsely comparing it as an equivalent production CRM engine;
3. identify whether any material substrate delta is required after three hands-on PoUs;
4. determine whether the EspoCRM control benchmark must be promoted because a material unresolved CRM-depth/API/data-exit/operational issue remains;
5. separate technical evidence from business/product selection criteria;
6. prepare, but do not pre-authorize, a later explicit production CRM/UI decision Gate;
7. preserve `E2_REIMPORT_PROVEN = NO` and `E3_CUTOVER_PROVEN = NO` unless separately executed and evidenced.

Until that synthesis is completed under an explicit decision record:

`PRODUCTION CRM SELECTION = NOT AUTHORIZED`

`PRODUCTION UI SELECTION = NOT AUTHORIZED`
