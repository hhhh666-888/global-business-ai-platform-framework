# GBAP GBAP｜Enterprise AI Control Plane Architecture v1.0

Status: **DIRECTION FROZEN / IMPLEMENTATION ACTIVE**

Date: 2026-09-22

Repository: `hhhh666-888/global-business-ai-platform`

This document is the long-term architecture authority for GBAP enterprise AI. It exists to prevent cross-session or implementation drift.

If an implementation proposal conflicts with this document, the implementation must stop and either conform or explicitly follow the project governance sequence:

```text
REOPEN -> Evidence -> Impact / Decision -> RE-FREEZE
```

No future chat, model, provider, Agent framework, or implementation convenience may silently replace this direction.

---

## 1. Permanent product principle

```text
GBAP is the platform.

Twenty, RAGFlow, LLM providers, Agent runtimes and future integrations are replaceable bricks behind GBAP-governed capabilities.
```

Permanent engineering principle:

```text
ASSEMBLY FIRST
REUSE FIRST
INTEGRATE FIRST
BUILD LAST
```

GBAP permanently owns:

- employee-facing product UI / UX;
- Keycloak human identity;
- business authorization and policy;
- canonical business IDs;
- provider/source mappings;
- business semantics and workflows;
- capability admission;
- human approval boundaries;
- audit, provenance and observability;
- AI Control Plane;
- durable business truth.

Third-party systems remain internal, headless, replaceable, adapter-backed and failure-isolated.

---

## 2. Target architecture

```text
+-------------------------------------------------------------+
|                     GBAP Employee UI                        |
| CRM | Knowledge | Mail | Calendar | Tasks | AI Assistant   |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                 GBAP AI CONTROL PLANE                       |
|                                                             |
| Identity | Policy | Deterministic Router | Capability Reg. |
| Approval | Audit | Trace | Cost/Rate Limits | Resolution   |
+-----------------------------+-------------------------------+
                              |
             +----------------+----------------+
             |                |                |
             v                v                v
       Direct Tools       Domain AI      Agentic Orchestration
             |                |                |
             |         +------+-------+        |
             |         |              |        |
             |      Twenty AI      RAGFlow     | 
             |       CRM domain   Knowledge    |
             |                                RAGFlow Lead/SubAgent
             |                                  /    |      \
             |                                CRM   KB   Future specialists
             |
             v
+-------------------------------------------------------------+
|                 GBAP CAPABILITY FABRIC                      |
| crm.* | knowledge.* | mail.* | calendar.* | task.*         |
| sales.* | energy.* | research.* | future capabilities      |
+-----------------------------+-------------------------------+
                              |
                   +----------+----------+
                   |          |          |
                   v          v          v
                 Twenty     RAGFlow    Gmail / other providers
```

The **AI Control Plane is not a global LLM Agent**. It is primarily deterministic control-plane code.

The **Capability Fabric is shared by normal GBAP product flows and AI flows**. AI does not receive a separate shadow business model.

---

## 3. Control Plane responsibilities

The Control Plane owns only GBAP-specific control responsibilities:

```text
Identity
Authorization / Policy
Capability Registry
Deterministic Routing
Provider Resolution
Approval
Audit / Trace
Cost / Rate Limits
Risk Classification
Execution Boundaries
```

The Control Plane must **not** become another generic Agent framework.

GBAP must not build its own generic:

- ReAct loop;
- planner;
- subagent scheduler;
- multi-agent state graph;
- general-purpose memory framework;
- generic model framework;
- generic tool runtime.

When an existing admitted runtime already provides these primitives, GBAP reuses it.

---

## 4. Capability Fabric

AI and product UI consume governed business capabilities, not provider internals.

Representative logical capabilities:

```text
crm.company.get
crm.company.list
crm.contact.list
crm.opportunity.list
crm.activity.list

knowledge.search
knowledge.get_document
knowledge.answer

sales.customer_progress.get
sales.next_actions.propose

mail.email.list
mail.draft.create

calendar.events.list
calendar.availability.find

task.create
task.update

energy.customer_profile.get
energy.solution_requirements.get

research.web.search
```

