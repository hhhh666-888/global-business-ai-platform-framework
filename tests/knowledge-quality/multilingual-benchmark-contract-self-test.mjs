import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateBenchmark } from './evaluate-multilingual-benchmark.mjs';

const benchmark = JSON.parse(readFileSync('tests/knowledge-quality/multilingual-benchmark.json', 'utf8'));
assert.equal(benchmark.dataPolicy, 'SYNTHETIC_ONLY');
assert.ok(benchmark.corpus.length >= 7);
assert.ok(benchmark.queries.some((item) => item.category === 'cross_language'));
assert.ok(benchmark.queries.some((item) => item.category === 'numeric_identifier'));
assert.ok(benchmark.queries.some((item) => item.category === 'table_retrieval'));
const tableFixture = benchmark.corpus.find((item) => item.id === 'table-storage');
assert.ok(tableFixture?.text.includes('\nFG-TAB-372,'), 'table fixture must contain real line breaks');
assert.equal(tableFixture?.text.includes('\\nFG-TAB-372,'), false, 'table fixture must not contain literal backslash-n separators');
for (const query of benchmark.queries) {
  assert.ok(benchmark.corpus.some((doc) => doc.id === query.expectedDocumentId), 'expected document missing: ' + query.id);
}

const perfect = {
  modelId: 'fixture-perfect',
  peakMemoryGiB: 12,
  runtimeSeconds: 4,
  cases: benchmark.queries.map((query, index) => ({
    queryId: query.id,
    rankedDocumentIds: [query.expectedDocumentId],
    citationDocumentIds: [query.expectedDocumentId],
    latencyMs: 100 + index,
  })),
};
const perfectResult = evaluateBenchmark(benchmark, perfect);
assert.equal(perfectResult.result, 'PASS');
assert.equal(perfectResult.metrics.hitAt1, 1);
assert.equal(perfectResult.metrics.hitAt3, 1);
assert.equal(perfectResult.metrics.citationCorrectness, 1);

const degraded = structuredClone(perfect);
degraded.modelId = 'fixture-degraded';
for (const row of degraded.cases.slice(0, 3)) {
  row.rankedDocumentIds = ['wrong-document'];
  row.citationDocumentIds = ['wrong-document'];
}
const degradedResult = evaluateBenchmark(benchmark, degraded);
assert.equal(degradedResult.result, 'FAIL');
assert.equal(degradedResult.checks.citationCorrectness, false);

console.log(JSON.stringify({
  gate: 'KNOWLEDGE_MULTILINGUAL_BENCHMARK_CONTRACT',
  result: 'PASS',
  corpus: benchmark.corpus.length,
  queries: benchmark.queries.length,
  categories: [...new Set(benchmark.queries.map((item) => item.category))],
}));
