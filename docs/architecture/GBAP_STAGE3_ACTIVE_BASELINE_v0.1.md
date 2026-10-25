# Global Business AI Platform｜Stage 3 Active Baseline v0.1

Status: `ACTIVE / GREENFIELD / SUBSTRATE-FIRST`

Project: **全球业务智能平台｜Global Business AI Platform**

Brand: **GBAP**

Current repository: `hhhh666-888/global-business-ai-platform`

Predecessor: `hhhh666-888/gbap-global-business-ai-platform`

---

## 1. Product intent

Global Business AI Platform is one coherent employee-facing global-business product, not a collection of third-party dashboards.

The intended end-to-end business surface is:

```text
Prospecting
→ Account / Contact
→ Research
→ Communication
→ Opportunity
→ Technical Requirement
→ Technical Solution
→ Quote
→ Follow-up / Task
→ Contract / Project
→ Delivery / Service
→ Enterprise Knowledge
→ Analytics / AI
```

GBAP is the product subject. Mature OSS, SaaS, standards, models, tools and Agents are sourced capabilities used to construct the product.

---

## 2. Sourcing rule

> **ASSEMBLY FIRST / REUSE FIRST / INTEGRATE FIRST / BUILD LAST.**

Existing predecessor custom implementations have no preferential status merely because code already exists.

For every capability, the project asks in order:

1. Is there a mature standard that already defines the boundary?
2. Is there a mature OSS or service that implements the capability well?
3. Can it be adopted or integrated without surrendering product continuity?
4. Can useful source/components/patterns be reused?
5. Only then: is a thin GBAP-native implementation actually necessary?

---

## 3. GBAP must control, but need not custom-build

GBAP must preserve:

- coherent product experience;
- business semantics;
- durable business identity and continuity;
- dependency boundaries;
- authorization before external actions;
- provider/migration/exit evidence where needed.

This does **not** mean every capability must be implemented by GBAP or physically stored in one custom database.

A sourced bounded system may be authoritative for its own bounded objects when portability and exit conditions are proven.

---

## 4. Capability domains

The platform capability map is organized into twelve domains:

1. Unified Product Experience
2. Identity, Organization and Access
3. Core Business System
4. Prospecting, Growth and Market Intelligence
5. Communication and Engagement
6. Knowledge, Files and Enterprise Memory
7. AI, Models and Agents
8. Workflow, Tasks and Coordination
9. Integration and Extension Substrate
10. Data, Search and Analytics
11. Platform Operations, Security and Reliability
12. Developer, Administration and Ecosystem Enablement

The map defines **what the product needs**, not which vendor must implement each capability.

---

## 5. Minimum substrate constitution

The substrate remains deliberately thin. For a sourced dependency, the substrate should answer only the minimum questions required for continuity:

1. What capability is needed?
2. Which provider currently supplies it?
3. Through what contract or standard is it used?
4. What identity, permission, secret and network access does it require?
5. Which data must survive if the provider disappears?
6. How are external IDs related to durable business IDs?
7. How are version and health known?
8. How is the provider disabled, upgraded, migrated or removed?

The substrate is **not** a universal plugin operating system.

---

## 6. Integration modes

A real external capability may enter through different shapes. The platform does not force every system into one plugin API.

Supported architectural modes include:

- `STANDARDS_DEPENDENCY`
- `NATIVE_LIBRARY_REUSE`
- `HEADLESS_PROVIDER`
- `MANAGED_SERVICE`
- `OPERATOR_MANAGED_SERVICE`
- `PROVIDER_MANAGED_SAAS`
- `UI_EXTENSION_OR_EXTERNAL_ADMIN`
- `INDEPENDENT_AGENT`

Third-party software does not need to know that GBAP exists. GBAP may register it through a wrapper/registration record.

---

## 7. Capability abstraction rule

Capability routing is used only where substitution has real business value.

Good candidates include:

```text
communication.send
knowledge.retrieve
prospect.discovery
company.research
model.generate
document.parse
```

