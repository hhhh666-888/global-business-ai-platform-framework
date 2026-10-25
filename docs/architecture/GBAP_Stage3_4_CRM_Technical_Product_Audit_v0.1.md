# GBAP Stage 3.4｜CRM Technical + Product Audit v0.1

**Project:** 全球业务智能平台 / Global Business AI Platform (GBAP)  
**Date:** 2026-08-31  
**Status:** `AUDIT COMPLETE / SOURCE+DOC REVIEW / HANDS-ON POU NOT YET PERFORMED`  
**Scope:** Twenty, Frappe CRM, Atomic CRM, Krayin CRM, Relaticle, EspoCRM, Comp AI CRM, Open Mercato

---

## 1. Purpose

This audit does not ask only “which CRM is best”. It asks which assets are best for GBAP under four different roles:

1. **CRM Engine / Provider** — a complete CRM that can run as an independently replaceable service.
2. **Source / UI Reuse Asset** — code, UI and design primitives that can be incorporated into GBAP directly.
3. **AI / Agent Design Reference** — patterns worth copying even if the CRM itself is not adopted.
4. **Business Application Foundation** — framework/platform ideas that may be reusable, but overlap with GBAP’s own substrate.

The audit is evidence-based from current official GitHub repositories, official documentation and project metadata. UI scores are based on official screenshots/demos/documentation, not yet on GBAP-hosted hands-on user testing.

---

## 2. Scoring model (100 points)

| Dimension | Weight |
|---|---:|
| Product UX / visual coherence / daily usability | 15 |
| CRM functional completeness | 15 |
| Data model / custom fields / custom objects | 12 |
| API / integration / headless capability | 12 |
| Data portability / replacement / exit quality | 10 |
| Self-host / deployment / operational simplicity | 10 |
| Identity / permission / enterprise control fit | 8 |
| License / source reuse freedom | 8 |
| AI / Agent readiness | 5 |
| Maturity / activity / ecosystem | 5 |
| **Total** | **100** |

Scores are decision aids, not universal product ratings. A lower total can still be the best source-reuse asset.

---

## 3. Executive ranking

| Rank | Project | Score | Primary GBAP role | Audit decision |
|---|---|---:|---|---|
| 1 | **Twenty** | **94** | CRM Engine + UI/SDK reference | `POU-1 / MUST TEST` |
| 2 | **EspoCRM** | **87** | Mature CRM Engine benchmark | `BENCHMARK / FALLBACK ENGINE` |
| 3 | **Atomic CRM** | **84** | Source/UI Reuse + light CRM | `POU-2 / MUST TEST SOURCE REUSE` |
| 4 | **Open Mercato** | **83** | Business App Foundation / source reuse | `STUDY + SELECTIVE REUSE` |
| 5 | **Relaticle** | **82** | AI-native CRM Engine | `POU-3B / WATCH + TEST IF AI-CRM PRIORITY` |
| 6 | **Frappe CRM** | **81** | Modern Sales CRM Engine | `POU-3 / MUST COMPARE WITH TWENTY` |
| 7 | **Krayin CRM** | **80** | MIT CRM Engine / framework | `RESERVE / LICENSE-FRIENDLY OPTION` |
| 8 | **Comp AI CRM** | **72** | Agent-first design reference | `LEARN / REUSE PATTERNS, NOT FIRST ENGINE` |

### Important interpretation

The score table does **not** mean GBAP should install the first three and ignore the rest.

- **Twenty** is the strongest overall full CRM candidate.
- **Atomic CRM** is more attractive than its total score suggests for direct source/UI reuse because it is MIT and component-oriented.
- **EspoCRM** is the strongest maturity/CRM-depth control group, even though its UX is less modern.
- **Comp AI CRM** is weak as the first enterprise CRM engine, but unusually strong as an Agent design reference.
- **Open Mercato** overlaps with GBAP’s own substrate and should not be allowed to redefine GBAP architecture.

---

# 4. Candidate audits

## 4.1 Twenty — `twentyhq/twenty`

### Current facts

