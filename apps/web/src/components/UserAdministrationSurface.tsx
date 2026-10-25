import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { IconChevronDown, IconPlus, IconRefresh, IconSearch, IconUsers } from 'twenty-ui/icon';
import type { GbapSession } from '../hooks/useGbapSession';
import {
  createIdentityUser,
  deleteIdentityUser,
  listIdentityUsers,
  resetIdentityUserPassword,
  updateIdentityUser,
  type IdentityAdminUser,
  type IdentityRoleTier,
} from '../lib/identityAdminClient';
import './crm-advanced-surfaces.css';
import './user-administration.css';

const roleLabels: Record<IdentityRoleTier, string> = {
  employee: '用户',
  manager: '经理',
  'super-admin': '超级管理员',
};

type UserStatusFilter = 'all' | 'enabled' | 'disabled';
type RoleFilter = 'all' | IdentityRoleTier;
type PasswordMode = 'custom' | 'generated';

type CredentialNotice = {
  username: string;
  password?: string;
  generated: boolean;
  requirePasswordChange: boolean;
};

function friendlyError(error: unknown) {
  const code = error instanceof Error ? error.message : 'identity_admin_failed';
  if (code === 'last_super_admin_protected') return '至少需要保留一个可用的超级管理员。';
  if (code === 'self_admin_lockout_protected') return '当前登录的超级管理员不能禁用自己或移除自己的超级管理员权限。';
  if (code === 'self_delete_protected') return '当前登录账户不能删除自己。';
  if (code === 'identity_conflict') return '登录账号或邮箱与现有账户冲突。';
  if (code === 'invalid_username') return '登录账号可使用中文、英文字母、数字以及 . _ @ -，长度为 2–64 个字符。';
  if (code === 'invalid_password') return '密码至少 12 位，最长 128 位，且不能与登录账号相同。';
  if (code === 'identity_admin_permission_denied') return '当前账户没有用户管理权限，请重新登录后再试。';
  return '账户操作失败，请刷新后重试。';
}

function displayName(user: IdentityAdminUser) {
  return [user.lastName, user.firstName].filter(Boolean).join('') || user.username;
}

function roleTone(role: IdentityRoleTier) {
  if (role === 'super-admin') return 'admin';
  if (role === 'manager') return 'manager';
  return 'user';
}

