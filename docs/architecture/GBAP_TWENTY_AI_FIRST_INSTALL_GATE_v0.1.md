# GBAP Twenty AI Candidate B｜First-Install / Apply Admission Gate v0.1

Status: **SOURCE CONTRACT ACCEPTED / LIVE WINDOWS FIRST-INSTALL PARTIAL_OR_BLOCKED / PRODUCTION NOT AUTHORIZED**

Date: 2026-09-20

Authority chain:
- `docs/architecture/GBAP_TWENTY_AI_APP_CANDIDATE_B_v0.1.md`
- `docs/architecture/GBAP_TWENTY_AI_IDENTITY_BRIDGE_FOUNDATION_v0.1.md`
- `docs/architecture/GBAP_TWENTY_AI_UAT_PLAN_GATE_v0.1.md`
- `docs/evidence/GBAP_TWENTY_AI_WINDOWS_PLAN_EVIDENCE_2026-09-20.md`
- Twenty exact upstream: `twentyhq/twenty@twenty/v2.37.0`

## 1. Purpose

This Gate governs Candidate B's **first real installation into the company Windows Twenty UAT workspace**.

It exists because the accepted live dry-run proves only the planned metadata actions. A real first install additionally needs a Twenty application registration, a workspace application, the exact built files, and a non-dry manifest sync.

No Production action is in scope.

## 2. Accepted live-plan precondition

The first-install gate may exist only because the real Windows plan closed with:

```text
installed SHA               7b4fd83cf36f951978e2dc8eb41a5e84e4125117
Twenty health               HTTP 200
plan result                 PASS
total                       2
create                      2
update                      0
delete                      0
invalidType                 0
forbiddenCapability         0
actions                     create logicFunction
                            create role
applyAuthorized             false
productionAuthorized        false
```

The accepted live-plan snapshot was later followed by one bounded source-only change in PR #266: the Candidate B README lifecycle text advanced from plan-only to first-install admission. Twenty native build embeds that README as `application.aboutDescription`, so the governed manifest snapshot advances with it. No role permission, logic-function schema, handler checksum, CRM capability, Agent, Skill or connection-provider capability changes.

The accepted Windows plan is therefore evidence for opening this separate Gate, not a substitute for a plan of the current manifest. The controlled install entrypoint must prove the current merged manifest independently by the two mandatory pre-write dry-runs below.

Any capability/action-set drift in those fresh pre-install plans invalidates this admission and blocks the install.

## 3. Exact Twenty v2.37.0 lifecycle

Twenty v2.37.0 exact source proves that a non-dry development sync is **not** equivalent to changing `dryRun:true` to `false`.

The official `dev-once` lifecycle is:

```text
build + typecheck
-> dry-run plan
-> ensure application registration
-> createDevelopmentApplication
-> upload native built files
-> syncApplication(manifest)          # non-dry
-> post-install client/runtime work
```

The server-side `ApplicationDevelopmentService` independently requires:

```text
application registration exists
+
workspace application exists
before non-dry applyManifestSync
```

Therefore GBAP must not issue a blind non-dry sync against an unregistered/uninstalled app.

## 4. Governed install artifact

Stage B already proved the Candidate B app with the admitted offline Twenty v2.37.0 SDK/toolchain.

The first-install gate reuses that exact native build; Windows UAT does not run another npm install/build.

Frozen generated handler:

`providers/twenty-adapter/ai-app/uat-install/search-gbap-knowledge.mjs`

Accepted checksum:

```text
SHA256  50451337e773525cfa2f965d170cc6c5c83d5147da87821000cfbe1b8985d010
MD5     ac823f652140b4664644ad90fd8d0986
```

The MD5 must equal the manifest `builtHandlerChecksum`.

The exact native `builtFileInfos` contract requires three uploaded files:

| Remote path | FileFolder | Source |
|---|---|---|
| `src/logic-functions/search-gbap-knowledge.mjs` | `BuiltLogicFunction` | frozen native build |
| `src/logic-functions/search-gbap-knowledge.ts` | `Source` | governed source |
| `package.json` | `Dependencies` | exact Candidate B package |

The source map is not a `builtFileInfo` and is not required for installation.

### 4.1 Cross-platform byte canonicalization

The native Twenty build and manifest checksums are generated from LF text bytes. Windows Git checkout may otherwise materialize governed text artifacts as CRLF while still reporting a clean worktree.

Therefore the first-install boundary freezes LF in `.gitattributes` for the Candidate B App text artifacts and the Windows entrypoint independently canonicalizes the three uploaded text files to UTF-8 without BOM + LF inside its gitignored runtime directory before checksum validation and upload.

The Gate validates:

```text
built handler canonical MD5       == manifest builtHandlerChecksum
built handler canonical SHA256    == accepted native-build SHA256
package.json canonical MD5        == manifest packageJsonChecksum
uploaded handler/source/package   canonical LF runtime copies only
working tree                      remains unchanged
```

