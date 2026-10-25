import http from 'node:http';
import { STAGE35_ADVANCED_CAPABILITIES, invokeStage35Advanced } from './stage35-advanced.mjs';

const originalCreateServer = http.createServer.bind(http);
const CLIENT_ERROR_CODES = new Set([
  'request_body_too_large',
  'unsupported_view_type',
  'kanban_group_field_required',
  'calendar_field_required',
  'invalid_calendar_layout',
  'invalid_kanban_aggregate_operation',
  'kanban_aggregate_field_required',
  'view_name_required',
  'view_filter_group_duplicate_key',
  'view_filter_group_parent_missing',
  'view_filter_group_cycle',
  'view_filter_group_parent_cycle_or_missing',
  'view_filter_group_resolution_failed',
  'view_filter_group_mapping_missing',
  'merge_requires_2_to_20_records',
  'invalid_conflict_priority_index',
]);

async function readJson(req, maxBytes = 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function stage35ErrorStatus(error) {
  if (error?.status === 403) return 403;
  if (error?.status && error.status >= 400 && error.status < 500) return 400;
  const message = String(error?.message ?? '');
  if (CLIENT_ERROR_CODES.has(message) || message.startsWith('invalid_')) return 400;
  if (error instanceof SyntaxError) return 400;
  return 502;
}

function normalizeTwentyAdvancedPayload(capability, payload = {}) {
  if (!['crm.meta.v1.view.create', 'crm.meta.v1.view.update'].includes(capability)) return payload;

  // GBAP owns human identity, View ownership and PERSONAL/WORKSPACE exposure.
  // The headless Twenty provider is invoked with a service API key, and Twenty
  // v2.37.0 reserves UNLISTED View creation for a real userWorkspace identity.
  // Persist service-backed Views as provider WORKSPACE metadata while keeping
  // GBAP's crm_runtime_view_binding as the authority for PERSONAL isolation.
  // This does not widen product authorization: the browser never sees Twenty
  // directly, and canSeeView/canEditView continue to enforce the GBAP binding.
  if (payload?.visibility === 'UNLISTED') {
    console.log('GBAP_VIEW_STORAGE_TRACE ' + JSON.stringify({ capability, requestedVisibility: 'UNLISTED', providerVisibility: 'WORKSPACE' }));
    return { ...payload, visibility: 'WORKSPACE' };
  }
  return payload;
}

// Add a separate Stage 3.5-only provider path without changing the already
// accepted /invoke behavior. All existing Stage 3.4 traffic is delegated
// untouched to bootstrap.mjs and its extended/legacy adapter chain.
http.createServer = (...args) => {
  const maybeListener = args.at(-1);
  if (typeof maybeListener !== 'function') return originalCreateServer(...args);
  const prefix = args.slice(0, -1);
  const listener = async (req, res) => {
    if (req.method === 'POST' && req.url === '/stage35/invoke') {
      try {
        const input = await readJson(req);
        const capability = input?.capability;
        let result;
        if (STAGE35_ADVANCED_CAPABILITIES.has(capability)) {
          result = await invokeStage35Advanced(
            capability,
            normalizeTwentyAdvancedPayload(capability, input.payload ?? {}),
          );
        } else {
          return sendJson(res, 404, { ok: false, error: 'unsupported_stage35_capability' });
        }
        return sendJson(res, 200, { ok: true, provider: 'twenty', capability, ...result });
      } catch (error) {
        console.error(JSON.stringify({ event: 'twenty.adapter.stage35_advanced_failed', detail: error.message, upstreamStatus: error.status ?? null }));
        const status = stage35ErrorStatus(error);
        return sendJson(res, status, { ok: false, provider: 'twenty', error: error.message, upstreamStatus: error.status ?? null });
      }
    }
    return maybeListener(req, res);
  };
  return originalCreateServer(...prefix, listener);
};

await import('./bootstrap.mjs');
