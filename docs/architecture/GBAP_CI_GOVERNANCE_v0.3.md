# GBAP CI Governance v0.3

Status: PASS / AUTO-READY / FROZEN (Fast + Control + CRM + Local UAT + All)
Authority: Stage 3.4 engineering governance
Supersedes: `GBAP_CI_GOVERNANCE_v0.2.md` for current execution authority
Frozen: 2026-09-03

## Governance change record

This version is an explicit REOPEN -> Evidence -> Impact / Decision -> Re-test -> RE-FREEZE update of v0.2.

No historical v0.1 or v0.2 fact is silently rewritten.

## Current execution authority

```text
Fast PR CI                 AUTO-READY
Command Bridge             AUTO-READY
Inline result reporting    AUTO-READY
control                    AUTHORIZED
crm                        AUTHORIZED
local-uat                  AUTHORIZED
all                        AUTHORIZED
```

Authorized repository-owner PR commands are:

```text
/gbap-final control
/gbap-final crm
/gbap-final local-uat
/gbap-final all
```

## Combined All Final Gate evidence

Fresh test-only PR #59 was created from current `main` after `local-uat` had been re-frozen as AUTHORIZED in v0.2.

Evidence chain:

- PR #59 head: `1c5d09ff406ed1eb4235ef26e8577e1184d3ecf0`
- Fast CI run `33697756897`: PASS
- Repository-owner command `/gbap-final all`: automatically accepted by Command Bridge
- Final Gate run `33697921461`: PASS
- Inline result reporter wrote `GBAP Final Gate result: PASS` to PR #59
- PR #59 was closed without merge after proof

Run `33697921461` proved the full combined path:

```text
Set up job                                      PASS
Check out exact source                          PASS
Verify self-hosted toolchain                    PASS
Static final preflight                          PASS
Build product web                               PASS
Run real Twenty CRM proof                       PASS
Prepare isolated Local UAT CI runtime           PASS
Clean interrupted CI-only UAT state             PASS
Boot one isolated real UAT environment          PASS
Verify UAT health and identity lifecycle        PASS
Prove restart persistence                       PASS
Prove governed backup and restore rollback      PASS
Remove CI-only UAT volumes                      PASS
Report Final Gate result to PR                  PASS
Complete job                                    PASS
```

Failure diagnostics were correctly skipped because the combined gate passed.

## Isolation boundary retained

The combined gate does not relax the Local UAT isolation boundary:

```text
Runner / distro     GBAP-CI-01 / GBAP-CI
Docker daemon       independent WSL2 Docker Engine
CRM Compose project gbap-ci
Local UAT project   gbap-ci-local-uat
CRM host ports      18080 / 18081 / 18082 / 13000
Local UAT host      28080 / 28081 / 28082 / 23000 / 23030
```

Formal Windows UAT remains outside the CI filesystem and Docker boundary. CI must not stop, mutate, or reuse formal UAT Docker Desktop state, volumes, `.env`, runtime, or company user data.

## Gate decision

### ALL FINAL GATE

```text
RESULT        PASS
STATUS        AUTHORIZED
WEB BUILD     PASS
REAL CRM      PASS
LOCAL UAT     PASS
IDENTITY      PASS
PERSISTENCE   PASS
BACKUP/DR     PASS
CLEANUP       PASS
INLINE RESULT PASS
```

`all` is therefore authorized for governed final integration execution when the change genuinely requires the full combined proof. It must not become the default per-commit path.

## Frozen rules retained

- Zero GitHub-hosted-minute normal CI remains mandatory.
- CODE FIRST -> LOCAL / STATIC VERIFY -> BATCH FIX -> SELF-HOSTED FAST CI -> AFFECTED FINAL GATE -> MERGE -> ONE SERVER DEPLOY remains the normal development path.
- Heavy Final Gates must not fan out on every commit.
- Use the smallest sufficient Final Gate: `control`, `crm`, `local-uat`, or `all` according to affected scope.
- No duplicate equivalent Final Gate command while one is active.
- Test-only proof PRs are closed without merge.
- Formal company UAT must remain untouched by CI execution.
- GBAP-CI must not connect to the formal Windows Docker Desktop daemon.
- Frappe remains retired.
- Health is not self-healing; alert schema is not notification delivery.
- This CI governance state does not authorize Production Go-Live and does not mean the whole GBAP platform is complete.

## Current CI governance closure

```text
ZERO HOSTED MINUTES         PASS
FAST PR CI                  AUTO-READY
COMMAND BRIDGE              AUTO-READY
INLINE RESULT REPORTING     AUTO-READY
CONTROL FINAL GATE          AUTHORIZED
CRM FINAL GATE              AUTHORIZED
LOCAL-UAT FINAL GATE        AUTHORIZED
ALL FINAL GATE              AUTHORIZED
FORMAL UAT ISOLATION        PASS
WINDOWS / WSL / DOCKER / RUNNER AUTO-RECOVERY  PASS
```

CI control-plane and currently defined Final Gate execution paths are now fully authorized under Stage 3.4 governance.

Any future change to these frozen CI control-plane rules requires explicit governance change, evidence, re-test, and re-freeze.
