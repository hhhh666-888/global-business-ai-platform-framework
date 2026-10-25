# GBAP GBAP｜Stage 3.7 Batch 19 Addendum

Status: **PRODUCT CI PASS / LOCAL-UAT FINAL PENDING**

Date: 2026-09-12

Repository: `hhhh666-888/global-business-ai-platform`

Scope: complete the currently authorized employee Email + Calendar operational slice in one delivery while preserving GBAP-owned identity, authorization, canonical CRM semantics and the headless/replaceable Twenty boundary.

This addendum extends Stage 3.7 only. It does not reopen unaffected Stage 3.5 / Stage 3.6 architecture or previously frozen provider boundaries.

---

## 1. Batch 19 product outcome

Batch 19 closes the four explicit Batch 18 nonclaims that were authorized for this batch and retains the already accepted Batch 18 working behaviors.

```text
Email
  synchronized working list / thread context
  Compose + Send
  Reply / Reply All / Forward
  outbound attachments
  incoming attachment discovery + bounded download
  per-user enterprise email signature
  signature auto-application to compose/reply/reply-all/forward
  communication participant -> canonical CRM contact/company linking when mappings exist

Calendar
  synchronized working event list
  create synchronized external event
  attendees / invitations
  Meet / Teams when provider supports it
  edit an owned synchronized external event
  cancel an owned synchronized external event
  participant -> canonical CRM contact/company linking when mappings exist
```

The browser continues to use GBAP same-origin semantic routes only. It never receives a Twenty, Google or Microsoft OAuth token and never calls Twenty directly.

---

## 2. Provider topology

Existing provider boundaries remain available as rollback paths.

```text
twenty-mail-calendar-user-uat
  endpoint      http://twenty-adapter:8091
  responsibility
                per-user connect/disconnect

twenty-mail-calendar-working-uat
  endpoint      http://twenty-adapter:8094
  responsibility
                accepted Batch 18 working slice / rollback path

twenty-mail-calendar-complete-uat
  endpoint      http://twenty-adapter:8094
  responsibility
                Batch 19 enriched employee communication operations
```

The Batch 19 provider reuses the isolated Stage 3.7 child-provider port `8094`; it does not move communication writes onto the established `8091 / 8093 / 8092` public/extended/legacy chain.

Where Batch 19 enriches an already existing shared capability such as the working email list, the complete provider is registered at priority `120`. Older providers are deliberately retained rather than silently deleted, preserving a bounded rollback path.

---

## 3. Incoming attachment boundary

Incoming attachments are not exposed through provider URLs or provider tokens.

Accepted flow:

```text
current GBAP actor
-> GBAP capability invocation
-> verify connected-account/channel/message ownership
-> provider-side attachment metadata lookup
-> short-lived single-use GBAP download ticket
-> same-origin /api/mail-attachment-download/<ticket>
-> bounded byte response
```

Permanent controls:

- current-user ownership is checked before provider work;
- download tickets are short-lived and single-use;
- the browser receives neither OAuth access tokens nor Twenty credentials;
- attachment size is bounded by the adapter contract;
- outbound attachment handling accepted in PR #155 remains in force.

---

## 4. Calendar update / cancel boundary

Calendar edit and cancel operate only on a synchronized event associated with the current user's connected calendar channel.

Before provider mutation the adapter resolves and verifies:

```text
GBAP actor
-> current user's mapped Twenty identity
-> connected account
-> calendar channel
-> calendar-channel event association
-> external provider event id
```

A mismatched or unowned event fails closed. The implementation retains explicit ownership guards including `calendar_event_not_owned_by_actor`.

Batch 19 does not introduce arbitrary provider event mutation by external ID supplied from the browser.

---

## 5. CRM automatic communication linking

Communication linking reuses existing canonical GBAP CRM mappings; it does not create a second CRM identity model.

When a synchronized mail/calendar participant already resolves to a Twenty Person and that Person/Company identity has or can be safely adopted into the existing provider mapping boundary, Batch 19 annotates the communication record with GBAP business IDs.

User-facing communication surfaces may therefore show bounded `CRM 客户` / `CRM 联系人` linkage indicators.

Permanent semantics:

```text
GBAP canonical business ID        remains authority
Twenty person/company ID             provider identity only
external_mapping                     canonical/provider mapping boundary
communication auto-link              adopt/reuse mapping; do not duplicate customer master
```

