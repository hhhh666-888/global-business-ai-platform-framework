# GBAP GBAP｜Knowledge / RAGFlow Integration Gate v0.3

Status: **RE-FROZEN / NATIVE PRODUCTIZATION PASS / RECOVERY CONTRACT PASS / REAL HOST ADMISSION PENDING**

Date: 2026-09-18

Repository: `hhhh666-888/global-business-ai-platform`

Predecessor authorities:
- `docs/architecture/GBAP_KNOWLEDGE_RAGFLOW_INTEGRATION_GATE_v0.1.md`
- `docs/architecture/GBAP_KNOWLEDGE_RAGFLOW_INTEGRATION_GATE_v0.2.md`

Current accepted main after recovery implementation:
`bec8f26c3addd6371ba0024dacb27ba8ef61885e`

## 1. Accepted productization

PR #213:

```text
title                         feat: productize native enterprise knowledge base
accepted exact head           2e85ca8a8d3a9f2e88169b53c66d1ce74561178b
merge                         7a03bf7df8947fe719d1fb14fe3d7c360f5bfca1
GBAP PR Fast CI               #832 PASS
Knowledge Foundation          #19 PASS
Knowledge Productization V1   #2 PASS
Stage 3.7 Browser             #584 PASS
Real RAGFlow Runtime          #17 PASS
```

Accepted product capabilities:

```text
native GBAP 企业知识库 page
collection create/update/retry/archive
classification + visibility
SUBJECT/ROLE read ACL
document upload/list/detail/status/retry/archive
canonical source download
GBAP canonical source-file authority
content checksum + duplicate-content guard
business links
native search + canonical citations
opaque chunk identity at browser boundary
provider-health visibility
provider-outage canonical persistence
```

RAGFlow remains headless/internal/replaceable. Ordinary employees do not use RAGFlow accounts, permissions, tokens or frontend.

## 2. Canonical source authority

GBAP now persists accepted source bytes under:

`/data/knowledge-source/<KnowledgeDocumentId>/<KnowledgeDocumentVersionId>.bin`

The authoritative metadata remains in GBAP SQLite.

Provider failure does not revoke or erase canonical identity/source authority. A failed provider ingestion is represented as an explicit state and is retryable.

## 3. Accepted recovery implementation

PR #214:

```text
title                                feat: add knowledge recovery and host admission gates
accepted exact head                  98aa6eafd13b8da548c0b44a5923b54512027cad
merge                                bec8f26c3addd6371ba0024dacb27ba8ef61885e
GBAP PR Fast CI                      #833 PASS
Knowledge Recovery/Host Admission    #1 PASS
```

New governed backups now include:

```text
gbap-substrate.db
gbap-observability.db
knowledge-source/
Twenty PostgreSQL dump
Twenty local storage
Keycloak mutable state
manifest.json with SHA-256 for every backup file
```

Before backup, GBAP substrate SQLite and Observability SQLite are checkpointed and integrity-checked.

Restore now proves:

```text
manifest hashes valid
canonical Knowledge source directory restored
KnowledgeDocument ID preserved
KnowledgeDocumentVersion ID preserved
storage path inside /data/knowledge-source
byte size preserved
SHA-256 preserved
tampered source rejected
```

Legacy backups without `knowledgeSourceIncluded=true` remain recognizable but are not valid Knowledge recovery evidence.

## 4. Host admission tooling

The company Windows UAT host must be measured with:

```powershell
.\infrastructure\local-uat\Test-GBAP-Knowledge-HostAdmission.ps1
```

The probe records:

`infrastructure/local-uat/.runtime/knowledge-host-admission.json`

It measures actual runtime facts:

```text
Windows logical CPU
Windows total RAM
Windows currently free physical RAM
Docker daemon visible CPU/RAM
Docker Server version
Docker Compose version
Knowledge runtime drive free space
current GBAP/Twenty/Keycloak container load snapshot
```

Decision vocabulary:

```text
COLOCATION_CANDIDATE
DEDICATED_KNOWLEDGE_HOST_REQUIRED
BLOCKED
```

The script never authorizes Production.

## 5. What remains unproven

The following remain blocking:

```text
real company Windows host admission evidence
final UAT Knowledge runtime topology decision
Chinese/English/Spanish retrieval-quality benchmark
UAT embedding-model freeze
knowledge runtime backup/restore for RAGFlow derived state
governed company-UAT RAGFlow installation
restart/recovery proof on admitted runtime
bounded first real company knowledge admission
Agent production use of gbap.knowledge.v1
Production Go-Live
```

## 6. Recovery interpretation

GBAP canonical source bytes + canonical metadata are the primary recovery authority.

RAGFlow derived data remains provider-owned/replaceable. UAT runtime recovery may restore provider state where practical, but the platform must also be able to re-index a provider from canonical GBAP sources without changing canonical document IDs.

This requirement is mandatory before real company knowledge is admitted.

## 7. Updated Gate result

```text
Architecture / ownership boundary          PASS
gbap.knowledge.v1 foundation            PASS
Real RAGFlow v0.27.2 runtime              PASS
Native GBAP enterprise knowledge product   PASS / V1
Canonical source authority                 PASS
ACL / document lifecycle                   PASS / V1
Canonical backup contract                  PASS
Deterministic restore contract             PASS
Host-admission probe implementation        PASS
Real company-host admission evidence       PENDING
Multilingual retrieval quality             PENDING
UAT embedding model                        NOT FROZEN
Company-UAT Knowledge runtime install      NOT AUTHORIZED
Real company knowledge                     NOT AUTHORIZED
Production                                 NOT AUTHORIZED
```

## 8. Next legal mainline

```text
1. build multilingual retrieval benchmark fixtures and acceptance harness
2. benchmark approved multilingual embedding candidates for Chinese / English / Spanish
3. freeze the UAT embedding model/configuration based on evidence
4. run Test-GBAP-Knowledge-HostAdmission.ps1 on the real company Windows UAT host
5. choose co-location vs dedicated Knowledge VM/host from evidence
6. build the admitted isolated Knowledge runtime installer/runbook
7. add RAGFlow/provider derived-state recovery or canonical re-index recovery proof
8. deploy to company UAT
9. prove employee upload/search/citation/ACL/restart/restore
10. admit a bounded first batch of real company knowledge
11. expose the accepted knowledge service to GBAP Agents through gbap.knowledge.v1
```

Production Go-Live remains a separate authority decision.
