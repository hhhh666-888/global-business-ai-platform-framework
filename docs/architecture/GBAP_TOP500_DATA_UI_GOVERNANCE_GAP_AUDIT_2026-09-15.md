# GBAP TOP500 → Data + UI + Data Governance Gap Audit

Date: 2026-09-15  
Authority input: Ecuador private-enterprise TOP500 v46 / 500 rows / 75 frozen columns  
Repository baseline: `main@f375ff45860838a9f52503d05a420155d5ebba8d`

## Result

**GAP CONFIRMED / IMPLEMENTATION AUTHORIZED / EXTEND EXISTING CRM**

The existing GBAP CRM remains the canonical operational system. The TOP500 workbook is a research-intelligence source and must not become a second customer database.

## Current reusable substrate

The current product already provides canonical Company/Account, Contact, Opportunity, Task, Note/Activity, Customer Intelligence, industrial/channel segmentation, list filtering, sorting, user column configuration, Saved Views, CSV import/export, and recycle-bin/lifecycle controls. These capabilities remain in place.

The current CSV contract is the existing 62-field operational/company-intelligence import. It is not replaced by TOP500 Research Intake.

## v46 source facts used for implementation

- 500 research rows.
- 75 frozen headers.
- Company name, RUC and research rank are intended to identify the research record; Research Intake must fail closed on duplicate RUC and duplicate rank.
- The workbook contains both stable public company facts and research estimates/recommendations.
- It also contains sales-execution columns such as sales status, owner and contact/follow-up dates. Those columns are not authority for live operational sales state after the data enters GBAP.

## Object-boundary decision

### Company — stable enterprise master

Add/reuse:

- `displayName`
- `commercialName`
- `registrationCountry`
- `registrationType`
- `registrationId`
- `website`
- `linkedinUrl`
- `industry`
- `annualRevenue`
- `employeeCount`
- `primaryPhone`
- `primaryEmail`
- `ownershipType`
- `verificationGrade`
- `strategicValueScore`
- `researchRank`
- `parentAccountBusinessId`
- `accountOwnerUserId`

For Ecuador, RUC is represented generically as `registrationCountry=EC`, `registrationType=RUC`, `registrationId=<RUC>`. No Ecuador-specific company schema is allowed.

### Site / Facility — required new first-class object

Location, plant/site counts, operating characteristics, key equipment, supply/outage condition, estimated or actual consumption, demand, transformer, generator, PV/BESS and site/roof conditions belong to Site. Existing company-level Customer Intelligence energy fields remain temporarily readable for compatibility but are not the target long-term ownership model.

### Contact / Target Role — decision chain

Named, verified people become Contacts. Role-only research hints become Target Roles and must not create fake persons. Contact must later gain decision function/level, influence, site relation and verification/employment metadata.

### Evidence / Provenance — required new first-class object

Verification sources, conclusions, URLs, estimate basis/confidence and public energy sources become Evidence. Evidence must keep value semantics such as `PUBLIC_REPORTED`, `ESTIMATED`, `INFERRED`, later also `ACTUAL` and `CUSTOMER_CONFIRMED`.

### Sales Signal

Solar/storage/generator/electrical opportunities and later dynamic trigger events become Sales Signals. Strategic value and current sales heat must remain distinct concepts.

### Energy Discovery

Publicly known energy data can seed discovery context only with provenance. Customer-confirmed bills, load information and technical documents become higher-authority operational discovery data and must never be overwritten by a research re-import.

### Operational Sales — protected

The following workbook columns are explicitly not authoritative after intake:

- 销售状态
- 当前项目阶段
- 销售负责人
- 首次联系日期
- 最后联系日期
- 下次跟进日期
- 客户反馈/关键异议

Research re-import must not overwrite employee notes, real customer feedback, customer-confirmed energy data, Contacts, Opportunities, Tasks, quotations, orders, or live sales state.

## 75-field mapping authority

The executable mapping is defined in:

`apps/web/src/lib/crmResearchIntake.ts`

It contains exactly 75 source headers and exactly 75 destination mappings. Any frozen header missing from an uploaded TOP500 v46 file causes schema recognition to fail closed.

Merge policies are explicit:

- `RESEARCH_FILL`: stable research master data may fill/update research-owned values.
- `EVIDENCE_APPEND`: append provenance; do not erase stronger evidence.
- `ESTIMATE_ONLY`: estimated values must never overwrite actual/customer-confirmed values.
- `PROTECTED_OPERATIONAL`: never import into live operational state.
- `DEFER_UNTIL_OBJECT_EXISTS`: retain mapping authority but wait for the destination first-class object instead of forcing the value into Company.

## UI gap

The current Companies list has working filtering, sorting, custom columns and Saved Views, but its column keys are hard-coded around the earlier Company + Customer Intelligence model.

Required change: move toward a field catalog with metadata for label, type, category, sort/filter/search support, default visibility, customer-type scope, source object and source field.

Foundation added in:

`apps/web/src/lib/crmCompanyFieldCatalog.ts`

The catalog establishes five groups:

1. Company Base
2. GBAP Value
3. Energy
4. Decision Chain
5. Sales Execution

It also establishes the five required product views:

- TOP500 Research
- Energy Opportunity
- Decision Chain
- Sales Development
- TOP30 Sprint

Existing Companies UI will be wired to the catalog in the next bounded UI batch rather than being rewritten wholesale.

## Data governance gap

Existing lifecycle/recycle controls are not yet sufficient for the TOP500 production operating model. Required follow-on objects/capabilities:

- Research Intake
- Import Batch
- Import Audit / per-field change audit
- Duplicate Management by registration identity
- Dry Run / mapping preview
- Idempotent upsert by `registrationCountry + registrationType + registrationId`
- Select-all-filtered bulk operations
- Delete impact preview
- Batch recycle restore/permanent delete
- protected permanent-delete rules
- batch-scoped rollback that does not revert later employee changes

These are not to be emulated by the legacy 62-field import.

## Compatibility decision

The 62-field import remains for existing operational/customer-intelligence workflows. TOP500 v46 enters through a distinct Research Intake schema. Both flows ultimately resolve to the same canonical Company master.

## First implementation batch

This branch starts the production-safe foundation only:

1. Extend canonical Company TypeScript model with global registration/research identity fields.
2. Add TOP500 v46 75-field schema recognition and validation.
3. Add explicit 75-field object/merge mapping.
4. Add safe Company patch generation that excludes operational sales columns.
5. Add configurable Company field catalog and required Saved View definitions.
6. Add focused contract tests.

The API persistence layer must validate and persist the new Company semantic fields before Research Intake is allowed to execute writes. Until then, the intake contract is read/validate/map-only and must not present itself as a completed importer.

## Gates

- No direct mass import to production in this batch.
- No fake Contacts from job-title-only research.
- No estimate presented as actual.
- No research overwrite of operational sales state.
- No Site/Evidence values permanently stuffed into Company just to make the UI appear complete.
- No Heavy CI until the bounded implementation batch is complete and focused checks have passed.

## Next legal implementation step

Complete API persistence validation for the new Company stable fields, then wire a Research Intake preview/dry-run surface using the v46 contract. After that, implement idempotent RUC-based upsert and Import Batch/Audit before any TOP500 write execution is enabled.
