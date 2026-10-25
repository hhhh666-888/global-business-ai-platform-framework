import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';

const PORT = Number(process.env.PORT ?? '8092');
const HOST = '0.0.0.0';
const RAGFLOW_BASE_URL = (process.env.RAGFLOW_BASE_URL ?? 'http://ragflow:9380').replace(/\/$/u, '');
const RAGFLOW_TEI_BASE_URL = (process.env.RAGFLOW_TEI_BASE_URL ?? 'http://tei:80').replace(/\/$/u, '');
const KNOWLEDGE_EXTRACTOR_BASE_URL = (process.env.KNOWLEDGE_EXTRACTOR_BASE_URL ?? 'http://knowledge-extractor:8093').replace(/\/$/u, '');
const EXTRACTOR_DOCUMENT_PREFIX = 'extractor:';
const extractorHandoffLocks = new Map();
const RAGFLOW_API_KEY_FILE = process.env.RAGFLOW_API_KEY_FILE ?? '/run/secrets/ragflow-api-key';
const GBAP_ADAPTER_TOKEN_FILE = process.env.GBAP_ADAPTER_TOKEN_FILE ?? '';
const RAGFLOW_EMBEDDING_MODEL = (process.env.RAGFLOW_EMBEDDING_MODEL ?? '').trim();
const RAGFLOW_CHUNK_METHOD = (process.env.RAGFLOW_CHUNK_METHOD ?? 'naive').trim();
const RAGFLOW_KEYWORD_SEARCH = (process.env.RAGFLOW_KEYWORD_SEARCH ?? '0') !== '0';
const RAGFLOW_DEFAULT_SIMILARITY_THRESHOLD = Number(process.env.RAGFLOW_DEFAULT_SIMILARITY_THRESHOLD ?? '0.2');
const RAGFLOW_INDEX_QUALITY_MIN_CHUNK_COUNT = Number(process.env.RAGFLOW_INDEX_QUALITY_MIN_CHUNK_COUNT ?? '1');
if (!Number.isInteger(RAGFLOW_INDEX_QUALITY_MIN_CHUNK_COUNT) || RAGFLOW_INDEX_QUALITY_MIN_CHUNK_COUNT < 1) throw new Error('invalid_index_quality_min_chunk_count');
const REQUEST_TIMEOUT_MS = Number(process.env.RAGFLOW_REQUEST_TIMEOUT_MS ?? '30000');
const KNOWLEDGE_MAX_DOCUMENT_BYTES = Number(process.env.KNOWLEDGE_MAX_DOCUMENT_BYTES ?? 25 * 1024 * 1024);
if (!Number.isFinite(KNOWLEDGE_MAX_DOCUMENT_BYTES) || KNOWLEDGE_MAX_DOCUMENT_BYTES <= 0) throw new Error('invalid_knowledge_max_document_bytes');
// Provider calls carry document bytes as Base64 JSON. Keep the adapter envelope above
// the canonical raw-file limit while remaining bounded and fail-closed.
const MAX_INVOKE_BODY_BYTES = Math.ceil(KNOWLEDGE_MAX_DOCUMENT_BYTES * 1.45) + 128 * 1024;
const CONTRACT_VERSION = 'gbap.knowledge.v1';
const ADAPTER_VERSION = '0.3.0';
const UPSTREAM_VERSION = 'v0.27.2';

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readJson(req, maxBytes = 8 * 1024 * 1024) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}
function secret(path, label) {
  if (!path || !existsSync(path)) throw new Error(`${label}_secret_unavailable`);
  const value = readFileSync(path, 'utf8').trim();
  if (!value) throw new Error(`${label}_secret_empty`);
  return value;
}
function authorizeCaller(req) {
  if (!GBAP_ADAPTER_TOKEN_FILE) return;
  const expected = secret(GBAP_ADAPTER_TOKEN_FILE, 'adapter');
  if (req.headers['x-gbap-provider-token'] !== expected) {
    const error = new Error('unauthorized_provider_caller'); error.httpStatus = 401; throw error;
  }
}
function ragflowApiKey() { return secret(RAGFLOW_API_KEY_FILE, 'ragflow_api_key'); }
function unwrap(body) {
  if (body && Object.prototype.hasOwnProperty.call(body, 'code') && body.code !== 0) throw new Error(`ragflow_code_${body.code}:${body.message ?? 'unknown'}`);
  return body?.data ?? body;
}
function normalizeRagflowDocumentError(error) {
  const message = String(error?.message ?? error ?? '');
  if (/ragflow_code_102:/u.test(message) && /(?:don't own the document|document .*not found)/iu.test(message)) {
    throw Object.assign(new Error('document_not_found'), { httpStatus: 404 });
  }
  throw error;
}
async function requireTeiReady() {
  try {
    const response = await fetch(`${RAGFLOW_TEI_BASE_URL}/health`, {
      signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, 5000)),
    });
    if (!response.ok) throw new Error(`tei_http_${response.status}`);
  } catch {
    throw Object.assign(new Error('tei_unavailable'), { httpStatus: 503 });
  }
}

