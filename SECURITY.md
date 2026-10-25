# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue for security vulnerabilities.

Report them privately through GitHub's "Report a vulnerability" flow
(Security → Advisories) on this repository, with:

- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- affected versions or components, if known.

We aim to acknowledge reports within 5 business days and will coordinate
disclosure with the reporter.

## Scope notes

- Never commit real credentials, `.env` files, database dumps, or customer
  data to this repository. Example configuration ships with placeholder
  values only.
- The MCP gateway is intentionally read-only in v1; reports that widen
  its surface (writes, provider administration) are in scope.
