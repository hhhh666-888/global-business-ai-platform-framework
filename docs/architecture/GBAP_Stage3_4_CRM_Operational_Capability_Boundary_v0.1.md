# GBAP Stage 3.4 continuation｜CRM Operational Capability Boundary v0.1

Status: **ACTIVE DESIGN / IMPLEMENTATION AUTHORITY FOR FULL CRM WIRING / NOT A NEW NUMERIC STAGE**

Parent track: `GBAP_Stage3_4_Twenty_Full_CRM_Wiring_Track_v0.1.md`

## 1. Problem

The canonical `gbap.crm.v1` contract intentionally owns only the durable core business semantics already proven for:

- Account
- Contact
- Opportunity

The Full CRM Wiring Track must also make mature CRM operational features real:

- Contact ↔ Account relation work;
- Opportunity lifecycle/stage operations;
- Tasks;
- Notes;
- Timeline/activity context;
- later Files, Views, Email/Calendar and administration capabilities.

It is incorrect to solve this by either:

1. silently expanding frozen canonical Phase-2 semantics; or
2. allowing React pages to pass Twenty record IDs / call Twenty REST directly.

## 2. Decision

Introduce a GBAP-owned **CRM operational capability boundary** beside, not inside, the frozen core canonical contract.

Namespace direction:

```text
crm.ops.v1.*
```

This namespace means:

- GBAP owns the callable business/operational interface;
- the capability is versioned;
- the feature may map to provider-native operational objects;
- it does not automatically become a new frozen canonical Phase-2 domain entity;
- provider IDs remain behind the API/adapter boundary.

## 3. Identity rule

Normal browser business code must use GBAP-facing IDs.

For relation-bearing operations, browser payloads use:

```json
{
  "target": {
    "businessType": "Account | Contact | Opportunity",
    "businessId": "GBAP-ID"
  }
}
```

The GBAP API resolves that business ID through the current provider mapping before invoking the adapter.

Provider-specific identifiers such as Twenty company/person/opportunity IDs must not be required inputs from normal React pages.

## 4. Operational record identity

Tasks and Notes need stable GBAP-facing identity because users must later update, complete, edit or reference them.

Therefore create operations should issue/accept a GBAP operational `businessId` and establish durable mapping using operational business types such as:

- `CrmTask`
- `CrmNote`

This use of the mapping substrate does **not** declare Task/Note to be new Phase-2 canonical entities. It preserves stable product identity and provider replacement rights for operational records.

List responses must reverse-resolve the provider record identity to the GBAP operational business ID before returning data to normal product code.

## 5. Initial bounded capability set

The first operational implementation should prove only the capabilities needed to remove the current Tasks/Notes blockers:

```text
crm.ops.v1.task.create
crm.ops.v1.task.list
crm.ops.v1.task.update

crm.ops.v1.note.create
crm.ops.v1.note.list
crm.ops.v1.note.update
```

A later capability may add an activity/timeline aggregate after Task/Note behavior and provider schema are proven:

```text
crm.ops.v1.activity.list
```

Contact-company linking and Opportunity lifecycle mutation should reuse the same relation/mapping resolver pattern, but their exact capability shapes remain blocked until their current provider mutation semantics are proven. Do not silently mutate `gbap.crm.v1` to obtain them.

## 6. Task shape — bounded product contract

GBAP-facing Task data should include only business-useful fields needed by the employee UI:

- `businessId`
- `title`
- `bodyMarkdown` optional
- `dueAt` optional
- `status`
- `assignee` only when governed assignment semantics are implemented
- `targets[]` as GBAP `{businessType,businessId}` references
- timestamps where useful

Initial status normalization may preserve a small GBAP enum only after the real Twenty v2.37.0 values are verified by real-engine evidence. Until proven, do not invent transition semantics.

## 7. Note shape — bounded product contract

GBAP-facing Note data should include:

- `businessId`
- `title`
- `bodyMarkdown` optional
- `targets[]` as GBAP `{businessType,businessId}` references
- timestamps where useful

Rich editor/provider-native payloads may remain adapter implementation detail. Ordinary employee product code should not need provider-specific `bodyV2`/BlockNote structures to perform a basic note workflow.

## 8. Provider adapter rule

For Twenty v2.37.0 the adapter may use generated workspace REST/GraphQL objects such as Task, Note and their target junctions, but those details remain inside `providers/twenty-adapter`.

Before acceptance the real-engine CI must prove against the tested Twenty image that:

- Task create/list/update works;
- Note create/list/update works;
- relation target creation works for standard Account/Contact/Opportunity equivalents;
- linked records survive provider restart;
- no browser direct-provider request is required.

Public/current documentation is supporting evidence only; the repository's real-engine PoU is the acceptance authority for the selected tested image.

## 9. UI messaging rule

Employee UI may show:

- title/body/due/status;
- linked customer/contact/opportunity names;
- success/error/loading/empty states;
- clear next actions.

Employee UI must not show simply as implementation explanation:

- provider IDs;
- TaskTarget/NoteTarget junction terminology;
- Twenty REST paths;
- adapter/capability names;
- mapping/debug state.

## 10. Permission rule

Initial operational capabilities remain behind GBAP authenticated `substrate-user` access and the selected capability binding.

This is only the substrate minimum. Full-track closure still requires final CRM permission review so ordinary employees cannot obtain manager/admin operations by UI hiding alone.

## 11. Acceptance gate

The operational boundary is accepted only when all applicable checks pass:

1. React calls only GBAP API/capability routes;
2. relation-bearing requests use GBAP business IDs;
3. provider IDs are resolved server-side;
4. Task/Note create produces durable operational mapping;
5. list reverse-resolves operational and relation IDs;
6. update accepts GBAP operational ID rather than provider ID;
7. Twenty adapter owns provider object/junction details;
8. real Twenty v2.37.0 proves CRUD and relation behavior;
9. browser acceptance proves real employee workflows;
10. engineering/debug details remain absent from employee-facing UI;
11. existing Account/Contact/Opportunity accepted behavior does not regress.

## 12. Non-claims

This record does not claim:

- Tasks or Notes are new frozen Phase-2 canonical entities;
- all provider-native CRM objects are interchangeable;
- Email/Calendar/Files/Views/Workflows are already solved;
- the Full CRM Wiring Track is complete;
- E2 re-import or E3 cutover is proven.
