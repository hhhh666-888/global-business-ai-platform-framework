# GBAP GBAP｜Stage 3.7 Batch 15 Addendum

Status: **PASS / MERGED / WINDOWS UAT UPDATE PENDING**

Date: 2026-09-09

Repository: `hhhh666-888/global-business-ai-platform`

Product PR: **#139**

## 1. Owner-observed real-use defect

After Batch 14 was installed on the company Windows Local UAT host, the owner observed that the User Administration row action menu opened but was clipped by a horizontal container boundary. The visible symptom was the `更多` menu showing only part of `停用账户 / 删除账户`.

This was treated as a floating-layer/layout defect, not an identity or authorization defect.

## 2. Root cause

The User Administration surface is rendered as:

```text
<section class="panel flush identity-admin">
```

The generic product panel rule applies:

```css
.panel { overflow: hidden; }
```

The row menu itself is an absolutely positioned descendant:

```css
.identity-action-menu {
  position: absolute;
  z-index: 30;
}
```

A child z-index cannot escape an ancestor overflow clipping boundary. Increasing z-index alone therefore cannot solve this defect.

A second same-family risk was also found in the global product entrance animation:

```css
.content > * {
  animation: product-enter ... both;
}
```

The retained final `transform` creates a containing block for fixed descendants. User Administration owns fixed create/edit/password drawers, so this surface also needed to stop retaining the transform.

## 3. Accepted correction

Batch 15 adds a final floating-layer hardening layer:

```text
User Administration root animation/transform     REMOVED
User Administration floating ancestors           overflow: visible
row action menu layer                             raised / viewport-bounded
row action menu vertical overflow                 internal auto scroll when needed
global-search topbar ancestry                     explicitly non-clipping
global-search popover layer                       raised
```

The correction is deliberately bounded to floating UI geometry. It does not change:

```text
API behavior                  UNCHANGED
identity semantics            UNCHANGED
authorization                 UNCHANGED
persistence                   UNCHANGED
Keycloak policy               UNCHANGED
CRM provider boundary         UNCHANGED
business data                 UNCHANGED
```

## 4. Similar-layer audit

The current hand-written business popovers reviewed in this batch include:

1. User Administration `更多` row-action menu — confirmed affected and fixed.
2. Global Search result popover — current topbar ancestry was not clipped, but the non-clipping invariant and layer were explicitly hardened to prevent recurrence after future shell changes.
3. Native `<select>` controls — browser-owned popup behavior, not the same DOM overflow-clipping mechanism.
4. Customer View/New/Edit modal — already governed by the Batch 13 centered-modal layer; its geometry was not reopened.

The accepted rule is structural:

```text
custom floating business UI
-> must not live behind an overflow:hidden/clip ancestor
-> must not depend on z-index to escape clipping
-> fixed viewport UI must not be trapped by a retained transformed ancestor
```

## 5. Browser acceptance

The focused Playwright acceptance now opens the real `更多` menu and proves:

```text
menu visible                              PASS
停用账户 visible                          PASS
删除账户 visible                          PASS
menu height > 40 px                       PASS
menu inside viewport                      PASS
hidden/clip ancestor chain                NONE
User Administration computed overflow     visible
User Administration computed transform    none
User Administration entrance animation    none
```

This directly covers the real Windows UAT screenshot failure mode rather than relying on a CSS-source-only assertion.

## 6. Exact-head Gate evidence

```text
PR #139
final head                  d0db576ee2afc015d375c3ae38b635559090068d
product merge               ae3a75a74003be9e2cf515cb169b3792a3183f11
GBAP PR Fast CI #295        PASS
Stage 3.7 Browser #72       PASS
Local-UAT Final             NOT RUN / NOT REQUIRED
/gbap-final all             NOT RUN / NOT REQUIRED
```

Fast #295 temporarily paused during checkout and later continued to PASS without runner restart or job rerun. This remains consistent with CI governance: queued/assigned/in-progress status is not itself a reason to restart or re-register a runner.

## 7. No-repeat rule

Do not solve future clipping defects by only increasing z-index.

Required diagnosis order:

```text
floating element
-> inspect clipping ancestors (overflow hidden / clip / scroll)
-> inspect transformed/filter/contain ancestors
-> inspect stacking context
-> choose structural non-clipping boundary or portal where needed
-> focused browser geometry acceptance
```

Do not weaken browser acceptance or hide content to make the test green.

## 8. Windows Local UAT

Product Batch 15 is merged but must be installed through the governed updater with mandatory backup.

After docs closure reaches `main`, perform one Windows Local UAT update and verify at minimum:

```text
成员与权限 -> 更多 -> 停用账户 / 删除账户 fully visible
新增用户 / 编辑 / 重置密码 drawers render normally
Global Search results are not clipped
Dark mode remains correct
Batch 14 Chinese username create/login remains intact
```

Production remains **NOT AUTHORIZED**.

## 9. NEXT

```text
merge docs-only Batch 15 closure
-> one governed Windows Local UAT update
-> real-host visual read-back
-> continue Stage 3.7 only from newly observed real-use feedback
```
