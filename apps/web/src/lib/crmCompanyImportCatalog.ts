import {
  ECUADOR_TOP500_V46_FIELD_MAPPING,
  ECUADOR_TOP500_V46_HEADERS,
  PROTECTED_OPERATIONAL_RESEARCH_HEADERS,
  recognizeResearchSchema,
  type EcuadorTop500Header,
  type ResearchDestinationObject,
} from './crmResearchIntake';
import { TOP500_V46_MODULES } from './crmTop500V46Contract';

export type CompanyImportField = {
  key: string;
  label: string;
  group: string;
  destinationObject: ResearchDestinationObject;
  destinationField: string;
  protected: boolean;
  identityOnly?: boolean;
  aliases: readonly string[];
};

export type CompanyImportPreset = {
  id: string;
  label: string;
  description: string;
  defaultCountry: string | null;
  defaultRegistrationType: string | null;
  sourceHeaders: readonly string[];
};

export const COMPANY_IMPORT_IDENTITY_KEYS = {
  country: '__registrationCountry',
  registrationType: '__registrationType',
  registrationId: '__registrationId',
  displayName: '公司名称',
} as const;

const IDENTITY_FIELDS: readonly CompanyImportField[] = [
  {
    key: COMPANY_IMPORT_IDENTITY_KEYS.country,
    label: '注册国家/地区',
    group: '企业身份',
    destinationObject: 'COMPANY',
    destinationField: 'registrationCountry',
    protected: false,
    identityOnly: true,
    aliases: ['country', 'country code', 'registration country', '国家', '国家代码', '注册国家'],
  },
  {
    key: COMPANY_IMPORT_IDENTITY_KEYS.registrationType,
    label: '企业注册号类型',
    group: '企业身份',
    destinationObject: 'COMPANY',
    destinationField: 'registrationType',
    protected: false,
    identityOnly: true,
    aliases: ['registration type', 'id type', 'tax id type', '注册号类型', '税号类型'],
  },
  {
    key: COMPANY_IMPORT_IDENTITY_KEYS.registrationId,
    label: '企业注册号/税号',
    group: '企业身份',
    destinationObject: 'COMPANY',
    destinationField: 'registrationId',
    protected: false,
    identityOnly: true,
    aliases: ['registration id', 'registration number', 'tax id', 'tax number', 'company registration id', '企业注册号', '税号', '统一社会信用代码', 'ruc'],
  },
];

const GROUP_BY_HEADER = new Map<string, string>();
for (const module of TOP500_V46_MODULES) {
  for (const header of module.headers) GROUP_BY_HEADER.set(header, module.title);
}

const COMMON_ALIASES: Partial<Record<EcuadorTop500Header, readonly string[]>> = {
  '公司名称': ['company', 'company name', 'company_name', '企业名称', '客户名称'],
  '商业名称': ['commercial name', 'trade name', 'brand name', '商业名'],
  RUC: ['ecuador ruc', '厄瓜多尔ruc'],
  '官网': ['website', 'web site', 'company website', 'url'],
  LinkedIn: ['linkedin url', 'linkedin company', 'company linkedin'],
  '行业大类': ['industry', 'industry category', 'sector', '行业'],
  '行业细分': ['industry segment', 'sub industry', 'sub-industry', '细分行业'],
  '省/州': ['province', 'state', 'region', '省', '州'],
  '城市': ['city', '城市名称'],
  '主要工厂/运营地址': ['address', 'factory address', 'plant address', 'operating address', '公司地址'],
  '公司电话': ['phone', 'telephone', 'company phone', 'tel'],
  '公司邮箱': ['email', 'company email', 'e-mail'],
  '公司WhatsApp': ['whatsapp', 'whatsapp number', 'company whatsapp'],
  '2025营收USD': ['revenue', 'annual revenue', 'annual revenue usd', '营收', '年营收'],
  '员工人数': ['employees', 'employee count', 'number of employees', 'staff'],
  '主营产品/服务': ['products', 'services', 'products/services', 'main products', '主营产品'],
  '工厂/主要场址数': ['site count', 'factory count', 'plant count', 'locations'],
  '潜在峰值负荷估算kW': ['peak demand kw', 'estimated peak demand', 'peak load kw'],
  '潜在月用电估算kWh': ['monthly consumption kwh', 'estimated monthly consumption', 'monthly energy kwh'],
  '数据核验等级': ['verification grade', 'verification level'],
  '开发优先级': ['priority', 'research priority', 'development priority'],
  '开发排名': ['rank', 'research rank', 'development rank'],
  'GBAP价值评分': ['score', 'value score', 'gbap score'],
};

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_\-\/]+/g, '');
}

