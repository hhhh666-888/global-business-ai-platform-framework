# GBAP Stage 3.4 continuation｜Selected Twenty Production Integration Foundation v0.1

**Status:** `PASS / COMPLETE / MERGED / REMOTE READ-BACK VERIFIED / PRODUCTION GO-LIVE NOT AUTHORIZED`

**Authority baseline:** `docs/architecture/GBAP_STAGE3_ACTIVE_BASELINE_v0.8.md`

**Selected engine decision:** `docs/architecture/GBAP_Stage3_4_Production_CRM_Decision_Gate_v0.1.md`

This record implements and accepts the first production-foundation layer for the selected Twenty CRM engine. It does not create a new numeric stage, reopen the Production CRM Decision Gate, select the production employee UI, claim E2/E3, or authorize production go-live.

---

## 1. Confirmed product boundary

The selected direction is stable for this implementation track:

```text
Twenty
= selected headless CRM engine

Twenty daily-sales responsibility
= CRM records + relationships
= Account / Contact
= Opportunity / pipeline mechanics
= follow-up/task/reminder/workflow mechanics
= CRM activity/history substrate

GBAP / GBAP
= employee product UI
= business/domain semantics
= permissions/authorization
= durable IDs
= workflow orchestration across providers
= provider selection/replacement authority
```

The decision does not require Twenty itself to become a complete foreign-trade platform.

The following are explicitly separate bricks/providers to be assembled later as needed:

```text
customer acquisition/search
contact enrichment/verification
Google Maps / trade-data / public-data sourcing
WhatsApp and other messaging
AI models / agents / assistants
knowledge/document engines
quotation/BOM/pricing
energy-solution/EPC calculation
other GBAP business-domain capabilities
```

Those functions may write/read CRM truth only through GBAP-owned contracts and governed workflows.

---

## 2. Reused implementation

No second Twenty integration implementation was invented.

The production foundation reuses:

- `providers/twenty-adapter/server.mjs`;
- the already-proven `gbap.crm.v1` canonical contract;
- the tested Twenty v2.37.0 semantic baseline;
- the provider registry, mapping, health, audit and evidence-transition substrate;
- the PoU-proven service pattern of PostgreSQL + Redis + Twenty server + worker + adapter.

PoU-only test credentials, open localhost ports and test workspace bootstrap assumptions are not promoted into production configuration.

---

## 3. Production runtime configuration

Implementation:

- `infrastructure/twenty-production/docker-compose.yml`
- `infrastructure/twenty-production/runtime.env.example`
- `infrastructure/twenty-production/provider-registration.template.json`
- `infrastructure/twenty-production/README.md`

Key controls:

1. Twenty image is mandatory and must be supplied as an immutable digest;
2. Postgres and Redis image identities are also deployment-governed rather than hidden mutable defaults;
3. no production Twenty service publishes a host port in this foundation;
4. Twenty DB/Redis/server/worker remain on an internal private network;
5. only the Twenty adapter joins the GBAP runtime network;
6. Twenty and database secrets are supplied from an external secret env file;
7. the adapter API key is supplied through a separate read-only external file;
8. raw secret values are not stored in the production compose or repository examples;
9. production GBAP API must use `SUBSTRATE_ENV=production`, matching provider `environmentScope=production`;
10. the initial provider scope is production-global (`organizationScope/workspaceScope = null`) until a later explicit scoped-provider decision.

---

## 4. Production provider lifecycle

Production provider identity begins as:

```text
providerId
= twenty-crm-production

integrationMode
= HEADLESS_PROVIDER

environmentScope
= production

lifecycleOwner
= GBAP_MANAGED

replacementClass
= R4

replacementEvidence
= E0

failureMode
= DEGRADE

contractVersion
= gbap.crm.v1

upstreamProduct
= Twenty

upstreamVersion
= v2.37.0
```

Selection does not authorize the production registration to self-assert E1. Production E-level evidence belongs to the exact deployed integration identity and advances only through the existing audited evidence transition.

The provider registration exposes only the mandatory canonical CRM V1 capabilities:

```text
crm.v1.account.create
crm.v1.account.list
crm.v1.contact.create
crm.v1.contact.list
crm.v1.opportunity.create
crm.v1.opportunity.list
crm.v1.snapshot.export
```

Provider-native historical PoU capabilities remain evidence/test compatibility and are not required production business API.

---

## 5. Secret and egress posture

Production source control stores only secret references and file paths, never raw Twenty API keys, DB passwords, app secrets or encryption keys.

The initial selected-engine network posture is intentionally narrow:

```text
GBAP runtime
 -> twenty-adapter
 -> twenty-private network
 -> Twenty server
 -> Twenty DB / Redis
```

The engine private network is Docker-internal and no vendor UI port is published by this foundation.

External acquisition, WhatsApp, AI and other integration traffic is not opened through the Twenty network as a shortcut. A future integration that genuinely needs external egress must receive its own governed provider/network change.

