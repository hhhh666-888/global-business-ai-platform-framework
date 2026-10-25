import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { IconFile, IconRefresh } from 'twenty-ui/icon';
import {
  deleteCrmFile,
  uploadCrmFile,
  type CrmFile,
  type OperationalTarget,
} from '../lib/gbapClient';
import {
  useCrmAccountsQuery,
  useCrmContactsQuery,
  useCrmFilesQuery,
  useCrmOpportunitiesQuery,
  invalidateCrmFiles,
} from '../lib/crmEntityQueries';
import type { GbapSession } from '../hooks/useGbapSession';
import { BusinessRelationPicker, type BusinessRelationOption } from './BusinessRelationPicker';
import { CrmFileDownloadButton } from './CrmFileDownloadButton';
import { CrmFilePreviewButton } from './CrmFilePreviewButton';
import './crm-advanced-surfaces.css';

type Props = { session: GbapSession; search: string };
type TargetOption = BusinessRelationOption & { target: OperationalTarget };

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function userError(cause: unknown, fallback: string) {
  const status = typeof cause === 'object' && cause && 'status' in cause ? Number((cause as { status?: number }).status) : 0;
  if (status === 401) return '登录状态已失效，请重新登录。';
  if (status === 413) return '文件超过当前允许的上传大小。';
  if (status === 409) return '所选业务记录已不可用，请刷新后重新选择。';
  if (status >= 500) return '文件服务暂时不可用，请稍后重试。';
  return fallback;
}

