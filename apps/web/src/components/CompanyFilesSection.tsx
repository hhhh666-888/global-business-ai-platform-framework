import { useState } from 'react';
import type { GbapSession } from '../hooks/useGbapSession';
import { useCrmFilesQuery } from '../lib/crmEntityQueries';
import { CrmFileDownloadButton } from './CrmFileDownloadButton';
import { CrmFilePreviewButton } from './CrmFilePreviewButton';
import './company-files.css';

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function CompanyFilesSection({ session, businessId }: { session: GbapSession; businessId: string }) {
  const query = useCrmFilesQuery(session, true, { businessType: 'Account', businessId });
  const files = query.data?.files ?? [];
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const error = downloadError ?? (query.error ? '关联文件读取失败，请刷新重试。' : null);
  return <section className="company-files" aria-label="公司关联文件" data-testid="company-files">
    <div className="company-files-heading"><div><h4>关联文件 <span>{query.data ? `${files.length} 个文件` : ''}</span></h4><p>此公司的账单、合同及其他业务资料。</p></div><button type="button" className="crm-link-button" disabled={query.isFetching} onClick={() => { setDownloadError(null); void query.refetch(); }}>{query.isFetching ? '刷新中…' : '刷新文件'}</button></div>
    {error && <p className="company-files-error" role="alert">{error}</p>}
    {query.isPending && !query.data && !query.error ? <p role="status">正在读取关联文件…</p> : null}
    {files.map(file => <div className="company-file-row" key={file.id}>
      <div className="company-file-name"><strong>{file.fileName}</strong><small>{sizeLabel(file.sizeBytes)} · {new Date(file.createdAt).toLocaleDateString('zh-CN')}</small></div>
      <div className="company-file-actions"><CrmFilePreviewButton file={file} /><CrmFileDownloadButton file={file} onStart={() => setDownloadError(null)} onError={setDownloadError} /></div>
    </div>)}
    {query.data && files.length === 0 && !query.error ? <p className="company-files-empty">此公司还没有关联文件。在“文件”中上传时选择此公司，文件会显示在这里。</p> : null}
  </section>;
}
