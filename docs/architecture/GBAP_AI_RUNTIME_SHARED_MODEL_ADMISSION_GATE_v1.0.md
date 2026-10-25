# GBAP AI Runtime Shared Model Admission Gate v1.0

Status: **IMPLEMENTATION CANDIDATE / LOCAL-UAT BAKE-OFF ONLY / PRIMARY NOT SELECTED / PRODUCTION NOT AUTHORIZED**

Date: 2026-09-21

Supersedes `GBAP_AI_RUNTIME_SHARED_MODEL_ADMISSION_GATE_v0.9.md` for interrupted-run crash recovery. v0.9 remains immutable historical evidence.

## 0. REOPEN trigger

The first post-merge Windows v0.9 execution was interrupted by a host shutdown and then restarted. On restart:

```text
source baseline                  PASS
tooling contract                 PASS
pre-bakeoff cleanup              PASS / ALREADY_MISSING
shared-model admission           BLOCKED
reason                           Existing Twenty AI_PROVIDERS configuration is non-empty
```

The interruption exposed a crash-consistency gap rather than a model/provider failure.

The v0.9 sequence could mutate Twenty `AI_PROVIDERS` and recreate the Twenty runtime before the durable admission evidence file was written. If Windows stopped in that interval, the next `Remove-GBAP-AiRuntimeSharedModel.ps1 -AllowMissing` saw no admission evidence and returned early, leaving the exact bounded bake-off provider behind.

## 1. Root cause

Old lifecycle:

```text
synthetic provider evaluation PASS
-> write Twenty AI_PROVIDERS
-> recreate Twenty
-> configure RAGFlow
-> write admission evidence
```

Old cleanup eligibility:

```text
admission evidence exists
-> bounded cleanup

admission evidence missing + -AllowMissing
-> return PASS immediately
```

Therefore a power loss between the Twenty mutation and admission-evidence write could create an orphaned bounded provider state.

## 2. v1.0 crash-recovery contract

Before the first mutable runtime action, the admission script must write a secret-free recovery journal:

```text
ai-runtime-shared-model-recovery.json
gate                         AI_RUNTIME_SHARED_MODEL_RECOVERY
scope                        LOCAL_UAT_BAKEOFF_ONLY
Twenty provider/model        exact bounded names
RAGFlow provider/instance    exact bounded names
PRIMARY                      false
Production                   false
API key                      NOT STORED
```

The journal must be durable before `Set-KnowledgeDotEnvValues ... AI_PROVIDERS`.

Successful normal cleanup removes both:

```text
ai-runtime-shared-model-admission.json
ai-runtime-shared-model-recovery.json
```

If rollback itself fails, the recovery journal remains for the next bounded recovery attempt.

## 3. Legacy interrupted-state recovery

v1.0 must also recover the already-existing pre-journal v0.9 orphan.

When admission evidence and recovery journal are both absent, `-AllowMissing` may recover only when the current Twenty `AI_PROVIDERS` is exactly the reserved GBAP bake-off provider shape:

```text
provider          gbap-bakeoff-deepseek
npm               @ai-sdk/openai-compatible
baseUrl           https://api.deepseek.com
model             deepseek-flash
exact providers   1
exact models      1
```

Anything else remains fail-closed.

Unknown, mixed, or user-managed non-empty provider configuration must never be removed or overwritten automatically.

## 4. RAGFlow interrupted-instance recovery

If the exact stale Twenty bake-off provider proves an interrupted prior run, RAGFlow preflight may remove only the exact reserved stale instance:

```text
provider          DeepSeek
instance          gbap-bakeoff-deepseek-flash
```

The instance is then re-listed and must be absent before a fresh instance is created.

No other provider or instance may be deleted.

## 5. Frozen v0.9 Candidate B safety contract remains unchanged

All v0.9 role-state, catalog, execution-trace, and cleanup boundaries remain in force:

```text
temporary role permission flags       exactly [AI]
positive object grants                0
DATABASE_CRUD visibility              0
dangerous permission-gated tools      0
actual mutation-like tool executions  0
real company Knowledge                NOT AUTHORIZED
AI writes                             NOT ENABLED
external MCP                          NOT EXPOSED
PRIMARY                               NOT SELECTED
Production                            NOT AUTHORIZED
```

The Candidate A/B runtime comparison itself is not redesigned by v1.0.

## 6. RE-FREEZE condition

```text
focused exact-head CI PASS
-> merge
-> source-only Windows fast-forward
-> interrupted-state bounded cleanup PASS
-> one bounded Shared Model admission PASS
-> Knowledge witnesses READY
-> Candidate A PASS
-> Candidate B role-state proof PASS
-> Candidate B catalog boundary PASS
-> Candidate B AI Chat scenarios PASS
-> actual mutation-like tool executions = 0
-> Candidate B temporary role cleanup PASS
-> evaluator evidence PASS
-> all bounded fixtures cleanup PASS
-> deterministic PRIMARY / SPECIALIST closure
```

No PRIMARY or Production decision is implied by v1.0.
