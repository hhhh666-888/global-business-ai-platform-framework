import type {
  AccountPriority,
  CanonicalAccount,
  CustomerType,
  OpportunityLifecycleState,
  OpportunityPipelineStage,
  RelationshipStatus,
} from './crmBusinessClient';
import type {
  ChannelProduct,
  CustomerIntelligencePatch,
  CustomerIntelligenceProfile,
  CustomerRole,
  CustomerSegment,
  EnergyProductNeed,
  GridStability,
  PurchaseFrequency,
} from './crmCustomerIntelligenceClient';

export type ImportType = 'companies' | 'contacts' | 'opportunities';
export type CsvRow = { index: number; data: Record<string, string> };
export type ParsedCsv = { headers: string[]; rows: CsvRow[]; delimiter: ',' | ';' | '\t' };
export type FileInspection = { rows: number; recognized: string[]; ignored: string[]; delimiter: string };

export const COMPANY_TEMPLATE_HEADERS = [
  '公司名称', '官网', 'LinkedIn', '国家/地区', '省/州', '城市', '详细地址', '邮编', '公司邮箱', '公司电话',
  '主客户分组', '客户角色', '客户阶段', '行业', '员工人数', '年营收', '营收币种', '来源', '优先级', '备注',
  '工厂数量', '厂区总面积㎡', '建筑面积㎡', '屋顶可用面积㎡', '可用空地面积㎡', '每天运行小时', '每周运行天数', '每天班次',
  '月用电量kWh', '年用电量kWh', '月电费', '电费币种', '电价/kWh', '最大需量kW', '供电稳定性', '月停电时长h',
  '变压器总容量kVA', '发电机容量kW', '现有光伏kW', '现有储能kWh', '主要生产/耗电设备', '能源痛点', '项目需求', '项目预算', '项目预算币种', '项目时间/计划',
  '主营产品', '现有代理品牌', '现有供应商', '年采购规模', '采购币种', '采购频率', '覆盖地区', '网点/分支数量', '仓储能力', '售后能力', '安装能力', '技术团队人数', '主要客户群', '我方目标产品', '付款方式/账期', '预计下次采购',
] as const;

export const COMPANY_TEMPLATE_ROWS: unknown[][] = [
  [
    'Andes Plastics Group', 'https://example.com', '', '厄瓜多尔', 'Guayas', 'Guayaquil', '', '', 'info@example.com', '+593...',
    '工业用能客户', '工厂', '潜在客户', '塑料制造', '120', '', 'USD', 'Google Maps', '高', '重点高耗电客户',
    '4', '170000', '54000', '37800', '106000', '24', '7', '3', '850000', '', '100000', 'USD', '', '', '经常停电', '120',
    '2500', '1800', '0', '0', '注塑机;空压机;冷却系统', '电价高;经常停电;柴油成本高', '光伏;储能;微电网/综合能源', '', 'USD', '2026 Q4',
    '', '', '', '', 'USD', '', '', '', '', '', '', '', '', '', '', '',
  ],
  [
    'Andes Solar Distribution', 'https://example.net', '', '厄瓜多尔', 'Pichincha', 'Quito', '', '', 'sales@example.net', '+593...',
    '渠道/经销商', '新能源经销商', '潜在客户', '新能源分销', '45', '', 'USD', 'Google Maps', '高', '重点渠道客户',
    '', '', '', '', '', '', '', '', '', '', '', '', '', '', '未知', '',
    '', '', '', '', '', '', '光伏;储能', '', 'USD', '',
    '光伏组件;逆变器;储能', 'Huawei;Sungrow;Jinko', '现有中国供应商A;供应商B', '2500000', 'USD', '每季度', '厄瓜多尔全国', '3', '有', '有', '有', '8', '工业;商业;EPC', '光伏组件;储能', '30%预付款;发货前付清', '2026-11-15',
  ],
];

export const CONTACT_TEMPLATE_HEADERS = ['联系人姓名', '邮箱', '电话', '职位', 'LinkedIn', '所属公司'] as const;
export const CONTACT_TEMPLATE_ROWS: unknown[][] = [['Carlos Mendoza', 'carlos@example.com', '+593...', '采购经理', '', 'Andes Plastics Group']];
export const OPPORTUNITY_TEMPLATE_HEADERS = ['商机名称', '客户公司', '预计金额', '币种', '阶段', '状态', '下一步'] as const;
export const OPPORTUNITY_TEMPLATE_ROWS: unknown[][] = [['厂区光储改造项目', 'Andes Plastics Group', '880000', 'USD', '方案', '进行中', '确认现场负荷资料']];

