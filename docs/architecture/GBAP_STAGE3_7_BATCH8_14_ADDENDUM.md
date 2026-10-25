# GBAP GBAP｜Stage 3.7 Batch 8–14 Authority Addendum

Status: **ACTIVE AUTHORITY ADDENDUM / MERGED PRODUCT FACTS ONLY**

Repository: `hhhh666-888/global-business-ai-platform`

Updated: 2026-09-09

This file supplements `docs/architecture/GBAP_STAGE3_7_REAL_USE_FEEDBACK.md`.

The original Stage 3.7 authority remains authoritative for Batches 1–7. This addendum records Batches 8–14 without reopening or silently rewriting earlier accepted decisions.

Permanent execution rule remains:

```text
REAL USE FEEDBACK
-> CURRENT FACTS
-> BOUNDED ROOT CAUSE
-> MINIMUM PRODUCT FIX
-> AFFECTED-SCOPE ACCEPTANCE
-> EXACT-HEAD MERGE
-> ONE GOVERNED WINDOWS UPDATE WHEN NEEDED
-> REAL USE AGAIN
```

Production remains **NOT AUTHORIZED**.

---

## 1. Batch 8｜CRM VISUAL SYSTEM + SETTINGS / APPEARANCE｜PR #127

Accepted product behavior:

```text
appearance choices          LIGHT / DARK / SYSTEM
preference scope            per signed-in user on current device/browser
business data impact        NONE
authorization impact        NONE
authentication impact       NONE
provider/runtime boundary   UNCHANGED
```

Accepted Settings structure:

```text
设置
  外观
    浅色
    深色
    跟随系统
  数据与恢复
    回收站
  系统管理
    super-admin only
```

The Recycle Bin is not a primary CRM business-navigation item. The unified recoverable lifecycle and server-side authorization rules remain unchanged.

```text
PR #127
final head                  5ac4a7f14a778fc8ee2eb3258b4b8f5bf7dda125
product merge               30e31da890a123945d1c51c7841bad722b415476
Fast #244                   PASS
Stage 3.7 Browser #21       PASS / VM primary
Heavy Final                 NOT RUN / NOT REQUIRED
```

---

## 2. Batch 9｜DARK THEME CSS CASCADE CORRECTION｜PR #129

Real Windows UAT proved that feature-local legacy light CSS could override the governed appearance layer.

Accepted correction:

```text
feature/component CSS       loads first
crm-visual-system.css       final governed appearance/cascade layer
Light / Dark / System       preserved
business logic              unchanged
authorization               unchanged
data / persistence          unchanged
```

Focused acceptance proves Files and Company inner surfaces do not revert to pure white in Dark mode.

```text
PR #129
final head                  4ce21af59ebf0447c7ff2077c85961ef716e54ad
product merge               2e416beac12b885aacc82823318551c310016f08
Fast #245                   PASS
Stage 3.7 Browser #22       PASS / VM primary
Heavy Final                 NOT RUN / NOT REQUIRED
```

---

## 3. Batch 10｜PAGE HEADER CONSOLIDATION + TOPBAR ACTIONS｜PR #131

Accepted product structure:

```text
single authoritative page title        APP TOPBAR
page-level Refresh / New actions        TOPBAR
Opportunity view toggle                 TOPBAR
nested section headings                 PRESERVED
compact live count/status copy          PRESERVED
separate hollow desktop action band     REMOVED / COLLAPSED
global search                           MUST NOT OVERLAP PAGE ACTIONS
responsive narrow-screen fallback       PRESERVED
```

Workbench uses React Portal. Legacy surfaces use `PageActionBridge` only as a structural compatibility layer while source surfaces retain ownership of business handlers.

```text
PR #131
final head                  55ba48b8cf87a68502418e54fcea6a30c1cedec3
product merge               7d49b898a1aedbb4bf5f70cb08948a2cbce97c03
Fast #266                   PASS
Stage 3.7 Browser #43       PASS 14/14 / VM primary
Heavy Final                 NOT RUN / NOT REQUIRED
```

