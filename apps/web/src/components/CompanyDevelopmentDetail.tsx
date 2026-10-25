import { useMemo } from 'react';
import type { CanonicalAccount, CanonicalContact, CanonicalOpportunity } from '../lib/crmBusinessClient';
import type { CustomerIntelligenceProfile } from '../lib/crmCustomerIntelligenceClient';
import {
  DEFAULT_NEXT_ACTIONS,
  DEVELOPMENT_STAGE_LABELS,
  DEVELOPMENT_STAGE_ORDER,
  DEVELOPMENT_STAGES,
  normalizeDevelopmentStage,
  type DevelopmentStage,
} from '../lib/crmDevelopmentStage';
import './company-development-detail.css';

type CompanyDevelopmentRecord = CanonicalAccount & Partial<CustomerIntelligenceProfile>;

type Props = {
  company: CompanyDevelopmentRecord;
  contacts: CanonicalContact[];
  opportunities: CanonicalOpportunity[];
};

type StageSummary = {
  key: DevelopmentStage;
  label: string;
  nextAction: string;
  opportunity: CanonicalOpportunity | null;
};

export { DEVELOPMENT_STAGES };

const PRIORITY_LABELS: Record<string, string> = { HIGH: '高', MEDIUM: '中', LOW: '低' };

function opportunityStage(opportunity: CanonicalOpportunity | null): DevelopmentStage {
  if (!opportunity) return 'NEW';
  return normalizeDevelopmentStage(opportunity.tradeStage ?? opportunity.pipelineStage ?? 'NEW');
}

export function resolveCompanyDevelopmentStage(company: CompanyDevelopmentRecord, opportunities: CanonicalOpportunity[]): DevelopmentStage {
  if (company.developmentStage) return normalizeDevelopmentStage(company.developmentStage);
  if (opportunities.length === 0) return 'NEW';
  const selected = [...opportunities].sort((a, b) => {
    const stageA = opportunityStage(a);
    const stageB = opportunityStage(b);
    return (DEVELOPMENT_STAGE_ORDER[stageB] ?? -1) - (DEVELOPMENT_STAGE_ORDER[stageA] ?? -1);
  })[0];
  return opportunityStage(selected);
}

function stageSummary(company: CompanyDevelopmentRecord, opportunities: CanonicalOpportunity[]): StageSummary {
  const key = resolveCompanyDevelopmentStage(company, opportunities);
  const selected = opportunities.length === 0 ? null : [...opportunities].sort((a, b) => {
    const stageA = opportunityStage(a);
    const stageB = opportunityStage(b);
    return (DEVELOPMENT_STAGE_ORDER[stageB] ?? -1) - (DEVELOPMENT_STAGE_ORDER[stageA] ?? -1);
  })[0];
  return {
    key,
    label: DEVELOPMENT_STAGE_LABELS[key],
    nextAction: selected?.nextStep?.trim() || DEFAULT_NEXT_ACTIONS[key],
    opportunity: selected,
  };
}

function resolveSalesOwner(company: CompanyDevelopmentRecord) {
  const manual = company.profile75Overrides?.['销售负责人'];
  if (manual !== undefined) return manual?.trim() || '待分配';
  return company.accountOwnerUserId?.trim() || '待分配';
}

export function CompanyDevelopmentDetail({ company, contacts, opportunities }: Props) {
  const stage = useMemo(() => stageSummary(company, opportunities), [company, opportunities]);
  const visibleStageIndex = DEVELOPMENT_STAGES.findIndex((item) => item.key === stage.key);
  const salesOwner = resolveSalesOwner(company);

  return <div className="company-drawer-body" data-testid="company-development-detail" data-development-stage={stage.key} data-stage-count={DEVELOPMENT_STAGES.length}>
    <section className="company-related-section development-progress-section">
      <div className="company-section-title"><h4>客户开发进度</h4></div>
      {stage.key === 'ON_HOLD' && <div className="development-hold-banner">当前进度：暂停跟进 · {stage.nextAction}</div>}
      <div className="development-stepper" aria-label="客户开发阶段">
        {DEVELOPMENT_STAGES.map((item, index) => {
          const state = stage.key === 'ON_HOLD'
            ? item.key === 'ON_HOLD' ? 'current' : 'future'
            : item.key === 'ON_HOLD' ? 'future' : index < visibleStageIndex ? 'done' : index === visibleStageIndex ? 'current' : 'future';
          return <div className="development-step-wrap" key={item.key}>
            <div className={`development-step ${state}`} aria-current={state === 'current' ? 'step' : undefined} data-stage-key={item.key}>
              <span className="development-step-index">{index + 1}</span>
              <strong>{item.label}</strong>
              <small>{item.hint}</small>
              <em>{state === 'done' ? '已完成' : state === 'current' ? '当前进度' : '待推进'}</em>
            </div>
            {index < DEVELOPMENT_STAGES.length - 1 && <span className={`development-step-arrow ${state === 'done' ? 'done' : ''}`} aria-hidden="true">→</span>}
          </div>;
        })}
      </div>
      <div className="development-current-action">
        <span>下一步动作</span>
        <strong>{stage.nextAction}</strong>
        {stage.opportunity?.nameSummary && <small>当前商机：{stage.opportunity.nameSummary}</small>}
      </div>
    </section>

    <div className="customer-intelligence-kpis">
      <div><span>开发进度</span><strong>{stage.label}</strong></div>
      <div><span>销售负责人</span><strong>{salesOwner}</strong></div>
      <div><span>客户优先级</span><strong>{company.priority ? PRIORITY_LABELS[company.priority] ?? company.priority : '待设置'}</strong></div>
      <div><span>有效联系人</span><strong>{contacts.length}</strong></div>
      <div><span>关联商机</span><strong>{opportunities.length}</strong></div>
    </div>

    <section className="company-related-section">
      <div className="company-section-title"><h4>商机推进</h4></div>
      <div className="company-opportunity-list">
        {opportunities.map((opportunity) => <div key={opportunity.businessId ?? opportunity.nameSummary} className="company-opportunity-row">
          <div><strong>{opportunity.nameSummary}</strong><small>{DEVELOPMENT_STAGE_LABELS[opportunityStage(opportunity)]}</small></div>
          <span>{opportunity.estimatedValue === null ? '未估值' : `${opportunity.currencyCode ?? 'USD'} ${opportunity.estimatedValue.toLocaleString('zh-CN')}`}</span>
        </div>)}
        {opportunities.length === 0 && <div className="related-empty">尚未建立商机。确认真实需求后再建立商机并继续推进。</div>}
      </div>
    </section>
  </div>;
}
