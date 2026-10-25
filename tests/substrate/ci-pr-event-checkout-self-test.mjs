import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Execute the actual workflow checkout commands against local Git objects. A PR
// branch has advanced and then disappeared; main and its merge ref also moved.
// Only the immutable event commits are valid acceptance targets.
const root = mkdtempSync(join(tmpdir(), 'gbap-event-checkout-'));
const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
const repository = join(root, 'repository');
const remote = join(root, 'remote.git');
const wrapper = join(root, 'bin');
mkdirSync(repository);
mkdirSync(wrapper);
const git = (args, cwd = repository) => {
  const result = spawnSync(realGit, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
let executions = 0;
const workflows = [];
try {
  git(['init', '-b', 'main']);
  git(['config', 'user.email', 'fixture@example.invalid']);
  git(['config', 'user.name', 'Checkout fixture']);
  git(['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(repository, 'base.txt'), 'original base');
  git(['add', '.']); git(['commit', '-m', 'base']);
  const baseSha = git(['rev-parse', 'HEAD']);
  git(['checkout', '-b', 'fixture-head']);
  writeFileSync(join(repository, 'head.txt'), 'event head');
  git(['add', '.']); git(['commit', '-m', 'event head']);
  const headSha = git(['rev-parse', 'HEAD']);
  git(['checkout', 'main']);
  git(['merge', '--no-ff', 'fixture-head', '-m', 'event merge']);
  const mergeSha = git(['rev-parse', 'HEAD']);
  git(['checkout', 'fixture-head']);
  writeFileSync(join(repository, 'head.txt'), 'later branch head');
  git(['add', '.']); git(['commit', '-m', 'later head']);
  git(['checkout', 'main']);
  writeFileSync(join(repository, 'base.txt'), 'later base');
  git(['add', '.']); git(['commit', '-m', 'later main']);
  git(['clone', '--bare', repository, remote]);
  git(['update-ref', '-d', 'refs/heads/fixture-head'], remote);
  assert.equal(git(['show-ref', '--heads'], remote).includes('fixture-head'), false);
  assert.notEqual(git(['rev-parse', 'refs/heads/main'], remote), mergeSha);
  // Git remote rewriting is the sole test seam. No workflow contacts GitHub,
  // reads a real token, overrides HOME, or cleans the runner's real workspace.
  writeFileSync(join(wrapper, 'git'), `#!/bin/sh
if [ "$1" = remote ] && [ "$2" = add ] && [ "$3" = origin ]; then
  exec "$GBAP_CHECKOUT_TEST_GIT" remote add origin "$GBAP_CHECKOUT_TEST_REMOTE"
fi
exec "$GBAP_CHECKOUT_TEST_GIT" "$@"
`);
  chmodSync(join(wrapper, 'git'), 0o755);
  for (const name of readdirSync('.github/workflows').filter(name => name.endsWith('.yml')).sort()) {
    const path = resolve('.github/workflows', name);
    const source = readFileSync(path, 'utf8');
    const mainRefresh = name === 'ci-supply-refresh.yml';
    if (!/^  pull_request:/mu.test(source) && !mainRefresh) continue;
    const blocks = [...source.matchAll(/^      - name:[\s\S]*?(?=^      - name:|(?![\s\S]))/gmu)];
    const checkout = blocks.find(match => match[0].includes('git init'))?.[0];
    if (!checkout) continue;
    const body = checkout.split('        run: |\n')[1];
    assert.ok(body, name + ' requires an executable checkout block');
    const script = body.split('\n').map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');
    assert.doesNotMatch(script, /refs\/pull\/|refs\/heads\//u, name + ' must not fetch a moving branch or merge ref');
    const guardAt = script.indexOf('WORKSPACE=');
    const initAt = script.indexOf('git init');
    assert.ok(guardAt >= 0 && initAt > guardAt, name + ' retains a guarded workspace');
    assert.ok(script.includes('"$HOME/actions-runner/_work/"'), name + ' retains runner cleanup containment');
    const safeScript = script.slice(0, guardAt) + script.slice(initAt);
    const headTarget = /HEAD_SHA:/u.test(checkout);
    const modes = mainRefresh ? ['push', 'workflow_dispatch'] : source.includes('  workflow_dispatch:') ? ['pull_request', 'workflow_dispatch'] : ['pull_request'];
    for (const event of modes) {
      const work = join(root, `run-${executions++}`); mkdirSync(work);
      const expected = event === 'pull_request' && headTarget ? headSha : mergeSha;
      const env = {
        ...process.env, PATH: wrapper + ':' + process.env.PATH,
        GBAP_CHECKOUT_TEST_GIT: realGit, GBAP_CHECKOUT_TEST_REMOTE: 'file://' + remote,
        GH_TOKEN: 'offline-fixture-not-a-credential', GITHUB_EVENT_NAME: event,
        GITHUB_REPOSITORY: 'fixture/platform', GITHUB_SHA: mergeSha, BASE_SHA: baseSha,
        HEAD_SHA: event === 'pull_request' ? headSha : checkout.includes('|| github.sha') ? mergeSha : '',
        HEAD_REPO: event === 'pull_request' ? 'fixture/platform' : '',
      };
      const result = spawnSync('bash', ['-c', safeScript], { cwd: work, env, encoding: 'utf8', timeout: 15_000 });
      assert.equal(result.status, 0, `${name} ${event}: ${result.stderr}`);
      assert.equal(git(['rev-parse', 'HEAD'], work), expected, `${name} ${event} checked out the wrong event commit`);
    }
    // Run the real same-repository guard with a foreign head before any Git work.
    if (headTarget && checkout.includes('test "$HEAD_REPO" = "$GITHUB_REPOSITORY"')) {
      const result = spawnSync('bash', ['-c', safeScript], {
        cwd: root, encoding: 'utf8', timeout: 5000,
        env: {
          ...process.env, PATH: wrapper + ':' + process.env.PATH,
          GBAP_CHECKOUT_TEST_GIT: realGit, GBAP_CHECKOUT_TEST_REMOTE: 'file://' + remote,
          GH_TOKEN: 'offline-fixture-not-a-credential', GITHUB_EVENT_NAME: 'pull_request',
          HEAD_REPO: 'foreign/platform', GITHUB_REPOSITORY: 'fixture/platform',
          HEAD_SHA: headSha, GITHUB_SHA: mergeSha, BASE_SHA: baseSha,
        },
      });
      assert.notEqual(result.status, 0, name + ' must preserve its foreign-repository guard');
    }
    workflows.push(name);
  }
  assert.ok(workflows.includes('ci-dual-runner-proof.yml') && workflows.includes('knowledge-ui-v2-browser.yml'));
  console.log(JSON.stringify({ gate: 'CI_EVENT_CHECKOUT_REAL_GIT', result: 'PASS', executions, workflows, scenario: 'head branch deleted, main advanced, ephemeral merge ref absent; exact event head/merge and manual dispatch verified offline' }));
} finally { rmSync(root, { recursive: true, force: true }); }
