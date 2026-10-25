import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflows = [
  '.github/workflows/ci-pr-fast.yml',
  '.github/workflows/knowledge-provider-foundation.yml',
];

for (const path of workflows) {
  const source = readFileSync(path, 'utf8');

  assert.equal(
    source.includes('refs/pull/'),
    false,
    path + ' must not depend on the ephemeral PR merge ref after a PR is merged',
  );
  assert.equal(
    source.includes('HEAD_REF:'),
    false,
    path + ' must not depend on a head branch ref that may be deleted after merge',
  );
  assert.match(
    source,
    /HEAD_SHA:\s*\$\{\{ github\.event\.pull_request\.head\.sha \}\}/u,
    path + ' must capture the immutable event head SHA',
  );
  assert.ok(
    source.includes('fetch --depth=1 --no-tags origin "$TARGET_SHA"'),
    path + ' must fetch the exact target commit SHA',
  );
  assert.ok(
    source.includes('git checkout --detach FETCH_HEAD'),
    path + ' must detach at the fetched exact commit',
  );
  assert.ok(
    source.includes('test "$(git rev-parse HEAD)" = "$TARGET_SHA"'),
    path + ' must prove the checked-out commit equals the event target SHA',
  );
}

console.log(JSON.stringify({
  gate: 'CI_PR_EXACT_SHA_CHECKOUT_CONTRACT',
  result: 'PASS',
  delayedAfterMergeSafe: true,
  workflows,
}));
