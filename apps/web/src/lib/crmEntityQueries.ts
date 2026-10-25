import type { GbapSession } from '../hooks/useGbapSession';
import {
  listAccounts,
  listContacts,
  listOpportunities,
  type CanonicalAccount,
  type CanonicalContact,
  type CanonicalOpportunity,
} from './crmBusinessClient';
import {
  listCustomerIntelligenceProfiles,
  type CustomerIntelligenceProfile,
} from './crmCustomerIntelligenceClient';
import {
  listCompanyResearchInsights,
  type CompanyResearchInsight,
} from './crmCompanyResearchInsightsClient';
import {
  listActivity,
  listCrmFiles,
  listNotes,
  listTasks,
  type CrmActivity,
  type CrmFile,
  type CrmNote,
  type CrmTask,
  type OperationalTarget,
} from './gbapClient';
import { actorQueryKey, invalidateGbapQuery, prefetchGbapQuery, useGbapQuery } from './queryCache';

export const CRM_ENTITY_LIST_LIMIT = 1000;
export const CRM_ACTIVITY_LIST_LIMIT = 300;
export type CrmFilesSnapshot = { files: CrmFile[]; maxFileBytes: number };
export type CrmPrefetchPage = 'home' | 'companies' | 'people' | 'opportunities' | 'tasks' | 'notes' | 'files' | 'dashboards';
type LinkedCustomerIntelligenceProfile = CustomerIntelligenceProfile & { businessId: string };
type CustomerIntelligenceUpdater =
  | CustomerIntelligenceProfile[]
  | ((current: CustomerIntelligenceProfile[] | undefined) => CustomerIntelligenceProfile[] | undefined);

function actorKey(session: GbapSession) {
  return session.status === 'authenticated' ? (session.identity?.subject ?? 'authenticated') : session.status;
}

function enabled(session: GbapSession, queryEnabled = true) {
  return session.status === 'authenticated' && queryEnabled;
}

function crmKey(session: GbapSession, entity: string) {
  return actorQueryKey(actorKey(session), 'crm', entity);
}

function linkCustomerIntelligenceProfiles(profiles: CustomerIntelligenceProfile[] | undefined) {
  if (!profiles) return undefined;
  return profiles.filter((profile): profile is LinkedCustomerIntelligenceProfile => Boolean(profile.businessId));
}

function linkedCustomerIntelligenceProfiles() {
  return listCustomerIntelligenceProfiles()
    .then((profiles) => linkCustomerIntelligenceProfiles(profiles) ?? [])
    .catch(() => [] as LinkedCustomerIntelligenceProfile[]);
}

export function useCrmAccountsQuery(session: GbapSession, queryEnabled = true) {
  return useGbapQuery<CanonicalAccount[]>({
    queryKey: crmKey(session, 'accounts'),
    enabled: enabled(session, queryEnabled),
    queryFn: () => listAccounts(CRM_ENTITY_LIST_LIMIT),
  });
}

export function useCrmContactsQuery(session: GbapSession, queryEnabled = true) {
  return useGbapQuery<CanonicalContact[]>({
    queryKey: crmKey(session, 'contacts'),
    enabled: enabled(session, queryEnabled),
    queryFn: () => listContacts(CRM_ENTITY_LIST_LIMIT),
  });
}

export function useCrmOpportunitiesQuery(session: GbapSession, queryEnabled = true) {
  return useGbapQuery<CanonicalOpportunity[]>({
    queryKey: crmKey(session, 'opportunities'),
    enabled: enabled(session, queryEnabled),
    queryFn: () => listOpportunities(CRM_ENTITY_LIST_LIMIT),
  });
}

export function useCrmTasksQuery(session: GbapSession, queryEnabled = true) {
  return useGbapQuery<CrmTask[]>({
    queryKey: crmKey(session, 'tasks'),
    enabled: enabled(session, queryEnabled),
    queryFn: () => listTasks(CRM_ENTITY_LIST_LIMIT),
  });
}

export function useCrmNotesQuery(session: GbapSession, queryEnabled = true) {
  return useGbapQuery<CrmNote[]>({
    queryKey: crmKey(session, 'notes'),
    enabled: enabled(session, queryEnabled),
    queryFn: () => listNotes(CRM_ENTITY_LIST_LIMIT),
  });
}

export function useCrmActivityQuery(session: GbapSession, queryEnabled = true) {
  return useGbapQuery<CrmActivity[]>({
    queryKey: crmKey(session, 'activity'),
    enabled: enabled(session, queryEnabled),
    queryFn: () => listActivity(CRM_ACTIVITY_LIST_LIMIT),
  });
}

function filesEntity(target?: OperationalTarget) {
  return target ? `files:${target.businessType}:${target.businessId}` : 'files';
}

