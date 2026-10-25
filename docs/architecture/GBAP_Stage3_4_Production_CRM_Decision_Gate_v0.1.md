# GBAP Stage 3.4 continuation｜Production CRM Decision Gate v0.1

**Status:** `PASS / SELECT TWENTY / PRODUCTION HEADLESS CRM ENGINE FOR NEXT IMPLEMENTATION TRACK`

**Authority baseline:** `docs/architecture/GBAP_STAGE3_ACTIVE_BASELINE_v0.7.md`

**Machine-readable decision matrix:** `docs/evidence/stage3-4-production-crm-decision/production-crm-decision-matrix-v0.1.json`

**Decision scope:** select one CRM engine for the next production implementation track. This does not select the employee-facing UI, does not authorize go-live, does not prove E2/E3, and does not authorize automatic cross-CRM failover.

---

## 1. Decision

```text
SELECT TWENTY

Role
= PRODUCTION_HEADLESS_CRM_ENGINE_FOR_NEXT_IMPLEMENTATION TRACK

Initial tested integration baseline
= Twenty v2.37.0

Frappe CRM
= RETAIN AS E1-VALIDATED ALTERNATE / CONTROL COMPARATOR

Atomic CRM
= RETAIN AS NATIVE SOURCE/UI REUSE ASSET ONLY

EspoCRM
= CONDITIONAL RESERVE / NOT PROMOTED
```

This is an engine-selection decision, not a product-shell decision.

GBAP employees remain intended to use the GBAP-owned native UI. GBAP business code remains bound to `gbap.crm.v1`, not Twenty-specific object names or APIs.

---

## 2. Why the Gate can now close

The prerequisites from the post-PoU synthesis and Active Baseline v0.7 are satisfied:

1. `DELTA-CRM-01` Canonical CRM Contract = PASS;
2. Twenty implements the mandatory Account / Contact / Opportunity slice;
3. Frappe implements the same mandatory slice;
4. the identical 14-assertion provider-neutral conformance harness passed against both real engines;
5. `DELTA-CRM-02` evidence-governed E-level advancement = PASS;
6. `DELTA-CRM-04` normalized provenance = PASS;
7. provider-specific differences remain explicit;
8. permanent historical PoU acceptance remains intact.

Therefore engine selection no longer depends on speculative semantic replaceability.

---

## 3. Decision principle

The decisive architecture is:

```text
GBAP employee
→ GBAP-owned native UI
→ GBAP-owned business/domain services
→ GBAP Canonical CRM Contract
→ selected CRM adapter
→ selected headless CRM engine
```

This changes the decision weighting.

A vendor's own browser UI is useful evidence of product maturity, but it is not the primary employee product surface. Therefore the Decision Gate gives higher weight to:

- schema/extensibility;
- provider-neutral headless fit;
- API/integration capability;
- operational burden;
- maintainability;
- long-term data exit and replacement posture;
- licensing boundary.

Native daily-sales UI and vendor-specific communication integrations remain relevant but are not allowed to dominate the engine choice.

---

## 4. Weighted result

Scoring scale: `1–5`, higher is better.

Weighted total:

```text
Twenty
= 88.7 / 100

Frappe CRM
= 80.6 / 100
```

| Dimension | Weight | Twenty | Frappe CRM | Evidence interpretation |
|---|---:|---:|---:|---|
| Headless / canonical architecture fit | 15 | 5.0 | 5.0 | both real-engine proven |
| Schema / custom-object extensibility | 15 | 5.0 | 3.5 | Twenty first-class custom object proven; Frappe custom field proven |
| API / integration extensibility | 12 | 5.0 | 4.5 | both strong; Twenty's current API/webhook/app model aligns especially well with headless composition |
| Operational burden | 15 | 4.5 | 2.5 | Twenty tested topology materially smaller than Frappe tested topology |
| Stack maintainability fit | 8 | 4.5 | 3.0 | Twenty TypeScript/Node-facing extension model is closer to current GBAP implementation stack |
| Daily sales / communications | 10 | 3.5 | 5.0 | Frappe has the stronger real-browser and communication evidence |
| Licensing / self-host economics | 10 | 3.5 | 5.0 | Frappe CRM has the simpler AGPL/compute-based posture; Twenty has commercial self-host feature boundaries |
| Data exit / future re-import posture | 8 | 4.0 | 4.0 | both E1 export proven; neither E2/E3 proven |
| Upgrade provenance / pinning | 4 | 4.0 | 4.0 | both evidence identities are governable |
| Ecosystem / support / docs | 3 | 4.0 | 4.0 | both have active official support/documentation paths |

