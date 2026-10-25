import type { Opportunity } from "../gbap/crmPort";
import { Card, CardContent } from "./Card";

/**
 * Source-reuse provenance:
 * Adapted from marmelab/atomic-crm
 * src/components/atomic-crm/deals/DealCard.tsx
 * commit 167a4cdb652b1ab2b4b030831cfa7adcf2099321 (MIT).
 *
 * Atomic's ra-core RecordContext/ReferenceField, DnD and provider lookups are
 * intentionally removed. GBAP business semantics are passed as plain props.
 */
export function OpportunityCard({
  opportunity,
  onSelect,
}: {
  opportunity: Opportunity;
  onSelect: (opportunity: Opportunity) => void;
}) {
  return (
    <button
      className="opportunity-button"
      type="button"
      data-testid="opportunity-card"
      onClick={() => onSelect(opportunity)}
    >
      <Card className="opportunity-card">
        <CardContent>
          <div className="opportunity-heading">
            <p><strong>{opportunity.accountName}</strong> — {opportunity.name}</p>
            <span className="mini-avatar" aria-hidden="true">{opportunity.accountName.slice(0, 1)}</span>
          </div>
          <p className="opportunity-meta">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact" }).format(opportunity.amount)}
            {" · "}{opportunity.category}
          </p>
        </CardContent>
      </Card>
    </button>
  );
}
