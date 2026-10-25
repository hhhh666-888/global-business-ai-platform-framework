/** Date-time controls represent wall time in the browser's current time zone. */
export function dateTimeLocalValue(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function dateTimeLocalToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value);
  // Reject normalized invalid dates and times inside a DST spring-forward gap.
  if (!Number.isFinite(date.getTime()) || dateTimeLocalValue(date.toISOString()) !== value) return null;
  return date.toISOString();
}

export function richTextMarkdown(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const markdown = (value as Record<string, unknown>).markdown;
  return typeof markdown === 'string' ? markdown : '';
}

export function currencyAmountInput(amountMicros: unknown): string {
  if (amountMicros === null || amountMicros === undefined || amountMicros === '') return '';
  const amount = Number(amountMicros);
  return Number.isFinite(amount) ? String(amount / 1_000_000) : '';
}
