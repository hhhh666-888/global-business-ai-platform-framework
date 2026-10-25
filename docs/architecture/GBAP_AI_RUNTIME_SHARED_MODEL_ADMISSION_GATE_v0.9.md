# GBAP AI Runtime Shared Model Admission Gate v0.9

Status: **IMPLEMENTATION CANDIDATE / LOCAL-UAT BAKE-OFF ONLY / PRIMARY NOT SELECTED / PRODUCTION NOT AUTHORIZED**

Date: 2026-09-21

Supersedes `GBAP_AI_RUNTIME_SHARED_MODEL_ADMISSION_GATE_v0.8.md` for the active Candidate B runtime-isolation contract. v0.8 remains immutable historical evidence.

## 0. REOPEN trigger

Real Windows v0.8 on exact main `28715212e7618010c138b05897b919b9373d0533` proved:

```text
source / PowerShell / tooling preflight           PASS
direct UTF-8 gate-file contract                   PASS
DeepSeek synthetic provider suite                 4/4 PASS
Twenty shared model                               PASS
RAGFlow native DeepSeek + toolCalling             PASS
same-model inventory                              PASS
fresh substrate-admin auth                        PASS
shared Knowledge queue governance                 PASS
temporary Twenty bridge identities                READY
synthetic witness A                               READY
synthetic witness B                               READY
Candidate A direct UTF-8 gate                     PASS
Candidate A runtime result                        PASS
```

Candidate B then entered its native Twenty v2.41 path for the first time and stopped in preflight:

```text
twenty_bakeoff_non_knowledge_tool_preflight_blocked
```

The returned Twenty catalog included:

- the required `app_search_gbap_knowledge` tool;
- built-in ACTION helper tools;
- many DATABASE_CRUD descriptors.

Cleanup then also reported:

```text
twenty_bakeoff_cleanup_failed:
role:twenty_graphql_200:INTERNAL_SERVER_ERROR
```

## 1. Source-audit finding: catalog visibility is not equivalent to authority

The frozen Candidate B architecture already says:

```text
Twenty native AI owns CRM reasoning / CRM tools
GBAP App adds one governed read-only external Knowledge tool
```

Therefore a temporary bake-off role must not require the physical Twenty catalog to contain exactly one entry.

Upstream Twenty tool-provider behavior also proves some ACTION descriptors are catalog-visible independently of role permission flags, including navigation/output/help-style native helpers. Their presence alone is not proof of mutation authority.

Conversely, DATABASE_CRUD descriptors are generated from resolved object permissions. Under the bake-off role, these remain forbidden because the role is intended to have zero object grants.

## 2. v0.9 Candidate B admission contract

Before an employee token is minted for Candidate B, the wrapper worker must prove through Twenty metadata GraphQL that the temporary role is effective for that exact temporary workspace member:

```text
canAccessAllTools                false
canReadAllObjectRecords          false
canUpdateAllObjectRecords        false
canSoftDeleteAllObjectRecords    false
canDestroyAllObjectRecords       false
permission flags                 exactly [AI]
positive object grants           0
workspace member                 present on exact temporary role
```

The role-state proof is polled boundedly after `updateWorkspaceMemberRole` so a successful mutation response alone is not treated as proof that authorization state is effective.

Only after this proof is accepted may the employee login token/access token be created.

## 3. Catalog preflight

The catalog must contain exactly one:

```text
app_search_gbap_knowledge
```

The catalog must contain zero:

```text
DATABASE_CRUD descriptors
permission-gated dangerous tools:
  http_request
  send_email
  draft_email
  find_connected_accounts
  create_calendar_event
  create_file_upload
  complete_file_upload
  code_interpreter
```

Twenty-native ambient ACTION helpers may remain visible. Their visibility is recorded in evidence but is not treated as execution authorization.

The bake-off still does not expose MCP externally. The loopback/internal `/mcp` call remains a UAT harness for catalog inspection only; Candidate B runtime execution remains Twenty AI Chat.

## 4. Actual-execution fail-closed contract

Every Candidate A/B chat result records its actual tool trace.

The deterministic evaluator rejects any actual tool execution whose name is mutation-like, including:

```text
create
update
delete
destroy
send
publish
shell
write
save
upload
upsert
```

This means an ambient tool being visible cannot silently become accepted mutation execution.

`mutationExecutionAllowed` remains false.

## 5. Cleanup root cause and v0.9 lifecycle

Twenty role deletion is not a raw row delete. Its service first rebinds role targets to the workspace default role before deleting the role.

The old bake-off cleanup did the reverse:

```text
delete temporary workspace member
-> delete temporary role
```

That can leave role-target lifecycle state pointing at a workspace member that has already been removed, after which `deleteOneRole` can fail during its rebind path.

v0.9 uses:

```text
clear exact temporary role permission flags
-> delete exact temporary role
-> let Twenty rebind live temporary members to default role
-> boundedly verify temporary role absent
-> delete temporary workspace members
-> delete exact principal mappings
-> verify no temporary role remains
```

Role deletion is bounded and idempotent for cleanup-only recovery.

## 6. Frozen boundaries unchanged

```text
DeepSeek model                         deepseek-flash
model fingerprint                      unchanged
RAGFlow provider                       DeepSeek
RAGFlow adapter                        RAGFLOW_NATIVE_DEEPSEEK
RAGFlow toolCalling                    true
Candidate A endpoint                   /api/v1/agents/chat/completions
Candidate B runtime                    Twenty v2.41 AI Chat
Candidate B external Knowledge tool    app_search_gbap_knowledge
real company Knowledge                 NOT AUTHORIZED
existing employee roles                NOT MUTATED
AI writes                              NOT ENABLED
external MCP                           NOT EXPOSED
multi-agent                            NOT ENABLED
durable AI memory                      NOT ENABLED
PRIMARY                                NOT SELECTED
Production                             NOT AUTHORIZED
```

## 7. RE-FREEZE condition

```text
focused exact-head CI PASS
-> merge
-> source-only Windows fast-forward
-> one bounded Shared Model admission
-> Knowledge witnesses READY
-> Candidate A PASS
-> Candidate B role-state proof PASS
-> Candidate B catalog boundary PASS
-> Candidate B AI Chat scenarios PASS
-> actual mutation-like tool executions = 0
-> Candidate B temporary role cleanup PASS
-> evaluator evidence PASS
-> all bounded fixtures cleanup PASS
-> deterministic PRIMARY / SPECIALIST closure
```

No PRIMARY or Production decision is implied by v0.9.
