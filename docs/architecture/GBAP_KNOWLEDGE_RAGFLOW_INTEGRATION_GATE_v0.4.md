# GBAP GBAP｜Knowledge / RAGFlow Integration Gate v0.4

Status: **RE-FROZEN / PRODUCTIZATION PASS / RECOVERY PASS / MULTILINGUAL BENCHMARK CONTRACT PASS / CURRENT WSL HEAVY MODEL CAPACITY BLOCKED**

Date: 2026-09-18

Repository: `hhhh666-888/global-business-ai-platform`

Predecessor authorities:
- `docs/architecture/GBAP_KNOWLEDGE_RAGFLOW_INTEGRATION_GATE_v0.1.md`
- `docs/architecture/GBAP_KNOWLEDGE_RAGFLOW_INTEGRATION_GATE_v0.2.md`
- `docs/architecture/GBAP_KNOWLEDGE_RAGFLOW_INTEGRATION_GATE_v0.3.md`

Current accepted main:
`e4bd9f134081bb26f903966e233cad2644611519`

## 1. Accepted baseline before this revision

The following remain accepted:

```text
RAGFlow provider                   v0.27.2 / headless / internal / replaceable
provider contract                  gbap.knowledge.v1
real PDF/DOCX/XLSX provider PoU    PASS
native GBAP enterprise knowledge   PASS / V1
canonical source authority         PASS
ACL / lifecycle / business links   PASS / V1
canonical backup contract          PASS
deterministic restore contract     PASS
host-admission probe tooling       PASS
real company-host admission        PENDING
Production                         NOT AUTHORIZED
```

RAGFlow is not the employee identity, permission, workflow or business authority. Employee/browser code calls GBAP.

## 2. PR #216 — multilingual benchmark + capacity gate

Accepted PR:

```text
PR                              #216
title                           test: add multilingual knowledge benchmark capacity gate
accepted exact head             19f71e7aba21f9bc8589e76630bad5d48992785d
merge                           e4bd9f134081bb26f903966e233cad2644611519
GBAP PR Fast CI                 #835 PASS
Multilingual Capacity Contract  #2 PASS
```

This PR deliberately did **not** pull heavyweight embedding models.

It added a deterministic multilingual benchmark contract and a capacity gate first, so expensive model/runtime work is attempted only on an eligible host.

## 3. Multilingual benchmark contract

Synthetic-only benchmark:

```text
corpus documents     7
queries              8
languages            Chinese / English / Spanish
categories           same-language retrieval
                     cross-language retrieval
                     numeric/model-identifier retrieval
                     table retrieval
real customer data   NONE
```

Accepted metrics:

```text
Hit@1
Hit@3
Mean Reciprocal Rank
citation correctness
cross-language Hit@3
numeric/model-ID Hit@1
table Hit@3
latency P50/P95
peak memory
runtime duration
```

Current acceptance thresholds:

```text
overall Hit@1               >= 0.75
overall Hit@3               = 1.00
cross-language Hit@3        = 1.00
numeric/model-ID Hit@1      = 1.00
table Hit@3                 = 1.00
citation correctness        = 1.00
```

The CSV table fixture uses real row line breaks; literal `\n` separators are explicitly rejected by the benchmark contract test.

## 4. Current embedding candidates

Candidate registry:

`infrastructure/knowledge-quality/multilingual-candidates.json`

Current candidates:

```text
BAAI/bge-m3
  RAGFlow model ID               BAAI/bge-m3@Builtin
  upstream memory guidance       21 GiB
  GBAP benchmark floor        28 GiB

Qwen/Qwen3-Embedding-0.6B
  RAGFlow model ID               Qwen/Qwen3-Embedding-0.6B@Builtin
  upstream memory guidance       25 GiB
  GBAP benchmark floor        32 GiB
```

GBAP adds 7 GiB above model guidance for RAGFlow / Infinity / MySQL / MinIO / Valkey / OS headroom.

These are candidate floors for this governed benchmark; they do not redefine RAGFlow's general upstream minimum host requirement.

## 5. Accepted WSL overflow capacity evidence

Runner:

```text
name             GBAP-CI-01
role             WSL BACKUP / OVERFLOW
CPU              12
Docker CPU       12
total RAM        15.49 GiB
available RAM    11.67 GiB
Docker RAM       15.49 GiB
free disk        919.97 GiB
Docker           29.7.2
Compose          5.5.0
```

Capacity decision:

```text
BAAI/bge-m3                    BLOCKED
Qwen3-Embedding-0.6B          BLOCKED
eligibleCandidates            NONE
overall decision              STRONGER_RUNNER_REQUIRED
```

Reason is memory only. CPU and disk are sufficient.

This is a **successful fail-closed admission result**, not a CI failure.

Do not pull these heavyweight candidates on the current 15.49 GiB WSL runtime.

## 6. Current embedding runtime vs production model

The accepted real functional PoU still uses:

```text
RAGFlow                         v0.27.2
TEI image                       infiniflow/text-embeddings-inference:cpu-1.8
functional PoU embedding        BAAI/bge-small-en-v1.5@Builtin
purpose                         provider integration proof only
multilingual production use     NOT AUTHORIZED
```

`bge-small-en-v1.5` is not the final enterprise multilingual embedding model.

The UAT multilingual embedding model remains **NOT FROZEN**.

## 7. Ollama / generative LLM clarification

As of this authority:

```text
Ollama selected                NO
Ollama installed               NO
Ollama configured in repo      NO
Ollama code/docs in repo       NONE
GBAP generative LLM provider   NOT YET FROZEN FOR KNOWLEDGE ASSISTANT
```

Do not confuse two different model layers:

```text
Embedding model
  purpose: retrieve the correct knowledge chunks/documents
  current path: RAGFlow Builtin TEI
  active gate: multilingual retrieval quality

Generative LLM
  purpose: organize retrieved evidence into an employee-facing answer
  possible future runtime: Ollama or a governed external model provider
  current state: not yet selected/configured
```

If Ollama is adopted, it should be integrated behind a GBAP-owned model/provider boundary. Ordinary employees should not receive a second Ollama UI/account/control plane.

Ollama must not become Knowledge identity, ACL, canonical-document or business-workflow authority.

## 8. Real company host admission remains required

The real company Windows UAT host still must run:

```powershell
.\infrastructure\local-uat\Test-GBAP-Knowledge-HostAdmission.ps1
```

This is separate from CI runner capacity.

The real host result determines:

```text
COLOCATION_CANDIDATE
DEDICATED_KNOWLEDGE_HOST_REQUIRED
BLOCKED
```

A company PC merely meeting 4 CPU / 16 GB / 50 GB general RAGFlow minimum does not automatically prove enough headroom to co-locate GBAP + Twenty + a heavyweight multilingual embedding runtime.

## 9. Current Gate result

```text
Knowledge architecture / ownership             PASS
RAGFlow real provider runtime                  PASS
Native enterprise knowledge product V1         PASS
Canonical source authority                     PASS
Knowledge backup / deterministic restore       PASS
Host-admission probe implementation            PASS
Multilingual benchmark contract                PASS
Multilingual capacity policy                   PASS
Current WSL heavy-candidate capacity            BLOCKED BY MEMORY / FAIL-CLOSED
Real multilingual model quality run            NOT YET EXECUTED
UAT embedding model                            NOT FROZEN
Real company-host admission evidence           PENDING
Ollama / generative LLM                        NOT SELECTED / NOT CONFIGURED
Company-UAT Knowledge runtime install          NOT AUTHORIZED
Real company knowledge                         NOT AUTHORIZED
Production                                     NOT AUTHORIZED
```

## 10. Next legal mainline

The next session must not start by installing Ollama blindly.

First refresh current GitHub facts, then continue from:

```text
1. decide multilingual embedding benchmark execution target:
   A. use a stronger runner/host with >=28 GiB for BGE-M3 and >=32 GiB for Qwen3-Embedding-0.6B; or
   B. introduce a smaller multilingual candidate only after compatibility/evidence review
2. run the real RAGFlow multilingual benchmark only on an eligible runtime
3. compare quality + latency + resource cost and freeze the UAT embedding model
4. execute the real company Windows host-admission probe
5. choose co-location vs dedicated Knowledge VM/host
6. implement the admitted Knowledge runtime install/update/restart/recovery path
7. separately design the GBAP generative-model provider boundary for 企业知识助手
8. if local LLM is desired, evaluate/configure Ollama as one replaceable provider, not as a second employee system
9. prove employee question -> authorized retrieval -> model answer -> canonical citations
10. admit a bounded first real company knowledge batch only after recovery + host + model gates pass
11. then expose gbap.knowledge.v1 to GBAP business Agents
```

Production Go-Live remains a separate authority decision.
