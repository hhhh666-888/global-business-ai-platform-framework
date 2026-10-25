import type { Account, CrmReadPort, Opportunity } from "./crmPort";

const accounts: Account[] = [
  { id: "acct-ecuador", name: "Andes Plastics", sector: "Industrial", country: "Ecuador", contacts: 4 },
  { id: "acct-philippines", name: "Pacific Cold Chain", sector: "Logistics", country: "Philippines", contacts: 3 },
  { id: "acct-tanzania", name: "Kilimanjaro Mining", sector: "Mining", country: "Tanzania", contacts: 6 },
];

const opportunities: Opportunity[] = [
  { id: "opp-1", accountId: "acct-ecuador", accountName: "Andes Plastics", name: "Solar + BESS retrofit", amount: 1280000, category: "Integrated Energy", stage: "Qualified" },
  { id: "opp-2", accountId: "acct-philippines", accountName: "Pacific Cold Chain", name: "Backup microgrid", amount: 760000, category: "Microgrid", stage: "Solution" },
  { id: "opp-3", accountId: "acct-tanzania", accountName: "Kilimanjaro Mining", name: "Mine power reliability", amount: 2150000, category: "Power System", stage: "Proposal" },
  { id: "opp-4", accountId: "acct-ecuador", accountName: "Andes Plastics", name: "Generator replacement", amount: 420000, category: "Generation", stage: "Proposal" },
];

export const mockCrmPort: CrmReadPort = {
  listAccounts: () => accounts,
  listOpportunities: () => opportunities,
};