The weighted result is not treated as a mathematical truth by itself. The selection is driven by the combination of score, proven architecture fit, and the specific GBAP product architecture.

---

## 5. Why Twenty wins this architecture

### 5.1 Strongest proven extensibility for future GBAP domains

Twenty's PoU proved a first-class custom object through its metadata API, not only a custom field.

That matters because GBAP will not remain a three-entity CRM. The engine must tolerate future GBAP-owned business semantics without forcing business code to adopt provider vocabulary.

Twenty therefore has the strongest tested foundation for future canonical objects and provider mappings.

### 5.2 Lower tested operational surface

The real PoUs established materially different deployment footprints.

Twenty's tested CRM-side topology used:

```text
PostgreSQL
Redis
Twenty server
Twenty worker
GBAP adapter
```

Frappe's tested topology included:

```text
MariaDB
multiple Redis roles
configurator / site creation
backend
websocket
queue worker
scheduler
frontend
GBAP adapter
```

Not every Frappe setup container is a steady-state role, but the tested operational surface is still materially larger.

For a replaceable headless capability provider, lower operational gravity is preferable unless the heavier engine provides a decisive business capability that GBAP cannot own elsewhere.

### 5.3 Better fit with BUILD LAST / provider isolation

Current Twenty documentation exposes REST/GraphQL APIs, signed webhooks, workflow HTTP/webhook triggers, and a TypeScript app/extension model.

Those are useful integration surfaces while still allowing GBAP to keep business semantics outside the vendor.

### 5.4 Frappe's strongest advantage is less central in headless mode

Frappe won the real-browser daily-sales comparison. Leads, Deals, Notes and Call Logs were verified, and current official documentation exposes richer vendor-native telephony/WhatsApp paths.

That is genuine evidence and is not discounted as a failure.

However, the target architecture does not make Frappe CRM's browser application the normal employee shell. Communication channels are also expected to enter GBAP through governed integration boundaries rather than become permanent vendor-specific business dependencies.

Therefore Frappe's strongest advantage does not outweigh Twenty's schema, operational and headless-integration advantages for this role.

---

## 6. Licensing and commercial-boundary decision

Current official facts checked for this Gate:

### Twenty

Twenty's August 7, 2026 Terms state that the repository is mostly AGPLv3, with some MIT packages and some commercially licensed files. The free self-hosted edition is governed by the applicable open-source licenses; commercial self-host features require a purchased license key.

Current Twenty documentation states that free self-hosting includes Pro features, while Organization self-host features such as SSO and row-level permissions require an Enterprise/Organization key.

### Frappe CRM

Frappe's official licensing page states that Frappe CRM is AGPLv3. Frappe supports both self-hosting and Frappe Cloud. Current Frappe material emphasizes compute-based pricing rather than per-user pricing.

### Decision consequence

Frappe has the simpler licensing/economic posture in this comparison.

That advantage is not ignored. Twenty is selected subject to a mandatory production control:

```text
Before production deployment:
- inventory Twenty package/file licenses;
- identify any commercial-only feature/package;
- do not use commercial self-host features without the required license;
- keep GBAP-owned IAM / authorization authoritative;
- preserve adapter/process separation so GBAP business code is not copied into or derived from vendor code unnecessarily.
```

This record is an engineering governance decision, not legal advice. Formal production use must follow the organization's legal/license review process.

---

## 7. Current integration facts checked

External facts were refreshed on 2026-09-01 because these can change independently of the repository PoUs.

Twenty official documentation currently confirms:

- self-host deployment;
- REST and GraphQL APIs;
- signed webhooks;
- webhook-triggered and HTTP-action workflows;
- custom apps/extensions;
- Google/Microsoft email and calendar sync;
- commercial self-host premium-feature boundary.

Frappe official documentation currently confirms:

- self-host deployment and Frappe Cloud;
- Frappe CRM AGPLv3 license;
- email and CRM communication features;
- Twilio integration;
- Exotel integration;
- WhatsApp integration through Frappe WhatsApp;
- framework webhooks/APIs/custom scripts;
- compute-based cloud pricing model.

These external facts supplement but do not replace real PoU evidence. A documented feature that was not executed in the PoU remains `OFFICIAL CURRENT FACT / NOT POU PROVEN`.

Official sources checked:

