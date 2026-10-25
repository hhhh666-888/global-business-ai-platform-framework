import { useEffect, useState } from 'react';
import type { CrmRuntimeField } from '../lib/crmRuntimeClient';
import { CrmRuntimeRelationPicker } from './CrmRuntimeRelationPicker';
import { currencyAmountInput, dateTimeLocalToIso, dateTimeLocalValue, richTextMarkdown } from '../lib/recordFieldValues';

function fieldOptions(field: CrmRuntimeField) {
  return (Array.isArray(field.options) ? field.options : []).map((item) => typeof item === 'string' ? { label: item, value: item } : {
    label: String((item as { label?: unknown }).label ?? (item as { value?: unknown }).value ?? ''),
    value: String((item as { value?: unknown }).value ?? (item as { label?: unknown }).label ?? ''),
  }).filter((item) => item.value);
}
function rowValue(value: unknown) {
  return (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
}
function stringArray(value: unknown) { return Array.isArray(value) ? value.map(String) : []; }

type Props = { field: CrmRuntimeField; value: unknown; onChange: (value: unknown) => void; disabled?: boolean };

function DateTimeField({ caption, value, onChange, disabled }: { caption: string; value: unknown; onChange: Props['onChange']; disabled: boolean }) {
  const [draft, setDraft] = useState(() => dateTimeLocalValue(value));
  useEffect(() => setDraft(dateTimeLocalValue(value)), [value]);
  return <label>{caption}<input disabled={disabled} type="datetime-local" value={draft} onChange={(event) => {
    const input = event.currentTarget;
    const next = dateTimeLocalToIso(input.value);
    setDraft(input.value);
    input.setCustomValidity(input.value && !next ? '此时间在当前时区不可用，请重新选择。' : '');
    if (!input.value || next) onChange(next);
  }}/></label>;
}

export function CrmRuntimeFieldInput({ field, value, onChange, disabled = false }: Props) {
  const caption = `${field.label}${field.nullable ? '' : ' *'}`;
  if (field.relation) return <label>{caption}<CrmRuntimeRelationPicker field={field} value={value} onChange={onChange} disabled={disabled}/><small>{field.description || '选择需要关联的业务记录。'}</small></label>;
  if (field.type === 'BOOLEAN') return <label className="rtw-check"><input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(event) => onChange(event.target.checked)}/>{caption}</label>;
  if (field.type === 'SELECT') return <label>{caption}<select disabled={disabled} value={String(value ?? '')} onChange={(event) => onChange(event.target.value || null)}><option value="">未选择</option>{fieldOptions(field).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>;
  if (field.type === 'MULTI_SELECT') return <label>{caption}<select multiple disabled={disabled} value={Array.isArray(value) ? value.map(String) : []} onChange={(event) => onChange([...event.target.selectedOptions].map((option) => option.value))}>{fieldOptions(field).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>;
  if (field.type === 'FULL_NAME') {
    const row = rowValue(value);
    return <fieldset><legend>{caption}</legend><input disabled={disabled} placeholder="名" value={String(row.firstName ?? '')} onChange={(event) => onChange({ ...row, firstName: event.target.value })}/><input disabled={disabled} placeholder="姓" value={String(row.lastName ?? '')} onChange={(event) => onChange({ ...row, lastName: event.target.value })}/></fieldset>;
  }
  if (field.type === 'EMAILS') {
    const row = rowValue(value); const additional = stringArray(row.additionalEmails);
    return <fieldset className="rtw-multi-field"><legend>{caption}</legend>
      <input disabled={disabled} type="email" placeholder="主邮箱" value={String(row.primaryEmail ?? '')} onChange={(event) => onChange({ ...row, primaryEmail: event.target.value, additionalEmails: additional })}/>
      {additional.map((item, index) => <div key={index}><input disabled={disabled} type="email" placeholder="其他邮箱" value={item} onChange={(event) => onChange({ ...row, additionalEmails: additional.map((email, i) => i === index ? event.target.value : email) })}/><button type="button" disabled={disabled} onClick={() => onChange({ ...row, additionalEmails: additional.filter((_, i) => i !== index) })}>移除</button></div>)}
      <button type="button" disabled={disabled} onClick={() => onChange({ ...row, additionalEmails: [...additional, ''] })}>+ 其他邮箱</button>
    </fieldset>;
  }
  if (field.type === 'PHONES') {
    const row = rowValue(value);
    const additional = (Array.isArray(row.additionalPhones) ? row.additionalPhones : []).map((item) => (item && typeof item === 'object' ? item as Record<string, unknown> : { number: String(item ?? ''), callingCode: '', countryCode: '' }));
    return <fieldset className="rtw-multi-field"><legend>{caption}</legend>
      <input disabled={disabled} placeholder="主电话，例如 +593999000000" value={`${row.primaryPhoneCallingCode ?? ''}${row.primaryPhoneNumber ?? ''}`} onChange={(event) => onChange({ ...row, primaryPhoneNumber: event.target.value, primaryPhoneCallingCode: '', primaryPhoneCountryCode: '', additionalPhones: additional })}/>
      {additional.map((item, index) => <div key={index}><input disabled={disabled} placeholder="其他电话" value={`${item.callingCode ?? ''}${item.number ?? ''}`} onChange={(event) => onChange({ ...row, additionalPhones: additional.map((phone, i) => i === index ? { ...phone, number: event.target.value, callingCode: '', countryCode: '' } : phone) })}/><button type="button" disabled={disabled} onClick={() => onChange({ ...row, additionalPhones: additional.filter((_, i) => i !== index) })}>移除</button></div>)}
      <button type="button" disabled={disabled} onClick={() => onChange({ ...row, additionalPhones: [...additional, { number: '', callingCode: '', countryCode: '' }] })}>+ 其他电话</button>
    </fieldset>;
  }
  if (field.type === 'LINKS' || field.type === 'DOMAIN') {
    const row = rowValue(value);
    const secondary = (Array.isArray(row.secondaryLinks) ? row.secondaryLinks : []).map((item) => (item && typeof item === 'object' ? item as Record<string, unknown> : { label: '', url: String(item ?? '') }));
    return <fieldset className="rtw-multi-field"><legend>{caption}</legend>
      <div><input disabled={disabled} placeholder="主链接名称" value={String(row.primaryLinkLabel ?? '')} onChange={(event) => onChange({ ...row, primaryLinkLabel: event.target.value, secondaryLinks: secondary })}/><input disabled={disabled} placeholder="https://" value={String(row.primaryLinkUrl ?? '')} onChange={(event) => onChange({ ...row, primaryLinkUrl: event.target.value, secondaryLinks: secondary })}/></div>
      {secondary.map((item, index) => <div key={index}><input disabled={disabled} placeholder="名称" value={String(item.label ?? '')} onChange={(event) => onChange({ ...row, secondaryLinks: secondary.map((link, i) => i === index ? { ...link, label: event.target.value } : link) })}/><input disabled={disabled} placeholder="https://" value={String(item.url ?? '')} onChange={(event) => onChange({ ...row, secondaryLinks: secondary.map((link, i) => i === index ? { ...link, url: event.target.value } : link) })}/><button type="button" disabled={disabled} onClick={() => onChange({ ...row, secondaryLinks: secondary.filter((_, i) => i !== index) })}>移除</button></div>)}
      <button type="button" disabled={disabled} onClick={() => onChange({ ...row, secondaryLinks: [...secondary, { label: '', url: '' }] })}>+ 其他链接</button>
    </fieldset>;
  }
  if (field.type === 'CURRENCY') {
    const row = rowValue(value);
    return <fieldset><legend>{caption}</legend><input disabled={disabled} type="number" step="any" placeholder="金额" value={currencyAmountInput(row.amountMicros)} onChange={(event) => onChange({ ...row, amountMicros: event.target.value ? Math.round(Number(event.target.value) * 1_000_000) : null, currencyCode: String(row.currencyCode ?? 'USD') })}/><input disabled={disabled} maxLength={3} placeholder="USD" value={String(row.currencyCode ?? 'USD')} onChange={(event) => onChange({ ...row, currencyCode: event.target.value.toUpperCase() })}/></fieldset>;
  }
  if (field.type === 'ADDRESS') {
    const row = rowValue(value);
    const fields = [['addressCountry', '国家'], ['addressState', '省 / 州'], ['addressCity', '城市'], ['addressStreet1', '街道'], ['addressStreet2', '详细地址'], ['addressPostcode', '邮编']] as const;
    return <fieldset><legend>{caption}</legend>{fields.map(([key, placeholder]) => <input key={key} disabled={disabled} placeholder={placeholder} value={String(row[key] ?? '')} onChange={(event) => onChange({ ...row, [key]: event.target.value })}/>)}</fieldset>;
  }
  if (field.type === 'RICH_TEXT') return <label className="wide">{caption}<textarea aria-label={caption} disabled={disabled} rows={5} value={richTextMarkdown(value)} onChange={(event) => onChange({ markdown: event.target.value, blocknote: null })}/><small>{field.description}</small></label>;
  if (field.type === 'LONG_TEXT') return <label className="wide">{caption}<textarea aria-label={caption} disabled={disabled} rows={5} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}/><small>{field.description}</small></label>;
  if (['RAW_JSON', 'JSON'].includes(field.type)) return <label className="wide">{caption}<textarea disabled={disabled} rows={5} value={typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2)} onChange={(event) => { try { onChange(JSON.parse(event.target.value)); } catch { onChange(event.target.value); } }}/></label>;
  if (field.type === 'DATE') return <label>{caption}<input disabled={disabled} type="date" value={String(value ?? '').slice(0, 10)} onChange={(event) => onChange(event.target.value || null)}/></label>;
  if (field.type === 'DATE_TIME') return <DateTimeField key={field.fieldKey} caption={caption} value={value} onChange={onChange} disabled={disabled}/>;
  if (['NUMBER', 'RATING'].includes(field.type)) return <label>{caption}<input disabled={disabled} type="number" step={field.type === 'RATING' ? 1 : 'any'} value={value == null ? '' : String(value)} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}/></label>;
  return <label>{caption}<input disabled={disabled} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}/><small>{field.description}</small></label>;
}
