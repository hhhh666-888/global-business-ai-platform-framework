# CRM Stage 3.4 closure boundary for web contributors

The GBAP CRM employee product surface passed the Full CRM final Reverse Audit on accepted implementation HEAD `71d4b9769dc404d48ab99ae0acd5922b4749093f`.

Authoritative closure:

`docs/architecture/GBAP_Stage3_4_Full_CRM_Wiring_Final_Reverse_Audit_Closure_v1.0.md`

Contributor invariants:

- normal React product components use GBAP APIs/capability boundaries only;
- do not call Twenty REST/GraphQL or provider databases from the browser;
- do not use provider external IDs as product/business identity;
- keep employee-facing language free of Provider/Adapter/API/capability/test/evidence jargon;
- preserve employee < manager < super-admin permission separation;
- manager business configuration must not imply substrate/provider/Builder administration;
- mobile search/navigation and no-horizontal-overflow acceptance are regression requirements;
- Seed/Prototype/Placeholder data must not be presented as real business truth.

Production go-live is not authorized by this closure.
