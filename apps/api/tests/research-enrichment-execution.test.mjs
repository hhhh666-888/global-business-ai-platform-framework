import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

function b64(value) { return Buffer.from(value).toString('base64url'); }
function tokenFor(privateKey, kid, issuer, roles, subject) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const payload = b64(JSON.stringify({ sub: subject, preferred_username: subject, iss: issuer, azp: 'gbap-web', iat: now, exp: now + 300, realm_access: { roles } }));
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
  return `${header}.${payload}.${signature}`;
}
async function listen(server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return server.address().port;
}
async function request(base, path, token, { method = 'POST', body } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function seed(dbPath, rowCount = 101) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE audit_event (
      id TEXT PRIMARY KEY, actor_subject TEXT NOT NULL, actor_username TEXT, action TEXT NOT NULL,
      target TEXT NOT NULL, occurred_at TEXT NOT NULL, payload_json TEXT NOT NULL
    );
    CREATE TABLE crm_research_import_batch (
      id TEXT PRIMARY KEY, schema_version TEXT NOT NULL, source_name TEXT NOT NULL, file_name TEXT, source_digest TEXT,
      row_count INTEGER NOT NULL, status TEXT NOT NULL, actor_subject TEXT NOT NULL, actor_username TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, summary_json TEXT NOT NULL
    );
    CREATE TABLE crm_research_import_item (
      batch_id TEXT NOT NULL REFERENCES crm_research_import_batch(id) ON DELETE CASCADE, row_number INTEGER NOT NULL,
      registration_country TEXT NOT NULL, registration_type TEXT NOT NULL, registration_id TEXT NOT NULL,
      display_name TEXT NOT NULL, research_rank INTEGER, match_business_id TEXT, proposed_action TEXT NOT NULL,
      reason TEXT, snapshot_json TEXT NOT NULL, PRIMARY KEY(batch_id,row_number)
    );
    CREATE TABLE crm_research_import_execution_item (
      batch_id TEXT NOT NULL REFERENCES crm_research_import_batch(id) ON DELETE CASCADE, row_number INTEGER NOT NULL,
      business_id TEXT NOT NULL, action TEXT NOT NULL, status TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0,
      provider_id TEXT, external_id TEXT, error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY(batch_id,row_number)
    );
  `);
  const batchId = randomUUID();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO crm_research_import_batch(
    id,schema_version,source_name,file_name,source_digest,row_count,status,actor_subject,actor_username,created_at,updated_at,summary_json
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    batchId, 'EC_TOP500_V46', 'EC_TOP500_V46_20260915', 'enrichment-test.csv', 'test-digest', rowCount,
    'DRY_RUN_READY', 'seed', 'seed', now, now,
    JSON.stringify({ create: rowCount, update: 0, conflict: 0, protectedOperationalWriteCount: 0 }),
  );
  const insertItem = db.prepare(`INSERT INTO crm_research_import_item(
    batch_id,row_number,registration_country,registration_type,registration_id,display_name,research_rank,match_business_id,proposed_action,reason,snapshot_json
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
  const insertExec = db.prepare(`INSERT INTO crm_research_import_execution_item(
    batch_id,row_number,business_id,action,status,attempt_count,provider_id,external_id,error_code,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
  const accountBusinessIds = [];
  for (let index = 0; index < rowCount; index += 1) {
    const rowNumber = index + 2;
    const accountBusinessId = randomUUID();
    accountBusinessIds.push(accountBusinessId);
    insertItem.run(batchId, rowNumber, 'EC', 'RUC', `09982222${String(index).padStart(5, '0')}`.slice(0, 13), `Research Company ${index + 1}`, index + 1, null, 'CREATE', 'test', '{}');
    insertExec.run(batchId, rowNumber, accountBusinessId, 'CREATE', 'COMPLETE', 1, 'provider', `company-${index + 1}`, null, now, now);
  }
  db.close();
  return { batchId, accountBusinessIds };
}

test('final TOP500 research enrichment is CSV-authoritative, resumable and employee-readable', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'gbap-research-enrichment-'));
  const dbPath = join(work, 'substrate.db');
  const { batchId, accountBusinessIds } = seed(dbPath, 101);

  const kid = 'research-enrichment-key';
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' });
  publicJwk.kid = kid; publicJwk.alg = 'RS256'; publicJwk.use = 'sig';
  const jwks = http.createServer((req, res) => {
    if (req.url === '/certs') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ keys: [publicJwk] })); return; }
    res.writeHead(404).end();
  });
  const jwksPort = await listen(jwks);
  const issuer = `http://127.0.0.1:${jwksPort}/realms/gbap`;
  Object.assign(process.env, { DB_PATH: dbPath, OIDC_ISSUER: issuer, OIDC_ALLOWED_ISSUERS: issuer, OIDC_JWKS_URL_INTERNAL: `http://127.0.0.1:${jwksPort}/certs`, OIDC_CLIENT_ID: 'gbap-web' });

  const { createResearchEnrichmentExecutionHandler } = await import(`../research-enrichment-execution.mjs?test=${Date.now()}`);
  const handler = createResearchEnrichmentExecutionHandler();
  const api = http.createServer(async (req, res) => { if (await handler(req, res)) return; res.writeHead(404).end(); });
  const apiPort = await listen(api);
  const base = `http://127.0.0.1:${apiPort}`;
  const admin = tokenFor(privateKey, kid, issuer, ['substrate-user', 'substrate-admin'], 'admin');
  const employee = tokenFor(privateKey, kid, issuer, ['substrate-user'], 'employee');
  t.after(() => { api.close(); jwks.close(); rmSync(work, { recursive: true, force: true }); });

  const rows = Array.from({ length: 101 }, (_, index) => ({
    rowNumber: index + 2,
    enrichmentSnapshot: {
      evidence: {
        ownershipVerification: '私营主体已核', contactVerification: index === 0 ? '联系人需继续核验' : null,
        companyScaleBasis: `公开规模依据 ${index + 1}`, energyEstimateConfidence: '中', energyEstimateBasis: '行业与设备估算',
        actualEnergyDataSource: null, sourceTitle: '官网；公开目录', statement: '公开资料交叉核验', sourceUrl: `https://example.com/evidence/${index + 1}`, verifiedAt: '2026-09-15',
      },
      intelligence: {
        researchPriority: index < 10 ? 'S' : 'A', industrySegment: '测试细分', productsServices: '测试产品', researchRationale: '高用能研究价值',
        companyWhatsapp: null, companyScale: '大型', recommendedSolution: '光储柴综合能源', recommendedEntryPoint: '先核用电与主变',
        estimatedProjectScale: '中大型', recommendedChannel: '官网/LinkedIn/总机', firstOutreachSubject: '能源成本与供电可靠性',
        firstContactGuidance: '先找能源或维护负责人', researchCompleteness: '公开资料闭环', researchNextAction: '索取12个月账单',
      },
      salesSignal: { solarOpportunity: '高', storageOpportunity: '中高', generatorOpportunity: '中', electricalOpportunity: '中' },
      energyDiscovery: { publicKnownEnergyData: `公开能源线索 ${index + 1}` },
      source: 'EC_TOP500_V46_20260915',
    },
  }));

  const deniedAttach = await request(base, `/api/crm-native/research-intake/batches/${batchId}/enrichment-snapshots`, employee, { body: { rows } });
  assert.equal(deniedAttach.response.status, 403);
  const attached = await request(base, `/api/crm-native/research-intake/batches/${batchId}/enrichment-snapshots`, admin, { body: { rows } });
  assert.equal(attached.response.status, 200, JSON.stringify(attached.payload));
  assert.equal(attached.payload.rowCount, 101);
  assert.equal(attached.payload.evidenceRows, 101);
  assert.equal(attached.payload.salesSignalRows, 101);
  assert.equal(attached.payload.energyDiscoveryRows, 101);
  assert.equal(attached.payload.intelligenceRows, 101);

  const db = new DatabaseSync(dbPath);
  const now = new Date().toISOString();
  db.prepare("INSERT INTO crm_research_intelligence(business_id,account_business_id,state_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)")
    .run(randomUUID(), accountBusinessIds[0], JSON.stringify({ recommendedSolution: 'OLD RESEARCH SOLUTION' }), 'employee', now, now);
  db.prepare("INSERT INTO crm_sales_signal(business_id,account_business_id,state_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)")
    .run(randomUUID(), accountBusinessIds[0], JSON.stringify({ solarOpportunity: 'OLD RESEARCH SOLAR' }), 'employee', now, now);
  db.prepare("INSERT INTO crm_energy_discovery(business_id,account_business_id,state_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)")
    .run(randomUUID(), accountBusinessIds[0], JSON.stringify({ publicKnownEnergyData: 'OLD RESEARCH ENERGY' }), 'employee', now, now);
  const currentSummary = JSON.parse(db.prepare('SELECT summary_json FROM crm_research_import_batch WHERE id=?').get(batchId).summary_json);
  db.prepare("UPDATE crm_research_import_batch SET status='EXECUTED',summary_json=?,updated_at=? WHERE id=?").run(
    JSON.stringify({
      ...currentSummary,
      siteExecution: { created: 101, updated: 0, unchanged: 0, skippedNoIdentity: 0, failed: 0, completedAt: now },
      contactExecution: { contactsCreated: 0, existingContactsLinked: 0, targetRolesOnly: 0, conflicts: 0, failed: 0, completedAt: now },
    }),
    now,
    batchId,
  );
  db.close();

  const deniedExecute = await request(base, `/api/crm-native/research-intake/batches/${batchId}/execute-enrichment`, employee, { body: { confirmation: 'EXECUTE_TOP500_RESEARCH_ENRICHMENT' } });
  assert.equal(deniedExecute.response.status, 403);

  const first = await request(base, `/api/crm-native/research-intake/batches/${batchId}/execute-enrichment`, admin, { body: { confirmation: 'EXECUTE_TOP500_RESEARCH_ENRICHMENT' } });
  assert.equal(first.response.status, 200, JSON.stringify(first.payload));
  assert.equal(first.payload.status, 'ENRICHMENT_EXECUTION_CONTINUE');
  assert.equal(first.payload.remaining, 1);
  assert.equal(first.payload.enrichmentExecution.evidenceAppended, 100);

  const second = await request(base, `/api/crm-native/research-intake/batches/${batchId}/execute-enrichment`, admin, { body: { confirmation: 'EXECUTE_TOP500_RESEARCH_ENRICHMENT' } });
  assert.equal(second.response.status, 200, JSON.stringify(second.payload));
  assert.equal(second.payload.status, 'ENRICHMENT_EXECUTED');
  assert.equal(second.payload.remaining, 0);
  assert.equal(second.payload.enrichmentExecution.evidenceAppended, 101);
  assert.equal(second.payload.enrichmentExecution.researchIntelligenceUpdated, 101);
  assert.equal(second.payload.enrichmentExecution.salesSignalsUpdated, 101);
  assert.equal(second.payload.enrichmentExecution.energyDiscoveryUpdated, 101);
  assert.equal(second.payload.enrichmentExecution.failed, 0);

  const employeeRead = await request(base, `/api/crm-native/research-enrichment?accountBusinessId=${encodeURIComponent(accountBusinessIds[0])}`, employee, { method: 'GET' });
  assert.equal(employeeRead.response.status, 200, JSON.stringify(employeeRead.payload));
  assert.equal(employeeRead.payload.evidence.length, 1);
  assert.equal(employeeRead.payload.researchIntelligence.recommendedSolution, '光储柴综合能源');
  assert.equal(employeeRead.payload.researchIntelligence.researchPriority, 'S');
  assert.equal(employeeRead.payload.salesSignal.solarOpportunity, '高');
  assert.equal(employeeRead.payload.salesSignal.storageOpportunity, '中高');
  assert.equal(employeeRead.payload.energyDiscovery.publicKnownEnergyData, '公开能源线索 1');

  const retry = await request(base, `/api/crm-native/research-intake/batches/${batchId}/execute-enrichment`, admin, { body: { confirmation: 'EXECUTE_TOP500_RESEARCH_ENRICHMENT' } });
  assert.equal(retry.response.status, 200);
  assert.equal(retry.payload.idempotent, true);

  const verify = new DatabaseSync(dbPath);
  assert.equal(verify.prepare('SELECT COUNT(*) AS count FROM crm_research_evidence').get().count, 101, 'evidence is append-once for this batch/row and retry does not duplicate');
  assert.equal(verify.prepare('SELECT COUNT(*) AS count FROM crm_research_intelligence').get().count, 101);
  assert.equal(verify.prepare('SELECT COUNT(*) AS count FROM crm_sales_signal').get().count, 101);
  assert.equal(verify.prepare('SELECT COUNT(*) AS count FROM crm_energy_discovery').get().count, 101);
  assert.equal(verify.prepare("SELECT COUNT(*) AS count FROM crm_research_enrichment_execution_item WHERE status='COMPLETE'").get().count, 101);
  const finalSummary = JSON.parse(verify.prepare('SELECT summary_json FROM crm_research_import_batch WHERE id=?').get(batchId).summary_json);
  assert.equal(finalSummary.protectedOperationalWriteCount, 0);
  assert.ok(finalSummary.enrichmentExecution.completedAt);
  assert.equal(verify.prepare("SELECT COUNT(*) AS count FROM audit_event WHERE action='crm.research_intake.enrichment_execute_item'").get().count, 101);
  verify.close();
});
