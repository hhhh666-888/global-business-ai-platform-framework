import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const DB_PATH = process.env.DB_PATH ?? '/data/substrate.db';
const SYSTEM_ACTOR = 'system:research-import-reconcile';

const COMPANY_RESEARCH_FIELDS = [
  'registrationCountry', 'registrationType', 'registrationId', 'commercialName', 'ownershipType', 'verificationGrade',
  'strategicValueScore', 'researchRank', 'industry', 'primaryPhone', 'primaryEmail', 'employeeCount', 'source',
  'website', 'linkedinUrl', 'annualRevenue', 'annualRevenueCurrency',
];
const RESEARCH_INTELLIGENCE_FIELDS = [
  'researchPriority', 'industrySegment', 'productsServices', 'researchRationale', 'companyWhatsapp', 'companyScale',
  'recommendedSolution', 'recommendedEntryPoint', 'estimatedProjectScale', 'recommendedChannel', 'firstOutreachSubject',
  'firstContactGuidance', 'researchCompleteness', 'researchNextAction',
];
const SALES_SIGNAL_FIELDS = ['solarOpportunity', 'storageOpportunity', 'generatorOpportunity', 'electricalOpportunity'];
const ENERGY_DISCOVERY_FIELDS = ['publicKnownEnergyData'];

function nowIso() { return new Date().toISOString(); }
function parseJson(value) {
  try { return JSON.parse(value ?? '{}'); }
  catch { return {}; }
}
function isPlaceholder(value) {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return text === '' || text === '待补充';
}
function hasIncomingValue(value) {
  if (value === undefined || value === null) return false;
  return typeof value === 'string' ? value.trim() !== '' && value.trim() !== '待补充' : true;
}
function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
function requiredTablesExist(db, names) { return names.every((name) => tableExists(db, name)); }
function authoritativeExclusion(db, businessAlias) {
  if (!tableExists(db, 'crm_research_authoritative_profile')) return '';
  return `AND NOT EXISTS (
    SELECT 1 FROM crm_research_authoritative_profile a
    WHERE a.account_business_id=${businessAlias}
  )`;
}

function writeGlobalAudit(db, result) {
  if (!Object.values(result).some((value) => value > 0)) return;
  if (!tableExists(db, 'audit_event')) return;
  db.prepare(`INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json)
    VALUES(?,?,?,?,?,?,?)`).run(
    randomUUID(), SYSTEM_ACTOR, null, 'crm.research_import.reconcile', 'ResearchImport:historical', nowIso(), JSON.stringify(result),
  );
}

function purgeOrphanImportedIdentities(db, result) {
  if (!requiredTablesExist(db, ['crm_registration_identity', 'external_mapping'])) return;
  const rows = db.prepare(`
    SELECT r.business_id
    FROM crm_registration_identity r
    WHERE (r.first_import_batch_id IS NOT NULL OR r.last_import_batch_id IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM external_mapping m
        WHERE m.business_type='Account' AND m.business_id=r.business_id
      )
  `).all();
  if (!rows.length) return;
  const deleteIdentity = db.prepare('DELETE FROM crm_registration_identity WHERE business_id=?');
  const deleteState = tableExists(db, 'crm_business_state')
    ? db.prepare("DELETE FROM crm_business_state WHERE business_type='Account' AND business_id=?")
    : null;
  const deleteAuthority = tableExists(db, 'crm_research_authoritative_profile')
    ? db.prepare('DELETE FROM crm_research_authoritative_profile WHERE account_business_id=?')
    : null;
  for (const row of rows) {
    result.orphanRegistrationIdentitiesRemoved += Number(deleteIdentity.run(row.business_id).changes ?? 0);
    if (deleteState) result.orphanCompanyStatesRemoved += Number(deleteState.run(row.business_id).changes ?? 0);
    deleteAuthority?.run(row.business_id);
  }
}

function reconcileCompanyProfiles(db, result) {
  if (!requiredTablesExist(db, ['crm_research_import_item', 'crm_research_import_execution_item', 'crm_research_import_batch', 'crm_business_state', 'external_mapping'])) return;
  const excludeAuthority = authoritativeExclusion(db, 'e.business_id');
  const rows = db.prepare(`
    SELECT i.batch_id,i.row_number,i.snapshot_json,e.business_id,b.created_at AS batch_created_at
    FROM crm_research_import_item i
    JOIN crm_research_import_execution_item e
      ON e.batch_id=i.batch_id AND e.row_number=i.row_number AND e.status='COMPLETE'
    JOIN crm_research_import_batch b ON b.id=i.batch_id
    WHERE EXISTS (
      SELECT 1 FROM external_mapping m
      WHERE m.business_type='Account' AND m.business_id=e.business_id
    )
    ${excludeAuthority}
    ORDER BY b.created_at DESC,i.row_number ASC
  `).all();
  const selectState = db.prepare("SELECT state_json FROM crm_business_state WHERE business_type='Account' AND business_id=?");
  const upsertState = db.prepare(`INSERT INTO crm_business_state(business_type,business_id,state_json,updated_at)
    VALUES('Account',?,?,?)
    ON CONFLICT(business_type,business_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`);
  const audit = tableExists(db, 'crm_research_profile_field_audit')
    ? db.prepare(`INSERT INTO crm_research_profile_field_audit(
        id,business_id,batch_id,field_key,old_value_json,new_value_json,merge_policy,actor_subject,actor_username,occurred_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?)`)
    : null;

  for (const row of rows) {
    const snapshot = parseJson(row.snapshot_json);
    const currentRow = selectState.get(row.business_id);
    const current = parseJson(currentRow?.state_json);
    const next = { ...current };
    const changed = [];
    for (const field of COMPANY_RESEARCH_FIELDS) {
      const incoming = snapshot[field];
      if (!hasIncomingValue(incoming) || !isPlaceholder(current[field])) continue;
      if (current[field] === incoming) continue;
      next[field] = incoming;
      changed.push(field);
    }
    if (!changed.length) continue;
    const timestamp = nowIso();
    upsertState.run(row.business_id, JSON.stringify(next), timestamp);
    if (audit) {
      for (const field of changed) {
        audit.run(
          randomUUID(), row.business_id, row.batch_id, field,
          JSON.stringify(current[field] ?? null), JSON.stringify(next[field] ?? null),
          'RESEARCH_FILL_RECONCILE', SYSTEM_ACTOR, null, timestamp,
        );
      }
    }
    result.companyRowsUpdated += 1;
    result.companyFieldsFilled += changed.length;
  }
}

