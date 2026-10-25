/** Export untrusted business text as data when opened by spreadsheet software. */
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+@-]/u.test(text) && !/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(text)) text = `'${text}`;
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
