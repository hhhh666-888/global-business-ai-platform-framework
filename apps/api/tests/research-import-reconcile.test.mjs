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
    CREATE TABLE crm_registration_identity (
      registration_country TEXT NOT NULL,registration_type TEXT NOT NULL,registration_id TEXT NOT NULL,business_id TEXT NOT NULL UNIQUE,
      first_import_batch_id TEXT,last_import_batch_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
      PRIMARY KEY(registration_country,registration_type,registration_id)
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
    CREATE TABLE crm_research_profile_field_audit (
      id TEXT PRIMARY KEY,business_id TEXT NOT NULL,batch_id TEXT,field_key TEXT NOT NULL,old_value_json TEXT NOT NULL,new_value_json TEXT NOT NULL,
      merge_policy TEXT NOT NULL,actor_subject TEXT NOT NULL,actor_username TEXT,occurred_at TEXT NOT NULL
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
    CREATE TABLE audit_event (
      id TEXT PRIMARY KEY,actor_subject TEXT NOT NULL,actor_username TEXT,action TEXT NOT NULL,target TEXT NOT NULL,occurred_at TEXT NOT NULL,payload_json TEXT NOT NULL
    );
  `);
  const now = '2026-09-15T12:00:00.000Z';
  const batchId = 'batch-v46';
  const businessId = 'company-ejemplo';
  db.prepare(`INSERT INTO crm_research_import_batch(id,schema_version,source_name,file_name,source_digest,row_count,status,actor_subject,actor_username,created_at,updated_at,summary_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(batchId, 'EC_TOP500_V46', 'EC_TOP500_V46_20260915', 'v46.csv', null, 1, 'EXECUTED', 'admin', 'admin', now, now, '{}');
  db.prepare(`INSERT INTO external_mapping(id,business_type,business_id,provider_id,external_type,external_id,created_at) VALUES(?,?,?,?,?,?,?)`)
    .run('mapping-ejemplo', 'Account', businessId, 'twenty', 'company', 'ext-ejemplo', now);
  db.prepare(`INSERT INTO crm_business_state(business_type,business_id,state_json,updated_at) VALUES('Account',?,?,?)`).run(
    businessId,
    JSON.stringify({
      displayName: 'EXP. E IMP. EJEMPLO C. LTDA.',
      researchRank: null,
      strategicValueScore: '待补充',
      verificationGrade: '',
      primaryEmail: 'employee-maintained@example.com',
      accountOwnerUserId: 'sales-owner-1',
      relationshipStatus: 'CONTACTED',
    }),
    now,
  );
  const companySnapshot = {
    displayName: 'EXP. E IMP. EJEMPLO C. LTDA.',
    commercialName: 'EIEJEMPLO',
    registrationCountry: 'EC',
    registrationType: 'RUC',
    registrationId: '1290000001001',
    ownershipType: 'PRIVATE',
    verificationGrade: 'A+',
    strategicValueScore: 81,
    researchRank: 259,
    website: 'https://eiejemplo.com/',
    linkedinUrl: 'https://www.linkedin.com/company/eiejemplo',
    industry: '农业与农产品',
    primaryPhone: '052780254',
    primaryEmail: 'mxmanobanda@grupomanobanda.com',
    annualRevenue: 57405194.71,
    annualRevenueCurrency: 'USD',
    employeeCount: 708,
    source: 'EC_TOP500_V46_20260915',
  };
  db.prepare(`INSERT INTO crm_research_import_item(batch_id,row_number,registration_country,registration_type,registration_id,display_name,research_rank,match_business_id,proposed_action,reason,snapshot_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(batchId, 260, 'EC', 'RUC', '1290000001001', companySnapshot.displayName, 259, businessId, 'UPDATE', 'registration_identity_registry_match', JSON.stringify(companySnapshot));
  db.prepare(`INSERT INTO crm_research_import_execution_item(batch_id,row_number,business_id,action,status,attempt_count,provider_id,external_id,error_code,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(batchId, 260, businessId, 'UPDATE', 'COMPLETE', 1, 'twenty', 'ext-ejemplo', null, now, now);

  const enrichmentSnapshot = {
    evidence: {},
    intelligence: {
      researchPriority: 'A',
      industrySegment: '农业种植畜牧及相关服务',
      productsServices: '农业种植/畜牧养殖及农产品生产',
      researchRationale: '高价值能源客户',
      companyWhatsapp: null,
      companyScale: '中大型',
      recommendedSolution: '光伏+储能+备用电源',
      recommendedEntryPoint: '能源成本与供电稳定性',
      estimatedProjectScale: '待现场确认',
      recommendedChannel: '电话/邮件',
      firstOutreachSubject: '综合能源方案',
      firstContactGuidance: '先核实真实用电数据',
      researchCompleteness: 'A级',
      researchNextAction: '联系能源负责人',
    },
    salesSignal: { solarOpportunity: '高', storageOpportunity: '高', generatorOpportunity: '高', electricalOpportunity: '高' },
    energyDiscovery: { publicKnownEnergyData: '暂无公开实测用电数据' },
    source: 'EC_TOP500_V46_20260915',
  };
  db.prepare(`INSERT INTO crm_research_enrichment_snapshot(batch_id,row_number,snapshot_json,created_at,updated_at) VALUES(?,?,?,?,?)`)
    .run(batchId, 260, JSON.stringify(enrichmentSnapshot), now, now);
  db.prepare(`INSERT INTO crm_research_intelligence(business_id,account_business_id,state_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)`)
    .run(randomUUID(), businessId, JSON.stringify({ researchPriority: '待补充', industrySegment: '员工已核行业细分' }), 'employee', now, now);

  // Reproduces the old permanent-delete bug: imported identity/state survived after
  // the canonical Account mapping was destroyed.
  const orphanBusinessId = 'destroyed-telconet';
  db.prepare(`INSERT INTO crm_registration_identity(registration_country,registration_type,registration_id,business_id,first_import_batch_id,last_import_batch_id,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?)`).run('EC', 'RUC', '0990000000001', orphanBusinessId, batchId, batchId, now, now);
  db.prepare(`INSERT INTO crm_business_state(business_type,business_id,state_json,updated_at) VALUES('Account',?,?,?)`)
    .run(orphanBusinessId, JSON.stringify({ registrationCountry: 'EC', registrationType: 'RUC', registrationId: '0990000000001', researchRank: 1 }), now);

  db.close();
  return { batchId, businessId, orphanBusinessId };
}

test('historical completed TOP500 batches fill missing research projections without overwriting employee or sales truth', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'gbap-research-reconcile-'));
  const dbPath = join(work, 'substrate.db');
  const { businessId, orphanBusinessId } = seed(dbPath);
  process.env.DB_PATH = dbPath;
  const { reconcileHistoricalResearchImports } = await import(`../research-import-reconcile.mjs?test=${Date.now()}`);
  t.after(() => rmSync(work, { recursive: true, force: true }));

  const first = reconcileHistoricalResearchImports();
  assert.equal(first.orphanRegistrationIdentitiesRemoved, 1);
  assert.equal(first.orphanCompanyStatesRemoved, 1);
  assert.equal(first.companyRowsUpdated, 1);
  assert.ok(first.companyFieldsFilled >= 11);
  assert.equal(first.researchIntelligenceRowsUpdated, 1);
  assert.ok(first.researchIntelligenceFieldsFilled >= 1);
  assert.equal(first.salesSignalRowsUpdated, 1);
  assert.equal(first.energyDiscoveryRowsUpdated, 1);

  const db = new DatabaseSync(dbPath);
  const state = JSON.parse(db.prepare("SELECT state_json FROM crm_business_state WHERE business_type='Account' AND business_id=?").get(businessId).state_json);
  assert.equal(state.researchRank, 259);
  assert.equal(state.strategicValueScore, 81);
  assert.equal(state.verificationGrade, 'A+');
  assert.equal(state.commercialName, 'EIEJEMPLO');
  assert.equal(state.primaryPhone, '052780254');
  assert.equal(state.primaryEmail, 'employee-maintained@example.com');
  assert.equal(state.website, 'https://eiejemplo.com/');
  assert.equal(state.linkedinUrl, 'https://www.linkedin.com/company/eiejemplo');
  assert.equal(state.annualRevenue, 57405194.71);
  assert.equal(state.annualRevenueCurrency, 'USD');
  assert.equal(state.accountOwnerUserId, 'sales-owner-1');
  assert.equal(state.relationshipStatus, 'CONTACTED');

  const orphanIdentity = db.prepare('SELECT 1 FROM crm_registration_identity WHERE business_id=?').get(orphanBusinessId);
  const orphanState = db.prepare("SELECT 1 FROM crm_business_state WHERE business_type='Account' AND business_id=?").get(orphanBusinessId);
  assert.equal(orphanIdentity, undefined);
  assert.equal(orphanState, undefined);

  const intelligence = JSON.parse(db.prepare('SELECT state_json FROM crm_research_intelligence WHERE account_business_id=?').get(businessId).state_json);
  assert.equal(intelligence.researchPriority, 'A');
  assert.equal(intelligence.industrySegment, '员工已核行业细分');
  assert.equal(intelligence.companyScale, '中大型');
  const signals = JSON.parse(db.prepare('SELECT state_json FROM crm_sales_signal WHERE account_business_id=?').get(businessId).state_json);
  assert.equal(signals.solarOpportunity, '高');
  const energy = JSON.parse(db.prepare('SELECT state_json FROM crm_energy_discovery WHERE account_business_id=?').get(businessId).state_json);
  assert.equal(energy.publicKnownEnergyData, '暂无公开实测用电数据');

  const fieldAudit = db.prepare("SELECT COUNT(*) AS count FROM crm_research_profile_field_audit WHERE business_id=? AND merge_policy='RESEARCH_FILL_RECONCILE'").get(businessId).count;
  assert.ok(fieldAudit >= 11);
  const globalAudit = db.prepare("SELECT COUNT(*) AS count FROM audit_event WHERE action='crm.research_import.reconcile'").get().count;
  assert.equal(globalAudit, 1);
  db.close();

  const second = reconcileHistoricalResearchImports();
  assert.deepEqual(second, {
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

  const afterRetry = new DatabaseSync(dbPath);
  const auditCountAfterRetry = afterRetry.prepare("SELECT COUNT(*) AS count FROM audit_event WHERE action='crm.research_import.reconcile'").get().count;
  assert.equal(auditCountAfterRetry, 1);
  afterRetry.close();
});