This is byte normalization only. It does not change executable source, manifest capability, role permission, action admission, or Twenty lifecycle semantics.

## 5. Controlled Windows entrypoint

Script:

`infrastructure/local-uat/Install-GBAP-TwentyAiCandidateB.ps1`

Default invocation is preflight-only:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass \
  -File .\infrastructure\local-uat\Install-GBAP-TwentyAiCandidateB.ps1
```

Without explicit `-AuthorizeInstall`, it must not create registration/application metadata, upload files, or apply the manifest.

A live install is allowed only after this source/contract Gate reaches accepted exact-head PASS, is merged to `main`, Windows UAT is updated to that accepted revision, and the operator explicitly invokes the install switch.

The script enforces that admission mechanically before any plan or write:

```text
current branch        main
HEAD                  == origin/main
working tree          clean
```

A PR branch, stale local main, detached head, or dirty working tree is blocked.

## 6. Mandatory pre-write controls

Immediately before any write, the script must:

1. validate the frozen manifest and frozen built-handler checksums;
2. execute the real Twenty dry-run again;
3. require the exact first-install action set:
   - `create logicFunction`;
   - `create role`;
4. require zero update/delete/invalid/forbidden actions;
5. create a new complete Local UAT backup through `Backup-GBAP-UAT.ps1`;
6. restart UAT through the existing backup workflow;
7. recheck Twenty health;
8. execute and validate the exact dry-run **again after backup/restart**.

Any mismatch blocks the install.

## 7. Authorized mutation sequence

Only after all controls pass may `-AuthorizeInstall` perform the following lifecycle.

All JSON metadata GraphQL calls reuse the already accepted Windows PowerShell 5.1 transport contract: `curl --data-binary @request.json` to Twenty `/metadata`. The Gate does not reintroduce PowerShell HTTP body handling for these mutations.

For GraphQL multipart file uploads, the same Windows quoting boundary applies. The `operations` and `map` JSON fields must first be materialized as UTF-8/no-BOM runtime files and passed to curl as multipart fields read from those files. The script must not embed raw JSON directly in PowerShell native `-F` arguments.

```text
findApplicationRegistrationByUniversalIdentifier
-> createApplicationRegistration only when absent
-> createDevelopmentApplication
-> uploadApplicationFile x3
-> syncApplication(manifest) non-dry
-> syncApplication(manifest, dryRun:true) post-check
```

First-install apply must return the same safe two-action shape.

The post-install dry-run must return:

```text
actions = 0
```

This zero-action convergence is mandatory evidence that the installed metadata matches the frozen manifest.

## 8. Failure / rollback boundary

### 8.1 Preserve the real Twenty failure

A non-2xx upload response must not be reduced to the HTTP status code alone.

Before rejecting the response, the Windows entrypoint parses the Twenty GraphQL response body and preserves, when present:

```text
errors[].extensions.code
errors[].extensions.subCode
errors[].message
```

If the body is not valid GraphQL JSON, the entrypoint includes a bounded raw response excerpt in the thrown error. The runtime evidence therefore retains the server-side reason instead of only `HTTP 500`.

This diagnostic preservation does not authorize a retry. A partial install remains blocked until the failure is understood and a clean resume or governed restore is proven.

The first governed Windows execution on 2026-09-20 reached this boundary in practice:

```text
installed SHA                     e16bea27b5bc6f6ce0f576c347a1d1e688aad9ce
pre-write dry-run #1              PASS / 2 CREATE
mandatory UAT backup              PASS / .backups/20260920-153236
pre-write dry-run #2              PASS / 2 CREATE
application registration          CREATED
development application           CREATED / RESOLVED
first BuiltLogicFunction upload   HTTP 500
successful uploads recorded       0 / 3
manifest apply                    NOT REACHED
post-install convergence          NOT REACHED
result                            PARTIAL_OR_BLOCKED
```

The script does not automatically call `uninstallApplication`.

Reason:

- registration/app creation and file upload are individually retryable/idempotent enough to diagnose;
- a blind uninstall is destructive and may remove evidence needed to understand a partial failure;
- a complete pre-install UAT backup is mandatory before writes.

On any partial or blocked result:

```text
STOP
DO NOT CONTINUE
DO NOT GUESS
DO NOT AUTO-UNINSTALL
```

The evidence records the pre-install backup path.

If clean resume cannot be proven, the accepted rollback is the governed:

`infrastructure/local-uat/Restore-GBAP-UAT.ps1`

using that exact pre-install backup.

Any future direct uninstall flow requires its own explicit destructive authorization.

### 8.2 Proven clean-resume boundary after pre-apply upload failure

A partial attempt may be resumed without restoring the pre-install backup only when all of the following remain true:

```text
current git SHA              accepted merged main
working tree                 clean
Twenty health                PASS
fresh real plan              exactly 2 CREATE
                             logicFunction + role