async function copyText(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {}
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

export function UserAdministrationSurface({ session }: { session: GbapSession }) {
  const [users, setUsers] = useState<IdentityAdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [passwordUserId, setPasswordUserId] = useState<string | null>(null);
  const [moreUserId, setMoreUserId] = useState<string | null>(null);
  const [credentialNotice, setCredentialNotice] = useState<CredentialNotice | null>(null);
  const [copied, setCopied] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: '', firstName: '', lastName: '', email: '', roleTier: 'employee' as IdentityRoleTier,
    passwordMode: 'custom' as PasswordMode, password: '', requirePasswordChange: false,
  });
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', email: '', roleTier: 'employee' as IdentityRoleTier });
  const [passwordForm, setPasswordForm] = useState({ passwordMode: 'custom' as PasswordMode, password: '', requirePasswordChange: false });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setUsers(await listIdentityUsers()); }
    catch (nextError) { setError(friendlyError(nextError)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (session.status === 'authenticated') void load(); }, [load, session.status]);

  const currentSubject = session.identity?.subject ?? '';
  const editingUser = useMemo(() => users.find((user) => user.id === editingId) ?? null, [editingId, users]);
  const passwordUser = useMemo(() => users.find((user) => user.id === passwordUserId) ?? null, [passwordUserId, users]);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return users.filter((user) => {
      const matchesQuery = !normalized || [displayName(user), user.username, user.email]
        .some((value) => value.toLocaleLowerCase().includes(normalized));
      const matchesRole = roleFilter === 'all' || user.roleTier === roleFilter;
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'enabled' ? user.enabled : !user.enabled);
      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [query, roleFilter, statusFilter, users]);

  const counts = useMemo(() => ({
    total: users.length,
    enabled: users.filter((user) => user.enabled).length,
    managers: users.filter((user) => user.roleTier === 'manager').length,
    admins: users.filter((user) => user.roleTier === 'super-admin').length,
  }), [users]);

  const resetCreateForm = () => setCreateForm({
    username: '', firstName: '', lastName: '', email: '', roleTier: 'employee',
    passwordMode: 'custom', password: '', requirePasswordChange: false,
  });

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const generated = createForm.passwordMode === 'generated';
      const result = await createIdentityUser({
        username: createForm.username.trim(),
        firstName: createForm.firstName.trim(),
        lastName: createForm.lastName.trim(),
        email: createForm.email.trim(),
        roleTier: createForm.roleTier,
        ...(generated ? {} : {
          password: createForm.password,
          requirePasswordChange: createForm.requirePasswordChange,
        }),
      });
      setCredentialNotice({
        username: result.user.username,
        password: result.generatedPassword,
        generated: result.passwordGenerated,
        requirePasswordChange: result.requirePasswordChange,
      });
      setCopied(false);
      resetCreateForm();
      setCreateOpen(false);
      await load();
    } catch (nextError) { setError(friendlyError(nextError)); }
    finally { setSaving(false); }
  };

  const beginEdit = (user: IdentityAdminUser) => {
    setEditingId(user.id);
    setPasswordUserId(null);
    setMoreUserId(null);
    setEditForm({ firstName: user.firstName, lastName: user.lastName, email: user.email, roleTier: user.roleTier });
    setError(null);
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingId) return;
    setError(null);
    setSaving(true);
    try {
      await updateIdentityUser(editingId, editForm);
      setEditingId(null);
      await load();
    } catch (nextError) { setError(friendlyError(nextError)); }
    finally { setSaving(false); }
  };

  const toggleEnabled = async (user: IdentityAdminUser) => {
    setError(null);
    setMoreUserId(null);
    setSaving(true);
    try { await updateIdentityUser(user.id, { enabled: !user.enabled }); await load(); }
    catch (nextError) { setError(friendlyError(nextError)); }
    finally { setSaving(false); }
  };

  const beginPasswordReset = (user: IdentityAdminUser) => {
    setPasswordUserId(user.id);
    setEditingId(null);
    setMoreUserId(null);
    setPasswordForm({ passwordMode: 'custom', password: '', requirePasswordChange: false });
    setError(null);
  };

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!passwordUserId) return;
    setError(null);
    setSaving(true);
    try {
      const generated = passwordForm.passwordMode === 'generated';
      const result = await resetIdentityUserPassword(passwordUserId, generated ? {} : {
        password: passwordForm.password,
        requirePasswordChange: passwordForm.requirePasswordChange,
      });
      setCredentialNotice({
        username: result.user.username,
        password: result.generatedPassword,
        generated: result.passwordGenerated,
        requirePasswordChange: result.requirePasswordChange,
      });
      setCopied(false);
      setPasswordUserId(null);
      setPasswordForm({ passwordMode: 'custom', password: '', requirePasswordChange: false });
    } catch (nextError) { setError(friendlyError(nextError)); }
    finally { setSaving(false); }
  };

  const removeUser = async (user: IdentityAdminUser) => {
    setMoreUserId(null);
    if (!window.confirm(`确定删除账户 ${user.username}？删除后该账户将立即无法登录。`)) return;
    setError(null);
    setSaving(true);
    try { await deleteIdentityUser(user.id); await load(); }
    catch (nextError) { setError(friendlyError(nextError)); }
    finally { setSaving(false); }
  };

  return <section className="panel flush identity-admin" data-surface="identity-user-administration">
    <div className="object-toolbar identity-admin-toolbar">
      <div><h2>用户与权限</h2><p>统一管理企业账户、登录凭据、角色与启停状态。</p></div>
      <div className="toolbar-actions">
        <button className="crm-link-button" onClick={() => void load()} disabled={loading || saving}><IconRefresh size={15} />刷新</button>
        <button className="tool-button" onClick={() => { resetCreateForm(); setCreateOpen(true); setError(null); }}><IconPlus size={15} />新增用户</button>
      </div>
    </div>

    {error && <div className="real-error identity-admin-error" role="alert">{error}</div>}

    {credentialNotice && <div className="identity-credential-banner" data-testid="temporary-credential">
      <div className="identity-credential-copy">
        <strong>{credentialNotice.generated ? '临时登录密码已生成' : '登录密码已设置'}</strong>
        <span>登录账号 <b>{credentialNotice.username}</b>{credentialNotice.requirePasswordChange ? ' 首次登录后必须修改密码。' : ' 可直接使用当前密码登录。'}</span>
      </div>
      {credentialNotice.password && <div className="identity-credential-secret">
        <code>{credentialNotice.password}</code>
        <button className="crm-link-button" onClick={() => void copyText(credentialNotice.password!).then(() => setCopied(true))}>{copied ? '已复制' : '复制密码'}</button>
      </div>}
      <button className="crm-link-button" onClick={() => setCredentialNotice(null)}>关闭</button>
    </div>}

    <div className="identity-stat-grid">
      <div className="identity-stat-card"><small>全部账户</small><strong>{counts.total}</strong></div>
      <div className="identity-stat-card"><small>已启用</small><strong>{counts.enabled}</strong></div>
      <div className="identity-stat-card"><small>经理</small><strong>{counts.managers}</strong></div>
      <div className="identity-stat-card"><small>超级管理员</small><strong>{counts.admins}</strong></div>
    </div>

    <div className="identity-list-card">
      <div className="identity-filterbar">
        <label className="identity-search"><IconSearch size={15} /><input aria-label="搜索用户" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索显示姓名、登录账号或邮箱" /></label>
        <select aria-label="角色筛选" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}>
          <option value="all">全部角色</option><option value="employee">用户</option><option value="manager">经理</option><option value="super-admin">超级管理员</option>
        </select>
        <select aria-label="状态筛选" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as UserStatusFilter)}>
          <option value="all">全部状态</option><option value="enabled">已启用</option><option value="disabled">已停用</option>
        </select>
        <span className="identity-result-count">{loading ? '正在更新…' : `${filteredUsers.length} / ${users.length} 个账户`}</span>
      </div>

      <div className="identity-table-head" aria-hidden="true"><span>用户</span><span>角色</span><span>状态</span><span>操作</span></div>
      <div className="identity-table-body">
        {filteredUsers.map((user) => {
          const isSelf = user.id === currentSubject;
          return <div className="identity-user-row" key={user.id} data-user={user.username}>
            <div className="identity-user-main">
              <span className="identity-avatar">{displayName(user).slice(0, 1).toUpperCase()}</span>
              <div><strong>{displayName(user)}</strong><small>登录账号：{user.username}{user.email ? ` · ${user.email}` : ''}{isSelf ? ' · 当前账户' : ''}</small></div>
            </div>
            <div><span className={`identity-role-badge ${roleTone(user.roleTier)}`}>{roleLabels[user.roleTier]}</span></div>
            <div><span className={`identity-status ${user.enabled ? 'enabled' : 'disabled'}`}><i />{user.enabled ? '已启用' : '已停用'}</span></div>
            <div className="identity-row-actions">
              <button className="crm-link-button" onClick={() => beginEdit(user)}>编辑</button>
              <button className="crm-link-button" onClick={() => beginPasswordReset(user)}>重置密码</button>
              <div className="identity-more-wrap">
                <button className="crm-link-button" aria-expanded={moreUserId === user.id} onClick={() => setMoreUserId((value) => value === user.id ? null : user.id)}>更多 <IconChevronDown size={13} /></button>
                {moreUserId === user.id && <div className="identity-action-menu">
                  <button disabled={isSelf || saving} onClick={() => void toggleEnabled(user)}>{user.enabled ? '停用账户' : '启用账户'}</button>
                  <button className="danger" disabled={isSelf || saving} onClick={() => void removeUser(user)}>删除账户</button>
                </div>}
              </div>
            </div>
          </div>;
        })}
        {!loading && filteredUsers.length === 0 && <div className="identity-empty"><IconUsers size={22} /><strong>没有匹配的企业账户</strong><span>调整搜索或筛选条件后再试。</span></div>}
      </div>
    </div>

    {createOpen && <div className="identity-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}>
      <aside className="identity-drawer" role="dialog" aria-modal="true" aria-label="新增用户">
        <form onSubmit={createUser} data-testid="identity-create-form">
          <div className="identity-drawer-head"><div><h3>新增用户</h3><p>创建后账户会立即写入 GBAP Keycloak 身份系统。</p></div><button type="button" className="crm-link-button" onClick={() => setCreateOpen(false)}>关闭</button></div>
          <div className="identity-form-body">
            <div className="identity-form-grid">
              <label>登录账号（用户名）<input required value={createForm.username} onChange={(event) => setCreateForm((value) => ({ ...value, username: event.target.value }))} placeholder="例如 张三 / zhangsan" autoComplete="off" /></label>
              <label>角色<select value={createForm.roleTier} onChange={(event) => setCreateForm((value) => ({ ...value, roleTier: event.target.value as IdentityRoleTier }))}><option value="employee">用户</option><option value="manager">经理</option><option value="super-admin">超级管理员</option></select></label>
              <label>显示姓<input value={createForm.lastName} onChange={(event) => setCreateForm((value) => ({ ...value, lastName: event.target.value }))} /></label>
              <label>显示名<input value={createForm.firstName} onChange={(event) => setCreateForm((value) => ({ ...value, firstName: event.target.value }))} /></label>
              <label className="wide">企业邮箱<input type="email" value={createForm.email} onChange={(event) => setCreateForm((value) => ({ ...value, email: event.target.value }))} placeholder="name@company.com" /></label>
            </div>
            <p className="form-guidance">登录账号就是员工登录时输入的账号，可在创建时直接使用中文；显示姓名只用于界面展示，两者互不替代。账号可使用中文、英文字母、数字以及 . _ @ -。</p>

            <fieldset className="identity-password-choice"><legend>初始密码</legend>
              <label className={createForm.passwordMode === 'custom' ? 'selected' : ''}><input type="radio" name="create-password-mode" checked={createForm.passwordMode === 'custom'} onChange={() => setCreateForm((value) => ({ ...value, passwordMode: 'custom' }))} /><span><strong>自定义固定密码</strong><small>适合管理员现场设置；可选择首次登录后强制修改。</small></span></label>
              <label className={createForm.passwordMode === 'generated' ? 'selected' : ''}><input type="radio" name="create-password-mode" checked={createForm.passwordMode === 'generated'} onChange={() => setCreateForm((value) => ({ ...value, passwordMode: 'generated', password: '' }))} /><span><strong>系统生成临时密码</strong><small>创建后仅显示一次，首次登录必须修改，适合发给员工本人。</small></span></label>
            </fieldset>

            {createForm.passwordMode === 'custom' && <div className="identity-form-grid single">
              <label>登录密码<input required type="password" minLength={12} value={createForm.password} onChange={(event) => setCreateForm((value) => ({ ...value, password: event.target.value }))} placeholder="至少 12 位" autoComplete="new-password" /></label>
              <label className="identity-check"><input type="checkbox" checked={createForm.requirePasswordChange} onChange={(event) => setCreateForm((value) => ({ ...value, requirePasswordChange: event.target.checked }))} />首次登录要求修改密码</label>
            </div>}
          </div>
          <div className="identity-drawer-footer"><button type="button" className="crm-link-button" onClick={() => setCreateOpen(false)}>取消</button><button className="tool-button" type="submit" disabled={saving}>{saving ? '正在创建…' : '创建用户'}</button></div>
        </form>
      </aside>
    </div>}

    {editingId && editingUser && <div className="identity-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingId(null); }}>
      <aside className="identity-drawer" role="dialog" aria-modal="true" aria-label="编辑账户">
        <form onSubmit={saveEdit} data-testid="identity-edit-form">
          <div className="identity-drawer-head"><div><h3>编辑账户</h3><p>登录账号与显示姓名是两项独立信息；登录账号作为长期登录标识保持不变。</p></div><button type="button" className="crm-link-button" onClick={() => setEditingId(null)}>关闭</button></div>
          <div className="identity-form-body"><div className="identity-form-grid">
            <label className="wide">登录账号（不可修改）<input value={editingUser.username} readOnly /></label>
            <label>显示姓<input value={editForm.lastName} onChange={(event) => setEditForm((value) => ({ ...value, lastName: event.target.value }))} /></label>
            <label>显示名<input value={editForm.firstName} onChange={(event) => setEditForm((value) => ({ ...value, firstName: event.target.value }))} /></label>
            <label className="wide">企业邮箱<input type="email" value={editForm.email} onChange={(event) => setEditForm((value) => ({ ...value, email: event.target.value }))} /></label>
            <label className="wide">角色<select value={editForm.roleTier} onChange={(event) => setEditForm((value) => ({ ...value, roleTier: event.target.value as IdentityRoleTier }))}><option value="employee">用户</option><option value="manager">经理</option><option value="super-admin">超级管理员</option></select></label>
          </div><p className="form-guidance">仅修改“显示姓/显示名”不会改变登录账号。需要中文登录时，请在新建账户时直接填写中文登录账号。</p></div>
          <div className="identity-drawer-footer"><button type="button" className="crm-link-button" onClick={() => setEditingId(null)}>取消</button><button className="tool-button" type="submit" disabled={saving}>{saving ? '正在保存…' : '保存修改'}</button></div>
        </form>
      </aside>
    </div>}

    {passwordUserId && passwordUser && <div className="identity-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPasswordUserId(null); }}>
      <aside className="identity-drawer" role="dialog" aria-modal="true" aria-label="重置登录密码">
        <form onSubmit={resetPassword} data-testid="identity-password-form">
          <div className="identity-drawer-head"><div><h3>重置登录密码</h3><p>登录账号 {passwordUser.username}</p></div><button type="button" className="crm-link-button" onClick={() => setPasswordUserId(null)}>关闭</button></div>
          <div className="identity-form-body">
            <fieldset className="identity-password-choice"><legend>新密码方式</legend>
              <label className={passwordForm.passwordMode === 'custom' ? 'selected' : ''}><input type="radio" name="reset-password-mode" checked={passwordForm.passwordMode === 'custom'} onChange={() => setPasswordForm((value) => ({ ...value, passwordMode: 'custom' }))} /><span><strong>自定义固定密码</strong><small>设置后立即生效。</small></span></label>
              <label className={passwordForm.passwordMode === 'generated' ? 'selected' : ''}><input type="radio" name="reset-password-mode" checked={passwordForm.passwordMode === 'generated'} onChange={() => setPasswordForm((value) => ({ ...value, passwordMode: 'generated', password: '' }))} /><span><strong>系统生成临时密码</strong><small>仅显示一次，下次登录必须修改。</small></span></label>
            </fieldset>
            {passwordForm.passwordMode === 'custom' && <div className="identity-form-grid single">
              <label>新登录密码<input required type="password" minLength={12} value={passwordForm.password} onChange={(event) => setPasswordForm((value) => ({ ...value, password: event.target.value }))} placeholder="至少 12 位" autoComplete="new-password" /></label>
              <label className="identity-check"><input type="checkbox" checked={passwordForm.requirePasswordChange} onChange={(event) => setPasswordForm((value) => ({ ...value, requirePasswordChange: event.target.checked }))} />下次登录要求修改密码</label>
            </div>}
          </div>
          <div className="identity-drawer-footer"><button type="button" className="crm-link-button" onClick={() => setPasswordUserId(null)}>取消</button><button className="tool-button" type="submit" disabled={saving}>{saving ? '正在保存…' : '保存密码'}</button></div>
        </form>
      </aside>
    </div>}
  </section>;
}