function reconcileOverlayTable(db, rows, tableName, snapshotKey, allowedFields, rowCounterKey, fieldCounterKey, result) {
  if (!tableExists(db, tableName)) return;
  const select = db.prepare(`SELECT business_id,state_json FROM ${tableName} WHERE account_business_id=?`);
  const insert = db.prepare(`INSERT INTO ${tableName}(business_id,account_business_id,state_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)`);
  const update = db.prepare(`UPDATE ${tableName} SET state_json=?,updated_at=? WHERE business_id=?`);

  for (const row of rows) {
    const fullSnapshot = parseJson(row.enrichment_snapshot_json);
    const incomingSource = fullSnapshot?.[snapshotKey] && typeof fullSnapshot[snapshotKey] === 'object' ? fullSnapshot[snapshotKey] : {};
    const existing = select.get(row.business_id);
    const current = parseJson(existing?.state_json);
    const next = { ...current };
    const changed = [];
    for (const field of allowedFields) {
      const incoming = incomingSource[field];
      if (!hasIncomingValue(incoming) || !isPlaceholder(current[field])) continue;
      if (current[field] === incoming) continue;
      next[field] = incoming;
      changed.push(field);
    }
    if (!changed.length) continue;
    const timestamp = nowIso();
    if (existing) update.run(JSON.stringify(next), timestamp, existing.business_id);
    else insert.run(randomUUID(), row.business_id, JSON.stringify(next), SYSTEM_ACTOR, timestamp, timestamp);
    result[rowCounterKey] += 1;
    result[fieldCounterKey] += changed.length;
  }
}

function reconcileResearchOverlays(db, result) {
  if (!requiredTablesExist(db, ['crm_research_enrichment_snapshot', 'crm_research_import_execution_item', 'crm_research_import_batch', 'external_mapping'])) return;
  const excludeAuthority = authoritativeExclusion(db, 'e.business_id');
  const rows = db.prepare(`
    SELECT s.batch_id,s.row_number,s.snapshot_json AS enrichment_snapshot_json,e.business_id,b.created_at AS batch_created_at
    FROM crm_research_enrichment_snapshot s
    JOIN crm_research_import_execution_item e
      ON e.batch_id=s.batch_id AND e.row_number=s.row_number AND e.status='COMPLETE'
    JOIN crm_research_import_batch b ON b.id=s.batch_id
    WHERE EXISTS (
      SELECT 1 FROM external_mapping m
      WHERE m.business_type='Account' AND m.business_id=e.business_id
    )
    ${excludeAuthority}
    ORDER BY b.created_at DESC,s.row_number ASC
  `).all();
  reconcileOverlayTable(db, rows, 'crm_research_intelligence', 'intelligence', RESEARCH_INTELLIGENCE_FIELDS, 'researchIntelligenceRowsUpdated', 'researchIntelligenceFieldsFilled', result);
  reconcileOverlayTable(db, rows, 'crm_sales_signal', 'salesSignal', SALES_SIGNAL_FIELDS, 'salesSignalRowsUpdated', 'salesSignalFieldsFilled', result);
  reconcileOverlayTable(db, rows, 'crm_energy_discovery', 'energyDiscovery', ENERGY_DISCOVERY_FIELDS, 'energyDiscoveryRowsUpdated', 'energyDiscoveryFieldsFilled', result);
}

export function reconcileHistoricalResearchImports() {
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  const result = {
    orphanRegistrationIdentitiesRemoved: 0,
    orphanCompanyStatesRemoved: 0,
    companyRowsUpdated: 0,
    companyFieldsFilled: 0,
    researchIntelligenceRowsUpdated: 0,
    researchIntelligenceFieldsFilled: 0,
    salesSignalRowsUpdated: 0,
    salesSignalFieldsFilled: 0,
    energyDiscoveryRowsUpdated: 0,
    energyDiscoveryFieldsFilled: 0,
  };
  try {
    db.exec('BEGIN IMMEDIATE');
    purgeOrphanImportedIdentities(db, result);
    reconcileCompanyProfiles(db, result);
    reconcileResearchOverlays(db, result);
    writeGlobalAudit(db, result);
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  } finally {
    db.close();
  }
}
