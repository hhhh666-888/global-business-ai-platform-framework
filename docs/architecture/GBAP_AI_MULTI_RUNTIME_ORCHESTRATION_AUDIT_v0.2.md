# GBAP GBAP｜AI Multi-Runtime Orchestration Audit v0.2

Status: **REOPENED / REUSE-FIRST ORCHESTRATION CORRECTION / IMPLEMENTATION NEXT**

Date: 2026-09-22

Supersedes `GBAP_AI_RUNTIME_INTEGRATION_SURFACE_AUDIT_v0.1.md` only for the multi-runtime orchestration and Candidate B integration-surface decision. The v0.1 evidence remains immutable history.

Long-term architecture authority created by this correction:

- `docs/architecture/GBAP_ENTERPRISE_AI_CONTROL_PLANE_ARCHITECTURE_v1.0.md` — **DIRECTION FROZEN / IMPLEMENTATION ACTIVE**

Authorities retained:

- `docs/architecture/GBAP_AI_REUSE_FIRST_RUNTIME_AUDIT_v0.2.md`
- `gbap.ai.v1` as the thin GBAP policy/capability boundary
- RAGFlow `v0.27.2`
- Twenty `v2.41.0`
- shared bake-off model `deepseek-flash`
- Keycloak employee identity and all existing GBAP authorization/audit boundaries

## 0. REOPEN trigger

The real Windows run on current main advanced beyond shared-model admission and Candidate A execution:

```text
DeepSeek shared-model admission             PASS
shared synthetic provider suite             PASS
RAGFlow Candidate A native Agent runtime    PASS
Twenty Candidate B temporary role proof     PASS
Twenty Candidate B AI Chat catalog          BLOCKED before model execution
cleanup                                     PASS
```

The Candidate B block is not an LLM, identity, Knowledge ACL, or F1/F2 failure. It is a Twenty v2.41 AI Chat tool-catalog boundary: system-object DATABASE_CRUD descriptors remain visible even when the temporary role has zero positive object grants.

At the same time, a current external/runtime source audit confirmed that the desired product pattern is not “two chatbots compete and one is discarded”. The desired pattern is a manager/specialist topology: one user-facing controller retains the final answer while specialist capabilities or agents are invoked as tools.

## 1. Industry pattern adopted

GBAP adopts the mature **manager / agents-as-tools / orchestrator-worker** pattern.

Conceptually:

```text
employee
  |
  v
GBAP AI Control Plane
  |
  +--> deterministic capability router + policy gate
         |
         +--> CRM-only query / reasoning ---------> Twenty directly
         |
         +--> Knowledge-only query / reasoning ---> RAGFlow directly
         |
         +--> deterministic bounded action -------> admitted tool directly
         |
         +--> complex cross-domain task ----------> RAGFlow Lead/SubAgent orchestration
                                                      |
                                                      +--> Twenty CRM specialist
                                                      +--> Knowledge specialist
                                                      +--> future specialists
```

**RAGFlow is not the global ingress for every AI request.** It is reused as the agentic orchestration substrate only when orchestration is actually needed.

Obvious single-domain routes must not spend another LLM call merely to decide where to go. The GBAP capability router should resolve them deterministically from the product surface, explicit requested capability, current object/context, and admitted action type whenever possible.

Handoff remains a valid pattern for a future user-facing specialist that must temporarily own the conversation, but it is not the default for GBAP cross-domain work.

The default is **direct capability dispatch first; agents-as-tools only when reasoning/orchestration is needed**. This preserves policy and audit without forcing every request through an extra model hop.

## 2. Do not build a third Agent runtime

Permanent rule remains:

```text
ASSEMBLY FIRST
REUSE FIRST
INTEGRATE FIRST
BUILD LAST
```

GBAP must not implement another generic:

- Agent loop;
- planner;
- subagent scheduler;
- multi-agent state graph;
- generic memory engine;
- model-provider registry;
- generic tool runtime.

GBAP may implement only GBAP-specific gaps:

- employee identity delegation;
- capability admission;
- canonical business IDs;
- provider mapping;
- business authorization;
- human approval;
- audit / provenance;
- bounded adapters between already-existing runtimes.

## 3. RAGFlow v0.27.2 becomes the native agentic-orchestration substrate candidate — not the global router

Exact upstream `infiniflow/ragflow@v0.27.2` already implements the required primitives.

Exact source evidence includes:

```text
internal/agent/component/agent.go

AgentParam.SubAgents []SubAgentTool

SubAgentTool
= a child Agent exposed to a parent Agent as an Eino tool
```