export const COMPANY_FIELDS = {
  displayName: ['displayName', 'name', '公司名称', '公司名', '企业名称', '客户公司', '客户名称'],
  website: ['website', '官网', '网站', '网址', '公司网站'],
  linkedinUrl: ['linkedinUrl', 'linkedin', 'LinkedIn链接', '领英', '领英链接'],
  addressCountry: ['addressCountry', 'country', '国家', '国家地区', '国家/地区'],
  addressState: ['addressState', 'state', 'province', '省', '州', '省州', '省/州'],
  addressCity: ['addressCity', 'city', '城市'],
  addressStreet1: ['addressStreet1', 'address', '地址', '详细地址', '公司地址'],
  addressPostcode: ['addressPostcode', 'postcode', 'postalCode', '邮编', '邮政编码'],
  primaryEmail: ['primaryEmail', 'email', '邮箱', '公司邮箱', '企业邮箱'],
  primaryPhone: ['primaryPhone', 'phone', 'telephone', '电话', '公司电话', '联系电话', 'WhatsApp'],
  customerType: ['customerType', '客户类型', '企业类型'],
  customerSegment: ['customerSegment', 'segment', '主客户分组', '客户分组', '客户大类'],
  customerRoles: ['customerRoles', 'roles', '客户角色', '业务角色'],
  relationshipStatus: ['relationshipStatus', '客户阶段', '关系状态', '客户状态'],
  industry: ['industry', '行业', '所属行业'],
  employeeCount: ['employeeCount', 'employees', '员工人数', '人数', '企业规模'],
  annualRevenue: ['annualRevenue', 'revenue', '年营收', '年营业额'],
  annualRevenueCurrency: ['annualRevenueCurrency', 'revenueCurrency', '营收币种', '币种'],
  source: ['source', '来源', '客户来源', '线索来源'],
  priority: ['priority', '优先级', '客户优先级'],
  notes: ['notes', 'note', '备注', '说明'],
  factoryCount: ['factoryCount', '工厂数量', '厂区数量'],
  siteAreaSqm: ['siteAreaSqm', '厂区总面积㎡', '厂区总面积', '园区总面积㎡'],
  buildingAreaSqm: ['buildingAreaSqm', '建筑面积㎡', '建筑面积', '厂房面积㎡'],
  roofAreaSqm: ['roofAreaSqm', '屋顶可用面积㎡', '屋顶面积㎡', '可用屋顶面积㎡'],
  availableLandSqm: ['availableLandSqm', '可用空地面积㎡', '空地面积㎡', '可用土地面积㎡'],
  operatingHoursPerDay: ['operatingHoursPerDay', '每天运行小时', '日运行小时', '每天生产时长'],
  operatingDaysPerWeek: ['operatingDaysPerWeek', '每周运行天数', '每周生产天数'],
  shiftsPerDay: ['shiftsPerDay', '每天班次', '日班次'],
  monthlyConsumptionKwh: ['monthlyConsumptionKwh', '月用电量kWh', '月用电量', '每月用电量kWh'],
  annualConsumptionKwh: ['annualConsumptionKwh', '年用电量kWh', '年用电量'],
  monthlyElectricityCost: ['monthlyElectricityCost', '月电费', '每月电费'],
  electricityCostCurrency: ['electricityCostCurrency', '电费币种', '电费货币'],
  electricityTariff: ['electricityTariff', '电价/kWh', '电价', '度电价格'],
  peakDemandKw: ['peakDemandKw', '最大需量kW', '最大需量', '峰值负荷kW'],
  gridStability: ['gridStability', '供电稳定性', '停电情况', '电网情况'],
  outageHoursPerMonth: ['outageHoursPerMonth', '月停电时长h', '月停电时长', '每月停电小时'],
  transformerCapacityKva: ['transformerCapacityKva', '变压器总容量kVA', '变压器容量kVA'],
  generatorCapacityKw: ['generatorCapacityKw', '发电机容量kW', '柴油机容量kW', '现有发电机容量kW'],
  existingSolarKw: ['existingSolarKw', '现有光伏kW', '现有光伏容量kW'],
  existingStorageKwh: ['existingStorageKwh', '现有储能kWh', '现有储能容量kWh'],
  keyEquipmentText: ['keyEquipmentText', '主要生产/耗电设备', '主要耗电设备', '主要设备'],
  energyPainPoints: ['energyPainPoints', '能源痛点', '用电痛点', '电力痛点'],
  projectNeeds: ['projectNeeds', '项目需求', '潜在项目需求', '产品需求'],
  projectBudget: ['projectBudget', '项目预算', '预算'],
  projectBudgetCurrency: ['projectBudgetCurrency', '项目预算币种', '预算币种'],
  projectTimeline: ['projectTimeline', '项目时间/计划', '项目计划', '项目时间'],
  channelProducts: ['channelProducts', '主营产品', '经销产品'],
  representedBrands: ['representedBrands', '现有代理品牌', '代理品牌', '经销品牌'],
  existingSuppliers: ['existingSuppliers', '现有供应商', '供应商'],
  annualPurchaseValue: ['annualPurchaseValue', '年采购规模', '年采购额'],
  purchaseCurrency: ['purchaseCurrency', '采购币种', '采购货币'],
  purchaseFrequency: ['purchaseFrequency', '采购频率', '采购周期'],
  coverageRegions: ['coverageRegions', '覆盖地区', '销售区域', '渠道覆盖'],
  branchCount: ['branchCount', '网点/分支数量', '分支数量', '网点数量'],
  warehouseCapability: ['warehouseCapability', '仓储能力', '有无仓库'],
  afterSalesCapability: ['afterSalesCapability', '售后能力', '售后服务能力'],
  installationCapability: ['installationCapability', '安装能力', '施工安装能力'],
  technicalTeamSize: ['technicalTeamSize', '技术团队人数', '技术人员数量'],
  channelCustomerSegments: ['channelCustomerSegments', '主要客户群', '客户群体', '终端客户类型'],
  targetProducts: ['targetProducts', '我方目标产品', '目标产品', '适合推进产品'],
  paymentTerms: ['paymentTerms', '付款方式/账期', '付款方式', '账期'],
  nextPurchaseAt: ['nextPurchaseAt', '预计下次采购', '下次采购时间'],
} as const;

