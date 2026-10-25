# GBAP Knowledge Document Ingestion V2

Status: **SOURCE IMPLEMENTATION / WINDOWS UAT REQUIRED**

Date: 2026-09-23

Authority scope: enterprise document ingestion for the canonical GBAP Knowledge product. This document does not reopen the frozen RAGFlow version, embedding benchmark, Recovery Gate, ACL model, or Enterprise AI architecture.

## 1. Evidence trigger

Real company-UAT exposed a structural defect in the old PDF path:

- a 17.18 MB / 44-page English product manual completed the RAGFlow Plain Text path in about 40 seconds but produced **0 chunks / 0 tokens**;
- the same source then entered the DeepDOC fallback and failed after roughly 30 minutes on the current CPU-only Windows UAT host;
- the product could therefore present either a fast false success or a very slow terminal failure.

The correction is not another timeout/batch adjustment. Document extraction is separated from RAGFlow retrieval.

## 2. Frozen ownership boundary

GBAP continues to own:

- canonical original bytes and checksum;
- Knowledge document/version IDs;
- collection, ACL, visibility and classification;
- business links;
- ingestion state, audit and recovery;
- provider mapping and replacement semantics.

RAGFlow remains the headless Knowledge retrieval runtime and owns only the normalized searchable representation, chunking, embeddings, retrieval and downstream Knowledge/Agent use. Employees never access the RAGFlow UI directly.

## 3. Accepted ingestion architecture

```text
employee upload / connector source
            |
            v
GBAP canonical original + checksum
            |
            v
local knowledge-extractor (async, persistent)
            |
            +--> parser routing by format
            |
            v
normalized UTF-8 Markdown + extraction metrics
            |
            v
extraction quality gate
            |
            v
RAGFlow dataset document (Markdown only)
            |
            v
chunk + GTE embedding + retrieval
            |
            v
index quality gate (chunks > 0 AND tokens > 0)
            |
            v
GBAP READY / searchable / AI-usable
```

No document is marked READY only because an upstream task says DONE.

## 4. Parser routing

| Source | Primary | Governed fallback |
| --- | --- | --- |
| PDF, digitally generated / complex layout | OpenDataLoader local | PyMuPDF native text |
| PDF, scanned / image-heavy / failed quality gate | OCRmyPDF + Tesseract + OpenDataLoader | fail closed |
| DOCX | python-docx paragraphs, headings, tables | LibreOffice -> PDF -> PDF pipeline |
| XLSX | openpyxl sheets, formulas + cached values, tables | LibreOffice -> PDF -> PDF pipeline |
| PPTX | python-pptx slide text, tables, notes | LibreOffice -> PDF -> PDF pipeline |
| DOCM / XLSM / PPTM | LibreOffice strips executable macro behavior by normalizing to DOCX / XLSX / PPTX | modern parser, then PDF fallback where applicable |
| DOC / XLS / PPT / RTF / ODT / ODS / ODP | LibreOffice to modern Office format | modern parser, then PDF fallback where applicable |
| TXT / MD / CSV / JSON / XML / YAML / LOG / TSV | charset-normalized local text | fail closed |
| HTML / HTM | BeautifulSoup structural text | fail closed |
| EML | Python email parser, plain/HTML body | fail closed |
| EPUB | local XHTML extraction | fail closed |
| PNG / JPG / JPEG / WEBP / TIF / TIFF / BMP | local Tesseract OCR | fail closed |

All extraction is local to the governed runtime. No cloud OCR/parser is introduced.

## 5. Quality gates

Extraction is accepted only when it produces meaningful content. Current conservative UAT rules include:

- non-whitespace character minimum;
- token/content minimum;
- encoding corruption ceiling;
- for PDFs of four or more pages, at least 70% page text coverage when coverage is measurable;
- normalized content hard bound of 8,000,000 characters;
- RAGFlow terminal READY additionally requires at least one chunk and non-zero token count.

A quality failure remains FAILED with the canonical original preserved for retry or future parser upgrades.

## 6. Async lifecycle and recovery

The extractor uses a persistent SQLite job ledger and persistent job storage. Upload returns quickly with a synthetic provider ID:

```text
extractor:<job-uuid>
```

