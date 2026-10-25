# GBAP CI Governance v0.1

Status: PASS / AUTO-READY / FROZEN (Fast + Control + CRM); LOCAL-UAT / ALL BLOCKED
Authority: Stage 3.4 engineering governance
Frozen: 2026-09-03

## Objective

Provide reliable CI without depending on GitHub-hosted runner minutes while preserving strict final integration evidence and isolating company formal UAT from CI execution.

## Fixed execution model

CODE FIRST -> LOCAL / STATIC VERIFY -> BATCH FIX -> SELF-HOSTED FAST CI -> AFFECTED FINAL GATE -> MERGE -> ONE SERVER DEPLOY

## Runner boundary

All ordinary GBAP CI control and execution uses:

```text
[self-hosted, linux, x64, gbap-ci]
```

Company runner:

```text
GBAP-CI-01
```

The runner lives in the isolated `GBAP-CI` WSL2 distro with its own Docker Engine and runner workspace. It must not use the formal Windows UAT workspace, Docker Desktop daemon, UAT named volumes, production-like `.env`, or company user data.

Required separation:
- dedicated WSL2 distro
- dedicated runner workspace
- dedicated Docker daemon
- dedicated Docker project name (`gbap-ci`)
- CI-only volumes, ports, and environment material
- Windows formal UAT filesystem not automounted into the CI distro

## L1 Fast PR CI

`GBAP PR Fast CI` runs automatically on relevant pull-request changes and uses only `GBAP-CI-01`.

Allowed scope:
- exact PR source checkout
- changed-file detection
- shell LF policy
- Node / shell / Python / PowerShell parse checks
- affected web build
- affected compose render without full boot
- retired Frappe boundary
- heavy-workflow policy guard

Fast checkout uses native Git, Git HTTP/1.1, and bounded retry/backoff so transient GitHub HTTPS/TLS interruptions do not fail CI on the first transport error.

## L2 Affected-domain verification

Only the affected domain should receive expensive validation. Historical Stage 3.3 / Stage 3.4 workflows remain auditable executable evidence but are manual-only and do not automatically fan out on every commit.

## L3 Final Integration Gate

`GBAP Final Gate - Self Hosted` executes on `GBAP-CI-01` and contains these suite interfaces:

```text
control
crm
local-uat
all
```

Current execution authority is narrower than the interface surface:

```text
control   AUTHORIZED
crm       AUTHORIZED
local-uat BLOCKED
all       BLOCKED
```

`control` is a lightweight governance self-test. It validates checkout, toolchain, static preflight, and inline result reporting without repeating CRM or Local UAT heavy execution.

`local-uat` and `all` remain operationally blocked because the self-hosted Local UAT suite has not yet completed independent CI port/runtime isolation from the formal company UAT environment. Their presence as workflow options does not authorize execution. They must not be invoked until an explicit isolation change is implemented, tested, and re-frozen.

Currently authorized ChatGPT-controlled PR commands are:

```text
/gbap-final control
/gbap-final crm
```

The reserved commands below are not authorized yet:

```text
/gbap-final local-uat
/gbap-final all
```

The repository-owner command is handled by `GBAP Final Gate Command Bridge`, which validates that the PR is open, non-draft, same-repository, and does not modify protected Final Gate workflows before dispatching an authorized selected suite.

## Result reporting

Final Gate result reporting is inline and owned by the Final Gate itself:

```text
PR command
-> Command Bridge
-> Final Gate
-> PASS / FAIL result comment written directly back to the originating PR
```

A separate `workflow_run` result-reporter workflow is intentionally not used. This avoids a secondary event dependency that was observed not to create a reliable reporter run for the automated dispatch chain.

## Zero-hosted-minute policy

GitHub-hosted runner minutes are not required for the normal GBAP development path.

```text
Fast CI            -> GBAP-CI-01
Command Bridge      -> GBAP-CI-01
Final Gate          -> GBAP-CI-01
Result write-back   -> Final Gate on GBAP-CI-01
```

GitHub-hosted minutes may remain at zero without blocking the governed CI workflow.

## Windows availability

The Windows host uses `GBAP-CI-Runner-Autostart` to keep the `GBAP-CI` WSL2 distro alive after Windows startup. Inside WSL, systemd starts Docker and the GitHub Actions Runner service.

Cold-start acceptance requires proof of:
- Windows scheduled task executed after reboot
- `GBAP-CI` already `Running` without manual WSL start
- Docker `active`
- runner service `active`
- `Runner.Listener` active
- a new GitHub Job being accepted by `GBAP-CI-01` after reboot

## Concurrency

Fast PR CI uses one concurrency group per PR with `cancel-in-progress: true` so obsolete PR heads are cancelled. Final heavy gates serialize on a single controlled self-hosted concurrency group.

## Frappe retirement

Frappe is retired. CI must not restore `providers/frappe-adapter/server.mjs`, `tests/pou/frappe/prepare-runner.py`, or any Frappe real-engine job. Canonical CRM validation is Twenty-only while retaining provider-neutral contracts.

## Frozen acceptance evidence

The following evidence closed the current governance gate:

- Company Windows cold reboot automatically restored `GBAP-CI` WSL2, Docker, the GitHub Actions runner service, and `Runner.Listener` without manual WSL startup.
- Post-reboot GitHub Job pickup was proven on `GBAP-CI-01`.
- A transient post-reboot Git HTTPS/TLS interruption was diagnosed as transport-only and hardened with native Git HTTP/1.1 plus bounded retry/backoff.
- Self-hosted Fast CI run `33689412847` passed after the transport hardening.
- Self-hosted Fast CI run `33689828766` passed for the inline-result governance implementation.
- Self-hosted Fast CI run `33689939761` passed for the final control proof PR.
- Real CRM Final Gate run `33686754971` passed.
- Real CRM Final Gate run `33687643704` passed through the automatic command path.
- Control Final Gate run `33690002155` passed without repeating CRM or Local UAT.
- The control Final Gate wrote `GBAP Final Gate result: PASS` directly back to PR #49.
- PR #49 was closed without merge after proof, leaving no test-only marker in `main`.

## Gate

CI GOVERNANCE = `PASS / AUTO-READY / FROZEN` for Fast PR CI, Command Bridge, inline result reporting, `control`, and `crm`.

Frozen facts:
- Fast PR CI executes successfully on `GBAP-CI-01`.
- CRM Final Gate executes successfully on `GBAP-CI-01`.
- Repository-owner PR commands automatically dispatch authorized Final Gate suites without manual Actions UI use.
- Command Bridge is green.
- Final Gate writes PASS/FAIL directly back to the originating PR.
- Windows cold reboot automatically restores WSL, Docker, Runner, and post-reboot Job pickup.
- GitHub-hosted runner minutes are not required.
- Formal company UAT remains outside the CI filesystem and Docker boundary.
- `local-uat` and `all` are explicitly BLOCKED until independent CI-local UAT isolation is implemented and proven.

Any future change to these frozen CI control-plane rules requires explicit governance change, evidence, re-test, and re-freeze.