Capabilities expose GBAP business semantics and canonical IDs.

They must not expose:

- database credentials;
- provider tokens;
- raw Twenty internal authority;
- raw RAGFlow dataset/chunk authority as business identity;
- unrestricted SQL or provider-admin APIs.

Internal business integration remains API/adapter first. MCP, when admitted later, is an adapter over the same Capability Fabric rather than a second business implementation.

---

## 5. Runtime roles

### 5.1 Twenty

Twenty remains:

```text
CRM Provider
+
CRM-native Domain AI / Specialist
```

Twenty is preferred for:

- customer/company context;
- contacts;
- opportunities;
- activities, notes and tasks;
- CRM-native reasoning;
- CRM-led content generation;
- approved CRM-native workflows/actions.

Twenty does not become the platform AI authority.

### 5.2 RAGFlow

RAGFlow remains:

```text
Knowledge / RAG Provider
+
Knowledge Domain AI
+
reuse-first Agentic Orchestration Runtime for genuinely complex work
```

RAGFlow is preferred for:

- enterprise Knowledge retrieval;
- product/technical/solution knowledge;
- grounded document reasoning;
- citations;
- complex multi-step Lead/SubAgent orchestration when actually needed.

RAGFlow is **not** the global ingress for every AI request.

### 5.3 LLM providers

Models remain replaceable providers behind `gbap.generative.v1`.

Examples may include DeepSeek, OpenAI, Gemini, Claude, Qwen or future/local models.

A model provider never becomes the business architecture.

### 5.4 Future runtimes and specialists

Future specialists or runtimes may include research, pricing, energy engineering, mail, Hermes, OpenClaw or other systems.

They join through the same governed capability/runtime registration model.

No future runtime may bypass GBAP identity, policy, canonical IDs, audit or approval.

---

## 6. Minimum-complexity execution policy

GBAP adopts **dominant-domain first** and **minimum reliable complexity**.

### Tier 0 — deterministic operation

```text
explicit read/write operation
-> governed Tool/API
-> no LLM
```

Examples:

- get a customer record;
- list recent activities;
- create an allowed task;
- find calendar availability.

### Tier 1 — single-domain reasoning

```text
CRM-led reasoning       -> Twenty AI
Knowledge-led reasoning -> RAGFlow
```

Only one domain AI is used.

### Tier 2 — dominant-domain reasoning with borrowed tools

A task keeps one owning AI and borrows only the missing capability.

Example:

```text
"Based on this customer's progress and our storage advantages,
write a Spanish development email."

GBAP
-> CRM is dominant
-> Twenty AI owns the task
   -> CRM context
   -> knowledge.search only if product facts are needed
-> Twenty AI returns the final email
```

This does **not** start a RAGFlow Lead Agent merely because Knowledge was consulted.

A borrowed Tool is not promoted into a second Agent unless independent reasoning is required.

### Tier 3 — true agentic orchestration

Use multi-Agent orchestration only when:

- there is no adequate single dominant domain; or
- multiple domains require independent reasoning; or
- dynamic task decomposition is genuinely required; or
- independent parallel exploration materially improves the result.

Example:

```text
"Analyze why this customer has not converted using CRM history,
our solution knowledge, current market/policy research and competitors;
then produce a one-month sales strategy and outreach sequence."

GBAP Control Plane
-> RAGFlow Lead Agent
   -> CRM specialist
   -> Knowledge specialist
   -> Research specialist
   -> future specialist as required
-> bounded synthesis
```

Multi-Agent is an escalation path, not the default execution path.

---

## 7. Routing rules

Obvious routes must be deterministic and zero-model.

The router should prefer signals in this order:

1. explicit product surface / current object context;
2. explicit requested capability;
3. action type;
4. current workflow/domain context;
5. only then, when still genuinely ambiguous, bounded model-assisted classification.

Examples:

