import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const selected = JSON.parse(readFileSync('infrastructure/knowledge-quality/gte-ragflow-real-benchmark.json', 'utf8'));
const frozen = JSON.parse(readFileSync('infrastructure/knowledge-quality/multilingual-candidates.json', 'utf8'));

assert.equal(selected.schemaVersion, 1);
assert.equal(selected.runtime.ragflowVersion, 'v0.27.2');
assert.equal(selected.runtime.ragflowCommit, 'a024bea0cd93f39e6652a42bf84dd20c55bc560b');
assert.equal(selected.runtime.provider, 'HuggingFace');
assert.equal(selected.candidates.length, 1);

const candidate = selected.candidates[0];
assert.equal(candidate.id, 'gte-multilingual-base');
assert.equal(candidate.model, 'Alibaba-NLP/gte-multilingual-base');
assert.equal(candidate.modelRevision, '9bbca17d9273fd0d03d5725c7a4b0f6b45142062');
assert.equal(candidate.instanceName, 'gbap-gte-multilingual');
assert.equal(candidate.modelId, candidate.model + '@' + candidate.instanceName + '@HuggingFace');
assert.equal(candidate.modelId.includes('@Builtin'), false);
assert.equal(candidate.maxInputTokens, 8192);
assert.equal(candidate.embeddingDimension, 768);
assert.deepEqual(candidate.languages, ['zh', 'en', 'es']);
assert.equal(candidate.status, 'REAL_PROVIDER_BENCHMARK_CANDIDATE');

assert.deepEqual(
  frozen.candidates.map((item) => item.id),
  ['bge-m3', 'qwen3-embedding-0.6b'],
  'frozen v0.4 heavyweight candidate registry must remain unchanged',
);

assert.equal(selected.priorEvidence.pullRequest, 218);
assert.equal(selected.priorEvidence.workflowRun, 35304757769);
assert.equal(selected.priorEvidence.result, 'PASS');
assert.equal(selected.priorEvidence.providerBinding, 'TEMPORARY_BUILTIN_OVERRIDE');

console.log(JSON.stringify({
  gate: 'KNOWLEDGE_GTE_HUGGINGFACE_PROVIDER_CONTRACT',
  result: 'PASS',
  modelId: candidate.modelId,
  frozenHeavyRegistryPreserved: true,
  priorRealBenchmarkEvidencePreserved: true,
}));
