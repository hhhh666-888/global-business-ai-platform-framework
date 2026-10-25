# GBAP AI Runtime Shared Model Admission Gate v0.3

Status: **IMPLEMENTATION CANDIDATE / LOCAL-UAT BAKE-OFF ONLY / PRIMARY NOT SELECTED / PRODUCTION NOT AUTHORIZED**

Date: 2026-09-21

Supersedes: `GBAP_AI_RUNTIME_SHARED_MODEL_ADMISSION_GATE_v0.2.md` for the active Shared Model Admission contract. v0.2 remains immutable historical evidence.

## 0. REOPEN -> evidence -> correction -> RE-FREEZE

```text
REOPEN trigger
  The first real Candidate A execution reached RAGFlow v0.27.2 Agent runtime after:
  - DeepSeek synthetic provider evaluation PASS
  - same-model RAGFlow/Twenty admission PASS
  - fresh GBAP admin authorization PASS
  - two synthetic RESTRICTED Knowledge witnesses READY
  but Candidate A failed before Candidate B executed.

Source evidence
  RAGFlow v0.27.2 resolves Agent model capability from model metadata.
  LLM4Tenant uses model_config.is_tools with a false default.
  LLMBundle.bind_tools() does not bind Retrieval/tools when is_tools is false.
  RAGFlow's provider-instance API supports model_info[].extra.is_tools and its
  instance-model read surface returns features/extra that can prove that flag.
  A second source audit also proved that the generic OpenAI-API-Compatible Base
  path is the wrong DeepSeek Agent adapter for this bake-off: it does not retain
  DeepSeek reasoning_content across multi-round tool calls, while RAGFlow v0.27.2
  already ships a native DeepSeek LiteLLM adapter that does.

Gap
  v0.2 admitted the DeepSeek model as chat-only metadata:
  model_type=["chat"] + max_tokens.
  It did not set or prove extra.is_tools=true.
  Therefore v0.2 proved a shared chat model, but not the tool-calling capability
  that Candidate A's RAGFlow Agent + native Retrieval path requires.

Decision
  A model is not eligible for this runtime bake-off merely because both runtimes
  can inventory it as chat-capable. RAGFlow must additionally prove tool-calling
  capability before any temporary bake-off fixture is created.

Correction
  - register the dedicated RAGFlow model with extra.is_tools=true;
  - read the model back through the official provider-instance model API;
  - require an explicit RAGFLOW_SHARED_MODEL_TOOL_CAPABILITY PASS;
  - keep `/api/v1/models` as the generic model existence/identity inventory only;
  - enrich the governed Local-UAT inventory with a second read-only official provider-instance model call because `/api/v1/models` does not expose `features/extra/is_tools`;
  - expose the enriched `toolCalling` result in the governed RAGFlow model inventory;
  - require admission evidence ragflow.toolCalling=true;
  - require live pre-bake-off inventory toolCalling=true;
  - bind the dedicated RAGFlow model through the native DeepSeek provider rather
    than the generic OpenAI-API-Compatible provider;
  - freeze the shared comparison mode to DeepSeek thinking mode:
    Candidate A explicit thinking=enabled, Candidate B provider-default thinking;
  - record the thinking controls in the machine-readable bake-off plan/evidence;
  - surface Candidate A/B worker output directly on failure.

RE-FREEZE condition
  focused exact-head CI PASS + one real Windows v0.3 re-admission before the
  next bounded runtime bake-off.
```

The old wrapper did not print Candidate A's captured worker output, so this gate does **not** claim the missing `is_tools` flag is the only possible runtime defect. It is a source-proven admission defect that is sufficient to invalidate the v0.2 Candidate A binding. v0.3 also makes any remaining Candidate A failure directly observable.

## 1. Boundaries unchanged

```text
candidate model                      DeepSeek official API / deepseek-flash
transport                            OpenAI-compatible
RAGFlow retrieval embedding          Alibaba-NLP/gte-multilingual-base / unchanged
real company Knowledge               NOT AUTHORIZED
test data                            synthetic/non-company only
AI writes                            NOT ENABLED
MCP                                  NOT EXPOSED
multi-agent                          NOT ENABLED
durable AI memory                    NOT ENABLED
generativeProviderUatSelected        false
PRIMARY runtime selected             false
Production authorized                false
```

This change does not reopen the embedding decision, RAGFlow v0.27.2 pin, Twenty v2.41.0 authority, Knowledge ACLs, identity authority, or provider-neutral `gbap.generative.v1`.

## 2. Candidate contract

Default bounded candidate:

```text
provider endpoint            https://api.deepseek.com
model                        deepseek-flash
RAGFlow provider             DeepSeek
RAGFlow adapter              native DeepSeek / LiteLLM
RAGFlow provider base URL    https://api.deepseek.com
RAGFlow instance             gbap-bakeoff-deepseek-flash
Twenty provider              gbap-bakeoff-deepseek / @ai-sdk/openai-compatible
shared thinking mode         thinking
Candidate A thinking control explicit enabled
Candidate B thinking control provider default
scope                        LOCAL_UAT_BAKEOFF_ONLY
```

