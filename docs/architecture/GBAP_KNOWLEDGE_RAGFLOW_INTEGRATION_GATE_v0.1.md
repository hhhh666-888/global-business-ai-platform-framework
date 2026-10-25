# GBAP GBAP｜Knowledge / RAGFlow Integration Gate v0.1

Status: **DESIGN GATE PASS / INSTALLATION GATE BLOCKED**

Date: 2026-09-17

Repository: `hhhh666-888/global-business-ai-platform`

GBAP baseline reviewed: `2b9fbfc8948d9eae75d8b1384eb84c5669af20cb`

Selected upstream candidate for bounded PoU: `infiniflow/ragflow` `v0.27.2`

## 1. Decision

GBAP GBAP will treat RAGFlow as a **headless, internal, replaceable Knowledge/RAG Provider** behind a GBAP-owned adapter and canonical contract.

RAGFlow is **not** a second employee product, identity authority, authorization authority, AI application shell, CRM, workflow authority or business-data authority.

The permanent platform rule remains:

```text
ONE GBAP employee UI / UX
+ GBAP Keycloak human identity authority
+ GBAP authorization / capability boundary
+ GBAP durable IDs
+ GBAP provenance / audit / provider mapping
+ replaceable internal providers behind adapters
```

## 2. V1 capability boundary

### Allowed RAGFlow capabilities

V1 may use only the capabilities required to implement enterprise knowledge retrieval:

```text
document ingestion
-> document parsing
-> chunking
-> embedding/indexing
-> retrieval / hybrid retrieval
-> reranking where configured
-> source/chunk citation metadata
-> ingestion/retrieval health and status
```

### Explicitly disabled / out of scope for V1

```text
RAGFlow employee-facing UI
RAGFlow user accounts as GBAP human identities
RAGFlow Chat as the employee chat product
RAGFlow Agent / Agentic Workflow as GBAP workflow authority
RAGFlow MCP exposure to employees or the public network
RAGFlow code executor / sandbox
RAGFlow channel integrations
RAGFlow direct model-provider configuration by ordinary GBAP users
browser access to RAGFlow API keys or provider tokens
```

Generation/orchestration remains a GBAP concern. RAGFlow may use implementation-internal embedding/rerank/parsing models where required, but those do not become the GBAP model-control plane.

## 3. Canonical contract

Introduce a provider-neutral contract named:

```text
gbap.knowledge.v1
```

Minimum capability vocabulary:

```text
knowledge.v1.health
knowledge.v1.collection.list
knowledge.v1.collection.create
knowledge.v1.collection.update
knowledge.v1.collection.archive
knowledge.v1.document.ingest
knowledge.v1.document.status
knowledge.v1.document.remove
knowledge.v1.search
knowledge.v1.chunk.get
```

The GBAP application must call this contract, not RAGFlow endpoints directly.

The initial RAGFlow adapter may translate the contract to RAGFlow dataset/document/chunk/retrieval APIs, including the upstream `POST /api/v1/retrieval` endpoint.

Provider-specific IDs must remain behind provider mapping. Business/UI code must never treat a RAGFlow dataset ID, document ID or chunk ID as the canonical GBAP knowledge ID.

## 4. Canonical knowledge ownership

GBAP owns and must persist provider-neutral records for at least:

```text
KnowledgeCollection
KnowledgeDocument
KnowledgeDocumentVersion
KnowledgeAcl / visibility scope
KnowledgeBusinessLink
KnowledgeProviderMapping
KnowledgeIngestionRun
KnowledgeAuditEvent / provenance
```

A canonical KnowledgeDocument must have a GBAP durable ID independent of RAGFlow.

Minimum document authority metadata:

```text
knowledgeDocumentId
collectionId
title
sourceType
sourceFilename / sourceLocator
content checksum
version
classification
owner / business scope
ACL / visibility scope
business links (company / opportunity / product / project etc.)
ingestion state
createdAt / updatedAt
```

GBAP owns source authority, lifecycle, ACL, business relations and audit history.

RAGFlow owns only provider-internal/derived processing state such as parsed representations, chunks, embeddings, indexes, ranking state and provider-local copies required to serve retrieval.

Deleting/archiving a canonical document must drive provider cleanup through the adapter. Provider cleanup failure must be visible and retryable; it must not silently claim completion.

## 5. Retrieval and citation contract

A GBAP search request must be authorized before provider retrieval.

Provider-neutral request shape should support:

```text
actorSubject
query
allowedCollectionIds / allowedDocumentIds
business scope filters
metadata filters
topK
minimum score
request correlation ID
```

Provider-neutral results must return at least:

```text
knowledgeDocumentId
knowledgeDocumentVersionId
chunkId (GBAP/provider-mapped, not raw provider authority)
text / excerpt
page / section / locator when available
score
source title
source citation metadata
provider provenance
```

The employee UI must cite the GBAP knowledge record/source. Raw RAGFlow IDs are diagnostic/provider metadata only.

## 6. Authorization model

RAGFlow must not be trusted as the GBAP human authorization authority.

Required flow:

```text
employee browser
-> GBAP web
-> Keycloak-authenticated GBAP API
-> GBAP authorization / knowledge ACL decision
-> Knowledge Service / Provider Resolver
-> RAGFlow Adapter
-> RAGFlow service API
```

RAGFlow sees a service-to-service principal/API credential, not the employee's RAGFlow account.

The GBAP backend must constrain retrieval to the collections/documents the actor is allowed to read. Provider results must be mapped back to canonical IDs and rechecked before returning to the browser where practical.

No RAGFlow token, database credential or internal endpoint is exposed to browser code.

## 7. Network and deployment isolation

