# GBAP Stage 3.4｜Twenty Real Account Wiring Slice｜REVERSE AUDIT v0.1

Status: **PASS / REVERSE AUDIT COMPLETE**

Accepted implementation HEAD: `abb2666a3b7e696d3f4542b431ac873462ac615b`

Scope: first real CRM UI wiring slice for **Companies / Account list + create**.

## Reverse-audit objective

Attempt to disprove that the accepted Companies surface is a real GBAP-owned CRM workflow rather than a vendor-coupled or prototype-only path.

The audit specifically attacks:

1. browser bypass of the GBAP API;
2. vendor-specific Twenty coupling in employee UI code;
3. fake/static Companies data being presented as real;
4. Account create bypassing the canonical contract;
5. GBAP durable-ID loss at provider boundaries;
6. authenticated-role UI privilege leakage;
7. regression of the accepted CRM shell;
8. real Twenty integration failure, outage collapse or uninstall lock-in;
9. overclaiming other CRM surfaces as real.

## Evidence set

### Final CI

`Stage 3.4 Twenty Account UI Wiring`

- Run: `33447589746`
- Result: **SUCCESS**
- HEAD: `abb2666a3b7e696d3f4542b431ac873462ac615b`

Jobs:

- `React CRM / canonical Account boundary` — **SUCCESS**
- `Real Twenty / canonical Account list+create proof` — **SUCCESS**

`Stage 3.4 Twenty UI Reuse Spike`

- Run: `33447589760`
- Result: **SUCCESS**
- Same implementation HEAD.

### Browser artifact

- ID: `9778642206`
- Name: `twenty-account-ui-browser-evidence`
- Digest: `sha256:aadbdcc4205428bc89602cb766916ff3e94fb425ecb44eaee09502bf537c6b77`

Final screenshot inspected:

`companies-real-wiring.png`

### Real-engine artifact

- ID: `9778741534`
- Name: `twenty-account-real-engine-evidence`
- Digest: `sha256:2c9532909eeb576778b491cd64918d9760e72f35bff21d10cc1d6e8f5b2a76dc`

Key evidence:

- `twenty-account-ui.log`
- `runtime-summary.json`
- `twenty-custom-object-schema.json`
- `twenty-api-snapshot.json`

`runtime-summary.json` reports:

- `status = PASS`
- `assertions = 34`
- replacement evidence = `E1_EXPORT_PROVEN`

## Attack 1 — Can the browser bypass GBAP and call Twenty directly?

**Result: NOT PROVEN / ATTACK FAILED**

The frontend workflow explicitly validates presence of:

- `crm.v1.account.list`
- `crm.v1.account.create`

and rejects browser source patterns for direct Twenty coupling including:

- Twenty port `:3000`
- `/rest/companies`
- `twenty-server`

The browser acceptance test mocks the GBAP API boundary, not a Twenty endpoint, and observes no forbidden direct provider request.

Conclusion: employee browser remains behind the GBAP API/capability boundary.

## Attack 2 — Is Companies still seed/static prototype data?

**Result: ATTACK FAILED**

The Companies surface is now session-aware and invokes canonical Account list/create helpers. The previous static company seed list is no longer the data source for this page.

Browser evidence displays authenticated API state, mapped GBAP IDs and the created company result.

Conclusion: Companies is the first real provider-backed CRM surface.

## Attack 3 — Can Account create bypass the canonical GBAP contract?

**Result: ATTACK FAILED**

Create flows through:

```text
Browser
 -> GBAP API
 -> crm.v1.account.create
 -> capability binding/provider resolution
 -> Twenty adapter
 -> Twenty Company
```

Real-engine conformance evidence:

- `[canonical-crm][PASS 01] Twenty canonical Account create + automatic durable mapping`
- `[PASS 18] Company created through GBAP -> adapter -> Twenty`

Conclusion: Account create remains canonical and provider-neutral at the GBAP boundary.

## Attack 4 — Are GBAP durable IDs lost or replaced by Twenty IDs?

**Result: ATTACK FAILED**

Real-engine evidence:

