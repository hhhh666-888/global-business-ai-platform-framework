# GBAP GBAP｜Twenty AI App Candidate B v0.1

Status: **SOURCE CONTRACT PASS / STAGE A CLOSED / STAGE B CLOSED / IDENTITY BRIDGE CLOSED / WINDOWS UAT PLAN-ONLY NEXT**

Date: 2026-09-20

Authority:
- `docs/architecture/GBAP_AI_REUSE_FIRST_RUNTIME_AUDIT_v0.2.md`
- `docs/architecture/GBAP_AI_RUNTIME_INTEGRATION_SURFACE_AUDIT_v0.1.md`
- `docs/architecture/GBAP_CI_GOVERNANCE_v0.10.md`
- Twenty exact upstream: `twentyhq/twenty@twenty/v2.37.0`
- Accepted RAGFlow Candidate A merge: PR #256 / `52a3787c435f0ff5dc3fed47c26396e80358b012`

## 1. Decision

Candidate B must reuse Twenty's native AI and supported App extension model.

GBAP will **not**:

- copy Twenty's Agent executor;
- reproduce Twenty's tool registry;
- reproduce its model registry;
- call `runAgent` and assume it preserves user scope;
- grant a static service token broad employee data access.

The first Candidate B extension is one read-only Twenty App tool:

```text
search-gbap-knowledge
```

It is defined with Twenty's native `toolTriggerSettings`.

## 2. Exact upstream behavior reused

Twenty v2.37.0 documents and implements:

```text
defineLogicFunction
toolTriggerSettings
LogicFunctionExecutionContext.workspaceMemberId
TWENTY_APP_ACCESS_TOKEN
person role ∩ application role
```

A person-triggered logic function therefore carries a concrete workspace member identity.

Twenty also documents that application-owned helpers such as `runAgent` use application access. For that reason `runAgent` is not used as GBAP's user-scoped cross-boundary mechanism.

## 3. Least-privilege app role

Path:

`providers/twenty-adapter/ai-app/src/roles/default-role.ts`

The App receives:

```text
CRM read all       false
CRM update all     false
soft delete all    false
destroy all        false
object permissions none
field permissions  none
```

The reason is deliberate: Twenty native AI already owns CRM reasoning and CRM tools.

The GBAP App exists only to make governed external Knowledge discoverable to Twenty AI.

## 4. Tool behavior

Path:

`providers/twenty-adapter/ai-app/src/logic-functions/search-gbap-knowledge.ts`

The tool:

1. requires both `context.workspaceMemberId` and `context.userWorkspaceId`;
2. validates/bounds the Knowledge query;
3. reads only operator-configured Twenty server variables;
4. sends `workspaceId + userWorkspaceId + workspaceMemberId + query` to the private GBAP bridge;
5. expects only canonical authorized Knowledge results/citations;
6. performs no CRM mutation.

If no real person-scoped Twenty context is available:

```text
gbap_employee_context_required
```

and execution fails.

## 5. Machine credential is not employee authority

The app declares:

- `GBAP_AI_BRIDGE_URL`
- `GBAP_AI_BRIDGE_TOKEN` (secret)

The second value authenticates **the installed GBAP Twenty App**, not the employee.

Accepted canonical mapping after PR #263:

```text
Twenty workspaceId
+ userWorkspaceId
+ workspaceMemberId
        |
        v
existing principal_provider_mapping
        |
        +-- workspaceId exact match
        +-- userWorkspaceId exact match
        |
        v
canonical GBAP / Keycloak employee subject
        |
        v
current enabled state + current GBAP roles
        |
        v
existing GBAP Knowledge ACL
```

No mapping or any identity mismatch means deny.

This prevents a static App credential from becoming a general employee impersonation credential.

## 6. Identity bridge closure

The canonical identity bridge foundation is now implemented and accepted.

Authority:

`docs/architecture/GBAP_TWENTY_AI_IDENTITY_BRIDGE_FOUNDATION_v0.1.md`

Evidence:

`docs/evidence/GBAP_TWENTY_AI_IDENTITY_BRIDGE_FOUNDATION_EVIDENCE_2026-09-20.md`

Accepted implementation:

```text
PR #263 exact head   4fb50213c890fa71d0f80857845fdec81aefafd1
merged main          062f7bc87ed5664bd1748ba3d4633a564dc38d40
triggered checks     18
PASS                 18
FAIL                 0
```

The bridge reuses `principal_provider_mapping`, current Keycloak roles through Identity Admin, and the canonical `searchKnowledge()` authorization path. It does not create a second employee identity store or a second Knowledge ACL.

## 7. Exact Twenty App SDK/build supply admission

Exact upstream inspection at `twenty/v2.37.0` confirms:

```text
twenty-sdk@2.37.0
twenty-client-sdk@2.37.0
typescript@5.9.3
@types/node@24.7.2
Node ^24.5.0
Twenty CLI entrypoint comes from twenty-sdk
legacy twenty-cli is deprecated
offline build command: twenty dev:build
bounded sync/apply commands are supplied by twenty-sdk
```

