# GBAP GBAP｜Stage 3.7 Real-use Feedback Hardening

Status: **ACTIVE / OWNER-AUTHORIZED / REAL-USE FEEDBACK MAINLINE**

Started: 2026-09-08

Repository: `hhhh666-888/global-business-ai-platform`

## 1. Purpose

Stage 3.7 is the owner-authorized real-use feedback hardening phase after the accepted Stage 3.6 product baseline.

It does **not** reopen Stage 3.6 architecture as a whole and does not authorize an uncontrolled redesign. Real company use supplies concrete product feedback, which is handled in bounded batches.

Permanent execution rule:

```text
REAL USE FEEDBACK
-> CURRENT FACTS
-> BOUNDED ROOT CAUSE
-> MINIMUM PRODUCT FIX
-> AFFECTED-SCOPE ACCEPTANCE
-> MERGE
-> ONE GOVERNED WINDOWS UPDATE WHEN NEEDED
-> REAL USE AGAIN
```

Each batch must preserve unaffected frozen boundaries, record exact-head evidence and avoid duplicate Heavy CI.

## 2. Batch 1｜REAL-USE FOUNDATION / PR #115

Accepted outcomes:

- login identity changed from environment-facing `GBAP LOCAL UAT` to:

```text
佛光全球业务智能平台
GBAP Global Business AI Platform
```

- Chinese/Unicode usernames supported with NFC-normalized Unicode letters/numbers plus `._@-`, 2–64 characters;
- customer spreadsheet intake uses an explicit UTF-8 CSV contract rather than silent arbitrary-column guessing;
- common Chinese/English aliases are recognized, unknown columns are disclosed and ignored;
- existing Excel/WPS users may Save As CSV UTF-8;
- Files normal guidance stops exposing internal role wording.

Customer import contract remains:

```text
Recommended source       GBAP Chinese CSV template
Accepted upload          UTF-8 CSV
Existing Excel/WPS       Save As -> CSV UTF-8
Single import limit      300 data rows
Unknown columns          shown + ignored
Silent arbitrary guess   PROHIBITED
```

Evidence:

```text
PR #115
final head     554fc116684522337bee9450d9a87c1648ed88d4
merge          0d68efd5c4c80390c355507222486fccf395f767
Fast #227      PASS 14/14
Browser #5     PASS / VM primary
```

## 3. Batch 2｜LOGIN BRANDING / ENCODING HARDENING / PR #117

Real Windows UAT showed Chinese branding as `????????` while English rendered correctly.

Accepted correction:

- brand remains exactly the Chinese product name + English product name;
- desktop uses brand-left / login-right layout;
- user-visible Chinese text does not depend on a Windows PowerShell-persisted Chinese realm display string;
- the GBAP Keycloak child theme owns stable Unicode-safe branding;
- focused acceptance boots real isolated Keycloak 26.7.2 and proves correct Chinese rendering even with corrupted realm display text.

```text
PR #117
final head     f8333591a79ebbd2de030d7751df6395d24072bc
merge          73e96ed1d9e8e1d5066fce940d9f1ebe9d01dfb3
Fast #232      PASS 14/14
Browser #10    PASS / real Keycloak / VM primary
```

## 4. Batch 3｜ENTERPRISE LOGIN VISUAL POLISH / PR #119

Accepted direction:

- deep navy / graphite enterprise canvas;
- restrained layered gradients and engineering texture;
- brand-left / login-right desktop composition;
- high-contrast light login card;
- refined input, focus, border, shadow and button hierarchy;
- no marketing copy, feature tags, stock background image or replacement authentication flow.

```text
PR #119
final head     c55b2f685e069d4238a52720268e50c68a5729fe
merge          d563ff6d5c56e16d76dbbfcf225ca6afe6ea6663
Fast #233      PASS
Browser #11    PASS / VM primary
```

The project owner subsequently observed the real Windows UAT page and accepted the visual direction as materially improved.

## 5. Batch 4｜LOGIN BRAND HIERARCHY DETAIL / PR #121

Owner-requested refinement:

- Chinese title stays on one line on desktop;
- vertical light accent becomes a horizontal light line below the Chinese title;
- English subtitle is slightly larger while remaining compact;
- Batch 3 background, login card and authentication behavior stay unchanged.

```text
PR #121
final head           5ae5929a2eba2c283194b584b4356b7b0e3e15f1
merge                80d1fd668712f85d4f45095c639f1ad339259c42
Browser #13          PASS / VM primary
VM Fast Recovery #1  PASS 14/14
```

The WSL `Complete job` finalization problem observed during this batch is a separate deferred CI-governance issue, not a product failure.

## 6. Batch 5｜CRM INFORMATION ARCHITECTURE + DATA GOVERNANCE / PR #122

Real-use feedback identified that the main CRM navigation and user-facing `业务数据中心` duplicated business navigation and mixed ordinary business work with governance functions.

Accepted permanent structure:

```text
NORMAL BUSINESS WORK
  -> normal business pages

RECOVERABLE DELETE
  -> one unified 回收站

BULK DATA IMPORT / EXPORT
  -> super-admin only

PERMANENT DESTROY
  -> super-admin only, server enforced

BUSINESS DATA CENTER
  -> no user-facing navigation
  -> no duplicate user workspace
```

Authoritative business navigation:

```text
客户公司
联系人
商机
任务
笔记
邮件
日历
文件
常用视图
回收站
```

`CrmRuntimeWorkspaceV2` may remain as an internal reusable implementation asset; it is not a second user workspace.

Bulk `数据导入与导出` UI authority:

```text
employee      NO
manager       NO
super-admin   YES
```

Company/person/opportunity/task/note normal delete actions use recoverable Runtime soft-delete semantics. Permanent destruction is separated and protected by backend admin enforcement; UI visibility is not the security boundary.

```text
PR #122
final head     32e86408c1744bdbff8d8abb647f9693d167679e
merge          5834753064e8b80a20d5b96a6d55c2c2e63c186e
Fast #238      PASS 14/14
Browser #15    PASS / VM primary
```

## 7. Batch 6｜PERMISSION-GUIDANCE COPY CLEANUP / PR #124

The owner requested that unnecessary permission explanations be removed from normal business pages.

Accepted behavior:

- Files page does not display the sentence explaining which users can delete files;
- Recycle Bin does not display a role explanation saying permanent deletion is only for super-admin;
- irreversible-delete confirmation remains concise;
- actual file-delete and recycle-bin authorization remains unchanged.

```text
PR #124
merge          e118a5b0da3cc465b58008c1fddbca43dd492307
Fast #239      PASS
Browser #16    PASS
```

## 8. Batch 7｜FILE RECYCLE LIFECYCLE + 300 MB / PR #125

### 8.1 Observed real-use defect

Before Batch 7:

- file `DELETE` physically removed the `crm_file` row immediately;
- deleted files could not be recovered through the unified Recycle Bin;
- backend default upload limit was only `8 * 1024 * 1024` bytes.

This conflicted with the accepted Stage 3.7 recoverable-delete model and normal business-file usage.

### 8.2 Accepted file lifecycle

```text
normal file delete          SOFT DELETE
normal file list/download   EXCLUDES soft-deleted files
recovery location           ONE unified 回收站
restore                     original uploader or substrate-admin
permanent file destroy      substrate-admin only
server enforcement          requireAdmin(actor)
```

Native GBAP file persistence is additively upgraded at API startup with:

```text
deleted_at TEXT
deleted_by TEXT
```

The migration is additive. Existing rows remain intact and are treated as active because the new deletion columns are null.

A normal file delete writes deletion metadata instead of deleting the row. Physical `DELETE FROM crm_file` occurs only in the separate permanent-destroy route after admin enforcement.

### 8.3 Unified Recycle Bin

The single product-level Recycle Bin now covers:

```text
company
person
opportunity
task
note
file
```

Files use the native GBAP file-service lifecycle rather than the generic CRM Runtime table, but the user-facing recovery model is unified.

### 8.4 Accepted file capacity

```text
single-file business limit  300 MiB
backend default             300 * 1024 * 1024 bytes
frontend initial limit      300 MiB
API Node heap ceiling       1536 MiB
```

The current upload protocol still transports file bytes through Base64/JSON. The larger Node heap ceiling is therefore required as bounded runtime headroom near the 300 MiB business limit. It is a maximum heap ceiling, not preallocated memory.

Future replacement with a streaming/multipart upload path would be an implementation optimization, not a reason to reduce the accepted 300 MiB product limit.

### 8.5 Batch 7 exact-head acceptance

```text
PR #125
final head                  3f6dba606776df692101b19e1830f0f24bbc4347
merge                       dea972fbec42d7e722691dec6a5ae081f4d3e765
Fast #240                   PASS 14/14
Stage 3.7 Browser #17       PASS / VM primary
Local-UAT Final #69         PASS / VM primary
```

Local-UAT #69 proved on the exact PR head:

```text
isolated UAT boot           PASS
UAT health                  PASS
identity lifecycle          PASS
restart persistence         PASS
governed backup/restore     PASS
cleanup / handoff           PASS
```

`/gbap-final all` was not required and was not run for this batch. The affected `local-uat` gate was sufficient because the persistence lifecycle changed but Real Twenty semantics and unrelated Heavy domains did not.

## 9. Frozen / no-repeat boundaries

```text
DO NOT recreate a user-facing 业务数据中心.
DO NOT put normal object functions back into a duplicate workspace.
DO NOT give employee/manager bulk Data Import & Export access.
DO NOT convert file deletion back to immediate physical deletion.
DO NOT expose permanent delete to normal users as a capability.
DO NOT treat hidden UI controls as the authorization boundary.
DO NOT use /gbap-final all as a debugger.
DO NOT repeat unaffected Heavy CI.
DO NOT delete/recreate company UAT data to apply bounded Stage 3.7 fixes.
DO NOT retire WSL; it remains backup/overflow until separate CI governance changes it.
```

Unchanged Stage 3.6 boundaries remain authoritative, including GBAP identity/authorization, canonical IDs, provider-neutral boundaries, replaceable Twenty integration and Production NOT AUTHORIZED.

## 10. Current Stage 3.7 product rule

```text
ONE MAIN BUSINESS NAVIGATION
+ BUSINESS FUNCTIONS ON THEIR OWN PAGES
+ ONE UNIFIED RECYCLE BIN INCLUDING FILES
+ SUPER-ADMIN BULK DATA GOVERNANCE
+ SERVER-ENFORCED PERMANENT DESTROY
+ 300 MiB SINGLE-FILE LIMIT
+ NO DUPLICATE BUSINESS DATA CENTER UI
```

Stage 3.7 remains **ACTIVE** for further bounded real-use feedback.

The owner confirmed a company-local deployment before Batches 6 and 7 but did not supply its exact installed SHA. Therefore do not invent the Windows installed SHA. When the company UAT is next refreshed, perform one governed update to refreshed current `main` with mandatory backup and verify the new file lifecycle in real use.