import { api, apiBlob } from './gbapClient';

export type KnowledgeClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
export type KnowledgeVisibility = 'INTERNAL' | 'PRIVATE' | 'RESTRICTED';

export type KnowledgeCollection = {
  id: string;
  name: string;
  description: string | null;
  classification: KnowledgeClassification;
  visibility: KnowledgeVisibility;
  providerState: string;
  canManage?: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeAclEntry = {
  principalType: 'SUBJECT' | 'ROLE';
  principalId: string;
  permission: 'READ';
  createdAt?: string;
};

export type KnowledgeDocumentVersion = {
  id: string;
  documentId: string;
  version: number;
  contentChecksum: string;
  sourceFilename: string | null;
  sourceLocator: string | null;
  mediaType: string | null;
  byteSize: number;
  sourceStored: boolean;
  createdAt: string;
};

export type KnowledgeDocument = {
  id: string;
  collectionId: string;
  title: string;
  sourceType: string;
  sourceFilename: string | null;
  sourceLocator: string | null;
  classification: KnowledgeClassification;
  visibility: KnowledgeVisibility;
  ingestionState: string;
  cleanupState: string;
  currentVersionId: string | null;
  currentVersion: KnowledgeDocumentVersion | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  canManage?: boolean;
};

export type KnowledgeBusinessLink = {
  id?: string;
  businessType: 'Account' | 'Contact' | 'Opportunity' | 'Site' | 'Product' | 'Project' | 'Case' | 'Country' | 'Market' | 'Solution';
  businessId: string;
  createdAt?: string;
};

export type KnowledgeSearchResult = {
  knowledgeDocumentId: string;
  knowledgeDocumentVersionId: string | null;
  collectionId: string;
  chunkId: string | null;
  text: string;
  score: number | null;
  page: number | null;
  section: string | null;
  sourceTitle: string;
  contractVersion: string;
};

export async function getKnowledgeHealth() {
  return api<{ state: string; contractVersion: string }>('/api/knowledge/health');
}

export async function listKnowledgeCollections() {
  return (await api<{ collections: KnowledgeCollection[] }>('/api/knowledge/collections')).collections;
}

export async function getKnowledgeCollection(id: string) {
  return api<{
    collection: KnowledgeCollection;
    acl: KnowledgeAclEntry[];
    documentCounts: { total: number; ready: number; processing: number; failed: number };
  }>(`/api/knowledge/collections/${encodeURIComponent(id)}`);
}

export async function createKnowledgeCollection(input: {
  name: string;
  description?: string | null;
  classification: KnowledgeClassification;
  visibility: KnowledgeVisibility;
}) {
  return api<{ collection: KnowledgeCollection; providerError?: string | null }>('/api/knowledge/collections', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateKnowledgeCollection(id: string, input: Partial<Pick<KnowledgeCollection, 'name' | 'description' | 'classification' | 'visibility'>>) {
  return api<{ collection: KnowledgeCollection; providerError?: string | null }>(`/api/knowledge/collections/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function retryKnowledgeCollection(id: string) {
  return api<{ collection: KnowledgeCollection }>(`/api/knowledge/collections/${encodeURIComponent(id)}/retry`, { method: 'POST' });
}

export async function archiveKnowledgeCollection(id: string) {
  return api<{ archived: boolean; collection: KnowledgeCollection }>(`/api/knowledge/collections/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function replaceKnowledgeAcl(id: string, entries: KnowledgeAclEntry[]) {
  return api<{ entries: KnowledgeAclEntry[] }>(`/api/knowledge/collections/${encodeURIComponent(id)}/acl`, {
    method: 'PUT',
    body: JSON.stringify({ entries }),
  });
}

export async function listKnowledgeDocuments(collectionId?: string) {
  const query = collectionId ? `?collectionId=${encodeURIComponent(collectionId)}` : '';
  return (await api<{ documents: KnowledgeDocument[] }>(`/api/knowledge/documents${query}`)).documents;
}

export async function uploadKnowledgeDocument(input: {
  collectionId: string;
  title: string;
  sourceFilename: string;
  mediaType: string;
  contentBase64: string;
}) {
  return api<{ document: KnowledgeDocument; ingestionRunId: string; providerError?: string | null }>('/api/knowledge/documents', {
    method: 'POST',
    body: JSON.stringify({ ...input, sourceType: 'UPLOAD' }),
  });
}

export async function replaceKnowledgeDocumentVersion(id: string, input: { expectedVersionId: string; sourceFilename: string; mediaType: string; contentBase64: string }) {
  return api<{ document: KnowledgeDocument; ingestionRunId: string; providerError?: string | null }>(`/api/knowledge/documents/${encodeURIComponent(id)}/versions`, { method: 'POST', body: JSON.stringify(input) });
}

export async function getKnowledgeDocument(id: string) {
  return api<{
    document: KnowledgeDocument;
    collection: KnowledgeCollection;
    canManage: boolean;
    versions: KnowledgeDocumentVersion[];
    links: KnowledgeBusinessLink[];
    ingestionRuns: Array<{ id: string; status: string; detail: string | null; cause?: string | null; startedAt: string; finishedAt: string | null }>;
  }>(`/api/knowledge/documents/${encodeURIComponent(id)}`);
}

export async function refreshKnowledgeDocumentStatus(id: string) {
  return api<{ document: KnowledgeDocument; providerStatus: { state: string; detail: string | null; chunkCount: number | null } }>(`/api/knowledge/documents/${encodeURIComponent(id)}/status`);
}

export async function retryKnowledgeDocument(id: string) {
  return api<{ document: KnowledgeDocument; ingestionRunId: string; reconciled?: boolean }>(`/api/knowledge/documents/${encodeURIComponent(id)}/retry`, { method: 'POST' });
}

export async function archiveKnowledgeDocument(id: string) {
  return api<{ archived: boolean; document: KnowledgeDocument }>(`/api/knowledge/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function replaceKnowledgeBusinessLinks(id: string, links: KnowledgeBusinessLink[]) {
  return api<{ links: KnowledgeBusinessLink[] }>(`/api/knowledge/documents/${encodeURIComponent(id)}/links`, {
    method: 'PUT',
    body: JSON.stringify({ links }),
  });
}

export async function searchKnowledge(input: { query: string; collectionIds?: string[]; topK?: number; minimumScore?: number }) {
  return api<{ query: string; results: KnowledgeSearchResult[] }>('/api/knowledge/search', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function downloadKnowledgeSource(id: string, versionId?: string) {
  return apiBlob(`/api/knowledge/documents/${encodeURIComponent(id)}/source${versionId ? `?versionId=${encodeURIComponent(versionId)}` : ''}`);
}
