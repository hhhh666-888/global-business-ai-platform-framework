# GBAP Stage 3.4｜CRM-Only UI Scope Correction v0.1

Status: **ACTIVE SCOPE CORRECTION**

Applies to: `Twenty UI Reuse Spike + Full CRM Surface Prototype`

This record narrows the current implementation scope after product-owner correction.

## Decision

The current product shell is **CRM-only**.

Do not pre-reserve navigation entries or placeholder pages for future GBAP bricks such as:

- customer discovery;
- platform AI;
- enterprise knowledge;
- quotation / solution;
- energy engineering;
- project collaboration;
- channel center;
- platform analytics;
- platform administration.

Those modules may be added later with their own UI extension when they are actually selected and implemented.

## Current CRM IA

Ordinary employee CRM surface:

- Workbench;
- Companies;
- People;
- Opportunities;
- Tasks;
- Notes / Timeline;
- Email;
- Calendar;
- Files;
- Saved Views / Favorites.

Manager / power-user CRM surface, permission-gated:

- Dashboards;
- Import / Export and governed bulk operations.

CRM administrator surface, permission-gated:

- Workflows;
- CRM Settings / Builder;
- custom objects / fields / layouts / integrations;
- provider-native CRM AI / Apps may remain an optional capability inside CRM settings, but **must not occupy ordinary employee primary navigation**.

## Supersession rule

For this current UI spike only, this record supersedes any earlier illustrative global-shell placeholder navigation in the capability/reuse matrix.

It does **not** change the architectural rule that future bricks remain separately replaceable and connect through GBAP-owned boundaries.

## Acceptance consequence

The reverse audit must now prove:

1. the visible product navigation is CRM-only;
2. no future-brick placeholder labels appear in the current sidebar;
3. useful Twenty CRM capabilities are not reduced to Account / Contact / Opportunity only;
4. employee versus manager/admin CRM surfaces are explicitly role-gated;
5. optional Twenty CRM AI/App capability is not confused with future GBAP platform AI;
6. the legacy substrate administration surface remains separately reachable at `/substrate.html`.
