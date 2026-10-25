import { api } from './gbapClient';

export type ForeignTradeStage =
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFYING'
  | 'NEEDS_CONFIRMED'
  | 'TECHNICAL_SAMPLE'
  | 'QUOTATION'
  | 'NEGOTIATION'
  | 'DECISION'
  | 'ORDER_PENDING'
  | 'ON_HOLD'
  | 'ORDER_CONFIRMED';

export type OpportunityProfile = {
  businessId: string;
  tradeStage: ForeignTradeStage | null;
  profileUpdatedAt: string | null;
};

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

export async function listOpportunityProfiles() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return (await api<{ profiles: OpportunityProfile[] }>('/api/crm-native/opportunity-profiles')).profiles;
    } catch (cause) {
      const status = (cause as { status?: number } | null)?.status;
      if (status === 404 || status === 421) return [];
      if (![502, 503, 504].includes(status ?? 0)) throw cause;
      if (attempt < 2) { await sleep(100 * (attempt + 1)); continue; }
      return [];
    }
  }
  return [];
}

export async function updateOpportunityProfile(businessId: string, tradeStage: ForeignTradeStage) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return (await api<{ profile: OpportunityProfile }>(`/api/crm-native/opportunity-profiles/${encodeURIComponent(businessId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ tradeStage }),
      })).profile;
    } catch (cause) {
      const status = (cause as { status?: number } | null)?.status;
      if (![502, 503, 504].includes(status ?? 0) || attempt === 2) throw cause;
      await sleep(100 * (attempt + 1));
    }
  }
  throw new Error('opportunity_profile_update_failed');
}
