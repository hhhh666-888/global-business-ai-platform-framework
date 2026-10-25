import { useEffect, useState } from 'react';
import { IconCheck, IconDatabaseExport, IconSettings } from 'twenty-ui/icon';
import type { GbapSession } from '../hooks/useGbapSession';
import { setUserPreference } from '../lib/userPreferencesClient';
import { appearanceStorageKey, type AppearanceMode, useAppearance } from './AppearanceProvider';
import { SettingsBuilderSurface } from './ManagedCrmSurface';
import { RecycleBinSurface } from './RecycleBinSurface';

type SettingsSection = 'appearance' | 'recycle' | 'system';
type Props = {
  session: GbapSession;
  isSuperAdmin: boolean;
  initialSection?: SettingsSection;
};

const appearanceOptions: Array<{ mode: AppearanceMode; title: string; detail: string }> = [
  { mode: 'light', title: '浅色', detail: '明亮、清晰，适合白天和高照度办公环境。' },
  { mode: 'dark', title: '深色', detail: '深海军蓝界面，适合夜间和低照度环境。' },
  { mode: 'black', title: '暗色', detail: '石墨黑背景与柔和层次，专注内容，减少夜间眩光。' },
  { mode: 'system', title: '跟随系统', detail: '仅在你主动选择后，自动跟随当前 Windows / 浏览器的浅色或深色设置。' },
];

export function SettingsSurface({ session, isSuperAdmin, initialSection = 'appearance' }: Props) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const appearance = useAppearance();
  const subject = session.identity?.subject ?? null;

  useEffect(() => { setSection(initialSection); }, [initialSection]);

  const chooseAppearance = (mode: AppearanceMode) => {
    appearance.setMode(mode);
    try {
      if (subject) window.localStorage.setItem(appearanceStorageKey(subject), mode);
      // The device preference keeps the logged-out shell and Keycloak visually
      // consistent. The authenticated preference below is the account authority.
      window.localStorage.setItem(appearanceStorageKey(), mode);
      document.cookie = `gbap_appearance=${encodeURIComponent(mode)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    } catch { /* browser storage/cookies are optional */ }
    if (session.status === 'authenticated' && subject) {
      void setUserPreference('appearance', { mode }).catch(() => { /* local device fallback remains available */ });
    }
  };

  return <div className="settings-layout" data-surface="crm-settings">
    <aside className="settings-nav" aria-label="设置导航">
      <div className="settings-nav-heading">
        <div className="settings-nav-icon"><IconSettings size={18} /></div>
        <div><strong>设置</strong><span>个人偏好与数据管理</span></div>
      </div>
      <button type="button" className={`settings-nav-item ${section === 'appearance' ? 'active' : ''}`} onClick={() => setSection('appearance')}>
        <span className="settings-nav-bullet" />
        <span><strong>外观</strong><small>浅色、深色、暗色、跟随系统</small></span>
      </button>
      <button type="button" className={`settings-nav-item ${section === 'recycle' ? 'active' : ''}`} onClick={() => setSection('recycle')}>
        <IconDatabaseExport size={16} />
        <span><strong>数据与恢复</strong><small>回收站与误删恢复</small></span>
      </button>
      {isSuperAdmin && <button type="button" className={`settings-nav-item ${section === 'system' ? 'active' : ''}`} onClick={() => setSection('system')}>
        <IconSettings size={16} />
        <span><strong>系统管理</strong><small>企业连接与高级设置</small></span>
      </button>}
    </aside>

    <section className="settings-content">
      {section === 'appearance' && <div className="settings-section" data-settings-section="appearance">
        <div className="settings-section-heading"><span>个人偏好</span><h2>外观</h2><p>默认使用浅色。登录后选择的外观会跟随当前企业账号，在不同设备上恢复；未登录界面继续使用当前设备偏好。</p></div>
        <div className="appearance-grid" role="radiogroup" aria-label="界面外观">
          {appearanceOptions.map((option) => {
            const selected = appearance.mode === option.mode;
            return <button key={option.mode} type="button" role="radio" aria-label={option.title} aria-checked={selected} tabIndex={selected ? 0 : -1} onKeyDown={(event) => { if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const index = appearanceOptions.findIndex(item => item.mode === option.mode); const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? appearanceOptions.length - 1 : (index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + appearanceOptions.length) % appearanceOptions.length; chooseAppearance(appearanceOptions[nextIndex].mode); event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex]?.focus(); }} className={`appearance-card ${selected ? 'selected' : ''}`} onClick={() => chooseAppearance(option.mode)}>
              <div className={`appearance-preview ${option.mode}`} aria-hidden="true">
                <span className="appearance-preview-sidebar" />
                <span className="appearance-preview-main"><i /><i /><i /></span>
              </div>
              <span className="appearance-card-copy"><strong>{option.title}</strong><small>{option.detail}</small></span>
              <span className="appearance-check">{selected && <IconCheck size={15} />}</span>
            </button>;
          })}
        </div>
        <div className="settings-preference-note">当前实际显示：<strong>{appearance.mode === 'black' ? '暗色' : appearance.resolved === 'dark' ? '深色' : '浅色'}</strong></div>
      </div>}

      {section === 'recycle' && <div className="settings-section settings-recycle-section" data-settings-section="recycle">
        <div className="settings-section-heading"><span>数据与恢复</span><h2>回收站</h2><p>集中查看被软删除的业务记录和文件，并在权限范围内恢复。</p></div>
        <RecycleBinSurface session={session} />
      </div>}

      {section === 'system' && isSuperAdmin && <div className="settings-section settings-system-section" data-settings-section="system">
        <SettingsBuilderSurface session={session} />
      </div>}
    </section>
  </div>;
}
