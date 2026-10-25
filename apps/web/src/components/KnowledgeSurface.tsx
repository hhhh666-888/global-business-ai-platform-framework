import { KnowledgeBusinessLinkPicker } from './KnowledgeBusinessLinkPicker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GbapSession } from '../hooks/useGbapSession';
import { KnowledgeDocumentPreview } from './KnowledgeDocumentPreview';
import { KnowledgeRetrievalTest } from './KnowledgeRetrievalTest';
import {
  archiveKnowledgeCollection,
  archiveKnowledgeDocument,
  createKnowledgeCollection,
  downloadKnowledgeSource,
  getKnowledgeCollection,
  getKnowledgeDocument,
  getKnowledgeHealth,
  listKnowledgeCollections,
  listKnowledgeDocuments,
  replaceKnowledgeAcl,
  replaceKnowledgeBusinessLinks,
  refreshKnowledgeDocumentStatus,
  retryKnowledgeCollection,
  retryKnowledgeDocument,
  searchKnowledge,
  updateKnowledgeCollection,
  uploadKnowledgeDocument,
  replaceKnowledgeDocumentVersion,
  type KnowledgeAclEntry,
  type KnowledgeBusinessLink,
  type KnowledgeClassification,
  type KnowledgeCollection,
  type KnowledgeDocument,
  type KnowledgeSearchResult,
  type KnowledgeVisibility,
} from '../lib/knowledgeClient';
import './knowledge-surface.css';

type Props = { session: GbapSession };
type CollectionDraft = { name: string; description: string; classification: KnowledgeClassification; visibility: KnowledgeVisibility };
type LinkType = KnowledgeBusinessLink['businessType'];
type KnowledgeView = 'overview' | 'documents' | 'search' | 'testing' | 'governance';
type DocumentStateFilter = 'ALL' | 'READY' | 'PROCESSING' | 'FAILED';
type DocumentSort = 'UPDATED_DESC' | 'UPDATED_ASC' | 'TITLE_ASC' | 'SIZE_DESC';
type InspectorTab = 'overview' | 'preview' | 'versions' | 'processing' | 'links';

const emptyDraft: CollectionDraft = { name: '', description: '', classification: 'INTERNAL', visibility: 'INTERNAL' };
const linkTypes: Array<{ value: LinkType; label: string }> = [
  { value: 'Account', label: '客户公司' },
  { value: 'Contact', label: '联系人' },
  { value: 'Opportunity', label: '商机' },
  { value: 'Site', label: '站点/工厂' },
  { value: 'Product', label: '产品' },
  { value: 'Project', label: '项目' },
  { value: 'Case', label: '案例' },
  { value: 'Country', label: '国家' },
  { value: 'Market', label: '市场' },
  { value: 'Solution', label: '解决方案' },
];
const supportedExtensions = new Set(['pdf', 'doc', 'docx', 'docm', 'xls', 'xlsx', 'xlsm', 'ppt', 'pptx', 'pptm', 'rtf', 'odt', 'ods', 'odp', 'txt', 'md', 'csv', 'json', 'xml', 'html', 'htm', 'yaml', 'yml', 'log', 'tsv', 'eml', 'epub', 'png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff', 'bmp']);

function formatBytes(bytes?: number | null) {
  if (!bytes || bytes < 1) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function formatDate(value?: string | null, includeTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', includeTime
    ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function formatDuration(startedAt?: string | null, finishedAt?: string | null) {
  if (!startedAt || !finishedAt) return null;
  const start = new Date(startedAt).getTime();
  const finish = new Date(finishedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish < start) return null;
  const seconds = Math.round((finish - start) / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes < 60) return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  const minuteRemainder = minutes % 60;
  return minuteRemainder ? `${hours} 小时 ${minuteRemainder} 分` : `${hours} 小时`;
}
function statusLabel(state: string) {
  const labels: Record<string, string> = {
    READY: '可检索', INDEXING: '索引中', PENDING: '等待处理', FAILED: '处理失败',
    ARCHIVED: '已归档', UNAVAILABLE: '服务不可用', CLEANUP_FAILED: '清理失败', CANCELLED: '已取消',
  };
  return labels[state] ?? state;
}
function visibilityLabel(value: KnowledgeVisibility) {
  return value === 'INTERNAL' ? '企业内部' : value === 'PRIVATE' ? '仅自己' : '受限共享';
}
function classificationLabel(value: KnowledgeClassification) {
  const labels: Record<KnowledgeClassification, string> = {
    PUBLIC: '公开资料', INTERNAL: '内部资料', CONFIDENTIAL: '机密资料', RESTRICTED: '严格受限',
  };
  return labels[value];
}
function isSensitiveClassification(value: KnowledgeClassification) {
  return value === 'CONFIDENTIAL' || value === 'RESTRICTED';
}
function processingDetailLabel(value: string | null) {
  const labels: Record<string, string> = {
    PROVIDER_UNAVAILABLE: '检索服务暂时不可用',
    COLLECTION_SYNC_REQUIRED: '知识库需要重新同步',
    PROVIDER_MAPPING_REQUIRED: '文档需要重新同步',
    EXTRACTION_IN_PROGRESS: '正在解析并标准化文档内容',
    EXTRACTION_FAILED: '文档解析失败，原件已安全保存，可重新处理',
    INDEX_QUALITY_FAILED: '解析结果未达到可检索质量标准',
    PROCESSING_FAILED: '检索处理失败，请重试',
    EXTRACTION_QUEUED: '文档已保存，正在等待解析',
    EXTRACTOR_UNAVAILABLE: '文档解析服务暂不可用，原件已保留',
    EMBEDDING_UNAVAILABLE: '检索服务暂不可用，原件已保留',
    STATUS_CHECK_RETRY: '暂时无法读取处理进度，后台正在重试',
    STATUS_CHECK_FAILED: '多次读取处理进度失败，请检查服务后重新处理',
    PROCESSING_TIMEOUT: '处理超过时限，原件已保留，请检查服务后重新处理',
    PDF_QUALITY_FALLBACK: '正在使用备用 PDF 解析流程',
    FILE_SIZE_REJECTED: '处理服务拒绝了文件大小，请检查服务配置',
    PROCESSING_AUTH_FAILED: '处理服务认证失败，请联系管理员检查连接',
    PROCESSING_RESOURCE_LIMIT: '文件解析超出资源限制，原件已保留；请拆分文件，或联系管理员调整处理资源',
    PROCESSING_SERVICE_TIMEOUT: '处理服务响应超时，请检查服务运行状态',
  };
  return value ? (labels[value] ?? '检索处理失败，请重试') : '无异常说明';
}
function scoreLabel(score: number | null) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return '';
  return ` · 相关度 ${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`;
}
function fileExtension(document: KnowledgeDocument) {
  return (document.sourceFilename?.split('.').pop() || document.currentVersion?.mediaType?.split('/').pop() || 'DOC').toLowerCase();
}
function fileMark(document: KnowledgeDocument) {
  return fileExtension(document).slice(0, 4).toUpperCase();
}
function titleFromFile(file: File) {
  return file.name.replace(/\.[^.]+$/u, '') || file.name;
}
function isProcessing(document: KnowledgeDocument) {
  return document.ingestionState === 'INDEXING' || document.ingestionState === 'PENDING';
}
function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('file_read_failed'));
    reader.onload = () => {
      const value = String(reader.result ?? '');
      const comma = value.indexOf(',');
      if (comma < 0) reject(new Error('file_encoding_failed'));
      else resolve(value.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}
function messageFrom(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('knowledge_duplicate_document:')) return '相同内容已经存在于当前知识库，请不要重复上传。';
  if (message === 'knowledge_collection_not_empty') return '请先归档此知识库中的全部文档，再归档知识库。';
  if (message === 'knowledge_provider_unavailable') return '知识检索服务当前不可用，原始资料已安全保存，请稍后重试同步。';
  if (message === 'knowledge_provider_operation_failed') return '知识处理服务未能完成操作，原件已保留。请打开文件的“处理记录”查看状态。';
  if (message === 'knowledge_extractor_unavailable') return '文档解析服务暂不可用，原件已保留，请稍后重新处理。';
  if (message === 'knowledge_collection_provider_mapping_missing') return '知识库尚未同步到检索服务，请在“权限与治理”中重新同步知识库。';
  if (message === 'knowledge_source_file_missing' || message === 'knowledge_source_checksum_mismatch') return '原件缺失或完整性校验失败，请检查备份与存储。';
  if (message === 'knowledge_sensitive_visibility_requires_restricted') return '机密或严格受限资料不能设置为“企业内部”全员可见，请改为“仅自己”或“受限共享”。';
  if (message === 'forbidden') return '当前账户没有执行此操作的权限。';
  return fallback;
}

