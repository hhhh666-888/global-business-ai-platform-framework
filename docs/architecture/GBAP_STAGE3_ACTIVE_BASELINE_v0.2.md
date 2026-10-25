# Global Business AI Platform｜Stage 3 Active Baseline v0.2

Status: `ACTIVE / GREENFIELD / SUBSTRATE-FIRST / NORMALIZED STRUCTURE`

Supersedes: `GBAP_STAGE3_ACTIVE_BASELINE_v0.1.md`

Project: **全球业务智能平台｜Global Business AI Platform**

Brand: **GBAP**

Current repository: `hhhh666-888/global-business-ai-platform`

Current engineering state:

- Stage 3.1 — COMPLETE
- Stage 3.2 — COMPLETE
- Stage 3.3 — PASS
- Stage 3.3.1 — PASS / COMPLETE
- Stage 3.4 — READY

---

## 1. Product intent

Global Business AI Platform is one coherent employee-facing global-business product, not a collection of third-party dashboards.

Intended business surface:

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

Historical custom implementations have no preferential status merely because code already exists.

GBAP must preserve coherent experience, business semantics, durable identity/continuity, authorization boundaries and migration/exit evidence where needed. This does not imply custom-building every capability or physically storing all provider data in one GBAP database.

---

## 3. Thin substrate rule

For a sourced dependency, the substrate answers only the minimum continuity questions:

1. What capability is needed?
2. Which provider currently supplies it?
3. Through what contract or standard is it used?
4. What identity, permission, secret and network access does it require?
5. Which data must survive if the provider disappears?
6. How are external IDs related to durable business IDs?
7. How are version and health known?
8. How is the provider disabled, upgraded, migrated or removed?

The substrate is not a universal plugin operating system.

---

## 4. Integration modes

Supported architectural modes include:

- `STANDARDS_DEPENDENCY`
- `NATIVE_LIBRARY_REUSE`
- `HEADLESS_PROVIDER`
- `MANAGED_SERVICE`
- `OPERATOR_MANAGED_SERVICE`
- `PROVIDER_MANAGED_SAAS`
- `UI_EXTENSION_OR_EXTERNAL_ADMIN`
- `INDEPENDENT_AGENT`

Capability routing is used only where substitution has real business value. Mature standards such as OIDC remain direct boundaries where appropriate.

---

## 5. Permanent Stage 3 engineering structure

Stage 3.3.1 retired the experimental `substrate-v0/` path and promoted the validated runtime into permanent project directories:

```text
apps/
  web/                  # unified GBAP shell
  api/                  # thin Composition API / BFF
  worker/               # provider health / async substrate work

providers/
  reference-provider/   # test-only provider implementing demo.echo

infrastructure/
  compose/              # local multi-service runtime topology
  keycloak/             # deterministic non-production IAM lab config

tests/
  substrate/            # destructive lifecycle self-test

docs/
  architecture/
  evidence/
  history/

.github/
  workflows/
```

No active `substrate-v0/` path remains in the current tree.

---

## 6. Current runtime specimen

Current non-production substrate units:

- GBAP Web
- Composition API/BFF
- Worker
- Reference Provider
- Keycloak 26.7.2 lab IAM
- SQLite substrate metadata
- Docker Compose

Current tested control paths:

- authentication and role authorization;
- provider registration;
- environment / organization / workspace scoping;
- capability binding and resolution;
- provider endpoint egress allowlist;
- timeout / bounded retry / failure posture metadata;
- dynamic provider health;
- provider outage isolation and recovery;
- external entity mapping;
- durable mapping uninstall guard;
- governed mapping release;
- audit;
- provider enable / disable / unregister;
- zero-provider survival.

The reference provider is a verification instrument only. It is not a selected business dependency.

---

## 7. Runtime evidence chain

### Stage 3.3 original destructive self-test

Result:

`31 PASS / 0 OPEN FAILURE / 1 DEFECT DISCOVERED AND CORRECTED DURING TEST`

The discovered defect was the absence of a governed mapping-release path. It was corrected without weakening acceptance.

### New-repository migration revalidation

Result:

`31 PASS / 0 OPEN FAILURE`

Evidence:

`docs/evidence/STAGE_3_3_MIGRATION_REVALIDATION.md`

### Stage 3.3.1 pre-removal normalized-structure revalidation

Tested commit:

`c3a208669c50744e41c1cd7ab6729d72d3ad7e65`

Workflow run:

`33330942160`

Result:

`31 PASS / 0 OPEN FAILURE`

### Stage 3.3.1 final post-removal revalidation

Tested commit:

`48da8e0ca21adaff26a916c7f5392eddab720b33`

Workflow run:

`33331187534`

Evidence commit:

`fdef32ff4432700ec30f7978ad87626f8107f727`

Result:

`31 PASS / 0 OPEN FAILURE`

Evidence:

`docs/evidence/STAGE_3_3_1_STRUCTURE_PROMOTION_REVALIDATION.md`

The final run explicitly verified that `substrate-v0` did not exist before executing the destructive runtime test.

---

## 8. Explicit nonclaims

Stage 3 does not claim:

- production readiness;
- production IAM vendor freeze;
- production database choice;
- production HA / DR / backup maturity;
- multi-host orchestration;
- real business OSS integration;
- R2/R3/R4 provider data migration proof;
- final UI architecture;
- final authorization engine;
- final secret manager;
- final observability stack.

These are not required to prove the minimum substrate lifecycle.

---

## 9. Current gate

Stage 3.3.1 is closed.

Next legal stage:

> **Stage 3.4 — First Real Brick Selection**

The purpose of Stage 3.4 is not broad vendor procurement. It is to select the first real OSS capability whose integration can stress the proven substrate, followed by real integration, pull-the-brick, replacement and substrate-correction rounds.
