# GBAP Enterprise Knowledge｜RAGFlow v0.27.2 Reuse Map v0.1

Status: **ACTIVE / IMPLEMENTATION BASELINE**

Date: 2026-09-19

Upstream product:
- RAGFlow v0.27.2
- pinned upstream commit: `a024bea0cd93f39e6652a42bf84dd20c55bc560b`
- license: Apache License 2.0

GBAP product authority remains:
- GBAP employee UI/UX;
- Keycloak identity and roles;
- Knowledge ACL and classification;
- canonical Collection / Document / Version IDs;
- canonical source bytes and checksums;
- business relations;
- audit and recovery authority;
- provider mappings.

RAGFlow remains headless/internal/replaceable for parsing, chunks, indexing and retrieval.

## 1. Reuse rule

```text
ASSEMBLY FIRST
→ REUSE FIRST
→ INTEGRATE FIRST
→ BUILD LAST
```

The Knowledge product must not invent a competing UI/workflow when RAGFlow already has a mature, proven equivalent. Every feature is classified into one of five reuse modes:

1. **PORT_NOW** — copy the interaction/product pattern immediately with current GBAP dependencies and canonical APIs.
2. **DIRECT_PORT_AFTER_SUPPLY** — directly port/adapt RAGFlow frontend code after the governed CI dependency supply contains the required upstream libraries.
3. **PROVIDER_EXTENSION** — reuse the actual RAGFlow backend capability through a succeeding provider-neutral GBAP contract/capability; do not expose RAGFlow IDs/endpoints to browsers.
4. **GBAP_NATIVE_KEEP** — keep the GBAP implementation because it is enterprise authority that RAGFlow must not own.
5. **EXCLUDE_EMPLOYEE_UI** — upstream technical control stays hidden from normal employees and may only appear in an administrator advanced surface if governed.

## 2. Source-level mapping

| RAGFlow v0.27.2 upstream surface | Exact upstream source | Mature behavior to reuse | GBAP mode | GBAP state / action |
|---|---|---|---|---|
| Dataset / Knowledge overview | `web/src/pages/dataset/dataset-overview/index.tsx` | total files, processing/success/failure cards, operational log overview | PORT_NOW | Existing GBAP Overview retained; make metrics scope-truthful and operational |
| Dataset document table | `web/src/pages/dataset/dataset/use-dataset-table-columns.tsx` | selection, file name, upload date, enable state, chunk count, metadata, parser, parse status, actions | PORT_NOW + PROVIDER_EXTENSION | Current document table keeps canonical data; chunk count/parser/metadata only appear after real capability exists |
| Parse status/progress | `web/src/pages/dataset/dataset/parsing-status-cell.tsx` | queued/running/progress/fail/success, retry/stop, log drill-down | PORT_NOW + PROVIDER_EXTENSION | Current READY/INDEXING/FAILED retained; enrich status/log UX now; progress/stop require provider extension |
| Process log modal | `web/src/pages/dataset/process-log-modal.tsx` | task/file/status/start/end/duration/details | PORT_NOW | Map canonical `knowledge_ingestion_run` into RAGFlow-like processing log detail |
| Retrieval testing | `web/src/pages/dataset/testing/testing-form.tsx` + `web/src/pages/dataset/testing/testing-result.tsx` | query, threshold, top-K, result chunks, source filter, similarity display | PORT_NOW | Add manager/admin Retrieval Test using existing `searchKnowledge(topK, minimumScore)`; advanced rerank/vector/cross-language later |
| Document preview dispatcher | `web/src/components/document-preview/index.tsx` | PDF/DOCX/TXT/image/PPT/XLSX/CSV/Markdown/EPUB/video dispatch | DIRECT_PORT_AFTER_SUPPLY | Stage B COMPLETE for PDF/DOCX/XLSX/PPTX/Markdown + native image/text fallback; EPUB/video remain deferred |
| PDF preview | `web/src/components/document-preview/pdf-preview.tsx` | page rendering and highlight navigation | DIRECT_PORT_AFTER_SUPPLY | COMPLETE in PR #249 using `react-pdf-highlighter` + pinned local PDF.js worker + canonical Blob |
| DOCX preview | `web/src/components/document-preview/doc-preview.tsx` | read-only page rendering, zoom, modern DOCX validation | DIRECT_PORT_AFTER_SUPPLY | COMPLETE in PR #249 using `@extend-ai/react-docx`; preserves CJK line-spacing normalization |
| Excel preview | `web/src/components/document-preview/excel-preview.tsx` | spreadsheet preview | DIRECT_PORT_AFTER_SUPPLY | COMPLETE in PR #249 using `@js-preview/excel`; preserves WPS/namespace/sheet-name protections |
| PPT preview | `web/src/components/document-preview/ppt-preview.tsx` | slide preview | DIRECT_PORT_AFTER_SUPPLY | INTEGRATED in PR #249 using `pptx-preview`; real PPTX witness remains Windows UAT / stable fixture follow-up |
| Markdown preview | `web/src/components/document-preview/md/index.tsx` | rendered Markdown | DIRECT_PORT_AFTER_SUPPLY | COMPLETE in PR #249 using `react-markdown` + canonical text |
| Chunk page | `web/src/pages/chunk/index.tsx` | parsed result / chunk result / result view navigation | PROVIDER_EXTENSION | Add provider-neutral chunk list/read/edit Gate; browser never receives raw provider chunk IDs |
| Chunk cards/editing | `web/src/pages/chunk/parsed-result/.../knowledge-chunk` | inspect/edit chunks, tags/features | PROVIDER_EXTENSION | Later succeeding contract; canonical audit required |
| Reparse workflow | `web/src/pages/dataset/dataset/reparse-dialog.tsx` | re-run parse, optionally delete old chunks, metadata handling | PROVIDER_EXTENSION | Current retry only re-ingests same source; real reparse options need explicit provider capability |
| Change parser / pipeline | `web/src/pages/dataset/dataset/change-parser-dialog.tsx` | change parser/chunk method per document | PROVIDER_EXTENSION + EXCLUDE_EMPLOYEE_UI | Administrator advanced only; provider-neutral profile, not raw RAGFlow control |
| Document metadata | `web/src/pages/dataset/dataset/set-meta-dialog.tsx` + metadata components | edit document metadata, retrieval filter fields | PROVIDER_EXTENSION + GBAP_NATIVE_KEEP | Enterprise metadata semantics should be canonical in GBAP, mirrored to RAGFlow for retrieval |
| Dataset configuration | `web/src/pages/dataset/setting/python/index.tsx` | base info, parser/chunk method, pipeline, source connectors | EXCLUDE_EMPLOYEE_UI + PROVIDER_EXTENSION | Normal employees do not see embedding/provider/parser internals; advanced admin layer later |
| Data source connectors | dataset setting source components | link source connectors and auto-parse | PROVIDER_EXTENSION | Later provider/source-ingest topic |
| Knowledge compilation / Wiki / Graph | `web/src/pages/dataset/compilation/*` | generated wiki/tree/graph/version history | DEFERRED PROVIDER_EXTENSION | Not required for first enterprise Knowledge completion |
| Knowledge ACL / business relation / canonical versions / recovery | GBAP native | enterprise authority beyond RAGFlow | GBAP_NATIVE_KEEP | Keep native GBAP authority |

