import jsPreviewExcel from '@js-preview/excel';
import '@js-preview/excel/lib/index.css';
import './excel.css';

// The preview library has delayed focus-blur callbacks. A separate document
// confines those callbacks and global keyboard handlers to the reader lifetime.
const host = document.getElementById('excel-preview')!;
let previewer: ReturnType<typeof jsPreviewExcel.init> | null = null;
let data: ArrayBuffer | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let rendering = false;
let pending = false;
const notify = (type: string) => window.parent.postMessage({ type }, window.location.origin);
async function render() {
  if (!data) return;
  if (rendering) { pending = true; return; }
  rendering = true;
  try {
    previewer?.destroy();
    const options = { xls: false, showContextmenu: false };
    previewer = jsPreviewExcel.init(host, options);
    await previewer.preview(data);
    notify('GBAP_EXCEL_RENDERED');
  } catch { notify('GBAP_EXCEL_FAILED'); }
  finally { rendering = false; if (pending) { pending = false; void render(); } }
}
window.addEventListener('message', (event) => {
  if (event.source !== window.parent || event.origin !== window.location.origin || event.data?.type !== 'GBAP_EXCEL_RENDER') return;
  if (!(event.data.data instanceof ArrayBuffer) || event.data.data.byteLength > 25 * 1024 * 1024) { notify('GBAP_EXCEL_FAILED'); return; }
  data = event.data.data;
  void render();
});
window.addEventListener('resize', () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void render(), 150);
});
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  event.preventDefault(); event.stopPropagation(); notify('GBAP_EXCEL_ESCAPE');
}, true);
notify('GBAP_EXCEL_READY');
