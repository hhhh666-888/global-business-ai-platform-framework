# GBAP GBAP｜Enterprise AI Implementation Audit v1.0

Status: **AUTHORITATIVE IMPLEMENTATION TRUTH / POST-DESIGN AUDIT**

Date: 2026-09-22

Architecture authority:

- `docs/architecture/GBAP_ENTERPRISE_AI_CONTROL_PLANE_ARCHITECTURE_v1.1.md`

This document answers one question only:

> How much of the frozen Enterprise AI architecture is actually implemented and proven today?

It must be used together with the architecture authority so future sessions do not confuse **designed**, **implemented**, **source-proven**, **live-proven**, and **employee-ready**.

---

## 1. Overall verdict

The architecture direction is intact.

The complete Enterprise AI product path is now **source-implemented across A-K**, but it is **not yet live-admitted**. Final employee readiness still requires exact-head CI, one governed Windows deployment/apply, real Tier-1/Tier-2/Tier-3/approval UAT, and the final product/browser smoke.

Current maturity:

```text
Architecture direction                     FROZEN
AI Control Plane foundation                IMPLEMENTED
Tier-0 employee direct-tool tasks           SOURCE IMPLEMENTED / FINAL LIVE GATE PENDING
Unified specialist executor                SOURCE IMPLEMENTED / FINAL LIVE GATE PENDING
Tool Gateway                               READ + APPROVAL-GATED LOW-RISK WRITES
Deterministic dominant-domain routing       IMPLEMENTED
CRM natural-language reasoning             SOURCE IMPLEMENTED / FINAL LIVE GATE PENDING
Knowledge domain reasoning                 SOURCE IMPLEMENTED / FINAL LIVE GATE PENDING
Tier-2 CRM + borrowed Knowledge E2E         SOURCE IMPLEMENTED / FINAL LIVE GATE PENDING
Tier-3 RAGFlow Lead/SubAgent E2E            SOURCE IMPLEMENTED / FINAL LIVE GATE PENDING
Sales specialist profile                   SOURCE IMPLEMENTED
Energy specialist profile                  SOURCE IMPLEMENTED
External research specialist               REGISTERED / NOT ADMITTED WITHOUT GOVERNED PROVIDER
Employee AI Assistant UI                    SOURCE IMPLEMENTED / BROWSER + LIVE GATE PENDING
Conversation / execution history           SOURCE IMPLEMENTED
Approval-gated Task/Note/Draft writes       SOURCE IMPLEMENTED / FINAL LIVE GATE PENDING
Daily request/model-call governance         SOURCE IMPLEMENTED / PROVIDER COST DATA UNAVAILABLE
External GBAP MCP                           NOT EXPOSED BY POLICY
Autonomous high-risk actions                DISABLED
Production                                  NOT AUTHORIZED
```

The source tree is now **product-path complete, live-admission pending**.

---

## 2. A -> K implementation audit

| Step | Frozen architecture requirement | Current status | Evidence / gap |
|---|---|---|---|
| A | Freeze v1.0 architecture | **PASS / FROZEN** | Enterprise AI Control Plane v1.0 is the cross-session authority |
| B | Machine-testable Capability Registry | **PASS** | `ai-capability-registry.mjs`; read Tools are executable; Domain AI entries now expose truthful readiness |
| C | Deterministic route contract | **PASS / EXECUTION ENTRY ADDED** | Tier 0-3 route planning exists; employee AI Assistant now exposes deterministic Customer Lookup + Knowledge Search with `modelCalls=0`; `POST /api/ai/execute` executes Tier-0/Tier-1/Tier-2/Tier-3 source paths |
| D | CRM-only route has zero RAGFlow Lead selection | **PASS AS ROUTE CONTRACT** | router returns Twenty ownership and `ragflowLeadRequired=false`; Tier-1/Tier-2 source tests confirm no RAGFlow Lead path is called |
| E | Bounded read-only Twenty CRM capabilities | **SOURCE PASS / FINAL RUNTIME GATE PENDING** | canonical CRM context plus bounded native CRM read Tool exists; no write authority added |
| F | Employee-scoped CRM specialist | **SOURCE IMPLEMENTED / FINAL RUNTIME GATE PENDING** | employee mapping + Keycloak revalidation + controlled Twenty native Agent execution are implemented; final integrated live admission remains pending |
| G | Tier-2 borrowed Knowledge from CRM owner | **SOURCE IMPLEMENTED / FINAL RUNTIME GATE PENDING** | Twenty remains owner, bounded `knowledge.search` context is borrowed, citations are carried, and no RAGFlow Lead path is selected in source E2E tests |
| H | Bounded specialist packets to RAGFlow orchestration | **SOURCE IMPLEMENTED / FINAL LIVE GATE PENDING** | GBAP executes Twenty CRM specialist first and hands a bounded CRM evidence packet to RAGFlow Lead; RAGFlow receives no direct CRM authority |
| I | True Tier-3 cross-domain E2E | **SOURCE IMPLEMENTED / FINAL LIVE GATE PENDING** | Control Plane builds independent CRM + Knowledge packets, invokes `ai.orchestration.v1.run`, and RAGFlow native Lead/SubAgents perform evidence review/challenge/synthesis |
| J | Future specialists by registration | **SOURCE IMPLEMENTED** | Sales + Energy profiles are registered/composed over admitted owners; Research is registered but correctly NOT_ADMITTED until a governed live research provider exists |
| K | Mutation / approval automation | **SOURCE IMPLEMENTED / FINAL LIVE GATE PENDING** | bounded Task/Note/Mail-Draft writes require explicit original-employee confirmation; autonomous high-risk actions remain disabled |

