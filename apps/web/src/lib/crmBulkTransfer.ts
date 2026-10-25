export const CRM_IMPORT_FILE_LIMIT = 10_000;
export const CRM_IMPORT_BATCH_SIZE = 60;
export const CRM_EXPORT_LIMIT = 10_000;

export type ImportBatchProgress = {
  processed: number;
  total: number;
  batch: number;
  totalBatches: number;
};

export function importBatchCount(total: number, batchSize = CRM_IMPORT_BATCH_SIZE) {
  if (!Number.isInteger(batchSize) || batchSize <= 0) throw new Error('invalid_import_batch_size');
  return total <= 0 ? 0 : Math.ceil(total / batchSize);
}

export async function processImportRows<T>(
  rows: readonly T[],
  worker: (row: T) => Promise<void>,
  onProgress?: (progress: ImportBatchProgress) => void,
  batchSize = CRM_IMPORT_BATCH_SIZE,
) {
  if (!Number.isInteger(batchSize) || batchSize <= 0) throw new Error('invalid_import_batch_size');
  const total = rows.length;
  const totalBatches = importBatchCount(total, batchSize);
  let processed = 0;

  for (let offset = 0; offset < total; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    for (const row of batch) await worker(row);
    processed += batch.length;
    onProgress?.({
      processed,
      total,
      batch: Math.floor(offset / batchSize) + 1,
      totalBatches,
    });
    if (processed < total) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}