GBAP status requests can observe progress, but **progress does not depend on an open browser**. The API runtime owns a bounded server-side ingestion reconciler that advances PENDING/INDEXING documents every five seconds. Once extraction is accepted:

1. the extractor exposes deterministic normalized Markdown;
2. the adapter uploads it to the owning RAGFlow dataset;
3. RAGFlow parsing/indexing starts;
4. the extractor records the RAGFlow handoff ID;
5. the server-side reconciler atomically changes the canonical provider mapping from the synthetic job ID to the real RAGFlow document ID;
6. the reconciler continues until the document reaches READY, FAILED, or CANCELLED.

Browser polling is therefore only presentation refresh, never an execution dependency.

Interrupted RUNNING extractor jobs are returned to QUEUED on service restart. Deterministic normalized filenames plus persisted handoff IDs prevent normal retries from creating duplicate RAGFlow documents. Provider/network failures remain non-terminal unless the provider supplies terminal evidence; an actual missing provider document is failed closed and can be reconstructed from the preserved canonical original.

## 7. Resource policy

The current company UAT host remains CPU-first and conservative:

- extractor jobs: 1 at a time;
- RAGFlow tasks: 1 at a time;
- embedding batch: 4;
- maximum canonical upload: 25 MiB;
- maximum normalized text: 8,000,000 characters;
- OpenDataLoader wall-clock budget: 600 seconds;
- OCRmyPDF wall-clock budget: 1,200 seconds;
- LibreOffice conversion wall-clock budget: 240 seconds;
- image OCR wall-clock budget: 300 seconds;
- Office/EPUB archive preflight: member-count, individual-size, total-uncompressed-size, traversal, encryption and compression-ratio checks;
- OCR: Tesseract English + Simplified Chinese;
- original files are never replaced by normalized Markdown.

Every external parser process runs in a bounded process group. Timeout kills the complete parser process group instead of leaving orphan Java/OCR/Office processes. Heavy OCR is a last fallback rather than the default path.

The extractor container runs as UID 10001 with all Linux capabilities dropped, `no-new-privileges`, a PID limit, and a dedicated internal Docker network shared only with the governed adapter. It does not join the RAGFlow network and does not receive ordinary internet egress.

Transient extraction state is not authoritative business data. Successfully handed-off extractor jobs are retained for 7 days; failed/cancelled jobs for 30 days. Cleanup never deletes the canonical GBAP source file or canonical Knowledge metadata.

## 8. Employee product behavior

The employee sees one Knowledge upload experience, not parser choices.

Supported files enter the same lifecycle:

```text
原件已保存 -> 文档解析 -> 质量检查 -> 建立索引 -> 可检索
```

Processing history exposes safe business-facing states. Internal parser/provider IDs remain implementation details. Search and AI answers continue to resolve citations back to the canonical GBAP Knowledge document and its ACL boundary.

## 9. Failure semantics

Fail closed:

- extractor unavailable -> Knowledge health is not READY;
- parser quality insufficient -> FAILED, never false READY;
- normalized handoff fails -> INDEXING/FAILED according to evidence, original preserved;
- RAGFlow returns DONE with zero chunks/tokens -> FAILED;
- provider mapping changes only through the governed reconciliation path;
- archive/retry preserves canonical audit and cleanup semantics.

No `docker compose down -v`, broad re-ingest, Recovery Gate reopen, embedding-model change, or Production authorization is part of this change.

## 10. Acceptance gate

Source acceptance requires all of:

- PowerShell/Node/Python syntax gates;
- extractor quality-unit gate;
- extractor -> RAGFlow handoff state-machine gate;
- real Docker image build;
- image dependency checks (Java, OCR, LibreOffice);
- real synthetic PDF/DOCX/XLSX/PPTX parser smoke inside the built image;
- Knowledge UI/runtime/provider focused CI.

After merge, Windows UAT must prove the deployed extractor is READY and then validate, without re-uploading the canonical source:

1. the previously failed 17.18 MB / 44-page English product manual;
2. one representative DOCX;
3. one representative XLSX;
4. retrieval of known source facts with non-zero chunks/tokens and canonical document citations.

Only after those witnesses pass may this ingestion v2 path be accepted for normal company UAT use.

Production remains **NOT AUTHORIZED**.
