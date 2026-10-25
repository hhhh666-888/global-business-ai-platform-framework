import { getCachedJwk } from './jwks-cache.mjs';
import { createPublicKey, randomUUID, verify as verifySignature } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const DB_PATH = process.env.DB_PATH ?? '/data/substrate.db';
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:8080';
const OIDC_ISSUER = process.env.OIDC_ISSUER ?? 'http://localhost:8082/realms/gbap';
const OIDC_ALLOWED_ISSUERS = new Set((process.env.OIDC_ALLOWED_ISSUERS ?? OIDC_ISSUER).split(',').map((value) => value.trim()).filter(Boolean));
const OIDC_JWKS_URL_INTERNAL = process.env.OIDC_JWKS_URL_INTERNAL ?? 'http://keycloak:8080/realms/gbap/protocol/openid-connect/certs';
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID ?? 'gbap-web';

const CUSTOMER_SEGMENTS = ['INDUSTRIAL', 'CHANNEL', 'PROJECT', 'PUBLIC', 'OTHER'];
const CUSTOMER_ROLES = [
  'FACTORY', 'MINE', 'DATA_CENTER', 'COMMERCIAL_PARK', 'AGRICULTURE',
  'RENEWABLE_DISTRIBUTOR', 'GENERATOR_DISTRIBUTOR', 'ELECTRICAL_DISTRIBUTOR',
  'EPC', 'DEVELOPER', 'INVESTOR', 'UTILITY', 'GOVERNMENT',
];
const DEVELOPMENT_STAGES = ['NEW', 'CONTACTED', 'QUALIFYING', 'NEEDS_CONFIRMED', 'TECHNICAL_SAMPLE', 'QUOTATION', 'NEGOTIATION', 'DECISION', 'ORDER_PENDING', 'ORDER_CONFIRMED', 'ON_HOLD'];
const GRID_STABILITY = ['STABLE', 'OCCASIONAL_OUTAGE', 'FREQUENT_OUTAGE', 'SEVERE_OUTAGE', 'UNKNOWN'];
const ENERGY_NEEDS = ['SOLAR', 'STORAGE', 'DIESEL_GENERATOR', 'GAS_GENERATOR', 'TRANSFORMER', 'ELECTRICAL', 'MICROGRID', 'ENERGY_MANAGEMENT'];
const CHANNEL_PRODUCTS = ['SOLAR_MODULE', 'INVERTER', 'STORAGE', 'DIESEL_GENERATOR', 'GAS_GENERATOR', 'TRANSFORMER', 'ELECTRICAL', 'MICROGRID'];
const PURCHASE_FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'IRREGULAR'];

const TOP500_V46_HEADERS = [
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
const TOP500_V46_HEADER_SET = new Set(TOP500_V46_HEADERS);
if (TOP500_V46_HEADERS.length !== 75 || TOP500_V46_HEADER_SET.size !== 75) throw new Error('TOP500_V46_SERVER_FIELD_CONTRACT_INVALID');

const INTELLIGENCE_FIELDS = new Set([
  'customerSegment', 'customerRoles', 'developmentStage',
  'factoryCount', 'siteAreaSqm', 'buildingAreaSqm', 'roofAreaSqm', 'availableLandSqm',
  'operatingHoursPerDay', 'operatingDaysPerWeek', 'shiftsPerDay',
  'monthlyConsumptionKwh', 'annualConsumptionKwh', 'monthlyElectricityCost', 'electricityCostCurrency', 'electricityTariff', 'peakDemandKw',
  'gridStability', 'outageHoursPerMonth', 'transformerCapacityKva', 'generatorCapacityKw', 'existingSolarKw', 'existingStorageKwh',
  'keyEquipmentText', 'energyPainPoints', 'projectNeeds', 'projectBudget', 'projectBudgetCurrency', 'projectTimeline',
  'channelProducts', 'representedBrands', 'existingSuppliers', 'annualPurchaseValue', 'purchaseCurrency', 'purchaseFrequency', 'coverageRegions',
  'branchCount', 'warehouseCapability', 'afterSalesCapability', 'installationCapability', 'technicalTeamSize', 'channelCustomerSegments',
  'targetProducts', 'paymentTerms', 'nextPurchaseAt', 'profile75Overrides',
]);

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');

function nowIso() { return new Date().toISOString(); }
function responseHeaders(extra = {}) {
  return {
    'cache-control': 'no-store',
    'access-control-allow-origin': CORS_ORIGIN,
    'access-control-allow-headers': 'authorization, content-type, x-gbap-organization, x-gbap-workspace',
    'access-control-allow-methods': 'GET,PATCH,OPTIONS',
    ...extra,
  };
}
function json(res, status, body) {
  res.writeHead(status, responseHeaders({ 'content-type': 'application/json; charset=utf-8' }));
  res.end(status === 204 ? '' : JSON.stringify(body));
}
function httpError(message, status = 400) {
  const error = new Error(message);
  error.httpStatus = status;
  return error;
}
async function readJson(req, maxBytes = 256 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw httpError('request_body_too_large', 413);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw httpError('invalid_json', 400); }
}
function decodeSegment(segment) {
  const pad = segment.length % 4 === 0 ? '' : '='.repeat(4 - (segment.length % 4));
  return Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}
