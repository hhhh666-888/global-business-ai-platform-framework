# GBAP Stage 3.4｜Twenty Real Account Wiring Slice v0.1

Status: **PASS / IMPLEMENTED / VALIDATED / REVERSE AUDIT COMPLETE**

Base: `main@4111b7eafc4576f6693f797e965233b7f5b5f487`

Accepted implementation HEAD: `abb2666a3b7e696d3f4542b431ac873462ac615b`

Predecessor: `Twenty UI Reuse Spike + Full CRM Surface Prototype = PASS / REVERSE AUDIT COMPLETE`

## Goal

Turn the first accepted CRM visual surface into a real provider-backed employee workflow:

```text
React Companies UI
  -> GBAP authenticated API
  -> GBAP canonical capability
  -> capability binding / provider resolution
  -> Twenty adapter
  -> Twenty
```

The browser must not call Twenty REST/GraphQL endpoints directly.

## Selected first slice

Business surface: **Companies / 客户公司**

Canonical GBAP capabilities:

- `crm.v1.account.list`
- `crm.v1.account.create`

Provider mapping already established by the accepted canonical contract:

```text
GBAP Account -> Twenty Company
```

No new canonical business type is created by this slice.

## Existing substrate reused

This slice deliberately reuses, rather than duplicates:

- existing GBAP OIDC / Keycloak trust boundary;
- existing `POST /api/capabilities/{capability}/invoke` API;
- existing capability binding/provider resolution;
- existing canonical CRM request validation;
- existing durable external mapping table;
- existing Twenty adapter implementation of Account list/create;
- existing real Twenty PoU/canonical conformance runner.

## Frontend implementation

New React client code:

- `apps/web/src/lib/gbapClient.ts`
  - PKCE OIDC login/session reuse;
  - authenticated calls only to the GBAP API;
  - canonical Account list/create helpers.
- `apps/web/src/hooks/useGbapSession.ts`
  - session initialization and `/api/me` identity read-back.
- `apps/web/src/components/CompaniesSurface.tsx`
  - authenticated real Account list;
  - refresh;
  - real Account create;
  - GBAP business-ID/mapping visibility;
  - explicit browser-boundary indicator.

The prior static company seed list is no longer used by the Companies page.

## Durable ID bounded choice

For this first UI wiring slice, the GBAP browser client creates the `businessId` UUID before sending `crm.v1.account.create`.

This satisfies the current canonical create contract because the ID is GBAP-owned and provider-neutral; it is **not** a claim that browser-side durable-ID issuance is the final production architecture.

A future hardening decision may move durable-ID issuance fully server-side without changing the provider contract or employee UI semantics.

## Authentication / authorization boundary

Real session path:

```text
Browser PKCE -> GBAP OIDC client -> access token -> GBAP API -> /api/me + canonical capability endpoint
```

Authenticated UI role is now derived from the real `/api/me` role set:

- authenticated `substrate-admin` -> super-admin CRM UI;
- authenticated non-admin user, including `substrate-user` -> employee CRM UI.

The query-string role selector is retained only for unauthenticated visual-prototype testing and cannot override an authenticated identity.

## Final validation evidence

Accepted implementation HEAD: `abb2666a3b7e696d3f4542b431ac873462ac615b`

### Workflow 1 — Stage 3.4 Twenty Account UI Wiring

Run: `33447589746` — **SUCCESS**

Jobs:

- `React CRM / canonical Account boundary` — **SUCCESS**
- `Real Twenty / canonical Account list+create proof` — **SUCCESS**

Browser evidence artifact:

- Artifact ID: `9778642206`
- Name: `twenty-account-ui-browser-evidence`
- Digest: `sha256:aadbdcc4205428bc89602cb766916ff3e94fb425ecb44eaee09502bf537c6b77`

Real-engine evidence artifact:

- Artifact ID: `9778741534`
- Name: `twenty-account-real-engine-evidence`
- Digest: `sha256:2c9532909eeb576778b491cd64918d9760e72f35bff21d10cc1d6e8f5b2a76dc`

Validated results:

