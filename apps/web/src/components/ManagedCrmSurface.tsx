import { Button } from 'twenty-ui/input';
import { IconSettings, IconWebhook } from 'twenty-ui/icon';
import type { GbapSession } from '../hooks/useGbapSession';
import { managedCrmUrl, sameOriginUrl } from '../lib/managementEntry';
import './crm-advanced-surfaces.css';

function openManaged(path: string) {
  const url = managedCrmUrl(path);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

function MissingManagementEntry() {
  return <p className="form-guidance">高级管理地址尚未配置，请由系统管理员配置企业管理地址。当前业务数据仍可正常使用。</p>;
}

export function BusinessCrmConfigSurface({ onNavigate }: { onNavigate: (target: 'dashboards' | 'data' | 'views') => void }) {
  const entries = [
    { title: '销售分析', detail: '查看客户漏斗、商机推进和团队业务健康度。', target: 'dashboards' as const },
    { title: '常用视图', detail: '保存常用筛选、排序和业务查看方式，减少重复操作。', target: 'views' as const },
  ];
  return <section className="panel flush" data-surface="real-manager-business-config">
    <div className="crm-managed-state">
      <div className="real-data-gate-icon"><IconSettings size={22} /></div>
      <h2>业务管理</h2>
      <p>这里集中放置团队日常需要的销售分析和常用查看方式。批量导入、导出和批量数据治理仅由超级管理员执行，不会出现在普通员工或经理工作界面。</p>
      <div className="crm-section-card">
        {entries.map((entry) => <div className="crm-view-row" key={entry.target}>
          <div className="crm-row-main"><strong>{entry.title}</strong><small>{entry.detail}</small></div>
          <div className="crm-muted">团队业务</div>
          <div className="crm-muted">业务管理</div>
          <div className="crm-row-actions"><button className="crm-link-button" onClick={() => onNavigate(entry.target)}>打开</button></div>
        </div>)}
      </div>
      <p className="crm-muted">这里只展示日常业务管理功能；系统维护、批量数据治理等管理操作不会混入员工工作页面。</p>
    </div>
  </section>;
}

export function WorkflowsSurface({ onOpenSettings }: { onOpenSettings: () => void }) {
  const url = managedCrmUrl('/objects/workflows');
  return <section className="panel flush" data-surface="real-workflows-handoff">
    <div className="crm-managed-state">
      <div className="real-data-gate-icon"><IconWebhook size={22} /></div>
      <h2>业务自动化</h2>
      <p>把重复工作交给系统处理，例如客户分配、跟进提醒、状态变化通知以及内部日程协同。</p>
      <div className="crm-section-card">
        <div className="crm-section-head"><div><h3>自动化规则</h3><p>创建、启用、暂停和维护团队自动化规则。</p></div>{url ? <Button title="管理自动化规则" onClick={() => openManaged('/objects/workflows')} /> : <Button title="查看系统设置" onClick={onOpenSettings} />}</div>
        {!url && <div style={{ padding: 14 }}><MissingManagementEntry /></div>}
      </div>
      <p className="crm-muted">规则在后台统一维护；员工只会看到规则执行后的业务结果和提醒。</p>
    </div>
  </section>;
}

export function SettingsBuilderSurface({ session }: { session: GbapSession }) {
  const configured = Boolean(managedCrmUrl('/settings/objects'));
  const username = session.identity?.username ?? '企业用户';
  const entries = [
    { title: '客户字段与分类', detail: '调整客户、联系人等业务资料中需要维护的字段和分类方式。', path: '/settings/objects' },
    { title: '记录页面布局', detail: '调整业务记录页面中字段、信息区块和显示顺序。', path: '/settings/layout' },
    { title: '角色与数据权限', detail: '控制不同岗位可以查看和操作哪些业务资料。', path: '/settings/members/roles' },
  ];
  return <section className="panel flush" data-surface="real-settings-builder-handoff">
    <div className="crm-managed-state">
      <div className="real-data-gate-icon"><IconSettings size={22} /></div>
      <h2>系统设置</h2>
      <p>按日常管理任务组织设置入口。可用功能直接提供操作；暂未开放的能力只显示当前状态，不影响其他功能使用。</p>

      <div className="crm-section-card">
        <div className="crm-section-head"><div><h3>账户与系统</h3><p>当前登录：{username}</p></div></div>
        <div className="crm-view-row">
          <div className="crm-row-main"><strong>我的账户与安全</strong><small>修改个人资料、密码和登录安全设置。</small></div>
          <div className="crm-muted">当前账户</div>
          <div className="crm-muted">登录安全</div>
          <div className="crm-row-actions"><a className="crm-link-button" href={sameOriginUrl('/realms/gbap/account/')} target="_blank" rel="noopener noreferrer">打开</a></div>
        </div>
        <div className="crm-view-row">
          <div className="crm-row-main"><strong>系统服务管理</strong><small>查看公司已接入的业务服务和运行状态。</small></div>
          <div className="crm-muted">系统级</div>
          <div className="crm-muted">系统服务</div>
          <div className="crm-row-actions"><a className="crm-link-button" href={sameOriginUrl('/substrate.html')} target="_blank" rel="noopener noreferrer">打开</a></div>
        </div>
      </div>

      <div className="crm-section-card">
        <div className="crm-section-head"><div><h3>高级业务设置</h3><p>{configured ? '当前高级设置入口可以使用。' : '请配置企业高级管理地址后使用。'}</p></div></div>
        {entries.map((entry) => <div className="crm-view-row" key={entry.path}>
          <div className="crm-row-main"><strong>{entry.title}</strong><small>{entry.detail}</small></div>
          <div className="crm-muted">系统级</div>
          <div className="crm-muted">业务设置</div>
          <div className="crm-row-actions">{configured ? <button className="crm-link-button" onClick={() => openManaged(entry.path)}>打开</button> : <span className="product-status waiting">未配置入口</span>}</div>
        </div>)}
      </div>
      {!configured && <MissingManagementEntry />}
    </div>
  </section>;
}