---

## 3. Control Plane audit

### Implemented

```text
Keycloak JWT authentication
role admission
Capability Registry
read-only Tool Registry
deterministic route planning
read-only Tool invocation
Knowledge ACL inheritance
provider-internal field stripping
route/tool audit events
timeouts / body bounds
fail-closed unknown Tools
```

### Newly source-implemented in Enterprise AI Completion Batch 1

```text
POST /api/ai/execute
CRM Tier-1 reasoning owner
Knowledge Tier-1 execution
CRM Tier-2 + borrowed Knowledge
canonical customer-progress context assembly
```

### Source-implemented completion surfaces

```text
POST /api/ai/execute unified executor
CRM / Knowledge / Complex execution modes
private employee conversations and execution history
daily request + reserved model-call budgets
approval state machine
approval-gated CRM task / note / mail draft writes
employee AI Assistant workbench
RAGFlow native Lead/SubAgent orchestration
sales + energy composed specialist profiles
```

Ambiguous routing remains **deterministic-first and user-overridable by design**. GBAP does not add an always-on router LLM where task, customer context or explicit mode already resolves the domain; unresolved requests fail closed.

The source tree is therefore a **complete pre-deployment Enterprise AI product path**, but runtime admission remains pending until the final integrated UAT.

---

## 4. Capability truth

Current executable read Tools include:

- CRM company/contact/opportunity;
- CRM task/note/activity;
- Knowledge search;
- Calendar read;
- Mail read.

Current specialist registry truth:

```text
crm.specialist                  EXECUTABLE source path
knowledge.specialist            EXECUTABLE source path
orchestration.cross-domain      EXECUTABLE source path
sales.specialist                EXECUTABLE composed CRM profile
energy.specialist               EXECUTABLE Knowledge profile
research.specialist             NOT_ADMITTED (no governed live provider)
```

`EXECUTABLE` means a concrete source execution path exists and is machine-tested. It does not mean final company-UAT admission has already passed.

---

## 5. Twenty CRM Specialist audit

### Implemented

- supported Twenty v2.41 App;
- explicit Company/Person/Opportunity READ-only App permissions;
- every broad/write/delete permission false;
- exact employee mapping -> Keycloak revalidation bridge;
- App machine token is not employee authority;
- `CoreApiClient.query` only;
- no `.mutation()`;
- no `runAgent`;
- no application impersonation;
- no Twenty record ID returned;
- bounded result count.

### Agent tool-surface verification

Twenty upstream v2.41 Agent execution resolves Registry tools exclusively from the Agent permission-tab role. The upstream executor states: **"No role means no registry tools."**

The GBAP CRM Agent manifest is therefore required to satisfy all three conditions together:

- `roleUniversalIdentifier = null`;
- `webSearch = false`;
- the CRM reasoning Logic Function contains no mutation path.

The native App build Gate checks those manifest/source facts. CRM and Knowledge evidence are supplied by GBAP as bounded context; the Agent does not receive direct CRM Registry authority. This is materially different from the previously rejected open-ended Twenty AI Chat/catalog path.

