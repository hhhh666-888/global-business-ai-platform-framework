# GBAP GBAP｜AI Control Plane Architecture v0.1

Status: **HISTORICAL FOUNDATION / SUPERSEDED BY ENTERPRISE AI CONTROL PLANE v1.0**

Date: 2026-09-20

Successor architecture authority: `docs/architecture/GBAP_ENTERPRISE_AI_CONTROL_PLANE_ARCHITECTURE_v1.0.md`.

`GBAP_AI_REUSE_FIRST_RUNTIME_AUDIT_v0.2.md` and later orchestration audits remain supporting evidence/history; they do not override the v1.0 long-term direction.

## 0. Purpose

GBAP owns the enterprise AI product and business-control plane.

Twenty, RAGFlow, model vendors and future Agent runtimes remain replaceable providers or clients. No upstream product becomes the authority for GBAP business identity, authorization, canonical IDs, audit, customer data or Knowledge governance.

Permanent principle:

```text
ASSEMBLY FIRST
REUSE FIRST
INTEGRATE FIRST
BUILD LAST
```

## 1. Architecture decision

```text
Employee / GBAP UI
        |
        v
+------------------------------+
| GBAP AI Control Plane        |
| gbap.ai.v1                |
|                              |
| AI Gateway                   |
| Orchestrator                 |
| Context Engine               |
| Tool Registry / Tool Gateway |
| Policy + Approval            |
| Session / Memory (later)     |
| Budget / Limits              |
| Audit / Observability        |
+---------------+--------------+
                |
        +-------+--------+
        |                |
        v                v
   Model Gateway      Tool Gateway
        |                |
gbap.generative.v1     +-----------------------------+
        |                 | GBAP canonical capabilities |
 replaceable model        | CRM / Knowledge / Mail      |
 provider                 | Calendar / Energy / ...     |
                          +---------------+-------------+
                                          |
                                 Provider adapters
                                   /           \
                              Twenty          RAGFlow
```

External Agent runtimes are clients of GBAP capabilities, never owners of them:

```text
Hermes / OpenClaw / Claude / ChatGPT / future Agent runtime
                           |
                      GBAP MCP Gateway
                           |
                  SAME Tool Registry / Policy
                           |
                    GBAP business services
```

## 2. Contract separation

### 2.1 `gbap.generative.v1`

Role: **replaceable model-generation provider contract**.

It owns no business authorization and no Agent semantics.

Initial accepted capabilities remain:

- `generative.v1.health`
- `generative.v1.answer`

The architecture audit authority is:

`docs/evidence/GBAP_GENERATIVE_V1_AI_ARCHITECTURE_AUDIT_2026-09-20.md`

### 2.2 `gbap.ai.v1`

Role: **GBAP-native AI control-plane contract**.

It is not another third-party provider contract. It defines stable GBAP concepts for:

- tools;
- risk levels;
- approval policy;
- orchestration;
- bounded context;
- model invocation policy;
- audit;
- future MCP projection.

The first code foundation implements only the Tool Registry and read-only Tool Gateway.

### 2.3 Existing business/provider contracts

Remain authoritative:

- `gbap.crm.v1`
- `gbap.knowledge.v1`
- existing native GBAP APIs for Calendar and other business-owned data.

AI tools adapt those existing governed capabilities. AI must not talk directly to Twenty, RAGFlow databases, provider endpoints or provider credentials.

## 3. API vs MCP rule

API and MCP are complementary.

```text
GBAP Web / normal application integration
-> normal GBAP HTTP APIs

GBAP native AI
-> native Tool Gateway
-> same GBAP services/APIs

External standards-compatible Agent
-> MCP Gateway
-> SAME Tool Registry / SAME policy / SAME business services
```

MCP must never become a second business implementation path.

The MCP server may expose only explicitly admitted tools/resources. It must not expose:

- raw database access;
- arbitrary SQL;
- provider tokens;
- Twenty internal IDs;
- RAGFlow dataset/document/chunk IDs;
- filesystem/shell access;
- unrestricted generic HTTP;
- generic provider capability invocation.

## 4. Tool model

Every AI tool is declarative and governed.

Required metadata:

```text
name
title
description
input schema
risk
approval
target
```

Risk vocabulary:

```text
READ
WRITE
HIGH_RISK
```

Approval vocabulary:

```text
NONE
USER_CONFIRMATION
PRIVILEGED_CONFIRMATION
```

Initial policy:

| Risk | Default execution |
|---|---|
| READ | May execute without per-call confirmation after normal GBAP authentication/authorization |
| WRITE | Must require explicit user confirmation before execution |
| HIGH_RISK | Must require privileged confirmation and may remain disabled entirely |

A tool's risk metadata never overrides the underlying business authorization. The existing API/ACL remains the final authority.

## 5. Foundation tool set

Foundation is deliberately READ-only:

```text
crm.company.list
crm.contact.list
crm.opportunity.list
crm.task.list
crm.note.list
crm.activity.list
knowledge.search
calendar.list
mail.email.list
```

No create/update/delete/send/publish capability is admitted in the first batch.

Knowledge search continues through native GBAP Knowledge ACL and the frozen `gbap.knowledge.v1` path.

## 6. Tool result minimization

AI tool results must remove provider/internal transport fields that have no business meaning.

Initial denylist includes:

- provider ID/name fields;
- provider/external IDs;
- mapping IDs;
- transport request IDs;
- provider provenance;
- provider document/collection IDs;
- connected-account provider IDs.

Business/canonical IDs may be returned when required for a governed follow-up action.

## 7. Identity and authorization

