# GBAP GBAP｜Knowledge / RAGFlow Integration Gate v0.5

Status: **RE-FROZEN / MULTILINGUAL REAL PROVIDER BENCHMARK PASS / UAT EMBEDDING MODEL FROZEN / REAL WINDOWS HOST ADMISSION PENDING**

Date: 2026-09-18

Repository: `hhhh666-888/global-business-ai-platform`

Predecessor authorities:
- `docs/architecture/GBAP_KNOWLEDGE_RAGFLOW_INTEGRATION_GATE_v0.1.md`
- `docs/architecture/GBAP_KNOWLEDGE_RAGFLOW_INTEGRATION_GATE_v0.2.md`
- `docs/architecture/GBAP_KNOWLEDGE_RAGFLOW_INTEGRATION_GATE_v0.3.md`
- `docs/architecture/GBAP_KNOWLEDGE_RAGFLOW_INTEGRATION_GATE_v0.4.md`

Accepted main before this docs-only freeze:
`02fe857de17b44d5840a3bc910ebe135ed158db0`

## 1. Accepted baseline

The following remain accepted and unchanged:

```text
provider contract                  gbap.knowledge.v1
RAGFlow                            v0.27.2 / headless / internal / replaceable
upstream commit                    a024bea0cd93f39e6652a42bf84dd20c55bc560b
real PDF/DOCX/XLSX provider PoU    PASS
native GBAP 企业知识库 V1           PASS
canonical source authority         PASS
ACL / lifecycle / business links   PASS
canonical backup contract          PASS
deterministic restore contract     PASS
host-admission probe tooling       PASS
browser direct RAGFlow access      FORBIDDEN
Production                         NOT AUTHORIZED
```

GBAP remains authority for employee UI/UX, Keycloak identity, authorization/ACL, canonical Knowledge IDs, source lifecycle, business links, audit/provenance and Agent/business workflows.

## 2. Evidence chain since v0.4

### PR #219 — lightweight multilingual compatibility probe

Accepted:

```text
PR                              #219
merge                           05e3578ce91bdb816307eab90adb7d30ef4ac165
MiniLM                         REJECTED by quality evidence
MPNet                          compatibility PASS
```

MiniLM was rejected because the correct English-to-Chinese storage match did not outrank an unrelated transformer distractor. Thresholds were not weakened.

MPNet proved that a multilingual external TEI path can run on the 15.49 GiB WSL overflow runner, but it remained a compatibility candidate rather than the frozen enterprise model.

### Closed PR #218 — retained historical GTE evidence

PR #218 is intentionally closed/unmerged because it:
1. modified the frozen v0.4 heavyweight registry; and
2. used a temporary Builtin TEI override.

Its successful full-stack GTE benchmark remains valid historical evidence:

```text
workflow run                    35304757769
Hit@1                           0.75
Hit@3                           1.00
cross-language Hit@3            1.00
numeric/model-ID Hit@1          1.00
table Hit@3                     1.00
citation correctness            1.00
peak memory                     11.3057 GiB
runtime                         182 s
```

### PR #220 — authoritative architecture-compliant GTE benchmark

Accepted:

```text
PR                              #220
exact head                      22fb0d5b03eefca3bbb8da40978fac4b4a0fb229
merge                           02fe857de17b44d5840a3bc910ebe135ed158db0
Fast CI                         #842 PASS
Capacity + Contract             #9 PASS
GTE HuggingFace Real Benchmark  #1 PASS
workflow run                    35309391227
```

The first Capacity + Contract attempt failed only because Git fetch exceeded its 120-second checkout timeout. It did not reach tests or model/runtime work. FAILED-SCOPE RERUN was used and passed.

## 3. Frozen UAT embedding model

The accepted UAT embedding configuration is now:

```text
model                           Alibaba-NLP/gte-multilingual-base
revision                        9bbca17d9273fd0d03d5725c7a4b0f6b45142062
RAGFlow provider                HuggingFace
provider instance               gbap-gte-multilingual
RAGFlow model ID                Alibaba-NLP/gte-multilingual-base@gbap-gte-multilingual@HuggingFace
embedding dimension             768
maximum input tokens            8192
TEI image                       infiniflow/text-embeddings-inference:cpu-1.8
benchmark runner floor          10 GiB
status                          FROZEN FOR UAT KNOWLEDGE RETRIEVAL
```

This freeze is specific to the current UAT Knowledge retrieval architecture. Any model/provider/revision/runtime change requires:

```text
REOPEN
-> evidence
-> affected benchmark
-> impact decision
-> RE-FREEZE
```