- `[canonical-crm][PASS 07] Twenty canonical lists reverse-resolve provider IDs to GBAP IDs`
- `[canonical-crm][PASS 09] Twenty canonical create path persisted all three mappings`
- `[PASS 22] Four GBAP canonical IDs mapped to Twenty external IDs`

Browser screenshot also displays GBAP IDs and mapping state.

Conclusion: provider IDs do not replace GBAP durable business identity.

## Attack 5 — Can an authenticated employee use prototype role query state to expose manager/admin UI?

**Initial result: DEFECT FOUND**

Earlier implementation derived UI role from the prototype `?role=` selector even after real authentication, defaulting to `super-admin`. This could visually expose manager/admin-only CRM sections to an authenticated ordinary employee. Backend authorization was not bypassed, but UI permission semantics were incorrect.

### Correction

Authenticated role projection was changed so that:

- `substrate-admin` -> super-admin UI;
- authenticated non-admin -> employee UI;
- prototype query role is ignored once identity is authenticated.

The browser acceptance test was strengthened using `/api/me` roles `['substrate-user']` and now asserts that the employee UI does not show:

- Dashboard / 仪表盘
- Import / Export / 导入导出
- Automation / 自动化
- Settings / 设置

### Final result

**ATTACK FAILED AFTER FIX**

Final browser artifact visually confirms `sales.user` as logged-in employee with employee-only CRM navigation.

Conclusion: this defect is CLOSED and is the primary reverse-audit correction in this slice.

## Attack 6 — Did the fix regress the accepted CRM shell?

**Result: ATTACK FAILED**

The existing UI regression workflow `33447589760` completed **SUCCESS** against the final accepted implementation HEAD.

Conclusion: Account wiring and role correction did not invalidate the accepted CRM shell.

## Attack 7 — Does the real Twenty path still work under failure/recovery and replacement pressure?

**Result: ATTACK FAILED**

Final real-engine run preserved the complete Stage 3.4.1 PoU:

- canonical CRM conformance: `14/14 PASS`;
- real-engine PoU: `34/34 PASS`;
- provider health detection PASS;
- Twenty outage isolated to CRM capability PASS;
- recovery and data continuity PASS;
- durable mapping blocks accidental uninstall PASS;
- governed mapping release PASS;
- provider unregister PASS;
- GBAP survives complete Twenty removal PASS.

Conclusion: the first real UI slice does not weaken the existing replaceability/failure-isolation substrate.

## Attack 8 — Are we overclaiming the rest of CRM as real?

**Result: ATTACK FAILED**

Only **Companies / Account list+create** is accepted as real by this slice.

The following remain prototype or not yet separately wired:

- Contact / People
- Opportunity
- Tasks
- Notes
- Email
- Calendar
- Files
- Dashboards
- Workflows
- Settings

Conclusion: scope claim remains bounded.

## Bounded carries — accepted, not frozen as final architecture

1. Browser-side GBAP UUID generation for Account create remains a bounded first-slice choice. It may later move server-side.
2. Current authenticated UI role projection is intentionally narrow: `substrate-admin` versus employee. This is not the final full production authorization model.
3. `twenty-ui@1.0.0-alpha.0` production license/provenance alignment remains unresolved from the UI reuse spike.
4. No E2/E3 claim is made.
5. No production-deployment claim is made beyond the tested substrate/PoU scope.

None of these carries blocks closure of the Account list/create slice.

## Final reverse-audit decision

**PASS / NO BLOCKING DEFECT REMAINS**

Accepted code-bearing implementation HEAD:

`abb2666a3b7e696d3f4542b431ac873462ac615b`

The only material defect discovered during reverse audit — authenticated employee UI privilege leakage through prototype role state — was fixed, retested and visually read back at the final HEAD.

## Merge gate

Before merging PR #20:

1. compare accepted implementation HEAD `abb2666a...` to the final branch head;
2. prove all post-acceptance changes are governance documentation only;
3. do not repeat heavy real-engine CI solely for those docs-only closure commits;
4. merge PR #20 with expected final branch HEAD;
5. compare merge SHA to `main` and require `identical` remote read-back.

## Next legal action after merge

Select the next real CRM capability slice without inventing a new formal numeric stage. The leading dependency-ordered candidate is **Contact / People real wiring**.
