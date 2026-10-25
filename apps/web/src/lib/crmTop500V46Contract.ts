import {
  ECUADOR_TOP500_V46_FIELD_MAPPING,
  ECUADOR_TOP500_V46_HEADERS,
  type EcuadorTop500Header,
} from './crmResearchIntake';

export type Top500V46Module = {
  title: string;
  headers: readonly EcuadorTop500Header[];
};

/**
 * Single UI contract for the frozen Ecuador TOP500 v46 workbook.
 * Detail, edit and acceptance tests must consume this exact structure instead of
 * keeping their own field lists.
 */
export const TOP500_V46_MODULES: readonly Top500V46Module[] = [
  {
    title: '开发与核验',
    headers: ['开发排名', 'GBAP价值评分', '开发优先级', '销售状态', '当前项目阶段', '销售负责人', '首次联系日期', '最后联系日期', '下次跟进日期', '客户反馈/关键异议', '数据核验等级'],
  },
  {
    title: '企业与公开资料',
    headers: ['公司名称', '商业名称', 'RUC', '私营企业核验', '官网', 'LinkedIn', '行业大类', '行业细分', '主营产品/服务', '为什么值得开发'],
  },
  {
    title: '地址与企业联系',
    headers: ['省/州', '城市', '主要工厂/运营地址', 'Google Maps核验链接', '公司电话', '公司邮箱', '公司WhatsApp'],
  },
  {
    title: '联系人与决策链',
    headers: ['法人/代表人', '法人/代表人职务', '首选业务决策人', '首选业务决策人联系方式', '工厂/运营负责人', '工厂/运营负责人联系方式', '工程/能源/维护负责人', '工程/能源联系方式', '采购负责人', '采购联系方式', '联系人核验状态', '推荐优先寻找职位'],
  },
  {
    title: '规模与运营',
    headers: ['2025营收USD', '员工人数', '规模等级', '规模判断依据', '工厂/主要场址数', '生产/运营时长', '工艺/运营特征', '主要耗电设备'],
  },
  {
    title: '能源与用电',
    headers: ['潜在用电等级', '潜在峰值负荷估算kW', '潜在月用电估算kWh', '能源估算置信度', '用电判断依据', '已知实际用电/能源数据', '实际用电数据来源', '供电/停电痛点', '现有发电机/备用电源', '现有光伏/储能', '屋顶/场地条件'],
  },
  {
    title: '机会与开发策略',
    headers: ['光伏机会', '储能机会', '发电机机会', '变压器/电气机会', '最佳匹配产品/方案', '建议首推切入点', '预计项目规模', '推荐开发渠道', '首封开发主题', '首次联系建议'],
  },
  {
    title: '证据与下一步',
    headers: ['关键核验来源', '关键核验结论', '关键证据URL', '数据完整度/深挖状态', '核验日期', '下一步动作'],
  },
] as const;

export const TOP500_V46_FIELD_COUNT = 75 as const;
export const TOP500_V46_MODULE_HEADERS = TOP500_V46_MODULES.flatMap((module) => [...module.headers]);
export const TOP500_V46_MAPPING_HEADERS = ECUADOR_TOP500_V46_FIELD_MAPPING.map((item) => item.sourceHeader);

function sameSequence(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export type Top500V46ContractCheck = {
  ok: boolean;
  fieldCount: number;
  headersUnique: boolean;
  modulesUnique: boolean;
  mappingUnique: boolean;
  modulesMatchHeaders: boolean;
  mappingMatchesHeaders: boolean;
};

export function checkTop500V46Contract(): Top500V46ContractCheck {
  const headersUnique = new Set<string>(ECUADOR_TOP500_V46_HEADERS).size === ECUADOR_TOP500_V46_HEADERS.length;
  const modulesUnique = new Set<string>(TOP500_V46_MODULE_HEADERS).size === TOP500_V46_MODULE_HEADERS.length;
  const mappingUnique = new Set<string>(TOP500_V46_MAPPING_HEADERS).size === TOP500_V46_MAPPING_HEADERS.length;
  const modulesMatchHeaders = sameSequence(TOP500_V46_MODULE_HEADERS, ECUADOR_TOP500_V46_HEADERS);
  const mappingMatchesHeaders = sameSequence(TOP500_V46_MAPPING_HEADERS, ECUADOR_TOP500_V46_HEADERS);
  const fieldCount = ECUADOR_TOP500_V46_HEADERS.length;
  return {
    ok: fieldCount === TOP500_V46_FIELD_COUNT
      && headersUnique
      && modulesUnique
      && mappingUnique
      && modulesMatchHeaders
      && mappingMatchesHeaders,
    fieldCount,
    headersUnique,
    modulesUnique,
    mappingUnique,
    modulesMatchHeaders,
    mappingMatchesHeaders,
  };
}

export function assertTop500V46Contract() {
  const result = checkTop500V46Contract();
  if (!result.ok) throw new Error(`TOP500_V46_FIELD_CONTRACT_MISMATCH:${JSON.stringify(result)}`);
  return result;
}

export const TOP500_V46_URL_FIELDS = new Set<EcuadorTop500Header>([
  '官网', 'LinkedIn', 'Google Maps核验链接', '关键证据URL',
]);

export const TOP500_V46_LONG_TEXT_FIELDS = new Set<EcuadorTop500Header>([
  '客户反馈/关键异议', '主营产品/服务', '为什么值得开发', '规模判断依据', '工艺/运营特征', '主要耗电设备',
  '用电判断依据', '已知实际用电/能源数据', '实际用电数据来源', '供电/停电痛点', '现有发电机/备用电源',
  '现有光伏/储能', '屋顶/场地条件', '最佳匹配产品/方案', '建议首推切入点', '预计项目规模', '首次联系建议',
  '关键核验结论', '下一步动作',
]);
