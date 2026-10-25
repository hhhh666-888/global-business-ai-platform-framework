import { lazy, Suspense, useState } from 'react';
import type { CrmFile } from '../lib/gbapClient';

const CrmFilePreviewDialog = lazy(() => import('./CrmFilePreviewDialog'));

export function CrmFilePreviewButton({ file }: { file: CrmFile }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="crm-link-button" onClick={() => setOpen(true)}>查看</button>
    {open && <Suspense fallback={<span role="status">正在打开预览…</span>}>
      <CrmFilePreviewDialog file={file} onClose={() => setOpen(false)} />
    </Suspense>}
  </>;
}