---

## 4. Batch 11｜PRIMARY ACTION + DARK SELECTION CONTRAST｜PR #133

### 4.1 Accepted Primary Action rule

Authoritative page-level New/Add actions use GBAP-owned native semantic buttons rather than cloned Twenty primary-action internals.

```text
background          #2f6fed
text / icon         #ffffff
border              #2f6fed
hover               #245bc7
target contrast     >= 4.5:1
Light / Dark        same primary-action language
```

Covered page-level actions include Workbench, Customer Company, Contacts, Opportunities, Tasks, Notes and User Management.

### 4.2 Accepted Dark interaction-state rule

```text
hover / focus       var(--fg-hover)
selected / active   var(--fg-selected)
strong border       var(--fg-border-strong)
text                var(--fg-text)
```

Dark mode must not introduce abrupt large pure-white hover/selected surfaces with unreadable light text.

### 4.3 No-repeat lesson

Do not keep extending third-party DOM guesses for authoritative page-level primary actions. Use native GBAP controls.

```text
PR #133
final head                  34f50c7106b43783206ad359e4a39cbfea0813b7
product merge               6b38efe2e4f3f300c609de2ef38d5c7968c7e48b
Fast #275                   PASS
Stage 3.7 Browser #52       PASS
Heavy Final                 NOT RUN / NOT REQUIRED
```

---

## 5. Batch 12｜CUSTOMER INTELLIGENCE DATABASE｜PR #135

### 5.1 Accepted customer-company architecture

The old permanent left-company/right-detail split is replaced by one scalable customer table plus large detail/editor interaction.

One canonical Customer Company master is retained. Do **not** create disconnected CRMs for factories, distributors or EPC/project customers.

Classification model:

```text
primaryCustomerClass        one primary business segment
customerRoles[]             multi-select simultaneous roles
```

Typical roles include industrial end user, factory/manufacturer, mine, data center, commercial/industrial park, agriculture, renewable-energy distributor, generator distributor, electrical-equipment distributor, EPC/system integrator, project developer, investor, utility and public-sector organization.

A company may hold multiple roles without duplicate company records.

### 5.2 Accepted scalable list behavior

Customer Company is a table-oriented database view with:

```text
search
role/segment presets
country / industry / customer-type filters
energy-use and outage filters
channel/procurement filters
per-column sort
column drag/reorder
show/hide columns
saved views / per-user view preferences
large detail/editor surface
```

The list must not remain functionally capped by a small frontend-only fetch when customer volume grows. Server-side scalable listing/filter/sort is the intended long-term behavior.

### 5.3 Industrial-energy profile

Structured fields cover, where available:

```text
site/factory count
facility/building/roof/land area
monthly/annual electricity consumption
monthly electricity cost / tariff
peak demand / average load
operating hours / shifts / 24x7
outage frequency and duration
transformer capacity / quantity
backup generator capacity / quantity / fuel / operating hours
major production and energy-consuming equipment
existing PV
existing storage
planned expansion/load growth
energy pain points
solution interests
project timing / budget / financing
energy-data completeness / last update
```

Industrial Energy Opportunity grades are explainable and derived from factual fields such as consumption, tariff/cost, outage severity, runtime, generator use, site feasibility, expansion, stated needs, budget/timing and decision/data readiness. Do not use annual revenue alone and do not introduce opaque black-box scoring.

### 5.4 Channel / distributor profile

Structured fields cover, where available:

```text
channel type
main products
represented brands
current suppliers / China suppliers
importer / authorized distributor / EPC capability
annual / recent procurement scale
procurement frequency
common models / power ranges
coverage territory
branches / dealer network / warehouse
installation / technical / after-sales capability
payment / credit / target price band
purchasing manager / owner / technical lead
WhatsApp / email / LinkedIn
next purchasing timing
target GBAP products
competing brands / replacement opportunity
estimated order scale
follow-up state
```

