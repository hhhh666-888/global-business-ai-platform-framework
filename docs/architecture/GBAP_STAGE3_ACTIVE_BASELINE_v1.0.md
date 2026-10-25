# Global Business AI Platform｜Stage 3 Active Baseline v1.0

Status: `ACTIVE / FULL CRM REAL WIRING CLOSED / REVERSE AUDIT ACCEPTED / TWENTY REMAINS SELECTED HEADLESS CRM ENGINE / PRODUCTION GO-LIVE NOT AUTHORIZED / E2-E3 NOT PROVEN`

Supersedes prospectively: `GBAP_STAGE3_ACTIVE_BASELINE_v0.9.md`

Project: **全球业务智能平台｜Global Business AI Platform**

Brand: **GBAP**

Repository: `hhhh666-888/global-business-ai-platform`

---

## 1. Current Stage 3 truth

The selected CRM direction remains:

```text
CRM engine = Twenty
role = headless CRM engine behind GBAP boundaries
semantic test baseline = Twenty v2.37.0
GBAP employee CRM UI = implemented and accepted
Full CRM REVERSE AUDIT = PASS
Production go-live = NOT AUTHORIZED
```

The accepted implementation is recorded by:

`docs/architecture/GBAP_Stage3_4_Full_CRM_Wiring_Final_Reverse_Audit_Closure_v1.0.md`

---

## 2. Accepted employee product scope

GBAP now has a real CRM employee surface for:

- Workbench;
- customer companies;
- contacts;
- opportunities/pipeline;
- tasks;
- notes/activity;
- email state/records;
- calendar state/events;
- files;
- views/favorites;
- cross-object search.

Manager scope additionally includes Dashboard, Import/Export and business configuration entry.

Super-admin scope additionally includes Workflows, CRM Settings/Builder governed management entry and authenticated platform substrate administration.

---

## 3. Canonical and operational boundary

Canonical CRM v1 remains frozen around:

```text
Account
Contact
Opportunity
```

Mandatory canonical capabilities remain `gbap.crm.v1` contract capabilities.

Operational CRM capabilities cover Contact/Opportunity update, Tasks, Notes, Activity, Email and Calendar without silently promoting every provider object into frozen canonical domain truth.

Files and Saved Views remain GBAP-native product state.

---

## 4. Replaceability truth

```text
GBAP durable business IDs = OWNED
provider/source provenance = OWNED
provider mappings = OWNED
capability binding = OWNED
employee UI / UX = OWNED
business lifecycle state = OWNED
Twenty = replaceable provider
Frappe = retained comparator / alternate evidence
```

Current replacement evidence does not authorize automatic stateful failover.

---

## 5. Accepted Gate evidence

Accepted implementation HEAD:

`71d4b9769dc404d48ab99ae0acd5922b4749093f`

Same-HEAD Gate results:

- `33478337281` Full CRM — SUCCESS;
- `33478337288` UI Reuse — SUCCESS;
- `33478337318` production foundation — SUCCESS;
- `33478337280` canonical hardening — SUCCESS.

Real-engine artifact: `9789140662`, digest `sha256:47bdad792a103e8dd5f85a0b182ec0aac684c66f70ca20d5b902555baccf5ebb`.

Browser artifact: `9789021498`, digest `sha256:27f7df2233f32213f16e88368a4841a815ee9291d564dc1dcaebc47ce3b4c60c`.

---

## 6. Production boundary remains blocked

This baseline does not convert the accepted CRM into a production go-live authorization.

Still required before go-live:

- real production image/config/schema identity;
- production secrets and least-privilege credentials;
- production provider registration and health acceptance;
- production schema/bootstrap acceptance;
- backup + clean-environment restore drill;
- monitoring/operations acceptance;
- license/legal acceptance;
- explicit production go-live Gate.

For Twenty v2.37 Email/Calendar channel state, the adapter-only read-only PostgreSQL metadata access remains a bounded exception; it must use a dedicated least-privilege credential and must not become general business-record DB access.

---

## 7. Nonclaims

```text
E2_REIMPORT_PROVEN = NO
E3_CUTOVER_PROVEN = NO
Automatic Twenty -> Frappe failover = NO
Frappe synchronized hot standby = NO
Production go-live = NOT AUTHORIZED
```

Other platform bricks—customer acquisition, social/channels, platform AI, enterprise knowledge, quotation/EPC and project execution—remain separately selected/integrated capabilities rather than permanent Twenty dependencies.

---

## 8. Current Gate

```text
Stage 3.3 / 3.3.1 historical substrate = CLOSED
Stage 3.4 provider audit / PoUs = PASS
Canonical CRM hardening = PASS
Twenty production integration foundation = PASS
Full CRM real wiring = PASS / CLOSED
Full CRM final REVERSE AUDIT = PASS / CLOSED
UI + permission + usability acceptance = PASS
Production go-live = BLOCKED
```

---

## 9. Next legal Stage 3 work

No new numeric identifier is assigned automatically.

Next descriptive work item:

> **Stage 3.4 continuation｜CRM Production Readiness + Controlled Go-Live Preparation**

This work must produce real production deployment/restore/operations evidence and an explicit go-live decision before production use is authorized.
