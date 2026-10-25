# GBAP Enterprise Knowledge Product UI v0.3

Status: **RE-FROZEN / PASS / MERGED / WINDOWS VISUAL UAT DEFERRED BY RAGFLOW REUSE MAINLINE**

Date: 2026-09-19

Preceding accepted authority:
- `GBAP_KNOWLEDGE_PRODUCT_UI_v0.2.md`
- PR #243 exact-head PASS
- PR #243 merged baseline `0b22d5f11e83b37c5e0f7f831f2e704629b7f593`

Reverse-audit evidence:
- `docs/evidence/GBAP_KNOWLEDGE_UI_V2_REVERSE_AUDIT_2026-09-19.md`

## 1. Reason for REOPEN

Source/API review after v0.2 acceptance identified bounded defects in:
- asynchronous document-selection correctness;
- scoped overview truth;
- upload/retry/archive status truthfulness;
- collection-creation governance;
- sensitive visibility;
- provider/internal-detail isolation;
- accessibility;
- Knowledge-specific browser regression evidence.

The frozen RAGFlow/GTE retrieval/runtime/recovery authority is **not** reopened.

## 2. Corrected product boundary

The employee Knowledge product must satisfy:

```text
employee
  read/search authorized Knowledge
  download authorized source
  no provider IDs/tokens/internal provider diagnostics

manager
  employee rights
  + create governed Knowledge spaces
  + manage owned Knowledge spaces and their ACL/content

super-admin
  manager rights
  + platform-wide Knowledge administration
```

Existing collection owners keep their current ownership/manage authority so this correction does not orphan previously created collections.

## 3. Security rules

```text
PUBLIC / INTERNAL classification     may use INTERNAL / PRIVATE / RESTRICTED visibility
CONFIDENTIAL / RESTRICTED            MUST NOT use company-wide INTERNAL visibility
browser API                           must expose business-safe Knowledge state only
provider IDs/details                  internal/audit/runtime only
raw owner Subject/scope IDs           internal only unless a future explicit product need is approved
```

Classification is still not a substitute for authorization; visibility + ACL remain the actual access controls.

## 4. Product truth rules

- A canonical source saved with failed provider indexing is **not** displayed as fully successful indexing.
- Batch outcomes report success / canonical-only / request-failure separately.
- Overview counts reflect the currently selected Knowledge scope.
- “recent activity” is based on canonical `updatedAt`, not falsely described as content-edit history.
- stale asynchronous document detail must never overwrite the current selection.
- Provider raw error text must not reach employee product responses.

## 5. CI rules

The Knowledge product has its own browser Gate:
- desktop Knowledge workflow;
- mobile Knowledge workflow;
- exact PR head;
- governed VM browser runtime;
- no browser download fallback;
- production web build before Playwright.

Existing Knowledge lifecycle/source/ACL proof remains required.

## 6. Completeness declaration

v0.3 does **not** declare the whole enterprise Knowledge product comprehensive.

The following remain explicitly unimplemented and are tracked by the reverse-audit evidence:
- mutable document versions;
- archive browser/restore;
- server pagination;
- contributor/editor ACL;
- human-readable SUBJECT picker;
- searchable business relation picker;
- retention/expiry;
- advanced taxonomy;
- measured usage analytics;
- future multi-org/workspace isolation;
- wider real-format acceptance.

Those require succeeding governed product work rather than cosmetic claims.

Production remains **NOT AUTHORIZED**.


## 7. Reverse-audit acceptance evidence

PR #245: `fix: harden Knowledge UI v2 after reverse audit`

Accepted exact head:

`57e58c803a37efe84a27649841282a1ae0770971`

Merged main:

`efae9cd2befa9aca62a927a16d6ae8bd99e56530`

Exact-head affected gates:

```text
Knowledge Productization V2 Acceptance        PASS
Knowledge UI V2 Browser Acceptance            PASS
Knowledge Provider Foundation Acceptance      PASS
Knowledge Generative Provider Boundary        PASS
GBAP PR Fast CI                               PASS
GBAP VM-Only Runner Capacity Proof             PASS
Heavy Final                                   NOT RUN / NOT REQUIRED
```

The reverse-audit defects listed in the evidence file are corrected and this v0.3 authority is now frozen.

Windows visual/use UAT was not run immediately because the approved product direction moved directly into the succeeding RAGFlow reuse/product-completion line before host deployment.

Succeeding product authority: `GBAP_KNOWLEDGE_RAGFLOW_REUSE_MAP_v0.1.md`.
