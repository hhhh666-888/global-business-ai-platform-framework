# GBAP AI Runtime Shared Model Admission Gate v0.7

Status: **IMPLEMENTATION CANDIDATE / LOCAL-UAT BAKE-OFF ONLY / PRIMARY NOT SELECTED / PRODUCTION NOT AUTHORIZED**

Date: 2026-09-21

Supersedes `GBAP_AI_RUNTIME_SHARED_MODEL_ADMISSION_GATE_v0.6.md` for the active bake-off execution wrapper. v0.6 remains immutable historical evidence.

## 0. REOPEN trigger

Real Windows v0.6 on exact main `1b1268e29e6c942c78cc1739acba810c76add9ba` passed:

```text
source-only update scope                    PASS
Windows PowerShell parser                   PASS
real bake-off tooling contract              PASS
clean model baseline                        PASS
DeepSeek synthetic provider suite           4/4 PASS
Twenty shared model registration            PASS
RAGFlow native DeepSeek registration         PASS
RAGFlow toolCalling                          true
same-model live inventory                    PASS
fresh substrate-admin auth                   PASS
stale candidate transcript cleanup           PASS
```

The run then failed before any temporary employee identity, synthetic Knowledge witness, Candidate A, or Candidate B was created.

Exact failure:

```text
[GBAP AI Runtime Bake-off] Waiting for the shared single-task Knowledge ingestion queue to become idle
Argument types do not match
Invoke-GBAP-AiRuntimeBakeoff.ps1:141
return @($result)
```

Candidate A and Candidate B both reported NOT STARTED and fail-safe shared-model cleanup passed.

## 1. Root cause

The v0.6 queue collector used:

```powershell
$result = New-Object System.Collections.Generic.List[object]
...
return @($result)
```

Windows PowerShell 5.1 has a runtime binder defect in this exact shape: wrapping a `List[object]` created through `New-Object` in the array-subexpression operator can throw `System.ArgumentException: Argument types do not match`, including for an empty list.

This is a PowerShell runtime-collection bug. It is not:

```text
a DeepSeek failure
a RAGFlow failure
a Twenty failure
a Knowledge API failure
a queue-busy condition
a parser failure
an ACL failure
```

## 2. v0.7 correction

The queue collector now uses only a native PowerShell array:

```powershell
$result = @()
...
$result += [pscustomobject]@{ ... }
...
return $result
```

The problematic `New-Object System.Collections.Generic.List[object]` and `return @($result)` combination is forbidden by the focused bake-off tooling contract.

## 3. Runtime behavior unchanged

```text
existing/company Knowledge queue     read/status only
existing/company Knowledge retry     forbidden
existing/company Knowledge delete    forbidden
synthetic witness retry              max one / current run only
Knowledge maxConcurrentTasks         1 / unchanged
Knowledge maxConcurrentChunkBuilders 1 / unchanged
DeepSeek model                       deepseek-flash / unchanged
model fingerprint                    unchanged
RAGFlow adapter                      RAGFLOW_NATIVE_DEEPSEEK
RAGFlow toolCalling                  true
Candidate A execution                /api/v1/agents/chat/completions
Candidate B execution                Twenty v2.41 AI path
AI writes                            NOT ENABLED
external MCP                         NOT EXPOSED
PRIMARY                              NOT SELECTED
Production                           NOT AUTHORIZED
```

## 4. RE-FREEZE condition

```text
focused exact-head CI PASS
-> merge
-> source-only fast-forward on Windows
-> Windows parser + tooling contract PASS
-> one bounded Shared Model admission
-> queue-idle preflight executes without collection binder failure
-> synthetic witness A READY
-> synthetic witness B READY
-> Candidate A PASS
-> Candidate B PASS
-> evaluator evidence PASS
-> bounded cleanup PASS
-> deterministic PRIMARY / SPECIALIST closure
```
