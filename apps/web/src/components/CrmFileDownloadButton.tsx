import { useState } from 'react';
import { downloadCrmFile, type CrmFile } from '../lib/gbapClient';

function fileDownloadError(cause: unknown) {
  const status = typeof cause === 'object' && cause && 'status' in cause ? Number(cause.status) : 0;
  if (status === 401) return '登录状态已失效，请重新登录后下载。';
  if (status === 403) return '你没有下载此文件的权限。';
  if (status === 404) return '文件不存在或已移至回收站，请刷新文件列表。';
  if (status >= 500) return '文件服务暂时不可用，请稍后重试下载。';
  return '文件下载失败，请检查网络后重试。';
}

export function CrmFileDownloadButton({ file, onStart, onError }: {
  file: CrmFile;
  onStart?: () => void;
  onError: (message: string) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  async function download() {
    if (downloading) return;
    setDownloading(true);
    onStart?.();
    try { await downloadCrmFile(file.id, file.fileName); }
    catch (cause) { onError(`“${file.fileName}”：${fileDownloadError(cause)}`); }
    finally { setDownloading(false); }
  }
  return <button type="button" className="crm-link-button" disabled={downloading} onClick={() => void download()}>{downloading ? '下载中…' : '下载'}</button>;
}
