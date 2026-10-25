# GBAP AI Runtime Shared Model Admission Gate v0.6

Status: **IMPLEMENTATION CANDIDATE / LOCAL-UAT BAKE-OFF ONLY / PRIMARY NOT SELECTED / PRODUCTION NOT AUTHORIZED**

Date: 2026-09-21

Supersedes `GBAP_AI_RUNTIME_SHARED_MODEL_ADMISSION_GATE_v0.5.md` for the active real-bake-off execution contract. v0.5 remains immutable historical evidence.

## 0. REOPEN -> evidence -> correction -> RE-FREEZE

Real Windows v0.5 on exact main `27ede33f51f598928a41e1fa760e6e9a9657f337` proved:

```text
managed Local-UAT update                         PASS
installed SHA / origin main                      exact match
Windows PowerShell parse                         PASS
large gate extraction regression                 PASS / 370670 bytes
clean no-bakeoff-model baseline                  PASS
DeepSeek synthetic provider evaluation           4/4 PASS
RAGFlow native DeepSeek                          PASS
RAGFlow toolCalling                              true
same logical model inventory                     PASS
fresh substrate-admin auth                       PASS
temporary Twenty bridge identities               READY
PRIMARY selected                                 false
Production authorized                            false
```

The run then failed before Candidate A or Candidate B execution while creating the two bounded synthetic Knowledge witnesses:

```text
Bake-off Knowledge witness did not become READY:
05c9fe01-dc06-4869-83d6-f78b5c2f8180
```

The wrapper entered cleanup immediately. The outer failure handler then printed an old Candidate A transcript left by the previous v0.4 run, proving a separate stale-runtime-artifact defect. That transcript was not evidence from the v0.5 run.

## 1. Root cause

The formal Knowledge runtime is intentionally tuned for a colocated CPU UAT host:

```text
embeddingBatchSize          4
maxConcurrentTasks          1
maxConcurrentChunkBuilders  1
PDF fast path               Plain Text
PDF adaptive fallback       DeepDOC
fallback task page size     4
```

The single-task limit is an accepted stability control. Existing company Knowledge ingestion/reprocessing can therefore occupy the only RAGFlow ingestion slot. A real bake-off may not assume that a newly created synthetic witness will start immediately.

The v0.5 wrapper had three lifecycle gaps:

1. it did not treat the shared Knowledge ingestion queue as a governed runtime dependency;
2. it submitted both synthetic witnesses before waiting for the first to become READY;
3. it left previous Candidate A/B transcript files in the runtime directory, allowing a pre-candidate failure to display stale evidence.

## 2. v0.6 decision

The bake-off must respect the shared single-task Knowledge runtime instead of changing its accepted tuning.

Before creating temporary employee fixtures, and again immediately before synthetic witness ingestion:

```text
GET canonical Knowledge document list
-> inspect only PENDING / INDEXING documents
-> refresh their status through the governed read-only status endpoint
-> wait until the active queue is empty
```

For pre-existing/company Knowledge:

```text
READ / STATUS ONLY
NO retry
NO delete
NO reprocess
NO archive
NO provider mutation
NO title/content logging
```

The queue wait may log only bounded diagnostics:

```text
active count
canonical state
provider state
chunk count
public provider detail
document id
```

## 3. Synthetic witness lifecycle

The two synthetic witnesses are submitted sequentially to match `maxConcurrentTasks=1`:

```text
create Actor A synthetic document
-> wait Actor A READY
-> create Actor B synthetic document
-> wait Actor B READY
-> continue to Candidate A/B
```

Only a document created by the current bake-off may use the canonical retry endpoint.

For the current synthetic document:

```text
READY
  -> continue

FAILED / CANCELLED
  -> one bounded canonical retry
  -> continue waiting

still INDEXING after the bounded stuck threshold
  -> one bounded canonical retry
  -> continue waiting

second failure / timeout
  -> fail with final provider diagnostic
```

No retry is permitted in the pre-existing queue-idle function.

## 4. Runtime artifact hygiene

At the start of an authorized real bake-off:

```text
delete stale Candidate A transcript
delete stale Candidate B transcript
archive prior durable bake-off evidence to evidence-history
start current run with clean candidate-output paths
```

This prevents a failure before Candidate execution from surfacing a previous run as current evidence.

Accepted historical evidence is archived, not silently discarded.

## 5. Boundaries unchanged

```text
provider endpoint                      https://api.deepseek.com
logical model                          deepseek-flash
model fingerprint                      unchanged
RAGFlow provider                       DeepSeek
RAGFlow adapter                        RAGFLOW_NATIVE_DEEPSEEK
RAGFlow toolCalling                    true
Candidate A execution                  /api/v1/agents/chat/completions
Candidate A thinking                   explicit enabled
Candidate B thinking                   provider default
retrieval embedding                    frozen GTE / unchanged
Knowledge maxConcurrentTasks           1 / unchanged
Knowledge maxConcurrentChunkBuilders   1 / unchanged
test data                              synthetic/non-company only
real company Knowledge                 READ-ONLY queue observation only
AI writes                              NOT ENABLED
external MCP                           NOT EXPOSED
multi-agent                            NOT ENABLED
durable AI memory                      NOT ENABLED
PRIMARY runtime                        NOT SELECTED
Production                             NOT AUTHORIZED
```

## 6. RE-FREEZE condition

```text
focused exact-head CI PASS
-> one managed Windows update to exact merged main
-> one bounded Shared Model admission
-> queue-idle preflight PASS without mutating existing Knowledge
-> synthetic witness A READY
-> synthetic witness B READY
-> Candidate A PASS
-> Candidate B PASS
-> evaluator AI_RUNTIME_REAL_BAKEOFF_EVIDENCE PASS
-> all bounded fixtures cleanup PASS
-> shared model restored to no-generative-model baseline
-> deterministic evidence review
-> separate PRIMARY / SPECIALIST closure decision
```

No PRIMARY, employee enablement, real-company Knowledge authorization, or Production decision is implied by v0.6.
