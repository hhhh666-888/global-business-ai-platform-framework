# GBAP GBAP｜Knowledge / RAGFlow Integration Gate v0.7

Status: **RE-FROZEN / PASS / CLOSED**

Date: 2026-09-19

## 0. Authority and closure reason

This document succeeds:

`docs/architecture/GBAP_KNOWLEDGE_RAGFLOW_INTEGRATION_GATE_v0.6.md`

Gate v0.6 reopened only the real-company Windows deployment/recovery layer after host admission. It did not reopen the accepted retrieval model, RAGFlow provider choice, provider-neutral contract, or PR #220 multilingual benchmark.

The required real Windows recovery proof has now completed successfully.

Accepted evidence:

`docs/evidence/GBAP_KNOWLEDGE_WINDOWS_RECOVERY_EVIDENCE_2026-09-19.md`

Therefore the v0.6 deployment/recovery layer is **RE-FROZEN / PASS / CLOSED**.

## 1. Frozen retrieval authority

The following retrieval/runtime authority remains unchanged:

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

Changing any item above requires a new formal `REOPEN -> evidence -> impact decision -> re-test -> RE-FREEZE`.

## 2. Permanent ownership boundary

GBAP remains authority for:

- employee Knowledge UI/UX;
- Keycloak human identity;
- Knowledge ACL/authorization;
- canonical Collection/Document/Version IDs;
- original source bytes and checksums;
- source lifecycle;
- business links;
- audit/provenance;
- provider mappings;
- Agent-facing Knowledge contracts/workflows.

RAGFlow remains responsible only for replaceable provider-side parsing/chunking/index/retrieval/reranking state.

Employees must not directly operate RAGFlow UI, tokens, internal IDs, or internal endpoints.

## 3. Accepted company-UAT topology

```text
Employee browser
-> GBAP Web
-> GBAP API
-> Keycloak identity + GBAP Knowledge ACL
-> native GBAP Knowledge Service
-> gbap.knowledge.v1 provider registry
-> provider-neutral ragflow-adapter
-> RAGFlow v0.27.2
-> HuggingFace provider / frozen GTE TEI
-> Infinity / RAGFlow provider persistence
```

Host topology:

`COLOCATION`

Persistent Knowledge runtime root:

`E:\GBAP-KnowledgeRuntime`

## 4. Final deployment/recovery acceptance

The company Windows UAT has now proven:

```text
Real Windows host admission                 PASS
Persistent Knowledge runtime install        PASS
RAGFlow exact commit readback               PASS
GTE exact model/provider readback           PASS
Native /api/knowledge/health                READY
Stop -> Start -> Test persistence           PASS
Co-located resource stability               PASS
Governed Local-UAT backup/restore           PASS
Canonical IDs restored                      PASS
Canonical source bytes/checksum restored    PASS
Provider collection recreation              PASS
Canonical document re-index                 PASS
Native search recovery                      PASS
Canonical citation mapping recovery         PASS
Baseline state restoration                  PASS
```

The destructive provider-loss proof used synthetic/non-company Knowledge only.

Recovery-proof code baseline:

`7653cb198c0d87da67d3c18845a96c76013e9a60`

Final recovery marker:

`KNOWLEDGE_RECOVERY_UAT=PASS`

## 5. Gate state

```text
Knowledge architecture / ownership          PASS / FROZEN
Native Enterprise Knowledge V1              PASS
RAGFlow real provider runtime               PASS
GTE real HuggingFace benchmark              PASS / REUSED
UAT embedding model                         FROZEN
Real Windows host admission                 PASS
Host topology                               COLOCATION
Persistent UAT runtime                      PASS / INSTALLED
Restart persistence                         PASS
Resource stability                          PASS
Backup/restore + canonical re-index         PASS
Search/canonical citation recovery          PASS
Knowledge deployment/recovery gate          PASS / CLOSED
```

## 6. Still blocked / not claimed

```text
embedding reselection                       CLOSED / NOT REOPENED
additional embedding benchmark              NOT AUTHORIZED without new trigger
generative Knowledge Assistant model        NOT YET FROZEN
Ollama                                      NOT SELECTED / NOT CONFIGURED
unbounded real-company Knowledge ingestion  NOT AUTHORIZED
Agent use of Knowledge                      NOT YET AUTHORIZED
Production                                  NOT AUTHORIZED
```

A bounded first real-company Knowledge batch is now **eligible for a separate explicit UAT batch admission decision**; this Gate does not silently ingest or broadly authorize company data.

## 7. Next legal action

The recovery line is complete. The next Knowledge engineering action is:

1. define the GBAP generative-model provider boundary for 企业知识助手;
2. choose/evaluate an answer-generation provider under that boundary;
3. keep the frozen GTE retrieval layer unchanged;
4. prove `employee question -> ACL -> GTE retrieval -> answer model -> canonical citations`;
5. separately admit a bounded first real-company Knowledge batch for UAT when source scope/ACL/data handling are explicitly accepted;
6. expose Knowledge to GBAP Agents only through governed GBAP contracts;
7. keep Production **NOT AUTHORIZED** until its own Gate.

## 8. Reopen triggers

Gate v0.7 may be reopened only for material evidence such as:

- retrieval quality regression against the accepted multilingual contract;
- host resource regression or repeated OOM/restart instability;
- canonical source or restore integrity failure;
- provider replacement/version change;
- embedding model/provider change;
- security/ACL/provenance boundary change;
- recovery script failure on a supported UAT upgrade;
- a production-admission decision requiring a separate deployment profile.

Absent such a trigger, do not rerun PR #220 Heavy evidence or restart embedding selection.