- Modern open-source CRM positioned as an alternative to Salesforce and designed for AI.
- GitHub activity is very high; current repository metadata observed ~55.9k stars and recent pushes.
- TypeScript monorepo; React frontend; NestJS backend; PostgreSQL, Redis and BullMQ.
- Built-in Companies, People, Opportunities, Tasks, Notes, dashboards, workflows, email/calendar and AI.
- First-class **custom objects**, custom fields and relations.
- Workspace schema generates REST and GraphQL APIs automatically.
- Webhooks, OAuth, Apps, logic functions, front components, views, page layouts, skills and agents are official extension surfaces.
- Docker Compose self-hosting; documented minimum RAM around 2 GB.
- CSV/API import/export supported; custom object records can be migrated.
- Role-based permissions cover objects, fields and records; SAML/OIDC SSO and audit capabilities are documented.

### License

Core is mostly **AGPLv3**, with some Enterprise/commercial files. Important exception: published SDKs, `twenty-ui`, `twenty-apps` and related application-development packages are MIT; Twenty also includes an explicit application exception allowing independent Applications built through published interfaces to retain their own license.

### Strengths for GBAP

- Best object/metadata model of the audited CRMs.
- Best balance of modern UX + extensibility + API + app platform.
- Custom objects are first-class rather than “extra columns only”.
- Very strong match for future GBAP business entities such as Project, Requirement, Quote, Product, Buying Committee, Evidence.
- `twenty-ui` and SDK layer may be reusable even if the full engine is rejected.
- Strong candidate for a headless/managed CRM provider behind GBAP.

### Risks

- Deep integration creates structural dependence because Twenty is already a platform, not a small component.
- Full-core source modification is AGPL-sensitive.
- Operational footprint is larger than light CRMs.
- Some self-hosted capabilities have commercial-edition boundaries; exact GBAP-required feature list must be tested rather than assumed.
- Using Twenty UI wholesale can make GBAP visually and structurally converge toward Twenty unless ownership boundaries are explicit.

### GBAP classification

`HEADLESS_PROVIDER` preferred for first PoU; additionally `NATIVE_LIBRARY_REUSE` for MIT UI/SDK assets where useful.

### Decision

**POU-1 / MUST TEST.**

---

## 4.2 EspoCRM — `espocrm/espocrm`

### Current facts

- Long-running open-source CRM with active 2026 development.
- Strong classic CRM domain: leads, contacts, accounts, opportunities, campaigns, support cases, email, calendar, marketing and automation.
- SPA frontend + REST API backend.
- Custom entities, fields, relationships and metadata are core platform features.
- OpenAPI specification can be generated from the actual instance, including custom entity types and fields.
- Dedicated API users and role-scoped API access.
- Docker and traditional self-hosting documented.
- Import/export tooling can include data, configuration, customizations, relationships and selected entities; especially strong exit/migration story.

### License

AGPLv3.

### Strengths for GBAP

- Most mature CRM-depth benchmark in this group.
- Strong API and metadata architecture.
- Strong custom application capability.
- Excellent migration/export evidence compared with most candidates.
- Good control candidate: if a modern CRM cannot match EspoCRM’s functional depth, the visual advantage alone is insufficient.

### Risks

- UI is clean but not as modern as Twenty / Atomic / Frappe.
- Older PHP/custom frontend architecture offers less direct code synergy with GBAP’s current Node/JS shell.
- Direct source reuse is less attractive under AGPL.

### GBAP classification

`HEADLESS_PROVIDER / MATURE BENCHMARK`.

### Decision

**Keep as the mature fallback engine and benchmark.** It does not need to be the first PoU unless Twenty/Frappe fail on depth or replacement requirements.

---

## 4.3 Atomic CRM — `marmelab/atomic-crm`

### Current facts

- React + shadcn-admin-kit/shadcn UI + Supabase/PostgreSQL.
- Contacts, Companies, Deals, Tasks, Notes, activity history, Kanban, reminders and email capture.
- Full REST API via Supabase/PostgREST with generated OpenAPI.
- Supports Google, Azure, Keycloak and Auth0 authentication patterns.
- Import/export for CRM entities; CSV export and vCard support documented.
- Custom fields are added by changing Supabase tables and then exposing them in UI; not a metadata-driven custom-object engine like Twenty.
- Components are published through a **Shadcn Registry**, explicitly encouraging customization/replacement of components.
- Current repository is active and MIT licensed.

