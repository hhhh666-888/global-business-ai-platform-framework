# CI security dependency admission v0.12 — source proposal

Status: **STAGE A MERGED; EXACT-MAIN REFRESH VERIFIED; FEATURE ACCEPTANCE SEPARATE**

Closure evidence: PR #367 merged at `370c38bf18419f637bfe5d624a5645c80d0754f0`;
main supply run `37093737596` passed snapshot and offline reproduction. This
closes admission/refresh, not PR #368's product acceptance or company deployment.

This candidate extends v0.9–v0.11 only for six exact document-preview security
specs. Normal CI remains offline, existing runner/image policy remains authoritative,
and production authorization is unchanged.

Changing the frozen web allowlist or `apps/web/Dockerfile.ci` invalidates the
accepted supply before a PR can merge. This proposal therefore preserves both
byte for byte, as well as the existing base and toolchain additions lists, and
introduces `infrastructure/ci/ci-supply-npm-security-additions.tsv`.

The bounded names are PDF.js, DOMPurify, ECharts, UUID, React Router and React
Router DOM. Every row is a `dependency` with an exact three-part numeric version.
Registry URLs, aliases, ranges and arbitrary packages are rejected during cache
priming and manifest generation. This is a proposal source, not an admission ledger.

## Stage A: proposal only

`codex/security-dependency-admission` changes supply scripts, the additive source,
workflow paths, executable regressions and documentation. It does not change
`apps/web/package.json` or any app code. Old supply has no security-source hash;
normal ensure reports `GBAP_CI_SECURITY_SUPPLY_PENDING_REFRESH=1`, but validates
all actual package specs and overrides against the old authoritative ledger.
Pending direct dependencies or overrides still fail with exit 37. No network
fallback or accepted-hash relaxation is added.

## Main refresh and Stage B

After Stage A merges, the existing main-only workflow performs a governed
`--allow-network --npm-only` refresh. It installs each bounded addition separately,
proves its offline installation, includes the exact spec in the admission ledger,
records `security_additions_sha256` and seals the npm archive. Existing image
archives/IDs remain unchanged.

Later ensure verifies the security-source hash when present and validates every
web direct dependency, development dependency and string override against that
refreshed exact ledger. Nested overrides fail closed. The feature branch
`codex/enterprise-ui-security` becomes eligible only after this refresh passes;
its frozen Dockerfile copies the reader/build helper through the existing `src`
copy, and its web runtime config is embedded in the existing server entry.

The regression executes the actual admission and manifest-builder code with old,
pending, admitted, nested, ranged, aliased and out-of-scope fixtures. It also locks
the accepted base-list/Dockerfile hashes. Cloud offline installation is a separate
development check; no access to the formal persistent runner/cache is claimed.

Review/merge order and company acceptance:
[security dependency admission runbook](../runbooks/GBAP_SECURITY_DEPENDENCY_ADMISSION_2026_10_03.md).
