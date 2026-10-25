const MAX_ARCHIVE = 25 * 1024 * 1024;
const MAX_EXPANDED = 64 * 1024 * 1024;
const MAX_ENTRY = 16 * 1024 * 1024;

// Validate central and local headers before any Office preview library expands
// user-controlled ZIP contents. Refuse encrypted/ZIP64/oversized archives.
export function inspectOfficeArchive(data: ArrayBuffer) {
  if (data.byteLength < 22 || data.byteLength > MAX_ARCHIVE) throw new Error('office_archive_size');
  const view = new DataView(data);
  let end = data.byteLength - 22;
  for (; end >= Math.max(0, data.byteLength - 65557); end--) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === data.byteLength) break;
  }
  if (end < Math.max(0, data.byteLength - 65557)) throw new Error('office_archive_invalid');
  const count = view.getUint16(end + 10, true);
  if (count > 2000 || count === 65535 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count) throw new Error('office_archive_unsupported');
  let cursor = view.getUint32(end + 16, true);
  const directoryEnd = cursor + view.getUint32(end + 12, true);
  if (directoryEnd !== end) throw new Error('office_archive_invalid');
  let expanded = 0;
  const entries: Array<{ start: number; compressed: number; expanded: number; method: number }> = [];
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > directoryEnd || view.getUint32(cursor, true) !== 0x02014b50) throw new Error('office_archive_invalid');
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressed = view.getUint32(cursor + 20, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const next = cursor + 46 + nameLength + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
    expanded += size;
    if ((flags & 1) || ![0, 8].includes(method) || size > MAX_ENTRY || expanded > MAX_EXPANDED || next > directoryEnd) throw new Error('office_archive_expansion_limit');
    const name = new TextDecoder().decode(new Uint8Array(data, cursor + 46, nameLength));
    if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) throw new Error('office_archive_invalid_path');
    const local = view.getUint32(cursor + 42, true);
    if (local + 30 > view.getUint32(end + 16, true) || view.getUint32(local, true) !== 0x04034b50 || view.getUint16(local + 8, true) !== method) throw new Error('office_archive_invalid');
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + compressed > view.getUint32(end + 16, true) || (method === 0 && compressed !== size)) throw new Error('office_archive_invalid');
    entries.push({ start, compressed, expanded: size, method });
    cursor = next;
  }
  if (cursor !== directoryEnd) throw new Error('office_archive_invalid');
  return entries;
}

export async function safeOfficeBytes(blob: Blob) {
  if (blob.size > MAX_ARCHIVE) throw new Error('office_archive_size');
  const data = await blob.arrayBuffer();
  for (const entry of inspectOfficeArchive(data)) {
    if (entry.method === 0) continue;
    // Verify real output too: attackers can lie in the directory size fields.
    const reader = blob.slice(entry.start, entry.start + entry.compressed).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    let actual = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        actual += chunk.value.byteLength;
        if (actual > entry.expanded || actual > MAX_ENTRY) throw new Error('office_archive_expansion_limit');
      }
      if (actual !== entry.expanded) throw new Error('office_archive_invalid');
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  return data;
}