### License

**MIT — strongest reuse freedom among the audited UI-oriented CRMs.**

### Strengths for GBAP

- Best direct source/UI reuse candidate.
- React/shadcn stack is close to the kind of modern unified GBAP UX desired.
- Keycloak compatibility reduces IAM friction with the current substrate.
- The project explicitly supports replacing components and changing themes.
- Shadcn Registry mechanism makes selective adoption realistic rather than requiring a fork of the whole CRM.
- Excellent candidate for customer table, record page, deal Kanban, forms, filters, notes/tasks and activity UI primitives.

### Risks

- CRM engine depth is lighter than Twenty/EspoCRM.
- Custom data model is schema/code driven; no first-class runtime custom-object platform.
- Tight Supabase implementation assumptions exist in the stock app.
- If used as an external CRM engine, GBAP gains less than if it selectively reuses its components.

### GBAP classification

`NATIVE_LIBRARY_REUSE / SOURCE REUSE` first; full provider adoption is secondary.

### Decision

**POU-2 / MUST TEST SOURCE REUSE.** Do not treat Atomic as “just another external CRM”. Test whether its MIT UI primitives can become native GBAP UX while the business engine remains replaceable.

---

## 4.4 Open Mercato — `open-mercato/open-mercato`

### Current facts

- Modern TypeScript/Next.js business application foundation containing CRM, Sales, OMS, Commerce, workflows and admin capabilities.
- Multi-tenancy, organization hierarchy, feature RBAC, events, modular entities, custom entities/dynamic forms and AI-supportive conventions.
- PostgreSQL + Redis + Meilisearch commonly used in the documented development setup.
- Supports standalone apps/modules without necessarily editing the core.
- Repository is actively developed; current metadata shows a relatively young project with a very large open-issue count, which requires interpretation rather than treating it as a defect count.

### License

MIT according to repository metadata/README for the audited core.

### Strengths for GBAP

- Very aligned with “start with 80%, build the differentiated 20%”.
- Modern TypeScript stack and module conventions fit GBAP better than legacy PHP CRM frameworks.
- Strong source-reuse potential for dynamic forms, admin tables, tenant-aware entities, events and module conventions.
- Useful reference for AI-assisted engineering governance.

### Risks

- It is **not merely a CRM brick**; it is a competing application foundation.
- Adopting it wholesale would risk replacing GBAP’s substrate rather than adding a brick.
- Young project; long-term stability and upgrade discipline need validation.
- Large scope and issue backlog increase adoption complexity.

### GBAP classification

`SELECTIVE SOURCE REUSE / ARCHITECTURE REFERENCE`, **not first external CRM provider**.

### Decision

Study individual modules and patterns. Do not let Open Mercato become the new platform root unless GBAP explicitly reopens the substrate decision.

---

## 4.5 Relaticle — `relaticle/relaticle`

### Current facts

- Modern self-hosted CRM centered on Companies, People, Opportunities, Tasks and Notes.
- REST API and native MCP server with 37 CRM tools.
- AI assistant can use cloud providers or local Ollama in self-hosted deployments.
- 22 custom field types documented; fields become available in forms, lists, filters, API/AI surfaces.
- Multiple workspaces and role-based membership.
- CSV import and CSV/XLSX export; exports include IDs and custom fields.
- Docker self-hosting documented with five containers; published minimum ~1 core / 2 GB RAM, 4 GB recommended.
- Very active but relatively young project.

### License

AGPLv3.

### Strengths for GBAP

- Best ready-made MCP/AI interoperability among the complete CRM candidates.
- Excellent provider for testing future GBAP Agent ↔ CRM interaction.
- Strong data exit story for its core entities.
- Simple self-host story and modest resource requirements.
- Clean modern product direction.

### Risks

