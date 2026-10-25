# GBAP Twenty v2.41 Upgrade Admission Gate v0.1

Status: **ACTIVE / SOURCE-ADMISSION ONLY / WINDOWS UAT UPGRADE NOT YET AUTHORIZED**

Date: 2026-09-20

Current accepted GBAP main at Gate entry:

`e002cdf880b079bd013b7c5a9370b952bffcfa7c`

Current company Windows UAT Twenty baseline at Gate entry:

`Twenty v2.37.0`

Target candidate:

`Twenty v2.41.0`

Upstream release:

- tag: `twenty/v2.41.0`
- published: 2026-09-17
- upstream commit: `d1bb92d111f91529478da56aa677efbdba230c00`

This Gate reopens only the **Twenty upstream-version boundary**. It does not reopen the permanent GBAP provider, identity, canonical-ID, authorization, audit, or Production boundaries.

---

## 1. Why this Gate exists

Twenty v2.37.0 was intentionally frozen to make the first Candidate B App plan/install evidence deterministic. That freeze was a validation baseline, not a permanent product-version policy.

Since v2.37.0, Twenty shipped v2.38.1, v2.39.0, v2.40.0 and v2.41.0. The delta materially affects the exact areas GBAP is currently integrating:

- native AI model selection and catalog behavior;
- AI Chat record/skill references;
- skills and agents;
- application lifecycle;
- application file upload;
- application install/uninstall;
- application export/pull;
- messaging/application integration;
- connection ownership and visibility;
- workflow/core metadata;
- upgrade commands.

Continuing to perfect a v2.37-specific Candidate B installer before revalidating the current stable runtime would create avoidable migration debt.

Therefore:

```text
v2.37 Candidate B final install       PAUSED
v2.37 Windows quoting repair          NO LONGER CURRENT MAINLINE
v2.41 source/runtime admission        ACTIVE
v2.41 Windows shadow upgrade          NEXT AFTER SOURCE ADMISSION
v2.41 company UAT cutover             NOT YET AUTHORIZED
PRIMARY AI runtime selection          NOT YET AUTHORIZED
Production                            NOT AUTHORIZED
```

---

## 2. Upstream upgrade support

Twenty's official self-host upgrade guide states:

1. back up the database before upgrade;
2. change the image/tag and restart;
3. required upgrade migrations run automatically on server startup;
4. from v1.23 onward, cross-version upgrades are supported without stepping through every intermediate release;
5. v2.34+ requires PostgreSQL 15 or newer;
6. `upgrade:status` is the supported way to inspect instance/workspace migration state and failed migrations.

GBAP already uses PostgreSQL 16 for Twenty, so the documented PostgreSQL minimum is satisfied.

This upstream support means a direct v2.37.0 -> v2.41.0 upgrade is eligible for validation. It does **not** mean GBAP may skip backup, patch revalidation, provider regression, mail/calendar regression, identity isolation, or restore proof.

---

## 3. Relevant upstream delta

### 3.1 v2.38.1

Material changes include:

- AI Chat dictation and page-based suggestions;
- AI provider/default-model changes;
- app lifecycle state;
- newly installed packaged logic functions running in prebuilt mode;
- conversion support for existing app logic functions;
- application and registration SSE events;
- upgrade resume fixes;
- mail/calendar synchronization and OAuth fixes.

### 3.2 v2.39.0

Material changes include:

- direct application file upload lifecycle;
- legacy GraphQL upload mutations superseded/removed for the newer upload path;
- `exportApplication`;
- `yarn twenty pull`;
- additive application apply behavior;
- richer manifest fidelity;
- queue/SSE evolution.

### 3.3 v2.40.0

Breaking application lifecycle change:

- application install/uninstall are tracked with deterministic queue jobs.

AI changes include:

- five-tier model selection;
- AI Chat `@` record references;
- `/` skill suggestions;
- separation of agent-only and user skills.

### 3.4 v2.41.0

Material changes include:

- AI deployment catalog generated from model catalog/spec;
- additional AI model settings polish;
- `runAgent` file attachments;
- portable app skills collection;
- application upload ownership hardening;
- registration/source-package binding hardening;
- role/permission export improvements;
- application-owned messaging channels and ingestion;
- connection permission/visibility changes;
- explicit 2.41 upgrade commands/fixes.

This delta is material enough that Candidate B must be rebuilt/re-admitted against the v2.41 SDK/runtime rather than treating v2.37 artifacts as portable evidence.

---

## 4. Existing GBAP v2.37 coupling audit

### 4.1 Runtime/image coupling

Current Local UAT explicitly pins:

```text
twentycrm/twenty:v2.37.0
gbap-twenty-v2.37.0
Dockerfile.twenty-v2.37.0-gbap
```

These remain unchanged until the shadow-upgrade Gate passes.

### 4.2 Candidate B SDK coupling

Current App source pins:

```text
twenty-sdk         2.37.0
twenty-client-sdk  2.37.0
engines.twenty     2.37.0
manifest.requiredServerVersionRange  2.37.0
```

The CI offline npm supply also admits only 2.37.0 today.

