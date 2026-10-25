export type Account = {
  id: string;
  name: string;
  sector: string;
  country: string;
  contacts: number;
};

export type OpportunityStage = "Qualified" | "Solution" | "Proposal";

export type Opportunity = {
  id: string;
  accountId: string;
  accountName: string;
  name: string;
  amount: number;
  category: string;
  stage: OpportunityStage;
};

/**
 * GBAP-owned CRM read contract.
 *
 * The UI is allowed to depend on this business-semantic boundary. It is not
 * allowed to depend on Atomic CRM persistence, Supabase, or any CRM vendor API.
 */
export interface CrmReadPort {
  listAccounts(): Account[];
  listOpportunities(): Opportunity[];
}
