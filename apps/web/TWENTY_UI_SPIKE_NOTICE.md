# Twenty UI Reuse Spike Notice

Status: **SPIKE / NOT PRODUCTION-APPROVED**

Purpose: validate React + Vite + Twenty visual/component reuse for the GBAP native employee shell before the CRM surface is wired to production data.

## Current source facts

- Twenty repository `packages/twenty-ui/package.json` currently identifies `twenty-ui` as MIT and the repository-level LICENSE lists `twenty-ui` among MIT packages.
- The currently published npm package `twenty-ui@1.0.0-alpha.0` still reports AGPL-3.0 metadata and lags the repository package revision.

## Spike rule

This branch may use `twenty-ui@1.0.0-alpha.0` only to prove build compatibility, visual quality and component reuse. It is **not** a production dependency approval.

Before production merge/adoption, one of the following must be proven and recorded:

1. an npm release whose package metadata and LICENSE match the intended MIT posture; or
2. an approved, pinned upstream source/package provenance with legal/license review; or
3. a replacement UI-component source with equivalent visual compatibility.

GBAP business data access must remain behind GBAP-owned APIs/capability boundaries; the UI spike does not authorize direct Twenty API coupling.
