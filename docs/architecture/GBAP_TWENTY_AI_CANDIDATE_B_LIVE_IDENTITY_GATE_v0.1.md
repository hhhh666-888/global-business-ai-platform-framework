# GBAP Twenty AI Candidate B v2.41 Live Identity Gate v0.1

Status: **F1 PASS / CLOSED / REAL WINDOWS PROOF ACCEPTED / F2 TOOLING IMPLEMENTED / REAL WINDOWS ONE-SHOT NEXT**

Date: 2026-09-21

Authority:
- docs/architecture/GBAP_TWENTY_AI_CANDIDATE_B_V241_PLAN_APPLY_GATE_v0.1.md
- docs/evidence/GBAP_TWENTY_AI_CANDIDATE_B_V241_GATE_E2_CLOSURE_2026-09-21.md
- docs/architecture/GBAP_TWENTY_AI_IDENTITY_BRIDGE_FOUNDATION_v0.1.md

## 1. Entry

Candidate B metadata installation is already PASS/CLOSED through the official Twenty v2.41 lifecycle.

F1 must not re-run plan/apply. It configures the two already-declared application server variables and proves one real mapped employee execution.

## 2. F1 allowed mutation

Only these existing application-registration variable values may be written:

~~~text
GBAP_AI_BRIDGE_URL   = http://gbap-ai-bridge:8081
GBAP_AI_BRIDGE_TOKEN = existing protected .runtime/twenty-ai-bridge-token
~~~

The write must use Twenty v2.41's official updateApplicationRegistrationVariable GraphQL mutation under the existing formal UAT owner identity. The mapped employee token is used only for the real tool execution, so configuration authority and employee execution authority are not conflated.
The secret value must never be printed or committed.

## 3. F1 live proof

The live validator must prove:

~~~text
exact current main
-> formal Twenty health
-> existing application registration
-> official server-variable configuration
-> existing principal_provider_mapping for substrate-admin
-> deterministic existing Twenty bridge identity login
-> exact workspaceId/userWorkspaceId/workspaceMemberId claim match
-> authenticated Twenty native tool registry
-> get_tool_catalog discovers app_search_gbap_knowledge
-> execute_tool dispatches app_search_gbap_knowledge
-> Twenty ToolExecutorService -> LogicFunctionExecutorService
-> search-gbap-knowledge
-> canonical GBAP identity bridge
-> canonical searchKnowledge()
-> at least one Knowledge result
-> at least one canonical citation
-> every citation backed by returned answerContext
~~~

No new employee identity master is created.

## 4. Explicit F1 non-scope

F1 does not:

- disable or enable any Keycloak employee;
- create or edit Knowledge ACL;
- create a second test identity;
- select the PRIMARY runtime;
- expose MCP;
- enable AI write tools;
- authorize Production.

## 5. F2

F2 remains separately gated. Its bounded design/tooling is defined in `GBAP_TWENTY_AI_CANDIDATE_B_F2_NEGATIVE_IDENTITY_ACL_GATE_v0.1.md` and will prove:

~~~text
unmapped employee deny
disabled employee deny
two-employee Knowledge ACL isolation
negative citation/authorization behavior
~~~

F2 is not authorized by F1 tooling. Its own one-shot Windows entrypoint requires explicit `-AuthorizeExecute` after the F2 source/contract batch is accepted and merged.

## 6. Windows entrypoint

infrastructure/local-uat/Invoke-GBAP-TwentyAiV241LiveIdentityF1.ps1

Real configuration requires the explicit -AuthorizeConfigure switch.

Production remains **NOT AUTHORIZED**.


## 7. First real F1 attempt and bounded correction

The first real Windows execution reached the live validator and failed before application-variable configuration with:

```text
f1_ready_knowledge_not_found
```

This is not a RAGFlow health failure and not an identity failure. The accepted Knowledge recovery evidence restores the pre-proof baseline after deleting its synthetic dataset, while real-company Knowledge ingestion remains separately gated. Therefore F1 cannot assume that a READY Knowledge document already exists.

The bounded retry now creates a temporary **synthetic / non-company** Knowledge witness through the canonical GBAP Knowledge API:

```text
substrate-admin canonical token
-> temporary PRIVATE collection
-> temporary text document
-> wait READY
-> pass exact collectionId + unique marker query to Candidate B
-> Twenty native tools/call -> execute_tool -> app_search_gbap_knowledge
-> canonical bridge/searchKnowledge/RAGFlow
-> require results and canonical citations only from that witness collection
-> archive document
-> archive collection
```

This correction:

- does not ingest real company Knowledge;
- does not change Knowledge ACL;
- does not create a second identity;
- does not run full Knowledge backup/restore;
- does not reopen Gate E2;
- leaves no active synthetic F1 document/collection after a successful or failed tool attempt where cleanup is available.

F1 still requires explicit `-AuthorizeConfigure`. PRIMARY and Production remain unauthorized.


## 8. Second real F1 attempt — wrong execution surface identified

The second real Windows F1 attempt proved:

```text
synthetic witness READY                  true
synthetic witness CLEANED                true
application server variables configured true
mapped employee login/claims             passed
executeOneLogicFunction                  FORBIDDEN
```

The failure is expected for a least-privilege employee: Twenty v2.41 protects the metadata GraphQL mutation `executeOneLogicFunction` with the `WORKFLOWS` settings permission. That mutation is a settings/test execution surface, not the runtime path used by Twenty AI tools.

The upstream native tool path is:

