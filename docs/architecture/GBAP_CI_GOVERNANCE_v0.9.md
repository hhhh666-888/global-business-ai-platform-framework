# GBAP CI Governance v0.9 — NPM Supply Admission

Status: **RE-FROZEN / PASS / CLOSED**

Authority trigger: Enterprise Knowledge RAGFlow reuse requires new browser preview dependencies while normal GBAP CI is deliberately offline and the persistent supply is tied to previously accepted inputs.

Supersedes only the **npm dependency-admission mechanism** in v0.8. All other v0.8 topology/security/Heavy rules remain authoritative unless explicitly restated here.

Opened: 2026-09-19

## 1. Problem

Under v0.8, normal CI restores a sealed npm cache and validates the current `apps/web/package.json` SHA against the supply manifest.

That is safe but creates a bootstrap deadlock for an intentionally new direct dependency:

```text
new dependency must be in package.json
-> PR CI sees package.json SHA mismatch
-> PR CI correctly refuses stale supply

but

supply refresh is governed from main
-> new dependency cannot enter the main package.json before PR acceptance
```

The solution must not weaken the rule that ordinary CI has **no npm network fallback**.

## 2. Accepted target model

Use a two-stage dependency-admission flow:

```text
STAGE A — ADVANCE ADMISSION
PR adds exact declared dependency specs to:
  infrastructure/ci/ci-supply-npm-allowlist.tsv

PR proves:
  scripts parse
  legacy supply remains compatible during migration
  ordinary ensure path remains offline
  only main can trigger governed network refresh

merge Stage A to main
-> GBAP CI Dependency Supply Refresh runs on exact main
-> automatic refresh uses --npm-only
-> accepted image archives/IDs/digests remain untouched
-> network allowed only for npm inside that governed refresh path
-> cache captures current dependencies + advance-admitted dependencies
-> manifest v2 is generated

STAGE B — CONSUMPTION
later feature PR adds only dependency specs already present in
the refreshed v2 direct-dependency admission manifest

normal PR CI:
  validates each direct dependency spec against the admitted manifest
  installs with npm --offline only
  fails closed if a package/spec is not admitted or not actually cached
```

## 3. Supply v2 files

Repository authority:

`infrastructure/ci/ci-supply-npm-allowlist.tsv`

Persistent runner supply:

```text
$HOME/.cache/gbap-ci/supply/
  npm/
    manifest.env
    npm-cache.tar.gz
    web-dependencies.manifest.tsv
```

`web-dependencies.manifest.tsv` is generated only by the governed refresh. It contains:

- all direct `dependencies` from the current accepted `apps/web/package.json`;
- all direct `devDependencies` from the current accepted package;
- all advance-admitted future specs from the repository allowlist.

A later PR may consume only an exact `kind + package + declared-version-spec` row already present there.

## 4. Fail-closed rules

Normal CI MUST:

- remain network-free for npm;
- validate the persistent npm archive SHA;
- validate the repository advance-admission list SHA against the refreshed manifest;
- validate the generated direct-dependency admission manifest SHA;
- reject an unadmitted direct dependency/spec before npm install;
- use `npm install --offline`;
- fail if the supposedly admitted dependency was not actually captured in the cache;
- never mutate the persistent supply archive.

The v1 exact-package-hash behavior remains temporarily supported only so this migration PR can be tested against the currently installed v1 supply. After a successful main refresh produces manifest v2, normal CI uses v2 dependency admission.

## 5. Governed network boundary

Network access is permitted only in:

`.github/workflows/ci-supply-refresh.yml`

and only when one of these is true:

1. an exact `main` push changes the governed npm supply admission/scripts and therefore triggers the refresh after merge; or
2. an operator explicitly dispatches the existing workflow with `allow_network_refresh=true`.

A pull request event can never invoke the refresh workflow.

