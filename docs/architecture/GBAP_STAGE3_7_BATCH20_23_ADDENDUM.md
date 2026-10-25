# GBAP Stage 3.7｜Batch 20–23 Mail / Calendar Real-Use Hardening Addendum

Status: **MERGED / CURRENT AUTHORITY FOR BATCH 20–23**

Repository: `hhhh666-888/global-business-ai-platform`

Authority date: 2026-09-13

This addendum records the accepted Stage 3.7 mail/calendar hardening completed after Batch 19. It supplements, and does not silently reopen, the frozen Stage 3.5/3.6 architecture or the Batch 18/19 communication authorities.

## 1. Permanent boundary preserved

```text
GBAP browser -> GBAP same-origin semantic routes only
Twenty            -> headless/internal/replaceable
provider OAuth     -> server-side/internal only
Keycloak subject   -> durable GBAP user identity key
Windows UAT data   -> preserved; no destructive reset
Production         -> NOT AUTHORIZED
```

No Batch 20–23 change authorizes provider-side delete/archive/trash/spam mutation or exposes Google/Microsoft/Twenty tokens to the browser.

---

## 2. Batch 20｜Real-use mail/calendar UX and attachment hardening

PR: **#157**

Accepted outcomes:

- incoming attachment bytes are prefetched during the authenticated prepare step and then exposed through a short-lived single-use same-origin ticket;
- calendar cancellation is idempotent;
- canceled events disappear from the client immediately instead of waiting for stale synchronized state to refresh;
- Email uses a familiar folders + message list + reading pane layout;
- Calendar provides month/week/day/agenda views with date navigation and event detail;
- existing Batch 18/19 provider boundaries remain intact.

GitHub truth:

```text
PR #157                    MERGED
final head                 e5b6308d2947578fbf66fb85cb3e689d39779971
merge                      fbad16b1263cb180ed4485f442e9c3a554d80bc8
```

Windows deployment remained intentionally deferred so subsequent mail fixes could be deployed as one governed batch.

---

## 3. Batch 21｜Inbox and historical-mail sync closure

PR: **#158**

Observed defect:

```text
mail send worked
but historical mail / newly received mail did not appear
```

Root cause:

GBAP's per-user OAuth connection URL omitted Twenty's `skipMessageChannelConfiguration=true`. Twenty therefore left message/calendar channels in `PENDING_CONFIGURATION`, which prevents its provider fetch pipeline from scheduling normal mail/calendar synchronization.

Accepted correction:

- higher-priority connect overlay adds `skipMessageChannelConfiguration=true`;
- existing 8091 identity/provisioning path remains intact;
- one bounded Local-UAT repair advances only active Google/Microsoft channels stuck in `PENDING_CONFIGURATION` into pending-fetch stages;
- adapter DB role remains read-only;
- repair executes as a governed one-shot bootstrap with existing UAT database-admin authority;
- existing Batch 18–20 providers remain available as rollback paths.

Evidence:

```text
PR #158                    MERGED
final head                 1237f696d271e4e6c55a1a921024efa501aa620d
merge                      d962381c856e39b607ea2ecace166b975bdee292
Fast #344                  PASS / run 34698222394
Stage 3.7 #114             PASS / run 34698222395
Local-UAT Final #82        PASS / run 34698499040
```

---

## 4. Batch 22｜Daily mailbox usability

PR: **#159**

Accepted outcomes:

```text
visible-page background refresh     every 30 seconds
read/unread state                    GBAP-local per actor
inbox unread count                   YES
open incoming unread                 delayed mark-read
manual mark read/unread              YES
sync status/stage/update time         visible
bounded history UI                   200 -> 500
GBAP-local draft autosave          YES
GBAP-local draft restore/delete    YES
provider-side source mutation         NO
```

Historical messages establish the initial read baseline; later incoming mail becomes unread. Read state and local drafts are isolated by GBAP actor subject in GBAP SQLite and do not mutate Gmail/Twenty source mail.

CI routing was also corrected so mail-only Stage 3.7 changes run only the affected mail/calendar acceptance set rather than unrelated CRM/customer-intelligence/login-branding tests.

Evidence:

```text
PR #159                    MERGED
final head                 0b3e5a6a24a49b3d5b4f9b75b0662aeae6513d14
merge                      1aa1b2fd455be41862ba37e4f0b660a84184a01c
Fast #363                  PASS / run 34701680050
Stage 3.7 #133             PASS / run 34701680045
Local-UAT Final #83        PASS / run 34701825596
```