manifest apply               not yet executed
post-install convergence     not yet claimed
registration                 same universalIdentifier
development application      same universalIdentifier
Production                   false
```

Twenty v2.37.0 makes this bounded resume deterministic:

- `createDevelopmentApplication` returns the existing workspace application when one already exists for the same universal identifier;
- application creation invalidates/recomputes `flatApplicationMaps`;
- application file persistence is an upsert keyed by file path, workspace and application;
- therefore a retry that fails before manifest apply may resolve the same registration/application and retry the exact governed file uploads without creating a second logical Candidate B application.

This does **not** authorize blind retry after manifest apply, unknown mutation state, capability drift, or a changed manifest. Those states require separate diagnosis and, when clean resume cannot be proved, the governed restore path.

The upload transport must preserve the Twenty response body before rejecting a non-2xx status. A bare HTTP status without GraphQL/server detail is insufficient failure evidence.

### 8.3 Proven Windows UAT storage-ownership root cause and permanent repair

The governed clean-resume attempt on 2026-09-20 preserved the actual Twenty error body and proved the first upload failure root cause:

```text
INTERNAL_SERVER_ERROR
EACCES: permission denied, mkdir
/app/packages/twenty-server/.local-storage/<workspace>/<application>
```

At that failure point:

```text
fresh pre-write plan            PASS / exactly 2 CREATE
post-backup plan                PASS / exactly 2 CREATE
registration                    resolved
development application         resolved
successful uploads              0
manifest apply                  NOT REACHED
post-install convergence        NOT REACHED
Production                      false
```

Therefore the failure is a Local UAT filesystem ownership/writability defect, not a Candidate B capability, manifest, GraphQL multipart, or permission-admission failure.

The Local UAT startup boundary must repair this deterministically instead of relying on a one-time operator command:

1. before starting Twenty core services, run the exact Twenty service image with the shared `twenty-server-data` volume as root;
2. ensure the storage directory exists;
3. recursively set storage ownership to runtime UID/GID `1000:1000`;
4. start Twenty server/worker normally under the upstream runtime user;
5. after Twenty health passes, execute a write/delete probe inside the running server as runtime UID 1000;
6. fail startup if the probe cannot create and remove a file.

This repair runs through `Start-GBAP-UAT.ps1`, so ordinary startup, post-backup restart, governed update, and post-restore startup converge on the same storage ownership contract.

The repair changes filesystem ownership only. It does not alter Candidate B metadata, registration IDs, application IDs, manifest capability, server variables, identity authorization, PRIMARY selection, or Production authority.

## 9. Deliberately deferred from this Gate

Even after first-install PASS, this Gate does **not** authorize:

- setting `GBAP_AI_BRIDGE_URL`;
- setting `GBAP_AI_BRIDGE_TOKEN`;
- executing the Knowledge tool;
- mapped employee live test;
- unmapped employee deny test;
- two-employee ACL isolation test;
- selecting Candidate B as PRIMARY;
- public MCP;
- CRM writes/autonomous mutation;
- Production.

The next Gate after successful installation is **runtime configuration + live identity/ACL authorization**.

## 10. Evidence

Source/contract CI must prove:

- frozen native manifest equality;
- frozen handler equality with a fresh admitted offline native build;
- handler SHA256 and manifest MD5;
- default preflight/no-write behavior;
- explicit install switch;
- real plan before writes;
- mandatory backup before writes;
- second plan after backup/restart;
- exact registration -> application -> upload -> sync order;
- zero-action post-install plan;
- no server-variable values;
- no auto-uninstall;
- Production false.

Live install evidence location:

`infrastructure/local-uat/.runtime/twenty-ai-first-install-evidence.json`

That file is runtime-only and gitignored.

## 11. Current decision

PR #266 closed this source-contract Gate:

```text
accepted exact head               31f2179825edc42e8f59f79b6e1a67d5df25f432
triggered checks                  8
PASS                              8
FAIL                              0
merge                             620915bd0a8ec1795171bff81cfe9cb245f1d177
first-install source contract     ACCEPTED / CLOSED
live Windows first-install        PARTIAL_OR_BLOCKED
Windows installed SHA             e16bea27b5bc6f6ce0f576c347a1d1e688aad9ce
pre-install backup                .backups/20260920-153236
registration/application          CREATED / RESOLVED
first file upload                 HTTP 500
successful uploads                0 / 3 CONFIRMED
manifest apply                    NOT REACHED
post-install convergence          NOT REACHED
server variables                  NOT CONFIGURED
identity live tests               NOT RUN
PRIMARY runtime                   NOT SELECTED
Production                        NOT AUTHORIZED
```

Source admission remains valid, but the live Windows first-install is now blocked at the first file-upload boundary. Do not invoke `Install-GBAP-TwentyAiCandidateB.ps1 -AuthorizeInstall` again until the HTTP 500 cause is identified and a clean idempotent resume or governed restore path is proven.

The failed execution already proved both fresh real pre-write plans and the mandatory backup/restart boundary. Registration/application creation is preserved as partial state for diagnosis. No manifest apply occurred.
