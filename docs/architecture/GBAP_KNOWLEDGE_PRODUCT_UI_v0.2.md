# GBAP Enterprise Knowledge UI v0.2

Status: **IMPLEMENTED / EXACT-HEAD CI PASS / MERGED / WINDOWS VISUAL UAT NEXT**

Date: 2026-09-19

## 1. Purpose

This product layer completes the employee-facing Enterprise Knowledge experience on top of the already accepted `gbap.knowledge.v1` boundary. It does not reopen RAGFlow/GTE retrieval, source authority, ACL, recovery, or provider selection.

The employee product remains:

```text
Employee
  -> GBAP Enterprise Knowledge UI
  -> GBAP identity / ACL / canonical Knowledge APIs
  -> headless replaceable RAGFlow retrieval provider
```

RAGFlow's technical administration UI is not an employee product surface.

## 2. Explicit scope boundary

This iteration is **Knowledge Base productization only**.

Included:
- knowledge home / operational overview;
- knowledge-space navigation;
- all-accessible-knowledge view;
- document center;
- drag/drop and multi-file batch upload through the existing canonical ingest API;
- document search/filter/sort/selection;
- bounded bulk retry and archive within a manageable knowledge space;
- document detail;
- canonical version history;
- ingestion/processing history;
- original-source download;
- persisted business links;
- cross-collection or current-collection retrieval;
- collection settings;
- collection ACL governance;
- business-facing health/status;
- desktop/tablet/mobile layouts.

Excluded:
- AI assistant/chat;
- generative model/provider configuration;
- agent workflows;
- RAGFlow parser/chunk/model technical controls;
- fake popularity metrics, fake usage analytics, or unsupported nested-folder semantics.

AI is a separate future product topic and is not part of this UI Gate.

## 3. Information architecture

```text
Enterprise Knowledge
├─ Overview
│  ├─ knowledge-space count
│  ├─ ready document count
│  ├─ last-7-day updates
│  ├─ processing / failures
│  ├─ knowledge spaces
│  └─ recent updates
├─ Document Center
│  ├─ title/file search
│  ├─ state/type/sort filters
│  ├─ batch upload
│  ├─ document selection
│  ├─ retry/archive operations
│  └─ document inspector
│     ├─ overview
│     ├─ versions
│     ├─ processing history
│     └─ business links
├─ Knowledge Search
│  ├─ all accessible knowledge
│  ├─ current knowledge space
│  └─ canonical source result navigation
└─ Permissions & Governance
   ├─ collection settings
   ├─ classification / visibility
   ├─ ACL
   ├─ business-facing health
   └─ governed archive
```

## 4. Data truth

No new fake backend has been created. The UI consumes the accepted canonical APIs and derives only bounded presentation values from real fields:
- recent updates from `updatedAt`;
- state counts from canonical document ingestion state;
- versions from `knowledge_document_version`;
- processing history from `knowledge_ingestion_run`;
- business links from `knowledge_business_link`;
- access governance from collection ACL;
- search results from `gbap.knowledge.v1`.

Batch upload is a client-side bounded sequence over the existing canonical upload operation: maximum 20 selected files in one UI batch, with the existing 25 MB per-file ceiling. Failed items are not reported as successful.

## 5. Product rules

1. GBAP remains the employee-facing authority.
2. Provider-specific IDs/endpoints/tokens are never exposed.
3. Retrieval is explicitly distinguished from future AI-generated answering.
4. Employees can browse and search all Knowledge they are authorized to read.
5. Destructive bulk actions are available only inside a selected Knowledge space the actor can manage.
6. Search/filters/sorting are usability functions; they do not change canonical authorization.
7. Responsive layouts must preserve the same functional contracts.
8. Production remains NOT AUTHORIZED.

## 6. Acceptance

Required focused evidence:
- web TypeScript/build PASS;
- Knowledge UI V2 product-contract self-test PASS;
- existing Knowledge Productization V1 API/source/ACL lifecycle proof PASS;
- Fast CI PASS;
- no Heavy Final rerun unless an unrelated evidence trigger requires it.


## 7. Accepted implementation evidence

PR: #243 `feat: complete enterprise Knowledge UI v2 productization`

Accepted exact head:

`ea4032841dbe74e12593bdb0a9e7161c7433ec0f`

Merged main:

`0b22d5f11e83b37c5e0f7f831f2e704629b7f593`

Exact-head affected gates:

```text
GBAP PR Fast CI                         PASS / run 35420853615
Knowledge Productization V2 Acceptance PASS / run 35420853613
Stage 3.7 Real-Use Feedback Acceptance PASS / run 35420853603
GBAP VM-Only Runner Capacity Proof     PASS / run 35420853632
Heavy Final                            NOT RUN / NOT REQUIRED
```

GitHub remote read-back after merge proved `main == 0b22d5f11e83b37c5e0f7f831f2e704629b7f593`.

The next validation is a governed Windows UAT update followed by operator visual/use verification of the new Knowledge UI. That host verification is separate from source/CI acceptance and does not reopen the frozen retrieval/runtime Gate.