- Younger ecosystem and shorter production history than Twenty/EspoCRM/Krayin.
- Customization is mainly custom fields on a fixed set of record types, not a full custom-object platform.
- Current role model/product depth is narrower than enterprise CRMs.
- AGPL reduces direct source-reuse attractiveness.

### GBAP classification

`HEADLESS_PROVIDER / AI-NATIVE CRM CANDIDATE`.

### Decision

Keep high on the list for an AI-focused PoU after the first engine test, or promote it if native MCP becomes a Stage 3 priority.

---

## 4.6 Frappe CRM — `frappe/crm`

### Current facts

- New-generation Frappe CRM, distinct from the older ERPNext CRM experience.
- Vue-based modern frontend using Frappe UI; Frappe Framework backend.
- Leads, Deals, activities, comments, notes, tasks, Kanban, custom views, email/call integration.
- Built-in/integrated paths for Twilio, Exotel, WhatsApp and ERPNext.
- Custom fields and layout customization documented.
- Frappe Framework automatically exposes CRUD REST APIs for all DocTypes, and API v2 exposes DocType metadata.
- Self-hosting supported; production is normally a Frappe stack rather than a tiny standalone service.

### License

Frappe CRM is AGPLv3; Frappe Framework itself is MIT.

### Strengths for GBAP

- One of the best modern sales-team UX candidates.
- Strong communication-oriented sales workflow.
- Frappe DocType architecture offers deep customization underneath the CRM UI.
- Huge Frappe ecosystem and mature framework operational knowledge.
- Good candidate to test “modern CRM UI on top of a deeply extensible framework”.

### Risks

- Strong coupling to Frappe Framework and its conventions.
- Direct CRM source modification has AGPL implications.
- Using the entire Frappe ecosystem can cause scope expansion toward ERPNext and away from GBAP boundaries.
- New CRM frontend does not expose every underlying Frappe field/type perfectly yet.

### GBAP classification

`HEADLESS_PROVIDER / MANAGED SERVICE`.

### Decision

**POU-3 / MUST COMPARE WITH TWENTY** for practical sales usability and communication flow.

---

## 4.7 Krayin CRM — `krayin/laravel-crm`

### Current facts

- Mature Laravel + Vue open-source CRM with active 2026 development and large GitHub following.
- Core CRM entities include Leads, Persons, Organizations, Activities, Quotes, Products, Sources, Pipelines and related modules.
- Attribute-driven data model: admins can add custom attributes to multiple entity types without DB migrations/code.
- First-party REST API package with Swagger, Sanctum auth, CRUD across core entities; API writes fire normal system events.
- Docker documented; server requirement around 3 GB RAM in current README.
- Modular Laravel package architecture.

### License

**MIT.**

### Strengths for GBAP

- Excellent license position for source reuse/modification.
- Strong classic CRM entity coverage.
- Good API surface and event consistency.
- Attribute model is a useful middle ground between rigid entities and fully dynamic object platforms.
- Established project and community.

### Risks

- UI is functional and modern enough, but below Twenty/Atomic/Frappe in visual refinement.
- API is distributed as an additional Composer package rather than being the minimal core surface.
- Enterprise-style extensions such as SaaS multi-tenancy/WhatsApp/VoIP have separate extension/product considerations; exact license and cost must be checked per extension.
- Less AI-native than Twenty/Relaticle/Comp.

### GBAP classification

`HEADLESS_PROVIDER / SOURCE REUSE RESERVE`.

### Decision

Strong **license-friendly reserve candidate**. Promote to PoU if Twenty/Frappe licensing or platform coupling becomes unacceptable.

---

## 4.8 Comp AI CRM — `trycompai/crm`

### Current facts

- Very new 2026 project explicitly designed “agentic-first”.
- Next.js + shadcn/ui frontend, NestJS/tRPC API, Prisma/PostgreSQL, Better Auth, separate durable Agent deployment.
- Agent performs autonomous research, evidence collection, enrichment and follow-up scheduling.
- Strong evidence philosophy: observed facts/evidence are separated from uncertain suggestions rather than allowing an LLM to invent confidence.
- MIT licensed and rapidly growing.
- Stock architecture is deliberately single-tenant/no-organization, which conflicts with GBAP enterprise organization requirements.
- Production architecture is strongly shaped around Vercel services, although local/self-host development is possible.