- TypeScript/Vite production build PASS.
- canonical Account browser-boundary source scan PASS.
- Playwright browser suite: `5 passed / 5 skipped`; applicable acceptance tests PASS.
- production web Docker image build PASS.
- canonical CRM v1 conformance: `14/14 PASS`.
- Stage 3.4.1 Twenty real-engine PoU: `34/34 PASS`.
- canonical Account create + automatic durable mapping PASS.
- canonical Account list reverse-resolves Twenty provider IDs to GBAP durable IDs PASS.
- Company creation through `GBAP -> adapter -> Twenty` PASS.
- provider outage isolation, recovery/data continuity, mapping protection, governed mapping release, provider removal and GBAP survival all remain PASS.

### Workflow 2 — Stage 3.4 Twenty UI Reuse Spike regression

Run: `33447589760` — **SUCCESS**

The existing accepted CRM shell remains green at the same final implementation HEAD.

## Final browser visual read-back

The final `companies-real-wiring.png` was visually inspected after the authenticated-role fix.

Confirmed:

- authenticated identity displayed as `sales.user`;
- profile displayed as employee / logged-in;
- employee navigation retained: Workbench, Companies, People, Opportunities, Tasks, Notes, Email, Calendar, Files, Saved Views/Favorites;
- manager/admin-only CRM entries are absent: Dashboard, Import/Export, Automation, Settings;
- Companies shows GBAP API authenticated status;
- Companies shows GBAP IDs and mapped status;
- UI states that the browser is not directly connected to Twenty.

## Acceptance gate result

1. React/TypeScript/Vite production build — **PASS**.
2. Existing CRM shell browser regression — **PASS**.
3. Authenticated Companies surface invokes `crm.v1.account.list` through the GBAP API — **PASS**.
4. Creating a company invokes `crm.v1.account.create` through the GBAP API — **PASS**.
5. Create payload contains provider-neutral GBAP `businessId` and requested `displayName` — **PASS**.
6. Browser test observes no direct Twenty port, hostname or `/rest/companies` provider call — **PASS**.
7. Returned GBAP business ID / mapping state is visible in the Companies UI — **PASS**.
8. Real Twenty PoU plus canonical conformance proves Account create/list through existing GBAP API + adapter path — **PASS**.
9. Production web Docker image build — **PASS**.
10. Browser and real-engine evidence artifacts retained — **PASS**.
11. Authenticated employee role cannot expose manager/admin CRM navigation through prototype query-role scaffolding — **PASS**.

## Reverse-audit conclusion

**PASS / NO BLOCKING DEFECT REMAINS**

The final reverse audit found the authenticated-role UI semantic defect in the earlier implementation, corrected it, strengthened the browser acceptance test, and reran the final implementation HEAD through both relevant workflows. The corrected final HEAD is accepted.

Detailed reverse audit:

`docs/architecture/GBAP_Stage3_4_Twenty_Real_Account_Wiring_Slice_REVERSE_AUDIT_v0.1.md`

## Explicit non-claims / bounded carries

- Only Companies / Account list+create is real in this slice.
- Contact, Opportunity, Task, Notes, Email, Calendar, Files, Dashboard, Workflow and Settings are not made real merely because their UI exists.
- No direct browser-to-Twenty access is authorized.
- Browser-side GBAP UUID issuance remains a bounded implementation choice, not the frozen final production durable-ID issuance architecture.
- The current authenticated UI role projection is intentionally narrow (`substrate-admin` vs employee); broader production authorization semantics remain a later hardening concern.
- This does not resolve the `twenty-ui` production license/provenance carry.
- This does not prove production deployment configuration outside the tested substrate/PoU scope.
- No E2/E3 claim is made.

## Closure rule

The code-bearing accepted implementation HEAD is `abb2666a3b7e696d3f4542b431ac873462ac615b`. Governance closure commits after this point are documentation-only. Per the accepted project rule, heavy real-engine CI is not repeated solely for documentation-only closure commits; the branch must instead be compared against the accepted implementation HEAD before merge to prove only governance documentation changed.

## Next legal action after merge

After this slice is merged and `main` remote read-back is verified, select the next real Twenty CRM capability slice without inventing a new formal stage number. Dependency order makes **Contact / People real wiring** the leading next candidate.