The frozen v0.4 heavyweight registry remains historical candidate evidence and is not rewritten:

```text
BAAI/bge-m3                    blocked on current WSL by 28 GiB floor
Qwen3-Embedding-0.6B          blocked on current WSL by 32 GiB floor
```

## 4. Authoritative real multilingual benchmark result

Execution path:

```text
GBAP native Knowledge API
-> GBAP authorization / PRIVATE ACL
-> provider-neutral RAGFlow adapter
-> RAGFlow v0.27.2
-> HuggingFace provider instance
-> pinned external TEI
-> Alibaba-NLP/gte-multilingual-base
```

Corpus:

```text
synthetic documents             7
queries                         8
languages                       Chinese / English / Spanish
real company data               NONE
```

Threshold result:

```text
overall Hit@1                   0.75   PASS
overall Hit@3                   1.00   PASS
MRR                             0.8541666667
cross-language Hit@3            1.00   PASS
numeric/model-ID Hit@1          1.00   PASS
table Hit@3                     1.00   PASS
citation correctness            1.00   PASS
latency P50                     2002.89 ms
latency P95                     2998.09 ms
peak full-stack memory          11.9687 GiB
benchmark query runtime         131 s
```

The Spanish-to-English cross-language case ranked the expected source at 3, and the table case ranked it at 2; both remain within the frozen Hit@3 acceptance contract. No threshold was weakened.

## 5. Accepted capacity facts

At the PR #220 real provider-path run:

```text
runner                           GBAP-CI-01
CPU                              12
Docker CPU                       12
total RAM                        15.49 GiB
available RAM                    12.12 GiB
Docker RAM                       15.49 GiB
free disk                        916.58 GiB
GTE benchmark floor              10 GiB
decision                         ELIGIBLE
```

Measured peak full-stack memory was 11.9687 GiB.

This proves the benchmark workload on this runner. It does **not** replace the real company Windows host-admission decision because the company host also carries existing GBAP/Twenty/runtime load.

## 6. Ollama / generative model boundary

Current truth remains:

```text
Ollama selected                  NO
Ollama installed                 NO
Ollama configured                NO
generative Knowledge LLM         NOT FROZEN
```

Embedding/retrieval and answer-generation are separate layers.

Do not install Ollama merely because the embedding model is now frozen.

If a local answer-generation runtime is selected later, it must remain a replaceable GBAP-owned model provider. It must not own employee identity, Knowledge ACL, canonical source authority or business workflows.

## 7. Current Gate result

```text
Knowledge architecture / ownership             PASS / FROZEN
RAGFlow real provider runtime                  PASS
Native enterprise Knowledge product V1         PASS
Canonical source authority                     PASS
Knowledge backup / deterministic restore       PASS
Host-admission probe implementation            PASS
Multilingual benchmark contract                PASS
GTE real HuggingFace-provider benchmark        PASS
UAT embedding model                            FROZEN
Real company Windows host admission            PENDING
Co-location vs dedicated Knowledge host        PENDING
Knowledge runtime install/update/restart       NOT YET ADMITTED
Generative LLM / Ollama                        NOT SELECTED / NOT CONFIGURED
Company-UAT Knowledge runtime install          NOT AUTHORIZED
Real company knowledge                         NOT AUTHORIZED
Production                                     NOT AUTHORIZED
```

## 8. Next legal mainline

The multilingual-model selection loop is closed.

Do **not** benchmark more embedding models without a new reason/evidence trigger.

Next:

```text
1. refresh current GitHub/runtime facts
2. run infrastructure/local-uat/Test-GBAP-Knowledge-HostAdmission.ps1 on the real company Windows UAT host
3. capture the exact decision:
   COLOCATION_CANDIDATE
   DEDICATED_KNOWLEDGE_HOST_REQUIRED
   BLOCKED
4. choose co-location vs dedicated Knowledge host from evidence
5. implement the admitted Knowledge runtime install/update/restart/re-index/recovery path using the frozen GTE configuration
6. validate restart + backup/restore + canonical re-index on UAT
7. separately define the GBAP generative-model provider boundary for 企业知识助手
8. only then evaluate a local LLM runtime such as Ollama if local generation is desired
9. prove employee question -> ACL -> retrieval -> answer model -> canonical citations
10. admit a bounded first real company knowledge batch only after host/runtime/recovery/assistant gates pass
11. expose Knowledge to GBAP Agents only through gbap.knowledge.v1
```

Production Go-Live remains a separate authority decision.
