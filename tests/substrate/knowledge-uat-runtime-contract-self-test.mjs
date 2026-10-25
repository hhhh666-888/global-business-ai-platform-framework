import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lock = JSON.parse(readFileSync('infrastructure/knowledge-runtime/runtime.lock.json', 'utf8'));
const compose = readFileSync('infrastructure/knowledge-runtime/docker-compose.adapter.yml', 'utf8');
const common = readFileSync('infrastructure/knowledge-runtime/Knowledge-UAT.Common.ps1', 'utf8');
const install = readFileSync('infrastructure/knowledge-runtime/Install-GBAP-Knowledge-UAT.ps1', 'utf8');
const start = readFileSync('infrastructure/knowledge-runtime/Start-GBAP-Knowledge-UAT.ps1', 'utf8');
const stop = readFileSync('infrastructure/knowledge-runtime/Stop-GBAP-Knowledge-UAT.ps1', 'utf8');
const verify = readFileSync('infrastructure/knowledge-runtime/Test-GBAP-Knowledge-UAT.ps1', 'utf8');
const adapter = readFileSync('providers/ragflow-adapter/server.mjs', 'utf8');
const extractor = readFileSync('providers/knowledge-extractor/server.py', 'utf8');
const extractorDockerfile = readFileSync('providers/knowledge-extractor/Dockerfile', 'utf8');
const extractorRequirements = readFileSync('providers/knowledge-extractor/requirements.txt', 'utf8');
const knowledgeApi = readFileSync('apps/api/knowledge-native.mjs', 'utf8');
const knowledgeStatus = readFileSync('apps/api/knowledge-status.mjs', 'utf8');
const apiBootstrap = readFileSync('apps/api/bootstrap.mjs', 'utf8');
const knowledgeSurface = readFileSync('apps/web/src/components/KnowledgeSurface.tsx', 'utf8');

assert.equal(lock.upstream.version, 'v0.27.2');
assert.equal(lock.upstream.commit, 'a024bea0cd93f39e6652a42bf84dd20c55bc560b');
assert.equal(lock.upstream.image, 'infiniflow/ragflow:v0.27.2');
assert.equal(lock.embedding.provider, 'HuggingFace');
assert.equal(lock.embedding.model, 'Alibaba-NLP/gte-multilingual-base');
assert.equal(lock.embedding.revision, '9bbca17d9273fd0d03d5725c7a4b0f6b45142062');
assert.equal(lock.embedding.modelId, 'Alibaba-NLP/gte-multilingual-base@gbap-gte-multilingual@HuggingFace');
assert.equal(lock.authorization.hostDecision, 'COLOCATION_CANDIDATE');
assert.equal(lock.authorization.realCompanyKnowledgeAuthorized, false);
assert.equal(lock.runtimeTuning.embeddingBatchSize, 4);
assert.equal(lock.runtimeTuning.maxConcurrentTasks, 1);
assert.equal(lock.runtimeTuning.maxConcurrentChunkBuilders, 1);
assert.equal(lock.runtimeTuning.indexQualityMinChunkCount, 1);

