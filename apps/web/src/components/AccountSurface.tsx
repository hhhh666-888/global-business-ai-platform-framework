import { Button } from 'twenty-ui/input';
import { IconSettings } from 'twenty-ui/icon';
import type { GbapSession } from '../hooks/useGbapSession';
import { sameOriginUrl } from '../lib/managementEntry';
import './crm-advanced-surfaces.css';

type Props = {
  session: GbapSession;
  roleLabel: string;
  isSuperAdmin: boolean;
  onOpenSettings: () => void;
};

export function AccountSurface({ session, roleLabel, isSuperAdmin, onOpenSettings }: Props) {
  if (session.status !== 'authenticated') {
    return <section className="real-data-gate"><div className="real-data-gate-icon"><IconSettings size={22} /></div><div><h2>登录后管理账户</h2><p>登录企业账号后可查看当前身份并进入账户与安全设置。</p><div className="real-data-gate-action"><Button title="企业登录" onClick={() => void session.login('account')} /></div></div></section>;
  }

  const username = session.identity?.username ?? '企业用户';
  return <section className="panel flush" data-surface="real-account-settings">
    <div className="crm-managed-state">
      <div className="real-data-gate-icon"><IconSettings size={22} /></div>
      <h2>账户</h2>
      <p>查看当前登录身份、管理自己的账户与登录安全。退出登录是独立操作，点击左侧账户本身不会再退出系统。</p>

      <div className="crm-section-card">
        <div className="crm-view-row">
          <div className="crm-row-main"><strong>登录账户</strong><small>当前 GBAP 企业登录身份</small></div>
          <div className="crm-muted">{username}</div>
          <div className="crm-muted">{roleLabel}</div>
          <div className="crm-row-actions"><button className="crm-link-button" onClick={() => void session.refresh()}>刷新状态</button></div>
        </div>
        <div className="crm-view-row">
          <div className="crm-row-main"><strong>账户与安全</strong><small>管理自己的资料、密码和登录安全设置</small></div>
          <div className="crm-muted">本人账户</div>
          <div className="crm-muted">企业身份服务</div>
          <div className="crm-row-actions"><a className="crm-link-button" href={sameOriginUrl('/realms/gbap/account/')} target="_blank" rel="noopener noreferrer">打开</a></div>
        </div>
        {isSuperAdmin && <div className="crm-view-row">
          <div className="crm-row-main"><strong>超级管理员设置</strong><small>进入 GBAP 管理设置、平台控制台和 CRM 管理入口状态</small></div>
          <div className="crm-muted">超级管理员</div>
          <div className="crm-muted">GBAP</div>
          <div className="crm-row-actions"><button className="crm-link-button" onClick={onOpenSettings}>打开</button></div>
        </div>}
      </div>

      <div className="crm-section-card">
        <div className="crm-section-head"><div><h3>登录会话</h3><p>仅在明确点击后退出当前企业登录。</p></div><button className="tool-button danger-text" onClick={session.logout}>退出登录</button></div>
      </div>
    </div>
  </section>;
}
