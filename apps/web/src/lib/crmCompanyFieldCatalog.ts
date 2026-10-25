export type CompanyFieldCategory = 'COMPANY_BASE' | 'GBAP_VALUE' | 'ENERGY' | 'DECISION_CHAIN' | 'SALES_EXECUTION';
export type CompanyFieldDataType = 'TEXT' | 'NUMBER' | 'DATE' | 'DATETIME' | 'ENUM' | 'URL' | 'BOOLEAN' | 'CURRENCY' | 'PERCENT';
export type CompanyCustomerTypeScope = 'ALL' | 'INDUSTRIAL' | 'CHANNEL';

export type CompanyFieldDefinition = {
  fieldKey: string;
  labelZh: string;
  labelEn: string;
  dataType: CompanyFieldDataType;
  category: CompanyFieldCategory;
  sortable: boolean;
  filterable: boolean;
  searchable: boolean;
  defaultVisible: boolean;
  availableForCustomerType: CompanyCustomerTypeScope;
  sourceObject: 'Company' | 'Site' | 'Contact' | 'CustomerIntelligence' | 'SalesExecution' | 'Opportunity';
  sourceField: string;
};

const field = (
  fieldKey: string,
  labelZh: string,
  labelEn: string,
  dataType: CompanyFieldDataType,
  category: CompanyFieldCategory,
  sourceObject: CompanyFieldDefinition['sourceObject'],
  sourceField: string,
  options: Partial<Pick<CompanyFieldDefinition, 'sortable' | 'filterable' | 'searchable' | 'defaultVisible' | 'availableForCustomerType'>> = {},
): CompanyFieldDefinition => ({
  fieldKey,
  labelZh,
  labelEn,
  dataType,
  category,
  sortable: options.sortable ?? true,
  filterable: options.filterable ?? true,
  searchable: options.searchable ?? dataType === 'TEXT',
  defaultVisible: options.defaultVisible ?? false,
  availableForCustomerType: options.availableForCustomerType ?? 'ALL',
  sourceObject,
  sourceField,
});