async function extractorRequest(path, { method = 'GET', json, timeoutMs = 10_000 } = {}) {
  const headers = {};
  let body;
  if (json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
  const response = await fetch(`${KNOWLEDGE_EXTRACTOR_BASE_URL}${path}`, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const parsed = await response.json().catch(() => ({ error: 'invalid_extractor_json' }));
  if (!response.ok) throw Object.assign(new Error(`extractor_http_${response.status}:${parsed?.error ?? 'unknown'}`), { httpStatus: response.status >= 500 ? 503 : 400 });
  return parsed;
}
async function requireExtractorReady() {
  try {
    const health = await extractorRequest('/health', { timeoutMs: 5_000 });
    if (health?.status !== 'ok') throw new Error('extractor_not_ready');
  } catch {
    throw Object.assign(new Error('knowledge_extractor_unavailable'), { httpStatus: 503 });
  }
}
function isExtractorDocumentId(value) {
  return typeof value === 'string' && value.startsWith(EXTRACTOR_DOCUMENT_PREFIX);
}
function extractorJobId(value) {
  return isExtractorDocumentId(value) ? value.slice(EXTRACTOR_DOCUMENT_PREFIX.length) : null;
}
async function getRagflowDocumentRow(datasetId, documentId) {
  let data;
  try {
    data = await request(`/api/v1/datasets/${encodeURIComponent(datasetId)}/documents?id=${encodeURIComponent(documentId)}`);
  } catch (error) {
    normalizeRagflowDocumentError(error);
  }
  const row = data?.docs?.[0] ?? data?.documents?.[0] ?? (Array.isArray(data) ? data[0] : null);
  if (!row) throw new Error('ragflow_document_not_found');
  return row;
}
async function withExtractorHandoffLock(jobId, fn) {
  const previous = extractorHandoffLocks.get(jobId) ?? Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const queued = previous.then(() => gate);
  extractorHandoffLocks.set(jobId, queued);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (extractorHandoffLocks.get(jobId) === queued) extractorHandoffLocks.delete(jobId);
  }
}

async function ensureNormalizedRagflowDocument(datasetId, job) {
  const jobId = requireString(job?.jobId, 'extractor_job_id');
  return withExtractorHandoffLock(jobId, async () => {
    const currentJob = await extractorRequest(`/jobs/${encodeURIComponent(jobId)}`, { timeoutMs: 10_000 });
    if (currentJob?.handoffExternalId) return requireString(currentJob.handoffExternalId, 'ragflow_document_id');

    const result = await extractorRequest(`/jobs/${encodeURIComponent(jobId)}/result`, { timeoutMs: 30_000 });
    const normalizedName = requireString(result?.normalizedFilename, 'normalized_filename');
    const normalizedBytes = Buffer.from(requireString(result?.contentBase64, 'normalized_content_base64'), 'base64');
    if (!normalizedBytes.length) throw new Error('extractor_empty_normalized_document');

    const existing = await request(`/api/v1/datasets/${encodeURIComponent(datasetId)}/documents?name=${encodeURIComponent(normalizedName)}&page=1&page_size=10`);
    const docs = Array.isArray(existing?.docs) ? existing.docs : (Array.isArray(existing) ? existing : []);
    const existingDocument = docs.find((item) => item?.name === normalizedName);
    let documentId = existingDocument?.id ?? null;

    if (!documentId) {
      const form = new FormData();
      form.append('file', new Blob([normalizedBytes], { type: 'text/markdown' }), normalizedName);
      form.append('display_name', normalizedName);
      const uploaded = await request(`/api/v1/datasets/${encodeURIComponent(datasetId)}/documents`, { method: 'POST', form });
      const row = Array.isArray(uploaded) ? uploaded[0] : uploaded?.[0];
      documentId = requireString(row?.id, 'ragflow_document_id');
    }

    // Upload and parse are separate operations. If parse failed after upload,
    // recover the existing document instead of treating its presence as success.
    // A lost response after a successful parse must not restart a running job.
    const run = existingDocument?.run;
    if (!existingDocument || !['RUNNING', '1', 1, 'DONE', '3', 3].includes(run)) {
      await request(`/api/v1/datasets/${encodeURIComponent(datasetId)}/documents/parse`, {
        method: 'POST', json: { document_ids: [documentId] },
      });
    }

    await extractorRequest(`/jobs/${encodeURIComponent(jobId)}/handoff`, {
      method: 'PUT',
      json: { externalId: documentId },
      timeoutMs: 10_000,
    });
    return documentId;
  });
}

async function extractorDocumentStatus(datasetId, providerDocumentId) {
  const jobId = extractorJobId(providerDocumentId);
  if (!jobId) return null;
  let job;
  try {
    job = await extractorRequest(`/jobs/${encodeURIComponent(jobId)}`, { timeoutMs: 10_000 });
  } catch (error) {
    if (String(error?.message ?? '').startsWith('extractor_http_404:')) {
      return { state: 'FAILED', detail: 'extractor_job_missing:canonical_source_retry_required' };
    }
    throw error;
  }
  if (job?.state === 'FAILED') {
    return {
      state: 'FAILED',
      detail: `extractor_failed:${job?.error ?? 'unknown'}`,
      extraction: { parser: job?.parser ?? null, metrics: job?.metrics ?? null, stage: job?.stage ?? null },
    };
  }
  if (job?.state === 'CANCELLED') return { state: 'CANCELLED', detail: 'extractor_cancelled' };
  if (job?.state !== 'READY') {
    return {
      state: 'INDEXING',
      detail: `extractor_processing:${job?.stage ?? job?.state ?? 'unknown'}`,
      extraction: { parser: job?.parser ?? null, metrics: job?.metrics ?? null, stage: job?.stage ?? null },
    };
  }
  await requireTeiReady();
  const ragflowDocumentId = await ensureNormalizedRagflowDocument(datasetId, job);
  const row = await getRagflowDocumentRow(datasetId, ragflowDocumentId);
  const quality = enforceIndexQuality(row);
  const state = quality?.state ?? stateFromRun(row.run);
  return {
    ...(quality ?? {
      state,
      detail: row.message ?? row.progress_msg ?? null,
      chunkCount: row.chunk_count ?? null,
      tokenCount: row.token_count ?? null,
    }),
    record: { externalType: 'document', externalId: ragflowDocumentId, title: job?.sourceFilename ?? null },
    extraction: { parser: job?.parser ?? null, metrics: job?.metrics ?? null, stage: job?.stage ?? null },
  };
}

async function request(path, { method = 'GET', json, form } = {}) {
  const headers = { Authorization: `Bearer ${ragflowApiKey()}` };
  let body;
  if (json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
  if (form !== undefined) body = form;
  const response = await fetch(`${RAGFLOW_BASE_URL}${path}`, { method, headers, body, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const parsed = await response.json().catch(() => ({ message: 'invalid_ragflow_json' }));
  if (!response.ok) throw new Error(`ragflow_http_${response.status}:${parsed?.message ?? parsed?.error ?? 'unknown'}`);
  return unwrap(parsed);
}
function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`invalid_${label}`);
  return value.trim();
}
function badRequest(message) {
  return Object.assign(new Error(message), { httpStatus: 400 });
}
function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw badRequest(`invalid_${label}`);
  return value;
}
function assertAllowedKeys(value, allowed, label) {
  const object = assertPlainObject(value, label);
  const unexpected = Object.keys(object).filter((key) => !allowed.has(key));
  if (unexpected.length) throw badRequest(`unsupported_${label}_field`);
  return object;
}
function optionalBoundedString(value, label, maxLength) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength || /[\r\n]/u.test(value)) throw badRequest(`invalid_${label}`);
  return value.trim();
}
function delegatedBearer(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 16_384 || !value.startsWith('Bearer ') || /[\r\n]/u.test(value)) {
    throw badRequest('invalid_delegated_bearer');
  }
  const token = value.slice(7).trim();
  if (!token || /\s/u.test(token)) throw badRequest('invalid_delegated_bearer');
  return `Bearer ${token}`;
}
function optionalDelegatedBearer(value) {
  if (value === undefined || value === null || value === '') return null;
  return delegatedBearer(value);
}
function stateFromRun(run) {
  if (run === 'DONE' || run === 3 || run === '3') return 'READY';
  if (run === 'FAIL' || run === 4 || run === '4') return 'FAILED';
  if (run === 'CANCEL' || run === 2 || run === '2') return 'CANCELLED';
  return 'INDEXING';
}
function chunkText(chunk) {
  return chunk?.content_with_weight ?? chunk?.content ?? chunk?.text ?? '';
}
function pageFromChunk(chunk) {
  if (Number.isInteger(chunk?.page_num_int)) return chunk.page_num_int;
  if (Array.isArray(chunk?.positions) && chunk.positions.length && Array.isArray(chunk.positions[0])) return chunk.positions[0][0] ?? null;
  return null;
}
function numericCount(value) {
  const count = Number(value ?? 0);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}
