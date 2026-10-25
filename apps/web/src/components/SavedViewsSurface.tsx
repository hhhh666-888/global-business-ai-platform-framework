import { useCallback, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { IconAddressBook, IconRefresh } from 'twenty-ui/icon';
import { createSavedView, deleteSavedView, listSavedViews, updateSavedView, type CrmSavedView } from '../lib/gbapClient';
import { actorQueryKey, useGbapQuery } from '../lib/queryCache';
import type { GbapSession } from '../hooks/useGbapSession';
import './crm-advanced-surfaces.css';

type Props = {
  session: GbapSession;
  onApply: (pageKey: CrmSavedView['pageKey'], search: string) => void;
};

const pageOptions: Array<{ key: CrmSavedView['pageKey']; label: string }> = [
  { key: 'companies', label: '客户公司' },
  { key: 'people', label: '联系人' },
  { key: 'opportunities', label: '商机' },
  { key: 'tasks', label: '任务' },
  { key: 'notes', label: '笔记' },
  { key: 'files', label: '文件' },
];
const pageLabel = new Map(pageOptions.map((x) => [x.key, x.label]));

function userError(cause: unknown, fallback: string) {
  const status = typeof cause === 'object' && cause && 'status' in cause ? Number((cause as { status?: number }).status) : 0;
  if (status === 401) return '登录状态已失效，请重新登录。';
  if (status === 409) return '同一页面已经有同名视图，请换一个名称。';
  if (status >= 500) return '视图服务暂时不可用，请稍后重试。';
  return fallback;
}

export function SavedViewsSurface({ session, onApply }: Props) {
  const actorKey = session.status === 'authenticated' ? (session.identity?.subject ?? 'authenticated') : session.status;
  const viewsQuery = useGbapQuery<CrmSavedView[]>({
    queryKey: actorQueryKey(actorKey, 'crm', 'saved-views'),
    enabled: session.status === 'authenticated',
    queryFn: listSavedViews,
  });
  const views = viewsQuery.data ?? [];
  const loading = viewsQuery.isPending && !viewsQuery.data;
  const refreshing = viewsQuery.isFetching && Boolean(viewsQuery.data);
  const [name, setName] = useState('');
  const [pageKey, setPageKey] = useState<CrmSavedView['pageKey']>('opportunities');
  const [searchText, setSearchText] = useState('');
  const [favorite, setFavorite] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const setViews = useCallback((updater: React.SetStateAction<CrmSavedView[]>) => {
    viewsQuery.setData((current) => {
      const base = current ?? [];
      return typeof updater === 'function' ? updater(base) : updater;
    });
  }, [viewsQuery.setData]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true); setError(null); setSuccess(null);
    try {
      const created = await createSavedView({ name: name.trim(), pageKey, query: { search: searchText.trim() }, favorite });
      setViews((current) => [created, ...current.filter((view) => view.id !== created.id)]);
      setSuccess(`视图“${created.name}”已保存。`); setName(''); setSearchText('');
    } catch (cause) { setError(userError(cause, '保存视图失败，请检查名称和条件。')); }
    finally { setSaving(false); }
  };

  const toggleFavorite = async (view: CrmSavedView) => {
    setError(null);
    try {
      const updated = await updateSavedView(view.id, { favorite: !view.favorite });
      setViews((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (cause) { setError(userError(cause, '收藏状态更新失败。')); }
  };

  const remove = async (view: CrmSavedView) => {
    if (!window.confirm(`删除视图“${view.name}”？`)) return;
    setError(null); setSuccess(null);
    try {
      await deleteSavedView(view.id);
      setViews((current) => current.filter((item) => item.id !== view.id));
      setSuccess(`视图“${view.name}”已删除。`);
    } catch (cause) { setError(userError(cause, '删除视图失败。')); }
  };

  if (session.status === 'initializing') return <Gate title="正在加载视图" detail="正在恢复企业登录状态…" />;
  if (session.status !== 'authenticated') return <Gate title="登录后使用视图与收藏" detail="保存的筛选与收藏会跟随企业账号，不依赖当前设备。" action={<Button title="企业登录" onClick={() => void session.login('views')} />} />;

  const visibleError = error ?? (viewsQuery.error ? userError(viewsQuery.error, '视图加载失败，请刷新后重试。') : null);
  return <section className="panel flush" data-surface="real-saved-views-wiring">
    <div className="object-toolbar"><div><h2>视图与收藏</h2><p>{loading ? '正在加载…' : `${views.length} 个个人视图${refreshing ? ' · 后台同步中' : ''}`}</p></div><div className="toolbar-actions"><button className="tool-button" onClick={() => void viewsQuery.refetch()} disabled={viewsQuery.isFetching}><IconRefresh size={15} />{viewsQuery.isFetching ? '同步中' : '刷新'}</button></div></div>
    {visibleError && <div className="real-error" role="alert">{visibleError}</div>}
    {success && <div className="real-success" role="status">{success}</div>}
    <div className="crm-advanced-grid">
      <div className="crm-section-card">
        <div className="crm-section-head"><div><h3>已保存视图</h3><p>收藏视图优先显示；点击“应用”直接回到对应业务页面。</p></div></div>
        {views.map((view) => <div className="crm-view-row" key={view.id}>
          <div className="crm-row-main"><strong><span className="crm-favorite" aria-hidden="true">{view.favorite ? '★' : '☆'}</span> <span>{view.name}</span></strong><small>{pageLabel.get(view.pageKey)}</small></div>
          <div className="crm-muted">{pageLabel.get(view.pageKey)}</div>
          <div className="crm-muted">{String(view.query.search ?? '') || '无文本筛选'}</div>
          <div className="crm-row-actions"><button className="crm-link-button" onClick={() => onApply(view.pageKey, String(view.query.search ?? ''))}>应用</button><button className="crm-link-button" onClick={() => void toggleFavorite(view)}>{view.favorite ? '取消收藏' : '收藏'}</button><button className="crm-link-button danger" onClick={() => void remove(view)}>删除</button></div>
        </div>)}
        {!loading && views.length === 0 && <div className="real-empty">还没有保存视图。可以在右侧保存常用搜索条件。</div>}
      </div>
      <div className="crm-section-card">
        <div className="crm-section-head"><div><h3>保存新视图</h3><p>保存业务页面和文本搜索条件，之后可从这里一键恢复。</p></div></div>
        <form className="crm-advanced-form" onSubmit={submit}>
          <label>视图名称<input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：厄瓜多尔重点商机" /></label>
          <label>业务页面<select value={pageKey} onChange={(e) => setPageKey(e.target.value as CrmSavedView['pageKey'])}>{pageOptions.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
          <label>搜索条件<input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="例如：厄瓜多尔" /></label>
          <label className="crm-inline-check"><input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} />保存后加入收藏</label>
          <Button title={saving ? '保存中' : '保存视图'} type="submit" disabled={!name.trim() || saving} />
        </form>
      </div>
    </div>
  </section>;
}

function Gate({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return <section className="real-data-gate"><div className="real-data-gate-icon"><IconAddressBook size={22} /></div><div><h2>{title}</h2><p>{detail}</p>{action && <div className="real-data-gate-action">{action}</div>}</div></section>;
}