export const CONTACT_FIELDS = {
  personName: ['personName', 'name', '姓名', '联系人', '联系人姓名'],
  email: ['email', '邮箱', '联系人邮箱'],
  phone: ['phone', '电话', '手机', '手机号', '联系电话', 'WhatsApp'],
  jobTitle: ['jobTitle', 'title', '职位', '职务'],
  linkedinUrl: ['linkedinUrl', 'linkedin', 'LinkedIn链接', '领英', '领英链接'],
  accountName: ['accountName', 'company', '所属公司', '客户公司', '公司名称', '企业名称'],
} as const;

export const OPPORTUNITY_FIELDS = {
  nameSummary: ['nameSummary', 'name', '商机名称', '项目名称', '机会名称'],
  accountName: ['accountName', 'company', '客户公司', '公司名称', '所属公司'],
  estimatedValue: ['estimatedValue', 'amount', '预计金额', '预计价值', '金额'],
  currencyCode: ['currencyCode', 'currency', '币种', '货币'],
  pipelineStage: ['pipelineStage', 'stage', '阶段', '销售阶段'],
  lifecycleState: ['lifecycleState', 'status', '状态', '商机状态'],
  nextStep: ['nextStep', '下一步', '后续动作', '跟进动作'],
} as const;

function normalizeHeader(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[\s_\-—–/\\:：()（）]+/g, '');
}
function normalizeEnumKey(value: string) {
  return value.trim().toLocaleUpperCase().replace(/[\s_\-—–/\\:：()（）]+/g, '');
}
function aliases<T extends string>(entries: Array<[T, ...string[]]>) {
  const result: Record<string, T> = {};
  for (const [value, ...labels] of entries) for (const label of [value, ...labels]) result[normalizeEnumKey(label)] = value;
  return result;
}

const CUSTOMER_TYPE_ALIASES = aliases<CustomerType>([
  ['DISTRIBUTOR', '经销商', '分销商'], ['EPC'], ['FACTORY', '工厂', '制造商', '制造企业'],
  ['END_USER', '终端客户', '终端用户'], ['DEVELOPER', '开发商', '项目开发商'], ['UTILITY', '电力公司', '公用事业'],
  ['GOVERNMENT', '政府', '政府机构'], ['OTHER', '其他'],
]);
const SEGMENT_ALIASES = aliases<CustomerSegment>([
  ['INDUSTRIAL', '工业用能客户', '工业客户', '工业'], ['CHANNEL', '渠道/经销商', '渠道经销商', '渠道客户', '渠道'],
  ['PROJECT', 'EPC/项目型', 'EPC项目型', '项目型客户', '项目型'], ['PUBLIC', '公共事业客户', '公共事业'], ['OTHER', '其他'],
]);
const ROLE_ALIASES = aliases<CustomerRole>([
  ['FACTORY', '工厂', '制造企业', '工厂/制造企业'], ['MINE', '矿山'], ['DATA_CENTER', '数据中心'],
  ['COMMERCIAL_PARK', '商业园区', '产业园区', '商业/产业园区'], ['AGRICULTURE', '农牧业', '农业', '养殖业'],
  ['RENEWABLE_DISTRIBUTOR', '新能源经销商', '光伏经销商', '储能经销商'], ['GENERATOR_DISTRIBUTOR', '发电机经销商'],
  ['ELECTRICAL_DISTRIBUTOR', '电气设备经销商'], ['EPC', 'EPC/系统集成商', '系统集成商'], ['DEVELOPER', '项目开发商'],
  ['INVESTOR', '投资商'], ['UTILITY', '电力公司'], ['GOVERNMENT', '政府', '政府机构'],
]);
const RELATIONSHIP_ALIASES = aliases<RelationshipStatus>([
  ['PROSPECT', '潜在客户', '线索'], ['QUALIFIED', '已筛选', '合格客户'], ['CUSTOMER', '客户', '已成交', '成交客户'],
  ['PARTNER', '合作伙伴'], ['INACTIVE', '无效', '停用', '暂不跟进'],
]);
const PRIORITY_ALIASES = aliases<AccountPriority>([['HIGH', '高', '高优先级'], ['MEDIUM', '中', '中优先级'], ['LOW', '低', '低优先级']]);
const GRID_ALIASES = aliases<GridStability>([
  ['STABLE', '稳定'], ['OCCASIONAL_OUTAGE', '偶尔停电'], ['FREQUENT_OUTAGE', '经常停电', '频繁停电'],
  ['SEVERE_OUTAGE', '严重停电', '频繁长时间停电'], ['UNKNOWN', '未知'],
]);
const NEED_ALIASES = aliases<EnergyProductNeed>([
  ['SOLAR', '光伏', '太阳能'], ['STORAGE', '储能', '电池储能', 'ESS'], ['DIESEL_GENERATOR', '柴油发电机', '柴油机'],
  ['GAS_GENERATOR', '燃气发电机', '天然气发电机', '燃气机'], ['TRANSFORMER', '变压器'], ['ELECTRICAL', '电气设备', '配电设备'],
  ['MICROGRID', '微电网', '综合能源', '微电网/综合能源'], ['ENERGY_MANAGEMENT', '能源管理', 'EMS'],
]);
const CHANNEL_PRODUCT_ALIASES = aliases<ChannelProduct>([
  ['SOLAR_MODULE', '光伏组件', '组件'], ['INVERTER', '逆变器'], ['STORAGE', '储能', 'ESS'],
  ['DIESEL_GENERATOR', '柴油发电机', '柴油机'], ['GAS_GENERATOR', '燃气发电机', '天然气发电机'], ['TRANSFORMER', '变压器'],
  ['ELECTRICAL', '电气设备', '配电设备'], ['MICROGRID', '微电网', '综合能源', '微电网/综合能源'],
]);
const PURCHASE_FREQUENCY_ALIASES = aliases<PurchaseFrequency>([
  ['MONTHLY', '每月', '月度'], ['QUARTERLY', '每季度', '季度'], ['SEMI_ANNUAL', '每半年', '半年'],
  ['ANNUAL', '每年', '年度'], ['IRREGULAR', '不定期', '不固定'],
]);
const PIPELINE_ALIASES = aliases<OpportunityPipelineStage>([
  ['NEW', '新建', '新线索'], ['SCREENING', '筛选', '资格审查'], ['MEETING', '会谈', '沟通'],
  ['PROPOSAL', '方案', '报价'], ['CUSTOMER', '客户', '成交'],
]);
const LIFECYCLE_ALIASES = aliases<OpportunityLifecycleState>([
  ['OPEN', '进行中', '跟进中'], ['CLOSED_WON', '已赢单', '成交'], ['CLOSED_LOST', '已丢单', '丢单'], ['CANCELLED', '已取消', '取消'],
]);