The same exact tag includes:

```text
agent/templates/deep_research.json
```

which is a Lead-Agent + specialist-subagent orchestration template.

Therefore GBAP will **reuse RAGFlow's native Lead/SubAgent capability** rather than write its own orchestration engine **for complex multi-step / cross-domain agentic work**.

RAGFlow is bypassed for pure CRM work and other routes that can be resolved directly. This avoids unnecessary token spend, extra latency and an avoidable runtime dependency.

This does not make RAGFlow a GBAP authority or global request router. RAGFlow remains headless/internal/replaceable and operates only with admitted capabilities.

## 4. Twenty remains the CRM specialist — it is not removed

Twenty continues to provide the capabilities for which it is uniquely strong:

- customer/company context;
- contacts;
- opportunities;
- tasks/notes/activities;
- CRM-native permissions;
- CRM-native AI reasoning;
- workflow-integrated AI;
- later, approved mail/calendar/CRM actions.

The current Twenty Candidate B F1/F2 evidence remains valid and reusable:

```text
mapped employee Knowledge execution     PASS
unmapped employee deny                  PASS
disabled employee deny                  PASS
two-employee Knowledge ACL isolation    PASS
citation backing / no negative leak     PASS
```

The current AI Chat DATABASE_CRUD catalog finding therefore does **not** authorize dropping Twenty and does **not** select “RAGFlow only”.

## 5. Tool first, specialist Agent only when reasoning is needed

Not every capability should become another LLM Agent.

Use deterministic tools when the operation is primarily data access or a bounded action:

```text
crm.company.get/list
crm.contact.list
crm.opportunity.list
crm.activity.list
knowledge.search
calendar.list
mail.email.list
```

Use a specialist Agent when the task benefits from isolated reasoning/context, for example:

```text
crm.specialist
  -> analyze account history
  -> inspect opportunity/activity context
  -> propose next sales action
  -> return a bounded structured result

knowledge.specialist
  -> multi-hop enterprise retrieval
  -> compare products/solutions/policies
  -> return grounded result with citations
```

This keeps cost, latency and failure surface lower than turning every function into an Agent.

## 6. Twenty integration order after this REOPEN

Preferred order remains reuse-first:

```text
1. Twenty supported APIs / App logic functions / role model
2. Twenty native Agent surface with user-scoped least privilege
3. bounded GBAP adapter around those supported surfaces
4. tiny deterministic upstream-compatible patch only if exact-source evidence proves no supported path can preserve the required permission intersection
5. never copy/rebuild Twenty's Agent core
```

### 6.1 Existing supported Twenty path already retained

The installed GBAP Knowledge App already proves a person-scoped Twenty logic-function path:

```text
Twenty person context
-> workspaceId + userWorkspaceId + workspaceMemberId
-> GBAP identity bridge
-> canonical Keycloak subject
-> canonical Knowledge ACL
```

Its application role has no CRM object access and its machine credential is not employee authority.

### 6.2 Exact v2.41 Agent-source finding

Twenty v2.41 has:

- `runAgent`;
- `runAsWorkspaceMemberId`;
- Agent roles;
- explicit object permissions;
- a preloaded Agent tool path using `requireExplicitObjectGrants: true`;
- permission-intersection utilities.

However the current open-ended `runAgent` path uses lazy tool loading, and its current `runAs` role composition does not yet provide the exact Agent-role ∩ employee-role least-privilege proof required by GBAP.

Therefore:

```text
direct runAgent production admission     NOT YET AUTHORIZED
AI Chat zero-DATABASE_CRUD workaround    NOT A PLATFORM BLOCKER
Twenty CRM specialist proof              NEXT FAILED SCOPE
```

No broad application credential, WORKFLOWS privilege, or employee-role escalation may be used to force a pass.

## 7. Extensible specialist model

Future capability additions must register as replaceable specialists/capabilities behind the same GBAP boundary.

Target logical registry:

```text
knowledge.specialist          RAGFlow
crm.specialist                Twenty
pricing.specialist            future admitted runtime/tool
web-research.specialist       future admitted runtime/tool
energy-engineering.specialist future admitted runtime/tool
mail.specialist               future admitted runtime/tool
```

A specialist record describes **what it may do**, not which vendor permanently owns the product.

Provider replacement must not change the employee-facing capability name.

## 8. Routing rule

Routing is bounded, cost-aware and follows **dominant-domain first**. “Cross-domain” does not automatically mean “start the Lead Agent”.

