# GBAP GBAP｜Stage 3.7 Batch 24–37 + Product Adjustments Addendum

Status: **ACTIVE ADDITIVE STAGE 3.7 AUTHORITY**

Repository: `hhhh666-888/global-business-ai-platform`

Authority date: 2026-09-14

This addendum records the accepted Stage 3.7 product/runtime changes after the Batch 20–23 authority and the subsequent bounded product adjustments through PR #170. It does not rewrite predecessor history and does not authorize Production Go-Live.

## 1. Authority rule

Current GitHub/runtime evidence remains higher priority than stale chat or living-state snapshots.

This document is additive to:

- `docs/architecture/GBAP_STAGE3_7_BATCH20_23_ADDENDUM.md`
- `docs/architecture/GBAP_STAGE3_7_MAIL_WORKSPACE_V2_BATCH24.md`
- frozen Stage 3.6 and CI governance authorities

Unchanged frozen architecture remains authoritative unless explicitly reopened.

## 2. Accepted progression after Batch 23

### PR #162｜Mail Workspace V2 / Batch 24

Accepted a familiar three-column mail workspace, rich compose, provider-backed message actions, attachment handling and focused Stage 3.7 coverage while preserving server-side provider tokens and GBAP-owned identity/authorization boundaries.

### PR #163｜Mail Workspace real-use closure / Batch 25

Added protected actor-scoped mailbox snapshots, background refresh, provider failure isolation, bulk message actions, signature relocation and stronger data-integrity protection against a degraded provider read replacing a previously complete mailbox snapshot.

### PR #164｜Mail real-use/security closure / Batch 26–37

Closed a broad set of mail reliability/security defects including unread-cascade prevention, protected encrypted state, source-mailbox search, rich-reader hardening, attachment ownership, recipient validation, send idempotency, bounded history paging and provider-specific lifecycle behavior.

Important residual boundary: mocked/browser/CI acceptance did not itself prove company Windows live-provider usability. Real connected-provider evidence remained required.

### PR #165｜Real-UAT provider capability registration

Real Windows Google UAT exposed persisted Provider Registry drift. A higher-priority runtime provider definition was added for the complete mail-workspace capability family on the audited adapter.

### PR #166｜Incremental Windows Provider Registry reconciliation

Real Windows evidence proved that a one-shot Compose bootstrap could remain satisfied across incremental updates even when its mounted script changed. The governed Windows updater was hardened to explicitly replay Provider Registry reconciliation and fail if persisted runtime definitions remain stale.

### PR #167｜Instant navigation + shared query cache

Accepted platform-level navigation hardening:

- already visited non-mail surfaces remain mounted through React Activity boundaries;
- actor/session change discards preserved UI state;
- actor-scoped stale-while-revalidate entity cache with request dedupe and background revalidation;
- shared CRM entity queries replace duplicate page-private reloads;
- sidebar hover/focus prefetch and global-search reuse of the shared entity cache;
- mutation/import/recycle operations invalidate or update affected caches rather than forcing unrelated full-page reloads.

Exact PR head:

`f1889498ed1ac379bc1409bff2e36665a608288e`

Accepted PR evidence:

- GBAP PR Fast CI #607 — PASS
- Stage 3.7 Real-Use Feedback Acceptance #377 — PASS

### PR #168｜Mail employee visibility gate

Company real-use feedback still showed unresolved Mail failures. The accepted product response was to stop presenting unfinished Mail as an ordinary employee capability.

Current product rule:

```text
ordinary employee     Mail navigation/page NO
manager               Mail diagnostic access YES
super-admin           Mail diagnostic access YES
```

This is a product safety/usability gate, not a claim that the underlying mail implementation was deleted. Reopening Mail to ordinary employees requires new company Windows real-provider evidence for the affected paths.

Exact PR head:

`95dcba8f01abfc9c0864235d207658d5ac87088b`

Accepted PR evidence:

- GBAP PR Fast CI #611 — PASS
- Stage 3.7 Real-Use Feedback Acceptance #381 — PASS

### PR #169｜Calendar becomes internal GBAP personal calendar

Calendar was deliberately simplified and separated from external mail/provider setup.

Current product rule:

```text
Calendar                    normal authenticated-user capability
Google/Microsoft connection NOT REQUIRED
mail account                NOT REQUIRED
provider sync               NOT REQUIRED
storage                     actor-scoped GBAP SQLite state
views                       month / week / day / agenda
mutations                   list / create / edit / delete
```

