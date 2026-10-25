import { useMemo, useState } from "react";
import type { Account } from "../gbap/crmPort";
import { Card, CardContent } from "./Card";

/**
 * Source-reuse provenance:
 * Layout adapted from marmelab/atomic-crm
 * src/components/atomic-crm/companies/CompanyList.tsx
 * commit 167a4cdb652b1ab2b4b030831cfa7adcf2099321 (MIT).
 *
 * Atomic's ra-core List/useListContext and provider assumptions are removed.
 * Data is supplied by GBAP's CrmReadPort instead.
 */
export function AccountList({ accounts }: { accounts: Account[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return accounts;
    return accounts.filter((account) =>
      [account.name, account.sector, account.country].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [accounts, query]);

  return (
    <section className="surface" aria-labelledby="accounts-heading">
      <div className="surface-toolbar">
        <div>
          <p className="eyebrow">Accounts</p>
          <h2 id="accounts-heading">客户账户</h2>
        </div>
        <input
          aria-label="筛选客户账户"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="公司 / 行业 / 国家"
        />
      </div>
      <div className="account-grid" data-testid="account-list">
        {filtered.map((account) => (
          <Card key={account.id} className="account-card" data-testid="account-card">
            <CardContent>
              <div className="avatar" aria-hidden="true">{account.name.slice(0, 1)}</div>
              <div>
                <strong>{account.name}</strong>
                <p>{account.sector} · {account.country}</p>
                <span>{account.contacts} contacts</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