## 3. First implementation batch

This batch deliberately requires **no new npm dependencies**, because normal CI installs from a sealed offline supply archive and rejects an ungoverned package.json change.

### 3.1 Retrieval Test

RAGFlow pattern reused:
- separate test surface;
- test question;
- minimum similarity threshold;
- Top-K result count;
- source document;
- score;
- source page/section;
- result chunk text.

Initial GBAP controls:
- scope: current Knowledge space or all authorized Knowledge;
- minimum score: 0.00–1.00;
- top-K: 3 / 5 / 10 / 20 / 50;
- result filtering by source document.

Not yet exposed:
- vector/term weighting;
- reranker model selection;
- cross-language model controls;
- raw RAGFlow metadata filters.

Those require a provider-neutral succeeding contract.

### 3.2 Processing log

RAGFlow pattern reused:
- status;
- start time;
- finish time;
- duration;
- business-safe detail;
- current document/version context.

Raw provider messages/IDs remain hidden.

### 3.3 Document preview

Use GBAP canonical source bytes, not provider-local document URLs.

Accepted Stage B after CI Governance v0.9 supply admission:
- PDF via the RAGFlow `react-pdf-highlighter` pattern and pinned local worker;
- DOCX via `@extend-ai/react-docx`;
- XLSX via `@js-preview/excel`;
- PPTX via `pptx-preview` integration;
- Markdown via `react-markdown`;
- images via native object URL;
- TXT/CSV/JSON/LOG via bounded safe text preview.

Legacy DOC/XLS/PPT, EPUB and video remain explicit non-claims.

## 4. Dependency-supply Gate for direct frontend ports

RAGFlow's preview layer depends on packages that GBAP does not currently have in its sealed CI supply, including:
- `@extend-ai/react-docx`;
- `@js-preview/excel`;
- `pptx-preview`;
- `react-pdf-highlighter`;
- `react-markdown`;
- related PDF.js/assets.

GBAP normal CI explicitly verifies `apps/web/package.json` against the governed supply manifest and installs with `npm --offline`.

Therefore direct source porting must use this order:

```text
1. approve dependency list/version/license
2. refresh governed CI npm supply
3. freeze new supply manifest/hash
4. add package.json dependencies
5. port RAGFlow source with upstream Apache headers preserved
6. add focused browser tests
7. only then merge
```

Bypassing the supply gate with online npm fallback is forbidden.

## 5. Apache 2.0 reuse requirements

When RAGFlow source is directly copied or adapted:
- keep the upstream copyright/license header in the adapted source file;
- preserve Apache 2.0 license obligations;
- record the upstream file path and pinned commit in the GBAP source comment or evidence;
- document material modifications;
- do not claim GBAP authored the reused upstream source.

Mere product-pattern reuse without source copying is documented in this map but does not falsely present upstream source as copied code.

## 6. Employee vs administrator UX

```text
Employee
├─ Knowledge overview
├─ Knowledge spaces
├─ documents
├─ preview
├─ search
└─ source/citation

Manager / Knowledge manager
├─ employee functions
├─ upload
├─ retrieval test
├─ processing logs
├─ business links
└─ ACL/governance

Advanced administrator (future)
├─ parser/chunk profile
├─ metadata schema/filter mapping
├─ reparse controls
├─ chunk inspection/edit
├─ source connectors
└─ provider/runtime diagnostics (business-safe abstraction only)
```

Direct RAGFlow technical UI, provider tokens, provider IDs and raw endpoints remain outside the employee product.

## 7. Non-claims

This map does not claim that every upstream RAGFlow feature is already implemented in GBAP.

In particular the following remain later work:
- real Windows preview/use validation, including a real non-sensitive PPTX witness;
- legacy DOC/XLS/PPT and EPUB/video preview if a business requirement justifies them;
- provider-neutral chunk list/edit;
- real parser/chunk-method change;
- advanced retrieval/rerank controls;
- metadata schema/filter synchronization;
- source connectors;
- compilation/Wiki/Graph features.

AI Assistant remains a separate later topic.
Production remains **NOT AUTHORIZED**.
