import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const light = JSON.parse(readFileSync('infrastructure/knowledge-quality/lightweight-candidates.json', 'utf8'));
const heavy = JSON.parse(readFileSync('infrastructure/knowledge-quality/multilingual-candidates.json', 'utf8'));

assert.equal(light.schemaVersion, 1);
assert.equal(light.runtime.ragflowVersion, 'v0.27.2');
assert.equal(light.runtime.provider, 'HuggingFace');
assert.match(light.runtime.teiImage, /^ghcr\.io\/huggingface\/text-embeddings-inference:cpu-1\.8\.3$/);

const rejected = light.candidates.find((item) => item.id === 'multilingual-minilm-l12-v2');
assert.equal(rejected.status, 'REJECTED_COMPATIBILITY_QUALITY');
assert.equal(rejected.rejectionEvidence.failedCase, 'en_to_zh_storage');
assert.ok(rejected.rejectionEvidence.positiveSimilarity < rejected.rejectionEvidence.distractorSimilarity);

const active = light.candidates.filter((item) => item.status === 'COMPATIBILITY_PROBE');
assert.equal(active.length, 1);
const candidate = active[0];
assert.equal(candidate.model, 'sentence-transformers/paraphrase-multilingual-mpnet-base-v2');
assert.equal(candidate.revision, '4328cf26390c98c5e3c738b4460a05b95f4911f5');
assert.equal(candidate.modelId, candidate.model + '@' + candidate.instanceName + '@HuggingFace');
assert.deepEqual(candidate.targetLanguages, ['zh', 'en', 'es']);
assert.equal(candidate.embeddingDimensions, 768);
assert.equal(candidate.teiPooling, 'mean');
assert.equal(candidate.teiDtype, 'float32');

assert.deepEqual(
  heavy.candidates.map((item) => item.id),
  ['bge-m3', 'qwen3-embedding-0.6b'],
  'frozen v0.4 heavyweight candidate registry must remain unchanged by compatibility probe',
);

console.log(JSON.stringify({
  gate: 'KNOWLEDGE_LIGHTWEIGHT_CANDIDATE_CONTRACT',
  result: 'PASS',
  candidate: candidate.id,
  rejected: rejected.id,
  heavyRegistryPreserved: true,
}));