The automatic main-push path MUST call `snapshot-ci-supply.sh --allow-network --npm-only`. It must not pull or rewrite the accepted image supply merely because npm admission changed. A manually dispatched full refresh remains a separate explicit operation.

The refresh job must run on:

`GBAP-CI-VM-CANDIDATE`

through the accepted `gbap-ci` service label.

## 6. First advance-admitted package set

Source baseline:

- RAGFlow v0.27.2
- pinned commit `a024bea0cd93f39e6652a42bf84dd20c55bc560b`

Advance admitted:

```text
@extend-ai/react-docx   ^0.6.7
@js-preview/excel      ^1.7.14
pptx-preview           ^1.0.5
react-pdf-highlighter  ^6.1.0
react-markdown         ^9.0.1
jszip                  ^3.10.1
xlsx                   ^0.18.5
```

Admission means **eligible for a later PR**, not already part of the GBAP browser bundle.

## 7. Unchanged v0.8 authority

Unchanged:

- `GBAP-CI-VM-CANDIDATE` is PRIMARY / ONLY ACTIVE self-hosted runner;
- retired workstation WSL CI remains retired;
- normal CI cannot use public npm/Docker registry fallback;
- PASS evidence reuse / failed-scope rerun / no duplicate Heavy remains;
- Knowledge heavyweight benchmark/runtime gates remain manual-only;
- formal Windows UAT stays outside CI;
- Production remains NOT AUTHORIZED.

## 8. Acceptance before RE-FREEZE

v0.9 may be RE-FROZEN only after:

1. supply-admission static/contract Gate PASS;
2. Fast CI PASS;
3. VM-only topology/capacity proof PASS when routed;
4. implementation merged to current main;
5. main-triggered governed supply refresh PASS;
6. refresh reports manifest v2;
7. post-refresh `ensure-ci-supply.sh` succeeds with network fallback disabled;
8. evidence records the accepted implementation SHA and refresh run.

All eight acceptance items are now complete.

## 9. Closure evidence

Implementation PR:

- PR #247
- accepted exact head: `91842db6914b2dfb9e4efa0729529d5c7b873d5d`
- merged main: `b363d57acc231b0079410c3c2b95e60ef06971a4`

Exact-head PR evidence:

```text
GBAP VM-Only Runner Capacity Proof      PASS
CI NPM Supply Admission v0.9            PASS
GBAP PR Fast CI                         PASS
Heavy Final                             NOT RUN / NOT REQUIRED
```

Exact-main runtime refresh:

- workflow: `GBAP CI Dependency Supply Refresh`
- run: `35436654432`
- event: `push`
- result: `PASS`

Runtime witness:

```text
GBAP_CI_SUPPLY_SNAPSHOT=PASS
GBAP_CI_SUPPLY_MANIFEST_VERSION=2
GBAP_CI_SUPPLY_NETWORK_REFRESH=true
GBAP_CI_SUPPLY_NPM_ONLY=true
GBAP_CI_SUPPLY_PREAPPROVED_NPM=7
GBAP_CI_WEB_DIRECT_DEPENDENCY_ADMISSION=PASS
GBAP_CI_SUPPLY_ENSURE=PASS
GBAP_CI_SUPPLY_NETWORK_FALLBACK=DISABLED
```

The automatic refresh changed npm supply only; accepted image supply remained outside the refresh path.

Detailed evidence: `docs/evidence/GBAP_CI_NPM_SUPPLY_V0_9_CLOSURE_2026-09-19.md`.

## 10. Closure state

```text
two-stage dependency admission        PASS
manifest v2                           ACTIVE
ordinary npm CI                       OFFLINE ONLY
automatic network refresh             MAIN PUSH / NPM ONLY
accepted image supply                 PRESERVED
RAGFlow preview dependencies          7 ADVANCE-ADMITTED
CI Governance v0.9                    RE-FROZEN / PASS / CLOSED
Production                            NOT AUTHORIZED
```
