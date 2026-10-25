import { useEffect, useState } from 'react';
import { listAccounts, listContacts, listOpportunities } from '../lib/crmBusinessClient';
import { BusinessRelationPicker, type BusinessRelationOption } from './BusinessRelationPicker';

export function KnowledgeBusinessLinkPicker({ type, value, onChange }: { type: 'Account' | 'Contact' | 'Opportunity'; value: string; onChange: (value: string) => void }) {
  const [options, setOptions] = useState<BusinessRelationOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setOptions([]); setLoading(true); setError(false);
    const load = async () => {
      if (type === 'Account') return (await listAccounts(1000)).filter(item => item.businessId).map(item => ({ key: item.businessId!, label: item.displayName }));
      if (type === 'Contact') return (await listContacts(1000)).filter(item => item.businessId).map(item => ({ key: item.businessId!, label: item.personName }));
      return (await listOpportunities(1000)).filter(item => item.businessId).map(item => ({ key: item.businessId!, label: item.nameSummary }));
    };
    void load().then(items => { if (active) setOptions(items); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [type]);
  return <div><BusinessRelationPicker ariaLabel="选择关联业务记录" value={value} onChange={onChange} options={options} disabled={loading || error} emptyLabel="选择业务记录" searchPlaceholder="搜索名称…" />{loading && <small role="status">正在加载记录…</small>}{error && <small role="alert">业务记录暂时无法加载，请刷新后重试。</small>}</div>;
}
