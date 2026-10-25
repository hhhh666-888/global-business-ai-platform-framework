# GBAP Stage 3.7｜Batch 24–26｜Mail Workspace V2

Status: **BATCH 24 ACCEPTED / BATCH 25 ACCEPTED / BATCH 26 FINAL CANDIDATE — EXACT-HEAD GATES PENDING**

## 1. Product decision

Batch 24 is a bounded mail-workspace redesign based on the owner-approved GBAP Mail concept and familiar Gmail / Outlook / QQ Mail / NetEase Mail interaction patterns. It is not another visual patch on Batch 23.

### User-facing goals

- stable three-column mail workspace;
- familiar folder rail and mail toolbar;
- clear distinction between total folder counts and unread counts;
- compose window with visible minimize / maximize / close controls;
- a real rich-text email composer rather than a plain textarea decorated as webmail;
- automatic local draft save, including durable uploaded attachment references;
- explicit mailbox status: connected / refreshing / attention / offline, rather than leaking internal Twenty stages as a permanent `同步中` state;
- incoming attachments visible automatically in the reading pane;
- same-origin browser download with explicit success/failure feedback;
- preserve send, reply, reply-all, forward, signature, CRM linkage, per-user isolation and direct-provider history fallback;
- add real provider-backed everyday mailbox actions instead of decorative controls.

## 2. Real-function boundary

The V2 UI must not expose fake actions. Daily-mail actions shown in the product must be backed by the real provider whenever the provider supports them.

### Target real operations

- mark read / unread;
- star / unstar or provider-equivalent flag;
- archive;
- move to trash / deleted items;
- restore from trash when the provider supports a deterministic restore target;
- mark spam / not spam where the provider API exposes the operation;
- refresh and mailbox/folder views;
- send, reply, reply-all and forward;
- local autosaved drafts and signatures;
- outgoing attachment upload with durable draft references;
- incoming attachment preview/list and download.

### Permission model

Microsoft Twenty OAuth already requests delegated `Mail.ReadWrite`, so Microsoft message mutations can use the existing server-side connected-account token after ownership checks.

Twenty's current Google OAuth requests `gmail.readonly`, `gmail.send` and `gmail.compose`, which is insufficient for Gmail label/message mutations. Batch 24 therefore adds a GBAP-controlled **Gmail mailbox-management permission upgrade** that requests `gmail.modify` server-side. It reuses the existing Google OAuth client and registered callback, uses short-lived one-time state bound to the current GBAP actor/account, verifies the returned Gmail identity, and stores the resulting refresh credential encrypted server-side. Provider tokens are never exposed to the browser.

If Gmail modify permission has not yet been granted, mutation controls must explicitly lead the user through permission upgrade; they must not pretend the mutation succeeded locally.

## 3. Folder and count semantics

Folder counts are not unread counts.

Primary V2 system views:

- `收件箱`: provider inbox messages in the current loaded window;
- `未读`: provider-backed unread Inbox state; Gmail/Microsoft must not use local-only fake read/unread state when provider mutation permission is unavailable;
- `星标邮件`: Gmail `STARRED` / Microsoft flag-equivalent messages;
- `已发送`: provider sent messages;
- `草稿`: GBAP autosaved drafts plus provider draft visibility when available;
- `归档`: messages outside inbox/sent/draft/trash/spam when provider classification allows a reliable archive view;
- `垃圾邮件`: provider spam/junk folder where supported;
- `已删除`: provider trash/deleted-items folder;
- `全部邮件`: all current loaded mailbox records plus local drafts;
- `附件`: messages and local drafts with confirmed attachments in the current loaded set.

The UI must display unread count separately so values such as `收件箱 64 / 全部邮件 67` are not interpreted as three missing messages when the additional records are sent/draft/other-folder messages.

Search/filtering affects the center result list only. It must not rewrite the folder totals in the left rail. `未读` excludes trash, spam and archived mail and represents unread Inbox/incoming mail semantics.

## 4. Synchronization semantics

