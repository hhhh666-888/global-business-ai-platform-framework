import { lazy, Suspense, Activity, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  IconAddressBook,
  IconCalendar,
  IconCheck,
  IconChevronDown,
  IconDatabaseExport,
  IconFile,
  IconHome,
  IconLayoutDashboard,
  IconNotes,
  IconSearch,
  IconSettings,
  IconTargetArrow,
  IconUsers,
  IconWebhook,
} from 'twenty-ui/icon';
import { AccountSurface } from './components/AccountSurface';
import { appearanceStorageKey, type AppearanceMode, useAppearance } from './components/AppearanceProvider';
import { CalendarSurface } from './components/CalendarSurface';
import { CompaniesSurface } from './components/CompaniesSurface';
import { DashboardSurface } from './components/DashboardSurface';
import { DataTransferSurface } from './components/DataTransferSurface';
import { FilesSurface } from './components/FilesSurface';
import { GlobalSearchResults } from './components/GlobalSearchResults';
import { KnowledgeSurface } from './components/KnowledgeSurface';
import { BusinessCrmConfigSurface, WorkflowsSurface } from './components/ManagedCrmSurface';
import { NotesSurface } from './components/NotesSurface';
import { OpportunitiesSurface } from './components/OpportunitiesSurface';
import { PeopleSurface } from './components/PeopleSurface';
import { SavedViewsSurface } from './components/SavedViewsSurface';
import { SettingsSurface } from './components/SettingsSurface';
import { TasksSurface } from './components/TasksSurface';
import { UserAdministrationSurface } from './components/UserAdministrationSurface';
import { WorkbenchSurface } from './components/WorkbenchSurface';
import { useGbapSession } from './hooks/useGbapSession';
import { prefetchCrmSurface, type CrmPrefetchPage } from './lib/crmEntityQueries';
import { getUserPreference, setUserPreference } from './lib/userPreferencesClient';

const CustomBusinessWorkspace = lazy(() => import('./components/CrmRuntimeWorkspaceV2').then(module => ({ default: module.CrmRuntimeWorkspaceV2 })));

type UiRole = 'employee' | 'manager' | 'super-admin';
type AppearancePreference = { mode?: AppearanceMode };

type PageKey =
  | 'home'
  | 'companies'
  | 'people'
  | 'opportunities'
  | 'tasks'
  | 'notes'
  | 'calendar'
  | 'files'
  | 'knowledge'
  | 'views'
  | 'recycle'
  | 'custom-business'
  | 'business-config'
  | 'dashboards'
  | 'workflows'
  | 'data'
  | 'users'
  | 'settings'
  | 'account';

type NavItem = { key: PageKey; label: string; icon: React.ComponentType<{ size?: number; stroke?: number }>; minRole?: UiRole };
type NavGroup = { label: string; items: NavItem[] };

const roleRank: Record<UiRole, number> = { employee: 1, manager: 2, 'super-admin': 3 };
const pageMinRole: Partial<Record<PageKey, UiRole>> = { 'custom-business': 'super-admin', 'business-config': 'manager', dashboards: 'manager', data: 'super-admin', workflows: 'super-admin', users: 'super-admin' };
const crmPrefetchPages = new Set<CrmPrefetchPage>(['home', 'companies', 'people', 'opportunities', 'tasks', 'notes', 'files', 'dashboards']);

const employeeNavGroups: NavGroup[] = [
  {
    label: '客户与销售',
    items: [
      { key: 'home', label: '工作台', icon: IconHome },
      { key: 'companies', label: '客户公司', icon: IconAddressBook },
      { key: 'people', label: '联系人', icon: IconUsers },
      { key: 'opportunities', label: '商机', icon: IconTargetArrow },
      { key: 'tasks', label: '任务', icon: IconCheck },
      { key: 'notes', label: '笔记', icon: IconNotes },
    ],
  },
  {
    label: '协作',
    items: [
      { key: 'calendar', label: '日历', icon: IconCalendar },
      { key: 'files', label: '文件', icon: IconFile },
    ],
  },
  {
    label: '工具',
    items: [
      { key: 'knowledge', label: '企业知识库', icon: IconFile },
      { key: 'views', label: '常用视图', icon: IconAddressBook },
    ],
  },
];