The extra TypeScript packages are not optional decoration. `twenty dev:build` invokes the App-local `node_modules/.bin/tsc`, and this Candidate B source uses Node globals such as `process`.

Candidate B reuses the existing persistent npm supply rather than creating another package-download path. CI Governance v0.10 keeps the accepted v0.9 web admission source unchanged and adds a separate bounded source:

`infrastructure/ci/ci-supply-npm-toolchain-allowlist.tsv`

This separation fixes the manifest-v2 second-batch bootstrap deadlock: a Stage A PR can propose exact toolchain specs without invalidating the persistent SHA of the already accepted v0.9 web allowlist.

Stage A:

```text
record exact SDK/build specs in ci-supply-npm-toolchain-allowlist.tsv
-> Candidate B package.json remains absent
-> existing v0.9 offline supply remains valid for PR CI
-> merge exact head to main
-> exact-main governed npm supply refresh
-> manifest records toolchain_allowlist_sha256
-> offline cache proof
```

Only after that exact-main refresh passes and CI Governance v0.10 is closed/re-frozen may Stage B add
`providers/twenty-adapter/ai-app/package.json`, `tsconfig.json` and execute the SDK build from the offline supply.

No `latest` or caret-ranged Twenty build package is accepted while the provider baseline remains Twenty v2.37.0.

## 8. Stage A closure

Accepted Stage A implementation:

`PR #259 / d70036888a311b2ced96b063162c74c2d93a914d`

Merged main:

`bde71de038207b434e72791a1b74768450fb9833`

Exact-main supply refresh:

`GBAP CI Dependency Supply Refresh #3 / run 35486539470 / PASS`

Closure evidence:

`docs/evidence/GBAP_CI_V0_10_CLOSURE_2026-09-20.md`

Accepted runtime proof:

```text
GBAP_CI_SUPPLY_MANIFEST_VERSION=2
GBAP_CI_SUPPLY_PREAPPROVED_NPM=11
GBAP_CI_TOOLCHAIN_SUPPLY_ADMISSION=PASS
GBAP_CI_SUPPLY_ENSURE=PASS
GBAP_CI_SUPPLY_NETWORK_FALLBACK=DISABLED
GBAP_CI_TOOLCHAIN_SUPPLY_ADMITTED=true
```

CI Governance v0.10 is now **RE-FROZEN / PASS / CLOSED**.

## 9. Stage B implementation contract

Paths:

```text
providers/twenty-adapter/ai-app/package.json
providers/twenty-adapter/ai-app/tsconfig.json
tests/substrate/twenty-ai-app-stage-b-build-self-test.mjs
.github/workflows/ai-runtime-twenty-app-stage-b-build.yml
```

Exact package boundary:

```text
twenty-sdk@2.37.0
twenty-client-sdk@2.37.0
typescript@5.9.3
@types/node@24.7.2
```

The Stage B Gate must:

```text
1. materialize the accepted GBAP dependency supply
2. require GBAP_CI_TOOLCHAIN_SUPPLY_ADMISSION=PASS
3. require normal-CI network fallback DISABLED
4. npm install --offline only
5. read back all four installed exact versions
6. run twenty dev:build
7. verify .twenty/output/manifest.json
8. verify exactly one read-only Knowledge logic function
9. verify zero Twenty Agents and zero CRM objects in this App
10. verify the built .mjs handler still requires person context and private bridge
11. never run plan/apply/dev --once
```

This Stage B contract is build-only. It does not authorize remote Twenty installation or any employee identity bridge.

## 10. Stage B closure

Accepted implementation:

`PR #261 / 59f516922c181954b7628446783e386631298cec`

Merged main:

`fd124f758bd463ec1247078e6734a61b4e066e60`

Evidence:

`docs/evidence/GBAP_TWENTY_AI_CANDIDATE_B_STAGE_B_EVIDENCE_2026-09-20.md`

Accepted proof:

```text
offline exact toolchain install        PASS
twenty dev:build                       PASS
manifest built                         PASS
logic functions                        1
Twenty Agents                          0
CRM objects                            0
Fast CI                                PASS
Twenty reuse contract                  PASS
CI v0.10 regression                    PASS
```

Stage B is now **PASS / CLOSED**.

## 11. Next legal gate

The next gate is **Windows Twenty UAT plan-only**:

```text
1. regenerate the exact Candidate B manifest through the governed native Stage B build
2. require the generated manifest to deep-match uat-plan-manifest.json
3. use the existing Windows UAT endpoint http://localhost:3000
4. reuse the existing protected .runtime/twenty-api-key
5. execute Twenty v2.37.0 syncApplication(manifest, dryRun: true)
6. persist the complete returned action plan under .runtime
7. BLOCK on any delete, invalid action type, object/field/agent/skill/connection-provider capability
8. do not create an application registration
9. do not upload application files
10. do not install or apply in this gate
11. review the plan before opening a separate first-install/apply admission
```

The plan-only contract is intentionally executable only on the Windows UAT host because Twenty remains loopback-bound there. GitHub CI validates the manifest and script contract but does not claim a live UAT plan run.

No primary runtime is selected by this document.

Production remains **NOT AUTHORIZED**.
