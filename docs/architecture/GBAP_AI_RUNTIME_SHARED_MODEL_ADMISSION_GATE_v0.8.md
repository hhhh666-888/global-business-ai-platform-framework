# GBAP AI Runtime Shared Model Admission Gate v0.8

Status: **IMPLEMENTATION CANDIDATE / LOCAL-UAT BAKE-OFF ONLY / PRIMARY NOT SELECTED / PRODUCTION NOT AUTHORIZED**

Date: 2026-09-21

Supersedes `GBAP_AI_RUNTIME_SHARED_MODEL_ADMISSION_GATE_v0.7.md` for the active real-bake-off output transport contract. v0.7 remains immutable historical evidence.

## 0. REOPEN trigger

Real Windows v0.7 on exact main `cf3c3b415f1b9f0236df466f03cecc36dcde771a` passed:

```text
source baseline                              PASS
Windows PowerShell parser                    PASS
PowerShell collection binder guard           PASS
focused tooling contract                     PASS
clean model baseline                         PASS
DeepSeek synthetic provider evaluation       4/4 PASS
Twenty shared-model registration             PASS
RAGFlow native DeepSeek registration         PASS
RAGFlow toolCalling                          true
same-model live inventory                     PASS
fresh substrate-admin auth                    PASS
Knowledge queue idle                          PASS
temporary Twenty bridge identities            READY
second Knowledge queue check                  PASS
synthetic witness A                           READY
synthetic witness B                           READY
Candidate A runtime execution                 PASS
Candidate A cleanup                           PASS
```

Candidate B did not start because the Windows wrapper could not parse Candidate A's captured gate:

```text
Machine-readable gate JSON not found: AI_RUNTIME_BAKEOFF_CANDIDATE_A
```

The current-run Candidate A transcript visibly contained a gate object with:

```text
gate    AI_RUNTIME_BAKEOFF_CANDIDATE_A
result  PASS
```

## 1. Root cause

The Candidate A worker emits UTF-8 JSON to native stdout. Windows PowerShell 5.1 captures that native stream through the host code page before the wrapper writes it back as UTF-8.

The v0.7 transcript contained extensive mojibake inside multilingual model content. Byte-level review of the captured Candidate A line proved the reconstructed JSON was syntactically invalid at approximately byte/character 48 KiB even though the original Node worker used `JSON.stringify`.

This is an encoding round-trip defect:

```text
Node/Docker UTF-8 stdout
-> Windows PowerShell 5.1 native decoding / host code page
-> .NET string
-> UTF-8 re-encode
-> damaged JSON escape sequences / mojibake
```

The failure is not a RAGFlow, DeepSeek, retrieval, ACL, or Candidate A execution failure.

Candidate B and final evaluator outputs could suffer the same defect if allowed to use the same transport.

## 2. v0.8 decision

Large machine-readable gates must bypass Windows PowerShell native stdout decoding entirely.

Candidate A, Candidate B, Candidate B cleanup-only, and the deterministic evaluator now support:

```text
GBAP_BAKEOFF_GATE_OUTPUT_PATH
```

Each Node producer:

```text
JSON.stringify(gate)
-> writeFileSync(outputPath, json + "\n", "utf8")
-> optional console.log(json) for human diagnostics only
```

The wrapper pre-creates and bind-mounts the host gate file into the container. The UTF-8 file written by Node becomes the sole machine-readable authority.

PowerShell may capture stdout/stderr for diagnostics, but must not use that captured text to reconstruct or persist the gate.

## 3. Direct gate files

```text
Candidate A
  host: .runtime/ai-runtime-bakeoff-candidate-a.txt
  container: /run/gbap-bakeoff/gate-output.json

Candidate B
  host: .runtime/ai-runtime-bakeoff-candidate-b.txt
  container: /run/gbap-bakeoff/gate-output.json

Candidate B cleanup-only
  host: .runtime/ai-runtime-bakeoff-candidate-b-cleanup.json
  container: /run/gbap-bakeoff/gate-output.json

Evaluator
  host: .runtime/ai-runtime-bakeoff-evidence.json
  container: /run/gbap-bakeoff/evidence.json
```

The existing Node gate extractor validates those files and returns only a bounded scalar summary to PowerShell.

## 4. Frozen boundaries unchanged

```text
DeepSeek model                         deepseek-flash
model fingerprint                      unchanged
RAGFlow provider                       DeepSeek
RAGFlow adapter                        RAGFLOW_NATIVE_DEEPSEEK
RAGFlow toolCalling                    true
Candidate A endpoint                   /api/v1/agents/chat/completions
Candidate B                            Twenty v2.41 AI Chat
Knowledge queue                        read-only for existing/company work
Knowledge maxConcurrentTasks           1
Knowledge maxConcurrentChunkBuilders   1
synthetic witness retry                max one / current run only
test data                              synthetic/non-company only
AI writes                              NOT ENABLED
external MCP                           NOT EXPOSED
multi-agent                            NOT ENABLED
durable AI memory                      NOT ENABLED
PRIMARY                                NOT SELECTED
Production                             NOT AUTHORIZED
```

## 5. Regression contract

Focused CI must prove:

```text
all three Node gate producers use writeFileSync(..., "utf8")
Candidate A supports GBAP_BAKEOFF_GATE_OUTPUT_PATH
Candidate B normal + cleanup support GBAP_BAKEOFF_GATE_OUTPUT_PATH
evaluator supports GBAP_BAKEOFF_GATE_OUTPUT_PATH
wrapper bind-mounts direct gate files
wrapper validates files with Read-BakeoffGateFile
wrapper does not contain Require-LastGateJson
wrapper does not write Candidate A/B files from $candidate*.Output
cleanup-only also uses a direct gate file
```

## 6. RE-FREEZE condition

```text
focused exact-head CI PASS
-> merge
-> source-only Windows fast-forward to exact merged main
-> parser/tooling/direct-gate contract PASS
-> one bounded Shared Model admission
-> queue-idle preflight PASS
-> synthetic A READY
-> synthetic B READY
-> Candidate A direct gate PASS
-> Candidate B direct gate PASS
-> evaluator direct evidence PASS
-> bounded cleanup PASS
-> deterministic PRIMARY / SPECIALIST closure
```

No PRIMARY or Production decision is implied by v0.8.
