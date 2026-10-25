import { api } from './gbapClient';

export type CrmAdminBulkDeleteMode = 'soft-delete' | 'destroy';
export type CrmAdminBulkDeleteResult = {
  objectKey: string;
  mode: CrmAdminBulkDeleteMode;
  total: number;
  succeeded: string[];
  failed: Array<{ businessId: string; error: string }>;
};

export type CrmAdminBulkDeleteAggregateResult = Omit<CrmAdminBulkDeleteResult, 'succeeded'> & {
  // Canonical CRM list records may legitimately have no business mapping yet.
  // The server still returns only string IDs; the aggregate view widens the
  // comparison type so callers can safely compare against nullable canonical IDs.
  succeeded: Array<string | null>;
};

export function bulkDeleteCrmRecords(objectKey: string, businessIds: string[], mode: CrmAdminBulkDeleteMode) {
  return api<CrmAdminBulkDeleteResult>('/api/crm-admin/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ objectKey, businessIds, mode }),
  });
}

export async function bulkDeleteCrmRecordsInChunks(
  objectKey: string,
  businessIds: string[],
  mode: CrmAdminBulkDeleteMode,
  chunkSize = 100,
): Promise<CrmAdminBulkDeleteAggregateResult> {
  const unique = [...new Set(businessIds.filter(Boolean))];
  const succeeded: string[] = [];
  const failed: Array<{ businessId: string; error: string }> = [];
  for (let index = 0; index < unique.length; index += chunkSize) {
    const batch = unique.slice(index, index + chunkSize);
    const result = await bulkDeleteCrmRecords(objectKey, batch, mode);
    succeeded.push(...result.succeeded);
    failed.push(...result.failed);
  }
  return { objectKey, mode, total: unique.length, succeeded, failed };
}
