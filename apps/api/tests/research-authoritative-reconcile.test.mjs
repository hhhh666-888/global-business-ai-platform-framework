import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

function seed(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE external_mapping (
      id TEXT PRIMARY KEY,business_type TEXT NOT NULL,business_id TEXT NOT NULL,provider_id TEXT NOT NULL,
      external_type TEXT NOT NULL,external_id TEXT NOT NULL,created_at TEXT NOT NULL
    );
    CREATE TABLE crm_business_state (
      business_type TEXT NOT NULL,business_id TEXT NOT NULL,state_json TEXT NOT NULL,updated_at TEXT NOT NULL,
      PRIMARY KEY(business_type,business_id)
    );
    CREATE TABLE crm_research_import_batch (
      id TEXT PRIMARY KEY,schema_version TEXT NOT NULL,source_name TEXT NOT NULL,file_name TEXT,source_digest TEXT,row_count INTEGER NOT NULL,
      status TEXT NOT NULL,actor_subject TEXT NOT NULL,actor_username TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,summary_json TEXT NOT NULL
    );
    CREATE TABLE crm_research_import_item (
      batch_id TEXT NOT NULL,row_number INTEGER NOT NULL,registration_country TEXT NOT NULL,registration_type TEXT NOT NULL,registration_id TEXT NOT NULL,
      display_name TEXT NOT NULL,research_rank INTEGER,match_business_id TEXT,proposed_action TEXT NOT NULL,reason TEXT,snapshot_json TEXT NOT NULL,
      PRIMARY KEY(batch_id,row_number)
    );
    CREATE TABLE crm_research_import_execution_item (
      batch_id TEXT NOT NULL,row_number INTEGER NOT NULL,business_id TEXT NOT NULL,action TEXT NOT NULL,status TEXT NOT NULL,attempt_count INTEGER NOT NULL DEFAULT 0,
      provider_id TEXT,external_id TEXT,error_code TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(batch_id,row_number)
    );
    CREATE TABLE crm_research_enrichment_snapshot (
      batch_id TEXT NOT NULL,row_number INTEGER NOT NULL,snapshot_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(batch_id,row_number)
    );
    CREATE TABLE crm_research_intelligence (
      business_id TEXT PRIMARY KEY,account_business_id TEXT NOT NULL UNIQUE,state_json TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
    );
    CREATE TABLE crm_sales_signal (
      business_id TEXT PRIMARY KEY,account_business_id TEXT NOT NULL UNIQUE,state_json TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
    );
    CREATE TABLE crm_energy_discovery (
      business_id TEXT PRIMARY KEY,account_business_id TEXT NOT NULL UNIQUE,state_json TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
    );
    CREATE TABLE crm_research_authoritative_profile (
      account_business_id TEXT PRIMARY KEY,batch_id TEXT NOT NULL,row_number INTEGER NOT NULL,schema_version TEXT NOT NULL,
      source_name TEXT NOT NULL,source_digest TEXT,fields_json TEXT NOT NULL,updated_at TEXT NOT NULL
    );
  `);

  const now = '2026-09-16T04:00:00.000Z';
  const oldBatchId = 'old-batch';
  const latestBatchId = 'latest-authority-batch';
  const businessId = 'company-authority';
  db.prepare(`INSERT INTO external_mapping(id,business_type,business_id,provider_id,external_type,external_id,created_at)
    VALUES(?,?,?,?,?,?,?)`).run('mapping-1', 'Account', businessId, 'twenty', 'company', 'ext-1', now);
  db.prepare(`INSERT INTO crm_business_state(business_type,business_id,state_json,updated_at) VALUES('Account',?,?,?)`).run(
    businessId,
    JSON.stringify({
      displayName: 'Latest CSV Company',
      registrationCountry: 'EC',
      registrationType: 'RUC',
      registrationId: '0991234567001',
      website: null,
      researchRank: null,
      accountOwnerUserId: 'sales-owner-1',
      relationshipStatus: 'CONTACTED',
    }),
    now,
  );
  db.prepare(`INSERT INTO crm_research_import_batch(id,schema_version,source_name,file_name,source_digest,row_count,status,actor_subject,actor_username,created_at,updated_at,summary_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(oldBatchId, 'EC_TOP500_V46', 'EC_TOP500_V46_20260915', 'old.csv', 'a'.repeat(64), 1, 'EXECUTED', 'admin', 'admin', now, now, '{}');
  db.prepare(`INSERT INTO crm_research_import_item(batch_id,row_number,registration_country,registration_type,registration_id,display_name,research_rank,match_business_id,proposed_action,reason,snapshot_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
      oldBatchId, 2, 'EC', 'RUC', '0991234567001', 'Old CSV Company', 5, businessId, 'UPDATE', 'registration_identity_registry_match',
      JSON.stringify({ website: 'https://old.example', researchRank: 5, industry: '旧行业' }),
    );
  db.prepare(`INSERT INTO crm_research_import_execution_item(batch_id,row_number,business_id,action,status,attempt_count,provider_id,external_id,error_code,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(oldBatchId, 2, businessId, 'UPDATE', 'COMPLETE', 1, 'twenty', 'ext-1', null, now, now);
  db.prepare(`INSERT INTO crm_research_enrichment_snapshot(batch_id,row_number,snapshot_json,created_at,updated_at) VALUES(?,?,?,?,?)`).run(
    oldBatchId,
    2,
    JSON.stringify({
      intelligence: { researchPriority: 'A', researchNextAction: '旧动作' },
      salesSignal: { solarOpportunity: '高' },
      energyDiscovery: { publicKnownEnergyData: '旧能源数据' },
    }),
    now,
    now,
  );
  db.prepare(`INSERT INTO crm_research_intelligence(business_id,account_business_id,state_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)`).run(
    randomUUID(), businessId, JSON.stringify({ researchPriority: null, researchNextAction: null }), 'latest-import', now, now,
  );
  db.prepare(`INSERT INTO crm_sales_signal(business_id,account_business_id,state_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)`).run(
    randomUUID(), businessId, JSON.stringify({ solarOpportunity: null }), 'latest-import', now, now,
  );
  db.prepare(`INSERT INTO crm_energy_discovery(business_id,account_business_id,state_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)`).run(
    randomUUID(), businessId, JSON.stringify({ publicKnownEnergyData: null }), 'latest-import', now, now,
  );
  db.prepare(`INSERT INTO crm_research_authoritative_profile(account_business_id,batch_id,row_number,schema_version,source_name,source_digest,fields_json,updated_at)
    VALUES(?,?,?,?,?,?,?,?)`).run(
      businessId,
      latestBatchId,
      2,
      'EC_TOP500_V46',
      'EC_TOP500_V46_20260915',
      'b'.repeat(64),
      JSON.stringify({ '官网': '', '开发排名': '', '行业大类': '', '开发优先级': '', '光伏机会': '', '已知实际用电/能源数据': '', '下一步动作': '' }),
      now,
    );
  db.close();
  return businessId;
}

test('historical reconcile never resurrects values cleared by the latest 68-field CSV authority', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'gbap-authority-reconcile-'));
  const dbPath = join(work, 'substrate.db');
  const businessId = seed(dbPath);
  process.env.DB_PATH = dbPath;
  const { reconcileHistoricalResearchImports } = await import(`../research-import-reconcile.mjs?authority=${Date.now()}`);
  t.after(() => rmSync(work, { recursive: true, force: true }));

  const result = reconcileHistoricalResearchImports();
  assert.deepEqual(result, {
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
  });

  const db = new DatabaseSync(dbPath);
  const state = JSON.parse(db.prepare("SELECT state_json FROM crm_business_state WHERE business_type='Account' AND business_id=?").get(businessId).state_json);
  assert.equal(state.website, null);
  assert.equal(state.researchRank, null);
  assert.equal(state.industry, undefined);
  assert.equal(state.accountOwnerUserId, 'sales-owner-1');
  assert.equal(state.relationshipStatus, 'CONTACTED');

  const intelligence = JSON.parse(db.prepare('SELECT state_json FROM crm_research_intelligence WHERE account_business_id=?').get(businessId).state_json);
  const signal = JSON.parse(db.prepare('SELECT state_json FROM crm_sales_signal WHERE account_business_id=?').get(businessId).state_json);
  const energy = JSON.parse(db.prepare('SELECT state_json FROM crm_energy_discovery WHERE account_business_id=?').get(businessId).state_json);
  assert.equal(intelligence.researchPriority, null);
  assert.equal(intelligence.researchNextAction, null);
  assert.equal(signal.solarOpportunity, null);
  assert.equal(energy.publicKnownEnergyData, null);
  db.close();
});
