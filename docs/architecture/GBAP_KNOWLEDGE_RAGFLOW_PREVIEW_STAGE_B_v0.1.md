# GBAP Enterprise Knowledge — RAGFlow Preview Stage B v0.1

2026-10-03 security candidate delta: the read-only PDF adaptation now uses pinned
stable PDF.js 6.3.289 directly. The unused legacy highlighter wrapper/worker and
obsolete direct SheetJS parser are retired. Worker/fonts/CMaps/WASM/license are
copied from the same package at build time. Office preview adds bounded ZIP
expansion. Existing canonical source/ACL and upstream attribution remain.
Formal cache admission and owner UAT are still open; see
`docs/evidence/GBAP_ENTERPRISE_UI_SECURITY_AUDIT_2026_10_03.md`.


Status: **PASS / MERGED / CLOSED / WINDOWS UAT NEXT**

Date: 2026-09-19

Upstream baseline:
- RAGFlow v0.27.2
- commit `a024bea0cd93f39e6652a42bf84dd20c55bc560b`
- Apache License 2.0

Prerequisites:
- CI Governance v0.9 RE-FROZEN / PASS / CLOSED
- npm supply manifest v2 active
- seven preview dependencies advance-admitted and cached offline

## 1. Objective

Directly port/adapt mature RAGFlow document-preview components into the native GBAP Knowledge product without exposing the RAGFlow employee UI, provider IDs, provider endpoints or provider auth.

Permanent authority remains:

```text
GBAP identity / ACL
GBAP canonical Collection / Document / Version IDs
GBAP canonical source bytes + checksums
GBAP business links / audit / recovery
RAGFlow preview engine code = reusable frontend implementation only
```

Every preview receives already-authorized bytes from:

`GET /api/knowledge/documents/:id/source`

No preview component receives or constructs a RAGFlow document URL.

## 2. Direct upstream ports

| GBAP component | RAGFlow upstream | Engine retained | Main GBAP adaptation |
|---|---|---|---|
| `RagflowDocxPreview.tsx` | `web/src/components/document-preview/doc-preview.tsx` | `@extend-ai/react-docx`, CJK default-line-spacing normalization | canonical Blob input, GBAP CSS/buttons, no RAGFlow request/auth/message |
| `RagflowExcelPreview.tsx` | `excel-preview.tsx` + `hooks.ts` | `@js-preview/excel`, WPS DISPIMG stripping, namespace normalization, sheet-name sanitation | canonical Blob input, native ResizeObserver, no axios/ahooks/RAGFlow URL |
| `RagflowPptxPreview.tsx` | `ppt-preview.tsx` | `pptx-preview` | canonical Blob input, native resize rerender |
| `RagflowPdfPreview.tsx` | `pdf-preview.tsx` | `react-pdf-highlighter` | local canonical Blob URL, read-only highlights, no auth header/provider URL |
| `RagflowMarkdownPreview.tsx` | `md/index.tsx` | `react-markdown` | canonical source text input, GBAP typography |
| `pdf.worker.min.js` | `web/public/pdfjs-dist/pdf.worker.min.js` | exact pinned PDF.js worker | vendored locally so runtime has no CDN/network dependency |

All adapted source files preserve the InfiniFlow Apache 2.0 header and record the pinned upstream commit/path.

Pinned upstream worker blob SHA:

`34588aa106983006eb8090666852c7dbb6adf190`

## 3. Admitted dependencies consumed

```text
@extend-ai/react-docx   ^0.6.7
@js-preview/excel      ^1.7.14
pptx-preview           ^1.0.5
react-pdf-highlighter  ^6.1.0
react-markdown         ^9.0.1
jszip                  ^3.10.1
xlsx                   ^0.18.5
```

No package outside the CI v0.9 admission manifest is added.

Normal CI still installs these strictly from the validated offline supply.

## 4. Product dispatcher

`KnowledgeDocumentPreview.tsx` becomes the provider-neutral dispatcher:

```text
canonical source
├─ PDF  -> RAGFlow PdfHighlighter port
├─ DOCX -> RAGFlow react-docx port
├─ XLSX -> RAGFlow Excel port
├─ PPTX -> RAGFlow pptx-preview port
├─ MD   -> RAGFlow react-markdown port
├─ image -> native image display
├─ TXT/CSV/JSON/LOG -> bounded text display
└─ legacy DOC/XLS/PPT + deferred media -> explicit unsupported state
```

Legacy binary Office formats are not falsely treated as modern OOXML.

Text/Markdown preview remains bounded to 2 MiB in-browser.

## 5. Browser proof

Dedicated Playwright uses canonical-source API mocks and real renderer libraries.

Runtime fixtures:

- Markdown: real source text rendered through `react-markdown`;
- XLSX: real workbook generated with SheetJS and rendered through `@js-preview/excel`;
- PDF: valid generated PDF loaded through the pinned local PDF.js worker and `react-pdf-highlighter`;
- DOCX: real OOXML ZIP fixture parsed through `@extend-ai/react-docx`.

PPTX has compile/runtime component integration in this batch but does not claim a complete synthetic PPTX render witness until either:
- a stable governed PPTX fixture is added; or
- Windows UAT proves preview against a real non-sensitive PPTX.

That limitation must remain explicit.

## 6. Security / authority rules

- source endpoint authorization occurs before bytes reach the component;
- browser receives no RAGFlow provider token;
- browser receives no provider document ID;
- preview code contains no RAGFlow REST endpoint;
- object URLs are local browser URLs and are revoked when appropriate;
- PDF worker is local;
- no public CDN is used;
- preview failure never downgrades source/download authority.

## 7. Acceptance Gate

Accepted PR:

`#249 feat: port RAGFlow document previews into GBAP Knowledge`

Accepted exact head:

`9f92b2438c57979107de8101b7b08ed67e0be36a`

Merged main:

`169e0f4f8f84f5f4c9001d28b62b2fa81494b025`

Exact-head affected gates:

```text
GBAP PR Fast CI                         run 35438504643 PASS
GBAP VM-Only Runner Capacity Proof      run 35438504655 PASS
Stage 3.7 Real-Use Feedback Acceptance run 35438504642 PASS
Knowledge Productization V2 Acceptance run 35438504649 PASS
Knowledge UI V2 Browser Acceptance     run 35438504650 PASS
Heavy Final                            NOT RUN / NOT REQUIRED
```

The production web build, React 19 typecheck and dedicated desktop/mobile Knowledge browser acceptance all passed on the exact accepted head.

If a third-party preview library proves incompatible with React 19, the failure must be bounded and documented; do not replace it with a newly invented parser merely to make the UI appear complete.

## 8. Non-claims

Stage B does not claim:

- legacy `.doc/.xls/.ppt` preview;
- EPUB/video preview;
- editable Office documents;
- Chunk inspection/editing;
- parser/profile changes;
- metadata retrieval filters;
- advanced rerank controls;
- Windows UAT visual acceptance;
- a real PPTX preview witness;
- Production authorization.

AI Assistant remains a separate later topic.

Production remains **NOT AUTHORIZED**.


## 9. Closure

Stage B is **CLOSED / PASS**.

The next legal action is company Windows UAT installation/read-back followed by real Knowledge preview/use validation for:
- PDF;
- DOCX;
- XLSX;
- Markdown;
- PPTX using a non-sensitive real sample if available;
- responsive/visual behavior;
- source download fallback.

No further source changes should be mixed into that UAT unless the real host reveals a bounded defect.

Production remains **NOT AUTHORIZED**.
