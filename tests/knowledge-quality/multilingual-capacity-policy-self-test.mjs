import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const configPath = 'infrastructure/knowledge-quality/multilingual-candidates.json';
const config = JSON.parse(readFileSync(configPath, 'utf8'));
assert.equal(config.candidates.length, 2);
assert.equal(config.reservePolicy.runtimeReserveGiB, 7);

function run(facts) {
  const output = execFileSync('python3', [
    'infrastructure/knowledge-quality/evaluate-capacity.py',
    '--config', configPath,
    '--cpu', String(facts.cpu),
    '--docker-cpu', String(facts.dockerCpu),
    '--total-memory-gib', String(facts.total),
    '--available-memory-gib', String(facts.available),
    '--docker-memory-gib', String(facts.docker),
    '--free-disk-gib', String(facts.disk),
  ], { encoding: 'utf8' });
  return JSON.parse(output);
}

const small = run({ cpu: 8, dockerCpu: 8, total: 16, available: 14, docker: 16, disk: 100 });
assert.equal(small.decision, 'STRONGER_RUNNER_REQUIRED');
assert.deepEqual(small.eligibleCandidates, []);

const bgeOnly = run({ cpu: 8, dockerCpu: 8, total: 30, available: 29, docker: 30, disk: 100 });
assert.equal(bgeOnly.decision, 'HEAVY_BENCHMARK_ELIGIBLE');
assert.deepEqual(bgeOnly.eligibleCandidates, ['bge-m3']);

const both = run({ cpu: 12, dockerCpu: 12, total: 40, available: 38, docker: 40, disk: 100 });
assert.equal(both.decision, 'HEAVY_BENCHMARK_ELIGIBLE');
assert.deepEqual(both.eligibleCandidates.sort(), ['bge-m3', 'qwen3-embedding-0.6b']);

const diskBlocked = run({ cpu: 12, dockerCpu: 12, total: 40, available: 38, docker: 40, disk: 20 });
assert.deepEqual(diskBlocked.eligibleCandidates, []);

console.log(JSON.stringify({
  gate: 'KNOWLEDGE_MULTILINGUAL_CAPACITY_POLICY',
  result: 'PASS',
  candidates: config.candidates.map((item) => item.id),
}));