export function invalidateCrmFiles(session: GbapSession, target?: OperationalTarget | null) {
  invalidateGbapQuery(crmKey(session, 'files'));
  if (target) invalidateGbapQuery(crmKey(session, filesEntity(target)));
}

export function useCrmFilesQuery(session: GbapSession, queryEnabled = true, target?: OperationalTarget) {
  return useGbapQuery<CrmFilesSnapshot>({
    queryKey: crmKey(session, filesEntity(target)),
    enabled: enabled(session, queryEnabled),
    queryFn: () => listCrmFiles(target),
  });
}

export function useCrmCustomerIntelligenceQuery(session: GbapSession, queryEnabled = true) {
  const query = useGbapQuery<LinkedCustomerIntelligenceProfile[]>({
    queryKey: crmKey(session, 'customer-intelligence'),
    enabled: enabled(session, queryEnabled),
    queryFn: linkedCustomerIntelligenceProfiles,
  });
  const setData = (updater: CustomerIntelligenceUpdater) => query.setData((current) => {
    const next = typeof updater === 'function' ? updater(current) : updater;
    return linkCustomerIntelligenceProfiles(next);
  });
  return { ...query, setData };
}

export function useCrmCompanyResearchInsightsQuery(session: GbapSession, queryEnabled = true) {
  return useGbapQuery<CompanyResearchInsight[]>({
    queryKey: crmKey(session, 'company-research-insights'),
    enabled: enabled(session, queryEnabled),
    queryFn: () => listCompanyResearchInsights().catch(() => []),
  });
}

function prefetchAccounts(session: GbapSession) {
  return prefetchGbapQuery({ queryKey: crmKey(session, 'accounts'), queryFn: () => listAccounts(CRM_ENTITY_LIST_LIMIT) });
}
function prefetchContacts(session: GbapSession) {
  return prefetchGbapQuery({ queryKey: crmKey(session, 'contacts'), queryFn: () => listContacts(CRM_ENTITY_LIST_LIMIT) });
}
function prefetchOpportunities(session: GbapSession) {
  return prefetchGbapQuery({ queryKey: crmKey(session, 'opportunities'), queryFn: () => listOpportunities(CRM_ENTITY_LIST_LIMIT) });
}
function prefetchTasks(session: GbapSession) {
  return prefetchGbapQuery({ queryKey: crmKey(session, 'tasks'), queryFn: () => listTasks(CRM_ENTITY_LIST_LIMIT) });
}
function prefetchNotes(session: GbapSession) {
  return prefetchGbapQuery({ queryKey: crmKey(session, 'notes'), queryFn: () => listNotes(CRM_ENTITY_LIST_LIMIT) });
}
function prefetchActivity(session: GbapSession) {
  return prefetchGbapQuery({ queryKey: crmKey(session, 'activity'), queryFn: () => listActivity(CRM_ACTIVITY_LIST_LIMIT) });
}
function prefetchFiles(session: GbapSession) {
  return prefetchGbapQuery({ queryKey: crmKey(session, 'files'), queryFn: listCrmFiles });
}
function prefetchIntelligence(session: GbapSession) {
  return prefetchGbapQuery({ queryKey: crmKey(session, 'customer-intelligence'), queryFn: linkedCustomerIntelligenceProfiles });
}
function prefetchResearchInsights(session: GbapSession) {
  return prefetchGbapQuery({ queryKey: crmKey(session, 'company-research-insights'), queryFn: () => listCompanyResearchInsights().catch(() => []) });
}

export async function prefetchCrmSurface(session: GbapSession, page: CrmPrefetchPage) {
  if (session.status !== 'authenticated') return;
  const loaders: Array<() => Promise<unknown>> = [];
  if (['companies', 'people', 'opportunities', 'tasks', 'notes', 'files', 'dashboards'].includes(page)) loaders.push(() => prefetchAccounts(session));
  if (['companies', 'people', 'tasks', 'notes', 'files', 'dashboards'].includes(page)) loaders.push(() => prefetchContacts(session));
  if (['home', 'companies', 'opportunities', 'tasks', 'notes', 'files', 'dashboards'].includes(page)) loaders.push(() => prefetchOpportunities(session));
  if (['home', 'tasks', 'dashboards'].includes(page)) loaders.push(() => prefetchTasks(session));
  if (page === 'notes') loaders.push(() => prefetchNotes(session));
  if (['home', 'notes'].includes(page)) loaders.push(() => prefetchActivity(session));
  if (page === 'files') loaders.push(() => prefetchFiles(session));
  if (page === 'companies') {
    loaders.push(() => prefetchIntelligence(session));
    loaders.push(() => prefetchResearchInsights(session));
  }
  await Promise.all(loaders.map((load) => load().catch(() => undefined)));
}

export function invalidateCrmEntities(session: GbapSession, entities: string[]) {
  entities.forEach((entity) => invalidateGbapQuery(crmKey(session, entity)));
}
