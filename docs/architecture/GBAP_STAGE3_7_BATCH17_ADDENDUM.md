# GBAP GBAP｜Stage 3.7 Batch 17 Addendum

Status: **PASS / ACCEPTED / MERGED / LOCAL-UAT FINAL PASS**

Date: 2026-09-10

Repository: `hhhh666-888/global-business-ai-platform`

Scope: real-use hardening for remembered login, bounded SSO lifetime, customer-company sticky actions, customer CSV collection/import/export, and mail/calendar administrator initialization guidance.

This addendum extends Stage 3.7 only. It does not reopen unaffected Stage 3.5 / Stage 3.6 architecture or previously frozen provider boundaries.

---

## 1. Remember Me and session lifetime

### 1.1 Root cause

Before Batch 17:

```text
Keycloak rememberMe                         enabled
normal SSO idle/max                         effectively 24h
Remember Me idle/max                        effectively 24h
Web access/refresh token storage            sessionStorage
Web defensive session max                   hard-coded 24h
browser restart                             Web tokens disappear
remembered Keycloak SSO cookie              not used for silent Web recovery
```

Therefore the login-page `记住我` option did not provide a meaningful product difference after the browser was closed and reopened.

### 1.2 Accepted correction

```text
normal SSO idle              7 days
normal SSO maximum           30 days
Remember Me idle             30 days
Remember Me maximum          90 days
Web defensive absolute max   90 days
access/refresh tokens         sessionStorage only
password persistence          NONE
long-term token localStorage  NONE
browser reopen                silent OIDC + PKCE recovery from Keycloak SSO
explicit logout               suppresses silent recovery and performs real logout
```

Remember Me means persistent SSO, not browser-side password storage.

The durable authentication authority remains Keycloak. The Web application must not create a second independent long-lived session authority.

### 1.3 Security boundary

Permanent rules:

- do not store passwords in GBAP browser storage;
- do not persist access or refresh tokens in `localStorage`;
- browser restart recovery must use the Keycloak SSO cookie through the governed OIDC boundary;
- explicit logout must not be silently reversed by automatic login recovery;
- session duration remains bounded, not infinite.

---

## 2. Customer Company leading action during horizontal scroll

### 2.1 Owner-observed defect

The Customer Company `查看` action appeared visually at the leading side but still moved when the wide customer table was scrolled horizontally.

### 2.2 Root cause

Batch 16 used a visual reordering approach while the action cell still belonged to the horizontally scrolling table flow. Visual placement alone did not establish a real pinned column.

### 2.3 Accepted correction

```text
customer action column      leading visual/table order
position                    sticky
left                        0
horizontal customer data    scrolls independently
View action x-coordinate    remains stable while table scrolls
```

Focused browser acceptance explicitly scrolls the customer table horizontally and proves the leading View action remains pinned.

---

## 3. Customer collection CSV / import / export

### 3.1 Problem corrected

The earlier Chinese customer CSV template covered only basic company fields and no longer matched the Customer Intelligence model introduced in Batch 12.

Batch 17 aligns the collection template, import parser, customer-intelligence write path and export semantics.

### 3.2 Accepted collection scope

The governed customer-company collection template may include:

```text
base company identity/contact/location
customer segment / roles
industry / source / priority
industrial site / facility / roof / land data
operating hours / shifts
electricity consumption / cost / tariff / peak demand
grid stability / outage hours
transformer / generator / existing PV / storage
major equipment / energy pain points / project needs
budget / timeline
channel products / represented brands / suppliers
annual purchase value / purchase currency / frequency
coverage / branches / warehouse capability
installation / after-sales / technical-team capability
channel customer segments / target products
payment terms / next purchase timing
```

Old basic CSV headers remain backward-compatible.

### 3.3 Parser behavior

Accepted behavior:

- UTF-8 comma-separated CSV is the canonical format;
- common semicolon/tab-delimited text exports are detected where supported;
- a binary Excel workbook renamed from `.xlsx` to `.csv` must be rejected with an actionable error;
- unsupported/incorrect text encoding must surface an actionable error;
- unknown/malformed headers and missing required company identity data must fail clearly rather than partially importing silently;
- customer-intelligence fields are written through the GBAP-owned semantic API, not directly to Twenty.

Users must use Excel/WPS **Save As / Export -> CSV UTF-8 (comma delimited)** rather than renaming a workbook extension.

---

## 4. Mail / Calendar initialization guidance

Email and Calendar remain optional per-user self-service connections behind company-level provider readiness.

Accepted administrator flow:

```text
1. create Google Cloud and/or Microsoft Entra OAuth application
2. configure the governed redirect URI(s)
3. on Windows Local UAT run Configure-GBAP-UAT-MailCalendar.ps1
4. enter provider Client ID / Client Secret locally
5. secrets remain in the Git-ignored local environment file
6. reload through the governed Local-UAT start path
7. each employee connects their own mailbox/calendar from GBAP
```

Super administrators may see server initialization guidance. Normal employees must not receive OAuth client secrets or server-operations details.

The administrator configuration entry points remain:

```powershell
cd E:\GlobalBusinessAIPlatform\infrastructure\local-uat
.\Configure-GBAP-UAT-MailCalendar.ps1 -Provider Google
.\Configure-GBAP-UAT-MailCalendar.ps1 -Provider Microsoft
.\Configure-GBAP-UAT-MailCalendar.ps1 -Provider Both
```

After configuration, use the governed Local-UAT start/reload path rather than manually restarting individual containers.

---

## 5. Validation and failure handling

One browser failure during Batch 17 was caused by a legacy Batch 11 contrast helper sampling a transient PageActionBridge clone while that topbar clone was being replaced. Product colors were not changed to make the test pass.

The correction made the test use retryable Playwright CSS assertions against a stable visible node while preserving the same white-text and >= 4.5:1 contrast requirements.

This follows the permanent Stage 3.7 diagnostic rule:

```text
new failure
-> read the new failure evidence once
-> determine bounded root cause
-> fix product or fixture according to fact
-> rerun affected verification only
```

---

## 6. Exact-head evidence

```text
PR #143 final head          ce3007bf7c975a044286d253152a7edbaa1b34e2
product merge               8a8abec50a1da2fda641dce28bf4f54dcae283e6
Fast #302                   PASS
Fast run id                 34482977025
Stage 3.7 Browser #79       PASS
Browser run id              34482977047
Final Command Bridge #92    PASS
Bridge run id               34483351114
Local-UAT Final #74         PASS
Local-UAT run id            34483386622
/gbap-final all             NOT RUN / NOT REQUIRED
```

Local-UAT Final #74 passed:

```text
exact source checkout
VM-primary toolchain and control-plane checks
static final preflight
Web build
fail-closed offline inputs
isolated real UAT boot
real UAT health and identity lifecycle
restart persistence
governed backup and restore rollback
CI-only UAT cleanup
final GitHub Actions control-plane handoff
```

Twenty CRM Heavy proof was correctly skipped for the `local-uat` suite.

---

## 7. Frozen Batch 17 result

Batch 17 is accepted as the Stage 3.7 authority for:

- meaningful Remember Me behavior without browser-side password/token persistence;
- bounded normal and remembered SSO lifetime;
- silent browser-reopen SSO recovery with explicit logout protection;
- Customer Company pinned leading View action during horizontal scrolling;
- renewable/industrial/channel customer CSV collection/import/export semantics;
- clear rejection of renamed Excel workbooks and malformed CSV inputs;
- administrator-visible mail/calendar OAuth initialization guidance.

Production remains **NOT AUTHORIZED**.
