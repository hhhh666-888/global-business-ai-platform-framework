# GBAP CI Governance v0.10 — Bounded NPM Toolchain Admission

Status: **RE-FROZEN / PASS / CLOSED**

Opened: 2026-09-20

Authority trigger: Twenty AI runtime bake-off Candidate B must build with the exact Twenty v2.37.0 App SDK from the same governed offline dependency supply used by normal CI.

This version supersedes only the **bounded non-web npm admission and second-batch bootstrap mechanism**. All v0.8/v0.9 topology, fail-closed network policy, Heavy rules, Formal-UAT boundaries and Production restrictions remain authoritative unless explicitly restated here.

## 1. Problems proven during Candidate B admission

### 1.1 Semantic scope gap

CI Governance v0.9 correctly introduced two-stage dependency admission, but its repository allowlist is explicitly a **future web direct-dependency** source:

`infrastructure/ci/ci-supply-npm-allowlist.tsv`

Twenty Candidate B needs a non-web App build toolchain:

```text
twenty-sdk
twenty-client-sdk
typescript
@types/node
```

Putting those packages into the web list would make the governance record semantically false.

### 1.2 Manifest-v2 second-batch bootstrap deadlock

The first v0.9 migration succeeded because normal CI still had a legacy manifest during that migration.

After manifest v2 became active, normal Fast CI executes:

```text
ensure-ci-supply.sh
-> check repository web allowlist SHA == persistent manifest npm_allowlist_sha256
```

Therefore changing that accepted web allowlist in a later pull request causes normal CI to fail **before the pull request can merge and trigger the main-only supply refresh**.

That means v0.9's original file cannot safely be reused as a generic later-batch proposal surface.

v0.10 fixes that structural bootstrap issue without weakening accepted supply integrity.

## 2. Accepted candidate correction

Keep the accepted v0.9 web admission source unchanged:

```text
infrastructure/ci/ci-supply-npm-allowlist.tsv
-> remains the accepted seven-entry RAGFlow web admission source
-> existing persistent SHA validation remains unchanged
```

Add a separate bounded toolchain proposal/admission source:

```text
infrastructure/ci/ci-supply-npm-toolchain-allowlist.tsv
```

The existing v0.9 web allowlist remains unchanged during Candidate B Stage A.

Both files feed **one persistent npm cache** after exact-main refresh. No second npm cache, registry, package proxy or public mirror is created.

## 3. Stage A state before main refresh

A pull request may add or change the bounded toolchain source, but that source is not yet accepted runtime supply merely because it exists in Git.

Before exact-main refresh:

```text
accepted v0.9 web allowlist SHA       MUST still match persistent manifest
accepted web dependency manifest      MUST still match persistent SHA
toolchain proposal file               MAY exist in the PR
Candidate B package.json              MUST NOT exist
normal CI npm network fallback        DISABLED
```

The transitional `ensure-ci-supply.sh` behavior is fail closed:

```text
persistent manifest has toolchain_allowlist_sha256
-> verify current toolchain file SHA exactly
-> TOOLCHAIN_SUPPLY_ADMISSION=PASS

persistent manifest predates v0.10 and has no toolchain_allowlist_sha256
-> Candidate B package.json absent: Stage A may continue using old accepted supply
-> Candidate B package.json present: FAIL CI_SUPPLY_TOOLCHAIN_NOT_REFRESHED
```

This lets a proposal be reviewed and merged without pretending the new packages are already cached.

## 4. Exact-main refresh and durable admission

After Stage A merges to main, the existing governed workflow:

`.github/workflows/ci-supply-refresh.yml`

runs because the bounded toolchain source and/or supply scripts are in its main-push path filter.

The automatic main path remains:

```text
snapshot-ci-supply.sh --allow-network --npm-only
```

The refresh:

1. preserves accepted Docker/image supply;
2. reads the accepted web allowlist;
3. reads the bounded toolchain allowlist;
4. primes all exact specs into the one persistent npm cache;
5. proves all pre-admitted specs reinstall with `npm --offline`;
6. generates the existing exact-spec admission ledger;
7. records `toolchain_allowlist_sha256` in `npm/manifest.env`;
8. runs normal `ensure-ci-supply.sh` against the refreshed supply.

Only after this runtime evidence exists does the toolchain become consumable by Stage B.

## 5. Existing persistent filenames

For backward compatibility, v0.10 does not rename accepted v0.9 persistent files:

```text
$HOME/.cache/gbap-ci/supply/
  npm/
    manifest.env
    npm-cache.tar.gz
    web-dependencies.manifest.tsv
```

Despite the historical filename, `web-dependencies.manifest.tsv` becomes the exact-spec admission ledger generated from:

```text
current apps/web direct dependencies
+ accepted v0.9 web allowlist
+ bounded v0.10 toolchain allowlist
```

