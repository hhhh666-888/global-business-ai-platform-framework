import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const baseUrl = (process.env.TEI_BASE_URL ?? '').replace(/\/$/u, '');
const configPath = process.env.GBAP_LIGHTWEIGHT_CANDIDATES ?? 'infrastructure/knowledge-quality/lightweight-candidates.json';
if (!baseUrl) throw new Error('missing_TEI_BASE_URL');

const config = JSON.parse(readFileSync(configPath, 'utf8'));
assert.equal(config.schemaVersion, 1);
const candidate = config.candidates.find((item) => item.status === 'COMPATIBILITY_PROBE');
assert.ok(candidate, 'exactly one active compatibility candidate is required');
assert.equal(config.candidates.filter((item) => item.status === 'COMPATIBILITY_PROBE').length, 1);
assert.deepEqual(candidate.targetLanguages, ['zh', 'en', 'es']);

const cases = [
  {
    id: 'zh_to_es_genset',
    query: '哪份资料描述了工厂停电时使用800千瓦备用发电机？',
    positive: 'El grupo electrógeno de respaldo para la fábrica tiene una potencia nominal de 800 kW y se utiliza durante cortes de red.',
    negative: 'El sistema fotovoltaico del techo reduce la compra de electricidad durante las horas de sol.',
  },
  {
    id: 'en_to_zh_storage',
    query: 'Which description is about a 215 kWh battery used for peak shaving?',
    positive: '该测试储能系统额定容量为215千瓦时，主要用于削峰和短时备用。',
    negative: '该变压器额定容量为1250千伏安，用于厂内配电连接。',
  },
  {
    id: 'es_to_en_transformer',
    query: '¿Cuál descripción habla de un transformador de 1250 kVA?',
    positive: 'The test transformer has a nominal capacity of 1250 kVA and connects the plant internal distribution system.',
    negative: 'Industrial customers value local service response and transparent lifecycle cost.',
  },
];

const inputs = cases.flatMap((item) => [item.query, item.positive, item.negative]);
const response = await fetch(baseUrl + '/embed', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ inputs }),
  signal: AbortSignal.timeout(60_000),
});
if (!response.ok) {
  throw new Error('tei_embed_failed:' + response.status + ':' + await response.text());
}
const vectors = await response.json();
assert.equal(vectors.length, inputs.length, 'TEI must return one vector per input');

function cosine(a, b) {
  assert.equal(a.length, b.length, 'embedding dimensions must match');
  let dot = 0; let aa = 0; let bb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return dot / (Math.sqrt(aa) * Math.sqrt(bb));
}

const dimensions = vectors[0]?.length ?? 0;
assert.equal(dimensions, candidate.embeddingDimensions, 'unexpected embedding dimension');
for (const vector of vectors) {
  assert.equal(vector.length, dimensions);
  assert.ok(vector.every(Number.isFinite), 'embedding contains non-finite value');
}

const results = cases.map((item, index) => {
  const offset = index * 3;
  const positiveSimilarity = cosine(vectors[offset], vectors[offset + 1]);
  const negativeSimilarity = cosine(vectors[offset], vectors[offset + 2]);
  assert.ok(
    positiveSimilarity > negativeSimilarity,
    item.id + ': expected multilingual semantic match to outrank distractor; positive=' + positiveSimilarity + ' negative=' + negativeSimilarity,
  );
  return {
    id: item.id,
    positiveSimilarity: Number(positiveSimilarity.toFixed(6)),
    negativeSimilarity: Number(negativeSimilarity.toFixed(6)),
    margin: Number((positiveSimilarity - negativeSimilarity).toFixed(6)),
  };
});

console.log(JSON.stringify({
  gate: 'KNOWLEDGE_LIGHTWEIGHT_MULTILINGUAL_TEI_COMPATIBILITY',
  result: 'PASS',
  candidate: candidate.model,
  revision: candidate.revision,
  provider: candidate.provider,
  dimensions,
  cases: results,
}, null, 2));
