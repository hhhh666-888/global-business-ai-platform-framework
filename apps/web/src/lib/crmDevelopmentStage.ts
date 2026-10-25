export const DEVELOPMENT_STAGES = [
  { key: 'NEW', label: '待开发', hint: '确认客户价值与开发优先级' },
  { key: 'CONTACTED', label: '已联系', hint: '找到有效联系人并取得首次回应' },
  { key: 'QUALIFYING', label: '资格筛选', hint: '确认客户真实性、规模与开发价值' },
  { key: 'NEEDS_CONFIRMED', label: '需求确认', hint: '确认能源、采购或项目需求' },
  { key: 'TECHNICAL_SAMPLE', label: '技术推进', hint: '收集现场资料并推进选型 / 技术交流' },
  { key: 'QUOTATION', label: '报价方案', hint: '提交报价或解决方案并取得反馈' },
  { key: 'NEGOTIATION', label: '商务谈判', hint: '推进价格、付款、交付与关键异议' },
  { key: 'DECISION', label: '客户决策', hint: '跟进内部审批、决策人与决策节点' },
  { key: 'ORDER_PENDING', label: '待下单', hint: '确认订单、合同与付款安排' },
  { key: 'ORDER_CONFIRMED', label: '已成交', hint: '进入交付，并继续寻找复购与扩单' },
  { key: 'ON_HOLD', label: '暂停跟进', hint: '记录暂停原因并设置重新跟进时间' },
] as const;

export type DevelopmentStage = typeof DEVELOPMENT_STAGES[number]['key'];

/**
 * One canonical set drives both "跟进状态" and "开发进度". There is no second
 * independently maintained status vocabulary. ON_HOLD is a non-linear progress
 * state, so its opportunity ordering remains below the normal sales progression.
 */
export const DEVELOPMENT_STAGE_ORDER = Object.fromEntries(
  DEVELOPMENT_STAGES.map((stage, index) => [stage.key, index]),
) as Record<DevelopmentStage, number>;
DEVELOPMENT_STAGE_ORDER.ON_HOLD = -1;

export const DEVELOPMENT_STAGE_LABELS = Object.fromEntries(
  DEVELOPMENT_STAGES.map((stage) => [stage.key, stage.label]),
) as Record<DevelopmentStage, string>;

export const FOLLOW_UP_STATUS_OPTIONS = DEVELOPMENT_STAGES.map(
  (stage) => [stage.key, stage.label] as const,
);

export const DEFAULT_NEXT_ACTIONS: Record<DevelopmentStage, string> = {
  NEW: '完成首次联系并找到有效联系人',
  CONTACTED: '确认回复并补齐关键决策人',
  QUALIFYING: '完成客户资格筛选与机会判断',
  NEEDS_CONFIRMED: '获取用电 / 项目需求与现场资料',
  TECHNICAL_SAMPLE: '推进技术资料、选型或样品确认',
  QUOTATION: '跟进报价反馈并确认关键异议',
  NEGOTIATION: '推进价格、付款与交付条件',
  DECISION: '跟进客户内部决策与审批节点',
  ORDER_PENDING: '确认订单、合同与付款安排',
  ORDER_CONFIRMED: '推进交付并寻找复购 / 扩单机会',
  ON_HOLD: '复核暂停原因并设置重新跟进时间',
};

export function isDevelopmentStage(value: unknown): value is DevelopmentStage {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(DEVELOPMENT_STAGE_LABELS, value.toUpperCase());
}

export function normalizeDevelopmentStage(value: unknown): DevelopmentStage {
  const normalized = String(value ?? '').trim().toUpperCase();
  return isDevelopmentStage(normalized) ? normalized : 'NEW';
}

export function developmentStageLabel(value: unknown) {
  return DEVELOPMENT_STAGE_LABELS[normalizeDevelopmentStage(value)];
}