const privilegedCrmNav: NavItem[] = [
  { key: 'custom-business', label: '自定义业务', icon: IconAddressBook, minRole: 'super-admin' },
  { key: 'business-config', label: '业务管理', icon: IconSettings, minRole: 'manager' },
  { key: 'dashboards', label: '销售分析', icon: IconLayoutDashboard, minRole: 'manager' },
  { key: 'data', label: '数据导入与导出', icon: IconDatabaseExport, minRole: 'super-admin' },
  { key: 'users', label: '成员与权限', icon: IconUsers, minRole: 'super-admin' },
  { key: 'workflows', label: '业务自动化', icon: IconWebhook, minRole: 'super-admin' },
];

const pageTitles: Record<PageKey, string> = {
  home: '销售工作台',
  companies: '客户公司',
  people: '联系人',
  opportunities: '商机',
  tasks: '任务',
  notes: '笔记',
  calendar: '日历',
  files: '文件',
  knowledge: '企业知识库',
  views: '常用视图',
  recycle: '设置',
  'custom-business': '自定义业务',
  'business-config': '业务管理',
  dashboards: '销售分析',
  workflows: '业务自动化',
  data: '数据导入与导出',
  users: '成员与权限',
  settings: '设置',
  account: '我的账户',
};

const pageDescriptions: Record<PageKey, string> = {
  home: '查看商机、待办与近期销售活动',
  companies: '统一维护客户资料、联系人与关联商机',
  people: '管理客户联系人与关键沟通对象',
  opportunities: '跟进销售机会、阶段与预计金额',
  tasks: '管理下一步行动与团队待办',
  notes: '沉淀客户背景、沟通记录与业务信息',
  calendar: '查看日程并协调客户跟进时间',
  files: '集中管理业务文件与客户附件',
  knowledge: '统一沉淀产品、方案、案例、市场与项目知识，并提供带来源的企业检索',
  views: '保存高频筛选与查看方式',
  recycle: '个人偏好、数据恢复与系统入口',
  'custom-business': '维护企业自定义对象、记录和视图',
  'business-config': '管理团队业务配置与常用能力',
  dashboards: '查看销售漏斗与团队业务表现',
  workflows: '维护重复业务流程的自动化规则',
  data: '批量导入与导出企业业务数据',
  users: '管理成员身份与业务权限',
  settings: '个人偏好、数据恢复与系统入口',
  account: '查看当前账户与登录安全信息',
};

function getAuthenticatedRole(roles: string[]): UiRole {
  if (roles.includes('substrate-admin')) return 'super-admin';
  if (roles.includes('substrate-manager')) return 'manager';
  return 'employee';
}

function canAccessPage(page: PageKey, role: UiRole) { return roleRank[role] >= roleRank[pageMinRole[page] ?? 'employee']; }
function Avatar({ label }: { label: string }) { return <span className="avatar">{label.slice(0, 1).toUpperCase()}</span>; }
function SidebarItem({ item, active, onClick, onPrefetch }: { item: NavItem; active: boolean; onClick: () => void; onPrefetch?: () => void }) { const Icon = item.icon; return <button type="button" className={`sidebar-item ${active ? 'active' : ''}`} onClick={onClick} onMouseEnter={onPrefetch} onFocus={onPrefetch} title={item.label} aria-current={active ? 'page' : undefined}><Icon size={17} /><span>{item.label}</span></button>; }

function validAppearance(value: unknown): value is AppearanceMode {
  return value === 'light' || value === 'dark' || value === 'black' || value === 'system';
}

