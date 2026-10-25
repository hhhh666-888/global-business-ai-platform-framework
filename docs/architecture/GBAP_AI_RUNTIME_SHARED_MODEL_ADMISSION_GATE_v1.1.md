# GBAP AI Runtime Shared Model Admission Gate v1.1

Status: **IMPLEMENTATION CANDIDATE / LOCAL-UAT BAKE-OFF ONLY / PRIMARY NOT SELECTED / PRODUCTION NOT AUTHORIZED**

Date: 2026-09-21

Supersedes `GBAP_AI_RUNTIME_SHARED_MODEL_ADMISSION_GATE_v1.0.md` only for generative-provider pre-admission diagnostics and structured-output hardening. v1.0 remains immutable evidence of interrupted-state recovery.

## 0. REOPEN trigger

Real Windows v1.0 proved:

```text
source baseline                         PASS
tooling contracts                       PASS
legacy interrupted v0.9 recovery        PASS
bounded Twenty cleanup/recreate         PASS
DeepSeek synthetic provider admission   FAIL
visible diagnostic                      exit=1 only
```

The evaluator's machine-readable failure payload was emitted by Node before the wrapper failed, but Windows PowerShell native-error handling collapsed the child process output into `NativeCommandError`, hiding the actual per-case failure reason.

## 1. Model identity remains unchanged

The official DeepSeek API model identifier for DeepSeek V4.1-Flash remains:

```text
base URL     https://api.deepseek.com
model        deepseek-flash
endpoint     /chat/completions
```

v1.1 does not rename the model or switch providers.

## 2. Structured-output contract

The synthetic provider evaluator requires a deterministic JSON object containing:

```json
{"answer":"...","citations":["context-1"]}
```

v1.1 therefore sends the provider-native OpenAI-compatible JSON mode request:

```json
{"response_format":{"type":"json_object"}}
```

The grounded-answer and citation assertions remain unchanged.

## 3. Safe provider diagnostics

Every failed case must retain a machine-readable, secret-safe diagnosis:

```text
reason
providerError.status
providerError.type
providerError.code
providerError.message
```

Provider error text is bounded and any occurrence of the active API key is replaced with `[REDACTED]` before output.

Network failures and request timeouts are also converted into normal evaluation results rather than aborting before the final gate JSON.

## 4. Windows PowerShell capture

The admission wrapper must execute the child PowerShell evaluator with lossless stdout/stderr capture under a temporary `ErrorActionPreference=Continue`, normalize `ErrorRecord` objects to message text, and only then evaluate the exit code.

This prevents a non-zero child exit from discarding the preceding evaluator JSON.

## 5. Frozen safety boundaries unchanged

```text
real company Knowledge                NOT AUTHORIZED
AI writes                             NOT ENABLED
external MCP                          NOT EXPOSED
PRIMARY                               NOT SELECTED
Production                            NOT AUTHORIZED
```

Crash-recovery behavior from v1.0 and Candidate B role/catalog/tool-execution boundaries from v0.9 remain unchanged.

## 6. RE-FREEZE condition

```text
focused exact-head CI PASS
-> merge
-> source-only Windows fast-forward
-> rerun synthetic DeepSeek provider admission
-> inspect complete machine-readable result
-> if PASS continue the same A/B bake-off
-> if FAIL repair only the evidenced provider/API/quality/latency cause
```

No PRIMARY or Production decision is implied by v1.1.