async function getJwk(kid) { return getCachedJwk(kid, OIDC_JWKS_URL_INTERNAL); }
async function authenticate(req) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) throw httpError('missing_bearer_token', 401);
  const parts = header.slice(7).split('.');
  if (parts.length !== 3) throw httpError('invalid_jwt', 401);
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const headerJson = JSON.parse(decodeSegment(encodedHeader).toString('utf8'));
  const claims = JSON.parse(decodeSegment(encodedPayload).toString('utf8'));
  if (headerJson.alg !== 'RS256' || typeof headerJson.kid !== 'string') throw httpError('unsupported_jwt', 401);
  const publicKey = createPublicKey({ key: await getJwk(headerJson.kid), format: 'jwk' });
  if (!verifySignature('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), publicKey, decodeSegment(encodedSignature))) throw httpError('invalid_signature', 401);
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= now) throw httpError('token_expired', 401);
  if (claims.nbf && claims.nbf > now + 30) throw httpError('token_not_yet_valid', 401);
  if (!OIDC_ALLOWED_ISSUERS.has(claims.iss)) throw httpError('invalid_issuer', 401);
  if (claims.azp && claims.azp !== OIDC_CLIENT_ID) throw httpError('invalid_authorized_party', 401);
  return { subject: claims.sub, username: claims.preferred_username ?? null, roles: new Set(Array.isArray(claims.realm_access?.roles) ? claims.realm_access.roles : []) };
}
function requireUser(actor) {
  if (!actor.roles.has('substrate-user') && !actor.roles.has('substrate-admin')) throw httpError('forbidden', 403);
}
function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
function readState(businessId) {
  const row = db.prepare("SELECT state_json,updated_at FROM crm_business_state WHERE business_type='Account' AND business_id=?").get(businessId);
  if (!row?.state_json) return { state: {}, updatedAt: null };
  try { return { state: JSON.parse(row.state_json), updatedAt: row.updated_at ?? null }; }
  catch { return { state: {}, updatedAt: row.updated_at ?? null }; }
}
function projectProfile(businessId, state, updatedAt) {
  const output = { businessId };
  for (const key of INTELLIGENCE_FIELDS) if (Object.prototype.hasOwnProperty.call(state ?? {}, key)) output[key] = state[key];
  output.intelligenceUpdatedAt = updatedAt ?? null;
  return output;
}
function optionalText(value, label, max = 4000) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) throw httpError(`invalid_${label}`, 400);
  return value.trim();
}
function enumOrNull(value, label, allowed) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw httpError(`invalid_${label}`, 400);
  const normalized = value.trim().toUpperCase();
  if (!allowed.includes(normalized)) throw httpError(`invalid_${label}`, 400);
  return normalized;
}
function enumArray(value, label, allowed) {
  if (value === undefined) return undefined;
  if (value === null) return [];
  if (!Array.isArray(value) || value.length > 32) throw httpError(`invalid_${label}`, 400);
  return [...new Set(value.map((item) => {
    if (typeof item !== 'string') throw httpError(`invalid_${label}`, 400);
    const entry = item.trim().toUpperCase();
    if (!allowed.includes(entry)) throw httpError(`invalid_${label}`, 400);
    return entry;
  }))];
}
function numberOrNull(value, label, max = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) throw httpError(`invalid_${label}`, 400);
  return value;
}
function integerOrNull(value, label, max = 10_000_000) {
  const parsed = numberOrNull(value, label, max);
  if (parsed === undefined || parsed === null) return parsed;
  if (!Number.isInteger(parsed)) throw httpError(`invalid_${label}`, 400);
  return parsed;
}
function booleanOrNull(value, label) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'boolean') throw httpError(`invalid_${label}`, 400);
  return value;
}
function profile75Overrides(value) {
  if (value === undefined) return undefined;
  if (value === null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError('invalid_profile75_overrides', 400);
  const entries = Object.entries(value);
  if (entries.length > 75) throw httpError('invalid_profile75_overrides_count', 400);
  const output = {};
  for (const [key, raw] of entries) {
    if (!TOP500_V46_HEADER_SET.has(key)) throw httpError(`unsupported_profile75_field:${key}`, 400);
    if (raw !== null && typeof raw !== 'string') throw httpError(`invalid_profile75_field:${key}`, 400);
    if (typeof raw === 'string' && raw.length > 30_000) throw httpError(`profile75_field_too_long:${key}`, 400);
    output[key] = typeof raw === 'string' ? raw.trim() : null;
  }
  return output;
}
function validatePatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError('invalid_customer_intelligence', 400);
  for (const key of Object.keys(input)) if (!INTELLIGENCE_FIELDS.has(key)) throw httpError(`unsupported_customer_intelligence_field:${key}`, 400);
  const patch = {};
  patch.customerSegment = enumOrNull(input.customerSegment, 'customer_segment', CUSTOMER_SEGMENTS);
  patch.customerRoles = enumArray(input.customerRoles, 'customer_roles', CUSTOMER_ROLES);
  patch.developmentStage = enumOrNull(input.developmentStage, 'development_stage', DEVELOPMENT_STAGES);

  for (const key of ['siteAreaSqm', 'buildingAreaSqm', 'roofAreaSqm', 'availableLandSqm', 'monthlyConsumptionKwh', 'annualConsumptionKwh', 'monthlyElectricityCost', 'electricityTariff', 'peakDemandKw', 'outageHoursPerMonth', 'transformerCapacityKva', 'generatorCapacityKw', 'existingSolarKw', 'existingStorageKwh', 'projectBudget', 'annualPurchaseValue']) {
    patch[key] = numberOrNull(input[key], key, 10_000_000_000_000);
  }
  patch.operatingHoursPerDay = numberOrNull(input.operatingHoursPerDay, 'operating_hours_per_day', 24);
  patch.operatingDaysPerWeek = numberOrNull(input.operatingDaysPerWeek, 'operating_days_per_week', 7);
  patch.shiftsPerDay = integerOrNull(input.shiftsPerDay, 'shifts_per_day', 12);
  patch.factoryCount = integerOrNull(input.factoryCount, 'factory_count', 100_000);
  patch.branchCount = integerOrNull(input.branchCount, 'branch_count', 100_000);
  patch.technicalTeamSize = integerOrNull(input.technicalTeamSize, 'technical_team_size', 1_000_000);

  patch.gridStability = enumOrNull(input.gridStability, 'grid_stability', GRID_STABILITY);
  patch.purchaseFrequency = enumOrNull(input.purchaseFrequency, 'purchase_frequency', PURCHASE_FREQUENCIES);
  patch.projectNeeds = enumArray(input.projectNeeds, 'project_needs', ENERGY_NEEDS);
  patch.channelProducts = enumArray(input.channelProducts, 'channel_products', CHANNEL_PRODUCTS);
  patch.targetProducts = enumArray(input.targetProducts, 'target_products', CHANNEL_PRODUCTS);

  patch.electricityCostCurrency = optionalText(input.electricityCostCurrency, 'electricity_cost_currency', 3)?.toUpperCase() ?? (input.electricityCostCurrency === null ? null : undefined);
  patch.projectBudgetCurrency = optionalText(input.projectBudgetCurrency, 'project_budget_currency', 3)?.toUpperCase() ?? (input.projectBudgetCurrency === null ? null : undefined);
  patch.purchaseCurrency = optionalText(input.purchaseCurrency, 'purchase_currency', 3)?.toUpperCase() ?? (input.purchaseCurrency === null ? null : undefined);
  for (const key of ['keyEquipmentText', 'energyPainPoints', 'representedBrands', 'existingSuppliers', 'coverageRegions', 'channelCustomerSegments', 'paymentTerms']) {
    patch[key] = optionalText(input[key], key, 20_000);
  }
  patch.projectTimeline = optionalText(input.projectTimeline, 'project_timeline', 512);
  patch.nextPurchaseAt = optionalText(input.nextPurchaseAt, 'next_purchase_at', 128);
  patch.warehouseCapability = booleanOrNull(input.warehouseCapability, 'warehouse_capability');
  patch.afterSalesCapability = booleanOrNull(input.afterSalesCapability, 'after_sales_capability');
  patch.installationCapability = booleanOrNull(input.installationCapability, 'installation_capability');
  patch.profile75Overrides = profile75Overrides(input.profile75Overrides);

  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
}
function recordAudit(actor, action, target, payload = {}) {
  if (!tableExists('audit_event')) return;
  db.prepare(`INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)`).run(
    randomUUID(), actor.subject, actor.username, action, target, nowIso(), JSON.stringify(payload),
  );
}
function ensureAccountExists(businessId) {
  const exists = db.prepare("SELECT 1 FROM external_mapping WHERE business_type='Account' AND business_id=? LIMIT 1").get(businessId);
  if (!exists) throw httpError('customer_company_not_found', 404);
}
function isBusyError(error) {
  return error?.errcode === 5 || error?.errstr === 'database is locked' || /database is (locked|busy)/i.test(String(error?.message ?? ''));
}
function writeProfile(actor, businessId, patch) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = readState(businessId).state;
    const next = { ...current, ...patch };
    const updatedAt = nowIso();
    db.prepare(`INSERT INTO crm_business_state(business_type,business_id,state_json,updated_at) VALUES('Account',?,?,?)
      ON CONFLICT(business_type,business_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`).run(businessId, JSON.stringify(next), updatedAt);
    recordAudit(actor, 'crm.customer_intelligence.update', `Account:${businessId}`, { fields: Object.keys(patch) });
    db.exec('COMMIT');
    return projectProfile(businessId, next, updatedAt);
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

