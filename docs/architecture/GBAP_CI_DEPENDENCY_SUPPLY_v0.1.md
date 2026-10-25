# GBAP CI Dependency Supply v0.1

Status: STAGE-A IMPLEMENTATION

## Goal

Normal self-hosted CI must not depend on whether the Windows desktop proxy is running.

Target behavior:

```text
proxy OFF -> normal Fast CI / Final Gate remains usable
proxy ON  -> normal Fast CI / Final Gate behaves the same
```

The Windows formal UAT, Docker Desktop, company LAN DNS, and formal project files remain outside this mechanism.

## Boundary

The persistent supply lives inside the isolated `GBAP-CI` WSL environment under:

```text
$HOME/.cache/gbap-ci/supply
```

It is not stored under `E:\GlobalBusinessAIPlatform`, does not use Windows Docker Desktop, and contains no GBAP application secrets.

## Supply contents

Stage A snapshots:

- required third-party Docker images listed in `infrastructure/ci/ci-supply-images.txt`;
- exact local image IDs and available RepoDigests;
- SHA-256 protected `docker save` archives;
- the self-hosted runner npm cache;
- the SHA-256 of `apps/web/package.json` that the npm supply was built for.

## Network policy

Normal CI is intended to become fail-closed/offline-only in Stage B.

A missing or stale dependency must produce a clear cache-miss result rather than silently reaching Docker Hub, Quay, npm, or a public mirror.

Only the manual workflow `GBAP CI Dependency Supply Refresh` may intentionally refresh the supply. Its `allow_network_refresh` input is a fixed boolean; it does not provide a shell or arbitrary remote command channel.

No untrusted public registry mirror is introduced.

## Refresh lifecycle

```text
Dependency/version change
-> run governed Supply Refresh while network is available
-> snapshot exact local supply
-> verify offline npm build
-> Stage-B normal CI consumes only validated local supply
```

If `apps/web/package.json` changes, normal CI must be blocked until the npm supply is refreshed.

## Stage B

Stage B will wire `ensure-ci-supply.sh` into Fast CI and Final Gate, switch host-side web installs to `npm --offline`, then prove `/gbap-final all` with the desktop proxy OFF.

Until that proof passes, `PROXY-INDEPENDENT CI` must not be declared PASS.
