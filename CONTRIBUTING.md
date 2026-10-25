# Contributing to GBAP Framework

Thanks for your interest in contributing.

## Ground rules

- **Assembly first.** Prefer integrating an existing, well-maintained
  provider or library over building a new component.
- **Contracts before code.** Capability changes start in `contracts/`;
  adapters and providers follow the contract, never the other way around.
- **No secrets, no real data.** Contributions must not contain credentials,
  internal hostnames/IPs, or real customer/business data. Test fixtures
  must be synthetic.
- Keep changes scoped and include or update tests in `tests/` where the
  area has coverage.

## Workflow

1. Open an issue describing the change (bug, contract change, new adapter).
2. Fork and branch from `main`.
3. Make the change with tests; keep commits focused.
4. Open a pull request referencing the issue, describing what changed,
   why, and how it was verified.

## License

By contributing, you agree that your contributions will be licensed under
the Apache License, Version 2.0 (see `LICENSE`).