export const COMPANY_FIELD_CATALOG: readonly CompanyFieldDefinition[] = [
  field('company.displayName', '公司名称', 'Company', 'TEXT', 'COMPANY_BASE', 'Company', 'displayName', { defaultVisible: true }),
  field('company.commercialName', '商业名称', 'Commercial Name', 'TEXT', 'COMPANY_BASE', 'Company', 'commercialName'),
  field('company.registrationId', '注册号 / RUC', 'Registration ID', 'TEXT', 'COMPANY_BASE', 'Company', 'registrationId', { defaultVisible: true }),
  field('company.customerType', '客户类型', 'Customer Type', 'ENUM', 'COMPANY_BASE', 'Company', 'customerType', { defaultVisible: true }),
  field('company.industry', '行业', 'Industry', 'TEXT', 'COMPANY_BASE', 'Company', 'industry', { defaultVisible: true }),
  field('company.registrationCountry', '注册国家', 'Registration Country', 'ENUM', 'COMPANY_BASE', 'Company', 'registrationCountry'),
  field('company.addressState', '省 / 州', 'State / Province', 'TEXT', 'COMPANY_BASE', 'Company', 'addressState'),
  field('company.addressCity', '城市', 'City', 'TEXT', 'COMPANY_BASE', 'Company', 'addressCity', { defaultVisible: true }),
  field('company.website', '官网', 'Website', 'URL', 'COMPANY_BASE', 'Company', 'website', { sortable: false, filterable: false }),
  field('company.linkedinUrl', 'LinkedIn', 'LinkedIn', 'URL', 'COMPANY_BASE', 'Company', 'linkedinUrl', { sortable: false, filterable: false }),
  field('company.primaryPhone', '电话', 'Phone', 'TEXT', 'COMPANY_BASE', 'Company', 'primaryPhone'),
  field('company.primaryEmail', '邮箱', 'Email', 'TEXT', 'COMPANY_BASE', 'Company', 'primaryEmail'),
  field('company.employeeCount', '员工人数', 'Employees', 'NUMBER', 'COMPANY_BASE', 'Company', 'employeeCount'),
  field('company.annualRevenue', '营收', 'Revenue', 'CURRENCY', 'COMPANY_BASE', 'Company', 'annualRevenue'),
  field('company.ownershipType', '所有制', 'Ownership', 'ENUM', 'COMPANY_BASE', 'Company', 'ownershipType'),

  field('value.strategicValueScore', 'GBAP Score', 'GBAP Score', 'NUMBER', 'GBAP_VALUE', 'Company', 'strategicValueScore', { defaultVisible: true }),
  field('value.researchRank', 'Research Rank', 'Research Rank', 'NUMBER', 'GBAP_VALUE', 'Company', 'researchRank', { defaultVisible: true }),
  field('value.priority', 'Priority', 'Priority', 'ENUM', 'GBAP_VALUE', 'Company', 'priority', { defaultVisible: true }),
  field('value.verificationGrade', 'Verification Grade', 'Verification Grade', 'ENUM', 'GBAP_VALUE', 'Company', 'verificationGrade', { defaultVisible: true }),
  field('value.dataCompleteness', '资料完整度', 'Data Completeness', 'PERCENT', 'GBAP_VALUE', 'CustomerIntelligence', 'researchCompleteness'),

  field('energy.siteCount', 'Site数量', 'Sites', 'NUMBER', 'ENERGY', 'Site', 'aggregate.siteCount', { defaultVisible: true, availableForCustomerType: 'INDUSTRIAL' }),
  field('energy.monthlyConsumptionKwh', '月用电量', 'Monthly Consumption', 'NUMBER', 'ENERGY', 'Site', 'aggregate.monthlyConsumptionKwh', { defaultVisible: true, availableForCustomerType: 'INDUSTRIAL' }),
  field('energy.annualConsumptionKwh', '年用电量', 'Annual Consumption', 'NUMBER', 'ENERGY', 'Site', 'aggregate.annualConsumptionKwh', { availableForCustomerType: 'INDUSTRIAL' }),
  field('energy.peakDemandKw', '最大需量', 'Peak Demand', 'NUMBER', 'ENERGY', 'Site', 'aggregate.peakDemandKw', { availableForCustomerType: 'INDUSTRIAL' }),
  field('energy.monthlyElectricityCost', '月电费', 'Monthly Electricity Cost', 'CURRENCY', 'ENERGY', 'CustomerIntelligence', 'monthlyElectricityCost', { availableForCustomerType: 'INDUSTRIAL' }),
  field('energy.electricityTariff', '平均电价', 'Electricity Tariff', 'CURRENCY', 'ENERGY', 'Site', 'aggregate.electricityTariff', { availableForCustomerType: 'INDUSTRIAL' }),
  field('energy.outageHoursPerMonth', '停电时长', 'Outage Hours', 'NUMBER', 'ENERGY', 'Site', 'aggregate.outageHoursPerMonth', { availableForCustomerType: 'INDUSTRIAL' }),
  field('energy.gridStability', '供电稳定性', 'Grid Stability', 'ENUM', 'ENERGY', 'Site', 'aggregate.gridStability', { defaultVisible: true, availableForCustomerType: 'INDUSTRIAL' }),
  field('energy.transformerCapacityKva', '变压器', 'Transformer', 'NUMBER', 'ENERGY', 'Site', 'aggregate.transformerCapacityKva', { availableForCustomerType: 'INDUSTRIAL' }),
  field('energy.generatorCapacityKw', '发电机', 'Generator', 'NUMBER', 'ENERGY', 'Site', 'aggregate.generatorCapacityKw', { availableForCustomerType: 'INDUSTRIAL' }),
  field('energy.existingSolarKw', 'PV', 'PV', 'NUMBER', 'ENERGY', 'Site', 'aggregate.existingSolarKw', { availableForCustomerType: 'INDUSTRIAL' }),
  field('energy.existingStorageKwh', 'BESS', 'BESS', 'NUMBER', 'ENERGY', 'Site', 'aggregate.existingStorageKwh', { availableForCustomerType: 'INDUSTRIAL' }),
  field('energy.keyEquipment', '关键设备', 'Key Equipment', 'TEXT', 'ENERGY', 'Site', 'aggregate.keyEquipment', { sortable: false, availableForCustomerType: 'INDUSTRIAL' }),
  field('energy.energyPainPoints', '能源痛点', 'Energy Pain', 'TEXT', 'ENERGY', 'Site', 'aggregate.energyPainPoints', { sortable: false, availableForCustomerType: 'INDUSTRIAL' }),

  field('decision.contactCount', '联系人数量', 'Contacts', 'NUMBER', 'DECISION_CHAIN', 'Contact', 'aggregate.contactCount', { defaultVisible: true }),
  field('decision.completeness', 'Decision Chain完整度', 'Decision Chain Completeness', 'PERCENT', 'DECISION_CHAIN', 'Contact', 'aggregate.decisionChainCompleteness', { defaultVisible: true }),
  field('decision.plant', 'Plant', 'Plant', 'BOOLEAN', 'DECISION_CHAIN', 'Contact', 'roles.PLANT'),
  field('decision.maintenance', 'Maintenance', 'Maintenance', 'BOOLEAN', 'DECISION_CHAIN', 'Contact', 'roles.MAINTENANCE'),
  field('decision.engineering', 'Engineering', 'Engineering', 'BOOLEAN', 'DECISION_CHAIN', 'Contact', 'roles.ENGINEERING'),
  field('decision.energy', 'Energy', 'Energy', 'BOOLEAN', 'DECISION_CHAIN', 'Contact', 'roles.ENERGY'),
  field('decision.procurement', 'Procurement', 'Procurement', 'BOOLEAN', 'DECISION_CHAIN', 'Contact', 'roles.PROCUREMENT'),
  field('decision.supplyChain', 'Supply Chain', 'Supply Chain', 'BOOLEAN', 'DECISION_CHAIN', 'Contact', 'roles.SUPPLY_CHAIN'),
  field('decision.highestLevel', '最高决策层', 'Highest Decision Level', 'ENUM', 'DECISION_CHAIN', 'Contact', 'aggregate.highestDecisionLevel'),

  field('sales.accountOwner', 'Account Owner', 'Account Owner', 'TEXT', 'SALES_EXECUTION', 'Company', 'accountOwnerUserId', { defaultVisible: true }),
  field('sales.relationshipStatus', 'Relationship Status', 'Relationship Status', 'ENUM', 'SALES_EXECUTION', 'Company', 'relationshipStatus', { defaultVisible: true }),
  field('sales.salesHeat', 'Sales Heat', 'Sales Heat', 'NUMBER', 'SALES_EXECUTION', 'SalesExecution', 'salesHeat', { defaultVisible: true }),
  field('sales.salesSignal', 'Sales Signal', 'Sales Signal', 'TEXT', 'SALES_EXECUTION', 'SalesExecution', 'latestSignal', { defaultVisible: true }),
  field('sales.lastContact', 'Last Contact', 'Last Contact', 'DATETIME', 'SALES_EXECUTION', 'SalesExecution', 'lastContactAt'),
  field('sales.nextFollowUp', 'Next Follow-up', 'Next Follow-up', 'DATETIME', 'SALES_EXECUTION', 'SalesExecution', 'nextFollowUpAt', { defaultVisible: true }),
  field('sales.daysSinceLastContact', 'Days Since Last Contact', 'Days Since Last Contact', 'NUMBER', 'SALES_EXECUTION', 'SalesExecution', 'daysSinceLastContact'),
  field('sales.openTasks', 'Open Tasks', 'Open Tasks', 'NUMBER', 'SALES_EXECUTION', 'SalesExecution', 'openTaskCount'),
  field('sales.sequence', 'Sequence', 'Sequence', 'TEXT', 'SALES_EXECUTION', 'SalesExecution', 'sequenceName'),
  field('sales.sprint', 'Sprint', 'Sprint', 'TEXT', 'SALES_EXECUTION', 'SalesExecution', 'sprintName'),
  field('sales.energyDiscovery', 'Energy Discovery %', 'Energy Discovery %', 'PERCENT', 'SALES_EXECUTION', 'SalesExecution', 'energyDiscoveryCompleteness'),
  field('sales.opportunityCount', 'Opportunity Count', 'Opportunity Count', 'NUMBER', 'SALES_EXECUTION', 'Opportunity', 'aggregate.count'),
  field('sales.highestOpportunityStage', 'Highest Opportunity Stage', 'Highest Opportunity Stage', 'ENUM', 'SALES_EXECUTION', 'Opportunity', 'aggregate.highestStage'),
  field('sales.estimatedValue', 'Estimated Value', 'Estimated Value', 'CURRENCY', 'SALES_EXECUTION', 'Opportunity', 'aggregate.estimatedValue'),
] as const;

