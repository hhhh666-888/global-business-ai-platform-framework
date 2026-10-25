# GBAP Stage 3.4 continuation｜CRM Local Trial / UAT Deployment v0.1

Status: **IMPLEMENTED / PRE-MERGE VALIDATION PENDING / PRODUCTION GO-LIVE NOT AUTHORIZED**

Authority baseline: `docs/architecture/GBAP_STAGE3_ACTIVE_BASELINE_v1.0.md`

Parent accepted CRM closure: `docs/architecture/GBAP_Stage3_4_Full_CRM_Wiring_Final_Reverse_Audit_Closure_v1.0.md`

This record implements the first legal post-CRM-closure work item: make the already-accepted GBAP CRM downloadable and persistently runnable on one local computer for real UAT, without pretending that local trial equals production go-live.

## 1. Purpose

The local UAT deployment exists so the product owner and employees can actually operate the accepted CRM end to end:

```text
create company
-> create/link contact
-> create opportunity
-> move pipeline/lifecycle
-> create tasks/notes
-> attach files
-> use search/views
-> review dashboard
-> import/export
```

The environment must survive normal stop/restart and later application updates without silently deleting business records.

## 2. Runtime topology

```text
Browser localhost:8080
 -> GBAP React CRM
 -> GBAP API localhost:8081
 -> GBAP OIDC / Keycloak localhost:8082
 -> GBAP capability resolver
 -> twenty-crm-uat adapter
 -> Twenty v2.37.0
 -> persistent PostgreSQL / Redis / local storage
```

Twenty admin UI is bound to localhost:3000 for UAT bootstrap/advanced inspection only. It is not ordinary employee navigation.

## 3. Persistence contract

Normal `Stop-GBAP-UAT.ps1` uses container stop, never volume deletion.

Persistent state includes:

- GBAP substrate/native CRM SQLite state;
- durable business-ID mappings;
- audit and business lifecycle state;
- GBAP-native Files/Saved Views state;
- Twenty PostgreSQL CRM records;
- Twenty local file storage;
- Keycloak UAT realm state.

CI acceptance must prove a business Account created before stop remains reachable after restart of the same UAT environment.

## 4. Local secret posture

First start generates random UAT credentials in gitignored local files:

- `infrastructure/local-uat/.env`;
- `infrastructure/local-uat/.runtime/*`.

They are not production secrets and are not committed.

The adapter receives a dedicated Twenty service API key. Email/Calendar connection metadata uses a separate PostgreSQL role `gbap_adapter_readonly` with CONNECT + schema USAGE + SELECT only on `core."messageChannel"` and `core."calendarChannel"`.

The GBAP browser/API never receives database credentials.

## 5. Roles for trial

Local Keycloak contains three randomized-password UAT accounts derived from the accepted role model:

- employee: `substrate-user`;
- manager: `substrate-manager`;
- super-admin: `substrate-admin`.

Generated passwords are written only to the local gitignored credentials file for the operator.

## 6. Operator workflow

Windows entrypoints:

- `Start-GBAP-UAT.ps1` — initialize/start/reuse persistent UAT;
- `Stop-GBAP-UAT.ps1` — safe stop, data retained;
- `Test-GBAP-UAT.ps1` — non-destructive end-to-end health/RBAC/provider verification;
- `Backup-GBAP-UAT.ps1` — quiesced application backup before meaningful updates;
- `Update-GBAP-UAT.ps1` — backup + fast-forward `main` + rebuild/restart + verification.

The supported update path deliberately does not run `docker compose down -v`.

## 7. Backup boundary

Local backup captures:

- GBAP SQLite;
- Twenty PostgreSQL dump;
- Twenty local storage;
- Keycloak local state.

Secrets are deliberately excluded from ordinary backup output. `.env` and `.runtime` require separate protected handling.

This is a UAT continuity mechanism, not production DR evidence and not the required production clean-environment restore drill.

## 8. Acceptance Gate

Before this UAT deployment can be merged and offered as the supported local trial path, CI must prove on one HEAD:

1. all PowerShell operator scripts parse;
2. Compose renders;
3. real GBAP Web/API/Keycloak/Twenty boot;
4. persistent Twenty workspace/API key bootstrap;
5. dedicated read-only adapter DB role;
6. governed `twenty-crm-uat` registration;
7. provider reaches HEALTHY;
8. employee/manager/admin authentication boundary;
9. canonical + operational + communication reads;
10. a real Account survives stop/restart with volumes retained.

## 9. Nonclaims

```text
Local UAT usable = TARGET OF THIS RECORD
Production go-live = NOT AUTHORIZED
Production immutable image identity = NOT CLAIMED
Production secret-management = NOT CLAIMED
Production backup/restore drill = NOT CLAIMED
E2 = NOT PROVEN
E3 = NOT PROVEN
Automatic Twenty -> Frappe failover = NO
```

## 10. Next action after UAT acceptance

After this deployment passes and is merged to `main`, the product owner may download/clone `main`, run Local UAT and begin real operational trial.

While UAT is in use, product changes continue through normal branch/PR/CI/update discipline. Production readiness remains a separate later Gate.