### Current progress-context implementation

The provider-native `read-gbap-crm-context` remains deliberately narrow, but the unified executor assembles canonical employee-authorized Account, Contact, Opportunity, CRM Activity, Customer Intelligence and Opportunity trade/business context before CRM reasoning. Tier-2 can additionally borrow governed Knowledge with citations.

Therefore the source path for "current progress + verified product knowledge -> development email" is implemented; final real quality/admission is reserved for the integrated Windows live gate.

---

## 6. RAGFlow audit

Implemented component-level runtime:

- Knowledge/RAG Provider;
- enterprise retrieval;
- `/agent/run` adapter;
- RAGFlow Agent contract;
- reusable native Agentbot endpoint;
- delegated bearer support.

Unified Enterprise AI source wiring now exists. Tier-1 Knowledge uses governed retrieval + `gbap.generative.v1`. Tier-3 executes Twenty CRM reasoning and Knowledge reasoning independently, then passes only bounded evidence packets through `ai.orchestration.v1.run` to the RAGFlow Enterprise Lead and its CRM Evidence, Knowledge Evidence and Strategy Challenger child Agents. RAGFlow receives no direct CRM credential or unrestricted CRM Tool.

---

## 7. Generative model audit

`gbap.generative.v1` and shared-model admission work exist.

DeepSeek has accepted UAT/bake-off evidence.

The source executor now invokes real Domain-AI provider boundaries: Knowledge uses `gbap.generative.v1` and CRM uses `gbap.crm-ai.v1`. Exact provider/model availability is a runtime fact verified by the final company-UAT live gate.

---

## 8. Employee product/UI audit

The employee-facing **AI 助手** workbench is source-implemented in the main GBAP navigation with task presets, customer search/selection, zh/en/es output, conversations, citations, Tier/owner visibility, Knowledge/Lead indicators, governance meters, execution history and pending approvals. Proposed actions remain bound to the customer that produced the result. Browser and final live admission are still required.

---

## 9. Cross-domain / Multi-Agent audit

Current design is correct:

```text
Tool first
-> one Domain AI
-> dominant Domain AI + borrowed Tool
-> only then Multi-Agent
```

Tier-2 source E2E and Tier-3 bounded-packet orchestration are implemented. Sales/Energy composed profiles are registered. Research remains fail-closed because no governed live research provider is configured. No third generic GBAP Agent runtime has been built.

---

## 10. Governance / security audit

### Correctly closed / bounded

- autonomous high-risk AI actions;
- email send / quotation publication / destructive customer actions;
- external MCP;
- Production;
- direct provider-admin authority;
- generic third Agent runtime;
- unrestricted Twenty CRUD.

Low-risk Task / Note / Mail-Draft writes are reopened only behind explicit original-employee confirmation.

### Implemented safeguards

- employee identity;
- role checks;
- Knowledge ACL;
- provider mapping;
- bounded tool inputs;
- audit events;
- fail-closed unknown/unsupported Tool behavior;
- least-privilege CRM App role.

### Source-implemented governance

- private employee conversations/messages and execution history;
- daily request and reserved model-call limits;
- approval state machine with expiry and replay prevention;
- actor-scoped approval visibility;
- explicit confirmation before low-risk writes;
- temporary final-UAT writes are cleaned after verification.

Provider-standardized monetary cost and full per-SubAgent telemetry are not available from the current contracts; GBAP reports them as unavailable rather than inventing values.

---

## 11. Windows UAT reverse audit findings

The first real CRM Specialist pre-apply run produced:

```text
main             e7a37a8245e217ab24a2f146b512adc709955bc9
platform update  PASS
plan actions     5
create           4
update           1
delete           0
unexpected       3
apply            NOT EXECUTED
live             correctly refused
```

Root cause:

Twenty v2.41 emits each role object grant as a separate official `objectPermission` metadata action.

Correction:

- allow only `logicFunction / role / objectPermission`;
- pre-apply objectPermission count = exactly 3;
- targets must exactly match the three manifest-declared CRM objects;
- READ=true;
- UPDATE/SOFT_DELETE/DESTROY=false;
- post-apply converged objectPermission count = 0;
- delete remains forbidden.

A second reverse-audit finding found a malformed literal CR/LF regex in the generated Live PowerShell wrapper.

Correction:

