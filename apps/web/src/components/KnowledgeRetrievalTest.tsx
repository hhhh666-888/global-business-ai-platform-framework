import { useEffect, useMemo, useState } from 'react';
import {
  searchKnowledge,
  type KnowledgeCollection,
  type KnowledgeSearchResult,
} from '../lib/knowledgeClient';

type Props = {
  collections: KnowledgeCollection[];
  selectedCollectionId: string | null;
  onOpenResult: (result: KnowledgeSearchResult) => void;
};

function boundedPercent(score: number | null) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return '—';
  return `${(Math.max(0, Math.min(1, score)) * 100).toFixed(2)}%`;
}

export function KnowledgeRetrievalTest({
  collections,
  selectedCollectionId,
  onOpenResult,
}: Props) {
  const [question, setQuestion] = useState('');
  const [scope, setScope] = useState<'CURRENT' | 'ALL'>(selectedCollectionId ? 'CURRENT' : 'ALL');
  const [minimumScore, setMinimumScore] = useState(0);
  const [topK, setTopK] = useState(10);
  const [results, setResults] = useState<KnowledgeSearchResult[]>([]);
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedCollection = useMemo(
    () => collections.find((item) => item.id === selectedCollectionId) ?? null,
    [collections, selectedCollectionId],
  );

  useEffect(() => {
    if (!selectedCollectionId && scope === 'CURRENT') setScope('ALL');
  }, [selectedCollectionId, scope]);

  const sourceOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of results) {
      if (!seen.has(item.knowledgeDocumentId)) {
        seen.set(item.knowledgeDocumentId, item.sourceTitle);
      }
    }
    return Array.from(seen.entries());
  }, [results]);

  const visibleResults = useMemo(
    () => sourceFilter === 'ALL'
      ? results
      : results.filter((item) => item.knowledgeDocumentId === sourceFilter),
    [results, sourceFilter],
  );

  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    const query = question.trim();
    if (!query) return;
    setLoading(true);
    setMessage(null);
    setSourceFilter('ALL');
    try {
      const response = await searchKnowledge({
        query,
        collectionIds: scope === 'CURRENT' && selectedCollectionId ? [selectedCollectionId] : undefined,
        topK,
        minimumScore,
      });
      setResults(response.results);
      if (!response.results.length) {
        setMessage('没有命中符合当前阈值的知识片段。可以降低相似度阈值或扩大检索范围。');
      }
    } catch {
      setResults([]);
      setMessage('检索测试失败，请检查知识检索服务状态后重试。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="knowledge-retrieval-test">
      <section className="knowledge-test-config">
        <div className="knowledge-card-head">
          <div>
            <span className="knowledge-upstream-badge">检索质量验证</span>
            <h3>检索测试</h3>
            <p>用于验证知识检索质量，不调用 AI，不生成答案。结果直接显示命中的知识片段、来源和相关度。</p>
          </div>
        </div>

        <form onSubmit={run} className="knowledge-test-form">
          <label>
            <span>检索范围</span>
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value as 'CURRENT' | 'ALL')}
            >
              <option value="ALL">全部可访问知识库</option>
              {selectedCollection && <option value="CURRENT">当前知识库：{selectedCollection.name}</option>}
            </select>
          </label>

          <label>
            <span>最低相关度</span>
            <div className="knowledge-range-row">
              <input
                aria-label="最低相关度"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={minimumScore}
                onChange={(event) => setMinimumScore(Number(event.target.value))}
              />
              <strong>{Math.round(minimumScore * 100)}%</strong>
            </div>
          </label>

          <label>
            <span>最多返回</span>
            <select value={topK} onChange={(event) => setTopK(Number(event.target.value))}>
              {[3, 5, 10, 20, 50].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>

          <label className="wide">
            <span>测试问题</span>
            <textarea
              aria-label="检索测试问题"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="例如：550W 光伏组件有哪些关键参数？"
              rows={5}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
          </label>

          <div className="knowledge-test-submit">
            <small>最低相关度用于过滤较弱匹配，“最多返回”控制结果数量。建议用真实业务问题进行测试，并根据命中质量调整参数。</small>
            <button type="submit" className="knowledge-primary" disabled={loading || !question.trim()}>
              {loading ? '测试中…' : '运行检索测试'}
            </button>
          </div>
        </form>
      </section>

      <section className="knowledge-test-results">
        <div className="knowledge-test-results-head">
          <div>
            <h3>测试结果</h3>
            <p>共 {results.length} 个命中片段</p>
          </div>
          {sourceOptions.length > 1 && (
            <label>
              <span>来源文件</span>
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                <option value="ALL">全部来源</option>
                {sourceOptions.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
              </select>
            </label>
          )}
        </div>

        {message && <div className="knowledge-test-message">{message}</div>}

        {!message && !visibleResults.length && (
          <div className="knowledge-search-empty">
            <div className="knowledge-search-empty-icon">⌕</div>
            <strong>等待运行检索测试</strong>
            <span>调整检索范围、最低相关度和返回数量后，输入一个真实业务问题。</span>
          </div>
        )}

        <div className="knowledge-test-result-list">
          {visibleResults.map((result, index) => (
            <article className="knowledge-test-result" key={result.chunkId ?? `${result.knowledgeDocumentId}-${index}`}>
              <div className="knowledge-test-result-score">
                <strong>{boundedPercent(result.score)}</strong>
                <span>相关度</span>
              </div>
              <div className="knowledge-test-result-content">
                <header>
                  <div>
                    <strong>{result.sourceTitle}</strong>
                    <span>
                      {result.page ? `第 ${result.page} 页` : result.section || '知识片段'}
                    </span>
                  </div>
                  <button type="button" onClick={() => onOpenResult(result)}>打开来源文档 →</button>
                </header>
                <p>{result.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
