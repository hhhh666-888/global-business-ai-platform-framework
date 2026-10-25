# GBAP CI Governance v0.5

Status: RE-FROZEN / PASS
Authority: Stage 3.4 engineering governance
Supersedes: `GBAP_CI_GOVERNANCE_v0.4.md` for current CI dependency-supply authority
Original freeze: 2026-09-03
Reopened: 2026-09-04
Re-frozen: 2026-09-04

## 2026-09-04 reliability REOPEN / RE-FREEZE closure

The v0.5 dependency-supply closure remains valid. Docker/image/npm supply is governed locally and remains independent of the Windows desktop proxy.

The 2026-09-04 REOPEN was narrower: the self-hosted runner's GitHub Actions control plane and WSL host lifecycle were not explicitly governed by v0.5. The incident sequence proved that dependency-plane independence does not by itself guarantee runner availability, session continuity, or result-upload reliability.

Observed evidence:

- repeated `api.github.com` DNS resolution stalls reaching about 300 seconds in earlier Command Bridge / Final Gate attempts;
- Final Gate execution steps completed while `Complete job` remained `in_progress` for an extended period;
- GitHub job-log retrieval returned `BlobNotFound` while the runner result/log finalization path was incomplete;
- a new queued Fast CI showed no assigned runner while an older Final Gate was still bound to `GBAP-CI-01` / runner id 21;
- repeated service restarts while the old session was still present produced `A session for this runner already exists` / `Conflict`;
- after a governed stop / wait / single start, runner 2.337.0 returned `Connected to GitHub` and `Listening for Jobs`;
- the recovered runner successfully executed Fast CI run `33853430754` on runner id 21;
- direct WSL probes on 2026-09-04 resolved and reached `api.github.com`, `github.com`, `broker.actions.githubusercontent.com`, and `results-receiver.actions.githubusercontent.com` in three consecutive rounds, showing that the network fault was intermittent rather than a permanent DNS configuration failure;
- runner journal showed the decisive host-lifecycle sequence: `Listening for Jobs` at 17:04:17, followed by systemd stopping the GitHub runner at 17:05:14 with no preceding runner error;
- invoking WSL again at 17:19 restarted the distro, runner returned to `Listening for Jobs` at 17:19:48, and accepted the queued Fast CI at 17:19:56;
- Fast CI run `33857224458`, attempt 1, logged `The runner has received a shutdown signal` during checkout and was cancelled while the WSL lifecycle defect was still present;
- Windows Scheduled Task `GBAP-CI-WSL-KeepAlive` was installed to hold `wsl.exe -d GBAP-CI -u root -- /bin/sleep infinity` open;
- after more than two idle minutes, both the keepalive task and `GBAP-CI` remained `Running`;
- Fast CI run `33857224458`, attempt 2, job `100978604199`, ran on runner id 21 and completed PASS with all 14 steps successful, including the GitHub control-plane health check and `Complete job`;
- repository script `infrastructure/ci/Install-GBAP-CI-KeepAlive.ps1` codifies the Windows task with the correct Windows user principal and validates task/process identity;
- PR #74 repair was merged to `main` as `de796b770f67094909fbfd490c9a0a9e79ebb78b` after exact-head Fast CI PASS;
- post-merge proof PR #75 head `58531752146ce4aef2cc3b611eb03c699078efee` changed only `tests/ci/postmerge-control-plane-proof.txt` and no protected Final Gate files;
- PR #75 Fast CI run `33860075319`, job `100982252570`, completed PASS with all 14 steps successful;
- exactly one owner `/gbap-final all` command was issued, comment `5538736382`;
- Command Bridge run `33860306070`, job `100982981349`, completed PASS and dispatched the exact PR #75 head without duplicate dispatch;
- dispatch confirmation comment `5538740500` records suite `all`, branch `test/ci-control-plane-postmerge-proof`, head `58531752146ce4aef2cc3b611eb03c699078efee`, runner target `GBAP-CI-01`;
- self-hosted Final Gate run `33860332174`, job `100983066289`, completed PASS with all 20 terminal steps, including control-plane preflight, local dependency supply, static preflight, product Web build, offline compose preparation, real Twenty CRM proof, isolated Local UAT boot, identity lifecycle, restart persistence, governed backup/restore rollback, cleanup, final control-plane handoff, inline result report, and `Complete job`;
- inline Final Gate result comment `5539001164` reported **PASS** for the exact PR #75 head;
- PR #75 was closed without merge after proof, as required.