RAGFlow must run as a separate internal Compose project/runtime, not be merged into the existing Twenty runtime and not share Twenty's data services.

Target isolation:

```text
GBAP main runtime
  web / api / worker / keycloak / twenty provider

GBAP knowledge runtime
  ragflow
  ragflow metadata DB
  ragflow document engine
  ragflow object storage
  ragflow cache/queue dependencies
  ragflow adapter
```

Rules:

```text
separate Compose project
separate volumes
separate secrets
separate internal network
no direct LAN/public publication of RAGFlow UI or data-service ports
only the GBAP knowledge adapter/API receives an approved internal path
no reuse of Twenty PostgreSQL/Redis data instances
no reuse of GBAP SQLite as RAGFlow metadata storage
```

For the first PoU, upstream defaults may be used inside the isolated knowledge runtime (for example Elasticsearch + metadata DB + object storage + Valkey/Redis equivalent) only after port exposure is reduced to internal-only/loopback as appropriate.

## 8. Version and supply-chain rule

Initial PoU is pinned to:

```text
RAGFlow v0.27.2
```

Do not deploy `latest`.

The integration must record:

```text
upstream tag
upstream commit/image digest where available
license
container images
configuration delta
GBAP adapter contract version
```

Upgrade of RAGFlow is a provider-version change and requires focused compatibility verification against `gbap.knowledge.v1`.

## 9. Secrets

Do not commit RAGFlow credentials.

Required provider secrets include generated non-default credentials for all enabled RAGFlow dependencies and the service API credential used by the GBAP adapter.

Preferred GBAP pattern:

```text
runtime-generated secret files
-> read-only mounted into adapter/runtime
-> never returned to browser
-> never written to Git
```

Upstream default passwords are forbidden outside a disposable local PoU.

## 10. Backup / restore boundary

Current GBAP Local-UAT backup authority does not yet prove RAGFlow recovery.

Before installation can be accepted, a knowledge backup/restore runbook must cover the canonical GBAP knowledge records plus every persistent RAGFlow component needed to restore retrieval consistently.

Minimum recovery scope:

```text
GBAP canonical knowledge metadata/mappings/audit
canonical source document bytes or authoritative source locator + checksum
RAGFlow metadata DB
RAGFlow object storage
RAGFlow document/vector/full-text engine persistent data
provider configuration/version manifest
secrets recovery procedure (without committing secrets)
```

Cache-only state may be reconstructible, but this must be proven rather than assumed.

A restore PoU must prove that a known document can be searched and cited after recovery without changing its GBAP canonical document ID.

## 11. Host resource admission gate

Upstream RAGFlow v0.27.2 documents the following self-host prerequisites:

```text
CPU >= 4 cores
RAM >= 16 GB
Disk >= 50 GB
Docker >= 24.0.0
Docker Compose >= 2.26.1
```

Those values are the RAGFlow self-host prerequisite, not proof that the current GBAP Windows UAT host has enough spare capacity while GBAP/Twenty are already running.

Therefore co-location on the current company host is **BLOCKED until measured runtime evidence exists** for:

```text
host CPU / architecture
installed Docker + Compose versions
current GBAP steady-state CPU/RAM usage
available RAM headroom
free disk and expected knowledge growth
Docker Desktop/WSL storage location and capacity
port conflicts
backup destination capacity
```

If safe headroom is not available, the correct action is a separate knowledge host/VM, not reducing GBAP/Twenty reliability.

## 12. PoU acceptance

The first PoU must be deterministic and small. It must not import the company's whole knowledge corpus.

Minimum fixture set:

```text
1 PDF product/technical document
1 DOCX or text document
1 XLSX/structured document where parsing support is required
```

PoU must prove:

```text
1. create canonical GBAP collection/document IDs
2. ingest through GBAP Knowledge Service -> adapter -> RAGFlow
3. provider mapping is durable
4. document reaches indexed/ready state
5. authorized search returns relevant chunks
6. citations map back to canonical GBAP documents
7. unauthorized actor/scope cannot retrieve protected knowledge
8. provider outage fails explicitly without corrupting canonical records
9. delete/archive behavior is retryable and auditable
10. adapter can be disabled/replaced without changing canonical IDs
```

No full Heavy CI is required merely to land this design authority. Runtime implementation will add a focused knowledge-provider acceptance gate before any broader acceptance is considered.

## 13. Gate result

```text
Architecture / ownership boundary     PASS
Provider replaceability               PASS
Human identity boundary               PASS
Authorization boundary                PASS
Browser/token isolation               PASS
V1 capability scope                   PASS
Pinned upstream version               PASS (v0.27.2 for PoU)
Host capacity evidence                 BLOCKED / NOT YET MEASURED
Knowledge backup/restore proof         BLOCKED / NOT YET IMPLEMENTED
Runtime adapter PoU                    BLOCKED / NOT YET IMPLEMENTED
Installation on company UAT host       NOT AUTHORIZED
Production                             NOT AUTHORIZED
```

## 14. Next legal action

Do **not** install RAGFlow yet.

Next legal action is a bounded **Knowledge Provider PoU Foundation**:

```text
1. add `gbap.knowledge.v1` contract
2. add provider-neutral canonical knowledge metadata/mapping schema
3. add a RAGFlow adapter skeleton with secret-file authentication
4. add isolated knowledge Compose/runbook without enabling it in company UAT
5. add deterministic adapter contract tests using a fake provider
6. add real RAGFlow PoU acceptance path for v0.27.2
7. measure the company UAT host before deciding co-location vs separate host/VM
8. add backup/restore proof before real company knowledge ingestion
```

Only after the host-capacity and recovery gates pass may company-UAT installation be authorized.