function delimiterLabel(value: ',' | ';' | '\t') { return value === ',' ? '逗号 CSV' : value === ';' ? '分号 CSV' : 'Tab 分隔'; }
function firstLogicalLine(text: string) {
  let quoted = false; let line = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]; line += ch;
    if (ch === '"' && text[i + 1] === '"') { line += text[i + 1]; i += 1; continue; }
    if (ch === '"') quoted = !quoted;
    if (ch === '\n' && !quoted) break;
  }
  return line;
}
function countOutsideQuotes(text: string, target: string) {
  let quoted = false; let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' && text[i + 1] === '"') { i += 1; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (!quoted && ch === target) count += 1;
  }
  return count;
}
function detectDelimiter(text: string): ',' | ';' | '\t' {
  const line = firstLogicalLine(text);
  const candidates: Array<[',' | ';' | '\t', number]> = [[',', countOutsideQuotes(line, ',')], [';', countOutsideQuotes(line, ';')], ['\t', countOutsideQuotes(line, '\t')]];
  candidates.sort((a, b) => b[1] - a[1]);
  if (candidates[0][1] === 0) throw new Error('无法识别 CSV 分隔符。请在 Excel / WPS 中选择“CSV UTF-8（逗号分隔）”后重新保存。');
  return candidates[0][0];
}
function parseCsv(text: string, delimiter: ',' | ';' | '\t'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  row.push(field.replace(/\r$/, ''));
  if (row.some((value) => value.length > 0)) rows.push(row);
  if (quoted) throw new Error('CSV 中存在未闭合的引号。');
  return rows;
}

export function parseCsvDocument(rawText: string): ParsedCsv {
  const text = rawText.replace(/^\uFEFF/, '');
  if (text.slice(0, 2) === 'PK') throw new Error('检测到文件实际仍是 Excel .xlsx，只修改扩展名不会变成 CSV。请用“另存为 / 导出 → CSV UTF-8（逗号分隔）”。');
  if (/\u0000/.test(text.slice(0, 2000))) throw new Error('检测到 UTF-16 / Unicode 文本格式。请重新另存为“CSV UTF-8（逗号分隔）”。');
  const delimiter = detectDelimiter(text);
  const matrix = parseCsv(text, delimiter);
  if (matrix.length < 2) throw new Error('CSV 至少需要表头和一行数据。');
  const headers = matrix[0].map((value) => value.trim());
  if (headers.some((value) => !value)) throw new Error('CSV 表头不能为空。');
  const normalizedHeaders = headers.map(normalizeHeader);
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) throw new Error('CSV 中存在重复表头，请合并或重命名后再导入。');
  const rows = matrix.slice(1).filter((row) => row.some((value) => value.trim())).map((row, index) => {
    if (row.length > headers.length) throw new Error(`第 ${index + 2} 行列数超过表头。数字不要使用千位逗号；包含逗号的文本请使用 CSV 引号。`);
    return { index: index + 2, data: Object.fromEntries(normalizedHeaders.map((header, i) => [header, row[i]?.trim() ?? ''])) };
  });
  if (rows.length === 0) throw new Error('CSV 没有可导入的数据行。');
  return { headers, rows, delimiter };
}