- `https://twenty.com/terms`
- `https://twenty.com/pricing`
- `https://docs.twenty.com/user-guide/billing/capabilities/pricing-plans`
- `https://docs.twenty.com/getting-started/core-concepts/calendar-and-email`
- `https://docs.twenty.com/developers/extend/webhooks`
- `https://docs.twenty.com/developers/extend/extend`
- `https://docs.frappe.io/legal/others/license-and-trademark`
- `https://docs.frappe.io/crm/introduction`
- `https://docs.frappe.io/crm/introduction/installation`
- `https://docs.frappe.io/crm/whatsapp`
- `https://docs.frappe.io/crm/twilio`
- `https://docs.frappe.io/crm/exotel`
- `https://docs.frappe.io/customer-guide/pricing/frappe-cloud-pricing`

---

## 8. Frappe is retained, not discarded

Frappe CRM remains valuable evidence and a real replacement candidate.

```text
Frappe provider adapter
= RETAIN

Frappe historical PoU
= RETAIN PASS

Frappe canonical conformance
= RETAIN PASS

Frappe E1 export evidence
= RETAIN

Frappe role after this decision
= E1-VALIDATED ALTERNATE / CONTROL COMPARATOR
```

Do not delete Frappe adapter/evidence merely because Twenty is selected.

Do not run Frappe as an automatic hot standby.

Do not route writes automatically to Frappe when Twenty is unhealthy.

---

## 9. Actual replacement truth at selection

```text
Selected production engine candidate
= Twenty

Twenty semantic substitution evidence
= PASS / mandatory CRM V1 slice

Twenty E1 export
= PROVEN

Frappe semantic substitution evidence
= PASS / mandatory CRM V1 slice

Frappe E1 export
= PROVEN

E2 canonical re-import
= NOT PROVEN

E3 governed cutover / rollback
= NOT PROVEN

Full production replaceability
= NOT CLAIMED
```

The Decision Gate does not upgrade replacement evidence.

---

## 10. Selection conditions

Twenty selection is valid only under these conditions:

1. GBAP business code continues to call only GBAP canonical CRM capabilities;
2. Twenty-specific fields/nouns remain inside `providers/twenty-adapter`;
3. the first implementation track uses the tested `v2.37.0` integration identity until a separately governed upgrade/revalidation changes it;
4. provider version/image digest/adapter/config/schema provenance remains recorded;
5. E-level evidence is never automatically inherited after provider/adapter changes;
6. GBAP-owned IAM/authorization remains authoritative;
7. no unlicensed Twenty commercial feature is introduced;
8. Frappe E1 evidence and adapter remain available as alternate/control evidence;
9. no blind cross-CRM failover is introduced;
10. Production UI selection remains separate.

---

## 11. Gate result

```text
Production CRM Decision Gate
= PASS

Decision
= SELECT TWENTY

Selected architecture role
= HEADLESS CRM ENGINE BEHIND GBAP CANONICAL CONTRACT

Frappe
= RETAIN E1-VALIDATED ALTERNATE / CONTROL COMPARATOR

Atomic
= RETAIN NATIVE UI SOURCE/REUSE LANE

EspoCRM
= CONDITIONAL RESERVE / NOT PROMOTED

Production UI Selection
= NOT DECIDED

E2_REIMPORT_PROVEN
= NO

E3_CUTOVER_PROVEN
= NO

Production go-live
= NOT AUTHORIZED BY THIS GATE
```

---

## 12. Next legal work

No new numeric stage is created.

After this Decision Gate is merged and remotely read back, the next legal implementation work is:

> **Stage 3.4 continuation｜Selected Twenty Production Integration Foundation**

The purpose is not another PoU. It is to convert the selected, tested Twenty adapter path into the governed production implementation foundation while preserving the canonical contract and the ability to replace the engine later.

Minimum first actions:

1. define production Twenty integration configuration and environment contract;
2. pin exact upstream image/version identity and adapter revision;
3. define production secret reference and egress posture without storing raw credentials;
4. define organization/workspace scope and provider registration lifecycle;
5. define production data/bootstrap/migration boundary;
6. ensure GBAP Native UI/business services call only canonical CRM capabilities;
7. keep Frappe out of automatic runtime routing;
8. define backup/restore and vendor-engine disaster recovery expectations;
9. define upgrade/revalidation policy for Twenty;
10. decide separately whether DELTA-CRM-03 E2 re-import should be executed before production go-live or before a later replacement/cutover milestone.
