# GBAP Twenty AI Identity Bridge Foundation v0.1

Status: **PASS / CLOSED / UAT PLAN-ONLY NEXT / APPLY NOT AUTHORIZED**

Date: 2026-09-20

Authority:
- `docs/architecture/GBAP_AI_REUSE_FIRST_RUNTIME_AUDIT_v0.2.md`
- `docs/architecture/GBAP_TWENTY_AI_APP_CANDIDATE_B_v0.1.md`
- `docs/evidence/GBAP_TWENTY_AI_CANDIDATE_B_STAGE_B_EVIDENCE_2026-09-20.md`
- Twenty exact upstream: `twentyhq/twenty@twenty/v2.37.0`

## 1. Decision

Candidate B must not create a second employee identity master.

GBAP already has a canonical cross-provider identity mapping used by the accepted Twenty CRM permission path:

`principal_provider_mapping`

The AI bridge reuses that table and current Keycloak authority.

## 2. Existing mapping authority reused

The accepted Twenty adapter persists real runtime claims only after a real Twenty user session yields all required IDs.

Existing columns include:

```text
principal_subject
provider_id
actor_username
external_user_id
external_user_workspace_id
external_workspace_member_id
external_workspace_id
```

Existing uniqueness includes:

```text
PRIMARY KEY (principal_subject, provider_id)
UNIQUE (provider_id, external_user_id)
UNIQUE (provider_id, external_workspace_member_id)
```

Candidate B therefore resolves:

```text
provider_id + workspaceMemberId
        |
        v
existing principal_provider_mapping
        |
        +-- workspaceId must match
        +-- userWorkspaceId must match
        |
        v
canonical Keycloak subject
```

Any missing mapping or ID mismatch fails closed.

## 3. Exact Twenty person context

Twenty v2.37.0 `LogicFunctionExecutionContext` provides:

```text
workspaceId
userWorkspaceId
workspaceMemberId
```

The Candidate B tool now requires both person-scoped IDs and sends all three IDs to the private bridge.

A static App machine token is not employee authority.

## 4. Current Keycloak authority

The mapping table answers **who the employee is**.

It does not answer whether that employee is still enabled or what roles the employee currently has.

Identity Admin remains the only service holding the existing Keycloak admin credential.

A narrow internal endpoint is added:

`POST /internal/identity/resolve-subject`

It returns only:

```text
subject
username
enabled
roles
```

It does not expose:
- passwords;
- Keycloak admin tokens;
- e-mail mutation;
- user-list administration;
- provider tokens.

The endpoint requires a dedicated machine credential and is not the browser/admin API.

## 5. Canonical Knowledge authorization

The API bridge does not manufacture a bearer token.

It resolves a canonical actor:

```text
subject
username
Set<current Keycloak roles>
```

and calls the existing canonical `searchKnowledge()` function.

The same Knowledge ACL remains authoritative:

- subject ownership;
- subject ACL entries;
- role ACL entries;
- `substrate-admin`;
- document visibility checks.

No second Knowledge permission implementation is introduced.

## 6. Machine credentials

Two independent machine credentials are used:

```text
Twenty App -> GBAP API
  twenty-ai-bridge-token

GBAP API -> Identity Admin
  identity-resolver-token
```

Both are local-UAT runtime files under:

`infrastructure/local-uat/.runtime/`

They are gitignored and mounted read-only.

Neither token grants Knowledge access without a valid mapped and currently enabled employee.

## 7. Network boundary

Twenty server/worker are not added to the broad `gbap-runtime` network.

A dedicated internal Docker network is introduced:

`gbap-ai-bridge`

Members:

```text
api
twenty-server
twenty-worker
```

The API receives a bridge-only network alias.

Identity Admin remains on `gbap-runtime`; API already participates there.

This preserves the existing provider isolation while adding only the required AI edge.

## 8. Foundation test contract

The foundation Gate must prove:

```text
mapped exact triple                              PASS
workspaceId mismatch                             403
userWorkspaceId mismatch                         403
workspaceMemberId unmapped                       403
wrong App machine token                          401
disabled Keycloak identity                       403
current roles used                               PASS
same canonical Knowledge search reused           PASS
new identity master created                      false
Twenty apply/dev --once executed                 false
Production authorized                            false
```

## 9. Explicit non-scope

This foundation does not:

- install the App into Twenty UAT;
- set Twenty App server-variable values;
- run `twenty apply`;
- run `twenty dev --once`;
- enable CRM writes;
- select the PRIMARY runtime;
- expose MCP;
- authorize Production.

## 10. Closure

Accepted PR:

`#263 feat(ai): add Twenty canonical identity bridge foundation`

Accepted exact head:

`4fb50213c890fa71d0f80857845fdec81aefafd1`

Merged main:

`062f7bc87ed5664bd1748ba3d4633a564dc38d40`

Evidence:

`docs/evidence/GBAP_TWENTY_AI_IDENTITY_BRIDGE_FOUNDATION_EVIDENCE_2026-09-20.md`

Exact-head result:

```text
18 triggered checks
18 PASS
0 FAIL
Final Heavy CI: not required
```

The identity bridge foundation is **PASS / CLOSED**.

## 11. Next legal gate

The next gate is isolated Windows UAT **plan-only** admission.

The plan must use the exact manifest generated by the governed Twenty v2.37.0 Stage B build and the same provider mutation used by `twenty plan`:

`syncApplication(manifest, dryRun: true)`

Required sequence:

1. read current Windows installed SHA;
2. require the accepted AI bridge mainline or later;
3. verify Twenty UAT `http://localhost:3000/healthz`;
4. read the existing protected `.runtime/twenty-api-key`;
5. submit the exact governed manifest with `dryRun: true`;
6. persist the returned action plan as UAT evidence;
7. verify no action is destructive and no unexpected object/field/agent capability is proposed;
8. do not register/install/apply/upload the App in this gate;
9. open a separate first-install/apply decision only after plan review.

Production remains **NOT AUTHORIZED**.