const BUSINESS_FIELDS: readonly CompanyImportField[] = ECUADOR_TOP500_V46_FIELD_MAPPING.map((item) => ({
  key: item.sourceHeader,
  label: item.sourceHeader,
  group: GROUP_BY_HEADER.get(item.sourceHeader) ?? '其他',
  destinationObject: item.destinationObject,
  destinationField: item.destinationField,
  protected: PROTECTED_OPERATIONAL_RESEARCH_HEADERS.has(item.sourceHeader),
  aliases: COMMON_ALIASES[item.sourceHeader] ?? [],
}));

export const COMPANY_IMPORT_FIELD_CATALOG: readonly CompanyImportField[] = [
  ...IDENTITY_FIELDS,
  ...BUSINESS_FIELDS,
];

export const COMPANY_IMPORT_FIELD_BY_KEY = new Map(
  COMPANY_IMPORT_FIELD_CATALOG.map((field) => [field.key, field] as const),
);

const MATCH_INDEX = new Map<string, string>();
for (const field of COMPANY_IMPORT_FIELD_CATALOG) {
  MATCH_INDEX.set(normalizeHeader(field.label), field.key);
  for (const alias of field.aliases) MATCH_INDEX.set(normalizeHeader(alias), field.key);
}

export const ECUADOR_V46_COMPANY_IMPORT_PRESET: CompanyImportPreset = {
  id: 'gbap-ecuador-v46',
  label: 'GBAP 厄瓜多尔客户研究 v46',
  description: '当前厄瓜多尔 v46 数据集的字段映射预设。它只是映射模板，不是独立导入功能。',
  defaultCountry: 'EC',
  defaultRegistrationType: 'RUC',
  sourceHeaders: ECUADOR_TOP500_V46_HEADERS,
};

export function detectCompanyImportPreset(headers: readonly string[]): CompanyImportPreset | null {
  const recognition = recognizeResearchSchema(headers);
  return recognition.recognized ? ECUADOR_V46_COMPANY_IMPORT_PRESET : null;
}

export function autoMapCompanyImportHeaders(headers: readonly string[]) {
  const preset = detectCompanyImportPreset(headers);
  const usedTargets = new Set<string>();
  return headers.map((header) => {
    let matched: string | null = null;
    if (preset?.id === ECUADOR_V46_COMPANY_IMPORT_PRESET.id && header === 'RUC') {
      matched = COMPANY_IMPORT_IDENTITY_KEYS.registrationId;
    } else {
      matched = MATCH_INDEX.get(normalizeHeader(header)) ?? null;
    }
    if (!matched || usedTargets.has(matched)) return { sourceHeader: header, targetKey: null as string | null };
    usedTargets.add(matched);
    return { sourceHeader: header, targetKey: matched };
  });
}

export function companyImportFieldGroups() {
  const groups = new Map<string, CompanyImportField[]>();
  for (const field of COMPANY_IMPORT_FIELD_CATALOG) {
    const values = groups.get(field.group) ?? [];
    values.push(field);
    groups.set(field.group, values);
  }
  return [...groups.entries()].map(([label, fields]) => ({ label, fields }));
}

export const COMPANY_IMPORT_PROTECTED_KEYS = new Set(
  COMPANY_IMPORT_FIELD_CATALOG.filter((field) => field.protected).map((field) => field.key),
);
