# GBAP GBAP｜Knowledge Assistant Generative Provider Gate v0.1

Status: **PROVIDER BOUNDARY IMPLEMENTED / REAL PROVIDER NOT SELECTED**

Date: 2026-09-19

## 0. Authority and purpose

This Gate starts after:

`docs/architecture/GBAP_KNOWLEDGE_RAGFLOW_INTEGRATION_GATE_v0.7.md`

Gate v0.7 closes the retrieval/runtime/recovery line. This Gate defines the separate answer-generation boundary for 企业知识助手 without reopening the frozen retrieval model or turning any model vendor into a platform authority.

The generative contract is:

`gbap.generative.v1`

This contract is intentionally separate from:

`gbap.knowledge.v1`

## 1. Permanent separation

```text
Knowledge retrieval authority
  GBAP ACL
  -> gbap.knowledge.v1
  -> frozen GTE retrieval
  -> canonical GBAP Knowledge results

Answer generation
  authorized GBAP retrieval results only
  -> gbap.generative.v1
  -> replaceable answer provider
  -> answer + temporary contextRef citations
  -> GBAP canonical citation mapping
```

A generative provider must never receive authority to search the full Knowledge corpus directly.

## 2. Native employee path

The only admitted employee-facing answer path is:

```text
Employee browser
-> GBAP /api/knowledge/answer
-> Keycloak authentication
-> GBAP Knowledge collection/document ACL
-> authorized Knowledge search
-> bounded authorized contexts
-> generative.v1.answer provider
-> validate answer citations against issued contextRef values
-> map citations to canonical KnowledgeDocument/Version/Chunk IDs
-> return grounded answer
```

Direct browser invocation of `generative.v1.*` through the generic capability endpoint is forbidden.

## 3. Contract capabilities

Initial provider-neutral capabilities:

```text
generative.v1.health
generative.v1.answer
```

Initial `generative.v1.answer` request payload:

```json
{
  "question": "string",
  "contexts": [
    {
      "contextRef": "context-1",
      "text": "authorized retrieved text only",
      "sourceTitle": "optional display title",
      "page": 1,
      "section": "optional"
    }
  ]
}
```

The provider receives temporary request-scoped `contextRef` values, not canonical/provider storage identities.

Initial response contract:

```json
{
  "answer": "string",
  "citations": ["context-1"]
}
```

GBAP rejects responses with missing/unknown citation references.

## 4. Data minimization

The generative provider must not receive these fields as answer context:

- RAGFlow dataset/document/chunk IDs;
- provider mappings;
- canonical Knowledge collection/document/version IDs;
- GBAP chunk hashes;
- provider provenance;
- employee subject or username.

The answer provider receives only the minimum authorized text/display metadata required to generate a grounded response.

Provider adapters may internally add provider/model configuration required for their own invocation, but that configuration remains server-side and must not be returned as product authority.

## 5. Grounding / fail-closed behavior

```text
no authorized retrieval result
-> do not invoke answer model
-> answer=null
-> citations=[]
-> grounded=false
-> reason=NO_AUTHORIZED_CONTEXT
```

```text
answer provider cites unknown contextRef
-> reject provider response
-> no answer returned
```

```text
generative provider unavailable
-> /api/knowledge/answer fails closed
-> native Knowledge retrieval remains independently usable
```

Retrieval availability must not depend on answer-generation availability.

## 6. Provider registration boundary

Providers exposing `generative.v1.*` capabilities must register with:

`provenance.contractVersion = gbap.generative.v1`

Registration with another contract version must fail.

Provider registry controls remain reusable:

- environment/organization/workspace scope;
- priority/capability binding;
- lifecycle owner;
- replacement class/evidence;
- secretRef;
- egress allowlist;
- timeout/retry;
- failure mode;
- upstream provenance.

No second model registry is introduced.

## 7. Security and product boundary

```text
provider endpoint/token in browser             FORBIDDEN
direct model access from browser              FORBIDDEN
direct RAGFlow access from generative model   FORBIDDEN
ACL after generation                          FORBIDDEN
generation without authorized context         FORBIDDEN
provider citation IDs as product citations    FORBIDDEN
provider/model as Knowledge system of record  FORBIDDEN
```

Audit records metadata such as provider IDs, collection IDs, context/citation counts and question length. The boundary does not require storing raw prompts or generated answers in audit events.

## 8. Acceptance contract

The boundary is accepted only when the focused test proves:

1. wrong generative contract registration fails;
2. generic/browser direct `generative.v1.*` invocation is denied;
3. authorized user receives a grounded answer;
4. unauthorized user is rejected before generation;
5. answer provider receives only bounded authorized context;
6. employee identity is not disclosed to the generative provider;
7. provider receives no canonical/provider Knowledge IDs;
8. unknown provider citation references are rejected;
9. zero authorized context skips generation;
10. retrieval remains healthy when the generative provider is unavailable;
11. canonical citations returned to the employee preserve Knowledge document/version identity.

Acceptance fixture:

`tests/substrate/knowledge-generative-provider-self-test.mjs`

The fixture uses a fake generative provider. Passing this Gate does **not** select or qualify a real answer model.

## 9. Current provider/model decision

```text
real generative provider     NOT SELECTED
real answer model            NOT SELECTED
Ollama                       NOT SELECTED / NOT CONFIGURED
cloud model                  NOT SELECTED
local model                  NOT SELECTED
Production                   NOT AUTHORIZED
```

The frozen GTE retrieval configuration remains unchanged.

## 10. Next legal action

After this boundary passes focused CI:

1. define the real-provider evaluation criteria under `gbap.generative.v1`;
2. compare candidate local/cloud answer providers on the company UAT constraints;
3. select one UAT answer provider only after evidence;
4. build the provider adapter without changing the employee-facing contract;
5. prove `question -> ACL -> frozen GTE retrieval -> real answer model -> canonical citations`;
6. separately govern any bounded real-company Knowledge batch;
7. keep Production NOT AUTHORIZED.

Ollama may be evaluated only as one possible headless/replaceable runtime. It is not a prerequisite and is not selected by this Gate.
