import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function evaluateBenchmark(benchmark, run) {
  if (!benchmark || benchmark.schemaVersion !== 1) throw new Error('unsupported_benchmark_schema');
  if (!run || !Array.isArray(run.cases)) throw new Error('invalid_benchmark_run');

  const expected = new Map(benchmark.queries.map((item) => [item.id, item]));
  const observed = new Map(run.cases.map((item) => [item.queryId, item]));
  if (observed.size !== expected.size) throw new Error('benchmark_case_count_mismatch');

  const rows = [];
  for (const [queryId, query] of expected) {
    const result = observed.get(queryId);
    if (!result) throw new Error('missing_benchmark_case:' + queryId);
    const ranked = Array.isArray(result.rankedDocumentIds) ? result.rankedDocumentIds : [];
    const rankIndex = ranked.indexOf(query.expectedDocumentId);
    const rank = rankIndex < 0 ? null : rankIndex + 1;
    const citationDocumentIds = Array.isArray(result.citationDocumentIds) ? result.citationDocumentIds : [];
    rows.push({
      queryId,
      language: query.language,
      category: query.category,
      expectedDocumentId: query.expectedDocumentId,
      rank,
      hitAt1: rank === 1,
      hitAt3: rank !== null && rank <= 3,
      reciprocalRank: rank ? 1 / rank : 0,
      citationCorrect: citationDocumentIds.includes(query.expectedDocumentId),
      latencyMs: Number.isFinite(result.latencyMs) ? result.latencyMs : null,
    });
  }

  const ratio = (predicate, subset = rows) => subset.length ? subset.filter(predicate).length / subset.length : 0;
  const category = (name) => rows.filter((row) => row.category === name);
  const finiteLatencies = rows.map((row) => row.latencyMs).filter(Number.isFinite).sort((a, b) => a - b);
  const percentile = (p) => {
    if (!finiteLatencies.length) return null;
    return finiteLatencies[Math.min(finiteLatencies.length - 1, Math.ceil(finiteLatencies.length * p) - 1)];
  };

  const metrics = {
    totalCases: rows.length,
    hitAt1: ratio((row) => row.hitAt1),
    hitAt3: ratio((row) => row.hitAt3),
    meanReciprocalRank: rows.reduce((sum, row) => sum + row.reciprocalRank, 0) / rows.length,
    citationCorrectness: ratio((row) => row.citationCorrect),
    crossLanguageHitAt3: ratio((row) => row.hitAt3, category('cross_language')),
    numericHitAt1: ratio((row) => row.hitAt1, category('numeric_identifier')),
    tableHitAt3: ratio((row) => row.hitAt3, category('table_retrieval')),
    latencyP50Ms: percentile(0.5),
    latencyP95Ms: percentile(0.95),
    peakMemoryGiB: Number.isFinite(run.peakMemoryGiB) ? run.peakMemoryGiB : null,
    runtimeSeconds: Number.isFinite(run.runtimeSeconds) ? run.runtimeSeconds : null,
  };

  const t = benchmark.thresholds;
  const checks = {
    overallHitAt1: metrics.hitAt1 >= t.overallHitAt1,
    overallHitAt3: metrics.hitAt3 >= t.overallHitAt3,
    crossLanguageHitAt3: metrics.crossLanguageHitAt3 >= t.crossLanguageHitAt3,
    numericHitAt1: metrics.numericHitAt1 >= t.numericHitAt1,
    tableHitAt3: metrics.tableHitAt3 >= t.tableHitAt3,
    citationCorrectness: metrics.citationCorrectness >= t.citationCorrectness,
  };

  return {
    modelId: run.modelId ?? null,
    result: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
    metrics,
    checks,
    cases: rows,
  };
}

function main() {
  const [benchmarkPath, runPath] = process.argv.slice(2);
  if (!benchmarkPath || !runPath) throw new Error('usage: node evaluate-multilingual-benchmark.mjs <benchmark.json> <run.json>');
  const benchmark = JSON.parse(readFileSync(benchmarkPath, 'utf8'));
  const run = JSON.parse(readFileSync(runPath, 'utf8'));
  const result = evaluateBenchmark(benchmark, run);
  console.log(JSON.stringify(result, null, 2));
  if (result.result !== 'PASS') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