assert.equal(lock.extractor.service, 'knowledge-extractor');
assert.equal(lock.extractor.version, '1.0');
assert.equal(lock.extractor.port, 8093);
assert.equal(lock.extractor.hostPort, 18093);
assert.equal(lock.extractor.maxDocumentBytes, 26214400);
assert.equal(lock.extractor.maxConcurrentJobs, 1);
assert.equal(lock.extractor.maxNormalizedChars, 8000000);
assert.equal(lock.extractor.maxArchiveMembers, 20000);
assert.equal(lock.extractor.maxArchiveUncompressedBytes, 536870912);
assert.equal(lock.extractor.maxArchiveMemberBytes, 134217728);
assert.equal(lock.extractor.maxArchiveCompressionRatio, 500);
assert.equal(lock.extractor.openDataLoaderTimeoutSec, 600);
assert.equal(lock.extractor.ocrTimeoutSec, 1200);
assert.equal(lock.extractor.officeTimeoutSec, 240);
assert.equal(lock.extractor.imageOcrTimeoutSec, 300);
// Keep the actual deployment budget wired to the reviewed runtime lock.
for (const [field, variable, expected] of [
  ['parseTimeoutSec', 'GBAP_KNOWLEDGE_PARSE_TIMEOUT_SEC', 2400],
  ['maxParserRssBytes', 'GBAP_KNOWLEDGE_MAX_PARSER_RSS_BYTES', 2147483648],
  ['maxParserFileBytes', 'GBAP_KNOWLEDGE_MAX_PARSER_FILE_BYTES', 268435456],
  ['maxParserTempBytes', 'GBAP_KNOWLEDGE_MAX_PARSER_TEMP_BYTES', 1073741824],
  ['maxSpreadsheetRows', 'GBAP_KNOWLEDGE_MAX_SPREADSHEET_ROWS', 100000],
  ['maxSpreadsheetCells', 'GBAP_KNOWLEDGE_MAX_SPREADSHEET_CELLS', 2000000],
  ['containerMemoryLimit', 'GBAP_KNOWLEDGE_EXTRACTOR_MEMORY_LIMIT', '3g'],
]) {
  assert.equal(lock.extractor[field], expected);
  assert.ok(common.includes(`$env:${variable} = [string]$Lock.extractor.${field}`));
  assert.ok(compose.includes('${' + variable + ':-' + expected + '}'));
}
assert.equal(lock.extractor.runAsUid, 10001);
assert.equal(lock.extractor.handedOffRetentionDays, 7);
assert.equal(lock.extractor.failedRetentionDays, 30);
assert.equal(lock.extractor.maintenanceIntervalSec, 3600);
assert.equal(lock.extractor.ocrLanguages, 'eng+chi_sim');
assert.equal(lock.extractor.pdfPrimary, 'OPENDATALOADER_LOCAL');
assert.deepEqual(lock.extractor.pdfFallbacks, ['PYMUPDF_NATIVE', 'OCRMY_PDF_OPENDATALOADER']);
assert.equal(lock.extractor.officeRoutes.docx, 'PYTHON_DOCX');
assert.equal(lock.extractor.officeRoutes.xlsx, 'OPENPYXL');
assert.equal(lock.extractor.officeRoutes.pptx, 'PYTHON_PPTX');
assert.equal(lock.extractor.officeRoutes.legacyOffice, 'LIBREOFFICE_CONVERSION');
assert.equal(lock.extractor.officeFallback, 'LIBREOFFICE_PDF_TO_PDF_PIPELINE');

assert.match(compose, /knowledge-extractor:/);
assert.match(compose, /dockerfile: providers\/knowledge-extractor\/Dockerfile/);
assert.match(compose, /knowledge-extractor-data:\/data/);
assert.match(compose, /127\.0\.0\.1:\$\{GBAP_KNOWLEDGE_EXTRACTOR_PORT:-18093\}:8093/);
assert.match(compose, /KNOWLEDGE_EXTRACTOR_BASE_URL: .*knowledge-extractor:8093/);
assert.match(compose, /condition: service_healthy/);
assert.match(compose, /RAGFLOW_INDEX_QUALITY_MIN_CHUNK_COUNT:/);
assert.match(compose, /RAGFLOW_API_KEY_FILE: \/run\/secrets\/ragflow-api-key/);
assert.match(compose, /GBAP_ADAPTER_TOKEN_FILE: \/run\/secrets\/gbap-adapter-token/);
assert.match(compose, /gbap-local-uat_gbap-runtime/);
assert.match(compose, /gbap-knowledge-ragflow-uat_ragflow/);
assert.match(compose, /RAGFLOW_BASE_URL: .*ragflow-cpu:9380/);
assert.match(compose, /RAGFLOW_TEI_BASE_URL: .*tei:80/);
assert.match(compose, /KNOWLEDGE_MAX_DOCUMENT_BYTES: "26214400"/);
assert.match(compose, /KNOWLEDGE_MAX_NORMALIZED_CHARS:/);
assert.match(compose, /KNOWLEDGE_MAX_ARCHIVE_MEMBERS:/);
assert.match(compose, /KNOWLEDGE_OPENDATALOADER_TIMEOUT_SEC:/);
assert.match(compose, /extractor-internal:/);
assert.match(compose, /internal: true/);
assert.match(compose, /cap_drop:\s*\n\s*- ALL/);
assert.match(compose, /no-new-privileges:true/);
assert.match(compose, /pids_limit: 256/);
assert.doesNotMatch(compose, /RAGFLOW_PDF_LAYOUT_RECOGNIZE/);
assert.doesNotMatch(compose, /RAGFLOW_PDF_FALLBACK/);
assert.doesNotMatch(compose, /host\.docker\.internal/);
assert.doesNotMatch(compose, /:latest/);