---

## 5. Batch 23｜Formal Windows mail UAT closure

PR: **#160**

Formal Windows UAT exposed five bounded real-use gaps after Batch 20–22:

1. compose could no-op on LAN HTTP because secure-context `crypto.randomUUID()` was assumed;
2. mailbox rendering could churn while status/mail/draft/signature loads completed at different times;
3. attachments needed to appear automatically for the selected message;
4. browser download needed a direct same-origin navigation flow rather than fetch/blob/object-URL behavior;
5. historical mail needed a server-side provider fallback when Twenty had not yet imported provider history.

Accepted implementation:

- LAN-safe UUID generation;
- stable mailbox state model: first render waits for mailbox/status/drafts/signature as one initial state, while background refresh replaces data without unmounting the active mailbox shell;
- selected-message attachments auto-load once;
- one-time ticket download uses direct same-origin browser navigation;
- server-side Gmail/Microsoft direct-history fallback is merged and deduplicated with Twenty-imported records;
- provider-message ownership mapping allows direct-history messages to list/download attachments without requiring prior Twenty message-table presence;
- direct-history contract is bounded to **500 messages**;
- Gmail history uses bounded paged ID enumeration and message detail fetch;
- Microsoft Graph history follows bounded `@odata.nextLink` pagination and refuses next links outside `graph.microsoft.com`;
- higher-priority `twenty-mail-real-uat` provider remains internal and has a bounded 45-second timeout;
- provider credentials remain server-side; Docker/runtime CI source parity is enforced;
- no provider delete/archive/trash/spam mutation was added.

Acceptance evidence on the exact PR head:

```text
PR #160 final head         249e18e6084ba01fa0aa350d7a328bbc4c205d5c
Fast #382                  PASS / run 34734863838
Stage 3.7 #152             PASS / run 34734863824
Local-UAT Final #84        PASS / run 34735001972
merge                      1d1f8a1f0fa3b8b3e4010c6140a5b37298e1315b
```

Final #84 passed exact source checkout, VM-primary toolchain/control-plane checks, dependency supply, static preflight, Web build, fail-closed offline compose preparation, isolated real Local-UAT boot, health/identity lifecycle, restart persistence, governed backup/restore rollback, cleanup and final PR result reporting. `Run real Twenty CRM proof` was correctly skipped for the `local-uat` suite.

---

## 6. Current combined mail product truth

After Batch 23 merge, the accepted bounded employee mail slice includes:

```text
per-user Google/Microsoft connection
working synchronized mail list
server-side provider history fallback when Twenty history is absent
bounded 500-message history expansion
Compose / Send
Reply / Reply All / Forward
outbound attachments
incoming attachment discovery + controlled same-origin download
per-user enterprise signature
GBAP-local read/unread state
GBAP-local draft autosave / restore / delete
CRM contact/company linkage when canonical mappings exist
30-second visible-page background refresh
sync status / stage / update-time diagnostics
```

Accepted calendar slice remains:

```text
synchronized working event list
create external synchronized event
attendees / invitations
supported Google Meet / Microsoft Teams conferencing
edit owned synchronized event
idempotent cancel of owned synchronized event
immediate local disappearance after cancel
month / week / day / agenda views
CRM linkage when canonical mappings exist
```

---

## 7. Explicit nonclaims

The following are **not** accepted as complete merely because Batch 23 merged:

```text
provider-side archive/delete/trash/spam
provider label/folder parity
rich HTML / inline-image fidelity
full thread/conversation grouping parity
unlimited history pagination
browser push/new-mail notifications
mature multi-account filtering
true provider-side Gmail draft synchronization
production go-live
```

GBAP-local drafts are intentionally local and must not be described as Gmail-provider drafts.

---

## 8. Windows deployment state after merge

At the moment this authority was written:

```text
GitHub main     1d1f8a1f0fa3b8b3e4010c6140a5b37298e1315b
PR #160         MERGED
Batch 20–23     MERGED
Windows update  NOT YET PERFORMED AFTER BATCH 23 MERGE
Production      NOT AUTHORIZED
```

The next Windows action is exactly one governed update from `E:\GlobalBusinessAIPlatform` using `Update-GBAP-UAT.ps1` with mandatory backup, followed by one combined live-provider UAT. Never use `-SkipBackup`, `docker compose down -v`, volume prune, or any hidden destructive reset.

For live Google verification, do not force reconnect first. Existing connection repair and direct-history fallback must be tested before reconnect is considered.
