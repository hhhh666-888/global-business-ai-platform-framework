# Global Business AI Platform｜Stage 3 Active Baseline v0.8

Status: `ACTIVE / PRODUCTION CRM DECISION GATE PASS / TWENTY SELECTED AS HEADLESS CRM ENGINE / FRAPPE RETAINED AS E1-VALIDATED ALTERNATE / PRODUCTION UI NOT YET SELECTED / E2-E3 NOT PROVEN`

Supersedes prospectively: `GBAP_STAGE3_ACTIVE_BASELINE_v0.7.md`

Project: **全球业务智能平台｜Global Business AI Platform**

Brand: **GBAP**

Current repository: `hhhh666-888/global-business-ai-platform`

Baseline entering this decision: `92fc1ab9063c2c178e081c0fb5f546c320f03e4a`

This baseline advances Stage 3 after the descriptive `Stage 3.4 continuation｜Production CRM Decision Gate`. It does not assign a new numeric stage, authorize production go-live, select the employee UI, claim E2/E3, or authorize automatic cross-CRM failover.

---

## 1. Production CRM engine decision

Decision record:

`docs/architecture/GBAP_Stage3_4_Production_CRM_Decision_Gate_v0.1.md`

Machine-readable matrix:

`docs/evidence/stage3-4-production-crm-decision/production-crm-decision-matrix-v0.1.json`

Decision:

```text
Production CRM Decision Gate
= PASS

Selected engine
= TWENTY

Selected role
= HEADLESS CRM ENGINE BEHIND GBAP-OWNED CANONICAL CONTRACT

Initial tested integration baseline
= Twenty v2.37.0
```

This selection is for the next production implementation track. It is not permission for business code to use Twenty-specific semantics.

---

## 2. Architecture remains GBAP-owned

```text
GBAP employee
→ GBAP-owned native UI
→ GBAP business/domain services
→ fogu-ang-owned Canonical CRM Contract
→ Twenty adapter
→ Twenty headless CRM engine
```

Canonical mandatory business types remain:

```text
Account
Contact
Opportunity
```

Canonical capability namespace remains:

```text
crm.v1.account.*
crm.v1.contact.*
crm.v1.opportunity.*
crm.v1.snapshot.export
```

Twenty-specific Company / Person / Opportunity field names remain adapter implementation details.

---

## 3. Why Twenty was selected

Weighted Decision Gate result:

```text
Twenty
= 88.7 / 100

Frappe CRM
= 80.6 / 100
```

The decisive evidence was not vendor UI preference. It was the combined architecture fit:

- both engines passed identical canonical conformance;
- Twenty proved stronger first-class custom-object/schema extensibility;
- Twenty had the materially smaller tested operations footprint;
- Twenty's API/webhook/custom-app model fits the headless provider architecture strongly;
- Twenty's TypeScript/Node-facing extension model is closer to the current GBAP service stack;
- Frappe retains superior proven vendor-native daily-sales/communication workflow evidence;
- Frappe retains a simpler licensing/economic posture;
- neither provider has E2/E3 proof.

Because GBAP owns the employee UI, vendor-native UI strength is not the dominant engine criterion.

---

## 4. Frappe disposition

Frappe CRM is not deleted or declared failed.

```text
Frappe adapter
= RETAIN

Frappe historical PoU
= RETAIN PASS

Frappe canonical conformance
= RETAIN PASS

Frappe E1 export evidence
= RETAIN

Frappe role
= E1-VALIDATED ALTERNATE / CONTROL COMPARATOR
```

Forbidden interpretations:

```text
Frappe automatic hot standby
= NO

Automatic Twenty->Frappe write failover
= NO

Frappe E2 target
= NOT YET PROVEN

Frappe E3 cutover target
= NOT YET PROVEN
```

---

## 5. Atomic and EspoCRM disposition

```text
Atomic CRM
= NATIVE SOURCE/UI REUSE ASSET
= NOT CRM ENGINE

EspoCRM
= CONDITIONAL RESERVE
= NOT PROMOTED
```

No fourth generic CRM PoU is authorized unless a specific material blocker appears in the selected track and cannot be resolved with the current candidates.

---

## 6. Licensing / production boundary

Current verified posture:

```text
Twenty repository
= mostly AGPLv3 + some MIT + some commercially licensed files/features

Twenty self-host free
= available under applicable open-source licenses

Twenty commercial self-host features
= require valid commercial/Organization license key
```

Production-control requirements:

1. maintain package/file license inventory;
2. identify commercial-only packages/features;
3. do not use premium/commercial self-host features without a valid license;
4. keep GBAP IAM/authorization authoritative rather than depending on Twenty premium SSO/row-level features;
5. isolate vendor source modification and track AGPL obligations;
6. run formal legal/license review before production go-live.

Frappe CRM's AGPLv3 and compute-based/unlimited-user posture remains a positive alternate-provider factor but does not reverse the engine decision.

---

## 7. Replacement truth after selection

```text
Twenty E1_EXPORT_PROVEN
= YES

Frappe E1_EXPORT_PROVEN
= YES

Cross-provider semantic substitution / mandatory CRM V1
= YES

E2_REIMPORT_PROVEN
= NO

E3_CUTOVER_PROVEN
= NO

Full production replaceability
= NOT CLAIMED
```

Selecting Twenty does not advance its replacement level beyond evidence actually proven.

---

## 8. Upgrade and provenance rule

The initial production implementation track starts from the tested integration identity:

`Twenty v2.37.0`

Any later upstream or adapter change must not silently inherit the current evidence.

A changed integration must record:

- upstream product/version;
- immutable image digest or commit;
- adapter revision;
- canonical contract version;
- config/schema revision;
- compatibility/revalidation evidence;
- audit decision.

---

## 9. Production UI remains separate

```text
Production CRM engine
= TWENTY

Production employee UI
= NOT YET SELECTED / NOT IMPLIED BY TWENTY SELECTION
```

The intended direction remains a GBAP-owned native UI. Atomic MIT source may supply selected UI primitives where valuable.

Twenty's own dashboard is not automatically adopted as the employee product shell.

---

## 10. Current Gate

```text
Stage 3.4 bounded substrate hardening
= PASS / COMPLETE

Production CRM Decision Gate
= PASS

Selected CRM engine
= TWENTY

Twenty canonical conformance
= PASS

Frappe canonical conformance
= PASS

Frappe alternate evidence
= RETAIN

Production UI Selection
= NOT YET DECIDED

DELTA-CRM-03
= NOT IMPLEMENTED

E2_REIMPORT_PROVEN
= NO

E3_CUTOVER_PROVEN
= NO

Production go-live
= NOT AUTHORIZED
```

---

## 11. Next legal Stage 3 work item

No new numeric identifier is assigned.

The next legal work item is:

> **Stage 3.4 continuation｜Selected Twenty Production Integration Foundation**

This is production-foundation engineering, not another PoU.

Required execution order:

1. define production Twenty provider configuration/environment contract;
2. pin upstream version/image identity and adapter revision;
3. define secret reference, egress and failure posture;
4. define organization/workspace scope and provider lifecycle;
5. define production data/bootstrap/import boundary;
6. connect GBAP Native UI/business-service paths only through canonical CRM capabilities;
7. define backup/restore and provider-engine disaster recovery posture;
8. define Twenty upgrade/revalidation policy;
9. retain Frappe outside normal runtime routing;
10. decide the timing of DELTA-CRM-03 E2 re-import work before any claim of higher replacement/cutover evidence;
11. do not authorize production go-live until the selected integration foundation has its own implementation Acceptance and operational Gate.