```text
"Show ABC's latest activity"
-> crm.activity.list
-> zero routing-model call

"Summarize ABC's latest sales progress"
-> Twenty AI
-> CRM domain only

"Write an email from ABC's current progress"
-> Twenty AI
-> optional writing skill
-> no RAGFlow Agent

"Write an email from ABC's progress and quote our storage product facts"
-> Twenty AI
-> knowledge.search Tool
-> no RAGFlow Lead Agent

"Build a strategy using CRM + product knowledge + live market research"
-> agentic orchestration candidate
```

---

## 8. Tool versus Agent rule

Permanent rule:

```text
Tool first.
Specialist Agent only when independent reasoning is needed.
Multi-Agent only when multiple independent reasoning domains are needed.
```

A writing template, prompt, formatter, lookup or bounded API operation should normally be a Skill/Tool/Capability, not a new Agent.

Do not create an Agent merely because a business noun exists.

---

## 9. Security and action policy

AI never creates authority.

Every invocation remains bound by:

- Keycloak employee enabled state;
- employee role/capability policy;
- row/object ACL;
- provider-specific least privilege;
- canonical GBAP IDs;
- risk class;
- bounded tool/time/step limits;
- audit correlation;
- human approval where required.

Default maturity path:

```text
READ
-> may be automatically admitted when policy allows

LOW-RISK WRITE
-> role/capability governed and audited

HIGH-RISK WRITE
-> explicit human approval

PRODUCTION AUTONOMOUS HIGH-RISK ACTION
-> NOT AUTHORIZED until a later frozen gate
```

Initial AI write posture remains disabled unless an existing deterministic product action has an explicitly admitted contract.

---

## 10. API and MCP

MCP does not replace normal application APIs.

Target shape:

```text
                    GBAP Application Service
                    /                     \
                   /                       \
             REST/GraphQL              MCP Adapter
                 ^                         ^
                 |                         |
              GBAP UI              admitted AI/runtime
```

Internal provider integration remains:

```text
GBAP Capability
-> Adapter
-> Provider API
```

A future GBAP MCP Server exposes governed capabilities, not the database or raw provider administration.

External MCP remains **NOT EXPOSED** until separately admitted.

---

## 11. Provider replacement rule

Employee-facing capability names are durable; vendor ownership is not.

Example:

```text
crm.specialist        -> Twenty today
knowledge.specialist  -> RAGFlow today
research.specialist   -> future provider
```

Replacing a provider must not require changing the user-visible capability or business semantics.

---

## 12. Current implementation sequence

Legal implementation order:

```text
A. freeze this v1.0 architecture
B. implement machine-testable Capability Registry
C. implement deterministic route contract
D. prove CRM-only route has zero RAGFlow invocation
E. implement bounded read-only Twenty CRM capabilities
F. prove employee-scoped CRM specialist
G. prove Tier-2 borrowed Knowledge Tool from CRM owner
H. expose admitted CRM specialist to RAGFlow orchestration
I. prove one true Tier-3 cross-domain end-to-end scenario
J. add future specialists by registration
K. only then reopen mutation/approval automation gates
```

Existing accepted DeepSeek admission, RAGFlow Candidate A, Twenty F1/F2, Knowledge ACL and retrieval evidence is reused and must not be rerun without a new evidence trigger.

---

## 13. Current posture

```text
GBAP AI Control Plane         REQUIRED / PLATFORM AUTHORITY
Capability Fabric             REQUIRED / IMPLEMENTATION ACTIVE
Deterministic Router          REQUIRED / IMPLEMENTATION NEXT
Twenty                        CRM PROVIDER + CRM DOMAIN AI
RAGFlow                       KNOWLEDGE PROVIDER + KNOWLEDGE AI
RAGFlow Lead/SubAgent         ON-DEMAND COMPLEX ORCHESTRATION
DeepSeek                      CURRENT SHARED UAT MODEL CANDIDATE
Generic GBAP Agent Runtime    FORBIDDEN
AI writes                     DISABLED unless separately admitted
External MCP                  NOT EXPOSED
Production                    NOT AUTHORIZED
```

This architecture intentionally avoids selecting a single vendor AI as the owner of GBAP.

**GBAP is the platform and control authority. Providers, models and Agent runtimes remain replaceable bricks.**