export function valueOf(row: CsvRow, fieldAliases: readonly string[]) {
  for (const alias of fieldAliases) {
    const value = row.data[normalizeHeader(alias)];
    if (value) return value;
  }
  return '';
}
export function hasAnyValue(row: CsvRow, fieldAliases: readonly string[]) {
  return fieldAliases.some((alias) => Object.hasOwn(row.data, normalizeHeader(alias)) && Boolean(row.data[normalizeHeader(alias)]));
}
export function numberValue(value: string, row: number, label: string, { integer = false, max }: { integer?: boolean; max?: number } = {}) {
  if (!value) return undefined;
  if (/\d,\d{3}(?:\D|$)/.test(value)) throw new Error(`第 ${row} 行：${label} 请不要使用千位逗号，直接填写纯数字。`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed)) || (max !== undefined && parsed > max)) throw new Error(`第 ${row} 行：${label} 不是有效数字。`);
  return parsed;
}
function mappedValue<T extends string>(value: string, map: Record<string, T>, row: number, label: string): T | undefined {
  if (!value) return undefined;
  const mapped = map[normalizeEnumKey(value)];
  if (!mapped) throw new Error(`第 ${row} 行：无法识别${label}“${value}”，请使用母版中的标准值。`);
  return mapped;
}
function listValue<T extends string>(value: string, map: Record<string, T>, row: number, label: string): T[] | undefined {
  if (!value) return undefined;
  const items = value.split(/[;；,，、|\n]+/).map((item) => item.trim()).filter(Boolean);
  const mapped = items.map((item) => mappedValue(item, map, row, label)!);
  return [...new Set(mapped)];
}
function booleanValue(value: string, row: number, label: string) {
  if (!value) return undefined;
  const normalized = normalizeEnumKey(value);
  if (['有', '是', 'YES', 'TRUE', '1'].includes(normalized)) return true;
  if (['无', '否', 'NO', 'FALSE', '0'].includes(normalized)) return false;
  throw new Error(`第 ${row} 行：${label}请填写“有”或“无”。`);
}
function segmentFromLegacy(type?: CustomerType): CustomerSegment | undefined {
  if (type === 'DISTRIBUTOR') return 'CHANNEL';
  if (type === 'FACTORY' || type === 'END_USER') return 'INDUSTRIAL';
  if (type === 'EPC' || type === 'DEVELOPER') return 'PROJECT';
  if (type === 'UTILITY' || type === 'GOVERNMENT') return 'PUBLIC';
  return type === 'OTHER' ? 'OTHER' : undefined;
}
function rolesFromLegacy(type?: CustomerType): CustomerRole[] | undefined {
  if (type === 'DISTRIBUTOR') return ['RENEWABLE_DISTRIBUTOR'];
  if (type === 'FACTORY') return ['FACTORY'];
  if (type === 'EPC') return ['EPC'];
  if (type === 'DEVELOPER') return ['DEVELOPER'];
  if (type === 'UTILITY') return ['UTILITY'];
  if (type === 'GOVERNMENT') return ['GOVERNMENT'];
  return undefined;
}
function legacyFromModern(segment?: CustomerSegment, roles?: CustomerRole[], explicit?: CustomerType): CustomerType | undefined {
  if (explicit) return explicit;
  if (roles?.includes('FACTORY')) return 'FACTORY';
  if (roles?.some((role) => ['RENEWABLE_DISTRIBUTOR', 'GENERATOR_DISTRIBUTOR', 'ELECTRICAL_DISTRIBUTOR'].includes(role))) return 'DISTRIBUTOR';
  if (roles?.includes('EPC')) return 'EPC';
  if (roles?.includes('DEVELOPER')) return 'DEVELOPER';
  if (roles?.includes('UTILITY')) return 'UTILITY';
  if (roles?.includes('GOVERNMENT')) return 'GOVERNMENT';
  if (segment === 'INDUSTRIAL') return 'END_USER';
  if (segment === 'CHANNEL') return 'DISTRIBUTOR';
  if (segment === 'PROJECT') return 'EPC';
  return segment === 'OTHER' ? 'OTHER' : undefined;
}

