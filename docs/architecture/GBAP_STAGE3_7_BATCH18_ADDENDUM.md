# GBAP GBAP｜Stage 3.7 Batch 18 Addendum

Status: **PASS / ACCEPTED / MERGED / LOCAL-UAT ACCEPTED VIA PASS-EVIDENCE REUSE + FOCUSED HANDOFF PASS**

Date: 2026-09-11

Repository: `hhhh666-888/global-business-ai-platform`

Scope: first real working-mode slice for per-user Email + Calendar while preserving the GBAP capability, identity and authorization boundary and keeping Twenty headless/internal/replaceable.

This addendum extends Stage 3.7 only. It does not reopen unaffected Stage 3.5 / Stage 3.6 architecture or previously frozen provider boundaries.

---

## 1. Accepted product outcome

Batch 18 moves Email + Calendar beyond connection/readiness-only behavior into the first bounded working mode.

Accepted user-facing capability:

```text
Email
  list current user's synchronized mail records
  expose thread identity and participants needed for working actions
  compose + send
  reply
  reply all
  forward

Calendar
  create synchronized external calendar event
  add attendees / send provider invitation semantics
  create Google Meet or Microsoft Teams meeting when the connected provider supports it
```

The browser still talks only to GBAP semantic capability routes. It does not receive a Twenty credential and does not call Twenty directly.

GBAP remains responsible for current-user authorization, connected-account ownership checks, provider-neutral capability resolution, provenance and audit boundaries.

---

## 2. Provider topology and port authority

The existing provider boundaries remain separated.

```text
twenty-crm-uat
  existing CRM + accepted read/runtime responsibilities
  unchanged by Batch 18

twenty-mail-calendar-user-uat
  endpoint      http://twenty-adapter:8091
  capabilities  crm.ops.v1.mail-calendar.connect.start
                crm.ops.v1.mail-calendar.disconnect

twenty-mail-calendar-working-uat
  endpoint      http://twenty-adapter:8094
  capabilities  crm.ops.v1.email.working.list
                crm.ops.v1.email.send
                crm.ops.v1.calendar.create
```

The final accepted source explicitly keeps the working writer on its own bounded child-provider port. Ports `8091 / 8093 / 8092` are already part of the established public/extended/legacy adapter chain; the Batch 18 working writer therefore uses **8094**.

Do not revert the working provider onto an already occupied adapter-chain port without a governed architecture change and affected acceptance.

---

## 3. Email working semantics

The working provider uses Twenty v2.37.0 server-side mail APIs while retaining GBAP-owned browser semantics.

Accepted behavior:

- `crm.ops.v1.email.working.list` returns the current user's bounded working email records with the thread/participant context required by the GBAP surface;
- `crm.ops.v1.email.send` is the provider-neutral working write capability used for Compose/Send and for reply/reply-all/forward semantics;
- send operations use the mapped current user's connected Twenty mail account and verify ownership before provider-side work;
- provider failure degrades through the adapter boundary rather than exposing Twenty directly to the browser.

This slice intentionally does **not** claim:

- attachments;
- user signatures;
- automatic CRM record linking;
- any other mail feature not explicitly accepted above.

Those remain future bounded slices and must not be faked in UI or documentation.

---

## 4. Calendar working semantics

`crm.ops.v1.calendar.create` creates a real synchronized provider calendar event for the current mapped user.

Accepted scope:

- title/subject and bounded event details;
- start/end semantics;
- attendees;
- provider invitation behavior;
- Google Meet or Microsoft Teams conferencing when supported by the connected provider and request.

This slice intentionally does **not** claim external synchronized calendar edit/cancel. Those remain future bounded slices.

---

## 5. Failure correction and final isolation

Earlier Batch 18 candidate heads exposed the new working writer through a conflicting/incorrect runtime port path. Those candidates failed Local-UAT Final and were not accepted.

The final head corrected the runtime boundary by isolating the working writer on port `8094`, updating its provider registration/runtime exposure and locking the isolated port in acceptance coverage.