Renaming that persistent file is unnecessary churn and is not part of this reopen.

## 6. Consumer-specific admission

Presence in the refreshed shared cache is necessary but not sufficient authorization for an arbitrary component to consume a package.

Web consumers keep the accepted v0.9 rule:

```text
apps/web/package.json
-> exact kind + package + declared spec must exist in refreshed admission ledger
-> npm install --offline only
```

Twenty Candidate B will use a dedicated Stage B Gate:

```text
toolchain_allowlist_sha256 present and exact
-> materialize governed cache
-> Candidate B exact package.json checked
-> npm install --offline only
-> twenty dev:build
```

No general repository-wide online package install path is created.

## 7. Twenty Candidate B exact toolchain

Pinned provider/runtime baseline:

```text
Twenty v2.37.0
upstream tag twenty/v2.37.0
```

Bounded source:

`infrastructure/ci/ci-supply-npm-toolchain-allowlist.tsv`

Exact specs:

```text
twenty-sdk@2.37.0
twenty-client-sdk@2.37.0
typescript@5.9.3
@types/node@24.7.2
```

Reasons:

- `twenty-sdk@2.37.0` supplies the supported Twenty App SDK and CLI;
- `twenty-client-sdk@2.37.0` matches the pinned Twenty runtime line;
- exact upstream `twenty dev:build` invokes App-local `node_modules/.bin/tsc`;
- Candidate B uses Node globals such as `process`;
- exact versions prevent a floating toolchain from silently diverging from the pinned provider.

## 8. Network and runner boundary

Unchanged:

```text
normal CI npm network fallback          DISABLED
governed automatic network refresh      exact main push only
automatic refresh mode                  --allow-network --npm-only
accepted Docker/image supply            PRESERVED
persistent npm supply                   ONE shared cache
runner                                  GBAP-CI-VM-CANDIDATE
```

A pull request can never run the networked dependency refresh.

## 9. Candidate B Stage A / Stage B

Stage A:

```text
separate bounded toolchain source
+ v0.10 scripts/governance
+ Candidate B source contract
+ Candidate B package.json ABSENT
-> focused Gates + Fast CI
-> merge exact head
-> exact-main dependency-supply refresh
-> offline proof
-> closure evidence / RE-FREEZE v0.10
```

Stage B only after v0.10 closure:

```text
add Candidate B package.json + tsconfig
-> require accepted toolchain SHA in manifest
-> install from accepted cache with npm --offline
-> twenty dev:build
-> no remote sync until isolated Twenty UAT admission is satisfied
```

## 10. Explicit non-goals

This reopen does not authorize:

- modifying the frozen v0.9 authority document;
- weakening the accepted v0.9 web allowlist SHA check;
- public npm access from normal CI;
- arbitrary package installation by other components;
- floating `latest`, caret or wildcard Twenty SDK versions;
- a second npm cache/registry/proxy;
- a custom GBAP Agent runtime;
- a live Twenty -> GBAP employee identity bridge;
- CRM mutation;
- public MCP;
- Production deployment.

## 11. Closure acceptance

CI Governance v0.10 was RE-FROZEN on 2026-09-20 after:

1. existing v0.9 web allowlist remains unchanged;
2. exact Candidate B toolchain rows are statically proven in the separate bounded source;
3. v0.9 supply-admission contract remains PASS;
4. v0.10 bounded-toolchain Gate PASS;
5. Fast CI PASS;
6. Stage A merges to main;
7. exact-main `GBAP CI Dependency Supply Refresh` PASS;
8. refreshed manifest contains `toolchain_allowlist_sha256`;
9. refresh proves all four exact toolchain specs are satisfiable offline;
10. post-refresh `ensure-ci-supply.sh` reports toolchain admission PASS with network fallback disabled;
11. closure evidence records exact implementation SHA and workflow/run evidence.

Closure evidence:

`docs/evidence/GBAP_CI_V0_10_CLOSURE_2026-09-20.md`

Accepted implementation:

`bde71de038207b434e72791a1b74768450fb9833`

Exact-main supply refresh:

`GBAP CI Dependency Supply Refresh #3 / run 35486539470 / PASS`

Final state:

```text
CI Governance v0.10 = RE-FROZEN / PASS / CLOSED
Candidate B SDK/build supply = ADMITTED
Candidate B package consumption = ELIGIBLE FOR STAGE B
Normal CI network fallback = DISABLED
Production = NOT AUTHORIZED
```

## 12. Authority chain

Base topology/security authority remains:

- `docs/architecture/GBAP_CI_GOVERNANCE_v0.8.md`

Accepted web two-stage mechanism remains frozen:

- `docs/architecture/GBAP_CI_GOVERNANCE_v0.9.md`

v0.10 adds only the bounded non-web proposal/admission path and fixes the manifest-v2 later-batch bootstrap deadlock.
