import { useCallback, useMemo, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { IconPlus, IconRefresh, IconUsers } from 'twenty-ui/icon';
import {
  createContact,
  deleteContact,
  updateContact,
  type CanonicalAccount,
  type CanonicalContact,
} from '../lib/crmBusinessClient';
import { useCrmAccountsQuery, useCrmContactsQuery } from '../lib/crmEntityQueries';
import type { GbapSession } from '../hooks/useGbapSession';
import { BusinessRecordModal } from './BusinessRecordModal';
import { BusinessRelationPicker, type BusinessRelationOption } from './BusinessRelationPicker';
import './crm-object-surfaces.css';

type Props = { session: GbapSession; search: string };
type ContactForm = { personName: string; email: string; phone: string; jobTitle: string; linkedinUrl: string; accountBusinessId: string };
const EMPTY_FORM: ContactForm = { personName: '', email: '', phone: '', jobTitle: '', linkedinUrl: '', accountBusinessId: '' };

function userError(cause: unknown, fallback: string) {
  const typed = cause as { status?: number; body?: { error?: string; detail?: Record<string, number> } };
  if (typed?.status === 401) return '登录状态已失效，请重新登录。';
  if (typed?.status === 409 && typed.body?.error === 'record_has_related_records') {
    const detail = typed.body.detail ?? {};
    return `该联系人仍关联 ${detail.tasks ?? 0} 个任务、${detail.notes ?? 0} 条笔记。请先处理关联活动，再删除。`;
  }
  if (typed?.status === 409 && typed.body?.error === 'record_has_attached_files') return '该联系人仍有附件，请先处理附件再删除。';
  if (typed?.status === 409) return '当前联系人信息与现有数据冲突，请检查后重试。';
  if (typed?.status && typed.status >= 500) return '联系人服务暂时不可用，请稍后刷新重试。';
  return fallback;
}
function accountSearchText(account: CanonicalAccount) {
  return [
    account.displayName,
    account.commercialName,
    account.registrationId,
    account.registrationCountry,
    account.addressCountry,
    account.addressState,
    account.addressCity,
    account.industry,
    account.primaryEmail,
    account.primaryPhone,
    account.website,
    account.accountOwnerUserId,
  ].filter(Boolean).join(' ');
}

export function PeopleSurface({ session, search }: Props) {
  const contactsQuery = useCrmContactsQuery(session);
  const accountsQuery = useCrmAccountsQuery(session);
  const contacts = contactsQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];
  const loading = (contactsQuery.isPending && !contactsQuery.data) || (accountsQuery.isPending && !accountsQuery.data);
  const refreshing = contactsQuery.isFetching || accountsQuery.isFetching;
  const loadError = contactsQuery.error
    ? userError(contactsQuery.error, '联系人加载失败，请刷新后重试。')
    : accountsQuery.error
      ? userError(accountsQuery.error, '客户公司关系加载失败，请刷新后重试。')
      : null;

  const setContacts = useCallback((updater: React.SetStateAction<CanonicalContact[]>) => {
    contactsQuery.setData((current) => {
      const base = current ?? [];
      return typeof updater === 'function' ? updater(base) : updater;
    });
  }, [contactsQuery.setData]);

  const refetch = useCallback(() => {
    void Promise.all([contactsQuery.refetch(), accountsQuery.refetch()]);
  }, [accountsQuery.refetch, contactsQuery.refetch]);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ContactForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<CanonicalContact | null>(null);
  const [editForm, setEditForm] = useState<ContactForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const accountByBusinessId = useMemo(() => new Map(accounts.filter((item) => item.businessId).map((item) => [item.businessId as string, item])), [accounts]);
  const accountOptions = useMemo<BusinessRelationOption[]>(() => accounts.filter((item) => item.businessId).map((account) => ({
    key: account.businessId!,
    label: account.displayName,
    searchText: accountSearchText(account),
  })), [accounts]);
  const companyFor = useCallback((contact: CanonicalContact) => contact.accountBusinessId ? accountByBusinessId.get(contact.accountBusinessId) ?? null : null, [accountByBusinessId]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((item) => `${item.personName} ${item.email ?? ''} ${item.phone ?? ''} ${item.jobTitle ?? ''} ${item.linkedinUrl ?? ''} ${companyFor(item)?.displayName ?? ''}`.toLowerCase().includes(q));
  }, [contacts, search, companyFor]);

  const openEditor = (contact: CanonicalContact) => {
    setSelected(contact);
    setEditForm({ personName: contact.personName, email: contact.email ?? '', phone: contact.phone ?? '', jobTitle: contact.jobTitle ?? '', linkedinUrl: contact.linkedinUrl ?? '', accountBusinessId: contact.accountBusinessId ?? '' });
    setError(null); setSuccess(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!createForm.personName.trim() || creating) return;
    setCreating(true); setError(null); setSuccess(null);
    try {
      const created = await createContact({
        personName: createForm.personName.trim(), email: createForm.email.trim() || null, phone: createForm.phone.trim() || null,
        jobTitle: createForm.jobTitle.trim() || null, linkedinUrl: createForm.linkedinUrl.trim() || null, accountBusinessId: createForm.accountBusinessId || null,
      });
      setContacts((current) => [created, ...current.filter((item) => item.businessId !== created.businessId)]);
      setSuccess(`联系人“${created.personName}”已创建。`); setCreateForm(EMPTY_FORM); setCreateOpen(false);
    } catch (cause) { setError(userError(cause, '联系人创建失败，请检查填写内容后重试。')); }
    finally { setCreating(false); }
  };

  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected?.businessId || !editForm.personName.trim() || saving) return;
    setSaving(true); setError(null); setSuccess(null);
    try {
      const updated = await updateContact(selected.businessId, {
        personName: editForm.personName.trim(), email: editForm.email.trim() || null, phone: editForm.phone.trim() || null,
        jobTitle: editForm.jobTitle.trim() || null, linkedinUrl: editForm.linkedinUrl.trim() || null, accountBusinessId: editForm.accountBusinessId || null,
      });
      setContacts((current) => current.map((item) => item.businessId === updated.businessId ? updated : item));
      setSuccess(`联系人“${updated.personName}”已更新。`); setSelected(null);
    } catch (cause) { setError(userError(cause, '联系人更新失败，请检查填写内容后重试。')); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!selected?.businessId || deleting) return;
    if (!window.confirm(`确认删除联系人“${selected.personName}”？\n\n有关联任务、笔记或附件时系统会自动阻止删除。`)) return;
    const removedId = selected.businessId;
    setDeleting(true); setError(null); setSuccess(null);
    try {
      await deleteContact(removedId);
      setContacts((current) => current.filter((item) => item.businessId !== removedId));
      setSelected(null); setSuccess('联系人已删除。');
    } catch (cause) { setError(userError(cause, '联系人删除失败，请重试。')); }
    finally { setDeleting(false); }
  };

  if (session.status === 'initializing') return <Gate icon={IconUsers} title="正在加载联系人" detail="正在恢复企业登录状态…" />;
  if (session.status !== 'authenticated') return <Gate icon={IconUsers} title="登录后查看联系人" detail="登录企业账号后即可查看、新建和维护联系人。" action={<Button title="企业登录" onClick={() => void session.login('people')} />} error={session.error ? '企业登录暂时不可用，请稍后重试。' : null} />;

  const visibleError = error ?? loadError;
  return <section className="panel flush" data-surface="real-contact-wiring">
    <div className="object-toolbar"><div><h2>联系人</h2><p>{loading ? '正在加载…' : `${filtered.length} 位联系人 · 姓名、职位、邮箱、电话和公司关系${refreshing && !loading ? ' · 后台同步中' : ''}`}</p></div><div className="toolbar-actions"><button className="tool-button" onClick={refetch} disabled={refreshing}><IconRefresh size={15} /> {refreshing ? '同步中' : '刷新'}</button><button type="button" className="tool-button page-primary-action" onClick={() => { setCreateForm(EMPTY_FORM); setCreateOpen(true); }}><IconPlus size={15} /> 新建联系人</button></div></div>
    {visibleError && <div className="real-error" role="alert">{visibleError}</div>}
    {success && <div className="real-success" role="status">{success}</div>}

    {createOpen && <BusinessRecordModal title="新建联系人" description="录入联系人及其客户公司关系。" onClose={() => setCreateOpen(false)} width="medium"><ContactEditor title="新建联系人" form={createForm} setForm={setCreateForm} accountOptions={accountOptions} saving={creating} submitTitle={creating ? '创建中' : '创建'} onSubmit={submit} onCancel={() => setCreateOpen(false)} /></BusinessRecordModal>}
    {selected && <BusinessRecordModal title={selected.businessId ? '查看 / 编辑联系人' : '查看联系人'} description={selected.personName} onClose={() => setSelected(null)} width="medium"><ContactEditor title="联系人详情" form={editForm} setForm={setEditForm} accountOptions={accountOptions} saving={saving} submitTitle={saving ? '保存中' : '保存修改'} onSubmit={saveEdit} onCancel={() => setSelected(null)} readOnly={!selected.businessId} dangerAction={selected.businessId ? <button type="button" className="danger-text-button" disabled={deleting} onClick={() => void remove()}>{deleting ? '删除中…' : '删除联系人'}</button> : undefined} /></BusinessRecordModal>}

    <div className="table-wrap"><table><thead><tr><th className="crm-leading-action-column">操作</th><th>联系人</th><th>职位</th><th>邮箱 / 电话</th><th>客户公司</th></tr></thead><tbody>
      {filtered.map((contact, index) => <tr key={contact.businessId ?? `${contact.personName}-${contact.email ?? ''}-${index}`}><td className="crm-leading-action-column"><button className="text-action" onClick={() => openEditor(contact)}>{contact.businessId ? '查看 / 编辑' : '查看'}</button></td><td><strong>{contact.personName || '未命名联系人'}</strong></td><td>{contact.jobTitle || '—'}</td><td><span className="crm-cell-stack"><span>{contact.email || '—'}</span><small>{contact.phone || '—'}</small></span></td><td>{companyFor(contact)?.displayName || '—'}</td></tr>)}
      {!loading && filtered.length === 0 && <tr><td colSpan={5}><div className="real-empty">{search ? '没有匹配的联系人。' : '还没有联系人。点击“新建联系人”开始录入。'}</div></td></tr>}
    </tbody></table></div>
  </section>;
}

