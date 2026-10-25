# Global Business AI Platform｜Stage 3 Active Baseline v0.3

Status: `ACTIVE / REAL-BRICK POU VERIFIED / PRODUCTION CRM SELECTION NOT AUTHORIZED`

Supersedes: `GBAP_STAGE3_ACTIVE_BASELINE_v0.2.md`

Project: **全球业务智能平台｜Global Business AI Platform**

Brand: **GBAP**

Current repository: `hhhh666-888/global-business-ai-platform`

This baseline is a state-synchronization record. It does not rewrite or invalidate the historical Stage 3.1–3.3.1 closure evidence retained by earlier baselines and evidence records.

---

## 1. Current Stage 3 engineering state

- Stage 3.1 — COMPLETE
- Stage 3.2 — COMPLETE
- Stage 3.3 — PASS
- Stage 3.3.1 — PASS / COMPLETE / CLOSED
- Stage 3.4 CRM Source/Document Audit — PASS
- Stage 3.4.1 CRM PoU-A｜Twenty Real-Engine Integration Test — PASS / REAL RUNTIME VERIFIED

Stage 3.4.1 does **not** authorize final production CRM selection.

---

## 2. Product and sourcing rule remains unchanged

Global Business AI Platform is one coherent employee-facing GBAP product, not a collection of third-party dashboards.

> **ASSEMBLY FIRST / REUSE FIRST / INTEGRATE FIRST / BUILD LAST.**

GBAP owns the user experience, business semantics, durable identity/continuity, authorization boundaries, data continuity requirements and replacement rights. Mature OSS, SaaS, standards, models, tools and Agents may supply replaceable capabilities.

The minimum substrate is not a universal plugin operating system. Provider/capability boundaries exist only where substitution, isolation or continuity has real business value.

---

## 3. Permanent engineering structure

The normalized Stage 3 engineering structure remains the active structure:

```text
apps/
  web/
  api/
  worker/

providers/
  reference-provider/
  twenty-adapter/

infrastructure/
  compose/
  keycloak/

tests/
  substrate/
  pou/
    twenty/

docs/
  architecture/
  evidence/
  history/

.github/
  workflows/
```

The retired experimental `substrate-v0/` path must not be restored.

---

## 4. Minimum substrate evidence retained

The Stage 3.3 / 3.3.1 substrate remains proven for the minimum lifecycle:

- Web / API / Worker survival;
- Keycloak lab IAM and JWT trust boundary;
- user/admin authorization and unauthenticated rejection;
- provider registration;
- capability binding and resolution;
- endpoint egress allowlist;
- timeout / retry / controlled failure posture;
- provider health, outage isolation and recovery;
- provider enable / disable;
- durable external-entity mapping;
- uninstall guard;
- governed mapping release;
- audit;
- provider unregister;
- zero-provider survival.

The reference provider remains a test instrument, not a business provider selection.

---

## 5. Stage 3.4 CRM audit state

Authoritative audit record:

`docs/architecture/GBAP_Stage3_4_CRM_Audit_Decision_Record_v0.1.md`

The CRM source/document audit is PASS. The hands-on sequence defined there remains authoritative:

1. PoU-A — Twenty — `HEADLESS_PROVIDER / MANAGED SERVICE`
2. PoU-B — Atomic CRM — `NATIVE_LIBRARY_REUSE / SOURCE REUSE`
3. PoU-C — Frappe CRM — `HEADLESS_PROVIDER / MANAGED SERVICE`
4. EspoCRM — mature benchmark/fallback if required

The ranking is not a production-selection decision.

---

## 6. Stage 3.4.1 Twenty real-engine evidence

Authoritative evidence record:

`docs/evidence/GBAP_Stage3_4_1_Twenty_Real_Engine_PoU_Record_v0.1.md`

Validated runtime:

- Twenty version: **v2.37.0**
- Twenty image ID: `sha256:a20d957d2911b4aa3fcf0a89439f32b786c89f23885e6165df0e39e6978551e5`
- tested commit: `b955249d06e72e8b388dfc4e26b3171b31e441a4`
- workflow run: `33388996026`
- workflow job: `99478008070`
- result: **34 / 34 runtime assertions PASS**
- open failure: **0**

The fixed runtime default is `twentycrm/twenty:${TWENTY_TAG:-v2.37.0}` for both Twenty server and worker. Floating `latest` is no longer the Stage 3.4.1 reproducibility baseline.

The successful destructive PoU verified:

- real self-hosted Twenty bootstrap;
- explicit workspace activation;
- semantic metadata readiness;
- dedicated role-bound API-key provisioning;
- API-key Core REST readiness;
- Company / Person / Opportunity CRUD;
- real custom object and custom-object record;
- four durable GBAP ↔ Twenty mappings;
- provider-neutral snapshot export;
- custom-object schema export;
- provider HEALTHY → UNHEALTHY on outage;
- outage isolation with GBAP Web/API survival;
- recovery to HEALTHY;
- data continuity after restart;
- mapping-based uninstall guard;
- governed mapping release;
- lifecycle audit;
- provider unregister;
- complete Twenty stack removal;
- GBAP survival with CRM capability becoming controlled unavailable rather than collapsing the platform.

Validated insertion path:

```text
GBAP Web/API/Worker
→ Capability Binding
→ providers/twenty-adapter
→ Twenty REST / Metadata API
→ Twenty PostgreSQL
```

GBAP does not directly write Twenty PostgreSQL, and raw Twenty credentials are not persisted in the GBAP registry; only the secret reference crosses the substrate boundary.

---

## 7. Closed diagnostic issue

The historical `/metadata` HTTP 408 investigation is closed.

The proven root cause was GBAP PoU choreography / API-schema drift:

1. missing explicit `activateWorkspace`;
2. non-canonical user-token Core REST readiness before dedicated API-key provisioning;
3. stale custom-object GraphQL input type (`CreateObjectInput!` instead of `CreateOneObjectInput!`).

These issues were corrected without weakening acceptance. They must not be reopened as a Twenty adoption blocker unless new evidence independently reproduces a current defect against the pinned runtime.

---

## 8. Replacement / exit evidence level

Current replacement evidence:

- `E1_EXPORT_PROVEN` — **PASS** for the tested Twenty data slice
- `E2_REIMPORT_PROVEN` — **NOT YET PROVEN**
- `E3_CUTOVER_PROVEN` — **NOT YET PROVEN**

E1 means the tested CRM data can be exported through the governed API-level neutral snapshot path. It does not mean a second CRM can already accept that data, and it does not prove cutover.

E2 requires a real second CRM target or neutral re-import target. E3 requires an actual governed cutover proof. Neither may be inferred from the Twenty PoU.

---

## 9. Production-selection state

Twenty is a strong CRM Provider candidate, but:

`PRODUCTION CRM SELECTION = NOT AUTHORIZED`

Stage 3.4.1 proves that Twenty can be inserted, used through the provider boundary, isolated on failure, exported, governed during removal and completely pulled without collapsing GBAP.

It does **not** prove that Twenty must become the production CRM, that its UI becomes the GBAP UI, or that replacement has reached E2/E3.

---

## 10. Explicit nonclaims

Stage 3 still does not claim:

- production readiness;
- production IAM vendor freeze;
- final production database selection;
- final HA / DR / backup maturity;
- final secret manager;
- final observability stack;
- final authorization engine;
- final UI architecture;
- E2 re-import proof;
- E3 cutover proof;
- final CRM vendor selection.

The Twenty PoU adds real-business-provider evidence without expanding these nonclaims.

---

## 11. Current Gate

```text
Stage 3.4 CRM Source/Document Audit
= PASS

Stage 3.4.1 Twenty Real-Engine Integration PoU
= PASS / REAL RUNTIME VERIFIED

Twenty Runtime Baseline
= v2.37.0 PINNED

Assertions
= 34 / 34 PASS

Open Failure
= 0

Replacement Evidence
= E1_EXPORT_PROVEN

E2_REIMPORT_PROVEN
= NOT YET PROVEN

E3_CUTOVER_PROVEN
= NOT YET PROVEN

Production CRM Selection
= NOT AUTHORIZED
```

---

## 12. Next legal Stage 3 work item

The current repository Authority does **not** assign a formal numeric stage after `Stage 3.4.1`.

Therefore this baseline must not invent `Stage 3.4.2` or another number.

The next legal work item defined by the existing Stage 3.4 CRM audit is:

> **Stage 3.4 hands-on continuation — PoU-B｜Atomic CRM Native Source/UI Reuse Test**

Mode:

`NATIVE_LIBRARY_REUSE / SOURCE REUSE`

Purpose:

- test whether selected MIT React/shadcn CRM UI primitives can become native GBAP experience;
- avoid inheriting Atomic/Supabase as the GBAP business contract merely because UI/source is reused;
- preserve GBAP identity, authorization, business semantics and replaceable provider boundary;
- validate selective source reuse rather than sidecar-dashboard adoption;
- identify which UI/domain primitives are worth promoting into GBAP and which must remain external or be rejected.

This PoU does not automatically satisfy E2. `E2_REIMPORT_PROVEN` remains blocked until a real second CRM or neutral re-import target exists and is tested.

A formal numeric identifier for this work item may be assigned only by a later explicit Authority/Gate record; it must not be inferred from naming convention alone.
