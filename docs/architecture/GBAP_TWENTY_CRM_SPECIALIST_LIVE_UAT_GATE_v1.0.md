# GBAP GBAP｜Twenty CRM Specialist Live UAT Gate v1.0

Status: **SOURCE IMPLEMENTED / WINDOWS EXECUTION NOT YET AUTHORIZED**

Date: 2026-09-22

Authority:
- `docs/architecture/GBAP_ENTERPRISE_AI_CONTROL_PLANE_ARCHITECTURE_v1.0.md`
- `docs/architecture/GBAP_TWENTY_CRM_SPECIALIST_READONLY_GATE_v0.1.md`
- Twenty `v2.41.0`
- accepted Candidate B F1/F2 evidence
- current formal company Local-UAT baseline

## 1. Purpose

This gate moves the merged read-only CRM Specialist from source/build proof into one governed real Windows Local-UAT proof.

It does not reopen the enterprise AI architecture.

It proves only:

```text
GBAP Control Plane
-> CRM domain
-> Twenty native CRM specialist tool
-> real mapped employee
-> employee permission ∩ App permission
-> bounded CRM read
```

## 2. Historical evidence reused

Do not recreate already-proven identity fixtures.

The gate reuses accepted F1/F2 evidence for:
- canonical Twenty principal mapping;
- mapped employee login;
- unmapped identity deny;
- disabled canonical identity deny;
- two-employee separation;
- current Keycloak role revalidation;
- private bridge machine-token non-authority;
- Knowledge ACL isolation.

The new gate adds only the facts that did not exist in F1/F2:
- current two-function App manifest;
- explicit Company/Person/Opportunity read-only role permissions;
- official apply of that updated manifest;
- live execution of `app_read_gbap_crm_context`.

## 3. Official plan gate

Script:

`infrastructure/local-uat/Test-GBAP-TwentyAiCrmSpecialistV1Plan.ps1`

Requirements:
- exact clean current `main`;
- governed `.runtime/last-update.json` status = PASS;
- installed UAT SHA = exact current `main` SHA;
- formal Twenty `v2.41.0`;
- exact Twenty SDK/toolchain versions;
- exactly two Logic Functions:
  - `read-gbap-crm-context`
  - `search-gbap-knowledge`
- exactly one App role;
- all broad read/update/delete/destroy flags false;
- exactly three explicit object permissions;
- each object permission:
  - read = true
  - update = false
  - soft-delete = false
  - destroy = false
- zero App-defined CRM objects/fields/Agents/Skills;
- machine-readable plan may contain only:
  - `logicFunction`
  - `role`
  - `objectPermission`
- a non-converged first-apply plan must be exactly 5 actions: 4 create + 1 update + 0 delete;
- the 5 actions must be exactly: 1 CRM `logicFunction` create, 1 exact GBAP role update, and 3 `objectPermission` creates;
- the role update may not enable any broad/settings/assignment permission;
- the CRM Logic Function create must match the exact frozen name and universal identifier;
- every planned `objectPermission` must belong to the GBAP App + default role, target exactly one of the three manifest-declared CRM objects, and be READ=true / UPDATE=false / SOFT_DELETE=false / DESTROY=false;
- the already-converged state may contain exactly 0 actions;
- the two required App server variables must exist and already be filled;
- delete actions = 0.

The plan is no-write.

Runtime evidence note (2026-09-22): the first company-UAT pre-apply plan on main `e7a37a8245e217ab24a2f146b512adc709955bc9` produced 5 actions: 4 create + 1 update + 0 delete, with exactly 3 actions reported as previously-unexpected metadata. Twenty upstream metadata defines `objectPermission` as its own sync metadata entity, so the gate was corrected to admit only the exact three manifest-declared READ-only object-permission actions rather than treating them as unexpected capabilities.

## 4. Official apply gate

Script:

`infrastructure/local-uat/Invoke-GBAP-TwentyAiCrmSpecialistV1Apply.ps1`

Default mode is preflight only.

Mutation requires explicit:

`-AuthorizeApply`

Before apply:
1. exact clean current `main`;
2. official plan PASS;
3. fresh governed full UAT backup;
4. post-backup plan must match the exact manifest hash, registration ID, object-permission targets, action counts, and semantic action-plan SHA-256.