Mapping adoption is auditable (`communication.crm.auto_link`). Cross-user communication access is not granted by the existence of a CRM mapping.

---

## 6. Per-user enterprise email signature

Email signature preference belongs to the authenticated GBAP user and is persisted in GBAP-owned SQLite state (`user_mail_preference`).

Accepted behavior:

- user can edit signature text;
- user can enable/disable automatic insertion;
- enabled signature is applied to new mail, reply, reply-all and forward drafts;
- signature preference does not become a global company secret or a Twenty credential;
- one user's preference must not be read or changed by another ordinary user.

---

## 7. Least-privilege runtime boundary

Twenty PostgreSQL access used by the communication adapter remains read-only.

Batch 19 adds only the workspace `person` read relation needed to resolve participant-to-company CRM linkage. It does not grant `INSERT`, `UPDATE` or provider-database mutation rights.

Provider OAuth material is available only inside the internal adapter runtime for the connected-account provider operation. The browser-facing API never returns that material.

The accepted source contains explicit fail-closed checks including:

```text
connected_account_secret_scope_mismatch
message_not_owned_by_actor
calendar_event_not_owned_by_actor
```

---

## 8. Product CI evidence

Exact accepted product head before documentation-only closure:

```text
PR #156 product head                  e2364a161d0b93bc92aafc94f328193355d9d0db
Fast #330                             PASS
Fast run id                           34687672109
Stage 3.7 focused browser #100        PASS
Focused run id                        34687672012
```

Focused #100 proved on VM PRIMARY:

```text
exact PR-head checkout
VM PRIMARY browser/runtime boundary
governed dependency supply
TypeScript + Vite production build
GBAP SQLite semantic tests
isolated real Keycloak fixture
38/38 Stage 3.7 Playwright acceptance tests
Batch 19 incoming attachment workflow
Batch 19 CRM linkage visibility
Batch 19 per-user signature workflow
Batch 19 calendar edit/cancel workflow
source-level least-privilege/token boundary assertions
```

Earlier candidate heads exposed only bounded implementation/test defects and were not accepted. The final product head passed both Fast and focused Stage 3.7 acceptance.

Documentation-only commits after this exact product head do not invalidate the product/browser evidence unless they change runtime/product/security/data behavior.

---

## 9. Remaining Gate before merge

Because Batch 19 changes Local-UAT runtime/provider wiring, Docker environment, adapter read grants and the operational communication path, one affected **VM PRIMARY Local-UAT Final** is required before merge.

Required route:

```text
/gbap-final local-uat
```

Not required:

```text
/gbap-final all
unaffected control Heavy rerun
unaffected CRM Heavy rerun
```

The active failed-scope/PASS-evidence policy applies. If substantive Local-UAT domains pass and only independent final GitHub result transport fails, do not repeat already valid Heavy domains.

---

## 10. Formal Windows deployment / real-provider boundary

Formal company Windows UAT is intentionally not updated one feature at a time.

After PR #156 is accepted and merged, perform exactly one governed update from current `main`, with mandatory backup and retained volumes. Then perform one combined real-provider acceptance for the entire Batch 18/19 communication workflow.

Minimum combined live proof when Google is configured:

```text
fresh installed SHA read-back
Local-UAT Test PASS
GBAP user login
current-user Google connection healthy
mail sync/read isolated to current user
incoming attachment list + controlled download
Compose/Send with controlled outbound attachment
Reply / Reply All / Forward
per-user signature save + automatic draft insertion + persistence
CRM customer/contact communication linkage for known mapped records
calendar create + attendee + Meet when supported
calendar edit verified provider-side
calendar cancel verified provider-side
second GBAP user isolation
restart persistence
```

Equivalent Microsoft 365 / Teams proof is required only when the Microsoft company provider is configured. An unconfigured provider must be recorded as **NOT YET REAL-VALIDATED**, not as PASS.

OAuth secrets remain local/Git-ignored and must never be pasted into chat, GitHub or ordinary logs.

---

## 11. Batch 19 status wall

At this documentation point:

```text
Product implementation       COMPLETE
Fast CI                      PASS
Stage 3.7 focused acceptance PASS
Local-UAT Final              PENDING
Formal Windows deployment    NOT YET PERFORMED FOR BATCH 19
Real Google/Microsoft proof  PENDING POST-MERGE WINDOWS ACCEPTANCE
Production                   NOT AUTHORIZED
```

Batch 19 must not be marked fully accepted/merged until the required affected Local-UAT Final is closed.
