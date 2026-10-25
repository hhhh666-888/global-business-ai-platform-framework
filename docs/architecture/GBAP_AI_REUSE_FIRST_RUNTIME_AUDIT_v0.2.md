# GBAP GBAP｜AI Reuse-First Runtime Audit v0.2

Status: **ACTIVE CORRECTION AUTHORITY / REUSE-FIRST**

Date: 2026-09-20

Supersedes the implementation direction in:

- `docs/architecture/GBAP_AI_CONTROL_PLANE_ARCHITECTURE_v0.1.md`

without deleting its valid permanent boundaries around GBAP identity, authorization, canonical IDs, provider isolation and audit.

## 0. Correction trigger

The first AI foundation correctly established that GBAP must own employee identity, business authorization and canonical capability boundaries.

The succeeding design direction proposed implementing a native model adapter and later a native Agent orchestrator.

A source-level audit of the exact upstream products already installed by GBAP found that this would duplicate mature functionality:

- Twenty CRM `v2.37.0`
- RAGFlow `v0.27.2`

Therefore the implementation strategy is corrected before those duplicated runtimes enter `main`.

PR #254, which implemented a custom OpenAI-compatible model adapter, was closed **UNMERGED**.

## 1. Permanent engineering rule

```text
ASSEMBLY FIRST
REUSE FIRST
INTEGRATE FIRST
BUILD LAST
```

For AI this means:

```text
DO NOT build another model-provider framework
DO NOT build another generic Agent loop
DO NOT build another generic tool runtime
DO NOT build another generic memory engine
DO NOT build another generic workflow/agent canvas
DO NOT copy mature upstream AI cores merely to rename them GBAP
```

GBAP builds only the authority and integration gaps that upstream products cannot own safely.

## 2. Exact Twenty v2.37.0 audit

Exact source audited:

`twentyhq/twenty@twenty/v2.37.0`

The installed Twenty version already contains a mature AI execution layer.

Its `AgentAsyncExecutorService` uses:

- the Vercel AI SDK `generateText`;
- an AI model registry and model configuration service;
- a central `ToolRegistryService`;
- native model-tool binding;
- agent-role permission configuration;
- preloaded and lazy tool-loading strategies;
- compact tool catalogs;
- `learn_tools` and `execute_tool` meta-tools;
- explicit maximum agent step limits;
- tool-call repair;
- per-step usage accounting;
- token/cache accounting;
- tool execution metrics;
- structured output support.

Twenty Apps also allow server-side logic functions to be exposed as AI tools through `toolTriggerSettings`. The same application interface can participate in chat, function calling and MCP without modifying Twenty core.

### Twenty conclusion

Twenty AI is **not** a feature we should reproduce inside GBAP.

Twenty is strongest for:

- CRM-native reasoning and actions;
- CRM object/tool discovery;
- CRM permission-aware tools;
- workflow-integrated AI;
- CRM record context;
- application-defined CRM tools.

GBAP should consume this through published Twenty interfaces / Apps / APIs rather than copying Twenty's AGPL core Agent implementation into GBAP.

## 3. Exact RAGFlow v0.27.2 audit

Exact source audited:

`infiniflow/ragflow@v0.27.2`

RAGFlow already contains:

- Agentic RAG;
- Agent canvas/runtime;
- LLM/Agent components;
- retrieval tools;
- MCP integration;
- Agent sessions and completion APIs;
- memory support;
- browser/code/tool components;
- model-provider configuration;
- LiteLLM-backed provider abstraction;
- provider/model-specific request normalization;
- tool calling;
- streaming;
- usage handling.

Its model layer already supports or explicitly handles providers/families including:

- Tongyi-Qianwen / DashScope;
- DeepSeek;
- OpenAI;
- Azure OpenAI;
- Anthropic;
- Gemini;
- Ollama;
- OpenRouter;
- Zhipu;
- MiniMax;
- and additional providers.

