# GBAP Twenty AI Candidate B v2.41 F2 Negative Identity + ACL Gate v0.1

Status: **DESIGN + TOOLING IMPLEMENTED / REAL WINDOWS ONE-SHOT NEXT / PRIMARY NOT SELECTED / PRODUCTION NOT AUTHORIZED**

Date: 2026-09-21

Authority:
- `docs/architecture/GBAP_TWENTY_AI_CANDIDATE_B_LIVE_IDENTITY_GATE_v0.1.md`
- `docs/evidence/GBAP_TWENTY_AI_CANDIDATE_B_V241_F1_CLOSURE_2026-09-21.md`
- `docs/architecture/GBAP_TWENTY_AI_IDENTITY_BRIDGE_FOUNDATION_v0.1.md`

## 1. Entry

Candidate B E1, E2 and F1 are **PASS / CLOSED**.

`F1 PASS / CLOSED` is the explicit entry condition for this gate.

F2 does not reopen installation, migration or F1. It proves that the same live identity / Knowledge path fails closed under negative identity and ACL conditions before Candidate B can enter the later A-vs-B bake-off.

## 2. Required F2 proofs

One real Windows execution must prove all four classes together:

```text
unmapped employee deny
disabled employee deny
two-employee Knowledge ACL isolation
negative citation / authorization leakage = none
```

The accepted two-employee matrix is:

```text
substrate-manager -> manager RESTRICTED witness   ALLOW
substrate-manager -> user RESTRICTED witness      DENY
substrate-user    -> user RESTRICTED witness      ALLOW
substrate-user    -> manager RESTRICTED witness   DENY
```

Allowed paths must return at least one canonical Knowledge result and citation, and every citation must be backed by returned answerContext.

Denied paths must return no Knowledge result, no answerContext and no citation.

## 3. Identity proof design

### 3.1 Existing two-employee positive/ACL identities

F2 uses the existing enabled Local-UAT identities:

```text
substrate-manager
substrate-user
```

Their normal deterministic Twenty bridge identities and `principal_provider_mapping` rows are bootstrapped, if needed, through the existing governed provider capability path:

```text
GBAP employee token
-> /api/capabilities/crm.ops.v1.email.status/invoke
-> Twenty adapter ensureBridgeSession(...)
-> deterministic Twenty bridge identity
-> real Twenty claims
-> principal_provider_mapping
```

This is normal durable employee activation, not a synthetic mapping.

F2 must not change either employee's enabled state or roles. Their subjects and role sets are recorded before execution and verified unchanged after cleanup.

### 3.2 Unmapped employee deny

The unmapped proof sends a valid machine-authenticated request to the internal GBAP AI bridge with a workspace-member tuple that has no `principal_provider_mapping`.

Expected result:

```text
HTTP 403
twenty_principal_mapping_not_found
results absent/empty
citations absent/empty
```

No temporary Twenty identity is created for this negative case.

### 3.3 Disabled employee deny

F2 creates one uniquely named temporary Keycloak employee while it is enabled, gives it a bounded non-temporary password, and uses the existing governed capability path to create its normal deterministic Twenty bridge identity and real `principal_provider_mapping`:

```text
temporary GBAP employee token
-> /api/capabilities/crm.ops.v1.email.status/invoke
-> Twenty adapter ensureBridgeSession(...)
-> real Twenty bridge user / workspace member
-> real Twenty claims
-> real principal_provider_mapping
```

Only after that real Twenty identity exists does F2 disable the temporary Keycloak employee through the existing Identity Admin API.

The validator then authenticates the already-created deterministic Twenty identity and executes the installed Candidate B tool through Twenty's native tool dispatcher:

```text
disabled employee Twenty access
-> authenticated Twenty /mcp UAT harness
-> execute_tool
-> app_search_gbap_knowledge
-> GBAP AI bridge
-> live Identity Admin resolve-subject
-> enabled=false
-> canonical_identity_not_authorized
-> no Knowledge result / answerContext / citation leak
```

