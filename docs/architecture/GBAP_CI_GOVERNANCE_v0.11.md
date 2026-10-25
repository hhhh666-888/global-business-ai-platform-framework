# GBAP CI Governance v0.11 — Additive Toolchain Upgrade Admission

Status: **RE-FROZEN / PASS / CLOSED**

Opened: 2026-09-20

Authority trigger: Twenty Candidate B must move from the already-admitted v2.37.0 SDK generation to exact v2.41.0 without breaking normal offline CI or rewriting the frozen v0.10 base allowlist.

## 1. Problem

CI Governance v0.10 solved first-time non-Web toolchain admission, but its accepted base allowlist is now sealed into the persistent manifest by SHA.

Changing that file directly in a pull request would make ordinary CI fail before merge:

```text
PR changes sealed toolchain allowlist
-> persistent manifest still contains old SHA
-> ensure-ci-supply.sh rejects stale supply
-> PR cannot merge
-> main-only network refresh cannot run
```

This is a later-generation bootstrap deadlock.

## 2. Accepted candidate mechanism

Keep the v0.10 base file unchanged:

`infrastructure/ci/ci-supply-npm-toolchain-allowlist.tsv`

Add a separate additive upgrade source:

`infrastructure/ci/ci-supply-npm-toolchain-upgrade-additions.tsv`

Initial exact additions:

```text
twenty-sdk@2.41.0
twenty-client-sdk@2.41.0
```

The existing exact TypeScript and Node types remain reusable from the base toolchain:

```text
typescript@5.9.3
@types/node@24.7.2
```

No accepted v0.10 row is deleted or rewritten.

The persistent exact-spec ledger must therefore support **parallel generations of the same package name**. The identity key for the ledger is exact:

```text
kind + package + declared spec
```

not merely:

```text
kind + package
```

This permits the governed cache to retain both:

```text
twenty-sdk@2.37.0
twenty-sdk@2.41.0
twenty-client-sdk@2.37.0
twenty-client-sdk@2.41.0
```

while every consumer must still declare one exact version. Multi-generation retention is permitted only through the explicit additive-upgrade source; ordinary Web/base allowlist conflicts remain fail-closed.

## 3. Stage A — proposal only

During the pull request:

- old v0.10 supply SHA remains authoritative;
- Candidate B package remains on 2.37.0;
- normal CI stays offline-only;
- the new additions file may exist;
- persistent supply does not yet contain an accepted additions SHA;
- `ensure-ci-supply.sh` reports the additions as pending;
- if Candidate B package tries to consume an exact pending 2.41 addition before refresh, CI fails closed.

Expected transitional evidence:

```text
GBAP_CI_TOOLCHAIN_SUPPLY_ADMISSION=PASS
GBAP_CI_TOOLCHAIN_UPGRADE_SUPPLY_PENDING_REFRESH=1
GBAP_CI_SUPPLY_NETWORK_FALLBACK=DISABLED
```

## 4. Exact-main refresh

### 4.1 First exact-main refresh failure and correction

The first v0.11 main refresh:

```text
GBAP CI Dependency Supply Refresh #4
main 410042bb8a9d4c24a48617d0dd78aae2adeefccd
result FAIL
failed step Snapshot persistent image and npm supply
```

proved a remaining v0.10 assumption in the ledger builder:

```text
Error: conflicting admitted spec for devDependency twenty-sdk:
2.37.0 vs 2.41.0
```

The runner had already fetched/primed the proposed packages into its host npm cache, but the failure occurred before the new exact-spec ledger, persistent npm archive, and manifest were replaced. Therefore the accepted v0.10 persistent supply remained authoritative.

The correction is bounded:

1. preserve ordinary conflict detection for Web/base admission sources;
2. allow parallel versions only from the explicit toolchain-upgrade additions source;
3. key the persistent admission ledger by `kind + package + spec`;
4. prime and offline-verify every admitted exact spec independently so one generation cannot mask another.

This is a failed-scope repair only. No company UAT or Production state is involved.

After Stage A merges to exact main, the existing governed workflow:

`.github/workflows/ci-supply-refresh.yml`

runs because the additions file is in its main-push path filter.

The refresh remains:

```text
main only
+ governed network access
+ npm-only
+ accepted Docker/image supply preserved
```

The refreshed snapshot:

1. parses the accepted Web allowlist;
2. parses the frozen v0.10 base toolchain;
3. parses the v0.11 additive upgrade file;
4. primes all exact specs into the same persistent npm cache;
5. proves the combined supply can reinstall offline;
6. records `toolchain_upgrade_allowlist_sha256`;
7. regenerates the exact-spec admission ledger;
8. runs normal `ensure-ci-supply.sh`.

Expected post-refresh evidence:

```text
GBAP_CI_SUPPLY_SNAPSHOT=PASS
GBAP_CI_SUPPLY_NETWORK_REFRESH=true
GBAP_CI_SUPPLY_NPM_ONLY=true
GBAP_CI_SUPPLY_TOOLCHAIN_UPGRADE_ALLOWLIST_SHA256=<sha>
GBAP_CI_TOOLCHAIN_UPGRADE_SUPPLY_ADMISSION=PASS
GBAP_CI_TOOLCHAIN_UPGRADE_SUPPLY_ADMITTED=true
GBAP_CI_SUPPLY_NETWORK_FALLBACK=DISABLED
```

## 5. Stage B — consumer switch

Only after exact-main refresh PASS may Candidate B change to:

```text
engines.twenty             >=2.40.0 or exact governed server range
twenty-sdk                 2.41.0
twenty-client-sdk          2.41.0
typescript                 5.9.3
@types/node                24.7.2
```

Stage B must install with `npm --offline` from the refreshed shared cache and build with the native Twenty 2.41 CLI/SDK.

No live Twenty UAT sync is authorized by v0.11.

## 6. Security / network invariants

Unchanged:

```text
normal CI network fallback        DISABLED
networked supply refresh          exact main only
persistent npm cache              one shared governed cache
accepted Web allowlist            unchanged
v0.10 base toolchain              unchanged
floating latest/caret SDK specs   forbidden
Production                        NOT AUTHORIZED
```

## 7. Closure criteria

v0.11 may RE-FREEZE only after:

1. Stage A exact-head PR Gates PASS;
2. Stage A merges to main;
3. automatic main supply refresh PASS;
4. refreshed manifest records the additions SHA;
5. exact 2.41 SDK specs reinstall offline;
6. `ensure-ci-supply.sh` reports base + upgrade admission PASS;
7. network fallback remains disabled;
8. closure evidence is recorded.

Only after that may the Candidate B v2.41 rebuild PR consume the new generation.

## 8. Non-goals

This Gate does not:

- upgrade company Windows UAT;
- change the Twenty server runtime;
- mutate Candidate B in Twenty;
- authorize `twenty apply`;
- authorize CRM writes;
- select PRIMARY runtime;
- expose MCP;
- authorize Production.


## 9. Closure evidence

Accepted Stage A:

```text
PR #277 exact head          981a09feee9d5477d66a241c9dc76271e9c55221
PR #277 merge               410042bb8a9d4c24a48617d0dd78aae2adeefccd
affected PR Gates           9/9 PASS
```

First exact-main refresh exposed the parallel-generation ledger defect and failed before replacing accepted persistent supply:

```text
Refresh #4                  FAIL
main                        410042bb8a9d4c24a48617d0dd78aae2adeefccd
error                       twenty-sdk 2.37.0 vs 2.41.0 exact-spec collision
```

Bounded repair:

```text
PR #278                     MERGED / PASS
repair head                 a0e73e64355b6f1d07bbf31951ab5a3cc691275a
merge / accepted main       92ae7149dcb2256ee310fe52d12aa8025747f9cc
```

Final governed supply refresh:

```text
GBAP CI Dependency Supply Refresh #5
run id                      35505913676
job id                      106065588478
result                      PASS
network refresh             true / main-only / npm-only
normal CI network fallback  DISABLED
```

Exact offline supply proof included:

```text
twenty-sdk@2.37.0                 PASS offline
twenty-client-sdk@2.37.0          PASS offline
typescript@5.9.3                  PASS offline
@types/node@24.7.2                PASS offline
twenty-sdk@2.41.0                 PASS offline
twenty-client-sdk@2.41.0          PASS offline
```

Manifest/admission proof:

```text
GBAP_CI_SUPPLY_SNAPSHOT=PASS
GBAP_CI_SUPPLY_MANIFEST_VERSION=2
GBAP_CI_SUPPLY_PREAPPROVED_NPM=13
GBAP_CI_SUPPLY_TOOLCHAIN_ALLOWLIST_SHA256=6ed36edf69e9f8a612b6849688af4444bc6e50bcaf383bcb19f6d1e5922cbf2e
GBAP_CI_SUPPLY_TOOLCHAIN_UPGRADE_ALLOWLIST_SHA256=9d74927edc4a0ed52d9e789938cf20ca094388672aacc155c80c6dfd949a292d
GBAP_CI_TOOLCHAIN_SUPPLY_ADMISSION=PASS
GBAP_CI_TOOLCHAIN_UPGRADE_SUPPLY_ADMISSION=PASS
GBAP_CI_SUPPLY_ENSURE=PASS
GBAP_CI_SUPPLY_NETWORK_FALLBACK=DISABLED
```

Closure decision:

```text
CI Governance v0.11              RE-FROZEN / PASS / CLOSED
Twenty v2.41 SDK supply          ADMITTED
parallel v2.37 + v2.41 supply    RETAINED
Candidate B v2.41 rebuild        AUTHORIZED FOR OFFLINE BUILD ONLY
live Twenty sync/apply           NOT AUTHORIZED
company UAT upgrade              NOT AUTHORIZED
Production                       NOT AUTHORIZED
```

Closure evidence file:

`docs/evidence/GBAP_CI_V0_11_CLOSURE_2026-09-20.md`