Compose isolation is not represented as a complete host firewall. The production host/network layer must still enforce actual outbound policy.

---

## 6. Data and business-truth boundary

GBAP durable business IDs remain GBAP-owned.

Twenty external IDs remain provider IDs.

Provider schema does not become domain Authority merely because a custom object can be created in Twenty.

The initial production canonical slice remains:

```text
Account
Contact
Opportunity
```

Later RFQ, Quotation, Project, Order, Shipment, Energy Requirement or other foreign-trade/new-energy concepts must be introduced through GBAP-owned domain/canonical contracts before their provider mappings are treated as authoritative business semantics.

---

## 7. Backup / restore contract

The foundation defines a complete backup set as including:

1. Twenty PostgreSQL data;
2. Twenty storage data;
3. immutable Twenty image identity;
4. Twenty adapter revision;
5. config/schema revision identities;
6. corresponding GBAP provider/mapping state from the GBAP backup set;
7. evidence/audit data needed to interpret the integration state.

Secrets are recovered from the secret-management system, not copied into ordinary data backups.

A restore is not considered proven merely because backup files exist. Before production go-live, a clean-environment restore drill must demonstrate:

- DB/storage recovery;
- successful startup on the approved integration identity;
- provider health;
- durable mapping continuity;
- canonical CRM read path.

No finalized enterprise RPO/RTO is claimed by this foundation.

---

## 8. Upgrade / revalidation contract

The starting tested semantic baseline is Twenty v2.37.0; actual production deployment is pinned by immutable image digest.

Any change in:

- upstream version/digest;
- adapter revision;
- canonical contract version;
- config revision;
- schema/customization revision;

creates a changed integration identity.

Changed identities do not silently inherit previous E-level evidence.

Before promotion, the changed integration must pass the applicable canonical conformance, regression, backup/restore compatibility, license-boundary and provenance/audit checks.

Rollback means restoring a previously approved compatible image/config/schema/data combination, not merely changing a tag.

---

## 9. Frappe disposition remains unchanged

```text
Frappe adapter/evidence
= RETAIN

Normal production runtime routing
= NO

Automatic hot standby
= NO

Automatic Twenty -> Frappe write failover
= NO

E2/E3 replacement claim
= NO
```

The selected Twenty production foundation does not delete alternate-provider evidence.

---

## 10. Acceptance evidence

Permanent foundation test:

`tests/substrate/twenty-production-foundation-self-test.sh`

Accepted evidence:

```text
PR
= #17

Accepted full foundation workflow
= run 33440165387

Twenty production foundation governance self-test
= PASS / 12 assertions

Production compose render
= PASS

Existing permanent substrate destructive self-test
= PASS / historical 63 assertions retained

Final scope-alignment static workflow
= run 33440500268

SUBSTRATE_ENV=production / environmentScope=production alignment
= PASS

Final production compose render after scope-alignment correction
= PASS

Squash merge
= 285093c2c18c5d54a201010034f0867ecc096036

Remote main read-back
= VERIFIED
```

The second run's remaining 63-assertion substrate step was intentionally not required for closure because the only post-full-run changes were the non-runtime production environment contract and its static assertion. The immediately preceding full run already proved the same repository runtime/substrate code with all 63 historical assertions.

No repeated real-engine Twenty/Frappe PoU is required merely because production configuration/governance files were added. Any future change to the adapter/upstream integration identity that can affect runtime semantics must use the applicable real-engine revalidation policy.

---

## 11. Current Gate

```text
Production CRM Decision Gate
= PASS / TWENTY SELECTED

Selected Twenty production config foundation
= PASS

Immutable image pin contract
= PASS

External secret contract
= PASS

Private network / adapter-only GBAP bridge
= PASS

Production resolver/provider environment alignment
= PASS

Production provider E0 lifecycle template
= PASS

Canonical-only production capability binding
= PASS

Backup/restore minimum contract
= PASS

Upgrade/revalidation contract
= PASS

Frappe automatic runtime routing
= REJECTED

E2_REIMPORT_PROVEN
= NO

E3_CUTOVER_PROVEN
= NO

Production go-live
= NOT AUTHORIZED

Foundation final status
= PASS / COMPLETE / MERGED / REMOTE READ-BACK VERIFIED
```

---

## 12. Next legal work

Do not open another generic CRM selection or PoU.

The next legal Stage 3 work is descriptive:

> **Stage 3.4 continuation｜GBAP Native CRM Employee Workbench Foundation**

Purpose: make the selected CRM mechanics usable through the GBAP-owned employee product surface for daily sales—customers/contacts, opportunities/pipeline, follow-up/tasks/reminders and activity history—while continuing to keep acquisition, WhatsApp, AI, quotation/EPC and other capabilities as separately replaceable bricks.

This does not create a new numeric stage and does not authorize production go-live.
