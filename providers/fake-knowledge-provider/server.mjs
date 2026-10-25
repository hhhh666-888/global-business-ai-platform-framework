import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? '8093');
const HOST = '0.0.0.0';
const CONTRACT = 'gbap.knowledge.v1';
const collections = new Map();
const documents = new Map();

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

async function invoke(capability, payload) {
  if (capability === 'knowledge.v1.health') return { ok: true, state: 'READY' };
  if (capability === 'knowledge.v1.collection.create') {
    const id = `dataset-${randomUUID()}`;
    collections.set(id, { id, name: payload.name });
    return { record: { externalType: 'dataset', externalId: id, name: payload.name } };
  }
  if (capability === 'knowledge.v1.collection.list') return { records: [...collections.values()].map((item) => ({ externalType: 'dataset', externalId: item.id, name: item.name })) };
  if (capability === 'knowledge.v1.document.ingest') {
    if (!collections.has(payload.providerCollectionId)) throw Object.assign(new Error('collection_not_found'), { httpStatus: 404 });
    const id = `document-${randomUUID()}`;
    const text = Buffer.from(payload.contentBase64, 'base64').toString('utf8');
    documents.set(id, { id, datasetId: payload.providerCollectionId, title: payload.title, text, state: 'READY' });
    return { record: { externalType: 'document', externalId: id, title: payload.title }, state: 'READY' };
  }
  if (capability === 'knowledge.v1.document.status') {
    const row = documents.get(payload.providerDocumentId);
    if (!row) throw Object.assign(new Error('document_not_found'), { httpStatus: 404 });
    return { state: row.state, detail: null, chunkCount: 1 };
  }
  if (capability === 'knowledge.v1.search') {
    const query = String(payload.query ?? '').toLowerCase();
    const allowed = new Set(payload.providerCollectionIds ?? []);
    const results = [...documents.values()]
      .filter((row) => allowed.has(row.datasetId) && (!query || row.text.toLowerCase().includes(query)))
      .slice(0, payload.topK ?? 10)
      .map((row) => ({ documentExternalType: 'document', documentExternalId: row.id, chunkExternalId: `chunk-${row.id}`, text: row.text, score: 0.99, page: 1, section: 'fixture', sourceTitle: row.title }));
    return { results };
  }
  if (capability === 'knowledge.v1.document.remove') {
    return { removed: documents.delete(payload.providerDocumentId) };
  }
  if (capability === 'knowledge.v1.collection.archive') {
    return { removed: collections.delete(payload.providerCollectionId) };
  }
  if (capability === 'knowledge.v1.collection.update') return { record: { externalType: 'dataset', externalId: payload.providerCollectionId, name: payload.name ?? null } };
  if (capability === 'knowledge.v1.chunk.get') return { chunk: { chunkExternalId: payload.providerChunkId, text: 'fixture', page: 1 } };
  throw Object.assign(new Error('unsupported_capability'), { httpStatus: 400 });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok', provider: 'fake-knowledge-provider', contractVersion: CONTRACT });
    if (req.method === 'POST' && url.pathname === '/__test/reset') {
      collections.clear();
      documents.clear();
      return send(res, 200, { reset: true });
    }
    if (req.method === 'POST' && url.pathname === '/invoke') {
      const input = await readJson(req);
      if (input?.context?.contractVersion !== CONTRACT) return send(res, 409, { error: 'contract_version_mismatch' });
      return send(res, 200, await invoke(input.capability, input.payload ?? {}));
    }
    return send(res, 404, { error: 'not_found' });
  } catch (error) {
    return send(res, error.httpStatus ?? 500, { error: error.message ?? 'fake_provider_error' });
  }
}).listen(PORT, HOST, () => console.log(JSON.stringify({ event: 'fake-knowledge-provider.started', port: PORT })));
