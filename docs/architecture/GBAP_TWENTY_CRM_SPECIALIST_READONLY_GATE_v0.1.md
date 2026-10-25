# GBAP GBAP｜Twenty CRM Specialist Read-Only Gate v0.1

Status: **REOPEN / SOURCE BATCH ACTIVE / LIVE UAT NOT AUTHORIZED**

Date: 2026-09-22

Authority:

- `docs/architecture/GBAP_ENTERPRISE_AI_CONTROL_PLANE_ARCHITECTURE_v1.0.md`
- Twenty `v2.41.0`
- `gbap.ai.v1`
- existing Keycloak + `principal_provider_mapping` identity authority
- Twenty Candidate B F1/F2 accepted evidence

## 1. REOPEN trigger

The prior GBAP Twenty App intentionally had zero CRM object permission because its only admitted function was Knowledge retrieval.

The frozen Enterprise AI architecture now requires a real CRM Domain AI:

```text
CRM-led reasoning
-> Twenty CRM Domain AI
-> employee-scoped CRM context
```

The App permission surface is therefore reopened narrowly. This is not a reopen of GBAP identity, CRM ownership, Knowledge ACL, model admission, or multi-Agent architecture.

## 2. Reuse-first decision

Use the supported Twenty v2.41 App runtime rather than build a duplicate CRM Agent.

Chosen path:

```text
Twenty Logic Function
-> default CoreApiClient
-> triggering person's permissions INTERSECT GBAP App permissions
```

The App role is an upper bound, not an authority expansion.

No `runAgent` production admission is required for this read foundation. No Twenty core patch is required.

## 3. Explicit App permission envelope

Broad permissions remain false:

```text
canReadAllObjectRecords          false
canUpdateAllObjectRecords        false
canSoftDeleteAllObjectRecords    false
canDestroyAllObjectRecords       false
canUpdateAllSettings             false
```

Only these standard objects receive explicit permission:

| Object | Read | Update | Soft delete | Destroy |
|---|---:|---:|---:|---:|
| Company | true | false | false | false |
| Person | true | false | false | false |
| Opportunity | true | false | false | false |

No object create/update/delete Tool is admitted.

## 4. Employee identity admission

Before CRM data is read, the Logic Function calls:

```text
POST /internal/ai/twenty/principal/authorize
purpose = crm.read
```

The private bridge:

1. authenticates the GBAP App machine token;
2. requires exact `workspaceId + userWorkspaceId + workspaceMemberId`;
3. resolves the existing `principal_provider_mapping`;
4. resolves the mapped canonical subject against current Keycloak state;
5. requires `enabled=true` and `substrate-user`;
6. accepts only the allowlisted purpose `crm.read`;
7. audits successful authorization without CRM source content;
8. returns only `{"authorized":true}`.

The App machine token alone never authorizes CRM data.

## 5. CRM context Tool

Logical function:

`read-gbap-crm-context`

Admitted scopes:

- `COMPANY`
- `CONTACT`
- `OPPORTUNITY`

Safety properties:

- bounded scan and return limits;
- optional current-record lookup;
- read-only `CoreApiClient.query`;
- no `.mutation(...)`;
- no `runAs: 'application'`;
- no `runAgent`;
- no Twenty record ID returned;
- sanitized business fields only.

This is a provider-native CRM specialist implementation behind the GBAP Control Plane. It does not authorize other runtimes to bypass the GBAP Capability Fabric.

## 6. Relationship to the frozen routing model

This gate implements Tier 1 and prepares Tier 2:

```text
Tier 1:
GBAP -> CRM domain -> Twenty

Tier 2:
GBAP -> CRM domain -> Twenty
                    -> search-gbap-knowledge when needed
                    -> Twenty returns final result
```

RAGFlow Lead Agent invocation for both paths is zero.

Tier 3 remains separately gated.

## 7. Historical evidence treatment

Twenty F1/F2 evidence remains accepted historical proof for:

- mapped identity;
- unmapped deny;
- disabled identity deny;
- two-employee Knowledge ACL isolation;
- canonical citations.

The historical statement “App has zero CRM record permission” is superseded **only for this new CRM specialist implementation** by the explicit read-only envelope in this gate.

No historical evidence file is rewritten.

## 8. Source acceptance

Before live UAT:

1. Twenty native App build must PASS.
2. generated manifest must contain exactly the intended read-only object permissions;
3. generated manifest must contain both Knowledge and CRM context logic functions;
4. source tests must prove no CRM mutation/runAs application/runAgent path;
5. principal authorization positive and negative tests must PASS;
6. multi-runtime contract must still prove CRM-only bypasses RAGFlow Lead;
7. Fast CI and affected focused gates must PASS.

## 9. Live-UAT non-claims

This source batch does not claim:

- updated App applied to Windows UAT;
- real CRM specialist model reasoning PASS;
- Tier-2 development-email scenario PASS;
- AI writes enabled;
- external MCP exposed;
- Production authorized.

Those require later exact Windows evidence after source acceptance.

Production remains **NOT AUTHORIZED**.
