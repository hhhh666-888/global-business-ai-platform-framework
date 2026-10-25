# GBAP GBAP｜Twenty v2.41 Company Windows UAT Cutover Gate D v0.1

Status: **PASS / CLOSED / GATE E OPEN FOR GOVERNED CANDIDATE B PLAN/APPLY**

Date: 2026-09-20

## 1. Entry authority

Gate D is permitted only because Gate C is PASS/CLOSED:

- `docs/architecture/GBAP_TWENTY_V241_SHADOW_UPGRADE_GATE_v0.1.md`
- `docs/evidence/GBAP_TWENTY_V241_SHADOW_UPGRADE_GATE_C_CLOSURE_2026-09-20.md`

Gate D upgrades the **formal company Windows Local UAT** from Twenty v2.37.0 to the already-admitted patched Twenty v2.41.0 runtime.

It does not install Candidate B and does not select a PRIMARY AI runtime.

## 2. Runtime selection model

The formal `docker-compose.yml` keeps v2.37 defaults:

```text
GBAP_TWENTY_RUNTIME_VERSION   v2.37.0
GBAP_TWENTY_RUNTIME_IMAGE     gbap-twenty-v2.37.0
GBAP_TWENTY_BASE_IMAGE        twentycrm/twenty:v2.37.0
GBAP_TWENTY_DOCKERFILE        Dockerfile.twenty-v2.37.0-gbap
```

Therefore merging Gate D tooling does **not** upgrade the company server.

Only the governed Gate D runner mutates the protected local `.env` to:

```text
GBAP_TWENTY_RUNTIME_VERSION   v2.41.0
GBAP_TWENTY_RUNTIME_IMAGE     gbap-twenty-v2.41.0
GBAP_TWENTY_BASE_IMAGE        twentycrm/twenty:v2.41.0
GBAP_TWENTY_DOCKERFILE        Dockerfile.twenty-v2.41.0-gbap
```

After a successful cutover, ordinary Start/Backup/Restore use the same protected runtime selection and therefore cannot silently fall back to v2.37.

## 3. Primary entrypoint

`infrastructure/local-uat/Invoke-GBAP-TwentyV241CompanyUatCutover.ps1`

Normal execution:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\infrastructure\local-uat\Invoke-GBAP-TwentyV241CompanyUatCutover.ps1
```

A bounded resume after an already-recorded partial v2.41 cutover uses:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\infrastructure\local-uat\Invoke-GBAP-TwentyV241CompanyUatCutover.ps1 `
  -Resume
```

Resume may reuse only the retained Gate D pre-upgrade backup recorded by the runner.

## 4. Cutover sequence

```text
clean exact current main
-> Gate C closure evidence
-> fresh governed full UAT backup with writers quiesced
-> preserve previous runtime selection + rollback record
-> atomically select v2.41 in protected .env
-> validate Compose resolves patched v2.41
-> build v2.41
-> start PostgreSQL/Redis
-> start Twenty v2.41 and automatic migrations
-> strict upgrade:status
-> local-storage writability
-> normal Start-GBAP-UAT path
-> canonical CRM provider provenance reconciliation
-> Mail/Calendar provider reconciliation to v2.41
-> full shared CRM/Mail/Calendar/identity UAT
-> read-only canonical company fingerprint
-> restart application runtime
-> full shared UAT again
-> strict upgrade:status again
-> compare canonical company fingerprint
```

No synthetic customer record is added to the formal company CRM for persistence proof.

## 5. Provider provenance

The existing durable `twenty-crm-uat` provider is not deleted because it owns durable mappings.

`Sync-GBAP-UAT-TwentyProvider.ps1` updates its runtime provenance in place through:

`apps/api/migrate-provider-runtime-provenance.mjs`

Required post-cutover values include:

```text
provider.version                   v2.41.0
provenance.upstreamVersion         v2.41.0
provenance.upstreamImageDigest     actual running image identity
provenance.schemaRevision          twenty-v2.41.0-default
```

The Mail/Calendar Provider Registry is reconciled through its existing bootstrap with `GBAP_TWENTY_RUNTIME_VERSION=v2.41.0`.

## 6. Rollback

Rollback entrypoint:

`infrastructure/local-uat/Rollback-GBAP-TwentyV241CompanyUatCutover.ps1`

Rollback is:

```text
optional current-state safety backup
-> restore previous protected runtime selection
-> governed Restore-GBAP-UAT.ps1 from exact pre-upgrade backup
-> normal startup under prior compatible runtime/config/secrets
-> full restore verification
```

Rollback is **not** an image-tag reversal against a migrated v2.41 database.

## 7. Gate D PASS requirements

```text
fresh full pre-upgrade backup              PASS
backup Git SHA = installed SHA             PASS
formal Compose resolves v2.41              PASS
patched v2.41 build                         PASS
Twenty startup migration                    PASS
upgrade:status instance                     Up to date
upgrade:status workspaces                   all current / 0 behind / 0 failed
local storage writable                      PASS
normal company UAT startup                  PASS
canonical CRM provider provenance           v2.41
Mail/Calendar provider provenance            v2.41
CRM/Mail/Calendar/identity UAT               PASS
restart                                      PASS
post-restart UAT                             PASS
post-restart upgrade:status                  PASS
canonical company read-only fingerprint      unchanged
rollback backup retained                     PASS
Candidate B live apply                       false
Production                                  false
```

## 8. Exit

Gate D is **PASS / CLOSED** on 2026-09-20.

Closure evidence:

`docs/evidence/GBAP_TWENTY_V241_COMPANY_UAT_CUTOVER_GATE_D_CLOSURE_2026-09-20.md`

Accepted terminal result:

```text
TWENTY_V241_COMPANY_UAT_CUTOVER=PASS
TWENTY_RUNTIME_VERSION=v2.41.0
GATE_D=PASS
CANDIDATE_B_LIVE_APPLY_AUTHORIZED=false
PRODUCTION_AUTHORIZED=false
```

The formal company Windows UAT Twenty baseline is now **v2.41.0**.

Gate E is open for Candidate B v2.41 plan/apply under a separate governed write gate. Gate D itself does not authorize Candidate B live apply, PRIMARY runtime selection or Production.

Twenty and RAGFlow remain complementary replaceable runtimes under the GBAP AI Control Plane; Gate D does not make them an either/or choice.