### Root-cause decision

The incident is classified as three coupled failure modes:

1. **Primary availability defect — WSL host lifecycle:** the `GBAP-CI` WSL2 distro could stop when Windows no longer held an active WSL client. The systemd GitHub runner service was therefore stopped even though the runner itself had not failed.
2. **Intermittent control-plane defect:** earlier runs also experienced transient GitHub Actions DNS/HTTPS/result-upload loss.
3. **Recovery amplifier:** restarting the persistent runner before the old GitHub session/job lease ended created `session already exists` / `Conflict` and extended the outage.

This is CI host/control-plane reliability, not evidence of a CRM product defect. Product code must not be changed merely to recover a runner.

### Repair scope

Implemented and accepted changes are limited to:

- Windows-side keepalive for the dedicated `GBAP-CI` WSL distro;
- repository-owned installer/runbook for that keepalive;
- bounded DNS/HTTPS control-plane probes;
- bounded GitHub checkout/API timeouts;
- safe retries only for idempotent GitHub GET requests;
- no automatic retry of ambiguous Final Gate dispatch/result POSTs;
- pre/post Final Gate control-plane health evidence;
- explicit runner session lifecycle and recovery rules;
- preservation of local runner diagnostics when GitHub log upload is unavailable.

Forbidden scope remains:

- no Windows global DNS changes;
- no dependency on the Windows localhost proxy;
- no connection of GBAP-CI Docker to Windows Docker Desktop;
- no formal Windows UAT mutation;
- no weakening of the protected Final Gate self-authorization guard;
- no automatic runner restart watchdog while a GitHub job may still be active;
- no Production Go-Live authorization.

### Re-freeze acceptance

The complete REOPEN -> repair -> independent proof -> RE-FREEZE sequence is satisfied:

1. repair PR final exact-head Fast CI PASS;
2. protected-file repair merged under explicit REOPEN authority;
3. fresh test-only PR created from the repaired `main` with no protected Final Gate changes;
4. exact-head Fast CI PASS with WSL keepalive active and no manual WSL interaction;
5. exactly one owner `/gbap-final all` command;
6. Command Bridge dispatch PASS without duplicate dispatch;
7. complete self-hosted `all` Final Gate PASS;
8. inline result report PASS and terminal `Complete job` success;
9. proof PR closed without merge;
10. this governance file updated in place to RE-FROZEN.

Host/control-plane reliability is therefore **PASS / RE-FROZEN**.

## Governance change record

This version completed the explicit REOPEN -> Evidence -> Impact / Decision -> Re-test -> RE-FREEZE cycle opened by v0.4, and a second bounded reliability REOPEN on 2026-09-04 for GitHub control-plane and WSL host lifecycle reliability.

The dependency-supply objective remains to make normal self-hosted Fast CI and Final Gate independent of the Windows desktop proxy for Docker/image/npm dependency supply while preserving the GBAP-CI isolation boundary and protected Final Gate governance.

Historical v0.1-v0.4 records remain unchanged as evidence.

## Implemented dependency-supply model

Normal CI uses a governed local dependency supply in the isolated `GBAP-CI` WSL2 environment:

```text
normal Fast CI / Final Gate
-> verify governed local supply
-> restore exact cached Docker images when required
-> npm install --offline only
-> prebuild Web on runner from local npm cache
-> materialize Twenty Adapter dependencies from local npm cache
-> CI-only runtime Dockerfiles package prebuilt outputs
-> third-party Compose images use pull_policy: never
-> no Docker Hub / Quay / npm fallback in normal CI
```

Network access is reserved for an explicit governed dependency-supply refresh, such as first initialization or an intentional dependency/version upgrade. A normal CI cache/supply miss must fail closed rather than silently use the public network.

The Windows desktop proxy is optional for normal CI execution and is not part of the dependency-supply availability chain. GitHub Actions control-plane connectivity and WSL host lifecycle are governed separately by the 2026-09-04 reliability closure above.

## Evidence chain

### Supply foundation

- PR #62 established persistent CI dependency supply Stage A and was merged.
- PR #63 completed the offline npm and CI-only Docker build inputs and was merged.
- `GBAP CI Dependency Supply Refresh` run #1 on `main` passed with network refresh explicitly enabled.

### Protected control-plane transition

- PR #64 implemented Stage B enforcement in Fast CI and the self-hosted Final Gate.
- PR #64 modified protected Final Gate files and therefore was correctly refused self-authorization by Command Bridge.
- `GBAP_CI_GOVERNANCE_v0.4.md` explicitly REOPENED the frozen control plane and authorized only a post-merge independent proof.
- PR #64 latest Fast CI #43, run `33712836547`, passed.
- PR #64 was merged as the candidate control plane at main commit `1dee760e77b83bcbc0a579c5a002935768bb9e89`.

### Proxy-OFF independent proof

Fresh test-only PR #65 was created from the new main and changed no protected Final Gate files.

The Windows desktop proxy remained OFF for the acceptance chain.

Evidence:

- PR #65 head: `54b942aa68a484f89853ab5c14b560797069857b`
- Fast CI #44 / run `33713015381`: PASS
- repository-owner command `/gbap-final all`: comment `5520151188`
- Command Bridge dispatch confirmation: comment `5520153629`
- self-hosted combined Final Gate run `33713589333`: PASS
- inline Final Gate PASS result: comment `5520317260`
- PR #65 closed without merge after proof

The successful `all` proof established that, with the Windows desktop proxy OFF, the governed local dependency supply supported the complete then-current Final Gate path, including product Web build, real Twenty CRM proof, isolated Local UAT execution, identity lifecycle, persistence, governed backup/restore, cleanup, and inline result reporting.

### 2026-09-04 host/control-plane independent proof

Fresh test-only PR #75 was created from repaired main `de796b770f67094909fbfd490c9a0a9e79ebb78b` and changed no protected Final Gate files.

Evidence:

- PR #75 head: `58531752146ce4aef2cc3b611eb03c699078efee`
- Fast CI run `33860075319`, job `100982252570`: PASS
- sole repository-owner `/gbap-final all`: comment `5538736382`
- Command Bridge run `33860306070`, job `100982981349`: PASS
- dispatch confirmation: comment `5538740500`
- self-hosted combined Final Gate run `33860332174`, job `100983066289`: PASS
- inline Final Gate PASS result: comment `5539001164`
- terminal `Complete job`: PASS
- PR #75: CLOSED / UNMERGED

This proof establishes that the repaired runner can remain available through the Windows-side WSL keepalive, accept Fast CI and Command Bridge work without manual WSL activation, execute the full `all` gate, return results inline, and terminate cleanly.

## Isolation boundary retained

This change does not alter the existing CI/formal-UAT separation:

```text
Windows formal UAT
  E:\GlobalBusinessAIPlatform
  Windows Docker Desktop
  formal ports / volumes / data

GBAP-CI
  independent WSL2 distro
  independent Linux Docker Engine
  independent runner workspace
  independent CI-only ports / volumes / networks
  governed local dependency supply
  Windows-side WSL keepalive task
```

Frozen isolation facts retained:

- Windows drive automount remains disabled for GBAP-CI.
- Formal `E:\GlobalBusinessAIPlatform` is not the CI workspace.
- GBAP-CI does not use the formal Windows Docker Desktop daemon.
- CI does not reuse formal UAT ports, named volumes, `.env`, runtime, or company user data.
- No Windows global DNS change is required for normal CI.
- The keepalive task only keeps the dedicated `GBAP-CI` WSL distro alive; it does not deploy or mutate formal UAT.
- Formal Windows UAT was not deployed or mutated by this CI governance work.

## Current execution authority

```text
ZERO HOSTED MINUTES                 PASS / FROZEN
FAST PR CI                          PASS / AUTHORIZED
WSL KEEPALIVE                       PASS / RE-FROZEN
COMMAND BRIDGE                      PASS / RE-FROZEN
CONTROL FINAL GATE                  PASS / RE-FROZEN
CRM FINAL GATE                      PASS / RE-FROZEN
LOCAL-UAT FINAL GATE                PASS / RE-FROZEN
ALL FINAL GATE                      PASS / RE-FROZEN
LOCAL DEPENDENCY SUPPLY             PASS / FROZEN
NORMAL NPM NETWORK FALLBACK         DISABLED
NORMAL THIRD-PARTY IMAGE PULL       DISABLED / FAIL-CLOSED
WINDOWS DESKTOP PROXY REQUIRED      NO
FORMAL UAT ISOLATION                PASS / FROZEN
```

## Operating rules

- Normal PR Fast CI is automatic on the governed pull-request trigger.
- Final Gate is intentionally **not** an automatic per-PR action. At the designated final acceptance point, the repository owner issues exactly one governed `/gbap-final <suite>` command; Command Bridge then validates and dispatches the self-hosted gate automatically.
- Normal CI must consume the governed local dependency supply and must not silently fall back to Docker Hub, Quay, npm, or another public dependency source.
- Missing/stale/corrupt supply is a CI failure and must be repaired through a governed refresh, not by weakening the fail-closed rule.
- Supply refresh may use network access only as an explicit controlled operation.
- The desktop proxy may be ON or OFF; normal CI correctness must not depend on it.
- Keep `GBAP-CI-WSL-KeepAlive` running whenever the self-hosted runner is expected to accept work.
- The keepalive owns WSL host availability only; it must not restart `Runner.Listener` or `Runner.Worker`.
- Do not change Windows global DNS or company LAN behavior to support CI unless separately evidenced and authorized.
- Do not connect GBAP-CI Docker to Windows Docker Desktop.
- Do not weaken the protected Final Gate self-authorization guard.
- Heavy Final Gates remain affected-scope/final-integration tools, not per-commit defaults.
- Never restart or re-register the runner while a GitHub job is still queued, assigned, running, or finalizing.
- A queued job without a runner assignment is not by itself proof that the runner service is broken; first inspect WSL keepalive, runner process state, and any older job lease.
- Final Gate POST operations are bounded but not automatically retried when delivery is ambiguous, preventing duplicate dispatch/result side effects.
- Formal Windows UAT remains outside CI and is updated only through its governed update process.
- This governance work does not authorize Production Go-Live and does not mean the whole GBAP platform is complete.

## Current gate decision

```text
DEPENDENCY SUPPLY             PASS / FROZEN
WSL HOST LIFECYCLE            PASS / RE-FROZEN
CONTROL-PLANE RELIABILITY     PASS / RE-FROZEN
RUNNER SESSION RECOVERY       PASS / GOVERNED
REPAIR PR #74                 MERGED
POST-MERGE PROOF PR #75       PASS / CLOSED / UNMERGED
FAST CI                       PASS
COMMAND BRIDGE                PASS
ALL FINAL GATE                PASS
INLINE RESULT                 PASS
TERMINAL COMPLETE JOB         PASS
FORMAL UAT IMPACT             NONE
```
