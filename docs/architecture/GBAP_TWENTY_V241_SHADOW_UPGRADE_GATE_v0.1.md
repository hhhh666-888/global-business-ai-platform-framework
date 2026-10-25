# GBAP GBAP｜Twenty v2.41 Isolated Shadow Upgrade Gate v0.1

Status: **PASS / CLOSED / GATE D OPEN FOR GOVERNED COMPANY UAT CUTOVER**

Date: 2026-09-20

## 1. Entry authority

Gate C opens only after:

```text
Gate A  Twenty v2.41 source/runtime admission      PASS / CLOSED
Gate B  Twenty v2.41 SDK offline supply            PASS / CLOSED
Gate B2 Candidate B v2.41 offline rebuild          PASS / CLOSED
PR #279 merge                                      0691d5c748c6f081f291e33dd67539a3f5d29c8e
```

B2 closure evidence:

`docs/evidence/GBAP_TWENTY_AI_CANDIDATE_B_V241_REBUILD_EVIDENCE_2026-09-20.md`

## 2. Purpose

Prove a real direct Twenty v2.37.0 -> v2.41.0 migration using a governed backup clone while leaving the formal company Local UAT Compose project and its named volumes untouched.

The shadow environment must use:

```text
Compose project       gbap-twenty-v241-shadow
source data           governed v2.37 company-UAT backup
Twenty runtime        patched GBAP Twenty v2.41.0 candidate
database              isolated PostgreSQL volume
Redis                 isolated runtime volume
Twenty local storage  isolated volume restored from backup
GBAP SQLite            isolated volume restored from backup
Keycloak data          isolated volume restored from backup
host ports             non-production/non-UAT shadow ports
```

The ordinary `gbap-local-uat` project remains an observation-only comparison target during this Gate.

## 3. Isolation invariants

The Gate must fail closed unless all of these remain true:

1. Compose project name is not `gbap-local-uat`.
2. Shadow host ports do not equal the formal UAT ports.
3. Docker named volumes are created under the shadow project namespace.
4. No `docker volume rm`, `docker system prune --volumes`, or destructive command targets formal UAT volumes.
5. Source backup integrity is verified from `manifest.json` before restore.
6. The matching protected Local-UAT secret set is reused read-only; secrets are not copied into Git or evidence.
7. Company UAT image/config/data is not switched to v2.41 during Gate C.

## 4. Migration sequence

```text
governed v2.37 backup
-> validate manifest + SHA-256
-> create isolated shadow project/volumes
-> restore Twenty PostgreSQL dump
-> restore Twenty local storage
-> restore GBAP substrate SQLite
-> restore Keycloak mutable state
-> build patched Twenty v2.41 image
-> start Twenty v2.41 shadow
-> automatic instance/workspace migrations
-> yarn command:prod upgrade:status
-> start affected GBAP services
-> run shared Local-UAT verification against shadow URLs/project
-> restart shadow Twenty/app services
-> rerun persistence + affected regression
```

## 5. Required evidence

Gate C cannot close without all of:

```text
backup integrity                              PASS
shadow project isolation                      PASS
patched Twenty v2.41 build                    PASS
Twenty health after migration                 PASS
upgrade:status command                        exit 0
instance migration state                      up to date
all workspace migration state                 up to date
failed migration/upgrade command              0
Twenty REST / metadata / API-key paths         PASS
canonical CRM adapter                         PASS
Mail status/read path                         PASS
Calendar status/read path                     PASS
three-user Twenty principal mapping            PASS
per-user OAuth transient isolation             PASS
Keycloak admin/user boundary                   PASS
restart persistence                            PASS
Twenty local-storage writability               PASS
formal company UAT mutation                    NONE
```

If the exact text emitted by Twenty `upgrade:status` differs from prior assumptions, preserve the raw bounded output and update only the parser/contract after evidence; do not weaken the migration requirement.

## 6. Runtime tooling

Primary entrypoint:

`infrastructure/local-uat/Invoke-GBAP-TwentyV241ShadowUpgrade.ps1`

Compose override:

`infrastructure/local-uat/docker-compose.twenty-v241-shadow.yml`

The existing `Test-GBAP-UAT.ps1` is reused with explicit shadow URL / Compose-project parameters instead of duplicating CRM, identity, Mail and Calendar acceptance logic.

If a preserved shadow has already proven backup restore + v2.41 migration but the Gate runner stops later because of a bounded validation/parser defect, `-ResumeAfterMigration` may be used only with recorded evidence for that exact shadow project. Resume must re-run strict `upgrade:status` verification and then continue the remaining Gate; it must not silently reinterpret a failed migration as resumable.

## 7. Non-claims

Gate C does not authorize:

- changing the formal company UAT Compose image/tag;
- running Candidate B `twenty apply`;
- deleting the source backup;
- selecting Twenty as PRIMARY AI runtime;
- exposing MCP;
- Production.

## 8. Exit

Gate C is **PASS / CLOSED** on 2026-09-20.

Closure evidence:

`docs/evidence/GBAP_TWENTY_V241_SHADOW_UPGRADE_GATE_C_CLOSURE_2026-09-20.md`

The accepted terminal result is:

```text
TWENTY_V241_SHADOW_UPGRADE=PASS
FORMAL_UAT_MUTATION=false
```

Gate D is now open for a **governed company Windows UAT v2.41 cutover only**. Candidate B live apply remains Gate E and Production remains unauthorized.
