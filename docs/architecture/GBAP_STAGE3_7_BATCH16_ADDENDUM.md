# GBAP GBAP｜Stage 3.7 Batch 16 Addendum

Status: **PASS / MERGED / WINDOWS UAT UPDATE PENDING**

Date: 2026-09-10

Repository: `hhhh666-888/global-business-ai-platform`

Product PR: **#141**

## 1. Owner-requested real-use corrections

Batch 16 closes five bounded Stage 3.7 real-use issues without reopening Stage 3.5/3.6 architecture:

1. GBAP must default to Light even when the operating system prefers Dark, unless the user explicitly selected Light / Dark / System.
2. When the user explicitly selected Dark, the Keycloak login surface must also render a readable dark login card rather than a white/light card.
3. Business record create/view/edit interactions must use a stable viewport modal/Portal pattern instead of being trapped by page-local clipping/layout contexts; Identity administration create/edit/reset geometry must follow the same centered modal language.
4. Row-level view/edit actions must lead the row visually instead of being hidden at the far-right edge of wide tables.
5. Opportunity business outcome and foreign-trade progress must be separate concepts: four outcome states remain distinct from the finer GBAP-owned foreign-trade progression.

## 2. Appearance and login behavior

Accepted appearance rule:

```text
no explicit preference          Light
explicit Light                  Light
explicit Dark                   Dark
explicit System                 follow current OS/browser preference
```

OS Dark mode alone must not silently make GBAP Dark.

Because the application shell and Keycloak login runtime are different origins/ports in Local UAT, browser `localStorage` is not a valid cross-origin preference bridge. Batch 16 therefore propagates the explicit device appearance preference to the Keycloak login origin through the governed authentication boundary, while retaining Light when no explicit preference exists.

The Keycloak theme now has a bounded dark appearance layer for the real login card, labels, inputs, links, alerts and related states. This is visual-only and does not change identity, authentication or authorization semantics.

## 3. Business modal and leading-action behavior

Accepted interaction rule:

```text
contact create/view/edit        body Portal modal
opportunity create/view/edit    body Portal modal
task create                     body Portal modal
note create                     body Portal modal
identity create/edit/reset      centered viewport modal geometry
row view/edit action            leading side of row/table
customer company View           visually before customer data
```

The existing topbar page-action authority remains unchanged. Page-level `新建 / 新增` actions are still surfaced through the governed topbar action slot; opening one of those actions may now render its form in a body-level Portal modal.

This intentionally supersedes any older regression assumption that a modal form must remain a DOM descendant of the page surface that launched it.

## 4. Opportunity semantics

Batch 16 separates two different business dimensions.

### 4.1 Opportunity outcome

The existing lifecycle result remains one of four states:

```text
OPEN          进行中
CLOSED_WON    已赢单
CLOSED_LOST   已丢单
CANCELLED     已取消
```

### 4.2 GBAP foreign-trade progress

GBAP owns the finer progress stage in provider-neutral semantic state:

```text
NEW
CONTACTED
QUALIFYING
NEEDS_CONFIRMED
TECHNICAL_SAMPLE
QUOTATION
NEGOTIATION
DECISION
ORDER_PENDING
ON_HOLD
ORDER_CONFIRMED
```

The fine-grained `tradeStage` persists in GBAP `crm_business_state` for Opportunity records and is not delegated as the canonical business meaning to Twenty/provider-specific stages.

Provider integration receives only a coarse compatibility mapping where needed. The GBAP business stage remains authoritative.

Persistence/audit behavior:

```text
canonical Opportunity ID                    UNCHANGED
GBAP crm_business_state tradeStage       NEW CANONICAL EXTENSION
provider-neutral business boundary          PRESERVED
audit action                                crm.opportunity.trade_stage.update
destructive DB migration                    NONE
```

## 5. Focused verification and one corrected stale regression

The exact-head Stage 3.7 acceptance covers:

```text
OS Dark + no stored preference -> Light              PASS
real isolated Keycloak + explicit Dark               PASS
contact body Portal modal                            PASS
opportunity body Portal modal                        PASS
leading contact/opportunity actions                  PASS
customer company View visually before data           PASS
11 foreign-trade stages                              PASS
4 opportunity outcomes                               PASS
customer intelligence real SQLite/JWT semantics      PASS
opportunity tradeStage real SQLite/JWT semantics     PASS
```

One intermediate Stage 3.7 run failed because an older Batch 10 regression still asserted that `新建联系人` form content must be inside the Contact page DOM. Batch 16 intentionally moves the form to a body-level Portal. The old test was corrected to preserve its real authority — one topbar title/action bridge — while validating the new Portal modal boundary. Product code was not weakened to satisfy the stale assertion.

Permanent regression rule:

```text
new accepted behavior supersedes old DOM-placement assumption
-> preserve the old business invariant
-> update only the stale structural assertion
-> rerun exact-head affected acceptance
```

## 6. Exact-head Gate evidence

```text
PR #141 final head                 8c6deca5b1f2f0eae1822ae8351b0f346ded49b7
product merge                      f191fab8adc64ed7d0f1e53c1f2705830b66c3e0
GBAP PR Fast CI #298               PASS
Fast run id                        34450937884
Stage 3.7 Browser #75              PASS
Browser run id                     34450937907
Local-UAT Final #73                PASS
Local-UAT Final run id             34451294116
Final Command Bridge #91           PASS / exact local-uat dispatch
Command Bridge run id              34451268510
/gbap-final all                    NOT RUN / NOT REQUIRED
```

Final #73 passed:

```text
exact source checkout
self-hosted VM-primary toolchain
GitHub Actions control-plane health
governed dependency supply
static final preflight
product Web build
fail-closed offline compose preparation
isolated Local UAT runtime preparation
isolated real UAT boot
UAT health + identity lifecycle
restart persistence
governed backup + restore rollback
CI-only volume cleanup
final control-plane handoff
```

The `Run real Twenty CRM proof` step was correctly skipped because the authorized suite was `local-uat`, not `crm` or `all`.

VM CI remained primary. WSL CI remained available as backup/overflow and was not restarted merely because a job was queued or running.

## 7. Windows Local UAT

Batch 16 product code is merged to `main`, but the company Windows Local UAT host must only be updated once after this docs-only closure reaches `main`.

Governed command:

```powershell
cd E:\GlobalBusinessAIPlatform
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\infrastructure\local-uat\Update-GBAP-UAT.ps1
```

Never use `-SkipBackup`.

Minimum post-update real-host verification:

```text
installed SHA == refreshed GitHub main
updater backup manifest exists
UAT test PASS
no explicit appearance preference -> Light
explicit Dark -> application remains Dark and next Keycloak login card is dark/readable
explicit System -> follows OS/browser
联系人 新建 / 查看 / 编辑 uses centered modal and remains usable
商机 新建 / 查看 / 编辑 uses centered modal and remains usable
任务 / 笔记 create modal remains usable
成员与权限 create/edit/reset modal remains centered and usable
row-level 操作 / 查看 / 编辑 is visible on the leading side
customer company 查看 is visually before customer data
商机 shows 11 foreign-trade progress stages separately from 4 outcome states
tradeStage save -> reload read-back persists
existing Batch 12-15 behavior remains intact
```

Do not invent the installed Windows SHA; read it back from the real host after the governed updater finishes.

Production remains **NOT AUTHORIZED**.

## 8. NEXT

```text
merge docs-only Batch 16 closure
-> one governed Windows Local UAT update
-> real-host read-back against refreshed main
-> continue Stage 3.7 only from newly observed real-use feedback
```