The end-user status is a GBAP product state, not a raw Twenty implementation stage.

- configured account + healthy/active channel -> `已连接` plus latest successful refresh time;
- foreground/manual refresh -> `正在刷新`;
- auth/channel/provider permission issue -> `需要处理`;
- no usable channel -> `等待邮箱通道`;
- transport/provider failure -> explicit error surface.

`ACTIVE`, `CONNECTED`, `SUCCEEDED`, `SUCCESS` and equivalent healthy provider/channel states must never fall through to a permanent `同步中` label.

Raw Twenty/provider sync stage is secondary diagnostic detail only. Multi-account health is evaluated across all connected channels: one unhealthy account must not be hidden merely because the first account is healthy.

## 5. Compose interaction and rich-text contract

The compose experience is a real email editor, not a styled plain-text field.

### Window behavior

- visible minimize, maximize/restore and close controls;
- Escape safely restores/minimizes/closes without dropping meaningful content;
- closing a meaningful draft persists it first;
- if draft persistence fails, the editor remains open and reports the error rather than pretending the draft was saved;
- minimized drafts remain recoverable in-session;
- maximize uses the mail workspace rather than an off-screen fixed layer;
- reply/reply-all/forward reuse the same composer;
- closing is blocked while an outgoing attachment upload is still active so no selected file can silently disappear.

### Editing capabilities

The editor supports the mainstream daily-mail operations expected by Gmail / Outlook / QQ / 163 users:

- font family and font size;
- bold, italic, underline and strike-through;
- text color and highlight color;
- left / center / right alignment;
- bullet and numbered lists;
- indent / outdent;
- block quote;
- HTTP/HTTPS links;
- externally hosted HTTP/HTTPS images;
- emoji;
- horizontal rule;
- clear formatting;
- undo / redo;
- standard keyboard shortcuts such as Ctrl/Cmd+B/I/U and Ctrl/Cmd+K;
- formatted HTML paste with unsafe elements, event attributes, dangerous URLs and unsafe CSS stripped before insertion;
- plain-text paste converted to safe mail HTML;
- character count and browser spellcheck.

The editor preserves selection/caret before toolbar and popover interaction so formatting, links, images and emoji are inserted at the user's intended range.

### Real outbound format

The GBAP draft stores normalized HTML. The existing Twenty send path accepts that HTML in `SendEmailInput.body`; Twenty's outbound composer sanitizes/compiles it into provider-ready HTML plus a plain-text alternative before Gmail/Microsoft delivery. Therefore formatting is part of the real outgoing email, not a browser-only visual effect.

Reply/forward history is represented as a quoted HTML block and the user's signature is inserted as HTML. Existing plain-text drafts are upgraded to safe HTML when reopened.

A blank subject is allowed only after explicit confirmation and is normalized to `（无主题）` for the provider path. An empty body is allowed only after explicit confirmation when appropriate; attachment-only mail is therefore possible.

### Durable outgoing attachments

Browser `File` objects cannot survive closing/reloading a compose window. Batch 24 therefore does not keep selected attachments as transient browser-only state. After size/count validation, each selected file is immediately uploaded through the existing GBAP attachment prepare + same-origin upload boundary. Only the resulting `{id,name,size}` provider file reference is stored in the actor-scoped local draft JSON.

This means:

- closing and reopening the draft preserves the attachment list;
- the Drafts folder can identify drafts that contain attachments;
- sending reuses the already-uploaded provider file reference instead of uploading a second copy;
- legacy drafts without a `files` field remain valid and are treated as having zero attachments;
- attachment IDs, names, per-file size, count and total size are revalidated server-side when a draft is saved;
- send/close is blocked while an upload is still in flight.

The local draft record stores provider file references, not provider access tokens or raw file bytes.

## 6. Attachment download

Batch 24 removes the Batch23 fire-and-forget anchor navigation as the primary download path. The browser performs the one-time prepare call, then a same-origin authenticated `fetch` for the ticketed binary, validates HTTP success, converts the response to a Blob and triggers the download. User-visible errors reflect the real download HTTP result rather than merely proving that a browser navigation was attempted.

