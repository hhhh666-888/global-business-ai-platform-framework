# GBAP GBAP｜Knowledge Generative Provider Evaluation v0.1

Status: **EVALUATION CRITERIA FROZEN / REAL PROVIDER NOT SELECTED**

Date: 2026-09-19

Authority:

`docs/architecture/GBAP_KNOWLEDGE_GENERATIVE_PROVIDER_GATE_v0.1.md`

This document defines the evidence required before one real UAT answer provider/model may be selected behind `gbap.generative.v1`.

## 1. Evaluation boundary

The candidate evaluation must not reopen or modify:

```text
gbap.knowledge.v1 retrieval contract
RAGFlow v0.27.2
frozen GTE multilingual embedding
GBAP Knowledge ACL
canonical Knowledge IDs/source authority
canonical citation mapping
```

The candidate receives synthetic/non-company evaluation contexts only until explicitly admitted.

## 2. Hard admission requirements

A real UAT generative candidate must satisfy all of these:

```text
server-side API access                         REQUIRED
provider/model credentials remain secret       REQUIRED
headless/replaceable integration               REQUIRED
gbap.generative.v1 adapter possible         REQUIRED
no browser-direct model/provider access        REQUIRED
ACL remains before generation                  REQUIRED
bounded authorized contexts only               REQUIRED
canonical/provider Knowledge IDs withheld      REQUIRED
employee subject/username withheld              REQUIRED
citation references deterministic              REQUIRED
no-context => no generation                    REQUIRED
provider outage => answer fail-closed           REQUIRED
retrieval remains independently usable          REQUIRED
CN / EN / ES grounded-answer proof              REQUIRED
numeric-fidelity proof                          REQUIRED
prompt-injection-in-context resistance          REQUIRED
real P95 answer latency                         <= 30 s initial UAT ceiling
Production                                      NOT AUTHORIZED
```

Any failure above blocks provider selection.

## 3. Data-governance requirements

Before real company Knowledge can be sent to a generative provider, the selected provider path must have documented evidence for:

- whether API inputs/outputs are used for provider model training;
- retention / zero-retention options where available;
- data-processing region / deployment scope;
- encryption-in-transit and provider security posture;
- credential scoping, rotation and revocation;
- account/workspace isolation;
- model lifecycle/deprecation policy;
- applicable company legal/compliance review.

Desk evidence is not sufficient by itself to authorize broad company-data use.

## 4. Operational requirements

Preferred characteristics:

- OpenAI-compatible server-side API or equally bounded adapter surface;
- region-specific endpoint;
- model-scoped/API-key-scoped access where possible;
- IP allowlist where possible;
- structured/JSON output support;
- context window materially above GBAP's bounded context envelope;
- stable model aliases plus snapshot/version option;
- clear rate limits;
- observable token usage and errors;
- documented pricing.

## 5. Standard live candidate suite

Governed entrypoint:

`infrastructure/knowledge-runtime/Test-GBAP-Generative-Provider-Candidate.ps1`

Underlying evaluator:

`tests/substrate/knowledge-generative-candidate-eval.mjs`

The suite uses synthetic/non-company content and proves:

1. Chinese grounded fact recovery;
2. English governance-state fidelity;
3. Spanish numeric fidelity;
4. hostile instructions embedded inside retrieved context do not redirect citation behavior;
5. every accepted answer cites only issued `context-1`;
6. unknown citation references fail;
7. API key is never printed;
8. P50/P95 latency is measured;
9. provider token usage is recorded when the API returns usage;
10. estimated request cost may be calculated when current documented token rates are supplied.

The evaluator currently targets an OpenAI-compatible `/chat/completions` interface because the initial primary/secondary candidates expose that protocol. A provider using a materially different protocol must add a bounded evaluator mode rather than weakening the Gate.

## 6. Candidate decision states

```text
DESK_ELIGIBLE       official documentation satisfies desk-level requirements
LIVE_TEST_PENDING   needs a real synthetic API run
LIVE_TEST_PASS      synthetic real API proof passes
UAT_SELECTED        explicit evidence-backed selection for GBAP UAT
REJECTED            hard requirement failed
DEFERRED            not appropriate for current host/path but may be revisited
```

No candidate becomes `UAT_SELECTED` solely from price, marketing claims or fake-provider CI.

## 7. Current shortlist

Current desk evidence is recorded in:

`docs/evidence/GBAP_KNOWLEDGE_GENERATIVE_PROVIDER_DESK_EVALUATION_2026-09-19.md`

Initial order for live proof:

```text
1. Alibaba Cloud Model Studio / qwen3.7-flash   PRIMARY LIVE-TEST CANDIDATE
2. Alibaba Cloud Model Studio / qwen3.8-flash   QUALITY-UPLIFT CANDIDATE
3. DeepSeek direct / deepseek-flash             SECONDARY COST/QUALITY CANDIDATE
4. OpenAI / gpt-5.6-luna                        SECONDARY GOVERNANCE/QUALITY REFERENCE
5. Ollama local                                 DEFERRED ON CURRENT COLOCATED HOST
```

This order is a test plan, not a provider selection.

## 8. Selection rule

A UAT provider/model may be selected only after:

```text
desk evidence
+ real synthetic API proof
+ hard-gate PASS
+ latency/cost evidence
+ provider data-governance evidence
+ no regression to frozen retrieval/recovery boundaries
= UAT selection eligible
```

The selected provider must then receive a dedicated adapter and a real end-to-end GBAP proof:

`employee question -> ACL -> frozen GTE retrieval -> real answer provider -> canonical citations`.

## 9. Current blocker

The engineering harness is repository-controlled and contains no credentials.

A live candidate run requires an operator-provided API key in the ephemeral environment variable:

`GBAP_GENERATIVE_CANDIDATE_API_KEY`

The key must never be committed, written into repository docs, pasted into CI configuration, or passed as a command-line argument.

Production remains **NOT AUTHORIZED**.
