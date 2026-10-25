# GBAP GBAP｜Knowledge / RAGFlow Integration Gate v0.2

Status: **RE-FROZEN / REAL RUNTIME POU PASS / COMPANY-UAT INSTALLATION GATE BLOCKED**

Date: 2026-09-18

Repository: `hhhh666-888/global-business-ai-platform`

Frozen predecessor: `docs/architecture/GBAP_KNOWLEDGE_RAGFLOW_INTEGRATION_GATE_v0.1.md`

Accepted runtime baseline: PR #209 merge `ce6fdbdcdd73e8e108a8ce477264c087794e040c`

Selected provider for the bounded implementation line: `infiniflow/ragflow` `v0.27.2`, upstream commit `a024bea0cd93f39e6652a42bf84dd20c55bc560b`.

## 1. REOPEN scope and closure

v0.1 passed the architecture/ownership/identity/authorization/provider-replaceability design boundary but intentionally left three installation prerequisites blocked:

```text
real provider runtime PoU
company-UAT host-capacity evidence
knowledge backup/restore proof
```

PR #208 implemented the provider-neutral foundation and deterministic fake-provider acceptance.

PR #209 implemented and passed the real RAGFlow runtime proof. Therefore this v0.2 closes the **runtime provider PoU** blocker only.

The following remain blocked and are not reinterpreted as passed:

```text
company-UAT host admission
knowledge backup/restore
production multilingual retrieval-model admission
employee-facing enterprise knowledge product completion
company knowledge ingestion
Production Go-Live
```

## 2. Permanent ownership boundary remains unchanged

GBAP/GBAP remains the authority for:

```text
ONE employee UI / UX
Keycloak human identity
authorization and knowledge ACL decisions
canonical KnowledgeCollection / KnowledgeDocument IDs
source authority and lifecycle
business relations
provider mappings / provenance / audit
Agent-facing knowledge contract
```

RAGFlow remains:

```text
headless
internal
replaceable
not a human identity authority
not an employee product UI
not a workflow/Agent authority
not a CRM/business-data authority
```

Employee/browser code must call GBAP Knowledge APIs. Raw RAGFlow credentials, internal endpoints and provider IDs must not become browser authority.

## 3. Canonical contract

The current provider-neutral contract remains:

```text
gbap.knowledge.v1
```

Accepted minimum capabilities:

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

PR #208 proved the canonical provider-neutral storage/mapping/ACL path with a deterministic fake provider.

PR #209 proved the same boundary against the real RAGFlow v0.27.2 runtime.

## 4. Accepted real-runtime evidence

Accepted PR:

```text
PR #209
title       feat: prove real RAGFlow knowledge runtime
exact head  228e47bf2886aff759fb8bd78cd4acbd9da01d8c
merge       ce6fdbdcdd73e8e108a8ce477264c087794e040c
```

Accepted exact-head workflows:

```text
GBAP PR Fast CI                         #830  PASS
Knowledge Provider Foundation           #17   PASS
Knowledge RAGFlow Real Runtime          #15   PASS
run id                                        35259137578
job                                           105330159740
```

The real runtime Gate used:

```text
RAGFlow        v0.27.2
upstream commit a024bea0cd93f39e6652a42bf84dd20c55bc560b
document engine Infinity
embedding PoU  BAAI/bge-small-en-v1.5@Builtin
data policy    SYNTHETIC_FIXTURES_ONLY
```

The Gate started the real RAGFlow runtime and proved real parsing/indexing/retrieval for:

```text
PDF
DOCX
XLSX
```

The final test emitted:

```text
gate    KNOWLEDGE_RAGFLOW_REAL_RUNTIME
result  PASS
```

It returned canonical GBAP document identities and source titles for all three fixtures and completed the provider-outage/canonical-state acceptance path defined by PR #209.

This evidence proves functional provider integration. It does **not** prove production retrieval quality for Chinese/English/Spanish because the PoU deliberately used a lightweight English embedding model.

## 5. CI runtime incident and accepted correction

Earlier real-runtime attempts exposed two infrastructure facts:

1. cancelled PoU runs left `gbap-ragflow-pou-*` containers/volumes/networks behind;
2. after stale-runtime cleanup the VM PRIMARY had only about 7.2 GiB physical RAM available to the guest, below the PoU's governed 10 GiB minimum.

Accepted repair:

```text
pre-run stale PoU cleanup
+ post-run PoU cleanup
+ fail-fast resource floor before heavyweight image pull
+ run this independent resource-bound Provider PoU on accepted WSL overflow runner
```

CI Governance v0.7 remains unchanged:

```text
GBAP-CI-VM-CANDIDATE  PRIMARY / normal Final authority
GBAP-CI-01 / WSL      BACKUP / OVERFLOW / diagnostics
```

