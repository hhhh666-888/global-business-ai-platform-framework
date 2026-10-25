# GBAP Stage 3.4｜CRM Audit Decision Record v0.1

**Date:** 2026-08-31  
**Status:** `ACTIVE DECISION RECORD / SOURCE-DOC AUDIT COMPLETE / HANDS-ON POU REQUIRED`

This record is the authoritative interpretation of `GBAP_Stage3_4_CRM_Technical_Product_Audit_v0.1.md`.

## Standardized 100-point scores

| Project | Score | Primary role |
|---|---:|---|
| Twenty | **94** | Full CRM Engine + metadata/object platform |
| EspoCRM | **87** | Mature CRM engine benchmark/fallback |
| Open Mercato | **83** | Business-app foundation / selective MIT reuse |
| Atomic CRM | **82** | Native UI/source reuse + light CRM |
| Relaticle | **82** | AI-native/MCP CRM engine |
| Frappe CRM | **81** | Modern sales CRM engine |
| Krayin CRM | **80** | MIT CRM engine / framework reserve |
| Comp AI CRM | **72** | Agent/evidence/provenance design reference |

Atomic CRM receives no extra numeric bonus for MIT/source-reuse value; that value is handled as a role-specific qualitative advantage.

## What the ranking does NOT mean

GBAP must not simply adopt the highest-scoring project wholesale. The candidates occupy different architectural roles.

- **Twenty** is currently the strongest candidate to test as an independently replaceable complete CRM engine.
- **Atomic CRM** is currently the strongest candidate to test as native MIT UI/source material inside GBAP rather than as a sidecar.
- **Frappe CRM** is the preferred second modern-engine comparator because its sales workflow and communication orientation differ materially from Twenty.
- **EspoCRM** remains the mature depth/export benchmark and fallback engine.
- **Relaticle** should be promoted when Agent/MCP interoperability becomes the primary test objective.
- **Krayin** is the strongest license-friendly reserve full CRM.
- **Comp AI CRM** should be mined for agent, evidence and provenance patterns rather than chosen as the first enterprise CRM engine.
- **Open Mercato** must not be allowed to silently replace GBAP’s own substrate; use selective MIT modules/patterns only unless the substrate is formally reopened.

## Hands-on shortlist

### PoU-A — Twenty

**Mode:** `HEADLESS_PROVIDER / MANAGED SERVICE`

Purpose: test the hardest, richest full CRM engine against the existing GBAP provider/replacement substrate.

### PoU-B — Atomic CRM

**Mode:** `NATIVE_LIBRARY_REUSE / SOURCE REUSE`

Purpose: test whether modern MIT React/shadcn CRM UI can become native GBAP experience without inheriting Atomic/Supabase as the business contract.

### PoU-C — Frappe CRM

**Mode:** `HEADLESS_PROVIDER / MANAGED SERVICE`

Purpose: compare actual daily sales usability, Lead/Deal workflow and communications against Twenty.

### Control benchmark — EspoCRM

Do not install first unless needed. Promote immediately if Twenty/Frappe fail on CRM depth, API quality, data exit or operational/licensing boundaries.

## Stage gate

`STAGE 3.4 CRM SOURCE/DOC AUDIT = PASS`

`PRODUCTION CRM SELECTION = NOT AUTHORIZED`

`HANDS-ON POU = REQUIRED`

## Next legal step

`Stage 3.4.1 — CRM PoU-A｜Twenty Real-Engine Integration Test`

The PoU must validate insertion, real CRUD/custom-object/API use, failure isolation, export, unbinding and replacement/exit evidence. A successful install alone is not a pass.
