import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const HEADERS = [
  '开发排名', 'GBAP价值评分', '开发优先级', '销售状态', '当前项目阶段', '销售负责人',
  '首次联系日期', '最后联系日期', '下次跟进日期', '客户反馈/关键异议', '数据核验等级', '公司名称',
  '商业名称', 'RUC', '私营企业核验', '官网', 'LinkedIn', '行业大类', '行业细分', '主营产品/服务',
  '为什么值得开发', '省/州', '城市', '主要工厂/运营地址', 'Google Maps核验链接', '公司电话',
  '公司邮箱', '公司WhatsApp', '法人/代表人', '法人/代表人职务', '首选业务决策人',
  '首选业务决策人联系方式', '工厂/运营负责人', '工厂/运营负责人联系方式', '工程/能源/维护负责人',
  '工程/能源联系方式', '采购负责人', '采购联系方式', '联系人核验状态', '推荐优先寻找职位',
  '2025营收USD', '员工人数', '规模等级', '规模判断依据', '工厂/主要场址数', '生产/运营时长',
  '工艺/运营特征', '主要耗电设备', '潜在用电等级', '潜在峰值负荷估算kW', '潜在月用电估算kWh',
  '能源估算置信度', '用电判断依据', '已知实际用电/能源数据', '实际用电数据来源', '供电/停电痛点',
  '现有发电机/备用电源', '现有光伏/储能', '屋顶/场地条件', '光伏机会', '储能机会', '发电机机会',
  '变压器/电气机会', '最佳匹配产品/方案', '建议首推切入点', '预计项目规模', '推荐开发渠道',
  '首封开发主题', '首次联系建议', '关键核验来源', '关键核验结论', '关键证据URL',
  '数据完整度/深挖状态', '核验日期', '下一步动作',
];
const PROTECTED = new Set(['销售状态', '当前项目阶段', '销售负责人', '首次联系日期', '最后联系日期', '下次跟进日期', '客户反馈/关键异议']);
const AUTHORITATIVE = HEADERS.filter((header) => !PROTECTED.has(header));
assert.equal(HEADERS.length, 75);
assert.equal(AUTHORITATIVE.length, 68);

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
async function request(base, path, token, method = 'GET', body = undefined) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json();
  return { response, payload };
}
function allFields(overrides = {}) {
  return Object.fromEntries(AUTHORITATIVE.map((header) => [header, Object.prototype.hasOwnProperty.call(overrides, header) ? overrides[header] : '']));
}
function seedBase(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE audit_event (
      id TEXT PRIMARY KEY,actor_subject TEXT NOT NULL,actor_username TEXT,action TEXT NOT NULL,target TEXT NOT NULL,occurred_at TEXT NOT NULL,payload_json TEXT NOT NULL
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
    CREATE TABLE crm_business_state (
      business_type TEXT NOT NULL,business_id TEXT NOT NULL,state_json TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(business_type,business_id)
    );
  `);
  const businessId = 'company-authoritative-1';
  const now = '2026-09-16T04:00:00.000Z';
  db.prepare("INSERT INTO crm_business_state(business_type,business_id,state_json,updated_at) VALUES('Account',?,?,?)").run(
    businessId,
    JSON.stringify({
      displayName: 'OLD NAME',
      website: 'https://old.example',
      industry: '旧行业',
      relationshipStatus: 'CONTACTED',
      accountOwnerUserId: 'sales-owner-1',
      firstContactAt: '2026-08-01',
      profile75Overrides: { '行业大类': '人工旧覆盖', '销售负责人': 'protected-owner-override' },
    }),
    now,
  );
  db.close();
  return businessId;
}
function seedBatch(dbPath, businessId, batchId, rowNumber, digest) {
  const db = new DatabaseSync(dbPath);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO crm_research_import_batch(id,schema_version,source_name,file_name,source_digest,row_count,status,actor_subject,actor_username,created_at,updated_at,summary_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(batchId, 'EC_TOP500_V46', 'EC_TOP500_V46_20260915', 'v46.csv', digest, 1, 'DRY_RUN_READY', 'admin', 'admin', now, now, '{}');
  db.prepare(`INSERT INTO crm_research_import_item(batch_id,row_number,registration_country,registration_type,registration_id,display_name,research_rank,match_business_id,proposed_action,reason,snapshot_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(batchId, rowNumber, 'EC', 'RUC', '0991234567001', 'CSV Company', 1, businessId, 'UPDATE', 'registration_identity_registry_match', '{}');
  db.prepare(`INSERT INTO crm_research_import_execution_item(batch_id,row_number,business_id,action,status,attempt_count,provider_id,external_id,error_code,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(batchId, rowNumber, businessId, 'UPDATE', 'COMPLETE', 1, 'twenty', `ext-${batchId}`, null, now, now);
  db.close();
}
function markCompanyExecutionComplete(dbPath, batchId) {
  const db = new DatabaseSync(dbPath);
  db.prepare("UPDATE crm_research_import_batch SET status='EXECUTED',updated_at=? WHERE id=?").run(new Date().toISOString(), batchId);
  db.close();
}

test('TOP500 authoritative profile replaces all 68 CSV fields on reimport while protecting operational sales truth', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'gbap-authoritative-profile-'));
  const dbPath = join(work, 'substrate.db');
  const businessId = seedBase(dbPath);
  const batch1 = randomUUID();
  seedBatch(dbPath, businessId, batch1, 2, 'a'.repeat(64));

  const kid = 'authoritative-profile-key';
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
  const { createResearchAuthoritativeProfileHandler } = await import(`../research-authoritative-profile.mjs?test=${Date.now()}`);
  const handler = createResearchAuthoritativeProfileHandler();
  const api = http.createServer(async (req, res) => { if (await handler(req, res)) return; res.writeHead(404).end(); });
  const apiPort = await listen(api);
  const base = `http://127.0.0.1:${apiPort}`;
  const admin = tokenFor(privateKey, kid, issuer, ['substrate-user', 'substrate-admin'], 'admin');
  const employee = tokenFor(privateKey, kid, issuer, ['substrate-user'], 'employee');
  t.after(() => { api.close(); jwks.close(); rmSync(work, { recursive: true, force: true }); });

  const firstFields = allFields({
    '开发排名': '1',
    'GBAP价值评分': '94',
    '数据核验等级': 'A+',
    '公司名称': 'CSV NEW NAME S.A.',
    '商业名称': 'CSV NEW',
    RUC: '0991234567001',
    '官网': 'https://new.example',
    LinkedIn: 'https://linkedin.com/company/new',
    '行业大类': '制造业',
    '公司电话': '+593 4 123 4567',
    '公司邮箱': 'energy@example.com',
    '2025营收USD': '12500000',
    '员工人数': '320',
    '工厂/主要场址数': '43个开放场址（SRI 2026；46个登记）',
    '潜在峰值负荷估算kW': '6000-15000',
    '潜在月用电估算kWh': '3000000-9000000',
    '主要耗电设备': '压缩机；电机；连续生产线',
    '下一步动作': '核实真实电费账单',
  });

  const denied = await request(base, `/api/crm-native/research-intake/batches/${batch1}/authoritative-snapshots`, employee, 'POST', { rows: [{ rowNumber: 2, fields: firstFields }] });
  assert.equal(denied.response.status, 403);

  const malformed = { ...firstFields, '销售负责人': 'must-not-import' };
  const rejected = await request(base, `/api/crm-native/research-intake/batches/${batch1}/authoritative-snapshots`, admin, 'POST', { rows: [{ rowNumber: 2, fields: malformed }] });
  assert.equal(rejected.response.status, 409);

  const attached = await request(base, `/api/crm-native/research-intake/batches/${batch1}/authoritative-snapshots`, admin, 'POST', { rows: [{ rowNumber: 2, fields: firstFields }] });
  assert.equal(attached.response.status, 200, JSON.stringify(attached.payload));
  assert.equal(attached.payload.authoritativeFieldCount, 68);
  markCompanyExecutionComplete(dbPath, batch1);

  const executed = await request(base, `/api/crm-native/research-intake/batches/${batch1}/execute-authoritative`, admin, 'POST', { confirmation: 'EXECUTE_TOP500_AUTHORITATIVE_PROFILE' });
  assert.equal(executed.response.status, 200, JSON.stringify(executed.payload));
  assert.equal(executed.payload.status, 'AUTHORITATIVE_EXECUTED');
  assert.equal(executed.payload.authoritativeExecution.protectedOperationalWriteCount, 0);

  let db = new DatabaseSync(dbPath);
  let profile = JSON.parse(db.prepare('SELECT fields_json FROM crm_research_authoritative_profile WHERE account_business_id=?').get(businessId).fields_json);
  assert.equal(Object.keys(profile).length, 68);
  assert.equal(profile['工厂/主要场址数'], '43个开放场址（SRI 2026；46个登记）');
  assert.equal(profile['潜在峰值负荷估算kW'], '6000-15000');
  assert.equal(profile['潜在月用电估算kWh'], '3000000-9000000');
  assert.equal(profile['主要耗电设备'], '压缩机；电机；连续生产线');
  let state = JSON.parse(db.prepare("SELECT state_json FROM crm_business_state WHERE business_type='Account' AND business_id=?").get(businessId).state_json);
  assert.equal(state.displayName, 'CSV NEW NAME S.A.');
  assert.equal(state.website, 'https://new.example');
  assert.equal(state.industry, '制造业');
  assert.equal(state.relationshipStatus, 'CONTACTED');
  assert.equal(state.accountOwnerUserId, 'sales-owner-1');
  assert.equal(state.firstContactAt, '2026-08-01');
  assert.deepEqual(state.profile75Overrides, { '销售负责人': 'protected-owner-override' });
  db.close();

  const retry = await request(base, `/api/crm-native/research-intake/batches/${batch1}/execute-authoritative`, admin, 'POST', { confirmation: 'EXECUTE_TOP500_AUTHORITATIVE_PROFILE' });
  assert.equal(retry.response.status, 200);
  assert.equal(retry.payload.idempotent, true);

  const batch2 = randomUUID();
  seedBatch(dbPath, businessId, batch2, 2, 'b'.repeat(64));
  const secondFields = { ...firstFields, '行业大类': '食品加工', '官网': '', '潜在峰值负荷估算kW': '8000-18000', '下一步动作': '' };
  const attached2 = await request(base, `/api/crm-native/research-intake/batches/${batch2}/authoritative-snapshots`, admin, 'POST', { rows: [{ rowNumber: 2, fields: secondFields }] });
  assert.equal(attached2.response.status, 200, JSON.stringify(attached2.payload));
  markCompanyExecutionComplete(dbPath, batch2);

  const executed2 = await request(base, `/api/crm-native/research-intake/batches/${batch2}/execute-authoritative`, admin, 'POST', { confirmation: 'EXECUTE_TOP500_AUTHORITATIVE_PROFILE' });
  assert.equal(executed2.response.status, 200, JSON.stringify(executed2.payload));
  assert.equal(executed2.payload.status, 'AUTHORITATIVE_EXECUTED');

  db = new DatabaseSync(dbPath);
  profile = JSON.parse(db.prepare('SELECT fields_json FROM crm_research_authoritative_profile WHERE account_business_id=?').get(businessId).fields_json);
  assert.equal(profile['行业大类'], '食品加工');
  assert.equal(profile['官网'], '');
  assert.equal(profile['潜在峰值负荷估算kW'], '8000-18000');
  assert.equal(profile['下一步动作'], '');
  state = JSON.parse(db.prepare("SELECT state_json FROM crm_business_state WHERE business_type='Account' AND business_id=?").get(businessId).state_json);
  assert.equal(state.industry, '食品加工');
  assert.equal(state.website, null);
  assert.equal(state.relationshipStatus, 'CONTACTED');
  assert.equal(state.accountOwnerUserId, 'sales-owner-1');
  assert.equal(state.firstContactAt, '2026-08-01');
  db.close();

  const listed = await request(base, '/api/crm-native/research-authoritative-profiles', employee);
  assert.equal(listed.response.status, 200);
  assert.equal(listed.payload.profiles.length, 1);
  assert.equal(listed.payload.profiles[0].fields['行业大类'], '食品加工');
  assert.equal(listed.payload.profiles[0].fields['潜在峰值负荷估算kW'], '8000-18000');
});
