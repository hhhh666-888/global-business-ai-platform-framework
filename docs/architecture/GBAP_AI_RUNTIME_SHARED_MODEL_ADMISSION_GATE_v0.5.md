# GBAP AI Runtime Shared Model Admission Gate v0.5

Status: **IMPLEMENTATION CANDIDATE / LOCAL-UAT BAKE-OFF ONLY / PRIMARY NOT SELECTED / PRODUCTION NOT AUTHORIZED**

Date: 2026-09-21

Supersedes `GBAP_AI_RUNTIME_SHARED_MODEL_ADMISSION_GATE_v0.4.md` for the active bake-off execution contract. v0.4 remains immutable historical evidence.

## 0. REOPEN -> evidence -> correction -> RE-FREEZE

Real Windows v0.4 on main `9a0fd81720c16e1932d71a331bacf30cbd385ce4` proved all of the following before failure:

```text
managed UAT update                         PASS
stale bounded shared-model cleanup         PASS / alreadyAbsent=true
clean no-bakeoff-model baseline            PASS
DeepSeek synthetic provider evaluation     4/4 PASS
RAGFlow provider                           DeepSeek
RAGFlow adapter                            RAGFLOW_NATIVE_DEEPSEEK
RAGFlow toolCalling                        true
same logical model inventory               PASS
fresh substrate-admin auth                 PASS
temporary Twenty bridge identities         READY
two RESTRICTED synthetic witnesses         READY
Candidate A execution surface              /api/v1/agents/chat/completions
Candidate A worker result                  PASS
Candidate A cleanup                        PASS
Candidate B                                NOT RUN
accepted evaluator evidence                NONE
```

The runtime did not fail inside RAGFlow or DeepSeek. Candidate A emitted a valid, machine-readable `AI_RUNTIME_BAKEOFF_CANDIDATE_A` JSON object with `result=PASS`, but the Windows PowerShell 5.1 wrapper then reported:

```text
Machine-readable gate JSON not found: AI_RUNTIME_BAKEOFF_CANDIDATE_A
```

The captured Candidate A object contains long multilingual model content, nested references, tool traces and citation payloads. Windows PowerShell 5.1 was being asked to parse that entire large object via `ConvertFrom-Json`. The same failure mode could later affect Candidate B or the evaluator.

## 1. Decision

Large runtime gate objects are no longer parsed by the Windows PowerShell JSON engine.

The active contract is:

```text
native process
-> capture stdout/stderr without PowerShell ErrorRecord formatting noise
-> persist raw output as UTF-8
-> Node 24 gate extractor finds/parses the requested JSON gate
-> optional full gate is written durably by Node
-> PowerShell receives only a small scalar summary
```

The Node extractor must tolerate:

- Docker stderr lines before the JSON gate;
- very large JSON strings;
- multilingual content;
- nested references/tool traces;
- Candidate A, Candidate B, evaluator and cleanup gate shapes.

## 2. Runtime changes

`Invoke-NativeCapture` must collapse PowerShell `ErrorRecord` objects to the native exception message instead of formatting full PowerShell error metadata.

`Require-LastGateJson` must delegate gate extraction to:

`infrastructure/local-uat/ai-runtime-gate-extract.mjs`

The extractor returns only a bounded scalar summary to PowerShell:

```text
gate
result
candidate
executionSurface
temporaryReadOnlyRoleUsed
temporaryReadOnlyRoleRemoved
```

When durable full evidence is required, the extractor writes the full parsed object directly to the requested output JSON file.

## 3. Boundaries unchanged

```text
provider endpoint                      https://api.deepseek.com
logical model                          deepseek-flash
RAGFlow provider                       DeepSeek
RAGFlow adapter                        RAGFLOW_NATIVE_DEEPSEEK
RAGFlow toolCalling                    true
Candidate A execution                  /api/v1/agents/chat/completions
Candidate A thinking                   explicit enabled
Candidate B thinking                   provider default
retrieval embedding                    frozen GTE / unchanged
test data                              synthetic/non-company only
real company Knowledge                 NOT AUTHORIZED
AI writes                              NOT ENABLED
external MCP                           NOT EXPOSED
multi-agent                            NOT ENABLED
durable AI memory                      NOT ENABLED
PRIMARY runtime                        NOT SELECTED
Production                             NOT AUTHORIZED
```

## 4. RE-FREEZE condition

```text
focused exact-head CI PASS
-> one managed Windows update to exact merged main
-> one bounded Shared Model admission
-> Candidate A PASS parsed successfully
-> Candidate B runs and PASSes
-> evaluator emits AI_RUNTIME_REAL_BAKEOFF_EVIDENCE result=PASS
-> temporary identities / Knowledge witnesses / runtime fixtures cleaned
-> shared model restored to no-generative-model baseline
-> evidence review
-> separate PRIMARY / SPECIALIST closure decision
```

No PRIMARY or Production decision is implied by v0.5.