export type PrebuiltCompanyView = {
  id: 'TOP500_RESEARCH' | 'ENERGY_OPPORTUNITY' | 'DECISION_CHAIN' | 'SALES_DEVELOPMENT' | 'TOP30_SPRINT';
  labelZh: string;
  fields: readonly string[];
};

export const PREBUILT_COMPANY_VIEWS: readonly PrebuiltCompanyView[] = [
  {
    id: 'TOP500_RESEARCH',
    labelZh: 'TOP500 Research',
    fields: ['value.researchRank', 'company.displayName', 'company.industry', 'company.addressCity', 'value.strategicValueScore', 'value.priority', 'company.annualRevenue', 'company.employeeCount', 'energy.siteCount', 'value.verificationGrade'],
  },
  {
    id: 'ENERGY_OPPORTUNITY',
    labelZh: 'Energy Opportunity',
    fields: ['company.displayName', 'energy.siteCount', 'energy.monthlyConsumptionKwh', 'energy.peakDemandKw', 'energy.outageHoursPerMonth', 'energy.generatorCapacityKw', 'energy.existingSolarKw', 'energy.existingStorageKwh', 'energy.energyPainPoints'],
  },
  {
    id: 'DECISION_CHAIN',
    labelZh: 'Decision Chain',
    fields: ['company.displayName', 'decision.plant', 'decision.maintenance', 'decision.engineering', 'decision.energy', 'decision.procurement', 'decision.supplyChain', 'decision.completeness'],
  },
  {
    id: 'SALES_DEVELOPMENT',
    labelZh: 'Sales Development',
    fields: ['company.displayName', 'sales.accountOwner', 'value.priority', 'sales.salesHeat', 'sales.lastContact', 'sales.nextFollowUp', 'sales.salesSignal', 'sales.openTasks', 'sales.relationshipStatus'],
  },
  {
    id: 'TOP30_SPRINT',
    labelZh: 'TOP30 Sprint',
    fields: ['company.displayName', 'value.researchRank', 'value.strategicValueScore', 'sales.salesHeat', 'sales.salesSignal', 'decision.completeness', 'sales.accountOwner', 'sales.nextFollowUp'],
  },
] as const;

export function companyFieldsByCategory(category: CompanyFieldCategory) {
  return COMPANY_FIELD_CATALOG.filter((definition) => definition.category === category);
}

export function findCompanyField(fieldKey: string) {
  return COMPANY_FIELD_CATALOG.find((definition) => definition.fieldKey === fieldKey) ?? null;
}
