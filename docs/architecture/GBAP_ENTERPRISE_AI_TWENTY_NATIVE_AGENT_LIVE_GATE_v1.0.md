# GBAP Enterprise AI｜Twenty Native CRM Agent Live Gate v1.0

Status: ACTIVE / LOCAL-UAT ONLY / PRODUCTION NOT AUTHORIZED

## Purpose

This Gate closes the gap between:

1. Twenty CRM context Tool execution being healthy; and
2. Twenty native Agent reasoning actually executing through `runAgent()` with the admitted enterprise model.

A source/plan/model-inventory PASS is not sufficient evidence for employee readiness.

## Required runtime path

```text
mapped ordinary employee
  -> Twenty MCP execute_tool
  -> app_read_gbap_crm_context
  -> one authorized read-only company context
  -> app_run_gbap_crm_specialist
  -> runAgent()
  -> GBAP CRM Specialist Agent
  -> gbap-enterprise-deepseek/deepseek-flash
  -> substantive read-only response
```

The Gate runs after the official Twenty Enterprise AI v2 apply converges and before broad Enterprise AI Final Live UAT.

## Preconditions

- governed UAT update = PASS at exact current `main`;
- Twenty Enterprise AI v2 official apply evidence = PASS at that SHA;
- permanent Enterprise AI model admission = PASS;
- Twenty model ID = `gbap-enterprise-deepseek/deepseek-flash`;
- Twenty and GBAP API health checks pass;
- ordinary employee principal mapping exists.

## Execution boundary

The Gate performs one bounded `CUSTOMER_SUMMARY` model call using one already-authorized company record as data.

It MUST NOT:

- call DeepSeek directly;
- call the public GBAP `/api/ai/execute` route;
- create/update/delete CRM records;
- create Tasks or Notes;
- save/send Mail;
- enable external MCP;
- enable Production.

The Agent remains `TWENTY_AGENT_NO_REGISTRY_TOOLS`.

## Failure evidence

The worker classifies failures into bounded categories:

- `CREDITS_OR_QUOTA`
- `PERMISSION`
- `MODEL_OR_PROVIDER`
- `TIMEOUT`
- `IDENTITY`
- `TRANSPORT`
- `AGENT_RUNTIME`
- `UNCLASSIFIED`

The Windows Gate writes:

- `.runtime/enterprise-ai-twenty-native-agent-live.txt`
- `.runtime/enterprise-ai-twenty-native-agent-server-diagnostic.txt`

If native execution fails, the second file is collected automatically from the same Twenty server/worker time window and redacted for Bearer/API token/secret patterns.

## Admission order

```text
mutation-free plan
-> permanent model admission
-> RAGFlow Lead/provider reconcile
-> Twenty Enterprise AI v2 official apply
-> THIS NATIVE AGENT LIVE GATE
-> broad Enterprise AI Final Live
```

Broad Final Live must never be the first place where `runAgent()` is exercised.

## PASS criteria

- both required Twenty app tools are discoverable;
- ordinary employee context Tool returns at least one real read-only company record;
- `app_run_gbap_crm_specialist` executes successfully;
- real `runAgent()` + admitted model execution occurs;
- response is substantive;
- execution mode is `TWENTY_AGENT_NO_REGISTRY_TOOLS`;
- no CRM mutation is requested;
- Production remains unauthorized.

## Production

This Gate authorizes no Production action.
