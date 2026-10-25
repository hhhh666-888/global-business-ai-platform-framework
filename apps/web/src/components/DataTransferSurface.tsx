import type { GbapSession } from '../hooks/useGbapSession';
import { invalidateCrmEntities, prefetchCrmSurface } from '../lib/crmEntityQueries';
import { CompanyImportCenter } from './CompanyImportCenter';

type Props = { session: GbapSession };

export function DataTransferSurface({ session }: Props) {
  if (session.status !== 'authenticated') return null;

  const isSuperAdmin = session.identity?.roles.includes('substrate-admin') ?? false;
  if (!isSuperAdmin) {
    return (
      <section className="real-data-gate" data-testid="data-transfer-super-admin-only">
        <div>
          <h2>仅超级管理员可使用客户公司数据导入</h2>
          <p>客户公司批量导入会新增或更新正式 CRM 数据，因此只允许超级管理员执行。</p>
        </div>
      </section>
    );
  }

  const handleDataChanged = () => {
    invalidateCrmEntities(session, ['accounts', 'customer-intelligence', 'company-research-insights']);
    void prefetchCrmSurface(session, 'companies');
  };

  return <CompanyImportCenter session={session} onDataChanged={handleDataChanged} />;
}
