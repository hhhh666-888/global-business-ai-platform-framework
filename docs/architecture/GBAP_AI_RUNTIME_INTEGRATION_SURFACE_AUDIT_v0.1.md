# GBAP GBAP｜AI Runtime Integration Surface Audit v0.1

Status: **REAL BAKE-OFF TOOLING IMPLEMENTED / FOCUSED CI NEXT / NO PRIMARY RUNTIME SELECTED**

Date: 2026-09-21

Authority:
- `docs/architecture/GBAP_AI_REUSE_FIRST_RUNTIME_AUDIT_v0.2.md`
- Twenty exact runtime baseline: `twentyhq/twenty@twenty/v2.41.0`
- RAGFlow exact runtime baseline: `infiniflow/ragflow@v0.27.2`
- Candidate B F1 closure: `docs/evidence/GBAP_TWENTY_AI_CANDIDATE_B_V241_F1_CLOSURE_2026-09-21.md`
- Candidate B F2 closure: `docs/evidence/GBAP_TWENTY_AI_CANDIDATE_B_V241_F2_CLOSURE_2026-09-21.md`
- GBAP baseline before real bake-off implementation: `d5b53270e8ceb22119f9577c43443a5c64e5ca79`

## 0. Purpose

This authority defines the real same-task comparison between the two mature upstream AI runtimes already admitted for evaluation.

It does **not** select PRIMARY. It does **not** authorize Production, real-company generative egress, AI writes, public MCP, durable AI memory or multi-agent execution.

Permanent rule:

```text
ASSEMBLY FIRST
REUSE FIRST
INTEGRATE FIRST
BUILD LAST
```

## 1. Candidate A — RAGFlow v0.27.2

RAGFlow already owns the Agent loop and native Knowledge Retrieval runtime.

The exact public Agent execution surface remains:

```text
POST /api/v1/agentbots/<agent_id>/completions
```

The existing thin GBAP connector remains:

```text
providers/ragflow-adapter/server.mjs
contract = gbap.ai-runtime.ragflow.v1
```

No GBAP generic Agent loop, planner, memory framework or model-provider framework is added.

### 1.1 Security finding: do not force unsafe tool symmetry

Exact RAGFlow v0.27.2 source proves that both external-MCP registration and the generic Invoke component enforce SSRF protection. Private/internal URLs are intentionally blocked by that upstream safety boundary.

Therefore the bake-off does **not**:

- weaken RAGFlow SSRF guards;
- expose a public GBAP MCP endpoint;
- publish the internal GBAP Tool Gateway merely to make the candidates look symmetric;
- give RAGFlow a privileged service identity that bypasses employee authorization.

Candidate A instead runs a temporary RAGFlow Agent whose only tool is native `Retrieval`, bound to a temporary synthetic dataset admitted for that test identity.

Each temporary Agent/dataset is deleted in the same worker `finally` path.

### 1.2 Candidate A evidence surface

Worker:

`providers/ragflow-adapter/ai-runtime-bakeoff-worker.mjs`

For each admitted identity it:

1. creates a temporary synthetic/non-company RAGFlow dataset through the existing Knowledge adapter;
2. ingests the identity-specific witness;
3. waits for READY;
4. creates a temporary RAGFlow Agent with native Retrieval;
5. executes the assigned same-task prompts;
6. records output, references and latency;
7. removes the temporary Agent and dataset.

This is test-fixture lifecycle only. It does not create a permanent product Agent.

## 2. Candidate B — Twenty v2.41.0

Candidate B E1/E2/F1/F2 are already PASS / CLOSED.

F1 proved real mapped-employee execution of the installed GBAP Knowledge tool.

F2 proved:

```text
unmapped employee                    DENY
disabled employee                    DENY
manager own RESTRICTED Knowledge     ALLOW
manager cross Knowledge              DENY
user own RESTRICTED Knowledge        ALLOW
user cross Knowledge                 DENY
negative citation/context leakage    NONE
temporary fixtures                   CLEANED
```

These gates are prerequisites, not bake-off steps. They must not be rerun merely because the bake-off is executed.

### 2.1 Correct full-runtime execution surface

Twenty v2.41 exact source confirms that the employee-scoped full AI runtime is **AI Chat**:

```text
createChatThread
-> sendChatMessage(... modelId ...)
-> chatMessages
-> chatThread usage/credits
-> deleteChatThread
```

This path is guarded by the normal workspace/user identity and AI permission context.

The bake-off therefore does **not** use application-context `runAgent` as a substitute for employee execution, and does **not** treat direct `execute_tool` calls as the Candidate B runtime.

Worker:

`providers/twenty-adapter/twenty-ai-v241-bakeoff-worker.mjs`