function ContactEditor({ title, form, setForm, accountOptions, saving, submitTitle, onSubmit, onCancel, readOnly = false, dangerAction }: { title: string; form: ContactForm; setForm: React.Dispatch<React.SetStateAction<ContactForm>>; accountOptions: BusinessRelationOption[]; saving: boolean; submitTitle: string; onSubmit: (event: React.FormEvent) => void; onCancel: () => void; readOnly?: boolean; dangerAction?: React.ReactNode }) {
  return <form className="crm-record-editor crm-contact-modal-form" onSubmit={onSubmit}><div className="crm-record-editor-fields">
    <label>姓名<input aria-label={`${title}姓名`} value={form.personName} onChange={(e) => setForm((current) => ({ ...current, personName: e.target.value }))} disabled={readOnly} autoFocus /></label>
    <label>职位 / 角色<input aria-label={`${title}职位`} value={form.jobTitle} onChange={(e) => setForm((current) => ({ ...current, jobTitle: e.target.value }))} disabled={readOnly} placeholder="老板 / 采购负责人 / 技术负责人" /></label>
    <label>邮箱<input aria-label={`${title}邮箱`} type="email" value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} disabled={readOnly} /></label>
    <label>电话 / WhatsApp<input aria-label={`${title}电话`} value={form.phone} onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))} disabled={readOnly} /></label>
    <label>LinkedIn<input aria-label={`${title}LinkedIn`} value={form.linkedinUrl} onChange={(e) => setForm((current) => ({ ...current, linkedinUrl: e.target.value }))} disabled={readOnly} /></label>
    <label>所属客户公司<BusinessRelationPicker ariaLabel={`${title}所属客户公司`} value={form.accountBusinessId} onChange={(value) => setForm((current) => ({ ...current, accountBusinessId: value }))} options={accountOptions} emptyLabel="未关联" searchPlaceholder="搜索客户公司（公司名、RUC、城市、行业…）" disabled={readOnly} /></label>
  </div>{!readOnly && <div className="crm-form-actions">{dangerAction}<Button title="取消" variant="secondary" size="small" type="button" onClick={onCancel} /><Button title={submitTitle} size="small" type="submit" disabled={!form.personName.trim() || saving} /></div>}</form>;
}
function Gate({ icon: Icon, title, detail, action, error }: { icon: React.ComponentType<{ size?: number }>; title: string; detail: string; action?: React.ReactNode; error?: string | null }) { return <section className="real-data-gate"><div className="real-data-gate-icon"><Icon size={22} /></div><div><h2>{title}</h2><p>{detail}</p>{error && <div className="real-error" role="alert">{error}</div>}{action && <div className="real-data-gate-action">{action}</div>}</div></section>; }