export function companyRowInput(row: CsvRow) {
  const name = valueOf(row, COMPANY_FIELDS.displayName);
  if (!name) throw new Error(`第 ${row.index} 行：缺少“公司名称”。`);
  const explicitLegacy = mappedValue(valueOf(row, COMPANY_FIELDS.customerType), CUSTOMER_TYPE_ALIASES, row.index, '客户类型');
  const explicitSegment = mappedValue(valueOf(row, COMPANY_FIELDS.customerSegment), SEGMENT_ALIASES, row.index, '主客户分组');
  const explicitRoles = listValue(valueOf(row, COMPANY_FIELDS.customerRoles), ROLE_ALIASES, row.index, '客户角色');
  const segment = explicitSegment ?? segmentFromLegacy(explicitLegacy);
  const roles = explicitRoles ?? rolesFromLegacy(explicitLegacy);
  const customerType = legacyFromModern(segment, roles, explicitLegacy);
  const relationshipStatus = mappedValue(valueOf(row, COMPANY_FIELDS.relationshipStatus), RELATIONSHIP_ALIASES, row.index, '客户阶段');
  const priority = mappedValue(valueOf(row, COMPANY_FIELDS.priority), PRIORITY_ALIASES, row.index, '优先级');
  const employeeCount = numberValue(valueOf(row, COMPANY_FIELDS.employeeCount), row.index, '员工人数', { integer: true });
  const annualRevenue = numberValue(valueOf(row, COMPANY_FIELDS.annualRevenue), row.index, '年营收');

  const base = {
    displayName: name,
    ...(hasAnyValue(row, COMPANY_FIELDS.website) ? { website: valueOf(row, COMPANY_FIELDS.website) } : {}),
    ...(hasAnyValue(row, COMPANY_FIELDS.linkedinUrl) ? { linkedinUrl: valueOf(row, COMPANY_FIELDS.linkedinUrl) } : {}),
    ...(hasAnyValue(row, COMPANY_FIELDS.addressCountry) ? { addressCountry: valueOf(row, COMPANY_FIELDS.addressCountry) } : {}),
    ...(hasAnyValue(row, COMPANY_FIELDS.addressState) ? { addressState: valueOf(row, COMPANY_FIELDS.addressState) } : {}),
    ...(hasAnyValue(row, COMPANY_FIELDS.addressCity) ? { addressCity: valueOf(row, COMPANY_FIELDS.addressCity) } : {}),
    ...(hasAnyValue(row, COMPANY_FIELDS.addressStreet1) ? { addressStreet1: valueOf(row, COMPANY_FIELDS.addressStreet1) } : {}),
    ...(hasAnyValue(row, COMPANY_FIELDS.addressPostcode) ? { addressPostcode: valueOf(row, COMPANY_FIELDS.addressPostcode) } : {}),
    ...(hasAnyValue(row, COMPANY_FIELDS.primaryEmail) ? { primaryEmail: valueOf(row, COMPANY_FIELDS.primaryEmail) } : {}),
    ...(hasAnyValue(row, COMPANY_FIELDS.primaryPhone) ? { primaryPhone: valueOf(row, COMPANY_FIELDS.primaryPhone) } : {}),
    ...(customerType ? { customerType } : {}), ...(relationshipStatus ? { relationshipStatus } : {}),
    ...(hasAnyValue(row, COMPANY_FIELDS.industry) ? { industry: valueOf(row, COMPANY_FIELDS.industry) } : {}),
    ...(employeeCount !== undefined ? { employeeCount } : {}), ...(annualRevenue !== undefined ? { annualRevenue } : {}),
    ...(hasAnyValue(row, COMPANY_FIELDS.annualRevenueCurrency) ? { annualRevenueCurrency: valueOf(row, COMPANY_FIELDS.annualRevenueCurrency).toUpperCase() } : {}),
    ...(hasAnyValue(row, COMPANY_FIELDS.source) ? { source: valueOf(row, COMPANY_FIELDS.source) } : {}),
    ...(priority ? { priority } : {}), ...(hasAnyValue(row, COMPANY_FIELDS.notes) ? { notes: valueOf(row, COMPANY_FIELDS.notes) } : {}),
  };

  const intelligence: CustomerIntelligencePatch = {};
  const putNumber = (key: keyof CustomerIntelligencePatch, field: readonly string[], label: string, options?: { integer?: boolean; max?: number }) => {
    const parsed = numberValue(valueOf(row, field), row.index, label, options);
    if (parsed !== undefined) (intelligence as Record<string, unknown>)[key] = parsed;
  };
  if (segment) intelligence.customerSegment = segment;
  if (roles) intelligence.customerRoles = roles;
  putNumber('factoryCount', COMPANY_FIELDS.factoryCount, '工厂数量', { integer: true });
  putNumber('siteAreaSqm', COMPANY_FIELDS.siteAreaSqm, '厂区总面积'); putNumber('buildingAreaSqm', COMPANY_FIELDS.buildingAreaSqm, '建筑面积');
  putNumber('roofAreaSqm', COMPANY_FIELDS.roofAreaSqm, '屋顶可用面积'); putNumber('availableLandSqm', COMPANY_FIELDS.availableLandSqm, '可用空地面积');
  putNumber('operatingHoursPerDay', COMPANY_FIELDS.operatingHoursPerDay, '每天运行小时', { max: 24 });
  putNumber('operatingDaysPerWeek', COMPANY_FIELDS.operatingDaysPerWeek, '每周运行天数', { max: 7 });
  putNumber('shiftsPerDay', COMPANY_FIELDS.shiftsPerDay, '每天班次'); putNumber('monthlyConsumptionKwh', COMPANY_FIELDS.monthlyConsumptionKwh, '月用电量');
  putNumber('annualConsumptionKwh', COMPANY_FIELDS.annualConsumptionKwh, '年用电量'); putNumber('monthlyElectricityCost', COMPANY_FIELDS.monthlyElectricityCost, '月电费');
  if (hasAnyValue(row, COMPANY_FIELDS.electricityCostCurrency)) intelligence.electricityCostCurrency = valueOf(row, COMPANY_FIELDS.electricityCostCurrency).toUpperCase();
  putNumber('electricityTariff', COMPANY_FIELDS.electricityTariff, '电价'); putNumber('peakDemandKw', COMPANY_FIELDS.peakDemandKw, '最大需量');
  const gridStability = mappedValue(valueOf(row, COMPANY_FIELDS.gridStability), GRID_ALIASES, row.index, '供电稳定性'); if (gridStability) intelligence.gridStability = gridStability;
  putNumber('outageHoursPerMonth', COMPANY_FIELDS.outageHoursPerMonth, '月停电时长'); putNumber('transformerCapacityKva', COMPANY_FIELDS.transformerCapacityKva, '变压器总容量');
  putNumber('generatorCapacityKw', COMPANY_FIELDS.generatorCapacityKw, '发电机容量'); putNumber('existingSolarKw', COMPANY_FIELDS.existingSolarKw, '现有光伏'); putNumber('existingStorageKwh', COMPANY_FIELDS.existingStorageKwh, '现有储能');
  if (hasAnyValue(row, COMPANY_FIELDS.keyEquipmentText)) intelligence.keyEquipmentText = valueOf(row, COMPANY_FIELDS.keyEquipmentText);
  if (hasAnyValue(row, COMPANY_FIELDS.energyPainPoints)) intelligence.energyPainPoints = valueOf(row, COMPANY_FIELDS.energyPainPoints);
  const needs = listValue(valueOf(row, COMPANY_FIELDS.projectNeeds), NEED_ALIASES, row.index, '项目需求'); if (needs) intelligence.projectNeeds = needs;
  putNumber('projectBudget', COMPANY_FIELDS.projectBudget, '项目预算');
  if (hasAnyValue(row, COMPANY_FIELDS.projectBudgetCurrency)) intelligence.projectBudgetCurrency = valueOf(row, COMPANY_FIELDS.projectBudgetCurrency).toUpperCase();
  if (hasAnyValue(row, COMPANY_FIELDS.projectTimeline)) intelligence.projectTimeline = valueOf(row, COMPANY_FIELDS.projectTimeline);
  const channelProducts = listValue(valueOf(row, COMPANY_FIELDS.channelProducts), CHANNEL_PRODUCT_ALIASES, row.index, '主营产品'); if (channelProducts) intelligence.channelProducts = channelProducts;
  if (hasAnyValue(row, COMPANY_FIELDS.representedBrands)) intelligence.representedBrands = valueOf(row, COMPANY_FIELDS.representedBrands);
  if (hasAnyValue(row, COMPANY_FIELDS.existingSuppliers)) intelligence.existingSuppliers = valueOf(row, COMPANY_FIELDS.existingSuppliers);
  putNumber('annualPurchaseValue', COMPANY_FIELDS.annualPurchaseValue, '年采购规模');
  if (hasAnyValue(row, COMPANY_FIELDS.purchaseCurrency)) intelligence.purchaseCurrency = valueOf(row, COMPANY_FIELDS.purchaseCurrency).toUpperCase();
  const purchaseFrequency = mappedValue(valueOf(row, COMPANY_FIELDS.purchaseFrequency), PURCHASE_FREQUENCY_ALIASES, row.index, '采购频率'); if (purchaseFrequency) intelligence.purchaseFrequency = purchaseFrequency;
  if (hasAnyValue(row, COMPANY_FIELDS.coverageRegions)) intelligence.coverageRegions = valueOf(row, COMPANY_FIELDS.coverageRegions);
  putNumber('branchCount', COMPANY_FIELDS.branchCount, '网点/分支数量', { integer: true });
  const warehouse = booleanValue(valueOf(row, COMPANY_FIELDS.warehouseCapability), row.index, '仓储能力'); if (warehouse !== undefined) intelligence.warehouseCapability = warehouse;
  const afterSales = booleanValue(valueOf(row, COMPANY_FIELDS.afterSalesCapability), row.index, '售后能力'); if (afterSales !== undefined) intelligence.afterSalesCapability = afterSales;
  const installation = booleanValue(valueOf(row, COMPANY_FIELDS.installationCapability), row.index, '安装能力'); if (installation !== undefined) intelligence.installationCapability = installation;
  putNumber('technicalTeamSize', COMPANY_FIELDS.technicalTeamSize, '技术团队人数', { integer: true });
  if (hasAnyValue(row, COMPANY_FIELDS.channelCustomerSegments)) intelligence.channelCustomerSegments = valueOf(row, COMPANY_FIELDS.channelCustomerSegments);
  const targets = listValue(valueOf(row, COMPANY_FIELDS.targetProducts), CHANNEL_PRODUCT_ALIASES, row.index, '我方目标产品'); if (targets) intelligence.targetProducts = targets;
  if (hasAnyValue(row, COMPANY_FIELDS.paymentTerms)) intelligence.paymentTerms = valueOf(row, COMPANY_FIELDS.paymentTerms);
  if (hasAnyValue(row, COMPANY_FIELDS.nextPurchaseAt)) intelligence.nextPurchaseAt = valueOf(row, COMPANY_FIELDS.nextPurchaseAt);
  return { name, base, intelligence };
}