export function KnowledgeSurface({ session }: Props) {
  const [collections, setCollections] = useState<KnowledgeCollection[]>([]);
  const [allDocuments, setAllDocuments] = useState<KnowledgeDocument[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collectionDetail, setCollectionDetail] = useState<Awaited<ReturnType<typeof getKnowledgeCollection>> | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [documentDetail, setDocumentDetail] = useState<Awaited<ReturnType<typeof getKnowledgeDocument>> | null>(null);
  const [health, setHealth] = useState<'checking' | 'ready' | 'unavailable'>('checking');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<KnowledgeView>('overview');

  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<CollectionDraft>(emptyDraft);
  const [settingsDraft, setSettingsDraft] = useState<CollectionDraft>(emptyDraft);
  const [aclEntries, setAclEntries] = useState<KnowledgeAclEntry[]>([]);
  const [aclType, setAclType] = useState<'ROLE' | 'SUBJECT'>('ROLE');
  const [aclPrincipal, setAclPrincipal] = useState('substrate-manager');

  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchScope, setSearchScope] = useState<'CURRENT' | 'ALL'>('ALL');
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>([]);

  const [collectionSearch, setCollectionSearch] = useState('');
  const [documentSearch, setDocumentSearch] = useState('');
  const [documentState, setDocumentState] = useState<DocumentStateFilter>('ALL');
  const [documentType, setDocumentType] = useState('ALL');
  const [documentSort, setDocumentSort] = useState<DocumentSort>('UPDATED_DESC');
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('overview');
  const revisionFileRef = useRef<HTMLInputElement>(null);

  const [linkType, setLinkType] = useState<LinkType>('Account');
  const [linkBusinessId, setLinkBusinessId] = useState('');

  const selectedCollection = useMemo(() => collections.find((item) => item.id === selectedId) ?? null, [collections, selectedId]);
  const canManageSelected = Boolean(collectionDetail?.collection.canManage);
  const isSuperAdmin = session.status === 'authenticated' && Boolean(session.identity?.roles.includes('substrate-admin'));
  const isManager = session.status === 'authenticated' && Boolean(session.identity?.roles.includes('substrate-manager'));
  const canCreateCollection = isManager || isSuperAdmin;
  const scopeDocuments = selectedId ? documents : allDocuments;

  const clearMessages = () => { setError(null); setSuccess(null); };

  const refreshHealth = useCallback(async () => {
    try {
      const value = await getKnowledgeHealth();
      setHealth(value.state === 'READY' ? 'ready' : 'unavailable');
    } catch {
      setHealth('unavailable');
    }
  }, []);

  const refreshCollections = useCallback(async (preferredId?: string | null) => {
    const rows = await listKnowledgeCollections();
    setCollections(rows);
    if (preferredId !== undefined) {
      setSelectedId(preferredId && rows.some((item) => item.id === preferredId) ? preferredId : null);
    } else {
      setSelectedId((current) => current && rows.some((item) => item.id === current) ? current : null);
    }
    return rows;
  }, []);

  const refreshAllDocuments = useCallback(async () => {
    const rows = await listKnowledgeDocuments();
    setAllDocuments(rows);
    return rows;
  }, []);

  const refreshSelected = useCallback(async (collectionId: string) => {
    const [detail, docs] = await Promise.all([getKnowledgeCollection(collectionId), listKnowledgeDocuments(collectionId)]);
    setCollectionDetail(detail);
    setDocuments(docs);
    setSettingsDraft({
      name: detail.collection.name,
      description: detail.collection.description ?? '',
      classification: detail.collection.classification,
      visibility: detail.collection.visibility,
    });
    setAclEntries(detail.acl);
    setSelectedDocumentId((current) => current && docs.some((item) => item.id === current) ? current : null);
  }, []);

  const refreshKnowledge = useCallback(async () => {
    if (session.status !== 'authenticated') return;
    setLoading(true);
    clearMessages();
    try {
      await Promise.all([refreshCollections(), refreshAllDocuments(), refreshHealth()]);
      if (selectedId) await refreshSelected(selectedId);
    } catch (caught) {
      setError(messageFrom(caught, '企业知识库加载失败，请刷新后重试。'));
    } finally {
      setLoading(false);
    }
  }, [session.status, selectedId, refreshCollections, refreshAllDocuments, refreshHealth, refreshSelected]);

  useEffect(() => {
    if (session.status !== 'authenticated') return;
    setLoading(true);
    clearMessages();
    void Promise.all([refreshCollections(), refreshAllDocuments(), refreshHealth()])
      .catch((caught) => setError(messageFrom(caught, '企业知识库加载失败，请刷新后重试。')))
      .finally(() => setLoading(false));
  }, [session.status, refreshCollections, refreshAllDocuments, refreshHealth]);

  useEffect(() => {
    if (!selectedId || session.status !== 'authenticated') {
      setCollectionDetail(null);
      setDocuments([]);
      setSelectedDocumentIds([]);
      return;
    }
    void refreshSelected(selectedId).catch((caught) => setError(messageFrom(caught, '知识库内容加载失败。')));
  }, [selectedId, session.status, refreshSelected]);

  const selectedDocumentRevision = allDocuments.find(item => item.id === selectedDocumentId)?.updatedAt;
  useEffect(() => { setInspectorTab('overview'); }, [selectedDocumentId]);
  useEffect(() => {
    if (!selectedDocumentId) {
      setDocumentDetail(null);
      return;
    }
    let cancelled = false;
    setDocumentDetail(current => current?.document.id === selectedDocumentId ? current : null);
    void getKnowledgeDocument(selectedDocumentId)
      .then((detail) => { if (!cancelled) setDocumentDetail(detail); })
      .catch(() => { if (!cancelled) setDocumentDetail(null); });
    return () => { cancelled = true; };
  }, [selectedDocumentId, selectedDocumentRevision]);

  useEffect(() => {
    if (!showCreate) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowCreate(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [showCreate]);

  useEffect(() => {
    const processing = scopeDocuments.filter(isProcessing);
    if (!processing.length) return;
    const timer = window.setInterval(() => {
      void Promise.all(processing.map((item) => refreshKnowledgeDocumentStatus(item.id).catch(() => null)))
        .then(async () => {
          await refreshAllDocuments();
          if (selectedId) await refreshSelected(selectedId);
        })
        .catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, [scopeDocuments, selectedId, refreshAllDocuments, refreshSelected]);

  const collectionCounts = useMemo(() => {
    const counts = new Map<string, { total: number; ready: number; failed: number }>();
    for (const document of allDocuments) {
      const current = counts.get(document.collectionId) ?? { total: 0, ready: 0, failed: 0 };
      current.total += 1;
      if (document.ingestionState === 'READY') current.ready += 1;
      if (document.ingestionState === 'FAILED') current.failed += 1;
      counts.set(document.collectionId, current);
    }
    return counts;
  }, [allDocuments]);

  const filteredCollections = useMemo(() => {
    const needle = collectionSearch.trim().toLowerCase();
    if (!needle) return collections;
    return collections.filter((item) => `${item.name} ${item.description ?? ''}`.toLowerCase().includes(needle));
  }, [collections, collectionSearch]);

  const documentTypes = useMemo(() => Array.from(new Set(scopeDocuments.map(fileExtension))).sort(), [scopeDocuments]);

  const visibleDocuments = useMemo(() => {
    const needle = documentSearch.trim().toLowerCase();
    const rows = scopeDocuments.filter((document) => {
      if (needle && !`${document.title} ${document.sourceFilename ?? ''}`.toLowerCase().includes(needle)) return false;
      if (documentState === 'READY' && document.ingestionState !== 'READY') return false;
      if (documentState === 'PROCESSING' && !isProcessing(document)) return false;
      if (documentState === 'FAILED' && document.ingestionState !== 'FAILED') return false;
      if (documentType !== 'ALL' && fileExtension(document) !== documentType) return false;
      return true;
    });
    rows.sort((a, b) => {
      if (documentSort === 'UPDATED_ASC') return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      if (documentSort === 'TITLE_ASC') return a.title.localeCompare(b.title, 'zh-CN');
      if (documentSort === 'SIZE_DESC') return (b.currentVersion?.byteSize ?? 0) - (a.currentVersion?.byteSize ?? 0);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    return rows;
  }, [scopeDocuments, documentSearch, documentState, documentType, documentSort]);

  const overviewReadyCount = scopeDocuments.filter((item) => item.ingestionState === 'READY').length;
  const overviewProcessingCount = scopeDocuments.filter(isProcessing).length;
  const overviewFailedCount = scopeDocuments.filter((item) => item.ingestionState === 'FAILED').length;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const updatedLast7Days = scopeDocuments.filter((item) => new Date(item.updatedAt).getTime() >= sevenDaysAgo).length;
  const recentDocuments = [...scopeDocuments].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 6);

  if (session.status !== 'authenticated') {
    return (
      <section className="knowledge-gate">
        <div className="knowledge-gate-card">
          <span className="knowledge-brand-mark">K</span>
          <h2>登录后使用企业知识库</h2>
          <p>企业资料、产品文档、方案、案例和市场知识统一由 GBAP 权限体系管理。</p>
          <button className="knowledge-primary" type="button" onClick={() => void session.login('knowledge')}>企业登录</button>
        </div>
      </section>
    );
  }

  const selectCollection = (collectionId: string | null) => {
    setSelectedId(collectionId);
    setSelectedDocumentId(null);
    setSelectedDocumentIds([]);
    setSearchResults([]);
    if (!collectionId) {
      setSearchScope('ALL');
      if (activeView === 'governance') setActiveView('overview');
      return;
    }
    if (activeView === 'overview' || activeView === 'governance') setActiveView('documents');
  };

  const createCollection = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) return;
    setBusy('create-collection');
    clearMessages();
    try {
      const result = await createKnowledgeCollection({ ...draft, name: draft.name.trim(), description: draft.description.trim() || null });
      await Promise.all([refreshCollections(result.collection.id), refreshAllDocuments()]);
      setDraft(emptyDraft);
      setShowCreate(false);
      setActiveView('documents');
      setSuccess(result.providerError ? '知识库已保存，但暂时无法检索；可稍后点击“重试同步”。' : '知识库已创建。');
      await refreshHealth();
    } catch (caught) {
      setError(messageFrom(caught, '知识库创建失败。'));
    } finally {
      setBusy(null);
    }
  };

  const saveCollection = async () => {
    if (!selectedId || !settingsDraft.name.trim()) return;
    setBusy('save-collection');
    clearMessages();
    try {
      const result = await updateKnowledgeCollection(selectedId, {
        ...settingsDraft,
        name: settingsDraft.name.trim(),
        description: settingsDraft.description.trim() || null,
      });
      await Promise.all([refreshCollections(selectedId), refreshSelected(selectedId)]);
      setSuccess(result.providerError ? '知识库设置已保存，但检索内容同步失败，可稍后重试。' : '知识库设置已保存。');
    } catch (caught) {
      setError(messageFrom(caught, '知识库设置保存失败。'));
    } finally {
      setBusy(null);
    }
  };

  const retryCollection = async () => {
    if (!selectedId) return;
    setBusy('retry-collection');
    clearMessages();
    try {
      await retryKnowledgeCollection(selectedId);
      await Promise.all([refreshCollections(selectedId), refreshSelected(selectedId), refreshAllDocuments(), refreshHealth()]);
      setSuccess('知识库已重新同步到检索服务。');
    } catch (caught) {
      setError(messageFrom(caught, '知识库同步重试失败。'));
    } finally {
      setBusy(null);
    }
  };

  const archiveCollection = async () => {
    if (!selectedId || !selectedCollection || !window.confirm(`确认归档“${selectedCollection.name}”？归档前必须先归档其中全部文档。`)) return;
    setBusy('archive-collection');
    clearMessages();
    try {
      await archiveKnowledgeCollection(selectedId);
      setSelectedDocumentId(null);
      await Promise.all([refreshCollections(null), refreshAllDocuments()]);
      setActiveView('overview');
      setSuccess('知识库已归档。');
    } catch (caught) {
      setError(messageFrom(caught, '知识库归档失败。'));
    } finally {
      setBusy(null);
    }
  };

  const addAcl = () => {
    const principalId = aclPrincipal.trim();
    if (!principalId) return;
    if (aclEntries.some((entry) => entry.principalType === aclType && entry.principalId === principalId)) return;
    setAclEntries((current) => [...current, { principalType: aclType, principalId, permission: 'READ' }]);
    setAclPrincipal(aclType === 'ROLE' ? 'substrate-manager' : '');
  };

  const saveAcl = async () => {
    if (!selectedId) return;
    setBusy('save-acl');
    clearMessages();
    try {
      const result = await replaceKnowledgeAcl(selectedId, aclEntries);
      setAclEntries(result.entries);
      setSuccess('访问权限已保存。');
    } catch (caught) {
      setError(messageFrom(caught, '访问权限保存失败。'));
    } finally {
      setBusy(null);
    }
  };

  const addUploadFiles = (files: File[]) => {
    clearMessages();
    const rejectedType: string[] = [];
    const rejectedSize: string[] = [];
    const accepted: File[] = [];
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!supportedExtensions.has(ext)) {
        rejectedType.push(file.name);
        continue;
      }
      if (file.size > 25 * 1024 * 1024) {
        rejectedSize.push(file.name);
        continue;
      }
      accepted.push(file);
    }
    const keyed = new Map(uploadFiles.map((file) => [`${file.name}:${file.size}:${file.lastModified}`, file]));
    accepted.forEach((file) => keyed.set(`${file.name}:${file.size}:${file.lastModified}`, file));
    const combined = Array.from(keyed.values());
    const overflow = Math.max(0, combined.length - 20);
    setUploadFiles(combined.slice(0, 20));
    const reasons: string[] = [];
    if (rejectedType.length) reasons.push(`${rejectedType.length} 份格式暂不支持`);
    if (rejectedSize.length) reasons.push(`${rejectedSize.length} 份超过 25 MB`);
    if (overflow) reasons.push(`${overflow} 份超过单批 20 份上限`);
    if (reasons.length) setError(`部分文件未加入待上传队列：${reasons.join('，')}。`);
  };

  const uploadRevision = async (file: File) => {
    const document = documentDetail?.document;
    if (!document?.currentVersionId || !documentDetail?.canManage) return;
    if (!file.size || file.size > 25 * 1024 * 1024) { setError('请选择非空文件，单文件不能超过 25 MB。'); return; }
    setBusy('revision'); setError(null); setSuccess(null);
    try {
      const result = await replaceKnowledgeDocumentVersion(document.id, { expectedVersionId: document.currentVersionId, sourceFilename: file.name, mediaType: file.type || 'application/octet-stream', contentBase64: await fileToBase64(file) });
      setDocumentDetail(await getKnowledgeDocument(document.id));
      await refreshKnowledge();
      setSuccess(result.providerError ? '新版本原件已保存，索引暂未完成，请查看处理记录后重试。' : '新版本已保存，历史原件和业务关联保留。');
    } catch (cause) { setError(messageFrom(cause, '更新失败，请刷新文档并检查是否已有其他人在更新。')); }
    finally { setBusy(null); }
  };
  const downloadVersion = async (version: NonNullable<typeof documentDetail>['versions'][number]) => {
    if (!documentDetail) return;
    try {
      const blob = await downloadKnowledgeSource(documentDetail.document.id, version.id);
      const href = URL.createObjectURL(blob); const anchor = window.document.createElement('a');
      anchor.href = href; anchor.download = version.sourceFilename || `文档-v${version.version}`;
      anchor.click(); setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch { setError('历史原件读取失败，请稍后重试。'); }
  };

  const uploadBatch = async () => {
    if (!selectedId || !uploadFiles.length) return;
    setBusy('upload');
    clearMessages();
    let indexedOrProcessing = 0;
    let canonicalOnly = 0;
    let requestFailed = 0;
    for (const file of uploadFiles) {
      try {
        const contentBase64 = await fileToBase64(file);
        const result = await uploadKnowledgeDocument({
          collectionId: selectedId,
          title: titleFromFile(file),
          sourceFilename: file.name,
          mediaType: file.type || 'application/octet-stream',
          contentBase64,
        });
        if (result.providerError) canonicalOnly += 1;
        else indexedOrProcessing += 1;
      } catch {
        requestFailed += 1;
      }
    }
    await Promise.all([refreshSelected(selectedId), refreshAllDocuments(), refreshHealth()]);
    setUploadFiles([]);
    if (fileRef.current) fileRef.current.value = '';
    setBusy(null);
    if (canonicalOnly || requestFailed) {
      setError(`批量上传完成：${indexedOrProcessing} 份已进入检索流程，${canonicalOnly} 份原件已安全保存但暂不可检索，${requestFailed} 份上传失败。可在“处理失败”中重新处理。`);
    } else {
      setSuccess(`已提交 ${indexedOrProcessing} 份文档进入知识处理流程。`);
    }
  };

  const refreshDocument = async (document: KnowledgeDocument) => {
    setBusy(`status-${document.id}`);
    clearMessages();
    try {
      await refreshKnowledgeDocumentStatus(document.id);
      await refreshAllDocuments();
      if (selectedId) await refreshSelected(selectedId);
    } catch (caught) {
      setError(messageFrom(caught, '状态刷新失败。'));
    } finally {
      setBusy(null);
    }
  };

  const retryDocument = async (document: KnowledgeDocument) => {
    if (isProcessing(document) && !window.confirm('当前文档仍显示处理中。重新处理会停止当前检索任务，并从已安全保存的原件重新提交。是否继续？')) return;
    setBusy(`retry-${document.id}`);
    clearMessages();
    try {
      await retryKnowledgeDocument(document.id);
      await refreshAllDocuments();
      if (selectedId) await refreshSelected(selectedId);
      setSuccess('已重新提交处理。');
    } catch (caught) {
      setError(messageFrom(caught, '文档重试失败。'));
      // A failed provider call may still have recorded a new failed attempt.
      // Refresh the inspector's canonical revision without hiding the failure.
      await refreshAllDocuments().catch(() => {});
    } finally {
      setBusy(null);
    }
  };

  const removeDocument = async (document: KnowledgeDocument, confirm = true, reportError = true) => {
    if (confirm && !window.confirm(`确认归档“${document.title}”？归档后原始文件仍会保留。`)) return false;
    try {
      await archiveKnowledgeDocument(document.id);
      if (selectedDocumentId === document.id) setSelectedDocumentId(null);
      return true;
    } catch (caught) {
      if (reportError) setError(messageFrom(caught, '文档归档未完全完成，请稍后重试；系统不会把失败操作显示为成功。'));
      return false;
    }
  };

  const archiveSelectedDocuments = async () => {
    const rows = scopeDocuments.filter((item) => selectedDocumentIds.includes(item.id));
    if (!rows.length || !window.confirm(`确认归档选中的 ${rows.length} 份文档？`)) return;
    setBusy('bulk-archive');
    clearMessages();
    let archived = 0;
    for (const document of rows) {
      if (await removeDocument(document, false, false)) archived += 1;
    }
    await refreshAllDocuments();
    if (selectedId) await refreshSelected(selectedId);
    setSelectedDocumentIds([]);
    setBusy(null);
    if (archived === rows.length) setSuccess(`已归档 ${archived} 份文档。`);
    else setError(`批量归档完成：成功 ${archived} 份，失败 ${rows.length - archived} 份。`);
  };

  const retrySelectedDocuments = async () => {
    const rows = scopeDocuments.filter((item) => selectedDocumentIds.includes(item.id) && item.ingestionState === 'FAILED');
    if (!rows.length) {
      setError('所选文档中没有“处理失败”的项目。');
      return;
    }
    setBusy('bulk-retry');
    clearMessages();
    let retried = 0;
    let failed = 0;
    for (const document of rows) {
      try {
        await retryKnowledgeDocument(document.id);
        retried += 1;
      } catch {
        failed += 1;
      }
    }
    await refreshAllDocuments();
    if (selectedId) await refreshSelected(selectedId);
    setBusy(null);
    if (failed) setError(`批量重试完成：${retried} 份已重新提交，${failed} 份仍未提交成功。`);
    else setSuccess(`已重新提交 ${retried} 份失败文档。`);
  };

  const downloadSource = async (document: KnowledgeDocument) => {
    setBusy(`download-${document.id}`);
    clearMessages();
    try {
      const blob = await downloadKnowledgeSource(document.id);
      const href = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = href;
      link.download = document.sourceFilename || `${document.title}.bin`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (caught) {
      setError(messageFrom(caught, '原始文件下载失败。'));
    } finally {
      setBusy(null);
    }
  };

  const runSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    clearMessages();
    try {
      const result = await searchKnowledge({
        query: query.trim(),
        collectionIds: searchScope === 'CURRENT' && selectedId ? [selectedId] : undefined,
        topK: 20,
      });
      setSearchResults(result.results);
      if (!result.results.length) setSuccess('没有检索到相关内容，可尝试更换关键词或扩大知识范围。');
    } catch (caught) {
      setError(messageFrom(caught, '知识检索失败。'));
    } finally {
      setSearching(false);
    }
  };

  const openSearchResult = (result: KnowledgeSearchResult) => {
    setSelectedId(result.collectionId);
    setSelectedDocumentId(result.knowledgeDocumentId);
    setActiveView('documents');
  };

  const addBusinessLink = async () => {
    if (!documentDetail || !linkBusinessId.trim()) return;
    const next: KnowledgeBusinessLink[] = [
      ...documentDetail.links.filter((item) => item.businessType !== linkType || item.businessId !== linkBusinessId.trim()),
      { businessType: linkType, businessId: linkBusinessId.trim() },
    ];
    setBusy('save-links');
    clearMessages();
    try {
      const result = await replaceKnowledgeBusinessLinks(documentDetail.document.id, next);
      setDocumentDetail({ ...documentDetail, links: result.links });
      setLinkBusinessId('');
      setSuccess('业务关联已保存。');
    } catch (caught) {
      setError(messageFrom(caught, '业务关联保存失败。'));
    } finally {
      setBusy(null);
    }
  };

  const removeBusinessLink = async (index: number) => {
    if (!documentDetail) return;
    const next = documentDetail.links.filter((_, itemIndex) => itemIndex !== index);
    setBusy('save-links');
    clearMessages();
    try {
      const result = await replaceKnowledgeBusinessLinks(documentDetail.document.id, next);
      setDocumentDetail({ ...documentDetail, links: result.links });
    } catch (caught) {
      setError(messageFrom(caught, '业务关联保存失败。'));
    } finally {
      setBusy(null);
    }
  };

  const allVisibleSelected = visibleDocuments.length > 0 && visibleDocuments.every((item) => selectedDocumentIds.includes(item.id));

  return (
    <section className="knowledge-shell" data-testid="knowledge-surface">
      <header className="knowledge-hero">
        <div className="knowledge-hero-copy">
          <span className="knowledge-brand-mark">K</span>
          <div>
            <div className="knowledge-eyebrow">GBAP KNOWLEDGE</div>
            <h1>企业知识库</h1>
            <p>统一沉淀企业资料、产品文档、项目方案、市场研究与业务知识。</p>
          </div>
        </div>
        <div className="knowledge-hero-actions">
          <span className={`knowledge-service-pill ${health}`}><i />{health === 'ready' ? '检索服务正常' : health === 'checking' ? '正在检查服务' : '检索服务异常'}</span>
          <button type="button" className="knowledge-ghost" onClick={() => void refreshKnowledge()} disabled={loading}>刷新</button>
          {canCreateCollection && <button type="button" className="knowledge-primary" onClick={() => setShowCreate(true)}>+ 新建知识库</button>}
        </div>
      </header>

      {(error || success) && (
        <div className={error ? 'knowledge-alert error' : 'knowledge-alert success'} role={error ? 'alert' : 'status'}>
          <span aria-hidden="true">{error ? '!' : '✓'}</span><div>{error ?? success}</div><button type="button" aria-label="关闭提示" onClick={clearMessages}>×</button>
        </div>
      )}

      {showCreate && canCreateCollection && (
        <div className="knowledge-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="knowledge-create-title" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowCreate(false); }}>
          <form className="knowledge-modal" onSubmit={createCollection}>
            <div className="knowledge-modal-head"><div><span>新建知识空间</span><h2 id="knowledge-create-title">创建知识库</h2><p>按产品、部门、市场、项目或案例建立清晰的知识边界。</p></div><button type="button" className="knowledge-icon-button" aria-label="关闭创建知识库窗口" onClick={() => setShowCreate(false)}>×</button></div>
            <div className="knowledge-form-grid">
              <label className="wide">名称<input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="例如：光伏与储能产品知识" /></label>
              <label>资料等级<select value={draft.classification} onChange={(e) => { const classification = e.target.value as KnowledgeClassification; setDraft({ ...draft, classification, visibility: isSensitiveClassification(classification) && draft.visibility === 'INTERNAL' ? 'RESTRICTED' : draft.visibility }); }}><option value="INTERNAL">内部资料</option><option value="CONFIDENTIAL">机密资料</option><option value="RESTRICTED">严格受限</option><option value="PUBLIC">公开资料</option></select></label>
              <label>可见范围<select value={draft.visibility} onChange={(e) => setDraft({ ...draft, visibility: e.target.value as KnowledgeVisibility })}><option value="INTERNAL" disabled={isSensitiveClassification(draft.classification)}>企业内部</option><option value="PRIVATE">仅自己</option><option value="RESTRICTED">受限共享</option></select></label>
              <label className="wide">说明<textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="说明这个知识库应该存放什么内容，方便员工理解边界" /></label>
            </div>
            <div className="knowledge-modal-actions"><button type="button" className="knowledge-ghost" onClick={() => setShowCreate(false)}>取消</button><button className="knowledge-primary" disabled={busy === 'create-collection' || !draft.name.trim()} type="submit">{busy === 'create-collection' ? '创建中…' : '创建知识库'}</button></div>
          </form>
        </div>
      )}

      <div className="knowledge-workspace">
        <aside className="knowledge-sidebar">
          <div className="knowledge-sidebar-title"><div><strong>知识空间</strong><span>{collections.length} 个可访问知识库</span></div></div>
          <div className="knowledge-sidebar-search"><span aria-hidden="true">⌕</span><input aria-label="查找知识库" value={collectionSearch} onChange={(e) => setCollectionSearch(e.target.value)} placeholder="查找知识库" /></div>
          <button type="button" className={`knowledge-space-item all ${selectedId === null ? 'active' : ''}`} onClick={() => selectCollection(null)}><span className="knowledge-space-icon">全</span><span className="knowledge-space-copy"><strong>全部知识</strong><small>{allDocuments.length} 份文档</small></span><span className="knowledge-space-arrow">›</span></button>
          <div className="knowledge-space-list">
            {loading && <div className="knowledge-sidebar-loading">正在加载知识空间…</div>}
            {!loading && !filteredCollections.length && <div className="knowledge-sidebar-loading">没有匹配的知识库</div>}
            {filteredCollections.map((collection) => {
              const counts = collectionCounts.get(collection.id) ?? { total: 0, ready: 0, failed: 0 };
              return <button key={collection.id} type="button" className={`knowledge-space-item ${selectedId === collection.id ? 'active' : ''}`} onClick={() => selectCollection(collection.id)}><span className="knowledge-space-icon">{collection.name.trim().slice(0, 1).toUpperCase() || 'K'}</span><span className="knowledge-space-copy"><strong>{collection.name}</strong><small>{counts.total} 份 · {visibilityLabel(collection.visibility)}</small></span>{counts.failed > 0 ? <span className="knowledge-space-warning">{counts.failed}</span> : <span className="knowledge-space-arrow">›</span>}</button>;
            })}
          </div>
          <div className="knowledge-sidebar-footer"><div className={`knowledge-mini-health ${health}`}><i /><span>企业知识服务</span><strong>{health === 'ready' ? '运行正常' : health === 'checking' ? '检查中' : '需检查'}</strong></div><small>企业资料按权限安全管理。</small></div>
        </aside>

        <main className="knowledge-content">
          <div className="knowledge-context-bar">
            <div className="knowledge-context-title"><span>{selectedCollection ? '知识库' : '知识中心'}</span><h2>{selectedCollection?.name ?? '全部知识'}</h2><p>{selectedCollection?.description || (selectedCollection ? '暂无知识库说明' : '跨知识库浏览、检索和管理你有权限访问的企业知识。')}</p></div>
            {selectedCollection && <div className="knowledge-context-meta"><span>{classificationLabel(selectedCollection.classification)}</span><span>{visibilityLabel(selectedCollection.visibility)}</span><em className={`knowledge-state ${selectedCollection.providerState.toLowerCase()}`}>{statusLabel(selectedCollection.providerState)}</em></div>}
          </div>

          <nav className="knowledge-tabs" aria-label="企业知识库功能">
            <button type="button" className={activeView === 'overview' ? 'active' : ''} onClick={() => setActiveView('overview')}>概览</button>
            <button type="button" className={activeView === 'documents' ? 'active' : ''} onClick={() => setActiveView('documents')}>文档中心<span>{scopeDocuments.length}</span></button>
            <button type="button" className={activeView === 'search' ? 'active' : ''} onClick={() => setActiveView('search')}>知识检索</button>
            {canCreateCollection && <button type="button" className={activeView === 'testing' ? 'active' : ''} onClick={() => setActiveView('testing')}>检索测试</button>}
            {selectedCollection && canManageSelected && <button type="button" className={activeView === 'governance' ? 'active' : ''} onClick={() => setActiveView('governance')}>权限与治理</button>}
          </nav>

          {activeView === 'overview' && (
            <div className="knowledge-view knowledge-overview">
              <div className="knowledge-kpis">
                <article><span className="knowledge-kpi-icon">{selectedCollection ? '文' : '库'}</span><div><small>{selectedCollection ? '文档总数' : '可访问知识库'}</small><strong>{selectedCollection ? scopeDocuments.length : collections.length}</strong><em>{selectedCollection ? selectedCollection.name : '知识空间'}</em></div></article>
                <article><span className="knowledge-kpi-icon">检</span><div><small>可检索文档</small><strong>{overviewReadyCount}</strong><em>当前范围共 {scopeDocuments.length} 份资料</em></div></article>
                <article><span className="knowledge-kpi-icon">新</span><div><small>最近 7 天活动</small><strong>{updatedLast7Days}</strong><em>含上传、处理与同步状态变化</em></div></article>
                <article className={overviewFailedCount ? 'attention' : ''}><span className="knowledge-kpi-icon">态</span><div><small>处理中 / 异常</small><strong>{overviewProcessingCount} / {overviewFailedCount}</strong><em>{overviewFailedCount ? '当前范围有文档需要处理' : '当前范围处理状态正常'}</em></div></article>
              </div>
              <div className="knowledge-dashboard-grid">
                {!selectedCollection ? <section className="knowledge-card knowledge-space-card"><div className="knowledge-card-head"><div><h3>知识空间</h3><p>按业务主题组织企业知识</p></div>{canCreateCollection && <button type="button" onClick={() => setShowCreate(true)}>新建</button>}</div><div className="knowledge-space-cards">{collections.slice(0, 6).map((collection) => { const counts = collectionCounts.get(collection.id) ?? { total: 0, ready: 0, failed: 0 }; return <button type="button" key={collection.id} onClick={() => { selectCollection(collection.id); setActiveView('documents'); }}><span className="knowledge-space-card-icon">{collection.name.trim().slice(0, 1).toUpperCase() || 'K'}</span><strong>{collection.name}</strong><small>{counts.total} 份文档 · {counts.ready} 份可检索</small><em>{classificationLabel(collection.classification)}</em></button>; })}{!collections.length && <div className="knowledge-empty compact"><strong>还没有知识库</strong><span>{canCreateCollection ? '先建立一个知识空间，再上传企业资料。' : '当前还没有你可以访问的知识空间。'}</span></div>}</div></section> : <section className="knowledge-card"><div className="knowledge-card-head"><div><h3>当前知识库</h3><p>当前页面统计仅针对“{selectedCollection.name}”。</p></div></div><div className="knowledge-governance-stats"><div><span>资料等级</span><strong>{classificationLabel(selectedCollection.classification)}</strong></div><div><span>可见范围</span><strong>{visibilityLabel(selectedCollection.visibility)}</strong></div><div><span>文档总数</span><strong>{scopeDocuments.length}</strong></div><div><span>检索状态</span><strong>{statusLabel(selectedCollection.providerState)}</strong></div></div></section>}
                <section className="knowledge-card knowledge-status-card"><div className="knowledge-card-head"><div><h3>处理状态</h3><p>掌握当前范围的文档入库与检索状态</p></div></div><div className="knowledge-status-stack"><div><span><i className="ready" />可检索</span><strong>{overviewReadyCount}</strong></div><div><span><i className="processing" />处理中</span><strong>{overviewProcessingCount}</strong></div><div><span><i className="failed" />处理失败</span><strong>{overviewFailedCount}</strong></div></div><button type="button" className="knowledge-secondary-wide" onClick={() => { setDocumentState(overviewFailedCount ? 'FAILED' : 'ALL'); setActiveView('documents'); }}>查看文档状态</button></section>
              </div>
              <section className="knowledge-card"><div className="knowledge-card-head"><div><h3>最近更新</h3><p>最近发生变化的企业知识资料</p></div><button type="button" onClick={() => setActiveView('documents')}>查看全部</button></div><div className="knowledge-recent-list">{recentDocuments.map((document) => { const collection = collections.find((item) => item.id === document.collectionId); return <button type="button" key={document.id} onClick={() => { setSelectedId(document.collectionId); setSelectedDocumentId(document.id); setActiveView('documents'); }}><span className="knowledge-file-mark">{fileMark(document)}</span><span><strong>{document.title}</strong><small>{collection?.name ?? '知识库'} · {formatBytes(document.currentVersion?.byteSize)}</small></span><em className={`knowledge-state ${document.ingestionState.toLowerCase()}`}>{statusLabel(document.ingestionState)}</em><time>{formatDate(document.updatedAt)}</time></button>; })}{!recentDocuments.length && <div className="knowledge-empty compact">暂无文档更新。</div>}</div></section>
            </div>
          )}

          {activeView === 'documents' && (
            <div className="knowledge-view">
              <div className="knowledge-toolbar"><div className="knowledge-filter-search"><span aria-hidden="true">⌕</span><input aria-label="搜索文档标题或文件名" value={documentSearch} onChange={(e) => setDocumentSearch(e.target.value)} placeholder="搜索文档标题或文件名" /></div><select aria-label="按处理状态筛选" value={documentState} onChange={(e) => setDocumentState(e.target.value as DocumentStateFilter)}><option value="ALL">全部状态</option><option value="READY">可检索</option><option value="PROCESSING">处理中</option><option value="FAILED">处理失败</option></select><select aria-label="按文件格式筛选" value={documentType} onChange={(e) => setDocumentType(e.target.value)}><option value="ALL">全部格式</option>{documentTypes.map((type) => <option key={type} value={type}>{type.toUpperCase()}</option>)}</select><select aria-label="文档排序" value={documentSort} onChange={(e) => setDocumentSort(e.target.value as DocumentSort)}><option value="UPDATED_DESC">最近更新</option><option value="UPDATED_ASC">最早更新</option><option value="TITLE_ASC">标题 A-Z</option><option value="SIZE_DESC">文件大小</option></select>{selectedCollection && canManageSelected && <button type="button" className="knowledge-primary" onClick={() => fileRef.current?.click()}>+ 上传文档</button>}</div>

              {selectedCollection && canManageSelected && <><input ref={fileRef} className="knowledge-hidden-file" aria-label="选择知识库文档" type="file" multiple accept=".pdf,.doc,.docx,.docm,.xls,.xlsx,.xlsm,.ppt,.pptx,.pptm,.rtf,.odt,.ods,.odp,.txt,.md,.csv,.json,.xml,.html,.htm,.yaml,.yml,.log,.tsv,.eml,.epub,.png,.jpg,.jpeg,.webp,.tif,.tiff,.bmp" onChange={(e) => { addUploadFiles(Array.from(e.target.files ?? [])); e.currentTarget.value = ''; }} /><div className={`knowledge-dropzone ${dragActive ? 'active' : ''} ${uploadFiles.length ? 'has-files' : ''}`} onDragOver={(e) => { e.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={(e) => { e.preventDefault(); setDragActive(false); addUploadFiles(Array.from(e.dataTransfer.files)); }}><div className="knowledge-dropzone-icon">↑</div><div><strong>拖拽文件到这里，或批量选择上传</strong><span>统一进入“原件保存 → 文档解析 → 质量门 → RAG 索引”流程；支持 PDF、Word、Excel、PowerPoint、文本、网页与常见图片。单文件 ≤ 25 MB，一次最多 20 份。</span></div><button type="button" className="knowledge-ghost" onClick={() => fileRef.current?.click()}>选择文件</button></div>{uploadFiles.length > 0 && <div className="knowledge-upload-queue"><div className="knowledge-section-head"><div><strong>待上传</strong><span>{uploadFiles.length} 份文件</span></div><button type="button" onClick={() => setUploadFiles([])}>清空</button></div><div className="knowledge-upload-files">{uploadFiles.map((file) => <div key={`${file.name}:${file.size}:${file.lastModified}`}><span className="knowledge-file-mark">{(file.name.split('.').pop() || 'DOC').slice(0, 4).toUpperCase()}</span><span><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span><button type="button" aria-label={`从待上传队列移除 ${file.name}`} onClick={() => setUploadFiles((current) => current.filter((item) => item !== file))}>×</button></div>)}</div><div className="knowledge-upload-actions"><button type="button" className="knowledge-primary" onClick={() => void uploadBatch()} disabled={busy === 'upload'}>{busy === 'upload' ? '正在上传…' : `上传 ${uploadFiles.length} 份文档`}</button></div></div>}</>}

              <div className={`knowledge-documents-layout ${selectedDocumentId ? 'with-inspector' : ''}`}>
                <section className="knowledge-document-card"><div className="knowledge-list-head"><label><input aria-label="选择当前筛选结果中的全部文档" type="checkbox" checked={allVisibleSelected} onChange={(e) => setSelectedDocumentIds(e.target.checked ? visibleDocuments.map((item) => item.id) : [])} /><span>文档</span></label><span>知识库</span><span>状态</span><span>更新时间</span><span /></div>{selectedDocumentIds.length > 0 && <div className="knowledge-bulkbar"><span>已选择 <strong>{selectedDocumentIds.length}</strong> 份</span><div>{canManageSelected && <button type="button" onClick={() => void retrySelectedDocuments()} disabled={busy === 'bulk-retry'}>重试失败项</button>}{canManageSelected && <button type="button" className="danger" onClick={() => void archiveSelectedDocuments()} disabled={busy === 'bulk-archive'}>批量归档</button>}<button type="button" onClick={() => setSelectedDocumentIds([])}>取消选择</button></div></div>}
                  <div className="knowledge-document-list">{visibleDocuments.map((document) => { const collection = collections.find((item) => item.id === document.collectionId); const checked = selectedDocumentIds.includes(document.id); return <article key={document.id} className={`knowledge-document-row ${selectedDocumentId === document.id ? 'selected' : ''}`}><label className="knowledge-row-check"><input aria-label={`选择文档 ${document.title}`} type="checkbox" checked={checked} onChange={(e) => setSelectedDocumentIds((current) => e.target.checked ? [...new Set([...current, document.id])] : current.filter((id) => id !== document.id))} /></label><button type="button" className="knowledge-document-main" onClick={() => setSelectedDocumentId(document.id)}><span className="knowledge-file-mark">{fileMark(document)}</span><span><strong>{document.title}</strong><small>{document.sourceFilename || document.sourceType} · {formatBytes(document.currentVersion?.byteSize)} · v{document.currentVersion?.version ?? 1}</small></span></button><span className="knowledge-document-space">{collection?.name ?? '—'}</span><div className="knowledge-document-status"><em className={`knowledge-state ${document.ingestionState.toLowerCase()}`}>{statusLabel(document.ingestionState)}</em>{document.cleanupState === 'FAILED' && <em className="knowledge-state failed">清理异常</em>}</div><time>{formatDate(document.updatedAt)}</time><div className="knowledge-document-actions">{isProcessing(document) && <button type="button" onClick={() => void refreshDocument(document)} disabled={busy === `status-${document.id}`}>刷新</button>}{Boolean(document.canManage) && ['READY', 'FAILED'].includes(document.ingestionState) && <button type="button" onClick={() => void retryDocument(document)} disabled={busy === `retry-${document.id}`}>{document.ingestionState === 'FAILED' ? '重试' : '重新处理'}</button>}{Boolean(document.canManage) && isProcessing(document) && <button type="button" onClick={() => void retryDocument(document)} disabled={busy === `retry-${document.id}`}>重新处理</button>}<button type="button" onClick={() => void downloadSource(document)} disabled={busy === `download-${document.id}`}>原件</button></div></article>; })}{!visibleDocuments.length && <div className="knowledge-empty"><strong>没有符合条件的文档</strong><span>调整筛选条件，或在知识库中上传新的企业资料。</span></div>}</div>
                </section>

                {selectedDocumentId && <aside className="knowledge-inspector">{!documentDetail ? <div className="knowledge-empty compact">正在加载文档详情…</div> : <><div className="knowledge-inspector-head"><div><span className="knowledge-file-mark large">{fileMark(documentDetail.document)}</span><div><strong>{documentDetail.document.title}</strong><small>{documentDetail.document.sourceFilename || documentDetail.document.sourceType}</small></div></div><button type="button" className="knowledge-icon-button" aria-label="刷新文档详情" title="刷新文档详情" onClick={() => void refreshKnowledge()} disabled={loading}>↻</button><button type="button" className="knowledge-icon-button" aria-label="关闭文档详情" onClick={() => setSelectedDocumentId(null)}>×</button></div><div className="knowledge-inspector-tabs"><button type="button" className={inspectorTab === 'overview' ? 'active' : ''} onClick={() => setInspectorTab('overview')}>概览</button><button type="button" className={inspectorTab === 'preview' ? 'active' : ''} onClick={() => setInspectorTab('preview')}>预览</button><button type="button" className={inspectorTab === 'versions' ? 'active' : ''} onClick={() => setInspectorTab('versions')}>版本 {documentDetail.versions.length}</button><button type="button" className={inspectorTab === 'processing' ? 'active' : ''} onClick={() => setInspectorTab('processing')}>处理记录</button><button type="button" className={inspectorTab === 'links' ? 'active' : ''} onClick={() => setInspectorTab('links')}>业务关联</button></div>
                  {inspectorTab === 'overview' && <><dl className="knowledge-meta"><div><dt>处理状态</dt><dd><em className={`knowledge-state ${documentDetail.document.ingestionState.toLowerCase()}`}>{statusLabel(documentDetail.document.ingestionState)}</em></dd></div><div><dt>资料等级</dt><dd>{classificationLabel(documentDetail.document.classification)}</dd></div><div><dt>可见范围</dt><dd>{visibilityLabel(documentDetail.document.visibility)}</dd></div><div><dt>当前版本</dt><dd>v{documentDetail.document.currentVersion?.version ?? 1}</dd></div><div><dt>文件大小</dt><dd>{formatBytes(documentDetail.document.currentVersion?.byteSize)}</dd></div><div><dt>最近更新</dt><dd>{formatDate(documentDetail.document.updatedAt, true)}</dd></div><div><dt>原始文件</dt><dd>{documentDetail.document.currentVersion?.sourceStored ? '已安全保存' : '不可用'}</dd></div><div><dt>文件完整性</dt><dd>{documentDetail.document.currentVersion?.contentChecksum ? '已校验' : '待校验'}</dd></div></dl><div className="knowledge-inspector-actions"><button type="button" className="knowledge-primary" onClick={() => void downloadSource(documentDetail.document)}>下载原件</button>{documentDetail.canManage && ['READY', 'FAILED'].includes(documentDetail.document.ingestionState) && <button type="button" onClick={() => void retryDocument(documentDetail.document)}>{documentDetail.document.ingestionState === 'FAILED' ? '重试' : '重新处理'}</button>}{documentDetail.canManage && isProcessing(documentDetail.document) && <button type="button" onClick={() => void retryDocument(documentDetail.document)}>重新处理</button>}{documentDetail.canManage && <button type="button" className="danger" onClick={async () => { if (await removeDocument(documentDetail.document)) { await refreshAllDocuments(); if (selectedId) await refreshSelected(selectedId); setSuccess('文档已归档。'); } }}>归档文档</button>}</div></>}
                  {inspectorTab === 'preview' && <KnowledgeDocumentPreview document={documentDetail.document} />}
                  {inspectorTab === 'versions' && <div className="knowledge-timeline">{documentDetail.canManage && <div className="knowledge-version-actions"><input ref={revisionFileRef} type="file" className="knowledge-hidden-file" aria-label="选择文档新版本" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void uploadRevision(file); }} /><button type="button" className="knowledge-primary" disabled={busy !== null || isProcessing(documentDetail.document)} onClick={() => revisionFileRef.current?.click()}>{busy === 'revision' ? '正在更新…' : '上传新版本'}</button><p>保留文档编号、业务关联及历史原件。处理中请等待完成。</p></div>}{documentDetail.versions.map((version, index) => <article key={version.id}><i /><div><strong>v{version.version}{index === 0 ? ' · 当前版本' : ''}</strong><span>{version.sourceFilename || '企业知识文档'} · {formatBytes(version.byteSize)}</span><small>{formatDate(version.createdAt, true)}</small><code>{version.contentChecksum.slice(0, 30)}…</code></div><button type="button" className="knowledge-ghost" aria-label={`下载版本 ${version.version}`} onClick={() => void downloadVersion(version)}>下载原件</button></article>)}</div>}
                  {inspectorTab === 'processing' && <div className="knowledge-processing-log"><div className="knowledge-processing-log-head"><span className="knowledge-upstream-badge">处理记录</span><p>查看文档处理状态、开始时间、结束时间和耗时，便于定位失败任务。</p></div><div className="knowledge-timeline">{documentDetail.ingestionRuns.map((run) => { const duration = formatDuration(run.startedAt, run.finishedAt); return <article key={run.id}><i className={run.status.toLowerCase()} /><div><strong>{statusLabel(run.status)}</strong><span>{processingDetailLabel(run.detail)}</span>{run.cause && run.cause !== run.detail && <span>{processingDetailLabel(run.cause)}</span>}<small>开始：{formatDate(run.startedAt, true)}</small><small>{run.finishedAt ? `结束：${formatDate(run.finishedAt, true)}` : '当前：进行中'}</small>{duration && <small>耗时：{duration}</small>}</div></article>; })}{!documentDetail.ingestionRuns.length && <div className="knowledge-empty compact">暂无处理记录。</div>}</div></div>}
                  {inspectorTab === 'links' && <div className="knowledge-links"><div className="knowledge-card-head"><div><h3>业务关联</h3><p>把知识与客户、项目、产品、市场等业务对象连接起来。</p></div></div>{documentDetail.links.map((link, index) => <div className="knowledge-link-chip" key={`${link.businessType}-${link.businessId}`}><span><strong>{linkTypes.find((item) => item.value === link.businessType)?.label ?? link.businessType}</strong><small>{link.businessId}</small></span>{documentDetail.canManage && <button type="button" onClick={() => void removeBusinessLink(index)}>移除</button>}</div>)}{!documentDetail.links.length && <div className="knowledge-empty compact">暂未关联业务对象。</div>}{documentDetail.canManage && <div className="knowledge-link-add"><select value={linkType} onChange={(e) => { setLinkType(e.target.value as LinkType); setLinkBusinessId(''); }}>{linkTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>{['Account', 'Contact', 'Opportunity'].includes(linkType) ? <KnowledgeBusinessLinkPicker type={linkType as 'Account' | 'Contact' | 'Opportunity'} value={linkBusinessId} onChange={setLinkBusinessId} /> : <input aria-label="业务记录 ID" value={linkBusinessId} onChange={(e) => setLinkBusinessId(e.target.value)} placeholder="业务记录 ID（高级）" />}<button type="button" onClick={() => void addBusinessLink()} disabled={busy === 'save-links' || !linkBusinessId}>关联</button></div>}</div>}
                </>}</aside>}
              </div>
            </div>
          )}

          {activeView === 'search' && (
            <div className="knowledge-view knowledge-search-view">
              <section className="knowledge-search-hero"><div><span>知识检索</span><h3>在企业知识中快速定位原始依据</h3><p>检索结果直接返回来源文档、页码或章节，不经过 AI 生成。</p></div><form className="knowledge-search-form" onSubmit={runSearch}><div className="knowledge-search-box"><span aria-hidden="true">⌕</span><input aria-label="搜索企业知识" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索产品参数、方案、案例、国家市场、客户项目知识…" /><button className="knowledge-primary" disabled={searching || !query.trim()} type="submit">{searching ? '检索中…' : '搜索'}</button></div><div className="knowledge-search-options"><label><span>检索范围</span><select value={searchScope} onChange={(e) => setSearchScope(e.target.value as 'CURRENT' | 'ALL')}><option value="ALL">全部可访问知识库</option>{selectedCollection && <option value="CURRENT">当前知识库：{selectedCollection.name}</option>}</select></label><small>检索只会返回当前账户有权限访问的企业知识。</small></div></form></section>
              {searchResults.length > 0 ? <section className="knowledge-search-results"><div className="knowledge-card-head"><div><h3>检索结果</h3><p>找到 {searchResults.length} 个相关知识片段</p></div><button type="button" onClick={() => setSearchResults([])}>清空结果</button></div><div className="knowledge-result-list">{searchResults.map((result, index) => { const collection = collections.find((item) => item.id === result.collectionId); return <article key={result.chunkId ?? `${result.knowledgeDocumentId}-${index}`} className="knowledge-result"><div className="knowledge-result-rank">{String(index + 1).padStart(2, '0')}</div><div className="knowledge-result-body"><div className="knowledge-result-source"><div><strong>{result.sourceTitle}</strong><span>{collection?.name ?? '企业知识库'}</span></div><span>{result.page ? `第 ${result.page} 页` : result.section || '来源片段'}{scoreLabel(result.score)}</span></div><p>{result.text}</p><button type="button" onClick={() => openSearchResult(result)}>打开来源文档 →</button></div></article>; })}</div></section> : <section className="knowledge-search-empty"><div className="knowledge-search-empty-icon">⌕</div><strong>{query ? '输入关键词并开始检索' : '搜索企业知识'}</strong><span>例如：550W 组件、厄瓜多尔塑料厂、储能系统、柴油发电机、项目报价原则</span></section>}
            </div>
          )}

          {activeView === 'testing' && canCreateCollection && (
            <div className="knowledge-view">
              <KnowledgeRetrievalTest
                collections={collections}
                selectedCollectionId={selectedId}
                onOpenResult={openSearchResult}
              />
            </div>
          )}

          {activeView === 'governance' && selectedCollection && canManageSelected && collectionDetail && (
            <div className="knowledge-view knowledge-governance-grid">
              <section className="knowledge-card"><div className="knowledge-card-head"><div><h3>知识库设置</h3><p>维护知识空间的名称、说明和安全等级。</p></div></div><div className="knowledge-settings"><label>名称<input value={settingsDraft.name} onChange={(e) => setSettingsDraft({ ...settingsDraft, name: e.target.value })} /></label><label>说明<textarea value={settingsDraft.description} onChange={(e) => setSettingsDraft({ ...settingsDraft, description: e.target.value })} /></label><div className="knowledge-settings-pair"><label>资料等级<select value={settingsDraft.classification} onChange={(e) => { const classification = e.target.value as KnowledgeClassification; setSettingsDraft({ ...settingsDraft, classification, visibility: isSensitiveClassification(classification) && settingsDraft.visibility === 'INTERNAL' ? 'RESTRICTED' : settingsDraft.visibility }); }}><option value="PUBLIC">公开资料</option><option value="INTERNAL">内部资料</option><option value="CONFIDENTIAL">机密资料</option><option value="RESTRICTED">严格受限</option></select></label><label>可见范围<select value={settingsDraft.visibility} onChange={(e) => setSettingsDraft({ ...settingsDraft, visibility: e.target.value as KnowledgeVisibility })}><option value="INTERNAL" disabled={isSensitiveClassification(settingsDraft.classification)}>企业内部</option><option value="PRIVATE">仅自己</option><option value="RESTRICTED">受限共享</option></select></label></div><div className="knowledge-settings-actions"><button type="button" className="knowledge-primary" onClick={() => void saveCollection()} disabled={busy === 'save-collection'}>保存设置</button></div></div></section>
              <section className="knowledge-card"><div className="knowledge-card-head"><div><h3>访问权限</h3><p>“受限共享”知识库可按角色或指定用户授权读取。</p></div></div><div className="knowledge-acl">{aclEntries.map((entry, index) => <div className="knowledge-acl-row" key={`${entry.principalType}-${entry.principalId}`}><span><strong>{entry.principalType === 'ROLE' ? '角色' : '指定用户'}</strong><small>{entry.principalId}</small></span><button type="button" onClick={() => setAclEntries((current) => current.filter((_, itemIndex) => itemIndex !== index))}>移除</button></div>)}{!aclEntries.length && <div className="knowledge-empty compact">当前没有额外授权项。</div>}<div className="knowledge-acl-add"><select value={aclType} onChange={(e) => { const next = e.target.value as 'ROLE' | 'SUBJECT'; setAclType(next); setAclPrincipal(next === 'ROLE' ? 'substrate-manager' : ''); }}><option value="ROLE">角色</option><option value="SUBJECT">指定用户</option></select>{aclType === 'ROLE' ? <select value={aclPrincipal} onChange={(e) => setAclPrincipal(e.target.value)}><option value="substrate-manager">经理</option><option value="substrate-user">企业用户</option></select> : <input aria-label="指定用户 Subject ID" value={aclPrincipal} onChange={(e) => setAclPrincipal(e.target.value)} placeholder="用户 Subject ID（高级）" />}<button type="button" onClick={addAcl}>添加</button></div><div className="knowledge-settings-actions"><button type="button" className="knowledge-primary" onClick={() => void saveAcl()} disabled={busy === 'save-acl'}>保存访问权限</button></div></div></section>
              <section className="knowledge-card"><div className="knowledge-card-head"><div><h3>知识运行状态</h3><p>查看当前知识库的文档处理与检索状态。</p></div></div><div className="knowledge-governance-stats"><div><span>检索服务</span><strong className={`knowledge-health ${health}`}>{health === 'ready' ? '正常' : health === 'checking' ? '检查中' : '异常'}</strong></div><div><span>文档总数</span><strong>{collectionDetail.documentCounts.total}</strong></div><div><span>可检索</span><strong>{collectionDetail.documentCounts.ready}</strong></div><div><span>处理中</span><strong>{collectionDetail.documentCounts.processing}</strong></div><div><span>处理失败</span><strong>{collectionDetail.documentCounts.failed}</strong></div></div>{selectedCollection.providerState !== 'READY' && <button type="button" className="knowledge-secondary-wide" onClick={() => void retryCollection()} disabled={busy === 'retry-collection'}>重新同步知识库</button>}</section>
              <section className="knowledge-card danger-zone"><div className="knowledge-card-head"><div><h3>归档知识库</h3><p>只有知识库内全部文档已归档后，才能归档整个知识库。</p></div></div><button type="button" className="knowledge-danger-button" onClick={() => void archiveCollection()} disabled={busy === 'archive-collection'}>归档当前知识库</button></section>
            </div>
          )}
        </main>
      </div>
    </section>
  );
}