This proves disabled-state enforcement across the same Twenty-native execution chain used by positive Candidate B retrieval. No synthetic `principal_provider_mapping` insert is allowed for this proof.

Cleanup is also end-to-end. The cleanup-only validator uses the Twenty v2.41 dedicated `deleteUserFromWorkspace` mutation under the existing provisioner/owner identity to remove the temporary Twenty workspace member, then deletes the exact `principal_subject + provider_id` mapping. The Windows wrapper finally deletes the temporary Keycloak identity.

Existing `substrate-admin`, `substrate-manager` and `substrate-user` are never disabled.

## 4. Knowledge ACL proof design

F2 creates two synthetic / non-company collections through the canonical GBAP Knowledge API.

Both collections and both documents are:

```text
classification = RESTRICTED
visibility     = RESTRICTED
```

ACLs are subject-specific:

```text
manager collection -> READ -> substrate-manager subject only
user collection    -> READ -> substrate-user subject only
```

Each document contains its own unique random marker and must reach READY before any Twenty tool assertion starts.

The native Candidate B path remains:

```text
existing employee
-> authenticated Twenty /mcp UAT harness
-> get_tool_catalog
-> execute_tool
-> app_search_gbap_knowledge
-> ToolExecutorService
-> LogicFunctionExecutorService
-> GBAP AI bridge
-> current canonical identity
-> canonical searchKnowledge()
-> canonical Knowledge ACL
-> RAGFlow
```

The internal `/mcp` endpoint remains a loopback/internal UAT harness only. F2 does not expose MCP or add any public MCP route/configuration.

## 5. Cleanup / reversibility

The F2 Windows wrapper is intentionally one-shot and owns cleanup.

Its `finally` path must:

1. remove the temporary Twenty workspace member through Twenty v2.41 `deleteUserFromWorkspace`;
2. delete the temporary employee's exact `principal_subject + provider_id` mapping;
3. archive both synthetic Knowledge documents;
4. replace both temporary collection ACLs with an empty ACL;
5. archive both synthetic collections;
6. delete the temporary disabled Keycloak employee;
7. verify existing manager/user subjects and roles are unchanged.

Archived synthetic Knowledge rows may remain as canonical audit/recovery history, consistent with existing Knowledge lifecycle. No active F2 witness and no active F2 ACL entry may remain.

The existing manager/user Twenty mappings may remain because they are legitimate deterministic mappings for real enabled employees.

## 6. Runtime admission and execution discipline

F2 requires before any fixture mutation:

```text
exact current GitHub main
F1 closure authority present
GBAP API healthy
Web gateway healthy
Keycloak healthy
Twenty healthy
twenty-server LOGIC_FUNCTION_TYPE=LOCAL
twenty-worker LOGIC_FUNCTION_TYPE=LOCAL
substrate-manager identity/roles valid
substrate-user identity/roles valid
```

The source/tooling batch is validated in GitHub before Windows execution.

The real Windows entrypoint is:

```powershell
.\infrastructure\local-uat\Invoke-GBAP-TwentyAiV241LiveIdentityF2.ps1 -AuthorizeExecute
```

No interactive deploy/fix/deploy loop is part of the gate. After this implementation batch is merged, the company server is updated once through the governed Local-UAT update path and F2 is executed once.

## 7. Explicit non-scope

F2 does not:

- reinstall or re-apply the Candidate B Twenty App;
- rerun Gate E1/E2;
- change Twenty database schema;
- change existing employee roles;
- disable existing employees;
- change real-company Knowledge ACLs;
- ingest real-company Knowledge;
- expose MCP;
- enable AI write tools;
- enable durable AI memory;
- enable multi-agent execution;
- select the PRIMARY runtime;
- authorize Production.

PRIMARY remains **NOT SELECTED**.

Production remains **NOT AUTHORIZED**.

## 8. Acceptance output

A successful real Windows run must include:

```text
TWENTY_AI_V241_LIVE_IDENTITY_F2_RESULT=PASS
TWENTY_AI_V241_LIVE_IDENTITY_F2_UNMAPPED_DENY=True
TWENTY_AI_V241_LIVE_IDENTITY_F2_DISABLED_DENY=True
TWENTY_AI_V241_LIVE_IDENTITY_F2_MANAGER_OWN_ALLOWED=True
TWENTY_AI_V241_LIVE_IDENTITY_F2_MANAGER_CROSS_DENIED=True
TWENTY_AI_V241_LIVE_IDENTITY_F2_USER_OWN_ALLOWED=True
TWENTY_AI_V241_LIVE_IDENTITY_F2_USER_CROSS_DENIED=True
TWENTY_AI_V241_LIVE_IDENTITY_F2_NEGATIVE_CITATION_LEAK=False
TWENTY_AI_V241_LIVE_IDENTITY_F2_SYNTHETIC_WITNESSES_CLEANED=True
TWENTY_AI_V241_LIVE_IDENTITY_F2_TEMP_IDENTITY_CLEANED=True
TWENTY_AI_PRIMARY_RUNTIME_SELECTED=false
TWENTY_AI_PRODUCTION_AUTHORIZED=false
```

Only after that evidence is accepted may F2 be closed and the next AI mainline become the same-task Candidate A vs Candidate B bake-off.


## 9. Accepted real Windows closure

F2 executed once on formal Windows Local-UAT from exact Git SHA:

```text
f0113f70b53ca0c4807dfdb1b8020f2de80d1354
```

Accepted machine-readable outputs:

```text
TWENTY_AI_V241_LIVE_IDENTITY_F2_LOGIC_FUNCTION_TYPE=LOCAL
TWENTY_AI_V241_LIVE_IDENTITY_F2_SYNTHETIC_WITNESSES_READY=True
TWENTY_AI_V241_LIVE_IDENTITY_F2_TEMP_TWENTY_IDENTITY_READY=True
TWENTY_AI_V241_LIVE_IDENTITY_F2_TEMP_TWENTY_IDENTITY_CLEANED=True
TWENTY_AI_V241_LIVE_IDENTITY_F2_SYNTHETIC_WITNESSES_CLEANED=True
TWENTY_AI_V241_LIVE_IDENTITY_F2_TEMP_IDENTITY_CLEANED=True
TWENTY_AI_V241_LIVE_IDENTITY_F2_RESULT=PASS
TWENTY_AI_V241_LIVE_IDENTITY_F2_UNMAPPED_DENY=True
TWENTY_AI_V241_LIVE_IDENTITY_F2_DISABLED_DENY=True
TWENTY_AI_V241_LIVE_IDENTITY_F2_MANAGER_OWN_ALLOWED=True
TWENTY_AI_V241_LIVE_IDENTITY_F2_MANAGER_CROSS_DENIED=True
TWENTY_AI_V241_LIVE_IDENTITY_F2_USER_OWN_ALLOWED=True
TWENTY_AI_V241_LIVE_IDENTITY_F2_USER_CROSS_DENIED=True
TWENTY_AI_V241_LIVE_IDENTITY_F2_NEGATIVE_CITATION_LEAK=False
TWENTY_AI_PRIMARY_RUNTIME_SELECTED=false
TWENTY_AI_PRODUCTION_AUTHORIZED=false
```

The governed Knowledge runtime start also proved:

```text
KNOWLEDGE_UAT_TEST=PASS
PROVIDER=ragflow-knowledge-uat
HEALTH=READY
```

This closes F2.

The earlier ad-hoc outer-shell readiness helper failed to dot-source `Knowledge-UAT.Common.ps1` under the caller's execution policy and therefore produced an unauthoritative 401 health attempt. It did not mutate F2 state. The governed Knowledge start script and the F2 gate itself supplied the accepted runtime and fixture evidence.

No active synthetic F2 Knowledge witness, temporary Twenty workspace member, temporary principal mapping, or temporary Keycloak identity remains.

The next legal AI mainline is the same-task Candidate A vs Candidate B bake-off. F2 closure alone does not select PRIMARY and does not authorize Production.
