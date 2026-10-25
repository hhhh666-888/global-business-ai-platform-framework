# GBAP CI Governance v0.2

Status: PASS / AUTO-READY / FROZEN (Fast + Control + CRM + Local UAT); ALL BLOCKED
Authority: Stage 3.4 engineering governance
Supersedes: `GBAP_CI_GOVERNANCE_v0.1.md` for current execution authority
Frozen: 2026-09-03

## Governance change record

This version is an explicit REOPEN -> Evidence -> Impact / Decision -> Re-test -> RE-FREEZE update of the prior frozen CI governance state.

No historical v0.1 fact is silently rewritten.

## Current execution authority

```text
Fast PR CI                 AUTO-READY
Command Bridge             AUTO-READY
Inline result reporting    AUTO-READY
control                    AUTHORIZED
crm                        AUTHORIZED
local-uat                  AUTHORIZED
all                        BLOCKED
```

Authorized PR commands are now:

```text
/gbap-final control
/gbap-final crm
/gbap-final local-uat
```

`/gbap-final all` remains blocked until the combined suite itself is proven green after this re-freeze.

## Local UAT isolation boundary

The self-hosted Local UAT gate is isolated from formal company UAT by:

```text
Runner / distro     GBAP-CI-01 / GBAP-CI
Docker daemon       independent WSL2 Docker Engine
Compose project     gbap-ci-local-uat
Web host port       28080
API host port       28081
Keycloak host port  28082
Twenty host port    23000
Gateway host port   23030
```

The formal Windows UAT workspace, Docker Desktop daemon, formal UAT volumes, formal `.env`, and company user data remain outside the CI execution boundary.

CI-only runtime preparation patches only the ephemeral self-hosted checkout. Formal Local UAT defaults remain unchanged.

## Evidence chain

Implementation and correction chain:

- PR #52 implemented independent self-hosted Local UAT project/port/runtime isolation and merged to `main`.
- PR #53 proved isolation itself but failed before product startup on Docker registry transport.
- PR #54 added bounded CI-only compose startup retry and merged to `main`.
- PR #55 subsequently crossed the registry boundary and exposed a CI-only Web Gateway origin mismatch; it remained test-only and was closed without merge.
- PR #56 aligned the ephemeral CI Web Gateway localhost origin with isolated port `28080`; Fast CI run `33696279345` passed and the fix merged to `main` as `2efffca2346173f63febdb4ae9d5773b9df0ccc6`.
- PR #57 was a fresh test-only proof from that corrected `main`; Fast CI run `33696483246` passed.
- The repository-owner command `/gbap-final local-uat` dispatched automatically to `GBAP-CI-01`.
- Local UAT Final Gate run `33696594264` completed successfully.
- The Final Gate wrote `GBAP Final Gate result: PASS` inline back to PR #57.
- PR #57 was closed without merge after proof.

## Proven Local UAT Final Gate chain

Run `33696594264` proved all required Local UAT stages:

```text
Prepare isolated Local UAT CI runtime          PASS
Clean interrupted CI-only UAT state            PASS
Boot one isolated real UAT environment         PASS
Verify UAT health and identity lifecycle       PASS
Prove restart persistence                      PASS
Prove governed backup and restore rollback     PASS
Remove CI-only UAT volumes                     PASS
Report Final Gate result to PR                 PASS
```

Failure diagnostics were correctly skipped because the gate passed.

## Keycloak lifecycle clarification

`keycloak` is the long-running Keycloak service.

`keycloak-admin-bootstrap` is a one-shot bootstrap helper. Its successful exit after initialization is expected and must not be interpreted as Keycloak being down.

## Network evidence boundary

The earlier Docker registry failures were transport failures outside product code. The successful Local UAT proof confirms that the current GBAP-CI network path could pull/build/start the required runtime for the accepted run.

This does not authorize coupling CI availability to a user's manually operated desktop proxy as a permanent architecture. A durable CI network egress design remains a separate operational hardening item.

## Gate decision

### LOCAL-UAT FINAL GATE

```text
RESULT      PASS
STATUS      AUTHORIZED
ISOLATION   PASS
BOOT        PASS
IDENTITY    PASS
PERSISTENCE PASS
BACKUP/DR   PASS
CLEANUP     PASS
INLINE PASS PASS
```

`local-uat` is therefore authorized for governed affected-domain Final Gate execution.

### ALL FINAL GATE

```text
STATUS BLOCKED
```

Reason: `crm` and `local-uat` are independently authorized, but the `all` orchestration path has not yet been proven as a combined suite. The next legal CI mainline is one fresh test-only PR from current `main`, Fast CI PASS, then exactly one `/gbap-final all` proof. If that full combined run passes, `all` may be re-frozen as AUTHORIZED.

## Frozen rules retained

- Zero GitHub-hosted-minute normal CI remains mandatory.
- Formal company UAT must not be stopped or modified to make CI pass.
- GBAP-CI must not connect to the formal Windows Docker Desktop daemon.
- Heavy Final Gates must not fan out on every commit.
- No duplicate equivalent Final Gate command may be posted while one is active.
- Test-only proof PRs are closed without merge.
- Frappe remains retired.
- Production Go-Live is not authorized by this CI governance state.