It logs in through the existing deterministic mapped employee bridge, verifies Twenty identity claims, uses person-scoped AI Chat, captures tool trace / latency / token / credit evidence, and deletes every temporary chat thread.

## 3. Same-task data and authorization design

The real bake-off uses only synthetic/non-company evidence.

Two existing enabled UAT employees are used:

```text
substrate-manager
substrate-user
```

The Windows one-shot creates two canonical RESTRICTED synthetic Knowledge collections with subject-specific ACLs and prompt-injection trap text.

Candidate B sees those collections through the already-proven live GBAP Knowledge tool and canonical ACL chain.

Candidate A receives an identity-specific temporary RAGFlow dataset containing the same synthetic witness that the canonical gate admitted for that identity. This preserves the authorization outcome without bypassing RAGFlow's SSRF protection.

For the CRM + Knowledge task, the same read-only synthetic CRM context is supplied to both candidates. No real CRM mutation and no real-company generative egress is admitted.

## 4. Fixed task set

Authority:

`tests/substrate/ai-runtime-bakeoff-scenarios.json`

Schema: `2`.

Required scenarios:

1. CRM + Knowledge analysis.
2. Grounded multilingual Knowledge answer with numeric facts.
3. Draft business action without execution.
4. Permission isolation under two identities.
5. Governed tool-selection stress.

The one-shot plan expands permission isolation into one execution for each identity, so the five logical scenarios produce six measured runtime executions.

Every execution has deterministic required/forbidden markers. Retrieved prompt-injection text contains a unique trap marker; returning that trap is a failure.

## 5. Same-model rule

The bake-off must not silently select the platform's long-term `gbap.generative.v1` provider.

The runner therefore requires:

```text
GBAP_BAKEOFF_RAGFLOW_MODEL_ID
GBAP_BAKEOFF_TWENTY_MODEL_ID
GBAP_BAKEOFF_MODEL_FINGERPRINT
```

The two runtime IDs may differ in vendor-specific syntax, but the operator must explicitly assert that they represent the same logical model through one shared fingerprint.

This is an experiment binding, not a persistent provider selection.

A read-only inventory command is provided:

`infrastructure/local-uat/Get-GBAP-AiRuntimeModelInventory.ps1`

It reads:

- RAGFlow `GET /api/v1/models?type=chat`;
- Twenty v2.41 `getAdminAiModels`.

It changes no model configuration and selects no PRIMARY runtime.

## 6. One-shot real Windows execution

Orchestrator:

`infrastructure/local-uat/Invoke-GBAP-AiRuntimeBakeoff.ps1`

The governed sequence is:

```text
exact-main / clean-worktree preflight
-> Local-UAT health checks
-> Knowledge readiness
-> Twenty LOCAL logic-function admission check
-> existing employee mapping readiness
-> create two canonical synthetic RESTRICTED Knowledge witnesses
-> build exact plan
-> Candidate A complete run
-> Candidate B complete run
-> deterministic evidence evaluation
-> finally clean canonical synthetic witnesses
```

Candidate A independently cleans its temporary RAGFlow Agents/datasets. Candidate B independently cleans its temporary Twenty chat threads.

No accepted F2 fixture is reused or reopened.

## 7. Evidence evaluator

`tests/substrate/ai-runtime-bakeoff-evaluate.mjs`

The evaluator records facts rather than predeclaring a winner.

It checks:

- required output fragments;
- forbidden cross-identity / prompt-injection fragments;
- grounding/reference evidence;
- forbidden mutation-like tool usage;
- mean latency;
- Twenty token/credit totals when exposed;
- cleanup integrity.

Output gate:

```text
AI_RUNTIME_REAL_BAKEOFF_EVIDENCE
PRIMARY = NOT SELECTED
Production = NOT AUTHORIZED
```

PRIMARY selection is a separate decision after the real Windows evidence is reviewed and accepted.

## 8. Frozen boundaries

Still forbidden:

- browser direct access to upstream Agent administration;
- public/external GBAP MCP exposure;
- weakening RAGFlow SSRF controls;
- Twenty WORKFLOWS privilege as an AI workaround;
- AI create/update/delete/send/publish tools;
- autonomous mutation;
- real-company generative egress without a separate gate;
- persistent model-provider selection from this experiment;
- PRIMARY selection before accepted evidence;
- Production authorization.

## 9. Next legal sequence

```text
1. exact-head focused CI for real bake-off tooling
2. merge tooling PR
3. read-only model inventory on exact current main
4. bind one common logical model if available
5. one real Windows bake-off execution
6. review measured evidence
7. select PRIMARY + SPECIALIST roles from accepted evidence
8. write selection/closure authority
9. only then continue the unified employee AI product surface
```

Production remains **NOT AUTHORIZED**.
