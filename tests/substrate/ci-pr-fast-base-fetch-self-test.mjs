import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/ci-pr-fast.yml', 'utf8');

assert.match(workflow, /BASE_SHA:\s*\$\{\{ github\.event\.pull_request\.base\.sha \}\}/u);
assert.ok(workflow.includes('git cat-file -e "${BASE_SHA}^{commit}"'));
assert.ok(
  workflow.includes('fetch --depth=1 --no-tags origin "$BASE_SHA"'),
  'Fast CI must fetch the exact event base SHA when a delayed run no longer has it in the depth-1 base-tip fetch.',
);
assert.ok(
  workflow.indexOf('fetch --depth=1 --no-tags origin "$BASE_SHA"') <
    workflow.indexOf('git diff --name-only "$BASE_SHA" HEAD'),
  'exact event-base materialization must happen before changed-file detection',
);

console.log(JSON.stringify({
  gate: 'CI_PR_FAST_EVENT_BASE_FETCH_CONTRACT',
  result: 'PASS',
  delayedPullRequestEventSafe: true,
}));