export function opportunityStage(value: string, row: number) { return mappedValue(value, PIPELINE_ALIASES, row, '销售阶段'); }
export function opportunityLifecycle(value: string, row: number) { return mappedValue(value, LIFECYCLE_ALIASES, row, '商机状态'); }

export function fieldsFor(type: ImportType): Record<string, readonly string[]> {
  return type === 'companies' ? COMPANY_FIELDS : type === 'contacts' ? CONTACT_FIELDS : OPPORTUNITY_FIELDS;
}
export function inspectHeaders(type: ImportType, parsed: ParsedCsv): FileInspection {
  const fields = fieldsFor(type);
  const recognized = new Set<string>(); const ignored: string[] = [];
  for (const header of parsed.headers) {
    const normalized = normalizeHeader(header);
    const match = Object.entries(fields).find(([, fieldAliases]) => fieldAliases.some((alias) => normalizeHeader(alias) === normalized));
    if (match) recognized.add(header); else ignored.push(header);
  }
  return { rows: parsed.rows.length, recognized: [...recognized], ignored, delimiter: delimiterLabel(parsed.delimiter) };
}

const SEGMENT_LABELS: Record<CustomerSegment, string> = { INDUSTRIAL: '工业用能客户', CHANNEL: '渠道/经销商', PROJECT: 'EPC/项目型', PUBLIC: '公共事业客户', OTHER: '其他' };
const ROLE_LABELS: Record<CustomerRole, string> = {
  FACTORY: '工厂', MINE: '矿山', DATA_CENTER: '数据中心', COMMERCIAL_PARK: '商业/产业园区', AGRICULTURE: '农牧业',
  RENEWABLE_DISTRIBUTOR: '新能源经销商', GENERATOR_DISTRIBUTOR: '发电机经销商', ELECTRICAL_DISTRIBUTOR: '电气设备经销商',
  EPC: 'EPC/系统集成商', DEVELOPER: '项目开发商', INVESTOR: '投资商', UTILITY: '电力公司', GOVERNMENT: '政府机构',
};
const RELATION_LABELS: Record<RelationshipStatus, string> = { PROSPECT: '潜在客户', QUALIFIED: '已筛选', CUSTOMER: '成交客户', PARTNER: '合作伙伴', INACTIVE: '暂不跟进' };
const PRIORITY_LABELS: Record<AccountPriority, string> = { HIGH: '高', MEDIUM: '中', LOW: '低' };
const GRID_LABELS: Record<GridStability, string> = { STABLE: '稳定', OCCASIONAL_OUTAGE: '偶尔停电', FREQUENT_OUTAGE: '经常停电', SEVERE_OUTAGE: '严重停电', UNKNOWN: '未知' };
const NEED_LABELS: Record<EnergyProductNeed, string> = { SOLAR: '光伏', STORAGE: '储能', DIESEL_GENERATOR: '柴油发电机', GAS_GENERATOR: '燃气发电机', TRANSFORMER: '变压器', ELECTRICAL: '电气设备', MICROGRID: '微电网/综合能源', ENERGY_MANAGEMENT: '能源管理' };
const PRODUCT_LABELS: Record<ChannelProduct, string> = { SOLAR_MODULE: '光伏组件', INVERTER: '逆变器', STORAGE: '储能', DIESEL_GENERATOR: '柴油发电机', GAS_GENERATOR: '燃气发电机', TRANSFORMER: '变压器', ELECTRICAL: '电气设备', MICROGRID: '微电网/综合能源' };
const FREQUENCY_LABELS: Record<PurchaseFrequency, string> = { MONTHLY: '每月', QUARTERLY: '每季度', SEMI_ANNUAL: '每半年', ANNUAL: '每年', IRREGULAR: '不定期' };
function yesNo(value: boolean | null | undefined) { return value === true ? '有' : value === false ? '无' : ''; }
function labels<T extends string>(values: T[] | undefined, map: Record<T, string>) { return values?.map((value) => map[value]).join(';') ?? ''; }

