# Global Business AI Platform｜Stage 3 Active Baseline v1.1

Status: `ACTIVE / FULL CRM REAL WIRING CLOSED / REVERSE AUDIT ACCEPTED / TWENTY SELECTED + ACTIVE / FRAPPE DEACTIVATED / PRODUCTION GO-LIVE NOT AUTHORIZED / E2-E3 NOT PROVEN`

Supersedes prospectively: `GBAP_STAGE3_ACTIVE_BASELINE_v1.0.md`

Project: **全球业务智能平台｜Global Business AI Platform**

Brand: **GBAP**

Repository: `hhhh666-888/global-business-ai-platform`

---

## 1. Current Stage 3 truth

```text
CRM engine = Twenty
role = headless CRM engine behind GBAP boundaries
semantic test baseline = Twenty v2.37.0
GBAP employee CRM UI = implemented and accepted
Full CRM REVERSE AUDIT = PASS
Frappe active runtime/CI = DEACTIVATED
Production go-live = NOT AUTHORIZED
```

Accepted Full CRM implementation remains recorded by:

`docs/architecture/GBAP_Stage3_4_Full_CRM_Wiring_Final_Reverse_Audit_Closure_v1.0.md`

Frappe deactivation is recorded by:

`docs/architecture/GBAP_Stage3_4_Frappe_Deactivation_Record_v1.0.md`

---

## 2. Accepted employee product scope

GBAP has a real CRM employee surface for:

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
Twenty = selected active replaceable provider
Frappe historical comparator evidence = RETAINED
Frappe runnable adapter/runtime = NOT ACTIVE / REMOVED
```

Historical Frappe PoU evidence continues to show that a second real CRM engine previously implemented the mandatory CRM v1 slice, but Frappe is no longer an immediately available runtime fallback.

Current replacement evidence does not authorize automatic stateful failover.

---

## 5. Accepted Gate evidence

Accepted Full CRM implementation HEAD:

`71d4b9769dc404d48ab99ae0acd5922b4749093f`

Same-HEAD Gate results:

- `33478337281` Full CRM — SUCCESS;
- `33478337288` UI Reuse — SUCCESS;
- `33478337318` production foundation — SUCCESS;
- `33478337280` canonical hardening — SUCCESS.

Historical Frappe comparator PASS evidence remains preserved under `docs/evidence/stage3-4-frappe/` and its associated records, but no active Frappe CI/runtime is claimed after v1.1.

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
Automatic Twenty -> another CRM failover = NO
Frappe current installed fallback = NO
Frappe synchronized hot standby = NO
Production go-live = NOT AUTHORIZED
```

Other platform bricks—customer acquisition, social/channels, platform AI, enterprise knowledge, quotation/EPC and project execution—remain separately selected/integrated capabilities rather than permanent Twenty dependencies.

---

## 8. Current Gate

```text
Stage 3.3 / 3.3.1 historical substrate = CLOSED
Stage 3.4 provider audit / historical PoUs = PASS
Canonical CRM hardening = PASS
Twenty production integration foundation = PASS
Full CRM real wiring = PASS / CLOSED
Full CRM final REVERSE AUDIT = PASS / CLOSED
UI + permission + usability acceptance = PASS
Twenty = ACTIVE SELECTED CRM ENGINE
Frappe = HISTORICAL EVIDENCE ONLY / ACTIVE ENGINEERING REMOVED
Production go-live = BLOCKED
```

---

## 9. Future Frappe rule

If Frappe is needed again, it must be treated as a reactivation/new validation track. Historical adapter/test code may be recovered from Git history, but a current version, image identity, adapter revision and fresh conformance evidence must be established before Frappe can return to active provider status.

---

## 10. Next legal Stage 3 work

No new numeric identifier is assigned automatically.

Current descriptive work item remains:

> **Stage 3.4 continuation｜CRM Production Readiness + Controlled Go-Live Preparation**

This work must produce real production deployment/restore/operations evidence and an explicit go-live decision before production use is authorized.
