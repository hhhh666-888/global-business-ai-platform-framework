import { useMemo, useState } from "react";
import { AccountList } from "./atomic-reuse/AccountList";
import { OpportunityCard } from "./atomic-reuse/OpportunityCard";
import type { Opportunity, OpportunityStage } from "./gbap/crmPort";
import { mockCrmPort } from "./gbap/mockCrmPort";

const stages: OpportunityStage[] = ["Qualified", "Solution", "Proposal"];
const upstreamCommit = "167a4cdb652b1ab2b4b030831cfa7adcf2099321";

export function App() {
  const accounts = useMemo(() => mockCrmPort.listAccounts(), []);
  const opportunities = useMemo(() => mockCrmPort.listOpportunities(), []);
  const [view, setView] = useState<"accounts" | "pipeline">("accounts");
  const [selected, setSelected] = useState<Opportunity | null>(null);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="brand-row">
            <span className="brand-mark">FG</span>
            <div>
              <h1>GBAP CRM</h1>
              <p>Native UI source-reuse PoU</p>
            </div>
          </div>
        </div>
        <span className="boundary-badge">GBAP-owned CrmReadPort</span>
      </header>

      <main>
        <section className="hero-panel">
          <div>
            <p className="eyebrow">Stage 3.4 · PoU-B</p>
            <h2>CRM UI 可以复用，业务契约必须属于 GBAP。</h2>
            <p>
              这里复用 Atomic CRM 的 MIT UI/source 结构，但数据来自 GBAP 自己的端口；没有 Supabase、没有 Atomic iframe、没有外部 CRM 页面。
            </p>
          </div>
          <div className="provenance" data-testid="source-provenance">
            <span>Atomic CRM source provenance</span>
            <code>{upstreamCommit.slice(0, 12)}…</code>
          </div>
        </section>

        <nav className="view-tabs" aria-label="CRM views">
          <button className={view === "accounts" ? "active" : ""} type="button" data-testid="accounts-tab" onClick={() => setView("accounts")}>客户账户</button>
          <button className={view === "pipeline" ? "active" : ""} type="button" data-testid="pipeline-tab" onClick={() => setView("pipeline")}>销售管道</button>
        </nav>

        {view === "accounts" ? (
          <AccountList accounts={accounts} />
        ) : (
          <section className="surface" aria-labelledby="pipeline-heading">
            <div className="surface-toolbar">
              <div>
                <p className="eyebrow">Opportunities</p>
                <h2 id="pipeline-heading">销售机会管道</h2>
              </div>
              <span>{opportunities.length} active opportunities</span>
            </div>
            <div className="pipeline" data-testid="pipeline">
              {stages.map((stage) => (
                <div className="pipeline-column" key={stage}>
                  <div className="column-title">
                    <strong>{stage}</strong>
                    <span>{opportunities.filter((item) => item.stage === stage).length}</span>
                  </div>
                  {opportunities
                    .filter((item) => item.stage === stage)
                    .map((opportunity) => (
                      <OpportunityCard key={opportunity.id} opportunity={opportunity} onSelect={setSelected} />
                    ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {selected ? (
          <aside className="detail-panel" data-testid="opportunity-detail" aria-label="Selected opportunity">
            <button className="close-button" type="button" aria-label="关闭详情" onClick={() => setSelected(null)}>×</button>
            <p className="eyebrow">Opportunity detail</p>
            <h2>{selected.name}</h2>
            <p>{selected.accountName}</p>
            <dl>
              <div><dt>Stage</dt><dd>{selected.stage}</dd></div>
              <div><dt>Category</dt><dd>{selected.category}</dd></div>
              <div><dt>Value</dt><dd>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(selected.amount)}</dd></div>
            </dl>
          </aside>
        ) : null}
      </main>
    </div>
  );
}
