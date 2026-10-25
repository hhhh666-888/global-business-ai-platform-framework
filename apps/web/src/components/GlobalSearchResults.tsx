import { useEffect, useMemo, useState } from 'react';
import type { GbapSession } from '../hooks/useGbapSession';
import type { GlobalSearchItem } from '../lib/gbapClient';
import {
  useCrmAccountsQuery,
  useCrmContactsQuery,
  useCrmFilesQuery,
  useCrmNotesQuery,
  useCrmOpportunitiesQuery,
  useCrmTasksQuery,
} from '../lib/crmEntityQueries';
import './crm-advanced-surfaces.css';

type Props = {
  query: string;
  session: GbapSession;
  onNavigate: (pageKey: GlobalSearchItem['pageKey']) => void;
};

const kindLabel: Record<GlobalSearchItem['kind'], string> = {
  company: '客户公司',
  contact: '联系人',
  opportunity: '商机',
  task: '任务',
  note: '笔记',
  file: '文件',
};

export function GlobalSearchResults({ query, session, onNavigate }: Props) {
  const trimmed = query.trim();
  const active = session.status === 'authenticated' && trimmed.length >= 2;
  const accountQuery = useCrmAccountsQuery(session, active);
  const contactQuery = useCrmContactsQuery(session, active);
  const opportunityQuery = useCrmOpportunitiesQuery(session, active);
  const taskQuery = useCrmTasksQuery(session, active);
  const noteQuery = useCrmNotesQuery(session, active);
  const filesQuery = useCrmFilesQuery(session, active);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => { setDismissed(false); }, [trimmed]);

  const records = useMemo<GlobalSearchItem[]>(() => {
    if (!active) return [];
    const q = trimmed.toLowerCase();
    const items: GlobalSearchItem[] = [];
    for (const item of accountQuery.data ?? []) {
      if (`${item.displayName} ${item.website ?? ''} ${item.primaryEmail ?? ''} ${item.primaryPhone ?? ''} ${item.industry ?? ''} ${item.addressCountry ?? ''} ${item.addressCity ?? ''}`.toLowerCase().includes(q)) {
        items.push({ kind: 'company', pageKey: 'companies', title: item.displayName, detail: item.website ?? item.industry ?? '客户公司' });
      }
    }
    for (const item of contactQuery.data ?? []) {
      if (`${item.personName} ${item.email ?? ''} ${item.phone ?? ''} ${item.jobTitle ?? ''}`.toLowerCase().includes(q)) {
        items.push({ kind: 'contact', pageKey: 'people', title: item.personName, detail: item.email ?? item.jobTitle ?? '联系人' });
      }
    }
    for (const item of opportunityQuery.data ?? []) {
      if (`${item.nameSummary} ${item.nextStep ?? ''} ${item.pipelineStage ?? ''} ${item.tradeStage ?? ''}`.toLowerCase().includes(q)) {
        items.push({ kind: 'opportunity', pageKey: 'opportunities', title: item.nameSummary, detail: item.nextStep ?? item.pipelineStage ?? '商机' });
      }
    }
    for (const item of taskQuery.data ?? []) {
      if (`${item.title} ${item.bodyMarkdown ?? ''}`.toLowerCase().includes(q)) {
        items.push({ kind: 'task', pageKey: 'tasks', title: item.title, detail: item.status === 'DONE' ? '已完成任务' : '待办任务' });
      }
    }
    for (const item of noteQuery.data ?? []) {
      if (`${item.title} ${item.bodyMarkdown ?? ''}`.toLowerCase().includes(q)) {
        items.push({ kind: 'note', pageKey: 'notes', title: item.title, detail: (item.bodyMarkdown ?? '笔记').slice(0, 80) });
      }
    }
    for (const item of filesQuery.data?.files ?? []) {
      if (item.fileName.toLowerCase().includes(q)) {
        items.push({ kind: 'file', pageKey: 'files', title: item.fileName, detail: `${Math.max(1, Math.round(item.sizeBytes / 1024))} KB` });
      }
    }
    return items.slice(0, 30);
  }, [active, accountQuery.data, contactQuery.data, filesQuery.data, noteQuery.data, opportunityQuery.data, taskQuery.data, trimmed]);

  const queries = [accountQuery, contactQuery, opportunityQuery, taskQuery, noteQuery, filesQuery];
  const loading = active && queries.some((item) => item.isPending && !item.data);
  const error = active && queries.some((item) => Boolean(item.error));

  if (!active || dismissed) return null;

  return <div className="crm-search-popover" data-surface="real-global-search">
    <div className="crm-search-popover-head">{loading ? '正在准备搜索数据…' : error ? '部分搜索数据暂时不可用。' : `${records.length} 条匹配结果`}</div>
    {!loading && records.map((item, index) => <button key={`${item.kind}-${item.title}-${index}`} className="crm-search-result" onClick={() => { setDismissed(true); onNavigate(item.pageKey); }}>
      <span className="crm-search-kind">{kindLabel[item.kind]}</span>
      <span className="crm-row-main"><strong>{item.title}</strong><small>{item.detail}</small></span>
    </button>)}
    {!loading && records.length === 0 && <div className="real-empty">没有匹配的客户、联系人、商机、任务、笔记或文件。</div>}
  </div>;
}
