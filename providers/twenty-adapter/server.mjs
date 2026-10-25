import http from 'node:http';
import { readFileSync } from 'node:fs';

const PORT = Number(process.env.PORT ?? '8091');
const HOST = '0.0.0.0';
const TWENTY_URL = (process.env.TWENTY_URL ?? 'http://twenty-server:3000').replace(/\/$/, '');
const TOKEN_FILE = process.env.TWENTY_API_KEY_FILE ?? '/run/secrets/twenty-api-key';
const REQUEST_TIMEOUT_MS = Number(process.env.TWENTY_REQUEST_TIMEOUT_MS ?? '5000');
const CONTRACT_VERSION = 'gbap.crm.v1';
const CANONICAL_LIST_PAGE_SIZE = 200;
const MAX_CANONICAL_LIST_LIMIT = 10_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readJson(req, maxBytes = 256 * 1024) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > maxBytes) throw new Error('request_body_too_large'); chunks.push(chunk); }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function apiKey() { const token = readFileSync(TOKEN_FILE, 'utf8').trim(); if (!token) throw new Error('twenty_api_key_missing'); return token; }

function requiredBoundedText(value, label, max) {
  if (typeof value !== 'string') { const error = new Error(`invalid_${label}`); error.status = 400; throw error; }
  const text = value.trim();
  if (!text || text.length > max) { const error = new Error(`invalid_${label}`); error.status = 400; throw error; }
  return text;
}
function optionalBoundedText(value, label, max) {
  if (value === undefined || value === null || value === '') return '';
  return requiredBoundedText(value, label, max);
}
async function twentyRequest(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { accept: 'application/json' };
  if (auth) headers.authorization = `Bearer ${apiKey()}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${TWENTY_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const text = await response.text(); let parsed;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { rawText: text.slice(0, 4000) }; }
  if (!response.ok) {
    console.error(JSON.stringify({ event: 'twenty.adapter.upstream_error', method, path, status: response.status, upstreamBody: parsed }));
    const error = new Error(`twenty_http_${response.status}`); error.status = response.status; error.body = parsed; throw error;
  }
  return parsed;
}
function findRecordWithId(value, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return null;
  if (Array.isArray(value)) { for (const item of value) { const found = findRecordWithId(item, depth + 1); if (found) return found; } return null; }
  if (typeof value !== 'object') return null;
  if (typeof value.id === 'string' && value.id) return value;
  for (const child of Object.values(value)) { const found = findRecordWithId(child, depth + 1); if (found) return found; }
  return null;
}
function validateObjectPlural(value) { if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(value)) throw new Error('invalid_object_plural'); return value; }
function requiredBusinessUuid(value) { const id = typeof value === 'string' ? value.trim() : ''; if (!UUID_PATTERN.test(id)) { const error = new Error('business_id_uuid_required'); error.status = 400; throw error; } return id; }
function listPath(objectPlural, limit = 100) { const object = validateObjectPlural(objectPlural); const boundedLimit = Number.isInteger(limit) && limit > 0 && limit <= 500 ? limit : 100; return `/rest/${object}?limit=${boundedLimit}`; }
function listRecords(raw, key) { const records = raw?.data?.[key]; return Array.isArray(records) ? records : []; }
function canonicalListLimit(value) { return Number.isInteger(value) && value > 0 ? Math.min(value, MAX_CANONICAL_LIST_LIMIT) : 100; }
function listPageInfo(raw) {
  const candidates = [raw?.pageInfo, raw?.data?.pageInfo, raw?.meta?.pageInfo];
  return candidates.find((value) => value && typeof value === 'object') ?? null;
}
function canonicalListPagePath(objectPlural, limit, startingAfter = '', filter = '') {
  const object = validateObjectPlural(objectPlural);
  const params = new URLSearchParams({ limit: String(Math.max(1, Math.min(CANONICAL_LIST_PAGE_SIZE, limit))) });
  if (startingAfter) params.set('starting_after', startingAfter);
  if (filter) params.set('filter', filter);
  return `/rest/${object}?${params.toString()}`;
}
function quotedFilterValue(value) {
  return JSON.stringify(String(value));
}
function accountSearchFilter(query) {
  const text = optionalBoundedText(query, 'account_query', 512);
  if (!text) return '';
  const wildcard = quotedFilterValue(`%${text}%`);
  return `or(name[ilike]:${wildcard},domainName.primaryLinkUrl[ilike]:${wildcard})`;
}
function accountRelationFilter(externalId) {
  const id = optionalBoundedText(externalId, 'account_external_id', 255);
  return id ? `companyId[eq]:${quotedFilterValue(id)}` : '';
}
async function listCanonicalRecords(objectPlural, limit = 100, { filter = '' } = {}) {
  const object = validateObjectPlural(objectPlural);
  const requested = canonicalListLimit(limit);
  const records = [];
  const seenIds = new Set();
  const seenCursors = new Set();
  let cursor = '';

  while (records.length < requested) {
    const raw = await twentyRequest(canonicalListPagePath(object, requested - records.length, cursor, filter));
    const page = listRecords(raw, object);
    let added = 0;
    for (const record of page) {
      if (records.length >= requested) break;
      const id = typeof record?.id === 'string' ? record.id : '';
      if (id && seenIds.has(id)) continue;
      if (id) seenIds.add(id);
      records.push(record);
      added += 1;
    }

    const pageInfo = listPageInfo(raw);
    const nextCursor = typeof pageInfo?.endCursor === 'string' ? pageInfo.endCursor : '';
    if (records.length >= requested) {
      if (requested === MAX_CANONICAL_LIST_LIMIT && pageInfo?.hasNextPage) throw new Error(`twenty_canonical_list_limit_exceeded:${MAX_CANONICAL_LIST_LIMIT}`);
      break;
    }
    if (!pageInfo?.hasNextPage || !nextCursor || page.length === 0) break;
    if (nextCursor === cursor || seenCursors.has(nextCursor) || added === 0) throw new Error('twenty_pagination_cursor_stalled');
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
  return records;
}
async function listCanonicalAccounts(payload = {}) {
  const externalIds = Array.isArray(payload.externalIds)
    ? [...new Set(payload.externalIds.map((value) => requiredBoundedText(value, 'account_external_id', 255)))].slice(0, 100)
    : [];
  if (externalIds.length > 0) {
    const records = await Promise.all(externalIds.map(async (externalId) => (await getRecord('companies', externalId)).record));
    return records.slice(0, canonicalListLimit(payload.limit));
  }
  return listCanonicalRecords('companies', payload.limit, {
    filter: accountSearchFilter(payload.query),
  });
}
async function listCanonicalRelatedRecords(objectPlural, payload = {}) {
  return listCanonicalRecords(objectPlural, payload.limit, {
    filter: accountRelationFilter(payload.accountExternalId),
  });
}
async function createRecord(objectPlural, fields) { const object = validateObjectPlural(objectPlural); const raw = await twentyRequest(`/rest/${object}`, { method: 'POST', body: fields ?? {} }); const record = findRecordWithId(raw); if (!record) throw new Error('twenty_create_response_missing_record_id'); return { record, raw }; }
async function upsertRecord(objectPlural, fields) { const object = validateObjectPlural(objectPlural); const raw = await twentyRequest(`/rest/${object}?upsert=true`, { method: 'POST', body: fields ?? {} }); const record = findRecordWithId(raw); if (!record) throw new Error('twenty_upsert_response_missing_record_id'); return { record, raw }; }
async function getRecord(objectPlural, externalId) { const object = validateObjectPlural(objectPlural); if (typeof externalId !== 'string' || !externalId) throw new Error('external_id_required'); const raw = await twentyRequest(`/rest/${object}/${encodeURIComponent(externalId)}`); const record = findRecordWithId(raw); if (!record) throw new Error('twenty_get_response_missing_record_id'); return { record, raw }; }
async function updateRecord(objectPlural, externalId, fields) { const object = validateObjectPlural(objectPlural); if (typeof externalId !== 'string' || !externalId) throw new Error('external_id_required'); if (!fields || Object.keys(fields).length === 0) return getRecord(object, externalId); const raw = await twentyRequest(`/rest/${object}/${encodeURIComponent(externalId)}`, { method: 'PATCH', body: fields }); const record = findRecordWithId(raw); if (!record) throw new Error('twenty_update_response_missing_record_id'); return { record, raw }; }
async function deleteRecord(objectPlural, externalId) { const object = validateObjectPlural(objectPlural); if (typeof externalId !== 'string' || !externalId) throw new Error('external_id_required'); await twentyRequest(`/rest/${object}/${encodeURIComponent(externalId)}`, { method: 'DELETE' }); }
function splitPersonName(value) { const text = typeof value === 'string' ? value.trim() : ''; const parts = text.split(/\s+/).filter(Boolean); if (parts.length <= 1) return { firstName: text, lastName: '' }; return { firstName: parts.shift(), lastName: parts.join(' ') }; }
function linkValue(current, url) { if (url === null || url === '') return { primaryLinkUrl: '', primaryLinkLabel: '', secondaryLinks: [] }; return { primaryLinkUrl: String(url), primaryLinkLabel: current?.primaryLinkLabel ?? '', secondaryLinks: Array.isArray(current?.secondaryLinks) ? current.secondaryLinks : [] }; }
function canonicalPhone(phones) {
  const number = typeof phones?.primaryPhoneNumber === 'string' ? phones.primaryPhoneNumber.trim() : '';
  if (!number) return null;
  if (number.startsWith('+')) return number;
  const rawCallingCode = typeof phones?.primaryPhoneCallingCode === 'string' ? phones.primaryPhoneCallingCode.trim() : '';
  if (!rawCallingCode) return number;
  const callingCode = rawCallingCode.startsWith('+') ? rawCallingCode : `+${rawCallingCode}`;
  return `${callingCode}${number}`;
}
function normalizeLifecycleState(value) { const text = String(value ?? '').trim().toLowerCase(); if (text === 'customer' || text.includes('won') || text.includes('success')) return 'CLOSED_WON'; if (text.includes('lost') || text.includes('fail')) return 'CLOSED_LOST'; if (text.includes('cancel')) return 'CANCELLED'; return 'OPEN'; }
function canonicalAccount(record) {
  const amountMicros = record.annualRevenue?.amountMicros;
  return {
    externalId: record.id, externalType: 'company', displayName: record.name ?? '', website: record.domainName?.primaryLinkUrl || null,
    linkedinUrl: record.linkedinLink?.primaryLinkUrl || null,
    addressStreet1: record.address?.addressStreet1 || null, addressStreet2: record.address?.addressStreet2 || null,
    addressCity: record.address?.addressCity || null, addressState: record.address?.addressState || null,
    addressPostcode: record.address?.addressPostcode || null, addressCountry: record.address?.addressCountry || null,
    annualRevenue: typeof amountMicros === 'number' ? amountMicros / 1_000_000 : null,
    annualRevenueCurrency: record.annualRevenue?.currencyCode || null, updatedAt: record.updatedAt || null,
  };
}
function canonicalContact(record) {
  const personName = [record.name?.firstName, record.name?.lastName].filter(Boolean).join(' ').trim();
  return {
    externalId: record.id, externalType: 'person', personName: personName || record.id,
    email: record.emails?.primaryEmail || null, phone: canonicalPhone(record.phones),
    jobTitle: record.jobTitle || null, linkedinUrl: record.linkedinLink?.primaryLinkUrl || null,
    accountExternalId: record.companyId || null, updatedAt: record.updatedAt || null,
  };
}
function canonicalOpportunity(record) { const amountMicros = record.amount?.amountMicros; return { externalId: record.id, externalType: 'opportunity', nameSummary: record.name ?? '', lifecycleState: normalizeLifecycleState(record.stage), accountExternalId: record.companyId || null, estimatedValue: typeof amountMicros === 'number' ? amountMicros / 1_000_000 : null, currencyCode: record.amount?.currencyCode || null, pipelineStage: record.stage || null, nextStep: null }; }
function targetFieldForExternalType(externalType) { if (externalType === 'company') return 'targetCompanyId'; if (externalType === 'person') return 'targetPersonId'; if (externalType === 'opportunity') return 'targetOpportunityId'; throw new Error(`unsupported_operational_target_type:${externalType}`); }
function targetIdentity(record) { const candidates = [['company', record.targetCompanyId ?? record.companyId], ['person', record.targetPersonId ?? record.personId], ['opportunity', record.targetOpportunityId ?? record.opportunityId]]; for (const [externalType, externalId] of candidates) if (typeof externalId === 'string' && externalId) return { externalType, externalId }; return null; }
function groupTargets(records, ownerField) { const grouped = new Map(); for (const record of records) { const ownerId = record[ownerField]; const identity = targetIdentity(record); if (typeof ownerId !== 'string' || !ownerId || !identity) continue; const current = grouped.get(ownerId) ?? []; current.push(identity); grouped.set(ownerId, current); } return grouped; }
function bodyMarkdown(record) { if (typeof record?.bodyV2?.markdown === 'string' && record.bodyV2.markdown) return record.bodyV2.markdown; if (typeof record?.body === 'string' && record.body) return record.body; return null; }
function richText(markdown) { return { blocknote: null, markdown: markdown ?? '' }; }
function operationalTask(record, targets = []) { return { externalId: record.id, externalType: 'task', title: record.title ?? '', bodyMarkdown: bodyMarkdown(record), dueAt: record.dueAt || null, status: record.status || 'TODO', targets, createdAt: record.createdAt || null, updatedAt: record.updatedAt || null }; }
function operationalNote(record, targets = []) { return { externalId: record.id, externalType: 'note', title: record.title ?? '', bodyMarkdown: bodyMarkdown(record), targets, createdAt: record.createdAt || null, updatedAt: record.updatedAt || null }; }
async function createTargets(kind, ownerId, targets) { const list = Array.isArray(targets) ? targets : []; const created = []; for (const target of list) { const externalType = target?.externalType; const externalId = target?.externalId; if (typeof externalId !== 'string' || !externalId) continue; const targetField = targetFieldForExternalType(externalType); const ownerField = kind === 'task' ? 'taskId' : 'noteId'; const objectPlural = kind === 'task' ? 'taskTargets' : 'noteTargets'; const result = await createRecord(objectPlural, { [ownerField]: ownerId, [targetField]: externalId }); created.push(result.record); } return created; }
function operationalTargetKey(target) {
  if (!target?.externalType || !target?.externalId) return '';
  return `${target.externalType}:${target.externalId}`;
}
async function loadOperationalRecords(kind, limit, requestedTargets = []) {
  const objectPlural = kind === 'task' ? 'tasks' : 'notes';
  const targetPlural = kind === 'task' ? 'taskTargets' : 'noteTargets';
  const ownerField = kind === 'task' ? 'taskId' : 'noteId';
  const boundedLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 100;
  const targetFilter = Array.isArray(requestedTargets)
    ? new Set(requestedTargets.map(operationalTargetKey).filter(Boolean))
    : new Set();

  if (targetFilter.size === 0) {
    const records = await listCanonicalRecords(objectPlural, boundedLimit);
    if (records.length === 0) return [];
    const targetRows = [];
    // Keep encoded REST filter URLs below normal HTTP header-size limits.
    for (let offset = 0; offset < records.length; offset += 50) {
      const ownerFilter = `or(${records.slice(offset, offset + 50).map(record => `${ownerField}[eq]:${quotedFilterValue(record.id)}`).join(',')})`;
      targetRows.push(...await listCanonicalRecords(targetPlural, MAX_CANONICAL_LIST_LIMIT, { filter: ownerFilter }));
    }
    const targets = groupTargets(targetRows, ownerField);
    return records
      .map((record) =>
        kind === 'task'
          ? operationalTask(record, targets.get(record.id) ?? [])
          : operationalNote(record, targets.get(record.id) ?? []),
      )
      .sort((a, b) =>
        String(b.updatedAt ?? b.createdAt ?? '').localeCompare(
          String(a.updatedAt ?? a.createdAt ?? ''),
        ),
      )
      .slice(0, boundedLimit);
  }

  // Correctness-first path for AI/customer progress: paginate the governed
  // operational tables before filtering so a customer's history cannot be
  // silently dropped by a global "first N activities" cutoff. The canonical
  // paginator fails closed if the provider exceeds its explicit safety ceiling.
  const [records, targetRows] = await Promise.all([
    listCanonicalRecords(objectPlural, MAX_CANONICAL_LIST_LIMIT),
    listCanonicalRecords(targetPlural, MAX_CANONICAL_LIST_LIMIT),
  ]);
  const matchedOwnerIds = new Set(
    targetRows
      .filter((row) => targetFilter.has(operationalTargetKey(targetIdentity(row))))
      .map((row) => row?.[ownerField])
      .filter((value) => typeof value === 'string' && value),
  );
  const targets = groupTargets(targetRows, ownerField);

  return records
    .filter((record) => matchedOwnerIds.has(record?.id))
    .map((record) =>
      kind === 'task'
        ? operationalTask(record, targets.get(record.id) ?? [])
        : operationalNote(record, targets.get(record.id) ?? []),
    )
    .sort((a, b) =>
      String(b.updatedAt ?? b.createdAt ?? '').localeCompare(
        String(a.updatedAt ?? a.createdAt ?? ''),
      ),
    )
    .slice(0, boundedLimit);
}
async function operationalTaskCreate(payload) { const fields = { title: payload?.title, status: payload?.status || 'TODO' }; if (payload?.bodyMarkdown) fields.bodyV2 = richText(payload.bodyMarkdown); if (payload?.dueAt) fields.dueAt = payload.dueAt; const created = await createRecord('tasks', fields); try { const targets = await createTargets('task', created.record.id, payload?.targets); return { record: operationalTask(created.record, targets.map(targetIdentity).filter(Boolean)), raw: created.raw }; } catch (error) { await deleteRecord('tasks', created.record.id).catch(() => {}); throw error; } }
async function loadOperationalTargets(kind, ownerId) {
  const ownerField = kind === 'task' ? 'taskId' : 'noteId';
  const targetPlural = kind === 'task' ? 'taskTargets' : 'noteTargets';
  const rows = await listCanonicalRecords(targetPlural, MAX_CANONICAL_LIST_LIMIT, { filter: `${ownerField}[eq]:${quotedFilterValue(ownerId)}` });
  return groupTargets(rows, ownerField).get(ownerId) ?? [];
}
async function operationalTaskUpdate(payload) { const targets = await loadOperationalTargets('task', payload?.externalId); const fields = {}; if (payload?.title !== undefined) fields.title = payload.title; if (payload?.bodyMarkdown !== undefined) fields.bodyV2 = richText(payload.bodyMarkdown || ''); if (payload?.dueAt !== undefined) fields.dueAt = payload.dueAt || null; if (payload?.status !== undefined) fields.status = payload.status; const updated = await updateRecord('tasks', payload?.externalId, fields); return { record: operationalTask(updated.record, targets), raw: updated.raw }; }
async function operationalNoteCreate(payload) { const fields = { title: payload?.title }; if (payload?.bodyMarkdown) fields.bodyV2 = richText(payload.bodyMarkdown); const created = await createRecord('notes', fields); try { const targets = await createTargets('note', created.record.id, payload?.targets); return { record: operationalNote(created.record, targets.map(targetIdentity).filter(Boolean)), raw: created.raw }; } catch (error) { await deleteRecord('notes', created.record.id).catch(() => {}); throw error; } }
async function operationalNoteUpdate(payload) { const targets = await loadOperationalTargets('note', payload?.externalId); const fields = {}; if (payload?.title !== undefined) fields.title = payload.title; if (payload?.bodyMarkdown !== undefined) fields.bodyV2 = richText(payload.bodyMarkdown || ''); const updated = await updateRecord('notes', payload?.externalId, fields); return { record: operationalNote(updated.record, targets), raw: updated.raw }; }
async function operationalAccountUpdate(payload) {
  const current = (await getRecord('companies', payload?.externalId)).record;
  const fields = {};
  if (payload?.displayName !== undefined) fields.name = payload.displayName;
  if (payload?.website !== undefined) fields.domainName = linkValue(current.domainName, payload.website);
  if (payload?.linkedinUrl !== undefined) fields.linkedinLink = linkValue(current.linkedinLink, payload.linkedinUrl);
  const addressKeys = ['addressStreet1', 'addressStreet2', 'addressCity', 'addressState', 'addressPostcode', 'addressCountry'];
  if (addressKeys.some((key) => payload?.[key] !== undefined)) {
    fields.address = {
      addressStreet1: current.address?.addressStreet1 ?? '', addressStreet2: current.address?.addressStreet2 ?? '', addressCity: current.address?.addressCity ?? '',
      addressState: current.address?.addressState ?? '', addressPostcode: current.address?.addressPostcode ?? '', addressCountry: current.address?.addressCountry ?? '',
      addressLat: current.address?.addressLat ?? null, addressLng: current.address?.addressLng ?? null,
    };
    for (const key of addressKeys) if (payload[key] !== undefined) fields.address[key] = payload[key] ?? '';
  }
  if (payload?.annualRevenue !== undefined) {
    fields.annualRevenue = payload.annualRevenue === null ? null : { amountMicros: Math.round(Number(payload.annualRevenue) * 1_000_000), currencyCode: payload.annualRevenueCurrency || current.annualRevenue?.currencyCode || 'USD' };
  } else if (payload?.annualRevenueCurrency !== undefined && typeof current.annualRevenue?.amountMicros === 'number') {
    fields.annualRevenue = { amountMicros: current.annualRevenue.amountMicros, currencyCode: payload.annualRevenueCurrency || 'USD' };
  }
  const updated = await updateRecord('companies', payload?.externalId, fields);
  return { record: canonicalAccount(updated.record), raw: updated.raw };
}
async function operationalContactUpdate(payload) {
  const current = (await getRecord('people', payload?.externalId)).record;
  const fields = {};
  if (payload?.personName !== undefined) fields.name = splitPersonName(payload.personName);
  if (payload?.email !== undefined) fields.emails = { primaryEmail: payload.email || '', additionalEmails: Array.isArray(current.emails?.additionalEmails) ? current.emails.additionalEmails : [] };
  if (payload?.accountExternalId !== undefined) fields.companyId = payload.accountExternalId || null;
  if (payload?.jobTitle !== undefined) fields.jobTitle = payload.jobTitle || null;
  if (payload?.linkedinUrl !== undefined) fields.linkedinLink = linkValue(current.linkedinLink, payload.linkedinUrl);
  if (payload?.phone !== undefined) fields.phones = {
    primaryPhoneNumber: payload.phone || '',
    primaryPhoneCountryCode: '',
    primaryPhoneCallingCode: '',
    additionalPhones: Array.isArray(current.phones?.additionalPhones) ? current.phones.additionalPhones : [],
  };
  const updated = await updateRecord('people', payload?.externalId, fields);
  return { record: canonicalContact(updated.record), raw: updated.raw };
}
async function operationalOpportunityUpdate(payload) { const fields = {}; if (payload?.nameSummary !== undefined) fields.name = payload.nameSummary; if (payload?.accountExternalId !== undefined) fields.companyId = payload.accountExternalId || null; if (typeof payload?.estimatedValue === 'number') fields.amount = { amountMicros: Math.round(payload.estimatedValue * 1_000_000), currencyCode: payload.currencyCode || 'USD' }; if (payload?.pipelineStage !== undefined) fields.stage = payload.pipelineStage; if (payload?.lifecycleState === 'CLOSED_WON') { fields.stage = 'CUSTOMER'; fields.closeDate = new Date().toISOString(); } else if (payload?.lifecycleState === 'CLOSED_LOST' || payload?.lifecycleState === 'CANCELLED') { fields.closeDate = new Date().toISOString(); } else if (payload?.lifecycleState === 'OPEN') { fields.closeDate = null; } const updated = await updateRecord('opportunities', payload?.externalId, fields); return { record: canonicalOpportunity(updated.record), raw: updated.raw }; }
async function relatedTargetCounts(externalType, externalId) {
  const field = targetFieldForExternalType(externalType);
  const filter = `${field}[eq]:${quotedFilterValue(externalId)}`;
  const [taskTargets, noteTargets] = await Promise.all([
    listCanonicalRecords('taskTargets', MAX_CANONICAL_LIST_LIMIT, { filter }),
    listCanonicalRecords('noteTargets', MAX_CANONICAL_LIST_LIMIT, { filter }),
  ]);
  return { tasks: taskTargets.filter(item => item[field] === externalId).length, notes: noteTargets.filter(item => item[field] === externalId).length };
}
async function guardedDelete(kind, payload) {
  const externalId = payload?.externalId;
  if (typeof externalId !== 'string' || !externalId) throw new Error('external_id_required');
  if (kind === 'company') {
    const filter = accountRelationFilter(externalId);
    const [people, opportunities, targets] = await Promise.all([
      listCanonicalRecords('people', MAX_CANONICAL_LIST_LIMIT, { filter }),
      listCanonicalRecords('opportunities', MAX_CANONICAL_LIST_LIMIT, { filter }),
      relatedTargetCounts('company', externalId),
    ]);
    const blockers = { contacts: people.filter(item => item.companyId === externalId).length, opportunities: opportunities.filter(item => item.companyId === externalId).length, ...targets };
    if (Object.values(blockers).some((count) => count > 0)) return { deleted: false, blockers };
    await deleteRecord('companies', externalId); return { deleted: true };
  }
  if (kind === 'person' || kind === 'opportunity') {
    const blockers = await relatedTargetCounts(kind, externalId);
    if (Object.values(blockers).some((count) => count > 0)) return { deleted: false, blockers };
    await deleteRecord(kind === 'person' ? 'people' : 'opportunities', externalId); return { deleted: true };
  }
  await deleteRecord(kind === 'task' ? 'tasks' : 'notes', externalId); return { deleted: true };
}
async function canonicalAccountCreate(payload) { const businessId = requiredBusinessUuid(payload?.businessId); const created = await upsertRecord('companies', { id: businessId, name: payload?.displayName }); return { record: canonicalAccount(created.record), raw: created.raw }; }
async function canonicalContactCreate(payload) { const businessId = requiredBusinessUuid(payload?.businessId); const fields = { id: businessId, name: splitPersonName(payload?.personName) }; if (payload?.email) fields.emails = { primaryEmail: payload.email, additionalEmails: [] }; if (payload?.accountExternalId) fields.companyId = payload.accountExternalId; const created = await upsertRecord('people', fields); return { record: canonicalContact(created.record), raw: created.raw }; }
async function canonicalOpportunityCreate(payload) { const fields = { name: payload?.nameSummary }; if (payload?.accountExternalId) fields.companyId = payload.accountExternalId; if (typeof payload?.estimatedValue === 'number') fields.amount = { amountMicros: Math.round(payload.estimatedValue * 1_000_000), currencyCode: payload.currencyCode || 'USD' }; const created = await createRecord('opportunities', fields); return { record: canonicalOpportunity(created.record), raw: created.raw }; }
async function canonicalSnapshot() {
  const [companies, people, opportunities] = await Promise.all([
    listCanonicalRecords('companies', MAX_CANONICAL_LIST_LIMIT),
    listCanonicalRecords('people', MAX_CANONICAL_LIST_LIMIT),
    listCanonicalRecords('opportunities', MAX_CANONICAL_LIST_LIMIT),
  ]);
  return { snapshot: { contractVersion: CONTRACT_VERSION, sourceProvider: 'twenty', exportedAt: new Date().toISOString(), accounts: companies.map(canonicalAccount), contacts: people.map(canonicalContact), opportunities: opportunities.map(canonicalOpportunity) } };
}

async function invoke(capability, payload) {
  switch (capability) {
    case 'crm.v1.account.create': return canonicalAccountCreate(payload);
    case 'crm.v1.account.list': return { records: (await listCanonicalAccounts(payload)).map(canonicalAccount) };
    case 'crm.v1.contact.create': return canonicalContactCreate(payload);
    case 'crm.v1.contact.list': return { records: (await listCanonicalRelatedRecords('people', payload)).map(canonicalContact) };
    case 'crm.v1.opportunity.create': return canonicalOpportunityCreate(payload);
    case 'crm.v1.opportunity.list': return { records: (await listCanonicalRelatedRecords('opportunities', payload)).map(canonicalOpportunity) };
    case 'crm.v1.snapshot.export': return canonicalSnapshot();
    case 'crm.ops.v1.account.update': return operationalAccountUpdate(payload);
    case 'crm.ops.v1.account.delete': return guardedDelete('company', payload);
    case 'crm.ops.v1.task.create': return operationalTaskCreate(payload);
    case 'crm.ops.v1.task.list': return { records: await loadOperationalRecords('task', payload?.limit) };
    case 'crm.ops.v1.task.update': return operationalTaskUpdate(payload);
    case 'crm.ops.v1.task.delete': return guardedDelete('task', payload);
    case 'crm.ops.v1.note.create': return operationalNoteCreate(payload);
    case 'crm.ops.v1.note.list': return { records: await loadOperationalRecords('note', payload?.limit) };
    case 'crm.ops.v1.note.update': return operationalNoteUpdate(payload);
    case 'crm.ops.v1.note.delete': return guardedDelete('note', payload);
    case 'crm.ops.v1.activity.list': { const requestedTargets = Array.isArray(payload?.targets) ? payload.targets : []; const requestedLimit = Number.isInteger(payload?.limit) && payload.limit > 0 ? Math.min(payload.limit, 500) : 100; const [tasks, notes] = await Promise.all([loadOperationalRecords('task', requestedLimit, requestedTargets), loadOperationalRecords('note', requestedLimit, requestedTargets)]); const records = [...tasks.map((record) => ({ kind: 'TASK', ...record })), ...notes.map((record) => ({ kind: 'NOTE', ...record }))].sort((a, b) => String(b.updatedAt ?? b.createdAt ?? '').localeCompare(String(a.updatedAt ?? a.createdAt ?? ''))); return { records: records.slice(0, requestedLimit), targetFiltered: requestedTargets.length > 0 }; }
    case 'crm.ops.v1.contact.update': return operationalContactUpdate(payload);
    case 'crm.ops.v1.contact.delete': return guardedDelete('person', payload);
    case 'crm.ops.v1.opportunity.update': return operationalOpportunityUpdate(payload);
    case 'crm.ops.v1.opportunity.delete': return guardedDelete('opportunity', payload);
    case 'crm.company.create': return createRecord('companies', { name: payload?.name });
    case 'crm.company.list': return { records: await twentyRequest(listPath('companies', payload?.limit)) };
    case 'crm.person.create': { const fields = { name: { firstName: payload?.firstName ?? '', lastName: payload?.lastName ?? '' } }; if (payload?.companyExternalId) fields.companyId = payload.companyExternalId; return createRecord('people', fields); }
    case 'crm.person.list': return { records: await twentyRequest(listPath('people', payload?.limit)) };
    case 'crm.opportunity.create': { const fields = { name: payload?.name }; if (payload?.companyExternalId) fields.companyId = payload.companyExternalId; return createRecord('opportunities', fields); }
    case 'crm.opportunity.list': return { records: await twentyRequest(listPath('opportunities', payload?.limit)) };
    case 'crm.custom-record.create': return createRecord(validateObjectPlural(payload?.objectPlural), payload?.fields ?? {});
    case 'crm.record.list': return { records: await twentyRequest(listPath(payload?.objectPlural, payload?.limit)) };
    case 'crm.snapshot.export': { const customObjects = Array.isArray(payload?.customObjects) ? payload.customObjects : []; const snapshot = { exportedAt: new Date().toISOString(), source: 'twenty', companies: await twentyRequest(listPath('companies', 500)), people: await twentyRequest(listPath('people', 500)), opportunities: await twentyRequest(listPath('opportunities', 500)), custom: {} }; for (const objectPlural of customObjects) { const object = validateObjectPlural(objectPlural); snapshot.custom[object] = await twentyRequest(listPath(object, 500)); } return { snapshot }; }
    default: throw new Error(`unsupported_capability:${capability}`);
  }
}
async function handle(req, res) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') { try { const upstream = await twentyRequest('/healthz', { auth: false }); return json(res, 200, { status: 'ok', provider: 'twenty', upstream }); } catch (error) { return json(res, 503, { status: 'unavailable', provider: 'twenty', detail: error.message }); } }
  if (req.method === 'POST' && url.pathname === '/invoke') { try { const input = await readJson(req); if (typeof input.capability !== 'string' || !input.capability) throw new Error('capability_required'); const result = await invoke(input.capability, input.payload ?? {}, input.context ?? {}); return json(res, 200, { ok: true, provider: 'twenty', capability: input.capability, ...result }); } catch (error) { return json(res, error.status && error.status >= 400 && error.status < 500 ? 400 : 502, { ok: false, provider: 'twenty', error: error.message, upstreamStatus: error.status ?? null, upstreamBody: error.body ?? null }); } }
  return json(res, 404, { error: 'not_found' });
}
http.createServer((req, res) => { handle(req, res).catch((error) => json(res, 500, { error: 'internal_error', detail: error.message })); }).listen(PORT, HOST, () => { console.log(JSON.stringify({ event: 'twenty.adapter.started', port: PORT, twentyUrl: TWENTY_URL, contractVersion: CONTRACT_VERSION })); });