Channel Opportunity is separate from Industrial Energy Opportunity and is derived from channel-specific factual factors.

### 5.5 Persistence boundary

Extended renewable-energy/customer-intelligence fields live in GBAP `crm_business_state` JSON for Account records.

```text
canonical company ID        UNCHANGED
Twenty headless boundary    UNCHANGED
destructive DB migration    NONE
old companies               COMPATIBLE / progressively enrichable
```

### 5.6 Exact-head acceptance

```text
PR #135
final head                  809b4ece03db7e23d44e1b844d96c86121a9e62f
product merge               ebf607306709c8ff98c3446c2960753ecbf54db0
Fast #277                   PASS
Stage 3.7 Browser #54       PASS
Local-UAT Final run         34334093615 / PASS
Heavy /gbap-final all       NOT RUN / NOT REQUIRED
```

---

## 6. Batch 13｜CUSTOMER PROFILE SAVE + CENTERED DIALOG HARDENING｜PR #136

Real Windows UAT exposed two defects after Batch 12:

1. canonical company creation could succeed while customer-intelligence state write surfaced a temporary CRM error; retrying from the still-open create editor could create another company;
2. detail/new/edit interaction appeared as a page/right drawer rather than a viewport-centered modal, so long forms appeared to extend beyond the visible page.

Accepted root-cause corrections:

```text
canonical create retry      idempotent via remembered businessId
customer profile SQLite     WAL + busy timeout + foreign keys
profile + audit write       BEGIN IMMEDIATE transaction
SQLite busy                 retryable 503
client 5xx handling         bounded retry + persisted read-back
successful persistence      clears pending-create guard
View/New/Edit                viewport-centered fixed modal
modal scrolling             body/editor scrolls; frame stays fixed
```

A real Node + JWT + SQLite test proves customer-intelligence PATCH -> GET -> persisted state + audit read-back.

Existing duplicate rows already present in UAT are not automatically deleted.

```text
PR #136
final head                  99c8b873ea2494269956ee98eed9f1228429b324
product merge               df225d32ea472cb0c8bc79b341474917227d5f5a
Fast #286                   PASS
Stage 3.7 Browser #63       PASS
Additional Heavy Final      NOT RUN / NOT REQUIRED
```

---

## 7. Batch 14｜DARK SURFACE HARDENING + CHINESE LOGIN ACCOUNT｜PR #137

### 7.1 Owner-observed defects

After Batch 13 real Windows UAT use:

1. Dark mode still contained near-white chips/badges/compact surfaces, including customer-role tags and unknown opportunity badges;
2. display surname/given-name could be changed to Chinese, but this did not change the real login account, creating confusion between display identity and username;
3. a directly created Chinese login account was rejected by real Keycloak despite the GBAP backend Unicode validator allowing it.

### 7.2 Dark-theme correction

Root cause: feature CSS referenced `var(--fg-elevated, <light fallback>)` while the governed theme lacked `--fg-elevated`, allowing light fallback surfaces in Dark mode.

Accepted correction:

```text
--fg-elevated compatibility alias    defined in final governed cascade
neutral customer chips               bounded dark safeguards
native dark controls                 bounded dark safeguards
semantic success/danger/role tones   preserved
modal entrance                       opacity-only
modal geometry                       fixed from first frame
```

### 7.3 Identity semantics

The product now explicitly distinguishes:

```text
登录账号（用户名）      real login identifier
显示姓 / 显示名         display identity only
Keycloak subject / ID    durable identity key
```

Existing usernames are not silently renamed by changing display names.

Batch 14 does **not** enable realm-wide editable usernames and does **not** delete/recreate existing users to simulate username migration.

New users may be created directly with Chinese/Unicode usernames.

### 7.4 Root cause of Chinese username failure

GBAP's backend validator allowed NFC-normalized Unicode letters/numbers plus the governed punctuation set, but Keycloak 26.7.2 still applied its default username-profile restrictions, including an IDN-homograph-oriented rule that rejected CJK usernames.