export function companyExportRow(account: CanonicalAccount, intelligence?: CustomerIntelligenceProfile): unknown[] {
  return [
    account.displayName, account.website, account.linkedinUrl, account.addressCountry, account.addressState, account.addressCity, account.addressStreet1, account.addressPostcode, account.primaryEmail, account.primaryPhone,
    intelligence?.customerSegment ? SEGMENT_LABELS[intelligence.customerSegment] : '', intelligence?.customerRoles ? labels(intelligence.customerRoles, ROLE_LABELS) : '', account.relationshipStatus ? RELATION_LABELS[account.relationshipStatus] : '', account.industry,
    account.employeeCount, account.annualRevenue, account.annualRevenueCurrency, account.source, account.priority ? PRIORITY_LABELS[account.priority] : '', account.notes,
    intelligence?.factoryCount, intelligence?.siteAreaSqm, intelligence?.buildingAreaSqm, intelligence?.roofAreaSqm, intelligence?.availableLandSqm, intelligence?.operatingHoursPerDay, intelligence?.operatingDaysPerWeek, intelligence?.shiftsPerDay,
    intelligence?.monthlyConsumptionKwh, intelligence?.annualConsumptionKwh, intelligence?.monthlyElectricityCost, intelligence?.electricityCostCurrency, intelligence?.electricityTariff, intelligence?.peakDemandKw,
    intelligence?.gridStability ? GRID_LABELS[intelligence.gridStability] : '', intelligence?.outageHoursPerMonth, intelligence?.transformerCapacityKva, intelligence?.generatorCapacityKw, intelligence?.existingSolarKw, intelligence?.existingStorageKwh,
    intelligence?.keyEquipmentText, intelligence?.energyPainPoints, intelligence?.projectNeeds ? labels(intelligence.projectNeeds, NEED_LABELS) : '', intelligence?.projectBudget, intelligence?.projectBudgetCurrency, intelligence?.projectTimeline,
    intelligence?.channelProducts ? labels(intelligence.channelProducts, PRODUCT_LABELS) : '', intelligence?.representedBrands, intelligence?.existingSuppliers, intelligence?.annualPurchaseValue, intelligence?.purchaseCurrency,
    intelligence?.purchaseFrequency ? FREQUENCY_LABELS[intelligence.purchaseFrequency] : '', intelligence?.coverageRegions, intelligence?.branchCount, yesNo(intelligence?.warehouseCapability), yesNo(intelligence?.afterSalesCapability), yesNo(intelligence?.installationCapability),
    intelligence?.technicalTeamSize, intelligence?.channelCustomerSegments, intelligence?.targetProducts ? labels(intelligence.targetProducts, PRODUCT_LABELS) : '', intelligence?.paymentTerms, intelligence?.nextPurchaseAt,
  ];
}
