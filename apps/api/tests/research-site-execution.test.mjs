import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
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
async function post(base, path, token, body) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const payload = await response.json();
  return { response, payload };
}
function siteKey(province, city, address) {
  const compact = (value) => String(value ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  const identity = [compact(province), compact(city), compact(address)].filter(Boolean).join('|');
  return `ADDR:${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`;
}
function seed(dbPath, rowCount = 61) {
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
      reason TEXT, snapshot_json TEXT NOT NULL, PRIMARY KEY (batch_id,row_number),
      UNIQUE(batch_id,registration_country,registration_type,registration_id)
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
  db.prepare(`INSERT INTO crm_research_import_batch(id,schema_version,source_name,file_name,source_digest,row_count,status,actor_subject,actor_username,created_at,updated_at,summary_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(batchId, 'EC_TOP500_V46', 'EC_TOP500_V46_20260915', 'site-test.csv', null, rowCount, 'DRY_RUN_READY', 'seed', 'seed', now, now, JSON.stringify({ create: rowCount, update: 0, conflict: 0, protectedOperationalWriteCount: 0 }));
  const insertItem = db.prepare(`INSERT INTO crm_research_import_item(batch_id,row_number,registration_country,registration_type,registration_id,display_name,research_rank,match_business_id,proposed_action,reason,snapshot_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
  const insertExec = db.prepare(`INSERT INTO crm_research_import_execution_item(batch_id,row_number,business_id,action,status,attempt_count,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?)`);
  const businessIds = [];
  for (let index = 0; index < rowCount; index += 1) {
    const rowNumber = index + 2;
    const businessId = randomUUID();
    businessIds.push(businessId);
    const ruc = `09990000${String(index).padStart(5, '0')}`.slice(0, 13);
    insertItem.run(batchId, rowNumber, 'EC', 'RUC', ruc, `Research Company ${index + 1}`, index + 1, null, 'CREATE', 'test', JSON.stringify({ displayName: `Research Company ${index + 1}` }));
    insertExec.run(batchId, rowNumber, businessId, 'CREATE', 'COMPLETE', 1, now, now);
  }
  db.close();
  return { batchId, businessIds };
}

test('TOP500 Research Site snapshots execute resumably and replace research fields from the latest CSV', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'gbap-research-site-'));
  const dbPath = join(work, 'substrate.db');
  const { batchId, businessIds } = seed(dbPath, 61);

  const kid = 'research-site-key';
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' }); publicJwk.kid = kid; publicJwk.alg = 'RS256'; publicJwk.use = 'sig';
  const jwks = http.createServer((req, res) => {
    if (req.url === '/certs') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ keys: [publicJwk] })); return; }
    res.writeHead(404).end();
  });
  const jwksPort = await listen(jwks);
  const issuer = `http://127.0.0.1:${jwksPort}/realms/gbap`;
  Object.assign(process.env, {
    DB_PATH: dbPath, OIDC_ISSUER: issuer, OIDC_ALLOWED_ISSUERS: issuer,
    OIDC_JWKS_URL_INTERNAL: `http://127.0.0.1:${jwksPort}/certs`, OIDC_CLIENT_ID: 'gbap-web',
  });
  const { createResearchSiteExecutionHandler } = await import(`../research-site-execution.mjs?test=${Date.now()}`);
  const handler = createResearchSiteExecutionHandler();
  const api = http.createServer(async (req, res) => { if (await handler(req, res)) return; res.writeHead(404).end(); });
  const apiPort = await listen(api);
  const base = `http://127.0.0.1:${apiPort}`;
  const admin = tokenFor(privateKey, kid, issuer, ['substrate-user', 'substrate-admin'], 'admin');
  const employee = tokenFor(privateKey, kid, issuer, ['substrate-user'], 'employee');
  t.after(() => { api.close(); jwks.close(); rmSync(work, { recursive: true, force: true }); });

  const sites = Array.from({ length: 61 }, (_, index) => ({
    rowNumber: index + 2,
    siteSnapshot: index === 60 ? {
      province: 'Guayas', city: 'Guayaquil', address: null, googleMapsUrl: null,
      reportedSiteCount: '2个登记场址', operatingProfile: '24h', source: 'EC_TOP500_V46_20260915',
    } : {
      province: index === 0 ? 'Pichincha' : 'Guayas',
      city: index === 0 ? 'Quito' : 'Guayaquil',
      address: index === 0 ? 'Parque Industrial Norte' : `Industrial Road ${index}`,
      googleMapsUrl: null,
      reportedSiteCount: index === 0 ? '43个开放场址（SRI 2026；46个登记）' : '1',
      operatingProfile: '24h / 7d',
      processOperatingCharacteristics: 'continuous production',
      keyEquipmentText: 'motors; compressors; production lines',
      estimatedEnergyGrade: 'HIGH',
      estimatedPeakDemandKw: index === 0 ? '6000-15000' : String(1000 + index),
      estimatedMonthlyConsumptionKwh: index === 0 ? '3000000-9000000' : String(400000 + index * 1000),
      energyPainPoints: 'research outage estimate',
      existingGeneratorBackup: 'unknown',
      existingSolarStorage: 'none verified',
      roofSiteConditions: 'large roof from public imagery',
      source: 'EC_TOP500_V46_20260915',
    },
  }));

  const deniedAttach = await post(base, `/api/crm-native/research-intake/batches/${batchId}/site-snapshots`, employee, { sites });
  assert.equal(deniedAttach.response.status, 403);

  const attached = await post(base, `/api/crm-native/research-intake/batches/${batchId}/site-snapshots`, admin, { sites });
  assert.equal(attached.response.status, 200, JSON.stringify(attached.payload));
  assert.equal(attached.payload.rowCount, 61);
  assert.equal(attached.payload.identifiedCount, 60);

  const db = new DatabaseSync(dbPath);
  const existingSiteId = randomUUID();
  const existingState = {
    siteName: 'Employee Quito Plant', province: 'Pichincha', city: 'Quito', address: 'Parque Industrial Norte',
    energyPainPoints: 'old research value', roofSiteConditions: null,
  };
  const now = new Date().toISOString();
  db.prepare('INSERT INTO crm_site(business_id,account_business_id,site_key,state_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(
    existingSiteId, businessIds[0], siteKey('Pichincha', 'Quito', 'Parque Industrial Norte'), JSON.stringify(existingState), 'employee', now, now,
  );
  db.prepare("UPDATE crm_research_import_batch SET status='EXECUTED' WHERE id=?").run(batchId);
  db.close();

  const deniedExecute = await post(base, `/api/crm-native/research-intake/batches/${batchId}/execute-sites`, employee, { confirmation: 'EXECUTE_TOP500_RESEARCH_SITES' });
  assert.equal(deniedExecute.response.status, 403);

  const first = await post(base, `/api/crm-native/research-intake/batches/${batchId}/execute-sites`, admin, { confirmation: 'EXECUTE_TOP500_RESEARCH_SITES' });
  assert.equal(first.response.status, 200, JSON.stringify(first.payload));
  assert.equal(first.payload.status, 'SITE_EXECUTION_CONTINUE');
  assert.equal(first.payload.hasMore, true);
  assert.equal(first.payload.remaining, 1);
  assert.equal(first.payload.siteExecution.created, 59);
  assert.equal(first.payload.siteExecution.updated, 1);
  assert.equal(first.payload.siteExecution.skippedNoIdentity, 0);

  const second = await post(base, `/api/crm-native/research-intake/batches/${batchId}/execute-sites`, admin, { confirmation: 'EXECUTE_TOP500_RESEARCH_SITES' });
  assert.equal(second.response.status, 200, JSON.stringify(second.payload));
  assert.equal(second.payload.status, 'SITE_EXECUTED');
  assert.equal(second.payload.remaining, 0);
  assert.equal(second.payload.siteExecution.created, 59);
  assert.equal(second.payload.siteExecution.updated, 1);
  assert.equal(second.payload.siteExecution.skippedNoIdentity, 1);
  assert.equal(second.payload.siteExecution.failed, 0);

  const retry = await post(base, `/api/crm-native/research-intake/batches/${batchId}/execute-sites`, admin, { confirmation: 'EXECUTE_TOP500_RESEARCH_SITES' });
  assert.equal(retry.response.status, 200);
  assert.equal(retry.payload.idempotent, true);

  const verifyDb = new DatabaseSync(dbPath);
  const siteCount = verifyDb.prepare('SELECT COUNT(*) AS count FROM crm_site').get();
  assert.equal(siteCount.count, 60);
  const employeeSite = verifyDb.prepare('SELECT state_json FROM crm_site WHERE business_id=?').get(existingSiteId);
  const employeeState = JSON.parse(employeeSite.state_json);
  assert.equal(employeeState.energyPainPoints, 'research outage estimate');
  assert.equal(employeeState.roofSiteConditions, 'large roof from public imagery');
  assert.equal(employeeState.reportedSiteCount, '43个开放场址（SRI 2026；46个登记）');
  assert.equal(employeeState.estimatedPeakDemandKw, '6000-15000');
  assert.equal(employeeState.estimatedMonthlyConsumptionKwh, '3000000-9000000');
  const journal = verifyDb.prepare("SELECT COUNT(*) AS count FROM crm_research_site_execution_item WHERE batch_id=? AND status IN ('COMPLETE','SKIPPED')").get(batchId);
  assert.equal(journal.count, 61);
  const audits = verifyDb.prepare("SELECT COUNT(*) AS count FROM audit_event WHERE action='crm.research_intake.site_execute_item'").get();
  assert.equal(audits.count, 61);
  verifyDb.close();
});