The RAGFlow Provider PoU running on WSL overflow does **not** authorize normal GBAP Final/Heavy execution on WSL and does not change the VM-primary Final topology.

The 10 GiB PoU threshold is only a CI fail-fast guard. It does not replace RAGFlow's company self-host resource prerequisite or company-UAT headroom admission.

## 6. Company-UAT host admission remains blocked

Before real company-UAT installation, measure the actual company Windows host and existing GBAP/Twenty steady state.

Minimum evidence still required:

```text
host CPU / architecture
total and available RAM
GBAP/Twenty steady-state CPU/RAM
Docker Desktop / WSL resource allocation
free disk + expected knowledge growth
Docker/Compose versions
knowledge-runtime storage location
port conflicts
backup destination capacity
```

The upstream self-host baseline recorded by v0.1 remains:

```text
CPU >= 4 cores
RAM >= 16 GB
Disk >= 50 GB
Docker >= 24
Docker Compose >= 2.26.1
```

If safe co-location headroom is insufficient, deploy the knowledge runtime on a separate Knowledge VM/host. Do not weaken GBAP/Twenty reliability merely to co-locate RAGFlow.

## 7. Backup/restore remains blocking

No real company knowledge may be admitted until recovery is proven.

The next recovery implementation must cover:

```text
GBAP canonical knowledge metadata
provider mappings and audit
canonical source document bytes + checksum
RAGFlow metadata DB
RAGFlow object storage
RAGFlow document/vector/full-text engine data
provider/version/config manifest
secret recovery procedure without committing secrets
```

Restore acceptance must prove:

```text
known canonical KnowledgeDocument ID before backup
-> restore
-> same canonical KnowledgeDocument ID after restore
-> document READY/searchable
-> citation maps to the same canonical source
```

## 8. Productization requirements before "enterprise knowledge base complete"

A real GBAP enterprise knowledge product still requires GBAP-owned product capabilities above the provider:

```text
native GBAP knowledge navigation/page
collection create/edit/archive
document upload + source authority
document status/version/checksum/duplicate handling
retryable ingestion failure
ACL/classification management
business links to company/opportunity/product/project/case/country
search with canonical citations
document detail/source metadata
provider health/operations view
audit/provenance
backup/restore operations
multilingual retrieval quality Gate
Agent access through gbap.knowledge.v1
```

RAGFlow's own employee-facing UI must remain hidden from ordinary GBAP users.

## 9. Multilingual retrieval admission

The PoU embedding model is not the final production model.

Before company knowledge admission, run a controlled Chinese/English/Spanish retrieval benchmark against at least the selected multilingual candidates supported by the pinned runtime, then freeze the chosen model/configuration based on evidence.

The benchmark must measure, at minimum:

```text
top-k hit rate
source/citation correctness
cross-language query behavior
numeric/model-number retrieval
table/spreadsheet retrieval
product-manual terminology
latency/resource cost on the admitted host
```

Changing the embedding model after documents are indexed requires a governed re-index/migration plan.

## 10. Updated Gate result

```text
Architecture / ownership boundary      PASS
Provider replaceability                PASS
Human identity boundary                PASS
Authorization boundary                 PASS
Browser/token isolation                PASS
gbap.knowledge.v1 foundation        PASS
Real RAGFlow v0.27.2 runtime PoU       PASS
PDF/DOCX/XLSX real parsing/retrieval   PASS
Provider outage/canonical-state path   PASS
PoU cleanup / CI resource guard        PASS
Company-UAT host-capacity evidence     BLOCKED / NOT YET MEASURED
Knowledge backup/restore proof         BLOCKED / NOT YET IMPLEMENTED
Production multilingual model          BLOCKED / NOT YET ACCEPTED
Native enterprise knowledge product    IN PROGRESS / NOT YET COMPLETE
Real company knowledge ingestion       NOT AUTHORIZED
Company-UAT knowledge installation     NOT AUTHORIZED
Production                             NOT AUTHORIZED
```

## 11. Next legal mainline

The next legal implementation line is **Knowledge Productization + Recovery + UAT Admission**:

```text
1. add canonical source-file storage/lifecycle and retryable document lifecycle
2. implement knowledge backup/restore runbook + deterministic restore PoU
3. implement company-UAT host-capacity admission probe/runbook
4. build the native GBAP enterprise knowledge UI and ACL operations
5. add multilingual retrieval-quality acceptance and freeze the UAT embedding model
6. wire the admitted isolated knowledge runtime into Local UAT
7. deploy through governed updater/knowledge runbook
8. validate real employee upload/search/citation/permissions/restart/recovery
9. only then admit a bounded first batch of real company knowledge
10. expose the shared knowledge service to GBAP Agents through gbap.knowledge.v1
```

Production Go-Live remains a separate authority decision.