Incoming attachment lookup uses the same stable-identity model as provider mutations. The browser supplies the stable GBAP `messageId` plus supporting `connectedAccountId + externalMessageId`; the server first resolves the actor-scoped message mapping and, when needed, resolves an existing actor/account/external-message witness. The browser never supplies a provider token or arbitrary provider URL.

Gmail MIME attachments are valid in both forms exposed by Gmail: a normal `attachmentId`, or a small MIME part whose bytes are embedded directly in `part.body.data`. Inline MIME bytes are retained server-side only, omitted from attachment-list responses, and served through the same governed one-time same-origin download ticket as normal provider attachments.

## 7. Provider mutation safety and stable identity

Every mutation must:

1. resolve the message through the actor-scoped provider mapping;
2. prove the connected account belongs to the current GBAP actor;
3. use only server-held provider credentials;
4. validate provider permission before mutation;
5. update the actor-scoped mailbox snapshot after success;
6. update returned provider metadata rather than only pretending success in the UI;
7. surface provider/permission failure explicitly.

Batch23 merge behavior can keep a Twenty-imported stable message UUID while the direct-provider mapping was originally created under a deterministic direct-provider UUID. Batch24 R2 therefore carries `externalMessageId + connectedAccountId` as supporting identity evidence. If the stable UUID has no direct mapping, R2 resolves an existing mapping witness only when the same GBAP actor, connected account and external provider message ID match. It then performs the provider operation with the witness mapping's internal message ID and maps the result back to the stable GBAP message ID. R2 does **not** insert a duplicate alias row into `mail_provider_message_map`, preserving that table's actor/provider/account/external-message uniqueness constraint. Missing or mismatched evidence fails closed; browser-supplied provider identity alone is never trusted.

The same witness-resolution rule is used when enriching a stable Twenty message with provider-backed folder, read, star and attachment state. The stable GBAP ID remains the product identity even when provider metadata was originally indexed under the deterministic direct-provider ID.

When Microsoft Graph `move` returns a new external message ID, both the provider mapping and encrypted mailbox snapshot must adopt that new external ID. Subsequent history reconciliation reuses an existing actor/provider/account/external witness instead of manufacturing a second synthetic product identity.

Permanent deletion is not the default delete action. The normal delete action moves mail to provider trash/deleted-items, matching mainstream webmail behavior.

## 8. Batch 24 acceptance

- compose close/minimize/maximize controls visible and functional;
- no clipping of compose chrome at LAN desktop viewport;
- rich-text toolbar is visible and usable in normal and maximized compose modes;
- rich formatting is persisted by draft autosave and reaches the real `email.send` payload as HTML;
- pasted rich content is sanitized before insertion and the provider send path applies its final sanitizer/HTML-to-text compilation;
- selected outgoing attachment bytes pass through the governed upload boundary;
- the resulting provider file reference is persisted in the local draft, survives close/reopen and is reused by `email.send` without a second upload;
- legacy drafts without attachment references remain readable;
- healthy `ACTIVE`/connected channels never render as endless `同步中`;
- manual refresh has its own transient state;
- Inbox total and unread count are separate;
- All Mail count semantics are explicit;
- folder views reflect real provider folder/label metadata where available;
- selected-message attachments load automatically;
- actual binary incoming attachment fetch is exercised in acceptance;
- real read/unread, star/flag, archive and trash operations are exercised against provider adapters;
- provider mutation requests retain stable message identity plus actor-scoped external identity evidence;
- stable-id witness resolution never inserts duplicate provider mapping aliases;
- Gmail without `gmail.modify` presents permission-upgrade flow instead of fake success;
- Microsoft uses existing `Mail.ReadWrite` capability;
- Batch18–23 send/reply/reply-all/forward/signature/draft/CRM behaviors remain accepted unless intentionally superseded here.

## 9. Batch 25｜Real-use audit and closure