Accepted correction:

```text
GBAP username policy        remains authoritative product policy
Keycloak username profile   synchronized to equivalent bounded Unicode allowlist
validation                  NOT disabled globally
existing persisted realm    bootstrap synchronizes current rule
new realm                   receives same governed rule
```

This resolves the rule mismatch instead of bypassing validation.

### 7.5 Verification discipline / no-repeat lesson

During diagnosis, repeatedly re-fetching the same failed-job log without transitioning to a code/configuration fix was identified as an execution-process defect.

Permanent diagnostic rule:

```text
one failed head / one failure point
-> read sufficient new evidence once
-> determine bounded root cause
-> modify code/configuration
-> run affected verification
-> do not loop on the same log as a substitute for fixing
```

Heavy Final remains a gate, not a debugger.

### 7.6 Exact-head acceptance

```text
PR #137
final head                  852623fcfdd0db05f29be88478f57f529d11db93
product merge               24f1c5837340dff2b391f5962ca976a3404fa8dc
Fast #294                   PASS
Stage 3.7 Browser #71       PASS
Local-UAT Final #72         PASS
Local-UAT Final run id      34356623403
```

Final #72 exact-head proof passed:

```text
checkout / toolchain / control plane   PASS
static final preflight                 PASS
web build                              PASS
isolated UAT preparation               PASS
isolated real UAT boot                 PASS
UAT health + identity lifecycle        PASS
restart persistence                    PASS
governed backup/restore rollback       PASS
CI-only cleanup                        PASS
final control-plane handoff            PASS
```

The identity-lifecycle proof includes real Chinese-account creation and authentication against the governed Keycloak runtime.

`/gbap-final all` was not run as a debugger. Only the affected Local-UAT suite was required after Fast and Stage 3.7 Browser were green.

---

## 8. Current no-repeat boundaries after Batch 14

```text
DO NOT recreate a user-facing 业务数据中心.
DO NOT create separate disconnected CRMs for industrial vs distributor customers.
DO NOT duplicate one company merely because it has multiple customer roles.
DO NOT revert Customer Company to a permanent left-list/right-detail split.
DO NOT treat frontend-only small fetch limits as scalable customer-list architecture.
DO NOT convert file deletion back to immediate physical deletion.
DO NOT expose permanent destruction to normal users.
DO NOT treat hidden UI controls as authorization boundaries.
DO NOT hard-code one appearance mode; preserve Light / Dark / System.
DO NOT let feature-local light CSS silently override governed dark tokens.
DO NOT reintroduce duplicate page titles or hollow desktop action bands.
DO NOT clone unstable third-party DOM semantics for authoritative page-level New/Add actions.
DO NOT allow Dark hover/selected/chip surfaces to become abrupt pure-white blocks.
DO NOT conflate display name with real login username.
DO NOT silently rename existing usernames by editing display identity.
DO NOT disable Keycloak username validation merely to permit CJK.
DO NOT use /gbap-final all as an interactive debugger.
DO NOT repeatedly fetch the same failure log instead of fixing the identified defect.
DO NOT repeat unaffected Heavy evidence.
DO NOT retire WSL; it remains backup/overflow.
DO NOT restart/re-register runners merely because work is queued/running/finalizing.
DO NOT use destructive Docker volume cleanup on company Local UAT.
DO NOT use -SkipBackup for governed Windows updates.
DO NOT expose secrets or runtime credentials.
```

---

## 9. Current legal next action

Stage 3.7 remains **ACTIVE**.

After this docs-only closure reaches `main`:

```text
ONE governed Windows UAT update
-> mandatory backup
-> refresh to current main
-> post-update UAT test
-> real-host verification of Batch 14 dark surfaces + Chinese login account
-> continue bounded real-use feedback only from newly observed defects
```

Production Go-Live remains **NOT AUTHORIZED**.