Existing mature standards should normally remain the boundary directly. Example:

```text
GBAP → OIDC → IAM
```

Do not create a redundant custom capability wrapper solely for architectural symmetry.

---

## 8. Data continuity classes

Provider integration distinguishes at least:

- Durable Business Truth
- Durable Evidence / Enterprise Assets
- Provider Runtime State
- Rebuildable Derived Data
- Ephemeral Data

The goal is continuity, not indiscriminate duplication of every provider table.

Example: a RAG engine may own chunks, embeddings and indexes while GBAP preserves source files, business linkage, access meaning and provenance needed to rebuild them.

---

## 9. External entity mapping

Where a provider has its own IDs, the substrate can maintain explicit mapping:

```text
GBAP durable business ID
↕
Provider external ID
```

Current minimum mapping fields include business type/ID, provider ID, external type/ID and audit history.

A provider with durable mappings cannot be silently removed. Mappings must be migrated or deliberately released through a governed action first.

---

## 10. Replacement model

Replacement difficulty:

- `R1` EASY
- `R2` MANAGED
- `R3` MIGRATION
- `R4` STRUCTURAL

Replacement evidence:

- `E0` DOCUMENTED
- `E1` EXPORT_PROVEN
- `E2` REIMPORT_PROVEN
- `E3` CUTOVER_PROVEN

A provider is not considered truly replaceable merely because documentation claims an export function exists.

---

## 11. Stage 3.1 implementation blueprint

The first implementation deliberately avoids microservice proliferation.

Minimum runtime shape:

```text
GBAP Web Shell
        ↓
Composition API / BFF
        ↓
Provider / Capability / Mapping / Audit metadata
        ↓
Provider boundary

GBAP Worker
→ health / asynchronous substrate work
```

Mature infrastructure and external business engines remain separately sourceable.

No requirement currently exists for Kafka, NATS, RabbitMQ, Redis, Kubernetes, a service mesh, an App Store or a universal Agent runtime.

---

## 12. Stage 3.2 runnable specimen

The first greenfield runnable substrate is migrated under `substrate-v0/`.

Runtime units:

- GBAP Web
- Composition API/BFF
- Worker
- Reference Provider
- Keycloak 26.7.2 lab IAM
- SQLite substrate metadata
- Docker Compose

Implemented control paths include:

- provider registration;
- scoped capability binding;
- provider resolution;
- egress allowlist;
- timeout/retry/failure posture metadata;
- dynamic health;
- external mapping;
- audit;
- enable/disable;
- guarded uninstall.

This specimen is explicitly non-production.

---

## 13. Stage 3.3 predecessor evidence

The predecessor repository ran the destructive substrate self-test twice.

Round 1 exposed a real lifecycle defect: durable mapping correctly prevented provider removal, but there was no governed mapping-release action.

The substrate was corrected by adding governed mapping deletion plus audit.

Round 2 result:

`31 PASS / 0 OPEN FAILURE / 1 DEFECT DISCOVERED AND CORRECTED DURING TEST`

Predecessor evidence commit:

`38f9bad57adde5fa8b4895c564db40e61b111679`

Correction commit:

`a4214e99f3732e5935030d697d7ed2967d873161`

The current repository must independently reproduce PASS before authority cutover is final.

---

## 14. Repository split rule

Historical Phase0–9 code and the predecessor `apps/*` / `packages/*` are not silently migrated.

The old repository is a historical baseline and source of evidence/reuse candidates.

Any future code reuse from it requires a fresh evidence-based `REUSE / REIMPLEMENT / PORT / REJECT` decision.

---

## 15. Next gate

Current gate:

```text
New repository independent Stage 3.3 destructive self-test
```

If PASS:

- this repository becomes sole current engineering authority;
- `substrate-v0` can be promoted/refactored into permanent project directories in a separate controlled step;
- Stage 3.4 First Real Brick Selection becomes legal.

If FAIL:

- correct the migrated substrate here;
- rerun the entire destructive test;
- do not weaken acceptance criteria.