```text
Tier 0 — deterministic direct action
  explicit read/write operation
  -> admitted API/tool directly
  -> zero orchestration model hop

Tier 1 — dominant single-domain reasoning
  CRM-led task
  -> Twenty AI directly

  Knowledge-led task
  -> RAGFlow Knowledge/Agent directly

Tier 2 — dominant-domain reasoning with borrowed tools
  CRM-led task that needs product/policy/technical context
  -> Twenty AI remains the owner
  -> calls search-gbap-knowledge only if needed
  -> no RAGFlow Lead Agent

  Knowledge-led task that needs bounded CRM facts
  -> RAGFlow remains the owner
  -> calls an admitted read-only CRM capability only if needed
  -> no Twenty chat handoff and no extra Lead Agent

Tier 3 — true agentic orchestration
  no single dominant domain, or dynamic multi-step decomposition is required
  -> RAGFlow Lead/SubAgent orchestration
  -> call only the specialists needed
  -> Lead synthesizes the final result
```

Example:

```text
"Based on this customer's current progress, write a development email."

CRM data already sufficient
-> Twenty AI
-> final email

CRM data + GBAP product facts needed
-> Twenty AI
-> search-gbap-knowledge (bounded retrieval tool)
-> Twenty AI
-> final email

CRM + Knowledge + external market research + dynamic comparison/strategy
-> RAGFlow Lead Agent
-> Twenty CRM specialist
-> Knowledge specialist
-> research specialist
-> final synthesis
```

This rule prevents unnecessary token spend. A borrowed tool call is not promoted into a second Agent unless independent reasoning is actually required.

The Control Plane router is **not another Agent runtime**. It is a thin policy/capability dispatcher. Obvious routes must be deterministic and zero-model. A model-based routing decision is permitted only for genuinely ambiguous natural-language requests where deterministic context cannot safely resolve the capability.

Parallelism is an optimization, not a default. It is used only when subtasks are independent and authorization can be evaluated independently.

## 9. Security / approval boundary

The Agent hierarchy never creates authority.

Every specialist invocation must carry or resolve the original employee identity and remain bounded by:

- Keycloak enabled state;
- GBAP role/capability policy;
- provider-specific least privilege;
- canonical object/record ACL;
- read/write risk class;
- human approval for mutations;
- bounded time/step/tool limits;
- audit correlation.

Retrieved CRM/Knowledge/email/web content remains untrusted data and can never alter these controls.

## 10. Current selection posture

This audit does not declare a product winner.

```text
GBAP deterministic capability router     GLOBAL REQUEST INGRESS / ZERO-MODEL WHEN OBVIOUS
RAGFlow native Lead/SubAgent reuse       AGENTIC ORCHESTRATION SUBSTRATE CANDIDATE
Twenty                                   CRM SPECIALIST RETAINED
DeepSeek                                 SHARED UAT MODEL CANDIDATE
PRIMARY product runtime                  NOT SELECTED
AI writes                                DISABLED
external MCP                             NOT EXPOSED
Production                               NOT AUTHORIZED
```

“RAGFlow agentic orchestration substrate candidate” means its already-existing manager/subagent machinery is the current reuse-first implementation path **only for tasks that actually need multi-agent orchestration**. It does **not** mean Twenty is discarded, that every request passes through RAGFlow, or that RAGFlow becomes the owner of identity, CRM truth, authorization or final GBAP policy.

## 11. Next legal implementation sequence

```text
1. freeze this orchestration correction with focused CI
2. reuse existing DeepSeek / Candidate A / Twenty F1 / Twenty F2 PASS evidence
3. stop treating Twenty AI Chat zero-DATABASE_CRUD catalog as the whole-platform blocker
4. define the GBAP deterministic capability-routing contract with explicit CRM-only / Knowledge-only bypass paths
5. define one bounded Twenty CRM specialist contract
6. prove employee-scoped read-only CRM specialist execution on synthetic data
7. prove CRM-only direct execution returns without any RAGFlow invocation
8. expose the CRM specialist to the RAGFlow Lead Agent only for complex cross-domain work
9. prove one end-to-end cross-domain manager -> Twenty CRM specialist + Knowledge specialist -> synthesized answer
10. add future specialists by registration, not by rewriting the orchestrator
11. only after read-only proof add mutation + human-approval gates
```

No accepted Knowledge benchmark, DeepSeek admission, Candidate A execution, or Twenty F1/F2 gate is rerun merely because this orchestration surface is corrected.

Production remains **NOT AUTHORIZED**.