Permanent diagnostic lesson:

```text
port/runtime collision
-> inspect the actual provider/runtime topology
-> isolate the new bounded child service
-> update routing + CI/UAT runtime together
-> verify exact head
-> do not repeatedly rerun Heavy CI without a source/config correction
```

---

## 6. Exact-head acceptance evidence

```text
PR #145 final head                 2e43f0f45900c33f77060b2884d923b85356cf5d
product merge                      716d153130465170076f9b0fa02fb4ecc34eb0f3
Fast #312                          PASS
Fast run id                        34604168910
Stage 3.7 Browser #89              PASS
Browser run id                     34604168863
Local-UAT Final #77 run id         34618851306
Local-UAT substantive domains      PASS
Final #77 overall workflow         FAILURE: final PR-result reporting transport only
Command Bridge #96                 PASS
Bridge run id                      34621488397
Focused VM Final Handoff #2        PASS
Focused handoff run id             34621516223
/gbap-final all                    NOT RUN / NOT REQUIRED
```

Final #77 proved on the exact product head:

```text
exact source checkout
VM-primary toolchain and GitHub control-plane preflight
materialized governed dependency supply
static final preflight
Web build
isolated real Local-UAT boot
GBAP / Keycloak / Twenty health
identity lifecycle
per-user mail/calendar capability provider health
per-user mail/calendar working provider health
canonical + operational + per-user communication read paths
per-user Twenty identity mapping + transient OAuth isolation
restart persistence
governed backup + restore rollback
CI-only cleanup
final GitHub control-plane health
```

The workflow was marked red only because the last `Report Final Gate result to PR` transport call timed out while `JOB_STATUS=success`. The failure did not invalidate the completed Local-UAT/persistence/backup-restore evidence.

The active failed-scope policy therefore required PASS evidence reuse and the focused `/gbap-final handoff` continuation instead of repeating Heavy Local-UAT. Focused Handoff #2 passed on the same exact head and closed the remaining Final handoff/reporting scope.

---

## 7. Real provider acceptance boundary

GitHub CI/UAT proves repository/runtime behavior without company-owned live Google/Microsoft OAuth credentials. It does **not** prove real external mailbox/calendar consent or provider delivery.

After the Batch 18 docs closure reaches `main`, the next governed operator path is:

```text
one Windows Local UAT governed update
-> mandatory backup
-> refresh to current main
-> post-update UAT PASS
-> fresh installed-SHA read-back
-> configure Google/Microsoft OAuth locally only when company credentials are ready
-> real per-user provider acceptance
```

Minimum real-provider acceptance for Google when configured:

```text
provider health/readiness PASS
GBAP user login
connect own Google account
mail sync/read visible only to that user
Compose/Send to a controlled mailbox
Reply and Reply All
create calendar event with attendee
create Meet link when requested/supported
verify provider-side event/invitation/conference result
```

Equivalent Microsoft 365 / Teams acceptance is required when Microsoft company credentials are available. If only one provider is configured and verified, document the other provider as **NOT YET REAL-VALIDATED** rather than manufacturing a PASS.

OAuth secrets remain local/Git-ignored and must never be pasted into chat, GitHub or ordinary logs.

---

## 8. Frozen Batch 18 result

Batch 18 is accepted as the Stage 3.7 authority for:

- first working Email mode: list/thread context + Compose/Send + Reply + Reply All + Forward;
- first working Calendar mode: synchronized external event creation + attendees/invitations + Meet/Teams when supported;
- isolated working child Provider `twenty-mail-calendar-working-uat` on port `8094`;
- continued per-user GBAP identity/authorization/ownership enforcement;
- continued headless Twenty boundary;
- PASS-evidence reuse when Heavy substantive domains passed and only independent Final handoff/reporting failed.

Attachments, signatures, CRM auto-linking and external calendar edit/cancel remain **NOT IMPLEMENTED / NOT CLAIMED** in this accepted slice.

Stage 3.7 remains **ACTIVE**.

Production remains **NOT AUTHORIZED**.