RAGFlow v0.27.2 also contains model-family policies for provider-specific details such as Qwen thinking controls.

### RAGFlow conclusion

A GBAP-specific OpenAI-compatible adapter would duplicate functionality that already exists in the pinned RAGFlow runtime.

RAGFlow is strongest for:

- enterprise Knowledge;
- retrieval + grounded generation;
- Agentic RAG;
- cross-tool Agent workflows;
- model-provider abstraction;
- MCP-connected tools;
- reusable Agent components;
- memory and multi-step knowledge work.

RAGFlow is Apache-2.0 licensed, making bounded source/component reuse simpler than copying Twenty core.

## 4. Correct combined architecture

GBAP should **combine** the two mature AI systems by assigning them different responsibilities.

```text
                       GBAP GBAP
          identity / policy / UI / audit / canonical IDs
                              |
                 +------------+------------+
                 |                         |
                 v                         v
        RAGFlow AI Runtime          Twenty AI / CRM Runtime
        v0.27.2 headless            v2.37.0 headless
        -----------------           -------------------
        Agentic RAG                 CRM-native tools
        Agent runtime               CRM permissions
        model providers             CRM agent patterns
        Knowledge                   CRM workflows
        MCP/tool client             Twenty Apps tools
        memory/components           record context
                 |                         |
                 +------------+------------+
                              |
                     canonical GBAP result
```

Neither upstream runtime becomes GBAP authority.

## 5. Primary-runtime hypothesis

Desk/source audit currently favors:

```text
cross-domain primary Agent runtime candidate   RAGFlow Agent
CRM specialist AI runtime                     Twenty AI
```

Reason:

- RAGFlow is already the GBAP Knowledge runtime;
- its Agent runtime is designed for cross-tool workflows;
- it already owns the broad model-provider layer;
- it includes MCP/tool integration;
- it is less coupled to CRM semantics;
- it is Apache-2.0;
- Twenty remains uniquely valuable for CRM-native AI behavior.

This is a **candidate conclusion**, not final admission.

The final primary Agent runtime must be chosen by a same-task live bake-off.

## 6. What GBAP still owns

The following are not redundant wheels. They are GBAP authority boundaries and remain required:

```text
Keycloak employee identity
GBAP authorization and business policy
canonical business IDs
canonical provider mappings
Knowledge ACL admission
tool admission / deny-by-default
human approval for mutations
audit / observability
provider provenance
short-lived delegated execution identity
unified employee UI
business-specific semantics
```

The existing `gbap.ai.v1` foundation is therefore retained only as a **thin policy/capability boundary**.

It must not grow into a third Agent runtime.

## 7. gbap.generative.v1 decision

`gbap.generative.v1` is not a model engine.

It may remain as a small compatibility contract for bounded direct-generation use cases such as:

```text
authorized contexts
-> grounded answer
-> temporary context citations
-> canonical GBAP citation mapping
```

But the implementation behind it should reuse an accepted upstream runtime/model layer, normally RAGFlow, rather than another GBAP-written vendor adapter.

Current decision:

```text
keep contract                         YES
treat as GBAP model-provider runtime  NO
write provider adapters in GBAP       NO by default
write generic Agent loop in GBAP      NO
allow future deprecation              YES, if Agent runtime makes it redundant
```

A new contract version is unnecessary unless evidence shows the current boundary blocks the selected runtime.

## 8. Twenty reuse rule

Preferred integration order:

```text
1. Twenty published API / GraphQL / REST
2. Twenty Apps / logic functions
3. Twenty AI tools exposed through supported application interfaces
4. provider adapter around supported interfaces
5. modify/copy Twenty core only with an explicit license + maintenance decision
```

Do not fork/copy `AgentAsyncExecutorService` into GBAP merely to reproduce its behavior.

Use its design as a benchmark and use Twenty itself when CRM-native AI is required.

## 9. RAGFlow reuse rule

Preferred integration order:

```text
1. RAGFlow Agent / Chat / model-provider APIs
2. RAGFlow Agent components
3. RAGFlow MCP/tool facilities
4. RAGFlow reusable Apache-2.0 source/components where API use is insufficient
5. build a missing GBAP-specific adapter only after proving no reusable path exists
```

The existing pinned RAGFlow runtime remains headless/internal/replaceable.

## 10. Identity-delegation gap

The principal integration gap is **not AI reasoning**.

It is secure delegation:

```text
Keycloak employee
-> GBAP AI request
-> short-lived scoped execution/delegation context
-> selected Agent runtime
-> GBAP/Twenty/RAGFlow tool call
-> original employee authorization remains enforceable
```

The selected runtime must not receive a permanently privileged GBAP service credential that lets it bypass employee authorization.

This delegation/policy bridge is legitimate GBAP-specific engineering and may be custom-built if no mature reusable standard satisfies the requirement.

MCP OAuth / user-scoped authorization should be preferred where it fits.

## 11. Runtime bake-off

Before selecting the primary Agent runtime, run the exact same bounded scenarios through:

### Candidate A — RAGFlow Agent

RAGFlow Agent consumes GBAP-authorized tools and Knowledge.

### Candidate B — Twenty Agent

Twenty Agent consumes CRM-native tools plus a GBAP-authorized Knowledge tool.

Use the same model wherever possible.

Required scenarios:

1. **CRM + Knowledge analysis**
   - read one customer;
   - read contacts/opportunity/activity;
   - retrieve relevant product/solution Knowledge;
   - propose next sales action;
   - no mutation.

2. **Grounded Knowledge answer**
   - multilingual question;
   - numeric facts;
   - canonical citations;
   - prompt-injection text in retrieved content.

3. **Draft business action**
   - produce a task/email draft;
   - do not execute the mutation;
   - demonstrate approval boundary.

4. **Permission isolation**
   - same prompt from two identities with different accessible data;
   - prove no cross-user leakage.

5. **Tool-selection stress**
   - multiple similar tools;
   - prove correct tool selection and bounded step count.

Evaluate:

```text
quality / correctness
tool-call success
Knowledge grounding
citation fidelity
permission fidelity
latency
token/cost
loop resistance
prompt-injection resistance
failure recovery
observability
configuration burden
upgrade burden
provider lock-in
source/license maintenance burden
```

## 12. Selection rule

Do not choose a runtime because it has more features on paper.

Choose the runtime that gives GBAP the best real result with the least custom code while preserving GBAP authority.

After selection:

- one runtime becomes PRIMARY;
- the other remains SPECIALIST;
- no third generic runtime is built.

## 13. MCP posture

MCP remains an interoperability standard, not the GBAP core implementation.

Target:

```text
Agent runtime
-> authenticated MCP / tool adapter where appropriate
-> GBAP canonical capability/policy
-> underlying provider
```

Do not expose raw SQL, raw Twenty internals, raw RAGFlow IDs or unrestricted provider APIs.

## 14. Current legal engineering sequence

```text
1. close custom provider-adapter PR #254 unmerged
2. freeze this reuse-first correction
3. inspect exact Twenty v2.37 and RAGFlow v0.27.2 integration surfaces
4. define a common runtime bake-off harness
5. implement only the minimum connector needed for Candidate A
6. implement only the minimum connector needed for Candidate B
7. run the same scenarios
8. select one primary runtime from evidence
9. keep the other as a specialist provider
10. only then build the employee AI surface
11. add mutation/approval later
12. keep Production NOT AUTHORIZED
```

## 15. Explicitly rejected direction

Rejected:

```text
GBAP custom model provider framework
+ GBAP custom generic Agent loop
+ GBAP custom generic tool runtime
+ GBAP custom memory engine
+ GBAP custom MCP implementation from protocol primitives
```

unless a later evidence-backed gap proves a mature reusable component cannot satisfy a required GBAP control.

Production remains **NOT AUTHORIZED**.
