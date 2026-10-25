# GBAP Stage 3.4 hands-on continuation｜PoU-C Frappe CRM Real-Engine Comparator v0.1

**Status:** `PASS / REAL ENGINE + REAL BROWSER VERIFIED / PRODUCTION CRM SELECTION NOT AUTHORIZED`

**Authority:** `docs/architecture/GBAP_STAGE3_ACTIVE_BASELINE_v0.4.md`

**Decision source:** `docs/architecture/GBAP_Stage3_4_CRM_Audit_Decision_Record_v0.1.md`

**Permanent evidence:** `docs/evidence/GBAP_Stage3_4_Frappe_Real_Engine_Comparator_PoU_Record_v0.1.md`

**Evidence run:** `33408909848` — `36 assertions / 0 open failure`

**Mode:** `HEADLESS_PROVIDER / MANAGED SERVICE`

**Upstream:** `frappe/crm`

**Pinned release:** `v1.82.0`

**Pinned upstream commit:** `48cb3cccec12ef798f8faacc165fff3dc008a8fa`

## Purpose

PoU-C tests Frappe CRM as the second real CRM-engine comparator after Twenty. It is not a Frappe/ERPNext platform adoption and it does not replace the GBAP employee product, IAM, canonical identifiers, provider registry, mapping registry, audit trail or replacement boundary.

The comparison target is the part where Frappe differs materially from Twenty: practical daily sales flow around Leads, Deals and communication-oriented records, while still remaining an independently removable provider behind GBAP.

## Required topology

```text
GBAP / GBAP
→ GBAP capability + provider boundary
→ frappe-adapter
→ pinned Frappe CRM v1.82.0 stack
   → CRM Organization
   → CRM Lead
   → CRM Deal
   → FCRM Note
   → CRM Call Log
```

The Frappe stack is an isolated PoU runtime and may be destroyed without destroying GBAP.

## Acceptance assertions

A PASS requires real runtime evidence, not installation-only evidence.

1. Frappe CRM release and upstream commit are pinned.
2. GBAP web, API and Keycloak substrate start cleanly.
3. Frappe CRM starts from the pinned release image and its image identity is captured.
4. A dedicated Frappe service user is created for the adapter.
5. A dedicated Frappe API key/secret authenticates successfully.
6. `CRM Lead` REST/DocType metadata is reachable.
7. `CRM Deal` REST/DocType metadata is reachable.
8. A real custom field is added to `CRM Deal`.
9. Frappe API v2 metadata reflects the custom field.
10. Frappe is registered as a GBAP `HEADLESS_PROVIDER` without storing a raw secret in the provider record.
11. Provider health reaches `HEALTHY`.
12. A real organization is created through the GBAP capability boundary.
13. A real lead is created through the GBAP capability boundary.
14. Lead listing through GBAP returns the created lead.
15. A real deal linked to the organization/lead is created through GBAP.
16. The deal can be updated through GBAP using the Frappe custom field.
17. Deal listing through GBAP returns the created deal.
18. A Frappe note linked to the lead/deal is created through GBAP.
19. A manual call-log record linked to the lead is created through GBAP.
20. Communication-oriented note/call-log records can be listed through GBAP.
21. GBAP durable canonical mappings are created for the external CRM records.
22. A provider-neutral snapshot export contains the created organization, lead, deal, note and call log.
23. Schema/customization evidence is exported.
24. Real Chromium login to Frappe CRM succeeds.
25. The real Leads UI renders the created lead.
26. The real Deals UI renders the created deal/account context.
27. The real Notes UI renders the linked note.
28. The real Call Logs UI renders the created call record.
29. Stopping Frappe makes the GBAP provider unhealthy without collapsing GBAP API/web.
30. CRM invocation fails closed/degraded at the provider boundary while Frappe is down.
31. Restarting Frappe restores provider health and preserves CRM records.
32. Durable mappings block accidental provider removal.
33. Mappings can be released through governed GBAP APIs.
34. Provider/mapping lifecycle audit evidence is present.
35. Frappe provider can then be unregistered.
36. GBAP remains healthy after complete Frappe PoU removal.

## Comparator evidence

The permanent record must retain a factual comparison against the already-proven Twenty PoU-A on at least:

- provider-boundary fit;
- organization/account model;
- lead workflow;
- opportunity/deal workflow;
- custom schema/metadata mechanism;
- notes/call communication surfaces;
- real browser daily-sales surface;
- export/exit evidence;
- outage isolation;
- operational footprint/coupling.

The comparator may describe observed differences. It must not select a production CRM without a separate authorized decision.

## Explicit nonclaims

This PoU does **not** authorize:

- Frappe CRM as production CRM;
- ERPNext adoption;
- Frappe Framework as the GBAP substrate;
- Frappe UI as the final GBAP employee UI;
- direct Frappe CRM source modifications as GBAP product code;
- real Twilio, Exotel or WhatsApp delivery without external credentials;
- `E2_REIMPORT_PROVEN`;
- `E3_CUTOVER_PROVEN`;
- a formal numeric stage after Stage 3.4.1.

A synthetic manual call-log record proves the CRM communication record model and daily-sales surface only; it does not claim external telephony integration is operational.

## Gate

`PASS / REAL ENGINE + REAL BROWSER VERIFIED / PRODUCTION CRM SELECTION NOT AUTHORIZED`

GitHub Actions Run `33408909848` proved all 36 runtime/browser assertions with 0 open failure and wrote the permanent evidence record. The committed package lock and durable token-refresh runner are retained on the PoU branch. A final PR-head revalidation is required before merge; this Gate does not authorize production CRM selection, `E2_REIMPORT_PROVEN`, or `E3_CUTOVER_PROVEN`.