Batch 25 is triggered by Formal Windows UAT evidence showing that a visually improved mailbox can still fail daily-use expectations. The owner-observed failures are treated as product defects, not user error.

### 9.1 Persistent cache-first mailbox

Entering Mail must not synchronously rebuild the mailbox from Gmail/Microsoft on every navigation. The adapter maintains one actor-scoped mailbox snapshot in local GBAP SQLite. The snapshot contains mail metadata/body content already available to GBAP, so it is encrypted at rest with AES-256-GCM using an actor-scoped HKDF key derived from the existing GBAP bridge secret.

Rules:

- cache is server-side; mailbox bodies are not persisted in browser `localStorage`;
- same SPA session may also reuse a memory-only snapshot for zero-cost navigation, but that memory snapshot is scoped to the current actor subject;
- normal `workspace.snapshot` returns the persisted snapshot immediately when it covers the requested history window;
- provider refresh uses the same governed capability with `refresh:true` and runs without unloading the mail shell;
- visible-page background refresh is periodic and focus/visibility can request a refresh when the last provider refresh is old;
- refresh failure keeps the last usable snapshot and surfaces degraded state instead of blanking the mailbox.

### 9.2 Historical-mail completeness guard

A direct-provider failure must never silently collapse an already-known mailbox to the smaller Twenty-imported subset. In particular, a result such as 67 known/provider-mapped messages becoming 4 messages is an integrity event, not a normal refresh.

Batch 25 compares a fresh provider result with both:

- the last persisted complete snapshot count; and
- a bounded actor-scoped `mail_provider_message_map` witness count relevant to the active history limit.

If the fresh source shrinks below a bounded fraction of a meaningful baseline, the adapter preserves/merges the last complete snapshot, marks it `degraded`, records source/protected/witness counts, and performs one bounded recovery probe. The UI shows an explicit completeness warning. A legacy `working.list` compatibility fallback is permitted only when the V2 contract itself is unavailable and must be labeled `workspace_v2_unavailable_legacy_fallback`; it has no remote-mutation permission and is never presented as a complete mailbox.

If a user has explicitly loaded a larger history window such as 500 messages, background refresh preserves at least that requested coverage instead of silently dropping back to the default 200-message window.

### 9.3 Action feedback and bulk operations

Mailbox actions are no longer decorative glyphs or actions that appear frozen while a full provider reload runs.

- row checkbox is a real accessible checkbox;
- row star is a real provider-backed action;
- select-all applies to the current loaded view;
- bulk read/unread, star, archive, trash and spam use the same actor/account/provider permission checks as single-message actions;
- destructive bulk actions ask once for confirmation;
- provider success updates the encrypted snapshot and the current React view immediately;
- provider failure remains visible and does not apply fake success state;
- failed bulk items remain selected so the user can see/retry them instead of being silently cleared;
- background provider refresh later reconciles the authoritative state without blocking the user's action feedback.

### 9.4 Dark-mode contract

All Mail V2 surfaces, including the portal-based compose window and rich editor, must use governed `--fg-*` appearance tokens. Literal light fallbacks or the unrelated `--color-*` token family may not paint a white compose canvas inside Dark mode. This includes header, toolbar, editor, selects, popovers, attachment area and status footer.

### 9.5 Signature information architecture

Email signature is a per-user account preference, not a high-frequency mailbox action. Batch 25 removes `邮件签名` from the top toolbar and exposes `签名设置` in the connected-account/settings area. The dialog explicitly states that enabling it automatically appends the signature to new mail, reply and forward; disabling it leaves compose content untouched.

### 9.6 Formal Batch 25 acceptance

Batch 25 cannot close until all of the following are verified together:

- Dark mode keeps the entire compose/editor window dark and readable;
- revisiting Mail renders the persisted snapshot without waiting for a full provider-history rebuild;
- background refresh changes data without unloading the shell;
- 67→4 or comparable source shrink is guarded and visibly diagnosed rather than accepted as complete;
- single star/archive/trash/spam/restore performs a real provider mutation and the folder/count changes immediately after success;
- real checkbox selection and bulk operations perform provider mutations, not visual-only state changes;
- Gmail modify permission completion invalidates stale permission cache and reports completion to the user;
- incoming attachment download still returns real bytes;
- rich HTML compose, reply/reply-all/forward and durable draft attachments remain accepted;
- signature auto-append remains real but its setting is in account/settings IA;
- per-user isolation and server-only provider-token boundaries remain unchanged;
- restart persistence, Local-UAT backup/restore and mail-only CI routing remain green.

## 10. Batch 26｜Unread stability, provider history isolation and inbound normalization

Batch 26 is triggered by Formal Windows UAT after Batch 25. The original two release-blocking failures were:

1. simply entering `未读邮件` caused messages to be marked read one after another without further user input; and
2. provider mail bodies could expose layout entities such as repeated literal `&zwnj;` as visible garbage.

The closure audit then identified additional continuous-use defects that are part of the same Batch26 boundary rather than follow-up scope: attachment stable identity, Gmail inline MIME bytes, Gmail Spam/Trash history visibility, per-message/per-account provider failure isolation, provider mapping reconciliation, multi-account permission/health semantics, and actor-scoped browser cache isolation.

### 10.1 Read-state interaction contract

Folder navigation and passive reading-pane selection are **not** read-state mutations.

The previous cascade was deterministic: the UI selected `visible[0]`, a timer marked the selected unread message READ after 800 ms, the unread filter removed that message, `visible[0]` became the next unread message, and the timer repeated. Batch 26 removes this timer entirely.

The governed behavior is now:

- entering or switching to `未读邮件` performs zero READ mutations;
- an unread message is marked read only when the user explicitly opens that row, or when the user invokes an explicit read/bulk-read action;
- explicit open may mark **at most that one message** read;
- after that message becomes read, its reading pane may remain visible so the UI does not jump to the next unread message;
- this preservation applies only while the message still belongs to Inbox; archive/trash/spam or another folder-changing action must move the reader to the next message in the current folder;
- no elapsed-time effect may select or mutate the next unread message;
- opening a message performs silent routine feedback; explicit toolbar/bulk mutations retain normal visible feedback;
- Gmail/Microsoft user-visible READ/UNREAD is authoritative only after a real provider-backed mutation; missing provider write permission must fail/upgrade rather than fall back to a fake local read state;
- the historical actor-scoped local read-state store remains a compatibility/testing substrate and is not the authoritative visible state for Gmail/Microsoft;
- changing any folder/filter clears stale row selections and stale action feedback.

### 10.2 Inbound provider-text contract

Provider/legacy mail body text is normalized before it is treated as GBAP readable text. Layout artifacts are not user content.

Normalization covers:

- literal zero-width characters U+200B/U+200C/U+200D/U+2060/U+FEFF;
- named zero-width HTML entities such as `&zwnj;` and `&zwj;`;
- decimal/hex numeric equivalents;
- double-encoded cases such as `&amp;zwnj;`;
- `&nbsp;` and normal HTML entity decoding;
- HTML-to-readable-text conversion for provider text that still contains markup;
- bounded whitespace cleanup without rewriting the semantic content.

The rule is applied in two places deliberately:

1. **server snapshot/cache boundary** — fresh provider records and old encrypted snapshots are normalized before being returned or re-cached, so previously cached garbage is repaired after upgrade without reconnecting the mailbox;
2. **presentation boundary** — list preview, search, reader body and reply/forward quote use the same readable-text normalizer so raw entities cannot leak from an older/legacy path.

This changes only GBAP's working representation. It does not mutate the original provider email body.

### 10.3 Refresh and transient-state hardening

- `visibilitychange` may request background refresh only after the document becomes visible, not when it becomes hidden;
- routine success banners auto-dismiss instead of occupying the workspace indefinitely;
- completed action feedback auto-dismisses while active operations and real errors remain explicit;
- Gmail history requests explicitly include Spam and Trash so real provider moves remain visible after refresh;
- Google permission-upgrade detection examines all connected accounts rather than only `accounts[0]`;
- overall channel health examines all connected channels rather than allowing the first channel to mask another channel failure.

