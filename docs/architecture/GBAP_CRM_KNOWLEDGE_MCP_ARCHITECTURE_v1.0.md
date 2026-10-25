# GBAP CRM + Enterprise Knowledge + MCP Architecture v1.0

**Status:** CURRENT SIMPLIFICATION AUTHORITY  
**Date:** 2026-09-28  
**Scope:** product/runtime boundary after retirement of the built-in AI Control Plane

## 1. Decision

GBAP no longer owns an employee-facing generative AI runtime.

The product keeps the business systems that already have durable value:

- CRM: GBAP product UI + Twenty v2.41 provider
- Enterprise Knowledge: GBAP knowledge UI + RAGFlow v0.27.2 provider
- Identity and authorization: Keycloak + existing GBAP ACL/capability boundaries
- Provider Registry, durable business IDs, mappings, provenance, audit, backup/restore
- GBAP internal calendar, tasks, notes, files and other stable CRM collaboration features

The following built-in AI line is retired from the normal runtime:

- GBAP AI Control Plane
- employee AI Assistant UI
- model/provider admission as a product dependency
- Twenty CRM AI specialist / native Agent execution
- RAGFlow Enterprise Lead / AI orchestration provider
- built-in generative routing, conversations, model budgets and AI approval orchestration

The former external Email / Gmail / Microsoft mail-calendar integration is also retired. This includes the employee Mail UI, OAuth callbacks, attachment gateway, per-user Twenty shadow identities, mail Provider Registry entries and the 8094 mail runtime. The GBAP internal calendar remains active and is independent of those retired integrations.

Historical architecture/evidence files remain historical records. They are not current runtime authority.

## 2. New product boundary

```text
GBAP employee browser
        |
        v
GBAP Web / API / Keycloak
        |
        +--------------------+
        |                    |
        v                    v
CRM capabilities        Knowledge capabilities
        |                    |
        v                    v
Twenty v2.41            RAGFlow v0.27.2
(headless provider)     (headless provider)

External AI client / Agent
(WorkBuddy or another MCP client)
        |
        v
Authenticated MCP over HTTP
        |
        v
GBAP MCP Tool Registry
        |
        +------> same CRM capabilities
        |
        +------> same Knowledge APIs
```

MCP is an adapter over existing governed business APIs. It is not a second business system and it does not receive direct database/provider access.

## 3. MCP v1 contract

Endpoint:

```text
POST /api/mcp
```

Direct API deployments may also accept:

```text
POST /mcp
```

Transport is stateless HTTP JSON-RPC compatible with common Streamable HTTP MCP clients.

MCP v1 tools are deliberately read-only:

| Tool | Backing GBAP authority |
| --- | --- |
| `crm_company_list` | `crm.v1.account.list` |
| `crm_contact_list` | `crm.v1.contact.list` |
| `crm_opportunity_list` | `crm.v1.opportunity.list` |
| `crm_task_list` | `crm.ops.v1.task.list` |
| `crm_note_list` | `crm.ops.v1.note.list` |
| `crm_activity_list` | `crm.ops.v1.activity.list` |
| `knowledge_search` | `POST /api/knowledge/search` |

Not exposed in MCP v1:

- CRM create/update/delete
- email / mail tools of any kind (the GBAP mail feature is retired)
- external calendar-provider tools
- internal calendar mutation in MCP v1
- provider administration
- identity administration
- backup/restore
- raw Twenty or RAGFlow APIs
- model execution
- arbitrary shell/browser/tool execution

Write tools may be considered later as a separate governed version. They are not implied by MCP v1.

## 4. Identity and authorization

MCP requests require a GBAP Keycloak Bearer token.

The MCP gateway forwards the same authenticated user context into the existing GBAP capability/API path. Therefore:

- MCP cannot bypass GBAP role checks.
- Knowledge search remains constrained by the existing collection/document ACL.
- CRM visibility remains the same as the signed-in GBAP user.
- Provider credentials are never returned to the MCP client.
- MCP does not talk directly to Twenty or RAGFlow.

Initial external-client setup may use an explicitly supplied Bearer token. A browser OAuth handoff can be added later without changing the tool contract.

## 5. Runtime retirement behavior

Normal Local-UAT startup:

1. starts Keycloak, GBAP API/Web, Twenty and normal provider adapters;
2. registers only the canonical Twenty CRM provider;
3. disables and, when safe, unregisters legacy built-in AI and mail Provider Registry entries;
4. starts RAGFlow as Enterprise Knowledge only;
5. does not provision the RAGFlow Enterprise Lead;
6. does not register an AI orchestration provider;
7. does not load Twenty `AI_PROVIDERS`;
8. does not mount an AI bridge token or AI-only network;
9. does not start the retired mail runtime, OAuth routes or mail Provider bootstrap;
10. keeps the GBAP internal calendar as a native business feature.

Legacy provider IDs explicitly retired by the transition are:

- `twenty-crm-ai-uat`
- `ragflow-agent-uat`
- `twenty-mail-calendar-user-uat`
- `twenty-mail-calendar-sync-uat`
- `twenty-mail-usability-uat`
- `twenty-mail-real-uat`
- `twenty-mail-workspace-v2-uat`
- `twenty-mail-workspace-runtime-uat`
- `twenty-mail-calendar-working-uat`
- `twenty-mail-attachment-working-uat`
- `twenty-mail-calendar-complete-uat`

Provider deletion remains fail-safe: when Registry deletion is blocked by durable mappings, the provider remains disabled.

## 6. Operational principle

The platform now follows:

```text
BUSINESS SYSTEMS FIRST
STABLE API FIRST
MCP AS A THIN ADAPTER
EXTERNAL AGENT CHOICE BELONGS TO THE OPERATOR
NO BUILT-IN MODEL DEPENDENCY
```

A WorkBuddy, Claude-compatible client, Codex-compatible client, or another MCP-capable Agent can use the same governed CRM/Knowledge tools without forcing GBAP to own a model runtime or Agent framework.

## 7. Deployment gate

This architecture is not Production authorization.

Before company deployment, the branch must prove:

- Web build succeeds without the retired AI surface.
- API source syntax passes.
- MCP contract test passes.
- canonical CRM UAT passes.
- Knowledge runtime/UAT passes.
- retained-state startup successfully retires old AI and mail providers.
- MCP calls return only data visible to the same GBAP identity.
- backup/restore remains valid with the simplified runtime.