function enforceIndexQuality(row) {
  const state = stateFromRun(row?.run);
  const chunkCount = numericCount(row?.chunk_count);
  const tokenCount = numericCount(row?.token_count);
  if (state !== 'READY') return null;
  if (chunkCount >= RAGFLOW_INDEX_QUALITY_MIN_CHUNK_COUNT && tokenCount > 0) return null;
  return {
    state: 'FAILED',
    detail: `index_empty:chunks=${chunkCount}:tokens=${tokenCount}`,
    chunkCount,
    tokenCount,
  };
}

async function invoke(capability, payload = {}) {
  if (capability === 'knowledge.v1.health') {
    await requireTeiReady();
    await requireExtractorReady();
    await request('/api/v1/datasets?page=1&page_size=1');
    return { ok: true, state: 'READY', contractVersion: CONTRACT_VERSION, upstreamVersion: UPSTREAM_VERSION, embeddingModel: RAGFLOW_EMBEDDING_MODEL || null };
  }
  if (capability === 'knowledge.v1.collection.list') {
    const data = await request('/api/v1/datasets?page=1&page_size=100');
    const items = Array.isArray(data) ? data : (data?.datasets ?? data?.items ?? []);
    return { records: items.map((item) => ({ externalType: 'dataset', externalId: item.id, name: item.name })) };
  }
  if (capability === 'knowledge.v1.collection.create') {
    const dataset = {
      name: requireString(payload.name, 'collection_name'),
      description: payload.description ?? '',
      ...(RAGFLOW_EMBEDDING_MODEL ? { embedding_model: RAGFLOW_EMBEDDING_MODEL } : {}),
      ...(RAGFLOW_CHUNK_METHOD ? { chunk_method: RAGFLOW_CHUNK_METHOD } : {}),
    };
    const data = await request('/api/v1/datasets', { method: 'POST', json: dataset });
    return { record: { externalType: 'dataset', externalId: requireString(data?.id, 'ragflow_dataset_id'), name: data?.name ?? payload.name } };
  }
  if (capability === 'knowledge.v1.collection.update') {
    const id = requireString(payload.providerCollectionId, 'provider_collection_id');
    const data = await request(`/api/v1/datasets/${encodeURIComponent(id)}`, { method: 'PUT', json: { ...(payload.name ? { name: payload.name } : {}), ...(payload.description !== undefined ? { description: payload.description ?? '' } : {}) } });
    return { record: { externalType: 'dataset', externalId: id, name: data?.name ?? payload.name ?? null } };
  }
  if (capability === 'knowledge.v1.collection.archive') {
    const id = requireString(payload.providerCollectionId, 'provider_collection_id');
    await request('/api/v1/datasets', { method: 'DELETE', json: { ids: [id] } });
    return { removed: true, externalType: 'dataset', externalId: id };
  }
  if (capability === 'knowledge.v1.document.ingest') {
    await requireExtractorReady();
    const datasetId = requireString(payload.providerCollectionId, 'provider_collection_id');
    const fileName = requireString(payload.sourceFilename, 'source_filename');
    const mediaType = typeof payload.mediaType === 'string' && payload.mediaType ? payload.mediaType : 'application/octet-stream';
    const contentBase64 = requireString(payload.contentBase64, 'content_base64');
    const bytes = Buffer.from(contentBase64, 'base64');
    if (!bytes.length) throw new Error('empty_document');
    if (bytes.length > KNOWLEDGE_MAX_DOCUMENT_BYTES) throw badRequest('document_too_large');
    const job = await extractorRequest('/jobs', {
      method: 'POST',
      json: {
        sourceFilename: fileName,
        mediaType,
        contentBase64,
        knowledgeDocumentId: payload.knowledgeDocumentId ?? null,
        knowledgeDocumentVersionId: payload.knowledgeDocumentVersionId ?? null,
        checksum: payload.checksum ?? null,
      },
      timeoutMs: 30_000,
    });
    const jobId = requireString(job?.jobId, 'extractor_job_id');
    return {
      record: { externalType: 'document', externalId: `${EXTRACTOR_DOCUMENT_PREFIX}${jobId}`, title: fileName },
      state: 'INDEXING',
      detail: 'extractor_queued',
      extraction: { stage: job?.stage ?? 'QUEUED' },
    };
  }
  if (capability === 'knowledge.v1.document.status') {
    const datasetId = requireString(payload.providerCollectionId, 'provider_collection_id');
    const documentId = requireString(payload.providerDocumentId, 'provider_document_id');
    if (isExtractorDocumentId(documentId)) return extractorDocumentStatus(datasetId, documentId);
    const row = await getRagflowDocumentRow(datasetId, documentId);
    const indexQuality = enforceIndexQuality(row);
    if (indexQuality) return indexQuality;
    return {
      state: stateFromRun(row.run),
      detail: row.message ?? row.progress_msg ?? null,
      chunkCount: row.chunk_count ?? null,
      tokenCount: row.token_count ?? null,
    };
  }
  if (capability === 'knowledge.v1.document.remove') {
    const datasetId = requireString(payload.providerCollectionId, 'provider_collection_id');
    const documentId = requireString(payload.providerDocumentId, 'provider_document_id');
    if (isExtractorDocumentId(documentId)) {
      const jobId = extractorJobId(documentId);
      try {
        const job = await extractorRequest(`/jobs/${encodeURIComponent(jobId)}`, { timeoutMs: 10_000 });
        if (job?.handoffExternalId) {
          try {
            await request(`/api/v1/datasets/${encodeURIComponent(datasetId)}/documents`, { method: 'DELETE', json: { ids: [job.handoffExternalId] } });
          } catch (error) {
            normalizeRagflowDocumentError(error);
          }
        }
      } catch (error) {
        if (!String(error?.message ?? '').includes('404')) throw error;
      }
      await extractorRequest(`/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE', timeoutMs: 10_000 }).catch((error) => {
        if (!String(error?.message ?? '').includes('404')) throw error;
      });
      return { removed: true, externalType: 'document', externalId: documentId };
    }
    try {
      await request(`/api/v1/datasets/${encodeURIComponent(datasetId)}/documents`, { method: 'DELETE', json: { ids: [documentId] } });
    } catch (error) {
      normalizeRagflowDocumentError(error);
    }
    return { removed: true, externalType: 'document', externalId: documentId };
  }
  if (capability === 'knowledge.v1.search') {
    await requireTeiReady();
    const datasetIds = Array.isArray(payload.providerCollectionIds) ? payload.providerCollectionIds.map((item) => requireString(item, 'provider_collection_id')) : [];
    if (!datasetIds.length) return { results: [] };
    const topK = Number.isInteger(payload.topK) ? Math.max(1, Math.min(payload.topK, 50)) : 10;
    const similarity = typeof payload.minimumScore === 'number' ? payload.minimumScore : (Number.isFinite(RAGFLOW_DEFAULT_SIMILARITY_THRESHOLD) ? RAGFLOW_DEFAULT_SIMILARITY_THRESHOLD : 0.2);
    const data = await request('/api/v1/retrieval', {
      method: 'POST',
      json: {
        dataset_ids: datasetIds,
        question: requireString(payload.query, 'query'),
        page: 1,
        page_size: topK,
        similarity_threshold: similarity,
        vector_similarity_weight: 0.3,
        knn_top_k: 1024,
        ...(RAGFLOW_KEYWORD_SEARCH ? { keyword: true } : {}),
      },
    });
    const chunks = Array.isArray(data?.chunks) ? data.chunks : (Array.isArray(data) ? data : []);
    return { results: chunks.slice(0, topK).map((chunk) => ({ documentExternalType: 'document', documentExternalId: chunk.document_id ?? chunk.doc_id ?? chunk.documentId ?? null, chunkExternalId: chunk.id ?? chunk.chunk_id ?? null, text: chunkText(chunk), score: typeof chunk.similarity === 'number' ? chunk.similarity : (typeof chunk.score === 'number' ? chunk.score : null), page: pageFromChunk(chunk), section: chunk.section ?? chunk.title ?? null, sourceTitle: chunk.docnm_kwd ?? chunk.document_name ?? null })).filter((item) => item.documentExternalId) };
  }
  if (capability === 'knowledge.v1.chunk.get') {
    const datasetId = requireString(payload.providerCollectionId, 'provider_collection_id');
    const documentId = requireString(payload.providerDocumentId, 'provider_document_id');
    const chunkId = requireString(payload.providerChunkId, 'provider_chunk_id');
    const data = await request(`/api/v1/datasets/${encodeURIComponent(datasetId)}/documents/${encodeURIComponent(documentId)}/chunks/${encodeURIComponent(chunkId)}`);
    const chunk = data?.chunk ?? data;
    return { chunk: { chunkExternalId: chunk?.id ?? chunkId, text: chunkText(chunk), page: pageFromChunk(chunk) } };
  }
  throw Object.assign(new Error('unsupported_capability'), { httpStatus: 400 });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { status: 'ok', provider: 'ragflow-adapter', adapterVersion: ADAPTER_VERSION, contractVersion: CONTRACT_VERSION, upstreamVersion: UPSTREAM_VERSION, embeddingModel: RAGFLOW_EMBEDDING_MODEL || null });
    }
    if (req.method === 'GET' && url.pathname === '/health/extractor') {
      try {
        await requireExtractorReady();
        return send(res, 200, { status: 'ok', dependency: 'knowledge-extractor', route: 'adapter-internal' });
      } catch {
        return send(res, 503, { status: 'unavailable', dependency: 'knowledge-extractor', route: 'adapter-internal' });
      }
    }
    if (req.method === 'POST' && url.pathname === '/invoke') {
      authorizeCaller(req);
      const input = await readJson(req, MAX_INVOKE_BODY_BYTES);
      const capability = requireString(input.capability, 'capability');
      if (input?.context?.contractVersion !== CONTRACT_VERSION) return send(res, 409, { error: 'contract_version_mismatch' });
      const result = await invoke(capability, input.payload ?? {});
      return send(res, 200, result);
    }
    return send(res, 404, { error: 'not_found' });
  } catch (error) {
    return send(res, error.httpStatus ?? 502, { error: error.message ?? 'adapter_error' });
  }
});

server.listen(PORT, HOST, () => console.log(JSON.stringify({ event: 'ragflow-adapter.started', port: PORT, contractVersion: CONTRACT_VERSION, upstreamVersion: UPSTREAM_VERSION, embeddingModel: RAGFLOW_EMBEDDING_MODEL || null })));