### 10.4 Provider history failure isolation

A transient problem in one provider/account/message must not unnecessarily destroy another healthy mailbox path.

- Gmail message enumeration still fails on real list-level/provider failures, but a single message fetch that returns 404 because the message was deleted/moved concurrently is skipped at message level rather than aborting the entire Gmail history batch;
- non-404 message fetch failures remain real failures and are not silently swallowed;
- connected Google/Microsoft accounts are refreshed independently;
- if one account fails while another succeeds, the healthy account contributes fresh data and the failed account retains its last usable in-memory records for the current actor when available;
- if every eligible direct-provider account fails, the adapter fails upward to the existing guarded compatibility/history path rather than presenting an empty direct mailbox as authoritative;
- per-account failures are logged with actor/account/provider diagnostic context without exposing provider credentials.

### 10.5 Actor-scoped browser mailbox state

The browser may keep a memory-only snapshot to make Mail re-entry instant, but that snapshot is scoped by the current GBAP actor subject.

- actor A's in-memory mailbox is never returned to actor B after same-browser sign-out/sign-in;
- `peekMailWorkspaceSnapshot` requires the current actor subject and returns null on actor mismatch;
- asynchronous snapshot/refresh results are accepted into the active surface only when the actor subject that initiated the request still matches the active actor;
- provider identity maps used for mutations are rebuilt from the accepted actor-scoped snapshot;
- actor isolation is supplemental to the encrypted server-side actor-scoped SQLite snapshot and does not move mailbox bodies into browser persistent storage.

### 10.6 Formal Batch 26 acceptance

Batch 26 cannot close until the exact head proves all of the following together:

- with at least two unread messages, entering `未读邮件` and idling for more than two seconds produces **zero** READ provider actions and leaves the unread count unchanged;
- explicitly opening one unread message produces exactly one READ action and reduces the unread count by exactly one;
- after another idle interval, no second READ action occurs and the next unread message remains unread;
- the opened message remains readable after its own read-state transition without causing a jump cascade;
- archive/trash/spam still moves a message out of its current folder and normal next-message selection remains intact;
- Gmail/Microsoft READ/UNREAD uses `workspace.action` with stable message/account/external identity and never reintroduces local fake provider state;
- literal/decimal/hex/double-encoded zero-width entities do not appear in list preview, reader body, search text or reply quote;
- old encrypted Batch25 snapshots are normalized on read and rewritten normalized on subsequent cache writes;
- search does not alter left-rail folder totals and `未读` represents Inbox/incoming unread semantics only;
- Gmail history includes Spam/Trash;
- incoming attachment list/download accepts stable `messageId + connectedAccountId + externalMessageId` evidence and remains actor scoped;
- Gmail small MIME attachments stored directly in `part.body.data` are listed/downloaded through the governed same-origin path without exposing raw inline bytes to the browser;
- a Gmail message-level 404 does not abort the rest of history, while non-404 failures still surface;
- one failed provider/account does not take down healthy connected accounts; all-account failure still fails upward to integrity protection;
- provider mapping reconciliation reuses an existing actor/provider/account/external witness and Microsoft move external IDs survive snapshot/re-entry;
- the browser memory snapshot and stale async refresh results are actor scoped;
- existing Batch18–25 send, rich compose, drafts, attachments, provider actions, cache protection and Dark-mode acceptance remain green;
- Stage3.7 routing remains mail-only for this batch; CRM semantic and Keycloak acceptance are skipped unless an actual non-mail file is changed;
- final merge authority requires one stable exact head with Fast CI PASS + mail-only Stage3.7 PASS + one focused `/gbap-final local-uat` PASS. Older Final/CI runs are stale once the head changes.

Batch26 becomes accepted only when those exact-head gates pass and PR #164 is merged under expected-head protection. Until then this document remains a final candidate, not a closure declaration.