- repair to escaped `\\r?\\n`;
- add hidden-control-character source guard;
- add real PowerShell parser CI for all three CRM Specialist Windows scripts.

This is the reason the current correction must be merged before another Windows run.

---

## 12. Evidence-quality correction

The previous Live validator emitted:

`ragflowLeadInvocations: 0`

as a constant.

That is not independent runtime telemetry.

The corrected evidence distinguishes route selection from runtime telemetry.

The zero-Lead requirement is currently proven as:

1. the real deterministic router returns CRM ownership = Twenty, `ragflowLeadRequired=false`, `modelRoutingCalls=0`;
2. the Live CRM validator executes only `TWENTY_NATIVE_TOOL_ONLY` and contains no RAGFlow/Knowledge call path;
3. the validator reports `crmMutationRequested=false`;
4. independent RAGFlow runtime request-count telemetry is not yet implemented and is therefore not claimed.

Do not claim a measured RAGFlow invocation count until tracing exists.

---

## 13. Current legal next sequence

1. finish the complete A-K source batch and all affected exact-head CI;
2. require Fast CI, Enterprise AI execution/governance, Twenty native build/plan, RAGFlow orchestration and AI Assistant browser acceptance all green;
3. merge once;
4. perform one governed Windows update to exact merged main;
5. run one Twenty Enterprise AI v2 official plan/apply with mandatory backup and post-apply zero convergence;
6. synchronize admitted Twenty CRM AI + RAGFlow Enterprise Lead providers;
7. run one final Enterprise AI live gate proving ordinary-employee Tier-1/Tier-2 read-only use plus manager Tier-1/Tier-2/Tier-3, governance and approval-gated Task/Note/Draft writes with cleanup;
8. perform final employee-facing AI Assistant browser smoke against the real deployed UAT;
9. publish closure evidence.

Do not deploy a partial A-K subset.


---

## 14. Completion rule

Do not say "Enterprise AI is implemented" until all of the following are true:

- Domain AI execution is real, not only planned;
- Tier-2 E2E is proven;
- Tier-3 E2E is proven;
- required business specialists are admitted;
- employee AI UI exists;
- model routing/provider execution is integrated;
- approval/cost/trace governance required for the enabled action class exists;
- corresponding Windows/live evidence is closed.

Until then the approved wording is:

> **Enterprise AI A-K source implementation is complete; integrated company-runtime and employee-product admission is pending.**


---

## 15. Comprehensive reverse-audit controls

The first real Windows failure triggered a broader reverse audit rather than a one-line allowlist fix. Before another Apply, the implementation now requires: exact installed-main SHA; exact frozen App/role/Logic-Function identifiers; a 0-action converged plan or the exact 5-action first-apply shape; exact READ-only Company/Person/Opportunity object-permission targets; an exact safe role update; explicit `canAccessAllTools=false`; filled bridge server variables; a semantic stable-field action-plan SHA-256 that must remain identical after the mandatory backup; post-apply zero-action convergence; verified accepted F2 closure content; current-SHA Apply evidence with a retained backup; and claim-bounded Live evidence.

Domain AI Registry entries with concrete source execution paths are marked `EXECUTABLE / executionReady=true`, while live company admission remains a separate runtime gate. `research.specialist` remains `NOT_ADMITTED / executionReady=false` until a governed external-research provider exists. This prevents both false negatives in the registry and false claims of live readiness.


---

## Pre-deployment usability reverse audit — 2026-09-23

A source-complete A–K implementation is not sufficient for deployment. A second reverse audit against the actual downstream contracts found and corrected the following deploy-blocking risks before any new Windows apply:

