# GBAP GBAP｜Knowledge / RAGFlow Integration Gate v0.6

Status: **REOPENED / REAL WINDOWS HOST ADMISSION PASS / COLOCATION ADMITTED / UAT RUNTIME MERGED / COMPANY INSTALL PENDING**

Date: 2026-09-18

## 0. Authority and change reason

This document succeeds, but does not rewrite, the frozen authority:

`docs/architecture/GBAP_KNOWLEDGE_RAGFLOW_INTEGRATION_GATE_v0.5.md`

Gate v0.5 froze the multilingual retrieval model and required a real company Windows host-admission decision before company-UAT Knowledge installation.

That trigger has now occurred. The real Windows probe returned:

`COLOCATION_CANDIDATE`

Evidence:

`docs/evidence/GBAP_KNOWLEDGE_WINDOWS_HOST_ADMISSION_EVIDENCE_2026-09-18.md`

Therefore Gate v0.6 reopens only the deployment-admission layer. It does **not** reopen embedding selection, provider selection, or the accepted PR #220 benchmark.

## 1. Unchanged frozen retrieval authority

```text
contract                         gbap.knowledge.v1
RAGFlow                          v0.27.2
RAGFlow commit                   a024bea0cd93f39e6652a42bf84dd20c55bc560b
RAGFlow posture                  headless / internal / replaceable
browser-direct RAGFlow access    FORBIDDEN

embedding provider               HuggingFace
provider instance                gbap-gte-multilingual
model                            Alibaba-NLP/gte-multilingual-base
model revision                   9bbca17d9273fd0d03d5725c7a4b0f6b45142062
model ID                         Alibaba-NLP/gte-multilingual-base@gbap-gte-multilingual@HuggingFace
TEI                              infiniflow/text-embeddings-inference:cpu-1.8
embedding dimension              768
max input tokens                 8192
```

Changing any item above requires a separate formal REOPEN -> evidence -> impact decision -> RE-FREEZE.

## 2. Real company host admission

Accepted host evidence:

```text
Windows logical CPU              12
Windows total RAM                31.75 GiB
Windows free RAM at admission    16.36 GiB
Docker CPU                       12
Docker RAM                       19.53 GiB
Docker Server                    29.6.2
Docker Compose                   5.3.1
Knowledge drive                  E:\
Knowledge free disk              606.14 GiB
Knowledge total disk             621 GiB
decision                         COLOCATION_CANDIDATE
```

Topology decision:

`COLOCATION`

The Knowledge runtime may be installed on the existing company Windows UAT host. This is UAT admission only.

## 3. Admitted runtime architecture

The company-UAT execution path is:

```text
Employee browser
-> GBAP Web
-> GBAP API
-> Keycloak identity + GBAP Knowledge ACL
-> native Knowledge Service
-> gbap.knowledge.v1 provider registry
-> provider-neutral ragflow-adapter
-> pinned RAGFlow v0.27.2
-> official HuggingFace provider instance
-> pinned GTE multilingual TEI
-> Infinity / RAGFlow persistence
```

GBAP remains authority for canonical IDs, ACL, source lifecycle, audit/provenance and business links.

RAGFlow remains an internal retrieval provider and must not become a second employee system.

## 4. Runtime implementation admitted by this Gate

The accepted implementation lives in:

`infrastructure/knowledge-runtime/`

It must provide bounded, repeatable:

- install;
- start;
- stop without deleting volumes;
- runtime health verification;
- exact RAGFlow commit drift detection;
- exact embedding-model drift detection;
- provider registration through `gbap.knowledge.v1`;
- fail-closed adapter secret handling;
- loopback/internal-only RAGFlow exposure;
- post-install runtime evidence.

Default persistent runtime root on the current host:

`E:\GBAP-KnowledgeRuntime`

The normal GBAP Local-UAT compose remains independently managed. RAGFlow is not silently vendored into it.

## 5. Explicitly still blocked

```text
embedding reselection                     CLOSED / NOT REOPENED
additional embedding benchmark            NOT AUTHORIZED
real company knowledge ingestion          NOT AUTHORIZED
Knowledge Assistant generative model      NOT FROZEN
Ollama                                    NOT SELECTED / NOT CONFIGURED
Agent use of Knowledge                    NOT YET AUTHORIZED
Production                                NOT AUTHORIZED
```

PR #220 Heavy evidence is reused. Do not rerun it simply because the host has now been admitted.

## 6. Runtime acceptance gates

The runtime cannot be considered accepted merely because containers start.

Required company-UAT acceptance:

1. install succeeds only when Host Admission returns `COLOCATION_CANDIDATE`;
2. exact RAGFlow commit is read back;
3. exact HuggingFace/GTE model ID is read back;
4. RAGFlow API is healthy;
5. GTE TEI is healthy;
6. provider-neutral adapter is healthy;
7. GBAP provider registry contains the expected `gbap.knowledge.v1` provider;
8. `/api/knowledge/health` returns READY through native GBAP;
9. stop/start/restart retains runtime state and canonical mappings;
10. backup/restore + canonical re-index is proven;
11. memory and CPU are recorded under real co-located steady state.

## 7. Current Gate state

```text
Knowledge architecture / ownership          PASS / FROZEN
Native Enterprise Knowledge V1              PASS
RAGFlow real provider runtime               PASS
GTE real HuggingFace benchmark              PASS / REUSED
UAT embedding model                         FROZEN
Real Windows host admission                 PASS
Host topology                               COLOCATION
Persistent UAT runtime implementation       MERGED / PASS / PR #224
Persistent UAT runtime installation         AUTHORIZED / PENDING EXECUTION
Restart proof                               PENDING
Backup/restore + canonical re-index         PENDING
Real company knowledge                      NOT AUTHORIZED
Generative LLM / Ollama                     NOT AUTHORIZED
Production                                  NOT AUTHORIZED
```

## 8. Next legal action

Accepted runtime implementation evidence:

```text
PR #224 exact head              dcb2773176e8e422cd488b71aaffd570bd6fb6ba
PR #224 merge                   8766e9b0e51ee3db3f6f488d9e1a9b4df65c5ced
Fast CI #853                    PASS
Knowledge UAT Runtime Contract  #1 PASS
VM-only Runner Capacity Proof   #13 PASS
```

1. update the company Windows UAT checkout through the governed updater;
3. re-run Host Admission immediately before install;
4. execute the admitted persistent Knowledge install;
5. capture exact runtime/model/provider/container evidence;
6. execute stop -> start -> test;
7. implement and prove Knowledge backup/restore + canonical re-index;
8. only then decide the generative-model provider boundary;
9. only after the above gates pass, admit a bounded first real company knowledge batch.