export function createCustomerIntelligenceHandler() {
  return async function customerIntelligenceHandler(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const collectionRoute = url.pathname === '/api/crm-native/customer-intelligence';
    const itemMatch = url.pathname.match(/^\/api\/crm-native\/customer-intelligence\/([^/]+)$/);
    if (!collectionRoute && !itemMatch) return false;
    if (req.method === 'OPTIONS') { json(res, 204, {}); return true; }
    try {
      const actor = await authenticate(req);
      requireUser(actor);
      if (collectionRoute && req.method === 'GET') {
        const rows = db.prepare("SELECT business_id,state_json,updated_at FROM crm_business_state WHERE business_type='Account' ORDER BY updated_at DESC").all();
        const profiles = rows.map((row) => {
          let state = {};
          try { state = JSON.parse(row.state_json); } catch {}
          return projectProfile(row.business_id, state, row.updated_at);
        }).filter((profile) => Object.keys(profile).some((key) => key !== 'businessId' && key !== 'intelligenceUpdatedAt'));
        json(res, 200, { profiles });
        return true;
      }
      if (itemMatch && req.method === 'GET') {
        const businessId = decodeURIComponent(itemMatch[1]);
        if (!businessId || businessId.length > 255) throw httpError('invalid_business_id', 400);
        ensureAccountExists(businessId);
        const current = readState(businessId);
        json(res, 200, { profile: projectProfile(businessId, current.state, current.updatedAt) });
        return true;
      }
      if (itemMatch && req.method === 'PATCH') {
        const businessId = decodeURIComponent(itemMatch[1]);
        if (!businessId || businessId.length > 255) throw httpError('invalid_business_id', 400);
        ensureAccountExists(businessId);
        const patch = validatePatch(await readJson(req));
        const profile = writeProfile(actor, businessId, patch);
        json(res, 200, { profile });
        return true;
      }
      json(res, 405, { error: 'method_not_allowed' });
      return true;
    } catch (error) {
      if (isBusyError(error)) {
        json(res, 503, { error: 'customer_intelligence_temporarily_busy' });
        return true;
      }
      json(res, error.httpStatus ?? 500, { error: error.httpStatus ? error.message : 'internal_error' });
      return true;
    }
  };
}
