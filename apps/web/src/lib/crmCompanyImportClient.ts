import { api } from './gbapClient';

export type CompanyImportMapping = {
  sourceHeader: string;
  targetKey: string | null;
};

export type CompanyImportJobSummary = {
  total?: number;
  create?: number;
  update?: number;
  unchanged?: number;
  conflict?: number;
  adopted?: number;
  protectedCells?: number;
  accountCatalogSource?: string;
  accountCatalogCount?: number;
  providerWarning?: string | null;
  fullLegacyCoverageRequired?: boolean;
  legacyCoverageUnsafe?: boolean;
  statusCounts?: Record<string, number>;
  actionCounts?: Record<string, number>;
};

export type CompanyImportJob = {
  id: string;
  fileName: string;
  sourceDigest: string | null;
  presetId: string | null;
  defaultCountry: string | null;
  defaultRegistrationType: string | null;
  updatePolicy: 'OVERWRITE_MAPPED' | 'FILL_BLANK';
  importMode: 'UPSERT' | 'CREATE_ONLY' | 'UPDATE_ONLY';
  rowCount: number;
  uploadedRows: number;
  mappedFieldCount: number;
  protectedFieldCount: number;
  status: string;
  actorUsername: string | null;
  mapping: CompanyImportMapping[];
  summary: CompanyImportJobSummary;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CompanyImportUploadRow = {
  rowNumber: number;
  displayName: string;
  registrationCountry: string;
  registrationType: string;
  registrationId: string;
  fields: Record<string, string>;
};

export type CompanyImportResultRow = {
  rowNumber: number;
  displayName: string;
  registrationCountry: string;
  registrationType: string;
  registrationId: string;
  proposedAction: 'CREATE' | 'UPDATE' | 'SKIP' | 'CONFLICT' | null;
  reason: string | null;
  status: string;
  businessId: string | null;
  providerWarning: string | null;
  errorCode: string | null;
};

export async function createCompanyImportJob(input: {
  fileName: string;
  sourceDigest: string | null;
  presetId: string | null;
  defaultCountry: string | null;
  defaultRegistrationType: string | null;
  updatePolicy: CompanyImportJob['updatePolicy'];
  importMode: CompanyImportJob['importMode'];
  rowCount: number;
  mapping: CompanyImportMapping[];
}) {
  return api<CompanyImportJob>('/api/crm-native/company-import/jobs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function uploadCompanyImportRows(jobId: string, rows: CompanyImportUploadRow[]) {
  return api<CompanyImportJob>(`/api/crm-native/company-import/jobs/${encodeURIComponent(jobId)}/rows`, {
    method: 'POST',
    body: JSON.stringify({ rows }),
  });
}

export async function preflightCompanyImportJob(jobId: string) {
  return api<CompanyImportJob>(`/api/crm-native/company-import/jobs/${encodeURIComponent(jobId)}/preflight`, {
    method: 'POST',
  });
}

export async function startCompanyImportJob(jobId: string) {
  return api<CompanyImportJob>(`/api/crm-native/company-import/jobs/${encodeURIComponent(jobId)}/start`, {
    method: 'POST',
  });
}

export async function retryCompanyImportFailedRows(jobId: string) {
  const requested = await api<CompanyImportJob>(`/api/crm-native/company-import/jobs/${encodeURIComponent(jobId)}/retry-failed`, {
    method: 'POST',
  });

  // retry-failed queues the background worker but the server response is emitted
  // before that worker flips PARTIAL_FAILED -> RUNNING. Return the queued operation
  // as RUNNING so the import center's existing progress poll always starts. The very
  // first poll reads the authoritative server state, including an immediate COMPLETED
  // result or a repeated PARTIAL_FAILED row error.
  return { ...requested, status: 'RUNNING', completedAt: null };
}

export async function listCompanyImportJobs(limit = 20, offset = 0) {
  return api<{ jobs: CompanyImportJob[]; total: number; limit: number; offset: number }>(
    `/api/crm-native/company-import/jobs?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`,
  );
}

export async function getCompanyImportJob(jobId: string, options: { limit?: number; offset?: number; status?: string } = {}) {
  const search = new URLSearchParams();
  search.set('limit', String(options.limit ?? 50));
  search.set('offset', String(options.offset ?? 0));
  if (options.status) search.set('status', options.status);
  return api<{ job: CompanyImportJob; rows: CompanyImportResultRow[]; total: number; limit: number; offset: number }>(
    `/api/crm-native/company-import/jobs/${encodeURIComponent(jobId)}?${search.toString()}`,
  );
}
