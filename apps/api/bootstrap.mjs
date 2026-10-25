import http from 'node:http';
import { createCrmRuntimeCommunicationHandler } from './crm-runtime-communication.mjs';
import { createCrmRuntimeDeepHandler } from './crm-runtime-deep.mjs';
import { createCrmRuntimeAdvancedHandler } from './crm-runtime-advanced.mjs';
import { createPublicCrmRuntimeHandler } from './crm-runtime-public.mjs';
import { createCrmNativeHandler } from './crm-native.mjs';
import { createCrmRecordLifecycleHandler } from './crm-record-lifecycle.mjs';
import { createCrmAdminBulkHandler } from './crm-admin-bulk.mjs';
import { createCrmSiteHandler } from './crm-site.mjs';
import { createCrmTargetRoleHandler } from './crm-target-role.mjs';
import { createResearchSiteExecutionHandler } from './research-site-execution.mjs';
import { createResearchContactExecutionHandler } from './research-contact-execution.mjs';
import { createResearchEnrichmentExecutionHandler } from './research-enrichment-execution.mjs';
import { createResearchAuthoritativeProfileHandler } from './research-authoritative-profile.mjs';
import { createCompanyResearchVisibilityHandler } from './company-research-visibility.mjs';
import { createResearchIntakeChunkExecutionHandler } from './research-intake-chunk-execution.mjs';
import { createResearchIntakeAdoptionExecutionHandler } from './research-intake-adoption.mjs';
import { createResearchIntakeNativeHandler } from './research-intake-native.mjs';
import { createResearchCompanyProfileHandler } from './research-company-profile.mjs';
import { reconcileHistoricalResearchImports } from './research-import-reconcile.mjs';
import { createCustomerIntelligenceHandler } from './customer-intelligence.mjs';
import { createOpportunityProfileHandler } from './opportunity-profile.mjs';
import { createCalendarNativeHandler } from './calendar-native.mjs';
import { createCompanyImportNativeHandler } from './company-import-native.mjs';
import { createUserPreferencesHandler } from './user-preferences.mjs';
import { createMcpNativeHandler } from './mcp-native.mjs';
import { createKnowledgeNativeHandler, reconcileKnowledgeIngestionBatch } from './knowledge-native.mjs';
import { createApiObservabilityWiring } from './observability-wiring.mjs';

const communicationRuntimeHandler = createCrmRuntimeCommunicationHandler();
const deepRuntimeHandler = createCrmRuntimeDeepHandler();
const advancedRuntimeHandler = createCrmRuntimeAdvancedHandler();
const runtimeHandler = createPublicCrmRuntimeHandler();
const nativeHandler = createCrmNativeHandler();
const lifecycleHandler = createCrmRecordLifecycleHandler();
const adminBulkHandler = createCrmAdminBulkHandler();
const siteHandler = createCrmSiteHandler();
const targetRoleHandler = createCrmTargetRoleHandler();
const researchSiteExecutionHandler = createResearchSiteExecutionHandler();
const researchContactExecutionHandler = createResearchContactExecutionHandler();
const researchEnrichmentExecutionHandler = createResearchEnrichmentExecutionHandler();
const researchAuthoritativeProfileHandler = createResearchAuthoritativeProfileHandler();
const companyResearchVisibilityHandler = createCompanyResearchVisibilityHandler();
const researchIntakeChunkExecutionHandler = createResearchIntakeChunkExecutionHandler();
const researchIntakeExecutionHandler = createResearchIntakeAdoptionExecutionHandler();
const researchIntakeNativeHandler = createResearchIntakeNativeHandler();
const researchCompanyProfileHandler = createResearchCompanyProfileHandler();
const customerIntelligenceHandler = createCustomerIntelligenceHandler();
const opportunityProfileHandler = createOpportunityProfileHandler();
const calendarNativeHandler = createCalendarNativeHandler();
const companyImportNativeHandler = createCompanyImportNativeHandler();
const userPreferencesHandler = createUserPreferencesHandler();
const mcpNativeHandler = createMcpNativeHandler();
const knowledgeNativeHandler = createKnowledgeNativeHandler();
const observability = createApiObservabilityWiring();
await observability.recordStartup();