```text
toolTriggerSettings
-> LogicFunctionToolProvider
-> ToolRegistryService
-> ToolExecutorService
-> LogicFunctionExecutorService.execute(...)
```

This path carries `userId + userWorkspaceId` and resolves `workspaceMemberId` for the acting person without granting the user the WORKFLOWS settings permission.

F1 therefore uses Twenty's existing authenticated internal `/mcp` JSON-RPC endpoint only as a **UAT harness** to reach the same native ToolRegistry/ToolExecutor dispatcher:

```text
tools/call get_tool_catalog
-> prove app_search_gbap_knowledge is discoverable
-> tools/call execute_tool
-> app_search_gbap_knowledge
-> ToolExecutorService
-> LogicFunctionExecutorService
```

This does **not** enable or expose MCP externally. Twenty remains loopback-bound on the Windows host and no MCP configuration, OAuth client, public route, firewall rule, or product capability is added. Product status remains `MCP NOT EXPOSED`.

No WORKFLOWS permission is added to the mapped employee.


## 9. Third real F1 attempt — Twenty production-default driver disabled

The third real Windows F1 attempt advanced through the native Twenty tool dispatcher and failed with:

```text
f1_native_tool_execution_failed:
Logic function execution is disabled.
Set LOGIC_FUNCTION_TYPE to LOCAL or LAMBDA to enable.
```

This proves:

```text
synthetic Knowledge witness          READY
native tool discovery                PASS
execute_tool dispatch                reached
installed Candidate B logic function reached
logic-function driver                DISABLED
synthetic witness cleanup            PASS
```

Twenty v2.41 intentionally defaults `LOGIC_FUNCTION_TYPE` to `DISABLED` when `NODE_ENV=production`. Upstream self-hosting guidance permits:

- `LOCAL` for development / trusted environments;
- `LAMBDA` for production isolation of untrusted code.

The formal GBAP Windows Local-UAT uses only reviewed, governed GBAP Candidate B code and Production remains separately unauthorized. Therefore Local-UAT admits:

```text
LOGIC_FUNCTION_TYPE=LOCAL
```

through the governed Local-UAT compose anchor shared by `twenty-server` and `twenty-worker`.

This is **not** a Production architecture decision. Production must reopen security/runtime admission and must not silently inherit the Local-UAT driver choice.

The F1 wrapper now checks the live server and worker container values before creating a synthetic Knowledge witness. If either container is not actually running with `LOCAL`, F1 fails early with:

```text
F1_TWENTY_LOGIC_FUNCTION_TYPE_NOT_LOCAL
```

No Twenty reinstall, Gate E2 reopen, database mutation, ACL mutation, employee-role expansion or new backup is required.


## 10. Fourth real F1 attempt — PASS / CLOSED

The accepted real Windows F1 execution ran from:

```text
Git SHA                                    077d4a3446bdcd1b10d9a4fc0d72e890142d04f9
Twenty server LOGIC_FUNCTION_TYPE          LOCAL
Twenty worker LOGIC_FUNCTION_TYPE          LOCAL
synthetic Knowledge witness                READY
application server variables configured   true
mapped employee tool execution             true
Knowledge results                          1
canonical citations                        1
citation backed by answerContext           true
synthetic witness cleanup                  true
F2 authorized                              false
PRIMARY runtime selected                   false
Production authorized                      false
```

Accepted machine-readable wrapper result:

```text
TWENTY_AI_V241_LIVE_IDENTITY_F1_RESULT=PASS
TWENTY_AI_V241_LIVE_IDENTITY_F1_GIT_SHA=077d4a3446bdcd1b10d9a4fc0d72e890142d04f9
TWENTY_AI_V241_LIVE_IDENTITY_F1_SERVER_VARIABLES_CONFIGURED=True
TWENTY_AI_V241_LIVE_IDENTITY_F1_MAPPED_EMPLOYEE_TOOL=True
TWENTY_AI_V241_LIVE_IDENTITY_F1_KNOWLEDGE_RESULTS=1
TWENTY_AI_V241_LIVE_IDENTITY_F1_CITATIONS=1
TWENTY_AI_V241_LIVE_IDENTITY_F1_CITATION_BACKING=True
TWENTY_AI_V241_LIVE_IDENTITY_F1_SYNTHETIC_WITNESS=True
TWENTY_AI_V241_LIVE_IDENTITY_F1_SYNTHETIC_WITNESS_CLEANED=True
TWENTY_AI_V241_LIVE_IDENTITY_F2_AUTHORIZED=false
TWENTY_AI_PRIMARY_RUNTIME_SELECTED=false
TWENTY_AI_PRODUCTION_AUTHORIZED=false
```

This closes F1.

The accepted proof establishes that the existing mapped employee can reach the installed Candidate B Knowledge tool through Twenty's native tool registry/executor path, cross the canonical GBAP identity bridge, retrieve from canonical Knowledge, and return a citation backed by the returned answer context.

The pre-run recovery of stopped Local-UAT core services (API, Keycloak and Web gateway) is operational runtime state, not an F1 product defect. No destructive data action, reinstallation, Gate E2 reopen, Knowledge ACL mutation, role escalation, external MCP exposure, PRIMARY selection or Production authorization occurred.

F2 remains separately gated. The bounded F2 design/tooling is now implemented for:

```text
unmapped employee deny
disabled employee deny
two-employee Knowledge ACL isolation
negative citation / authorization behavior
```

The F2 implementation uses reversible fixtures and focused source/contract CI. After that batch is accepted and merged, the next legal action is one real Windows F2 execution; PRIMARY and Production remain unchanged.