### License

**MIT.**

### Strengths for GBAP

- Best conceptual reference for proactive Agent-driven CRM work.
- Evidence/provenance pattern is directly relevant to GBAP’s customer research and lead verification.
- Modern TypeScript/shadcn architecture offers reusable UI and Agent design ideas.
- Clear separation between intelligence in the Agent and CRUD/reporting in the API is worth studying.

### Risks

- Too young to be GBAP’s first enterprise CRM engine.
- Explicit single-tenant design conflicts with organization/workspace needs.
- Public integration/API surface is not as mature as Twenty/Espo/Krayin.
- Vercel-centric production assumptions are not aligned with GBAP private deployment by default.
- CRM functional breadth is currently secondary to the Agent thesis.

### GBAP classification

`DESIGN REFERENCE / SELECTIVE MIT SOURCE REUSE`.

### Decision

**Do not choose as first CRM provider.** Extract Agent/evidence/provenance patterns and possibly UI code after review.

---

# 5. Comparative scorecard

| Dimension | Twenty | Espo | Atomic | Open Mercato | Relaticle | Frappe | Krayin | Comp AI |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| UX / 15 | 15 | 10 | 15 | 12 | 13 | 14 | 11 | 14 |
| CRM completeness / 15 | 14 | 15 | 10 | 10 | 11 | 13 | 13 | 9 |
| Data model / 12 | 12 | 12 | 7 | 12 | 8 | 10 | 11 | 7 |
| API/headless / 12 | 12 | 12 | 11 | 10 | 11 | 10 | 11 | 8 |
| Portability / 10 | 9 | 10 | 9 | 8 | 9 | 8 | 7 | 6 |
| Operations / 10 | 8 | 9 | 8 | 7 | 10 | 7 | 8 | 6 |
| Identity/security / 8 | 8 | 8 | 8 | 8 | 7 | 7 | 6 | 6 |
| License/reuse / 8 | 6 | 4 | 8 | 8 | 4 | 4 | 8 | 8 |
| AI/Agent / 5 | 5 | 2 | 2 | 4 | 5 | 3 | 1 | 5 |
| Maturity/activity / 5 | 5 | 5 | 4 | 4 | 4 | 5 | 4 | 3 |
| **Total** | **94** | **87** | **82** | **83** | **82** | **81** | **80** | **72** |

> Note: Atomic’s executive table originally uses 84 only if source-reuse value is given an additional strategic adjustment. The normalized 100-point matrix yields **82**. The normalized score is authoritative for cross-product comparison; the strategic source-reuse adjustment is discussed separately and must not be confused with raw product score.

---

# 6. License and reuse posture

## Best for direct code/UI reuse

1. **Atomic CRM — MIT**
2. **Krayin — MIT**
3. **Comp AI CRM — MIT**
4. **Open Mercato — MIT core**

## Use primarily through interfaces / sidecar unless legal review says otherwise

- Twenty core — mostly AGPLv3, but official SDK/UI packages and app surface have materially better reuse terms.
- Frappe CRM — AGPLv3.
- EspoCRM — AGPLv3.
- Relaticle — AGPLv3.

AGPL is not an automatic rejection for an independently deployed internal provider. It becomes materially more important when GBAP modifies, embeds, redistributes or tightly incorporates the covered code. Legal review is required before proprietary distribution decisions.

---

# 7. Replacement / exit posture

### Strongest documented exit paths

**EspoCRM** — rich export/import including data, customizations, config and relationships.  
**Twenty** — CSV/API migration across standard/custom objects; API supports large migrations.  
**Relaticle** — IDs + custom fields included in exports; CSV/Excel export and import.  
**Atomic** — straightforward PostgreSQL/Supabase ownership plus CSV export, but richer business-schema migration must be built by GBAP if used structurally.

### Higher structural lock-in risk

- **Twenty** when its metadata/apps/workflows become the authoritative definition of GBAP business processes.
- **Frappe** when GBAP business logic begins depending on Frappe DocType hooks/framework internals.
- **Open Mercato** when GBAP adopts the framework as its own architectural root.