assert.match(common, /function Get-KnowledgeLock/);
assert.doesNotMatch(common, /function Get-KnowledgeRuntimeLock/);
assert.match(common, /function Set-KnowledgeRagflowRuntimeTuning/);
assert.match(common, /EMBEDDING_BATCH_SIZE=\[string\]\$embeddingBatchSize/);
assert.match(common, /MAX_CONCURRENT_TASKS=\[string\]\$maxConcurrentTasks/);
assert.match(common, /MAX_CONCURRENT_CHUNK_BUILDERS=\[string\]\$maxConcurrentChunkBuilders/);
assert.match(common, /function Wait-KnowledgeTeiReady/);
assert.match(common, /function Wait-KnowledgeExtractorReady/);
assert.match(common, /\/health\/extractor/);
assert.match(common, /adapterHttpPort/);
assert.doesNotMatch(common, /127\.0\.0\.1:\$\(\$Lock\.extractor\.hostPort\)\/health/);
assert.match(adapter, /url\.pathname === '\/health\/extractor'/);
assert.match(adapter, /route: 'adapter-internal'/);
assert.match(common, /GBAP_KNOWLEDGE_EXTRACTOR_BASE_URL/);
assert.match(common, /GBAP_KNOWLEDGE_EXTRACTOR_PORT/);
assert.match(common, /GBAP_KNOWLEDGE_OCR_LANGUAGES/);
assert.match(common, /GBAP_KNOWLEDGE_MAX_ARCHIVE_MEMBERS/);
assert.match(common, /GBAP_KNOWLEDGE_OPENDATALOADER_TIMEOUT_SEC/);
assert.match(common, /GBAP_KNOWLEDGE_OCR_TIMEOUT_SEC/);
assert.match(common, /GBAP_KNOWLEDGE_OFFICE_TIMEOUT_SEC/);
assert.match(common, /GBAP_KNOWLEDGE_HANDED_OFF_RETENTION_DAYS/);
assert.match(common, /GBAP_KNOWLEDGE_FAILED_RETENTION_DAYS/);
assert.match(common, /GBAP_KNOWLEDGE_MAINTENANCE_INTERVAL_SEC/);
assert.match(common, /GBAP_KNOWLEDGE_INDEX_QUALITY_MIN_CHUNK_COUNT/);
assert.doesNotMatch(common, /GBAP_KNOWLEDGE_PDF_LAYOUT_RECOGNIZE/);

assert.match(install, /Test-GBAP-Knowledge-HostAdmission\.ps1/);
assert.match(install, /COLOCATION_CANDIDATE/);
assert.match(install, /fetch --depth=1 --no-tags --force --filter=blob:none origin \$Lock\.upstream\.commit/);
assert.match(install, /sparse-checkout set docker/);
assert.match(install, /Wait-KnowledgeTeiReady/);
assert.match(install, /Wait-KnowledgeExtractorReady/);
assert.match(start, /Wait-KnowledgeTeiReady/);
assert.match(start, /Wait-KnowledgeExtractorReady/);
assert.doesNotMatch(install, /RagflowEnterpriseLead|AiOrchestrationProvider|GENERATIVE_LLM/iu);
assert.doesNotMatch(common, /RAGFLOW_AGENT_ID/iu);
assert.match(verify, /EXTRACTOR=READY/);
assert.match(verify, /EXTRACTOR_PDF_PRIMARY/);
assert.match(verify, /EXTRACTOR_PDF_FALLBACKS/);
assert.match(verify, /TEI=READY/);
assert.match(verify, /HEALTH=\$\(\$health\.state\)/);
assert.doesNotMatch(install, /down -v/);
assert.doesNotMatch(start, /down -v/);
assert.match(stop, /DATA_VOLUMES=PRESERVED/);

assert.match(extractorDockerfile, /^FROM python:3\.12\.11-slim-bookworm@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7/m);
assert.match(extractorDockerfile, /default-jre-headless/);
assert.match(extractorDockerfile, /tesseract-ocr-chi-sim/);
assert.match(extractorDockerfile, /fonts-noto-cjk/);
assert.match(extractorDockerfile, /libreoffice-writer/);
assert.match(extractorDockerfile, /libreoffice-calc/);
assert.match(extractorDockerfile, /libreoffice-impress/);
assert.match(extractorDockerfile, /USER 10001:10001/);
assert.match(extractorDockerfile, /HOME=\/home\/gbap/);
for (const dependency of [
  'opendataloader-pdf==2.5.8',
  'PyMuPDF==1.28.2',
  'python-docx==1.2.0',
  'openpyxl==3.1.5',
  'python-pptx==1.0.2',
  'ocrmypdf==17.12.1',
]) assert.ok(extractorRequirements.includes(dependency), 'missing pinned extractor dependency: ' + dependency);