export function App() {
  const session = useGbapSession();
  const { setMode: setAppearanceMode, choiceVersion } = useAppearance();
  const currentRole = session.status === 'authenticated' ? getAuthenticatedRole(session.identity?.roles ?? []) : 'employee';
  const [page, setPage] = useState<PageKey>('home');
  const [search, setSearch] = useState('');
  const [opportunityCreateSignal, setOpportunityCreateSignal] = useState(0);
  const [visitedPages, setVisitedPages] = useState<Set<PageKey>>(() => new Set<PageKey>(['home']));
  const pageScrollPositions = useRef<Partial<Record<PageKey, number>>>({});

  useEffect(() => {
    const requested = session.returnPage as PageKey | null;
    if (requested && Object.hasOwn(pageTitles, requested) && canAccessPage(requested, currentRole)) setPage(requested);
  }, [session.returnPage, currentRole]);

  useEffect(() => {
    const subject = session.status === 'authenticated' ? session.identity?.subject ?? null : null;
    let localMode: AppearanceMode | null = null;
    try {
      const stored = window.localStorage.getItem(subject ? appearanceStorageKey(subject) : appearanceStorageKey());
      localMode = validAppearance(stored) ? stored : null;
    } catch { localMode = null; }
    setAppearanceMode(localMode ?? 'light');
    if (!subject) return;
    const expectedChoice = choiceVersion.current;

    let active = true;
    void getUserPreference<AppearancePreference>('appearance')
      .then((preference) => {
        if (!active || choiceVersion.current !== expectedChoice) return;
        const remoteMode = preference?.value?.mode;
        if (validAppearance(remoteMode)) {
          setAppearanceMode(remoteMode);
          try { window.localStorage.setItem(appearanceStorageKey(subject), remoteMode); } catch {}
          return;
        }
        if (localMode) void setUserPreference('appearance', { mode: localMode }).catch(() => {});
      })
      .catch(() => { /* account preference service may be temporarily unavailable; local mode remains */ });
    return () => { active = false; };
  }, [session.status, session.identity?.subject, setAppearanceMode, choiceVersion]);

  useEffect(() => {
    if (!canAccessPage(page, currentRole)) setPage('home');
  }, [currentRole, page]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.getElementById('global-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const surfaceActorKey = session.status === 'authenticated' ? (session.identity?.subject ?? 'authenticated') : session.status;

  useEffect(() => {
    setVisitedPages(new Set<PageKey>([page]));
    pageScrollPositions.current = {};
  }, [surfaceActorKey]);

  useEffect(() => {
    setVisitedPages((current) => {
      if (current.has(page)) return current;
      const next = new Set(current);
      next.add(page);
      return next;
    });
  }, [page]);

  useLayoutEffect(() => {
    const restoreY = pageScrollPositions.current[page] ?? 0;
    window.scrollTo(0, restoreY);
    return () => {
      pageScrollPositions.current[page] = window.scrollY;
    };
  }, [page]);

  const canAccess = (item: NavItem) => roleRank[currentRole] >= roleRank[item.minRole ?? 'employee'];
  const visiblePrivilegedNav = privilegedCrmNav.filter(canAccess);
  const roleLabel = currentRole === 'employee' ? '用户' : currentRole === 'manager' ? '经理' : '超级管理员';
  const profileName = session.identity?.username ?? '访客';

  const renderPersistentSurface = (key: PageKey, node: React.ReactNode) => {
    if (page !== key && !visitedPages.has(key)) return null;
    return <Activity key={`${surfaceActorKey}-${key}`} mode={page === key ? 'visible' : 'hidden'}>{node}</Activity>;
  };

  const prefetchPage = (target: PageKey) => {
    if (!crmPrefetchPages.has(target as CrmPrefetchPage)) return;
    void prefetchCrmSurface(session, target as CrmPrefetchPage);
  };
  const openNewOpportunity = () => { setPage('opportunities'); setOpportunityCreateSignal((value) => value + 1); };
  const handleProfileAction = () => {
    if (session.status === 'authenticated') setPage('account');
    else void session.login(page);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <div className="brand-row"><div className="brand-mark">F</div><div className="brand-copy"><strong>GBAP</strong><span>业务中心</span></div></div>
        <button type="button" className="quick-search" onClick={() => document.getElementById('global-search')?.focus()} aria-label="打开全局搜索"><IconSearch size={16} /><span>搜索</span><kbd aria-hidden="true">⌘ K</kbd></button>
        <nav className="sidebar-scroll" aria-label="业务导航">
          {employeeNavGroups.map((group) => <div className="nav-group" key={group.label}>
            <div className="nav-section-label">{group.label}</div>
            {group.items.filter(canAccess).map((item) => <SidebarItem key={item.key} item={item} active={page === item.key} onClick={() => setPage(item.key)} onPrefetch={() => prefetchPage(item.key)} />)}
          </div>)}
          {visiblePrivilegedNav.length > 0 && <div className="nav-section-label separated">管理与分析</div>}
          {visiblePrivilegedNav.map((item) => <SidebarItem key={item.key} item={item} active={page === item.key} onClick={() => setPage(item.key)} onPrefetch={() => prefetchPage(item.key)} />)}
        </nav>
        <div className="sidebar-footer">
          <SidebarItem item={{ key: 'settings', label: '设置', icon: IconSettings }} active={page === 'settings' || page === 'recycle'} onClick={() => setPage('settings')} />
          <button type="button" className="profile-row" onClick={handleProfileAction} title={session.status === 'authenticated' ? '我的账户' : '企业登录'}><Avatar label={profileName} /><span><strong>{profileName}</strong><small>{roleLabel}{session.status === 'authenticated' ? ' · 已登录' : ' · 未登录'}</small></span><IconChevronDown size={15} /></button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-title"><div className="breadcrumb">{page === 'knowledge' ? 'GBAP / 企业知识' : 'GBAP / 客户与销售'}</div><h1>{pageTitles[page]}</h1><p className="topbar-description">{pageDescriptions[page]}</p></div>
          <div className="top-actions">
            <div className="global-search-shell">
              <div className="global-search-wrap"><IconSearch size={16} /><input id="global-search" aria-label="全局搜索" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索客户、联系人、商机、任务、文件…" /></div>
              <GlobalSearchResults session={session} query={search} onNavigate={(target) => setPage(target)} />
            </div>
          </div>
        </header>

        <div className="content">
          {renderPersistentSurface('home', <WorkbenchSurface session={session} onNavigate={(target) => setPage(target)} onNewOpportunity={openNewOpportunity} />)}
          {renderPersistentSurface('companies', <CompaniesSurface session={session} search={search} />)}
          {renderPersistentSurface('people', <PeopleSurface session={session} search={search} />)}
          {renderPersistentSurface('opportunities', <OpportunitiesSurface session={session} search={search} createSignal={opportunityCreateSignal} />)}
          {renderPersistentSurface('tasks', <TasksSurface session={session} search={search} />)}
          {renderPersistentSurface('notes', <NotesSurface session={session} search={search} />)}
          {renderPersistentSurface('calendar', <CalendarSurface session={session} search={search} onOpenAdminSettings={() => setPage('settings')} />)}
          {renderPersistentSurface('files', <FilesSurface session={session} search={search} />)}
          {renderPersistentSurface('knowledge', <KnowledgeSurface session={session} />)}
          {renderPersistentSurface('views', <SavedViewsSurface session={session} onApply={(target, query) => { if (canAccessPage(target as PageKey, currentRole)) { setSearch(query); setPage(target as PageKey); } }} />)}
          {renderPersistentSurface('recycle', <SettingsSurface session={session} isSuperAdmin={currentRole === 'super-admin'} initialSection="recycle" />)}
          {canAccessPage('business-config', currentRole) && renderPersistentSurface('business-config', <BusinessCrmConfigSurface onNavigate={(target) => setPage(target)} />)}
          {canAccessPage('dashboards', currentRole) && renderPersistentSurface('dashboards', <DashboardSurface session={session} />)}
          {currentRole === 'super-admin' && renderPersistentSurface('custom-business', <Suspense fallback={<p role="status">正在加载业务工作区…</p>}><CustomBusinessWorkspace customOnly session={session} onNavigate={target => setPage(target)} /></Suspense>)}
          {currentRole === 'super-admin' && renderPersistentSurface('data', <DataTransferSurface session={session} />)}
          {currentRole === 'super-admin' && renderPersistentSurface('users', <UserAdministrationSurface session={session} />)}
          {currentRole === 'super-admin' && renderPersistentSurface('workflows', <WorkflowsSurface onOpenSettings={() => setPage('settings')} />)}
          {renderPersistentSurface('settings', <SettingsSurface session={session} isSuperAdmin={currentRole === 'super-admin'} />)}
          {renderPersistentSurface('account', <AccountSurface session={session} roleLabel={roleLabel} isSuperAdmin={currentRole === 'super-admin'} onOpenSettings={() => setPage('settings')} />)}
        </div>
      </main>
    </div>
  );
}