The correct mitigation is not “copy every database table into GBAP”. It is to preserve GBAP continuity IDs, mappings, required durable evidence, export contracts and repeatable replacement tests.

---

# 8. What should actually be installed next?

## PoU-A — Twenty as a real CRM Engine

Goal: validate the hardest and most capable engine first.

Must test:
- install and self-host;
- Company/Person/Opportunity CRUD;
- custom object + custom fields + relations;
- REST/GraphQL API;
- webhooks;
- GBAP Keycloak/OIDC boundary or supported SSO path;
- data import/export;
- GBAP external-entity mapping;
- failure isolation;
- disable/uninstall/reconnect;
- extract a complete neutral migration dataset;
- determine exact Community vs Enterprise feature boundaries needed by GBAP.

## PoU-B — Atomic CRM as a native source/UI asset

Goal: test the opposite integration mode, not another sidecar.

Must test:
- install selected MIT UI/CRM components into a GBAP branch/lab;
- adapt customer list, record page and deal Kanban to GBAP data contracts;
- verify that no Supabase-specific assumption leaks into GBAP business contracts;
- confirm Keycloak integration path;
- assess how much custom code is required to make the UI truly GBAP-native;
- update/replacement behavior via the Shadcn registry.

## PoU-C — Frappe CRM as a second modern full-engine comparator

Goal: compare actual sales-team usability and communication workflow with Twenty.

Must test:
- self-host stack complexity;
- Lead/Deal UX;
- Frappe REST v2 / DocType metadata;
- custom fields + custom DocType feasibility behind the CRM;
- WhatsApp/email/call extension boundaries;
- export/exit path;
- whether a Frappe provider can remain invisible behind GBAP UI without excessive adapter work.

### Benchmark — EspoCRM

Do not discard. If Twenty/Frappe fail on depth, stability, export or licensing, EspoCRM becomes the mature control candidate immediately.

---

# 9. Decisions by candidate

| Candidate | ADOPT | INTEGRATE | REUSE | REIMPLEMENT/LEARN | REJECT |
|---|---|---|---|---|---|
| Twenty | Conditional | **Yes — PoU** | MIT UI/SDK selective | Yes | No |
| Frappe CRM | Conditional | **Yes — PoU** | Limited/selective | Yes | No |
| Atomic CRM | Not as primary engine yet | Optional | **Yes — PoU** | Yes | No |
| Krayin | Reserve | Yes if promoted | Yes | Yes | No |
| Relaticle | Conditional | Yes if AI-first PoU | Limited | **Yes** | No |
| EspoCRM | Reserve engine | **Yes as benchmark** | Limited | Yes | No |
| Comp AI CRM | No as first engine | Not first | **Selective MIT** | **Strong yes** | No |
| Open Mercato | No as first CRM provider | Not first | **Selective MIT** | **Strong yes** | No |

---

# 10. Stage 3.4 conclusion

The audit does **not** support picking one CRM and copying it wholesale into GBAP.

The strongest path is deliberately mixed:

1. **Twenty** — first real full CRM engine PoU.
2. **Atomic CRM** — first native source/UI reuse PoU.
3. **Frappe CRM** — second modern engine comparator.
4. **EspoCRM** — mature fallback/control benchmark.
5. **Relaticle + Comp AI CRM** — harvest AI/MCP/evidence patterns.
6. **Krayin + Open Mercato** — harvest MIT framework/source patterns; promote only if the first PoUs expose a concrete need.

### Gate

`STAGE 3.4 SOURCE/DOC AUDIT = PASS`

`PRODUCTION CRM SELECTION = NOT YET AUTHORIZED`

`HANDS-ON POU = REQUIRED BEFORE ADOPT/INTEGRATE FREEZE`

### Next legal action

**Stage 3.4.1 — CRM PoU-A: Twenty Real-Engine Integration Test**

Run Twenty as the first real full CRM brick against the already validated GBAP substrate. The test must include both **insertion** and **exit/replacement evidence**, not only successful installation.