assert.match(extractor, /OPENDATALOADER_LOCAL/);
assert.match(extractor, /PYMUPDF_NATIVE/);
assert.match(extractor, /OCRMY_PDF_OPENDATALOADER/);
assert.match(extractor, /PYTHON_DOCX/);
assert.match(extractor, /OPENPYXL/);
assert.match(extractor, /PYTHON_PPTX/);
assert.match(extractor, /LIBREOFFICE_CONVERSION/);
assert.match(extractor, /TESSERACT_OCR/);
assert.match(extractor, /EMAIL_NATIVE/);
assert.match(extractor, /EPUB_NATIVE/);
assert.match(extractor, /LIBREOFFICE_PDF_/);
assert.match(extractor, /def quality\(/);
assert.match(extractor, /def run_bounded\(/);
assert.match(extractor, /start_new_session=True/);
assert.match(extractor, /os\.killpg\(proc\.pid, signal\.SIGKILL\)/);
assert.match(extractor, /def validate_archive_container\(/);
assert.match(extractor, /archive_uncompressed_too_large/);
assert.match(extractor, /archive_compression_ratio_too_high/);
assert.match(extractor, /def purge_expired_jobs\(/);
assert.match(extractor, /handoff_external_id IS NOT NULL/);
assert.match(extractor, /MAINTENANCE_INTERVAL_SEC/);
assert.match(extractor, /"opendataloader-pdf"/);
assert.match(extractor, /"--threads", "1"/);
assert.doesNotMatch(extractor, /opendataloader_pdf\.convert/);
assert.match(extractor, /low_page_coverage/);
assert.match(extractor, /reset_interrupted_jobs/);
assert.match(extractor, /state='QUEUED',stage='RECOVERED'/);
assert.match(extractor, /opendataloader-" \+ uuid\.uuid4\(\)\.hex/);
assert.doesNotMatch(extractor, /https?:\/\//);

assert.match(adapter, /KNOWLEDGE_EXTRACTOR_BASE_URL/);
assert.match(adapter, /EXTRACTOR_DOCUMENT_PREFIX = 'extractor:'/);
assert.match(adapter, /async function extractorRequest/);
assert.match(adapter, /async function extractorDocumentStatus/);
assert.match(adapter, /async function ensureNormalizedRagflowDocument/);
assert.match(adapter, /async function requireExtractorReady/);
assert.match(adapter, /RAGFLOW_INDEX_QUALITY_MIN_CHUNK_COUNT/);
assert.match(adapter, /function enforceIndexQuality/);
assert.match(adapter, /detail: `index_empty:/);
assert.match(adapter, /normalizedFilename/);
assert.match(adapter, /handoffExternalId/);
assert.match(adapter, /const extractorHandoffLocks = new Map\(\)/);
assert.match(adapter, /async function withExtractorHandoffLock/);
assert.match(adapter, /await requireExtractorReady\(\)/);
assert.doesNotMatch(adapter, /applyPdfFastPath/);
assert.doesNotMatch(adapter, /triggerPdfQualityFallback/);
assert.doesNotMatch(adapter, /RAGFLOW_PDF_LAYOUT_RECOGNIZE/);

assert.match(knowledgeApi, /status\.result\?\.record\?\.externalId/);
assert.match(knowledgeApi, /knowledge\.document\.provider_mapping_reconciled/);
assert.match(knowledgeApi, /import.*publicIngestionDetail.*knowledge-status\.mjs/);
assert.match(knowledgeStatus, /EXTRACTION_IN_PROGRESS/);
assert.match(knowledgeStatus, /EXTRACTION_FAILED/);
assert.match(knowledgeStatus, /INDEX_QUALITY_FAILED/);
assert.match(knowledgeApi, /sourceTitle: document\.title/);
assert.match(knowledgeApi, /export async function reconcileKnowledgeIngestionBatch/);
assert.match(knowledgeApi, /knowledge\.document\.background_mapping_reconciled/);
assert.match(apiBootstrap, /runKnowledgeIngestionReconciler/);
assert.match(apiBootstrap, /setInterval\(\(\) => \{ void runKnowledgeIngestionReconciler\(\); \}, 5_000\)/);

for (const extension of ['pdf', 'doc', 'docx', 'docm', 'xls', 'xlsx', 'xlsm', 'ppt', 'pptx', 'pptm', 'rtf', 'odt', 'ods', 'odp', 'txt', 'md', 'csv', 'json', 'xml', 'html', 'yaml', 'eml', 'epub', 'png', 'jpg', 'tiff']) {
  assert.ok(knowledgeSurface.includes("'" + extension + "'"), 'missing upload extension: ' + extension);
}
assert.match(knowledgeSurface, /原件保存 → 文档解析 → 质量门 → RAG 索引/);
assert.match(knowledgeSurface, /正在解析并标准化文档内容/);
assert.match(knowledgeSurface, /文档解析失败，原件已安全保存/);

console.log('PASS: Knowledge ingestion v2 preserves canonical originals, normalizes governed multi-format files, gates extraction/index quality, and keeps RAGFlow as the retrieval authority.');