The active employee identity remains Keycloak.

For native AI tool execution:

```text
employee JWT
-> AI Gateway authentication
-> Tool policy
-> underlying GBAP API/capability
-> underlying business ACL/ownership/role checks
```

The AI control plane must never mint a more privileged identity than the requesting user.

For future MCP access, OAuth/OIDC authorization must map the external client/session to a bounded GBAP principal and scopes. Service identities, if introduced, require separate governance and must not silently impersonate an employee.

## 8. Prompt-injection and untrusted-data rule

All content from Knowledge, CRM, email, web, files and tools is untrusted data.

An orchestrator must:

- distinguish system/policy instructions from retrieved/tool content;
- never treat instructions found inside tool results as authority;
- enforce tool allowlists independently of model output;
- validate all model-selected tool arguments against schemas;
- enforce step/time/token/cost ceilings;
- require approval independently of the model;
- fail closed when authorization or approval cannot be proven.

The current `gbap.generative.v1` Knowledge path already treats retrieved context as bounded input and validates citations. That behavior is preserved.

## 9. Orchestrator rule

The first production-capable AI path must be **single-agent and bounded**.

Initial orchestrator target:

```text
user request
-> classify intent
-> construct authorized context
-> model turn
-> zero or more allowed READ tools
-> bounded follow-up model turn
-> answer with sources/actions
```

Before any write tool is introduced, the orchestrator must have:

- maximum step count;
- tool-call count limit;
- request timeout;
- token/cost budget;
- loop detection;
- schema validation;
- approval state machine;
- idempotency for mutations;
- end-to-end audit correlation.

Multi-agent delegation is deferred until a concrete business workflow demonstrates that one bounded Agent is insufficient.

## 10. Memory model

Memory is not part of the foundation.

When added, memory must be separated into:

1. **conversation/session context** — short-lived;
2. **user preference memory** — governed, editable, bounded;
3. **business truth** — never stored as AI memory when it belongs in CRM/Knowledge/other canonical systems;
4. **working artifacts/tasks** — explicit durable business objects.

The model/provider must never become the system of record.

## 11. MCP Gateway target

MCP is a projection of the Tool Registry, not a new implementation.

Target requirements before exposure:

- current stable MCP transport selected;
- OAuth/OIDC authentication;
- tool discovery generated from the same Registry;
- input-schema parity;
- risk/approval parity;
- per-principal authorization;
- no provider/internal ID leakage;
- request correlation/audit;
- rate/step limits;
- revoke/disable control;
- explicit external-Agent admission list.

Until that Gate passes:

```text
MCP gateway status = NOT EXPOSED
```

## 12. Relationship to Twenty and RAGFlow AI features

Twenty AI and RAGFlow Agent/AI features may be reused internally when they supply a bounded capability that is materially better than rebuilding it.

They must remain behind GBAP contracts.

Not allowed:

```text
Employee -> Twenty AI as GBAP authority
Employee -> RAGFlow Agent as GBAP authority
External Agent -> Twenty MCP bypassing GBAP
External Agent -> RAGFlow MCP bypassing GBAP
```

Allowed future pattern:

```text
GBAP Tool/Provider Adapter
-> bounded upstream capability
-> canonical GBAP result
```

## 13. Implementation sequence

### Phase A — Control Plane Foundation

Current batch:

- audit and retain `gbap.generative.v1`;
- introduce `gbap.ai.v1`;
- native Tool Registry;
- READ-only Tool Gateway;
- authorization inheritance;
- provider-internal result minimization;
- audit proof.

### Phase B — Real Model + Knowledge Assistant

- complete real provider live evaluation;
- select one UAT model/provider from evidence;
- implement `generative.v1` adapter;
- prove grounded Knowledge Assistant end-to-end.

### Phase C — Bounded single-Agent orchestrator

- model/tool turn contract;
- step/time/token/cost budgets;
- READ tool planning/execution;
- employee AI Assistant UI;
- source/tool trace presentation.

### Phase D — Writes + Human approval

- add low-risk WRITE tools;
- explicit confirmation state machine;
- idempotency and mutation audit;
- keep high-risk actions disabled until separate evidence.

### Phase E — MCP Gateway

- expose the same admitted Tool Registry through standards-compatible MCP;
- OAuth/OIDC and external Agent admission;
- prove Hermes/OpenClaw/other client interoperability without provider bypass.

### Phase F — Advanced automation only from evidence

Possible later:

- scheduled jobs;
- long-running tasks;
- durable memory;
- skills;
- sub-agents/multi-agent;
- external web/browser tools.

These are not foundation requirements.

## 14. Foundation non-claims

This v0.1 foundation does **not** claim:

- real generative provider selected;
- complete AI chat UI;
- autonomous Agent enabled;
- any write AI tool enabled;
- MCP endpoint exposed;
- Hermes/OpenClaw installed;
- multi-agent enabled;
- long-term AI memory enabled;
- Production authorized.

## 15. Acceptance

Foundation PASS requires proof that:

1. AI has its own native control-plane boundary.
2. `gbap.generative.v1` remains independent and unchanged.
3. Registry exposes only admitted read tools.
4. Knowledge tool inherits existing Knowledge ACL.
5. Personal Calendar tool remains actor-scoped.
6. unknown/unregistered tools fail closed.
7. provider/internal identifiers are stripped from tool results.
8. tool invocations are audited without persisting retrieved source content.
9. no write/MCP/model-provider selection is silently enabled.
10. frozen RAGFlow/GTE retrieval is untouched.

Production remains **NOT AUTHORIZED**.
