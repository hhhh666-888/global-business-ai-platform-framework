# GBAP AI Runtime Shared Model Admission Gate v0.1

Status: **IMPLEMENTATION CANDIDATE / LOCAL-UAT BAKE-OFF ONLY / PRIMARY NOT SELECTED / PRODUCTION NOT AUTHORIZED**

Date: 2026-09-21

## 1. Purpose

The real Windows read-only inventory on main `8c1ed4c479969660e050904d9dafb66e56ce1468` proved that both comparison runtimes currently have no generative/chat model configured:

- RAGFlow v0.27.2: `models=[]`
- Twenty v2.41.0: `models=[]`, `defaultModelByTier=[]`

This is a valid empty baseline. It means the same-task runtime bake-off cannot start until one shared logical model has passed the existing provider-neutral synthetic admission suite and has been configured in both runtimes.

This gate exists only to create that controlled comparison variable. It does not choose a persistent `gbap.generative.v1` provider and does not select the PRIMARY AI runtime.

## 2. Frozen boundaries

The gate MUST preserve all of the following:

```text
RAGFlow retrieval embedding          Alibaba-NLP/gte-multilingual-base / unchanged
real company Knowledge              NOT AUTHORIZED for provider admission
provider live evaluation            synthetic/non-company only
AI write tools                      NOT ENABLED
MCP                                 NOT EXPOSED
PRIMARY AI runtime                  NOT SELECTED
Production                          NOT AUTHORIZED
Knowledge runtime.lock authorization generativeLlmAuthorized remains false
```

A PASS from this gate means only:

> one real provider/model is admitted and configured for the bounded Local-UAT runtime bake-off.

It does **not** mean `UAT_SELECTED` for the permanent generative provider decision.

## 3. Candidate and secret contract

The default model is the first live-test candidate already frozen by the Knowledge generative-provider evaluation:

```text
provider family     Alibaba Cloud Model Studio
model               qwen3.7-flash
transport           OpenAI-compatible chat/completions
```

The endpoint remains an explicit operator input because regional Model Studio endpoints may differ.

The real provider secret MUST enter only through:

```text
GBAP_GENERATIVE_CANDIDATE_API_KEY
```

Rules:

- never commit the API key;
- never print it;
- never put it in a GitHub Action secret for this Local-UAT gate;
- never pass it as a command-line argument;
- Twenty stores the admitted provider config only in the ignored Local-UAT `.env`;
- RAGFlow stores it through its own official provider/instance configuration surface.

## 4. Gate sequence

Authority script:

`infrastructure/local-uat/Admit-GBAP-AiRuntimeSharedModel.ps1`

Execution order is fixed:

```text
1. exact-current-main + clean working tree
2. require ephemeral candidate API key
3. require empty pre-existing Twenty AI_PROVIDERS
4. run existing Test-GBAP-Generative-Provider-Candidate.ps1
5. require GENERATIVE_CANDIDATE_EVALUATION=PASS
6. require explicit -AuthorizeConfigure before any runtime mutation
7. write one custom @ai-sdk/openai-compatible provider to ignored Local-UAT .env
8. recreate only twenty-server, wait healthy, recreate twenty-worker
9. prove expected Twenty composite model ID exists in /client-config
10. create one dedicated RAGFlow OpenAI-API-Compatible provider instance via official API
11. rerun governed read-only dual-runtime inventory
12. require the same model in both runtimes
13. derive and persist one model fingerprint
14. emit bake-off-only admission evidence
```

## 5. Twenty configuration

Twenty v2.41 supports custom providers through `AI_PROVIDERS`.

The gate writes one dedicated provider:

```text
provider name     gbap-bakeoff-modelstudio
npm               @ai-sdk/openai-compatible
baseUrl           explicit admitted provider endpoint
model             qwen3.7-flash by default
expected modelId  gbap-bakeoff-modelstudio/qwen3.7-flash
```

`docker-compose.yml` exposes `AI_PROVIDERS` to the shared server/worker environment. The repository default is `{}`, preserving the existing no-model state until the gate is explicitly authorized.

No Twenty database is edited directly.

## 6. RAGFlow configuration

RAGFlow v0.27.2 is configured only through its official provider API using the already installed Local-UAT administrator identity.

Default bounded instance:

```text
provider   OpenAI-API-Compatible
instance   gbap-bakeoff-qwen37
model      qwen3.7-flash
type       chat
```

The gate refuses an existing instance with the same dedicated name rather than silently overwriting it.

The existing HuggingFace/GTE embedding provider is not touched.

## 7. Model fingerprint

After both runtime inventories prove the model, the gate derives:

```text
sha256(openai-compatible | normalized provider base URL | model name)
```

The fingerprint is not a secret. It proves both candidates were intentionally bound to one admitted logical model.

Evidence path:

`infrastructure/local-uat/.runtime/ai-runtime-shared-model-admission.json`

The bake-off orchestrator may consume this evidence automatically when explicit model-binding environment variables are absent.

## 8. Rollback

If any mutation-stage assertion fails:

- the original Local-UAT `.env` is restored byte-for-byte in memory;
- `twenty-server` and `twenty-worker` are recreated from the restored configuration;
- the dedicated RAGFlow instance created by this gate is deleted through the official API;
- incomplete admission evidence is removed;
- cleanup failures are surfaced and never hidden.

The gate does not delete generic RAGFlow provider metadata and does not touch any unrelated model instance.

After a real bake-off starts, `Invoke-GBAP-AiRuntimeBakeoff.ps1` owns lifecycle closure. Its `finally` path invokes `infrastructure/local-uat/Remove-GBAP-AiRuntimeSharedModel.ps1` after the temporary Twenty chats/roles, Knowledge witnesses and test identities are cleaned. The cleanup tool deletes only the dedicated RAGFlow instance, removes the admitted Twenty `AI_PROVIDERS` entry from local `.env`, recreates the Twenty server/worker back on the default no-model baseline, and removes the transient admission binding. The durable bake-off evidence remains.

## 9. Acceptance

A successful run must emit all of:

```text
AI_RUNTIME_SHARED_MODEL_ADMISSION_RESULT=PASS
AI_RUNTIME_SHARED_MODEL_SCOPE=LOCAL_UAT_BAKEOFF_ONLY
AI_RUNTIME_SHARED_MODEL_REAL_COMPANY_KNOWLEDGE_AUTHORIZED=false
AI_RUNTIME_SHARED_MODEL_GENERATIVE_PROVIDER_UAT_SELECTED=false
AI_RUNTIME_SHARED_MODEL_PRIMARY_RUNTIME_SELECTED=false
AI_RUNTIME_SHARED_MODEL_PRODUCTION_AUTHORIZED=false
```

The evidence must contain exact RAGFlow and Twenty runtime model IDs plus one shared model fingerprint.

## 10. Next legal action after PASS

```text
shared model admission PASS
-> one real Windows Invoke-GBAP-AiRuntimeBakeoff.ps1 -AuthorizeExecute
-> deterministic evidence review
-> separate PRIMARY/SPECIALIST closure decision
```

No runtime selection is implied before that final evidence review.
