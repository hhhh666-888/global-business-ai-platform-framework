// Public status vocabulary shared by the employee API and read-only diagnostics.
// Raw provider errors, source paths and credentials must never leave this layer.
export function publicIngestionDetail(detail) {
  const message = String(detail ?? '');
  if (!message) return null;
  if (/document_parse_(?:memory|storage)_limit|document_complexity_limit|normalized_content_too_large|_output_too_large/u.test(message)) return 'PROCESSING_RESOURCE_LIMIT';
  if (message.includes('document_parse_timeout:')) return 'PROCESSING_SERVICE_TIMEOUT';
  if (message.includes('knowledge_processing_timeout')) return 'PROCESSING_TIMEOUT';
  if (message.includes('knowledge_status_retry:')) return 'STATUS_CHECK_RETRY';
  if (message.includes('knowledge_status_failed:')) return 'STATUS_CHECK_FAILED';
  if (message.includes('knowledge_extractor_unavailable')) return 'EXTRACTOR_UNAVAILABLE';
  if (message.includes('tei_unavailable')) return 'EMBEDDING_UNAVAILABLE';
  if (message.includes('extractor_processing:QUEUED') || message.includes('extractor_queued')) return 'EXTRACTION_QUEUED';
  if (message.includes('knowledge_provider_unavailable')) return 'PROVIDER_UNAVAILABLE';
  if (message.includes('knowledge_collection_provider_mapping_missing')) return 'COLLECTION_SYNC_REQUIRED';
  if (message.includes('knowledge_provider_mapping_missing')) return 'PROVIDER_MAPPING_REQUIRED';
  if (message.includes('extractor_processing:')) return 'EXTRACTION_IN_PROGRESS';
  if (message.includes('extractor_failed:') || message.includes('extractor_job_missing:')) return 'EXTRACTION_FAILED';
  if (message.includes('index_empty') || message.includes('pdf_index_empty_after_')) return 'INDEX_QUALITY_FAILED';
  if (message.includes('pdf_quality_fallback:')) return 'PDF_QUALITY_FALLBACK';
  return 'PROCESSING_FAILED';
}

export function publicIngestionCause(detail) {
  const message = String(detail ?? '');
  if (/request_body_too_large|document_too_large|invalid_document_size/u.test(message)) return 'FILE_SIZE_REJECTED';
  if (/knowledge_extractor_unavailable|extractor_http_50[234]/u.test(message)) return 'EXTRACTOR_UNAVAILABLE';
  if (message.includes('tei_unavailable')) return 'EMBEDDING_UNAVAILABLE';
  if (/provider_http_401|unauthorized_provider_caller|ragflow_http_40[13]|secret_(?:unavailable|empty)/u.test(message)) return 'PROCESSING_AUTH_FAILED';
  if (/TimeoutError|timed? ?out|_timeout:/iu.test(message)) return 'PROCESSING_SERVICE_TIMEOUT';
  return publicIngestionDetail(detail);
}

export function publicExtractionStatus(value) {
  if (!value || typeof value !== 'object') return null;
  const stage = ['QUEUED', 'EXTRACTING', 'NORMALIZED', 'FAILED', 'CANCELLED', 'RECOVERED'].includes(value.stage) ? value.stage : null;
  const metrics = {};
  for (const key of ['pageCount', 'pagesWithText', 'pageCoverage', 'characters', 'tokenishCount']) {
    if (typeof value.metrics?.[key] === 'number' && Number.isFinite(value.metrics[key]) && value.metrics[key] >= 0) metrics[key] = value.metrics[key];
  }
  return { stage, metrics };
}