The API key still enters only through `GBAP_GENERATIVE_CANDIDATE_API_KEY` and must never be printed, committed, or passed as a CLI argument.

The logical model fingerprint remains derived from the provider-neutral OpenAI-compatible transport identity + canonical endpoint + model name. Choosing RAGFlow's native DeepSeek adapter does not change the logical model or the Twenty binding; it only selects the RAGFlow adapter that correctly implements DeepSeek's tool/reasoning protocol. The RAGFlow provider instance must preserve the official canonical base URL `https://api.deepseek.com`; v0.27.2 only auto-normalizes VLLM URLs, not DeepSeek URLs, so this gate does not append `/v1`.

The bake-off comparison freezes `modelThinkingMode=thinking`. Candidate A explicitly sets RAGFlow Agent `thinking=enabled`; Candidate B uses the DeepSeek provider default through Twenty's custom OpenAI-compatible provider. This avoids comparing different reasoning modes while preserving each runtime's supported/native integration surface.

## 3. RAGFlow tool-capability admission

RAGFlow configuration must use its official provider/instance API and create the target model with:

```json
{
  "model_name": "deepseek-flash",
  "model_type": ["chat"],
  "extra": {
    "is_tools": true
  }
}
```

After creation, the gate MUST read:

```text
GET /providers/{provider}/instances/{instance}/models
```

and find the exact target model with either:

```text
features contains is_tools
or
extra.is_tools == true
```

Otherwise admission fails and the bounded configuration is rolled back.

Required machine-readable proof:

```text
RAGFLOW_SHARED_MODEL_TOOL_CAPABILITY = PASS
AI_RUNTIME_SHARED_MODEL_RAGFLOW_TOOL_CALLING=true
```

## 4. Admission acceptance

A v0.3 PASS requires all earlier v0.2 controls plus the new runtime capability proof:

```text
synthetic DeepSeek provider evaluation        PASS
Twenty exact shared model                     PRESENT / ADMIN ENABLED
RAGFlow exact shared model                    PRESENT / ENABLED
RAGFlow provider                              DeepSeek
RAGFlow adapter                               RAGFLOW_NATIVE_DEEPSEEK
RAGFlow shared model toolCalling              true
shared model thinking mode                    thinking
Candidate A thinking control                  explicit-enabled
Candidate B thinking control                  provider-default
same logical model fingerprint                MATCH
scope                                         LOCAL_UAT_BAKEOFF_ONLY
real company Knowledge authorized             false
generative provider UAT-selected              false
PRIMARY runtime selected                      false
Production authorized                         false
```

Evidence remains:

`infrastructure/local-uat/.runtime/ai-runtime-shared-model-admission.json`

and must now include:

```json
{
  "ragflow": {
    "toolCalling": true
  }
}
```

## 5. Pre-bake-off fail-closed check

`Invoke-GBAP-AiRuntimeBakeoff.ps1` must refuse execution before creating temporary identities or Knowledge fixtures unless both are true:

```text
admission evidence ragflow.providerName == DeepSeek
admission evidence ragflow.adapter == RAGFLOW_NATIVE_DEEPSEEK
admission evidence ragflow.toolCalling == true
live RAGFlow inventory providerName == DeepSeek
live RAGFlow inventory toolCalling == true
bake-off plan modelThinkingMode == thinking
```

The generic RAGFlow `GET /api/v1/models?type=chat` surface is intentionally **not** used to infer tool capability: RAGFlow v0.27.2's implementation does not return model `extra`, `features`, or `is_tools`. `Get-GBAP-AiRuntimeModelInventory.ps1` therefore enriches that generic inventory through a second read-only provider-instance model call using the already-installed Local-UAT RAGFlow administrator secret. No database read/write shortcut is used.

The wrapper must print Candidate A or Candidate B captured output before throwing if either runtime worker fails.

## 6. Real Windows evidence that triggered v0.3

On main `72f1cdb313ba176f7507f0bd5d5080e20e6e3b7d`, the bounded run proved:

```text
DeepSeek shared-model re-admission            PASS
same fingerprint                              sha256:e59a6c79ea39184ae3ac421aa03ada7d180de00e5589a4e8e91011267ee982fa
shared model live inventory                   PASS
fresh substrate-admin preflight               PASS
temporary Twenty bridge identities            READY
synthetic RESTRICTED Knowledge witnesses       READY
Candidate A RAGFlow Agent execution            FAIL
Candidate B                                   NOT RUN
PRIMARY selected                              false
Production authorized                         false
```

The wrapper entered its governed `finally` cleanup path after Candidate A failed. No accepted bake-off evidence exists from that run.

## 7. Next legal action

After this v0.3 correction passes focused CI and is merged:

```text
one real Windows v0.3 shared-model admission
-> prove RAGFlow toolCalling=true
-> one real Candidate A vs Candidate B bake-off
-> deterministic evidence review
-> separate PRIMARY / SPECIALIST closure decision
```

No PRIMARY or Production decision is implied by v0.3.