let knowledgeReconcileRunning = false;
async function runKnowledgeIngestionReconciler() {
  if (knowledgeReconcileRunning) return;
  knowledgeReconcileRunning = true;
  try {
    const result = await reconcileKnowledgeIngestionBatch({ limit: 12 });
    if (result.scanned > 0 || result.errors > 0 || result.failed > 0 || result.ready > 0) {
      console.log(JSON.stringify({ event: 'knowledge.ingestion.reconciler', ...result }));
    }
  } catch (error) {
    console.error(JSON.stringify({
      event: 'knowledge.ingestion.reconciler_failed',
      error: error instanceof Error ? error.message : 'unknown_error',
    }));
  } finally {
    knowledgeReconcileRunning = false;
  }
}
const knowledgeReconcileInitial = setTimeout(() => { void runKnowledgeIngestionReconciler(); }, 2_000);
knowledgeReconcileInitial.unref?.();
const knowledgeReconcileTimer = setInterval(() => { void runKnowledgeIngestionReconciler(); }, 5_000);
knowledgeReconcileTimer.unref?.();

const originalCreateServer = http.createServer.bind(http);

function directInternalProviderCapability(req) {
  if (req.method !== 'POST') return null;
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const match = url.pathname.match(/^\/api\/capabilities\/([^/]+)\/invoke$/);
  if (!match) return null;
  let capability;
  try { capability = decodeURIComponent(match[1]); } catch { return null; }
  return capability.startsWith('crm.meta.v1.') || capability.startsWith('knowledge.v1.') ? capability : null;
}

http.createServer = (...args) => {
  const maybeListener = args.at(-1);
  if (typeof maybeListener !== 'function') return originalCreateServer(...args);
  const prefix = args.slice(0, -1);
  const applicationListener = async (req, res) => {
    try {
      const blockedCapability = directInternalProviderCapability(req);
      if (blockedCapability) {
        observability.store.emitLog({
          severity: 'WARN',
          body: 'Direct internal provider capability denied',
          source: 'api',
          requestId: req.headers['x-gbap-request-id']?.toString() ?? null,
          attributes: { route: req.url ?? '/', method: req.method ?? 'POST', capability: blockedCapability },
        });
        res.writeHead(403, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ error: 'internal_provider_capability_forbidden' }));
        return;
      }
      if (await userPreferencesHandler(req, res)) return;
      if (await mcpNativeHandler(req, res)) return;
      if (await knowledgeNativeHandler(req, res)) return;
      if (await companyImportNativeHandler(req, res)) return;
      if (await adminBulkHandler(req, res)) return;
      if (await siteHandler(req, res)) return;
      if (await targetRoleHandler(req, res)) return;
      if (await researchSiteExecutionHandler(req, res)) return;
      if (await researchContactExecutionHandler(req, res)) return;
      if (await researchEnrichmentExecutionHandler(req, res)) return;
      if (await researchAuthoritativeProfileHandler(req, res)) return;
      if (await companyResearchVisibilityHandler(req, res)) return;
      if (await researchIntakeChunkExecutionHandler(req, res)) return;
      if (await researchIntakeExecutionHandler(req, res)) return;
      if (await researchIntakeNativeHandler(req, res)) return;
      if (await researchCompanyProfileHandler(req, res)) return;
      if (await communicationRuntimeHandler(req, res)) return;
      if (await deepRuntimeHandler(req, res)) return;
      if (await advancedRuntimeHandler(req, res)) return;
      if (await runtimeHandler(req, res)) return;
      if (await lifecycleHandler(req, res)) return;
      if (await customerIntelligenceHandler(req, res)) return;
      if (await opportunityProfileHandler(req, res)) return;
      if (await calendarNativeHandler(req, res)) return;
      if (await nativeHandler(req, res)) return;
    } catch (error) {
      observability.store.emitLog({
        severity: 'ERROR',
        body: `GBAP API interceptor failed: ${error.message}`,
        source: 'api',
        requestId: req.headers['x-gbap-request-id']?.toString() ?? null,
        attributes: { route: req.url ?? '/', method: req.method ?? 'GET' },
      });
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ error: 'api_interceptor_failed' }));
      } else {
        res.destroy(error);
      }
      return;
    }
    maybeListener(req, res);
  };
  return originalCreateServer(...prefix, observability.wrapListener(applicationListener));
};

await import('./server.mjs');
try {
  const reconciliation = reconcileHistoricalResearchImports();
  if (Object.values(reconciliation).some((value) => value > 0)) {
    console.log(JSON.stringify({ event: 'crm.research_import.reconciled', ...reconciliation }));
  }
} catch (error) {
  console.error(JSON.stringify({ event: 'crm.research_import.reconcile_failed', error: error instanceof Error ? error.message : 'unknown_error' }));
}