export function FilesSurface({ session, search }: Props) {
  const filesQuery = useCrmFilesQuery(session);
  const accountQuery = useCrmAccountsQuery(session);
  const contactQuery = useCrmContactsQuery(session);
  const opportunityQuery = useCrmOpportunitiesQuery(session);
  const files = filesQuery.data?.files ?? [];
  const accounts = accountQuery.data ?? [];
  const contacts = contactQuery.data ?? [];
  const opportunities = opportunityQuery.data ?? [];
  const maxFileBytes = filesQuery.data?.maxFileBytes ?? 300 * 1024 * 1024;
  const queries = [filesQuery, accountQuery, contactQuery, opportunityQuery];
  const loading = queries.some((query) => query.isPending && !query.data);
  const refreshing = queries.some((query) => query.isFetching);
  const loadError = queries.map((query) => query.error).find(Boolean) ?? null;
  const setFiles = useCallback((updater: React.SetStateAction<CrmFile[]>) => {
    filesQuery.setData((current) => {
      const base = current ?? { files: [], maxFileBytes: 300 * 1024 * 1024 };
      const next = typeof updater === 'function' ? updater(base.files) : updater;
      return { ...base, files: next };
    });
  }, [filesQuery.setData]);
  const refetch = useCallback(() => {
    void Promise.all([filesQuery.refetch(), accountQuery.refetch(), contactQuery.refetch(), opportunityQuery.refetch()]);
  }, [accountQuery.refetch, contactQuery.refetch, filesQuery.refetch, opportunityQuery.refetch]);

  const [targetKey, setTargetKey] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isSuperAdmin = Boolean(session.identity?.roles.includes('substrate-admin'));
  const actorSubject = session.identity?.subject ?? null;

  const accountByBusinessId = useMemo(() => new Map(accounts.filter((item) => item.businessId).map((item) => [item.businessId!, item])), [accounts]);
  const targetOptions = useMemo<TargetOption[]>(() => [
    ...accounts.filter((x) => x.businessId).map((x) => ({
      key: `Account:${x.businessId}`,
      label: `客户公司 · ${x.displayName}`,
      searchText: [x.displayName, x.commercialName, x.registrationId, x.registrationCountry, x.addressCountry, x.addressState, x.addressCity, x.industry, x.primaryEmail, x.primaryPhone, x.website, x.accountOwnerUserId].filter(Boolean).join(' '),
      target: { businessType: 'Account' as const, businessId: x.businessId! },
    })),
    ...contacts.filter((x) => x.businessId).map((x) => ({
      key: `Contact:${x.businessId}`,
      label: `联系人 · ${x.personName}`,
      searchText: [x.personName, x.email, x.phone, x.jobTitle, x.linkedinUrl, x.accountBusinessId ? accountByBusinessId.get(x.accountBusinessId)?.displayName : null].filter(Boolean).join(' '),
      target: { businessType: 'Contact' as const, businessId: x.businessId! },
    })),
    ...opportunities.filter((x) => x.businessId).map((x) => ({
      key: `Opportunity:${x.businessId}`,
      label: `商机 · ${x.nameSummary}`,
      searchText: [x.nameSummary, x.nextStep, x.accountBusinessId ? accountByBusinessId.get(x.accountBusinessId)?.displayName : null].filter(Boolean).join(' '),
      target: { businessType: 'Opportunity' as const, businessId: x.businessId! },
    })),
  ], [accounts, contacts, opportunities, accountByBusinessId]);
  const labelByTarget = useMemo(() => new Map(targetOptions.map((x) => [x.key, x.label])), [targetOptions]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return files;
    return files.filter((item) => `${item.fileName} ${item.target ? labelByTarget.get(`${item.target.businessType}:${item.target.businessId}`) ?? '' : ''}`.toLowerCase().includes(q));
  }, [files, search, labelByTarget]);

  const onFilePicked = async (file: File | undefined) => {
    if (!file || uploading) return;
    if (file.size > maxFileBytes) { setError(`文件不能超过 ${sizeLabel(maxFileBytes)}。`); return; }
    setUploading(true); setError(null); setSuccess(null);
    try {
      const option = targetOptions.find((x) => x.key === targetKey);
      const uploaded = await uploadCrmFile(file, option?.target ?? null);
      invalidateCrmFiles(session, uploaded.file.target);
      setFiles((current) => [uploaded.file, ...current.filter((item) => item.id !== uploaded.file.id)]);
      setSuccess(`文件“${file.name}”已上传。`);
      if (inputRef.current) inputRef.current.value = '';
    } catch (cause) { setError(userError(cause, '文件上传失败，请检查文件后重试。')); }
    finally { setUploading(false); }
  };
  const remove = async (file: CrmFile) => {
    if (!window.confirm(`删除“${file.fileName}”？\n\n删除后可在回收站恢复。`)) return;
    setError(null); setSuccess(null);
    try {
      await deleteCrmFile(file.id);
      invalidateCrmFiles(session, file.target);
      setFiles((current) => current.filter((item) => item.id !== file.id));
      setSuccess(`文件“${file.fileName}”已移至回收站。`);
    } catch (cause) { setError(userError(cause, '文件删除失败，请刷新后重试。')); }
  };

  if (session.status === 'initializing') return <Gate title="正在加载文件" detail="正在恢复企业登录状态…" />;
  if (session.status !== 'authenticated') return <Gate title="登录后管理文件" detail="登录企业账号后即可上传、下载和关联客户业务文件。" action={<Button title="企业登录" onClick={() => void session.login('files')} />} />;

  const visibleError = error ?? (loadError ? userError(loadError, '文件加载失败，请刷新后重试。') : null);
  return <section className="panel flush" data-surface="real-files-wiring">
    <div className="object-toolbar"><div><h2>业务文件</h2><p>{loading ? '正在加载…' : `${filtered.length} 个文件 · 单文件上限 ${sizeLabel(maxFileBytes)}${refreshing ? ' · 后台同步中' : ''}`}</p></div><div className="toolbar-actions"><button className="tool-button" onClick={refetch} disabled={refreshing}><IconRefresh size={15} />{refreshing ? '同步中' : '刷新'}</button></div></div>
    {visibleError && <div className="real-error" role="alert">{visibleError}</div>}
    {success && <div className="real-success" role="status">{success}</div>}
    <div className="crm-advanced-grid">
      <div className="crm-section-card"><div className="crm-section-head"><div><h3>文件库</h3><p>账单、铭牌、方案、报价及其他客户资料。</p></div></div>{filtered.map((file) => {
        const canDelete = isSuperAdmin || (Boolean(actorSubject) && file.createdBy === actorSubject);
        return <div className="crm-file-row" key={file.id}><div className="crm-row-main"><strong>{file.fileName}</strong><small>{file.mimeType}</small></div><div className="crm-muted">{file.target ? labelByTarget.get(`${file.target.businessType}:${file.target.businessId}`) ?? '已关联业务记录' : '未关联记录'}</div><div className="crm-muted">{sizeLabel(file.sizeBytes)}</div><div className="crm-muted">{new Date(file.createdAt).toLocaleString('zh-CN')}</div><div className="crm-row-actions"><CrmFilePreviewButton file={file} /><CrmFileDownloadButton file={file} onStart={() => { setError(null); setSuccess(null); }} onError={setError} />{canDelete && <button className="crm-link-button danger" onClick={() => void remove(file)}>删除</button>}</div></div>;
      })}{!loading && filtered.length === 0 && <div className="real-empty">{search ? '没有匹配的文件。' : '还没有业务文件。可以在右侧上传并关联客户记录。'}</div>}</div>
      <div className="crm-section-card"><div className="crm-section-head"><div><h3>上传文件</h3><p>业务文件由 GBAP 独立持久保存，可长期关联客户记录。</p></div></div><div className="crm-advanced-form"><label>关联业务记录<BusinessRelationPicker ariaLabel="文件关联业务记录" value={targetKey} onChange={setTargetKey} options={targetOptions} emptyLabel="不关联记录" searchPlaceholder="搜索客户公司、联系人或商机…" /></label><label>选择文件<input ref={inputRef} type="file" onChange={(e) => void onFilePicked(e.target.files?.[0])} disabled={uploading} /></label><p className="form-guidance">当前单文件上限 {sizeLabel(maxFileBytes)}。</p></div></div>
    </div>
  </section>;
}

function Gate({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) { return <section className="real-data-gate"><div className="real-data-gate-icon"><IconFile size={22} /></div><div><h2>{title}</h2><p>{detail}</p>{action && <div className="real-data-gate-action">{action}</div>}</div></section>; }