Do not silently reattach the normal Calendar product to Google/Microsoft or make Email connection a prerequisite.

Exact PR head:

`1c86c40a15f67837789f4a257ef7340aed767ab7`

Accepted PR evidence:

- GBAP PR Fast CI #613 — PASS
- Stage 3.7 Internal Calendar Acceptance #2 — PASS
- Stage 3.7 Real-Use Feedback Acceptance #383 — PASS

### PR #170｜Bulk CRM data-transfer ceiling removal

The former 300-row interactive CSV limit is superseded.

Current data-transfer rule:

```text
single interactive CSV file limit       10,000 rows
automatic import batch size             60 rows
user manual file splitting              NOT REQUIRED within 10,000 rows
company/contact/opportunity export      up to 10,000 rows
canonical provider reads                cursor-paginated
silent truncation above supported bound PROHIBITED
>10,000-row workload                    reserved for future background migration/import job
```

The implementation preserves existing per-record GBAP mapping/idempotency and Customer Intelligence semantics. The 62-field customer-company CSV remains the canonical bulk customer intake/export contract.

Exact PR head:

`953dbe4c1866765a43a2cb40cd67bbacf259c699`

Merge/main after PR #170:

`30016cffcab84bbf1c9af0f2d5335a8cf33bb385`

Accepted PR evidence:

- GBAP PR Fast CI #614 — PASS
- Stage 3.7 Real-Use Feedback Acceptance #384 — PASS

## 3. Current product truth after PR #170

```text
Stage 3.7                         ACTIVE LIVING MAINTENANCE STAGE
CRM Company master               ONE canonical company master
Customer Intelligence            ACTIVE
bulk customer CSV                62-field canonical contract
interactive CSV limit            10,000 rows
automatic import batching        60 rows
ordinary-employee Mail           HIDDEN / NOT ACCEPTED AS DAILY CAPABILITY
manager/super-admin Mail         CONTROLLED DIAGNOSTIC ACCESS
Calendar                         INTERNAL GBAP PERSONAL CALENDAR
instant revisit/navigation       ACCEPTED shared-cache/preserved-surface model
Twenty                           headless / internal / replaceable
GBAP identity                 Keycloak authority
Production                       NOT AUTHORIZED
```

## 4. Formal Windows UAT boundary

Do not infer the company Windows installed SHA from GitHub merges.

The exact installed SHA must be read from the host whenever deployment state matters. The governed updater and mandatory backup/restore safety wall remain authoritative.

PR #166 established an additional permanent incremental-update rule: persisted mail Provider Registry definitions must be actively reconciled and independently read back during governed Windows updates.

The employee Mail visibility gate introduced by PR #168 remains in force until affected real-provider paths receive new company Windows acceptance.

## 5. CI governance retained

CI Governance v0.7 remains RE-FROZEN / PASS / CLOSED.

```text
VM PRIMARY                 normal Heavy Final
WSL                        backup / overflow / keep online
PASS evidence              reuse when impact permits
failed scope               rerun only affected scope
unrelated Heavy domains    do not repeat
```

No Heavy Final is required merely to synchronize living documentation after already accepted product PRs.

## 6. No-repeat rules added by this progression

```text
DO NOT treat Batch 23 living-state text as current product truth after PR #170.
DO NOT expose unfinished Mail to ordinary employees without new real-provider acceptance.
DO NOT make Google/Microsoft or Email connection a prerequisite for normal Calendar use.
DO NOT restore the obsolete 300-row CSV ceiling.
DO NOT ask users to manually split a 500-row customer file that is below the 10,000-row interactive limit.
DO NOT truncate canonical provider datasets silently at 500 or 10,000 rows.
DO NOT assume a one-shot Compose bootstrap reruns merely because its mounted script changed.
DO NOT infer the company Windows installed SHA from GitHub main.
DO NOT run duplicate Heavy CI for docs-only continuity synchronization.
```

## 7. Current legal continuation

With PR #170 merged and no active product PR, Stage 3.7 continues only from:

1. a newly observed real-use defect; or
2. an explicitly owner-authorized bounded product slice.

Business/customer-data research and preparation may continue against the accepted canonical Customer Intelligence CSV contract without inventing a new product-development Stage.

Production Go-Live remains **NOT AUTHORIZED**.