Apply uses the official Twenty v2.41 CLI lifecycle.

After apply:
- rerun official plan;
- manifest hash must match;
- registration ID must match;
- action total must converge to zero.

Any failure after backup produces durable `PARTIAL_OR_BLOCKED` evidence containing the retained backup path and error. The script does not continue through an unknown partial state.

## 5. Live runtime proof

Validator:

`providers/twenty-adapter/twenty-ai-crm-specialist-live-v1.mjs`

Windows wrapper:

`infrastructure/local-uat/Invoke-GBAP-TwentyAiCrmSpecialistLiveV1.ps1`

The validator uses the existing mapped employees:
- `substrate-manager`
- `substrate-user`

It obtains their real Twenty employee tokens and executes through Twenty native `/mcp` ToolRegistry/ToolExecutor.

Required live tool:

`app_read_gbap_crm_context`

Required live assertions:

### Company
- manager call succeeds;
- user call succeeds;
- each returns at least one real existing CRM record.

### Contact
- real Logic Function execution succeeds;
- zero records is allowed if the current CRM contains no visible contacts.

### Opportunity
- real Logic Function execution succeeds;
- zero records is allowed if the current CRM contains no visible opportunities.

### Data boundary
Returned records must not contain:
- Twenty record IDs;
- workspace IDs;
- user-workspace IDs;
- workspace-member IDs;
- canonical Keycloak employee subjects.

### Negative identity
The validator calls the private principal authorization route with random unmapped user/workspace-member IDs.

Required result:

`403 twenty_principal_mapping_not_found`

Disabled-identity proof is reused from accepted F2 because the live CRM route uses the same shared `resolveAuthorizedActor` function. Do not create another disabled user only to repeat the same boundary.

## 6. Routing claim

This live proof is a Tier-1 CRM-only task.

Expected runtime:

```text
GBAP
-> Twenty CRM domain
-> read-gbap-crm-context
```

Required:
- the real GBAP router contract says CRM-only ownership is Twenty, `ragflowLeadRequired=false`, and `modelRoutingCalls=0`;
- the Live validator executes only the Twenty native Tool path and contains no RAGFlow/Knowledge invocation path;
- the Live validator checks the actual returned permission-mode marker for both mapped employees;
- no second Agent is started.

This gate does **not** claim independent RAGFlow runtime request-count telemetry. The live evidence reports only the path it actually executes: `TWENTY_NATIVE_TOOL_ONLY`.

This gate proves runtime selection behavior, not final natural-language CRM reasoning quality.

## 7. Explicit non-claims

This gate does not authorize:
- CRM write tools;
- autonomous mutation;
- email send;
- quotation publication;
- external MCP exposure;
- RAGFlow Lead for CRM-only work;
- Production.

AI writes remain disabled.

Production remains **NOT AUTHORIZED**.

## 8. Execution sequence after source PR merge

Run exactly once from the company Windows server:

```powershell
cd E:\GlobalBusinessAIPlatform

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\infrastructure\local-uat\Update-GBAP-UAT.ps1

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\infrastructure\local-uat\Invoke-GBAP-TwentyAiCrmSpecialistV1Apply.ps1 `
  -AuthorizeApply

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\infrastructure\local-uat\Invoke-GBAP-TwentyAiCrmSpecialistLiveV1.ps1 `
  -AuthorizeExecute
```

Do not run legacy Gate E1/E2 or F1/F2 again.

## 9. Success condition

This phase closes only when:
- source/contract CI PASS;
- official Windows plan/apply PASS;
- mandatory backup exists;
- post-apply plan = 0 actions;
- real Twenty CRM tool execution PASS;
- two mapped employees read Company data;
- Contact/Opportunity scopes execute;
- unmapped identity deny PASS;
- provider/canonical identity leak = false;
- CRM mutation requested = false;
- live execution path = `TWENTY_NATIVE_TOOL_ONLY`;
- the deterministic router separately proves CRM-only does not require RAGFlow Lead;
- independent RAGFlow request-count telemetry remains not implemented and is not claimed by this gate.

Then the next legal AI step is CRM-domain reasoning quality / Tier-2 borrowed Knowledge scenario, still with writes disabled.
