# GBAP GBAP｜Enterprise AI Control Plane Architecture v1.1

Status: **DIRECTION RE-FROZEN / CURRENT AUTHORITY**

Date: 2026-09-23

v1.1 inherits every permanent platform boundary, Tier 0–3 routing rule, Tool-versus-Agent rule, provider-replacement rule, security posture and API/MCP posture from v1.0. v1.0 remains historical evidence and is not rewritten.

## REOPEN trigger

v1.0 Step H said: `expose admitted CRM specialist to RAGFlow orchestration`.

The implementation/security audit found that giving the orchestration runtime a directly callable CRM specialist surface would duplicate cross-runtime authority. GBAP already owns employee authorization, canonical IDs, domain routing and audit; Twenty already owns CRM-domain reasoning.

## Evidence and decision

GBAP can invoke the CRM and Knowledge specialists under the employee's existing authority, sanitize and bound those outputs, and pass only evidence packets plus authorized citation markers to RAGFlow v0.27.2 Lead/SubAgents. RAGFlow can independently challenge/synthesize those packets without any CRM credential, CRM Registry Tool, provider token or external MCP.

This is lower privilege and preserves the dominant-domain architecture.

## RE-FROZEN A–K sequence

```text
A. freeze this architecture authority
B. implement machine-testable Capability Registry
C. implement deterministic route contract
D. prove CRM-only route has zero RAGFlow Lead requirement
E. implement bounded read-only Twenty CRM capabilities
F. prove employee-scoped CRM specialist
G. prove Tier-2 borrowed Knowledge Tool from CRM owner
H. pass bounded specialist evidence packets to RAGFlow orchestration without direct CRM authority
I. prove one true Tier-3 cross-domain end-to-end scenario
J. add future specialists by registration/composition without a new generic Agent runtime
K. reopen only explicitly admitted mutation classes behind approval; keep autonomous high-risk actions disabled
```

## Tier-3 authority boundary

```text
Employee
-> GBAP Control Plane
   -> Twenty CRM specialist -> bounded CRM evidence packet
   -> Knowledge specialist  -> bounded Knowledge packet + citations
-> RAGFlow Enterprise Lead/SubAgents
   -> packet-only independent analysis/challenge/synthesis
-> GBAP validates citation markers and returns result
```

RAGFlow direct CRM credentials/tools are **FORBIDDEN**.

## Current posture

```text
GBAP platform/control authority        REQUIRED
Deterministic routing first            REQUIRED
Twenty CRM Domain AI                   GOVERNED DOMAIN OWNER
RAGFlow Knowledge Domain AI            GOVERNED DOMAIN OWNER
RAGFlow Lead/SubAgent                  TIER-3 ONLY / BOUNDED PACKETS
Generic GBAP Agent runtime             FORBIDDEN
External MCP                           NOT EXPOSED
Autonomous high-risk AI actions        DISABLED
Production                             NOT AUTHORIZED until final live/browser closure
```

For all current implementation decisions, **v1.1 supersedes v1.0 as the architecture authority**.