1. **Conversation budget mismatch** — unified conversation history could exceed Twenty CRM AI's 8,000-character question contract and Knowledge answer's 4,000-character contract. Execution now budgets history per downstream domain while preserving the current request.
2. **Tier-2 Knowledge overflow** — up to 12 × 6,000-character retrieved chunks could exceed the CRM specialist's 50,000-character Knowledge context contract. Borrowed Knowledge is now bounded to 48,000 characters and citations are emitted only for included blocks.
3. **Mail Draft approval failure** — the existing mail draft provider requires a UUID `payload.id`, while employee AI intentionally does not expose that internal field. The Control Plane now injects the approval UUID as the draft ID only at approved execution time.
4. **CRM AI response trust gap** — the provider boundary previously prepared a read-only request but did not independently validate the response. The API now fail-closes unless the provider returns `ok=true`, a non-empty response, `readOnly=true`, `executionMode=TWENTY_AGENT_NO_REGISTRY_TOOLS`, and a boolean Knowledge-borrow marker.
5. **Enterprise AI v2 plan state assumption** — the first-generation v2 plan inherited a fixed `4 create + 1 update` expectation from a different partial App state. The plan now validates exact allowed metadata identities/permissions with per-category maxima and zero-delete semantics, so it safely admits the real Knowledge-only starting state, a bounded partial state, or the converged zero-action state.
6. **Browser CI readiness window** — a fresh Keycloak 26.7.2 Quarkus augmentation can consume most of the previous 180-second fixture window. The acceptance fixture now allows up to 420 seconds and preserves container-state diagnostics.

Regression gates cover long CRM/Knowledge conversations, large borrowed Knowledge, unsafe CRM provider responses, internal draft-ID generation, safe Enterprise AI metadata subsets, and the full AI Assistant browser flow.

Deployment remains blocked until the corrected exact PR head passes every affected focused check, including Stage 3.7 browser acceptance. Production remains **NOT AUTHORIZED**.


## Final usability hardening added by comprehensive reverse audit

A source/UI/API PASS is not sufficient to call the Enterprise AI employee-ready.

Before company deployment can be closed, the final Windows gate now additionally requires:

- API-level rejection of invented Knowledge citation markers in Tier-2 and Tier-3;
- Knowledge answers to be explicitly grounded and carry real authorized citations;
- the deployed `localhost:3030` UI to be opened by a real ordinary-employee session in installed Chrome/Edge;
- the real AI Assistant navigation to be visible;
- a real customer to be selectable;
- a real Tier-2 Spanish development-email flow to complete through the UI;
- Tier-2 metadata and Knowledge citations to be visible to the employee;
- governance/budget state to be visible;
- page refresh to preserve the private AI conversation and its citations;
- zero captured browser runtime JavaScript exceptions.

The browser gate uses Windows Chrome DevTools Protocol directly and requires no Playwright/npm download on the company server.

Therefore **employee-ready** now means: source contracts PASS + provider/app apply PASS + backend live A-K PASS + low-risk approval/write/cleanup PASS + real deployed browser UAT PASS. Anything less remains pre-deployment evidence only.


## Tier-0 employee-path completion

The reverse audit found that deterministic Tier-0 existed in the router/Tool Gateway but was not reachable as an employee AI Assistant task. That would have violated the intended “simple task -> no model” product behavior even though the architecture test passed.

The unified executor and AI Assistant now include:

- **客户资料直查 / CUSTOMER_LOOKUP** — canonical Account + Contact + Opportunity + scoped Activity/Customer Intelligence assembled deterministically; no model provider is called.
- **知识检索 / KNOWLEDGE_SEARCH** — governed Knowledge retrieval excerpts/citations are presented directly; no generative model or Agent is called.

Both flows:
- use `TIER_0_DETERMINISTIC`;
- record `modelCalls=0`;
- remain read-only;
- still create private conversation/execution/audit evidence;
- are included in the final real Windows live worker.

This closes the gap between “Tier-0 exists in code” and “employees can actually use Tier-0 from the AI Assistant.”


---

## Final pre-deployment reverse audit — routing, privacy, budget and token lifetime

The final source audit before deployment added seven deploy-blocking corrections:

1. **Tier-3 citation subset integrity** — only citations actually supplied to RAGFlow Lead can be accepted in the final answer.
2. **Conservative Tier-3 model budget** — Complex work reserves 64 budget units for the bounded multi-round Lead + three-child graph. Exact provider-native per-node telemetry remains unavailable and is not fabricated.
3. **Approval privacy** — approval payloads are original-employee private. Manager/admin API access does not expose another employee's draft/task/note approval content; oversight stays in audit events.
4. **Task/mode compatibility** — invalid task/mode combinations fail closed in the backend and are hidden from the employee UI.
5. **AUTO Knowledge borrowing** — CRM-capable AUTO tasks preserve the employee's bounded Knowledge-borrow choice.
6. **Final UAT token freshness** — ordinary read smoke, real browser UAT and manager full UAT each receive a fresh bounded-lifetime Keycloak token immediately before execution.
7. **Tier-3 authority governance** — architecture v1.1 re-freezes Step H around bounded evidence packets: GBAP invokes CRM/Knowledge specialists under employee authority; RAGFlow receives packets only and no direct CRM credential or unrestricted CRM Tool.

