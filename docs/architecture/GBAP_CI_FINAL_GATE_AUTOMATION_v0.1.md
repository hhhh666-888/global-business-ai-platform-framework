# GBAP CI Final Gate Automation v0.1

## Status

LIVING until the command bridge and result reporter are merged and proven by a real PR-triggered Self-hosted Final Gate.

## Purpose

Remove the routine human requirement to click GitHub Actions `Run workflow` while preserving an explicit, auditable promotion decision for expensive integration gates.

The CI control model must remain operational even when GitHub-hosted Actions minutes are exhausted. GitHub-hosted runners are therefore not part of the required GBAP CI execution path.

## Normal execution model

```text
CODE / REVIEW
→ Self-hosted Fast CI
→ batch fixes
→ final candidate
→ repository OWNER posts one exact PR command
→ Self-hosted command bridge validates the PR
→ GitHub dispatches GBAP Final Gate - Self Hosted
→ GBAP-CI-01 executes the selected heavy suite
→ Self-hosted result reporter writes PASS/FAIL back to the PR
→ PASS required before merge
```

Supported commands:

```text
/gbap-final crm
/gbap-final local-uat
/gbap-final all
```

The ChatGPT GitHub connection can create PR comments, so normal operation does not require the user to open Actions and click `Run workflow`.

## Trust boundary

The command bridge:

- accepts only `issue_comment` events on pull requests;
- accepts only comments whose GitHub `author_association` is `OWNER`;
- accepts only the three exact commands above;
- refuses draft or closed PRs;
- refuses fork PRs;
- refuses automatic dispatch when the PR changes protected Final Gate workflow files;
- dispatches only the existing `ci-final-self-hosted.yml` workflow;
- leaves `workflow_dispatch` available as a manual recovery/bootstrap path.

## Self-hosted boundary

All required GBAP CI jobs use:

```text
[self-hosted, linux, x64, gbap-ci]
```

This includes:

- PR Fast CI;
- Final Gate command bridge;
- Final Gate heavy execution;
- Final Gate result reporter.

GitHub-hosted runner minutes are not required for normal GBAP CI operation.

The company CI environment is the isolated `GBAP-CI` WSL2 distribution with its own Docker Engine. Windows drives are not auto-mounted, so formal `E:\GlobalBusinessAIPlatform` UAT data is outside the Runner filesystem boundary.

## Retry policy

Do not repeatedly rerun a failed Final Gate. Read the latest failure once, batch-fix the root cause, let Fast CI pass, then post the command again for one new Final Gate attempt.

## Freeze gate

This automation may be marked PASS / FROZEN only after:

1. the command bridge and result reporter are merged to `main`;
2. a later real PR receives one supported command through the GitHub connector;
3. the bridge successfully creates the heavy workflow run without manual UI interaction;
4. `GBAP-CI-01` receives and executes that run;
5. the resulting Final Gate completes with a valid PASS/FAIL result;
6. the result reporter writes that result back to the originating PR;
7. the same path works with no GitHub-hosted runner usage.
