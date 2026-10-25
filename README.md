# Global Business AI Platform (GBAP) Framework

An assembly-first, provider-agnostic framework for building a global business
platform: CRM, enterprise knowledge, identity, and a governed read-only MCP
gateway for external AI agents — without locking your business logic to any
single vendor or model.

> **Assembly first / Reuse first / Integrate first / Build last.**
> GBAP owns the product UI/UX, business semantics, durable IDs, the
> identity/authorization boundary, provider mappings and provenance, and the
> audit/observability boundaries. Everything else is a replaceable provider.

## Architecture

```text
Business UI / Product Surface
        |
        v
Capability Contract        (e.g. gbap.crm.v1, gbap.knowledge.v1)
        |
        v
Provider Resolver
        |
        v
Adapter                    (twenty-adapter, ragflow-adapter, ...)
        |
        v
Provider                   (Twenty CRM, RAGFlow, Keycloak, ...)
```

Current reference providers:

| Capability   | Contract              | Reference provider | Role                    |
|--------------|-----------------------|--------------------|-------------------------|
| CRM          | `gbap.crm.v1`      | Twenty (headless)  | internal, replaceable   |
| Knowledge    | `gbap.knowledge.v1`| RAGFlow (headless) | internal, replaceable   |
| Identity     | OIDC                  | Keycloak           | identity authority      |
| Agent access | MCP (read-only v1)    | built-in gateway   | authenticated, ACL-bound|

## Highlights

- **Canonical customer-company master** with one governed import center:
  upload → field mapping → match rules → preflight → confirm → resumable
  background import jobs (up to 50,000 rows), dynamic field catalogs, and
  country-specific registration-ID validation rules.
- **Enterprise knowledge** with canonical sources, citation-preserving
  retrieval, backup/restore and re-indexing, and multilingual embeddings.
- **Read-only MCP gateway**: external MCP-capable agents consume governed
  CRM and Knowledge capabilities through the platform's own identity and
  ACL — no raw provider administration, no write access in v1.
- **Provider provenance everywhere**: mappings, migrations and runtime
  provenance are first-class, so providers can be swapped without losing
  business history.

## Repository layout

```text
apps/          api, web, worker, identity-admin, observability
contracts/     capability contracts (crm, knowledge, observability)
providers/     adapters and reference/fake providers
tests/         conformance, substrate, pou and quality suites
docs/          architecture documents
infrastructure/ compose and identity (Keycloak) building blocks
```

## Status

Initial open-source release. The framework is derived from an internal
platform that has passed staged substrate, CRM and knowledge acceptance
testing in a local UAT environment. It is **not** yet a production-hardened
distribution: expect staged code drops, and see the roadmap in the issues.

## Getting started

Local evaluation stacks and examples live under `infrastructure/`.
All configuration is supplied through environment variables — copy the
provided `.env.example` templates and fill in your own values. Never commit
real credentials.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
Please report security issues privately as described in
[SECURITY.md](SECURITY.md).

## License

Licensed under the Apache License, Version 2.0 — see [LICENSE](LICENSE)
and [NOTICE](NOTICE).