Therefore v2.41 Candidate B migration requires a separate SDK supply admission before any v2.41 App build becomes authoritative.

### 4.3 Runtime backports

GBAP has two compiled-runtime patches.

#### API-key / REST View permission backport

Upstream v2.41 source was inspected at tag `twenty/v2.41.0`.

The relevant API-key workspace-setting path still resolves the API-key role through the legacy role repository, and the four View permission guards still obtain request state via GraphQL context.

Therefore the existing GBAP backport is **not retired by version upgrade**. It must be re-applied/revalidated on v2.41 or replaced only if a later upstream fix proves equivalent behavior.

#### Google OAuth tokeninfo timeout backport

Upstream v2.41 still contains:

`timeout: 600`

for Google tokeninfo scope validation.

Therefore the existing GBAP bounded timeout backport remains required for the current Local UAT network behavior unless a separate evidence Gate proves it unnecessary.

---

## 5. Candidate B installer impact

Twenty SDK v2.41.0 still implements the development lifecycle:

```text
ensure registration
-> createDevelopmentApplication
-> upload application files
-> syncApplication
```

However, the official v2.41 SDK FileUploader now prefers:

```text
createApplicationFileUploads
-> direct upload URLs
-> completeApplicationFileUploads
```

and only falls back to the legacy multipart mutation when the direct-upload API is absent.

This materially changes GBAP's implementation decision.

The long-term v2.41 Candidate B path should prefer:

```text
official Twenty SDK CLI/lifecycle
+ GBAP pre-write plan Gate
+ GBAP backup Gate
+ GBAP post-apply convergence Gate
```

rather than continuing to maintain a custom Windows curl multipart implementation.

The current v2.37 first-install script remains historical evidence and must not be silently rewritten into the v2.41 installer.

---

## 6. Admission sequence

### Gate A — source/runtime admission

Must prove without touching company Windows UAT data:

- official `twentycrm/twenty:v2.41.0` image is available;
- exact image identity/digest is captured;
- runtime reports v2.41.0;
- runtime user/storage assumptions are known;
- both current GBAP compiled-runtime patches either apply cleanly to v2.41 or fail with an explicit version-drift block;
- current adapter source remains syntactically valid;
- current production/provider contracts remain unchanged;
- no company UAT mutation occurs.

### Gate B — SDK supply + Candidate B rebuild

Must prove:

- exact `twenty-sdk@2.41.0` and `twenty-client-sdk@2.41.0` are admitted into governed offline supply;
- Candidate B source builds with the v2.41 SDK;
- generated manifest delta is reviewed;
- AI tool identity/ACL boundary is unchanged;
- CRM record permissions remain false;
- no live install occurs.

### Gate C — isolated Windows shadow upgrade

Must use a governed backup/copy, not the live company UAT state.

Must prove:

- v2.37 backup integrity;
- isolated restore;
- direct v2.37 -> v2.41 startup migration;
- `upgrade:status` instance = up to date;
- every workspace = up to date;
- no failed upgrade command;
- Twenty REST/metadata/API-key paths;
- canonical CRM adapter;
- Mail/Calendar read + per-user isolation;
- Keycloak/GBAP identity mapping;
- storage persistence;
- restart persistence;
- patched runtime behavior.

### Gate D — company Windows UAT cutover

Only after A+B+C PASS.

Required:

- fresh full UAT backup;
- exact accepted main;
- clean worktree;
- controlled image/version switch;
- automatic Twenty migrations;
- `upgrade:status` PASS;
- full affected Local UAT verification;
- persistence proof;
- rollback evidence preserved.

### Gate E — Candidate B v2.41 live install

Only after the Twenty runtime upgrade is accepted.

The v2.37 partial install state must be re-read under v2.41 before any write.

No assumption from the v2.37 two-create plan is automatically inherited.

---

## 7. Rollback boundary

Rollback is not "change the image tag back".

If v2.41 runs database/workspace migrations, rollback requires the governed pre-upgrade backup and the matching prior runtime/config/secret set.

The existing GBAP restore path remains authoritative.

Never attempt to run a migrated v2.41 database under v2.37 merely by changing the container image.

---

## 8. Non-claims

This Gate does not claim:

- v2.41 is already installed on company Windows UAT;
- current v2.37 partial Candidate B App state is compatible with v2.41;
- current runtime patches are permanently required;
- v2.41 SDK packages are already admitted into GBAP offline supply;
- Candidate B is PRIMARY;
- Twenty replaces RAGFlow Knowledge;
- MCP is exposed;
- Production is authorized.

---

## 9. Gate closure criteria

This v0.1 admission Gate can close only when:

```text
source/runtime admission     PASS
patch compatibility          PASS or explicit governed replacement
SDK supply admission         PASS
Candidate B v2.41 build      PASS
isolated shadow upgrade      PASS
upgrade:status               PASS
CRM regression               PASS
Mail/Calendar regression     PASS
identity isolation           PASS
backup/restore boundary      PASS
company UAT upgrade          separately authorized
Production                   false
```

Until then, company Windows UAT remains a protected v2.37 data authority even if GitHub contains v2.41 admission code.