These controls are required before the one real Windows deployment.


### Tier-3 latency and token-lifetime hardening

CRM evidence analysis and Knowledge evidence analysis are independent Tier-3 prerequisites. They now execute in parallel before the RAGFlow Lead step. This preserves the independent-specialist architecture while reducing worst-case pre-Lead latency from the sum of the CRM and Knowledge timeouts to their maximum. The final Windows gate also refreshes Keycloak access tokens immediately before each bounded UAT stage.


---

## Pre-deployment consistency finding — client-input preflight

The pre-deployment reverse audit found one runtime-consistency gap that was not exposed by the happy-path CI suite: `POST /api/ai/execute` could create a conversation and reserve request/model budget before every client-controlled field had been fully validated.

That behavior is not acceptable for an employee-ready product because a malformed 4xx request must not leave a durable RUNNING execution, consume budget, or create an empty conversation.

Correction:

- one authoritative `validateEnterpriseAiRequest` preflight now validates task/mode, bounded question, language, required customer binding, Knowledge query/collection bounds, `topK`, and `useKnowledge`;
- model-budget estimation reuses the same preflight;
- the API performs preflight before conversation creation, execution creation, user-message persistence, or budget reservation;
- invalid `topK` no longer silently falls back;
- real HTTP integration tests prove invalid client requests leave governance usage, conversations, and executions unchanged.

Status: **CORRECTED BEFORE MERGE / AFFECTED EXACT-HEAD CI REQUIRED**.


---

## Pre-deployment usability hardening — bounded customer-context fan-out

The final source audit also reviewed large-customer behavior. A selected customer can legally have many contacts and opportunities. The activity capability accepts up to 250 read targets, so the current maximum Account + 100 Contacts + 100 Opportunities remains inside the provider contract. However, fetching up to 100 opportunity trade profiles with an unbounded `Promise.all` creates unnecessary burst pressure on the local API/SQLite runtime.

Correction:

- opportunity-profile enrichment now uses a dependency-free bounded-concurrency mapper with a maximum of 8 concurrent internal reads;
- the customer snapshot explicitly records whether the 100-contact, 100-opportunity, or 100-activity AI context bound was reached, so downstream reasoning does not silently treat a bounded sample as a guaranteed complete universe;
- canonical customer binding and target filtering remain unchanged.

Status: **HARDENED BEFORE FINAL LIVE UAT**.


---

## Pre-deployment UAT hygiene — uncertain write cleanup

The final live UAT intentionally proves approval-gated Task, Note and Mail Draft writes and then deletes those temporary fixtures. The reverse audit found that cleanup used to be registered only after the approval-execution response returned. A transport interruption after a successful write but before the response arrived could therefore leave a temporary UAT record behind.

Correction:

- Task and Note business IDs are read from the already-persisted approval payload and their cleanup is registered **before** approval execution;
- the Mail Draft uses the approval ID as the deterministic downstream draft ID, so its cleanup is also registered before approval execution;
- cleanup treats already-absent/not-found fixture state as idempotently clean, but still fails on unexpected errors;
- successful execution must return the same deterministic ID that was reserved before mutation.

Status: **HARDENED BEFORE FINAL LIVE UAT**.


---

## Pre-deployment approval consistency — deterministic Draft identity

The Mail Draft write path intentionally uses the approval request ID as the downstream draft ID so an uncertain write can be reconciled and cleaned without generating a second mutable identifier. The reverse audit found that input preparation still added a separate random `id` to the stored approval payload even though execution overwrote it with the approval ID.

Correction:

- the unused pre-approval Draft ID is removed;
- the approval payload now contains only user/business fields;
- actual Draft identity remains the approval ID at execution time;
- final UAT pre-registers cleanup using that same approval ID.

Status: **CORRECTED BEFORE FINAL LIVE UAT**.


---

## Employee usability hardening — development email to actionable draft

The CRM context already contains authorized contact email addresses, but the initial AI Assistant implementation did not carry that information into the Mail Draft proposal. Employees would have received a useful email body but still had to manually recover the recipient after asking AI to draft the outreach.

Correction:

- `DEVELOPMENT_EMAIL` results now include a bounded `suggestedDraft` built only from already-authorized CRM context;
- the first visible customer contact with an email is proposed as the Draft `to` recipient;
- a language-aware default subject is generated from the customer display name;
- the UI shows the proposed recipient before approval and passes it to the existing approval-gated `mail.draft.save` Tool;
- no email is sent automatically;
- customer/draft/route/citation metadata is stored only in the employee-private AI conversation;
- reopening a prior AI conversation restores the latest actionable result so the employee can propose a Task, Note or Draft without rerunning the model;
- Playwright regression coverage verifies recipient prefill, subject prefill, customer-binding stability and restored-action behavior.

Status: **HARDENED FOR DAILY SALES USE BEFORE FINAL LIVE UAT**.


---

## 16. Pre-deployment usability and runtime-capacity hardening

The full A-K reverse audit identified deployment-time risks that static provider tests alone would not catch.

### Model execution concurrency

Model-backed Tier-1/Tier-2/Tier-3 executions are now admitted atomically with:
- default per-employee model concurrency = 1;
- default platform model concurrency = 1 for the current CPU Windows/RAGFlow UAT capacity;
- Tier-0 deterministic customer/Knowledge reads bypass model concurrency;
- the limits are environment-configurable but fail to conservative defaults;
- concurrent model work is rejected with HTTP 429 rather than queued until host memory/CPU collapse.

### Crash recovery

RUNNING AI executions older than the bounded stale window are failed closed with `ai_execution_stale_timeout` before new model admission. Reserved model budget is not refunded, preventing crash/retry loops from bypassing daily governance.

### Conversation lifecycle

A newly-created empty conversation is removed if model admission fails before the user message is durably written. User-message persistence is now inside the execution failure boundary so persistence errors cannot silently leave an indefinitely RUNNING execution.

### Employee UX

The AI Assistant now:
- explains daily-budget and concurrency limits in Chinese rather than exposing raw error codes;
- shows current model concurrency capacity;
- disables conversation/preset/customer/mode changes while an AI execution is in flight;
- clears stale action notices when starting a new conversation;
- keeps Tier-0 reads available while model concurrency is occupied.

### Browser determinism

AI preset browser tests use the preset grid and exact accessible names. Historical conversation titles can no longer collide with preset selectors.

These controls are prerequisites for the single final Windows deployment/UAT and are not a Production authorization by themselves.


---

## Final deployment-readiness reverse audit — fresh install and approval uncertainty

The final pre-deployment audit found two additional issues that would not necessarily appear on the already-upgraded company server but could make a new local installation or an abnormal write response unsafe.

### Fresh Local-UAT Twenty baseline

The company UAT was already cut over to Twenty v2.41.0, but the first-run defaults in `Start-GBAP-UAT.ps1` and `docker-compose.yml` still selected v2.37.0. That historical default was correct before the accepted company cutover but is no longer correct for a new installation.

Correction:

- a new Local-UAT `.env` now selects Twenty `v2.41.0` directly;
- Compose fallbacks now select the accepted v2.41.0 image/build contract;
- `.env.example` documents the same current baseline;
- the old v2.37.0 values remain only in the governed historical cutover/rollback path for an existing legacy environment;
- the Twenty v2.41 cutover contract test now distinguishes current fresh-install truth from legacy migration/rollback evidence.

A fresh machine therefore does **not** first create a v2.37 environment merely to upgrade it again before Enterprise AI admission.

### Approval execution with an uncertain transport outcome

Task, Note and Mail-Draft mutations are explicitly confirmed by the original employee, but a network/transport failure can occur after the downstream system has received a write and before GBAP receives the response.

Treating such an error as an ordinary failed write would invite a second user attempt and could duplicate a business action.

Correction:

- after approval has transitioned to `APPROVED`, any downstream mutation exception now transitions the approval immediately to `FAILED / ai_approval_outcome_unknown_manual_review`;
- the uncertain approval is not replayable;
- the employee UI already renders that error class as a manual-review warning;
- normal successful writes still transition to `EXECUTED`;
- stale `APPROVED` reconciliation remains a second fail-closed safety net.

This is intentionally conservative: GBAP does not claim that a write failed when the remote outcome is unknown.

Status: **CORRECTED BEFORE MERGE / EXACT-HEAD CI REQUIRED**.
