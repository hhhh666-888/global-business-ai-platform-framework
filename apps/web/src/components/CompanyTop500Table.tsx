import { useEffect, useMemo, useRef, useState } from 'react';
import type { CanonicalContact, CanonicalOpportunity } from '../lib/crmBusinessClient';
import type { CompanyResearchInsight } from '../lib/crmCompanyResearchInsightsClient';
import { ECUADOR_TOP500_V46_HEADERS, type EcuadorTop500Header } from '../lib/crmResearchIntake';
import { TOP500_V46_MODULES, TOP500_V46_URL_FIELDS, assertTop500V46Contract } from '../lib/crmTop500V46Contract';
import { getUserPreference, setUserPreference } from '../lib/userPreferencesClient';
import { buildCompanyProfile75Values, type CompanyProfile75Record } from './CompanyBasicProfile75Detail';

type SegmentView = 'ALL' | 'INDUSTRIAL' | 'CHANNEL' | 'PROJECT';
type SortDirection = 'asc' | 'desc';
type SortState = { key: EcuadorTop500Header; direction: SortDirection };
type ColumnWidths = Partial<Record<EcuadorTop500Header, number>>;
type Filters = {
  country: string;
  industry: string;
  stage: string;
  owner: string;
  contactability: string;
  opportunity: string;
};
type SavedView = {
  id: string;
  name: string;
  segment: SegmentView;
  filters: Filters;
  sort: SortState;
  columns: EcuadorTop500Header[];
  columnWidths: ColumnWidths;
};
type CustomerTablePreference = {
  version: number;
  segment: SegmentView;
  filters: Filters;
  sort: SortState;
  visibleColumns: Record<SegmentView, EcuadorTop500Header[]>;
  columnWidths: ColumnWidths;
  savedViews: SavedView[];
};
type Row = {
  account: CompanyProfile75Record;
  values: Record<EcuadorTop500Header, string>;
  segment: SegmentView;
};

type Props = {
  accounts: CompanyProfile75Record[];
  contacts: CanonicalContact[];
  opportunities: CanonicalOpportunity[];
  insights: CompanyResearchInsight[];
  researchLoading?: boolean;
  search?: string;
  userKey?: string | null;
  isSuperAdmin?: boolean;
  bulkDeleting?: boolean;
  onBulkDelete?: (businessIds: string[]) => Promise<string[]>;
  onOpen: (account: CompanyProfile75Record) => void;
};

const PAGE_SIZE = 50;
const CONTACTABILITY_OPTIONS = ['可直接联系', '仅有联系人资料', '尚无联系人/联系方式'];
const OPPORTUNITY_OPTIONS = ['已有商机', '暂无商机'];
const EMPTY_FILTERS: Filters = {
  country: '', industry: '', stage: '', owner: '', contactability: '', opportunity: '',
};
const CUSTOMER_TABLE_PREFERENCE_KEY = 'customer-company-table';
const SEGMENTS: SegmentView[] = ['ALL', 'INDUSTRIAL', 'CHANNEL', 'PROJECT'];

const DEFAULT_COLUMNS: Record<SegmentView, EcuadorTop500Header[]> = {
  ALL: ['公司名称', 'RUC', '省/州', '城市', '行业大类', '开发排名', 'GBAP价值评分', '开发优先级', '数据核验等级', '销售状态'],
  INDUSTRIAL: ['公司名称', '省/州', '城市', '行业大类', '潜在用电等级', '潜在峰值负荷估算kW', '潜在月用电估算kWh', '供电/停电痛点', '光伏机会', '储能机会', '发电机机会', '销售状态'],
  CHANNEL: ['公司名称', '省/州', '城市', '行业大类', '主营产品/服务', '推荐开发渠道', '最佳匹配产品/方案', '开发优先级', '数据核验等级', '销售状态'],
  PROJECT: ['公司名称', '省/州', '城市', '行业大类', '预计项目规模', '当前项目阶段', '下一步动作', '销售负责人', '开发优先级', '数据核验等级'],
};

const WIDE_TEXT_FIELDS = new Set<EcuadorTop500Header>([
  '主营产品/服务', '为什么值得开发', '主要工厂/运营地址', '工艺/运营特征', '主要耗电设备', '用电判断依据',
  '已知实际用电/能源数据', '实际用电数据来源', '供电/停电痛点', '现有发电机/备用电源', '现有光伏/储能', '屋顶/场地条件',
  '光伏机会', '储能机会', '发电机机会', '变压器/电气机会', '最佳匹配产品/方案', '建议首推切入点', '预计项目规模',
  '首次联系建议', '关键核验结论', '下一步动作',
]);

function isSegment(value: unknown): value is SegmentView {
  return typeof value === 'string' && SEGMENTS.includes(value as SegmentView);
}

function normalizeFilters(value: unknown): Filters {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<Record<keyof Filters, unknown>> : {};
  return Object.fromEntries(Object.keys(EMPTY_FILTERS).map((key) => [key, typeof source[key as keyof Filters] === 'string' ? source[key as keyof Filters] : ''])) as Filters;
}

function normalizeSort(value: unknown): SortState {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as { key?: unknown; direction?: unknown } : {};
  const key = typeof source.key === 'string' && ECUADOR_TOP500_V46_HEADERS.includes(source.key as EcuadorTop500Header)
    ? source.key as EcuadorTop500Header
    : '开发排名';
  return { key, direction: source.direction === 'desc' ? 'desc' : 'asc' };
}

function normalizeColumns(value: unknown): Record<SegmentView, EcuadorTop500Header[]> {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<Record<SegmentView, unknown>> : {};
  const next = {} as Record<SegmentView, EcuadorTop500Header[]>;
  for (const segment of SEGMENTS) {
    const candidate = Array.isArray(source[segment])
      ? source[segment].filter((header): header is EcuadorTop500Header => typeof header === 'string' && ECUADOR_TOP500_V46_HEADERS.includes(header as EcuadorTop500Header))
      : [];
    next[segment] = candidate.length > 0 ? [...new Set(candidate)] : [...DEFAULT_COLUMNS[segment]];
    if (!next[segment].includes('公司名称')) next[segment].unshift('公司名称');
  }
  return next;
}

function normalizeColumnWidths(value: unknown): ColumnWidths {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output: ColumnWidths = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!ECUADOR_TOP500_V46_HEADERS.includes(key as EcuadorTop500Header) || typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    output[key as EcuadorTop500Header] = Math.max(90, Math.min(560, Math.round(raw)));
  }
  return output;
}

function normalizeSavedViews(value: unknown): SavedView[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const view = raw as Partial<SavedView>;
    if (typeof view.name !== 'string' || !view.name.trim()) return [];
    const segment = isSegment(view.segment) ? view.segment : 'ALL';
    const columns = normalizeColumns({ [segment]: view.columns })[segment];
    return [{
      id: typeof view.id === 'string' && view.id ? view.id : `migrated-${index}`,
      name: view.name.trim().slice(0, 120),
      segment,
      filters: normalizeFilters(view.filters),
      sort: normalizeSort(view.sort),
      columns,
      columnWidths: normalizeColumnWidths(view.columnWidths),
    }];
  });
}

function normalizePreference(value: unknown): CustomerTablePreference {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<CustomerTablePreference> : {};
  return {
    version: 3,
    segment: isSegment(source.segment) ? source.segment : 'ALL',
    filters: normalizeFilters(source.filters),
    sort: normalizeSort(source.sort),
    visibleColumns: normalizeColumns(source.visibleColumns),
    columnWidths: normalizeColumnWidths(source.columnWidths),
    savedViews: normalizeSavedViews(source.savedViews),
  };
}

function segmentFor(account: CompanyProfile75Record): SegmentView {
  if (account.customerSegment === 'CHANNEL' || account.customerType === 'DISTRIBUTOR') return 'CHANNEL';
  if (account.customerSegment === 'PROJECT' || account.customerType === 'EPC' || account.customerType === 'DEVELOPER') return 'PROJECT';
  return 'INDUSTRIAL';
}

function uniqueValues(rows: Row[], header: EcuadorTop500Header) {
  return [...new Set(rows.map((row) => row.values[header]?.trim()).filter((value): value is string => Boolean(value && value !== '待补充')))]
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
}

function uniqueAccountValues(rows: Row[], selector: (row: Row) => string | null | undefined) {
  return [...new Set(rows.map((row) => selector(row)?.trim()).filter((value): value is string => Boolean(value && value !== '待补充')))]
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
}

function compareValues(left: string, right: string) {
  const numeric = (value: string) => {
    const normalized = value.replace(/,/g, '').replace(/USD/gi, '').replace(/[^0-9.+-]/g, '').trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const a = numeric(left); const b = numeric(right);
  if (a !== null && b !== null) return a - b;
  return left.localeCompare(right, 'zh-CN', { numeric: true, sensitivity: 'base' });
}

function normalizeExternalUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '待补充') return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function externalLinkLabel(header: EcuadorTop500Header, href: string, raw: string) {
  if (header === 'LinkedIn') return 'LinkedIn';
  if (header === 'Google Maps核验链接') return 'Google Maps';
  try {
    const host = new URL(href).hostname.replace(/^www\./i, '');
    if (header === '官网' || header === '关键证据URL') return host || raw;
  } catch { /* href was already normalized */ }
  return raw;
}

function displayValue(header: EcuadorTop500Header, value: string) {
  if (!value || value === '待补充') return null;
  if (TOP500_V46_URL_FIELDS.has(header)) {
    const href = normalizeExternalUrl(value);
    if (!href) return value;
    return <a href={href} target="_blank" rel="noopener noreferrer" title={value}>{externalLinkLabel(header, href, value)}</a>;
  }
  return value;
}

function defaultColumnWidth(key: EcuadorTop500Header) {
  if (key === '公司名称') return 260;
  if (key === 'RUC') return 156;
  if (TOP500_V46_URL_FIELDS.has(key)) return 210;
  if (WIDE_TEXT_FIELDS.has(key)) return 280;
  if (key.includes('联系方式') || key.includes('负责人') || key.includes('联系人')) return 210;
  return 168;
}

export function CompanyTop500Table({
  accounts,
  contacts,
  opportunities,
  insights,
  researchLoading = false,
  search = '',
  userKey,
  isSuperAdmin = false,
  bulkDeleting = false,
  onBulkDelete,
  onOpen,
}: Props) {
  assertTop500V46Contract();
  const [segment, setSegment] = useState<SegmentView>('ALL');
  const [localSearch, setLocalSearch] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortState>({ key: '开发排名', direction: 'asc' });
  const [visibleColumns, setVisibleColumns] = useState<Record<SegmentView, EcuadorTop500Header[]>>(DEFAULT_COLUMNS);
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>({});
  const [columnPanelOpen, setColumnPanelOpen] = useState(false);
  const [dragColumn, setDragColumn] = useState<EcuadorTop500Header | null>(null);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeSavedViewId, setActiveSavedViewId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const [preferenceServiceAvailable, setPreferenceServiceAvailable] = useState(false);
  const [page, setPage] = useState(1);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const legacyPreferenceKey = userKey ? `gbap.top500-v46-table.${userKey}` : null;
  const legacySavedViewsKey = userKey ? `gbap.top500-v46-views.${userKey}` : null;

  useEffect(() => {
    if (!userKey) {
      setPreferencesHydrated(false);
      setPreferenceServiceAvailable(false);
      return;
    }
    let active = true;
    setPreferencesHydrated(false);
    setPreferenceServiceAvailable(false);

    let legacyTable: unknown = null;
    let legacyViews: unknown = [];
    try { legacyTable = JSON.parse(localStorage.getItem(legacyPreferenceKey ?? '') ?? 'null'); } catch { legacyTable = null; }
    try { legacyViews = JSON.parse(localStorage.getItem(legacySavedViewsKey ?? '') ?? '[]'); } catch { legacyViews = []; }
    const legacySource = legacyTable && typeof legacyTable === 'object' && !Array.isArray(legacyTable)
      ? legacyTable as { visibleColumns?: unknown; columnWidths?: unknown }
      : {};
    const legacyValue = normalizePreference({
      visibleColumns: legacySource.visibleColumns,
      columnWidths: legacySource.columnWidths,
      savedViews: legacyViews,
    });
    const hasLegacy = Boolean(legacyTable) || (Array.isArray(legacyViews) && legacyViews.length > 0);

    const applyPreference = (preference: CustomerTablePreference) => {
      setSegment(preference.segment);
      setFilters(preference.filters);
      setSort(preference.sort);
      setVisibleColumns(preference.visibleColumns);
      setColumnWidths(preference.columnWidths);
      setSavedViews(preference.savedViews);
      setActiveSavedViewId('');
      setPage(1);
    };

    void (async () => {
      try {
        const remote = await getUserPreference<CustomerTablePreference>(CUSTOMER_TABLE_PREFERENCE_KEY);
        if (!active) return;
        setPreferenceServiceAvailable(true);
        if (remote?.value) {
          applyPreference(normalizePreference(remote.value));
        } else if (hasLegacy) {
          applyPreference(legacyValue);
          await setUserPreference(CUSTOMER_TABLE_PREFERENCE_KEY, legacyValue);
        }
      } catch {
        if (!active) return;
        if (hasLegacy) applyPreference(legacyValue);
        setPreferenceServiceAvailable(false);
      } finally {
        if (active) setPreferencesHydrated(true);
      }
    })();

    return () => { active = false; };
  }, [userKey, legacyPreferenceKey, legacySavedViewsKey]);

  useEffect(() => {
    if (!userKey || !preferencesHydrated) return;
    const preference: CustomerTablePreference = {
      version: 3,
      segment,
      filters,
      sort,
      visibleColumns,
      columnWidths,
      savedViews,
    };
    try {
      if (legacyPreferenceKey) localStorage.setItem(legacyPreferenceKey, JSON.stringify({ visibleColumns, columnWidths }));
      if (legacySavedViewsKey) localStorage.setItem(legacySavedViewsKey, JSON.stringify(savedViews));
    } catch { /* local cache is a non-authoritative fallback */ }
    if (!preferenceServiceAvailable) return;
    const timer = window.setTimeout(() => {
      void setUserPreference(CUSTOMER_TABLE_PREFERENCE_KEY, preference).catch(() => setPreferenceServiceAvailable(false));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [userKey, preferencesHydrated, preferenceServiceAvailable, segment, filters, sort, visibleColumns, columnWidths, savedViews, legacyPreferenceKey, legacySavedViewsKey]);

  useEffect(() => {
    if (activeSavedViewId && !savedViews.some((view) => view.id === activeSavedViewId)) setActiveSavedViewId('');
  }, [activeSavedViewId, savedViews]);

  useEffect(() => {
    const valid = new Set(accounts.map((account) => account.businessId).filter((id): id is string => Boolean(id)));
    setSelectedIds((current) => new Set([...current].filter((id) => valid.has(id))));
  }, [accounts]);

  useEffect(() => { setPage(1); }, [search]);

  const contactsByAccount = useMemo(() => {
    const map = new Map<string, CanonicalContact[]>();
    for (const contact of contacts) {
      if (!contact.accountBusinessId) continue;
      const list = map.get(contact.accountBusinessId) ?? [];
      list.push(contact); map.set(contact.accountBusinessId, list);
    }
    return map;
  }, [contacts]);

  const opportunitiesByAccount = useMemo(() => {
    const map = new Map<string, CanonicalOpportunity[]>();
    for (const opportunity of opportunities) {
      if (!opportunity.accountBusinessId) continue;
      const list = map.get(opportunity.accountBusinessId) ?? [];
      list.push(opportunity); map.set(opportunity.accountBusinessId, list);
    }
    return map;
  }, [opportunities]);

  const insightByAccount = useMemo(() => new Map(insights.map((item) => [item.accountBusinessId, item])), [insights]);

  const rows = useMemo<Row[]>(() => accounts.map((account) => {
    const id = account.businessId ?? '';
    return {
      account,
      segment: segmentFor(account),
      values: buildCompanyProfile75Values(account, contactsByAccount.get(id) ?? [], opportunitiesByAccount.get(id) ?? [], insightByAccount.get(id) ?? null),
    };
  }), [accounts, contactsByAccount, opportunitiesByAccount, insightByAccount]);

  const segmentRows = useMemo(() => segment === 'ALL' ? rows : rows.filter((row) => row.segment === segment), [rows, segment]);
  const options = useMemo(() => ({
    country: uniqueAccountValues(segmentRows, (row) => row.account.addressCountry),
    industry: uniqueValues(segmentRows, '行业大类'),
    stage: uniqueValues(segmentRows, '销售状态'),
    owner: uniqueValues(segmentRows, '销售负责人'),
  }), [segmentRows]);

  const contactabilityFor = (row: Row) => {
    const businessId = row.account.businessId ?? '';
    const rowsForAccount = contactsByAccount.get(businessId) ?? [];
    const direct = Boolean(
      row.account.primaryEmail?.trim()
      || row.account.primaryPhone?.trim()
      || rowsForAccount.some((contact) => Boolean(contact.email?.trim() || contact.phone?.trim() || contact.linkedinUrl?.trim())),
    );
    if (direct) return '可直接联系';
    if (rowsForAccount.length > 0) return '仅有联系人资料';
    return '尚无联系人/联系方式';
  };

  const opportunityStatusFor = (row: Row) => {
    const businessId = row.account.businessId ?? '';
    return (opportunitiesByAccount.get(businessId)?.length ?? 0) > 0 ? '已有商机' : '暂无商机';
  };

  const filteredRows = useMemo(() => {
    const query = `${search} ${localSearch}`.trim().toLocaleLowerCase();
    return segmentRows.filter((row) => {
      if (query && !ECUADOR_TOP500_V46_HEADERS.some((header) => row.values[header].toLocaleLowerCase().includes(query))) return false;
      if (filters.country && (row.account.addressCountry ?? '') !== filters.country) return false;
      if (filters.industry && row.values['行业大类'] !== filters.industry) return false;
      if (filters.stage && row.values['销售状态'] !== filters.stage) return false;
      if (filters.owner && row.values['销售负责人'] !== filters.owner) return false;
      if (filters.contactability && contactabilityFor(row) !== filters.contactability) return false;
      if (filters.opportunity && opportunityStatusFor(row) !== filters.opportunity) return false;
      return true;
    });
  }, [segmentRows, search, localSearch, filters, contactsByAccount, opportunitiesByAccount]);

  const sortedRows = useMemo(() => [...filteredRows].sort((a, b) => {
    const compared = compareValues(a.values[sort.key], b.values[sort.key]);
    return sort.direction === 'asc' ? compared : -compared;
  }), [filteredRows, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageStart = (page - 1) * PAGE_SIZE;
  const pagedRows = useMemo(() => sortedRows.slice(pageStart, pageStart + PAGE_SIZE), [sortedRows, pageStart]);
  const visibleStart = sortedRows.length === 0 ? 0 : pageStart + 1;
  const visibleEnd = pageStart + pagedRows.length;

  const segmentCounts = useMemo(() => ({
    ALL: rows.length,
    INDUSTRIAL: rows.filter((row) => row.segment === 'INDUSTRIAL').length,
    CHANNEL: rows.filter((row) => row.segment === 'CHANNEL').length,
    PROJECT: rows.filter((row) => row.segment === 'PROJECT').length,
  }), [rows]);

  const currentColumns = visibleColumns[segment];
  const columnWidthFor = (key: EcuadorTop500Header) => columnWidths[key] ?? defaultColumnWidth(key);
  const tableWidth = currentColumns.reduce((sum, key) => sum + columnWidthFor(key), isSuperAdmin ? 130 : 86);
  const filteredBusinessIds = useMemo(() => sortedRows.map((row) => row.account.businessId).filter((id): id is string => Boolean(id)), [sortedRows]);
  const allFilteredSelected = filteredBusinessIds.length > 0 && filteredBusinessIds.every((id) => selectedIds.has(id));

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setPage(1); };
  const switchSegment = (next: SegmentView) => {
    setSegment(next);
    setFilters(EMPTY_FILTERS);
    setSort({ key: '开发排名', direction: 'asc' });
    setPage(1);
  };
  const sortBy = (key: EcuadorTop500Header) => {
    setSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
    setPage(1);
  };

  const toggleSelection = (businessId: string) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(businessId)) next.delete(businessId); else next.add(businessId);
    return next;
  });
  const toggleFilteredSelection = () => setSelectedIds((current) => {
    const next = new Set(current);
    if (allFilteredSelected) filteredBusinessIds.forEach((id) => next.delete(id));
    else filteredBusinessIds.forEach((id) => next.add(id));
    return next;
  });
  const clearSelection = () => setSelectedIds(new Set());
  const deleteSelection = async () => {
    if (!isSuperAdmin || bulkDeleting || !onBulkDelete || selectedIds.size === 0) return;
    const succeeded = await onBulkDelete([...selectedIds]);
    if (succeeded.length > 0) setSelectedIds((current) => {
      const next = new Set(current);
      succeeded.forEach((id) => next.delete(id));
      return next;
    });
  };

  const toggleColumn = (key: EcuadorTop500Header) => setVisibleColumns((current) => {
    const list = current[segment];
    if (list.includes(key)) {
      if (key === '公司名称' || list.length <= 2) return current;
      return { ...current, [segment]: list.filter((item) => item !== key) };
    }
    return { ...current, [segment]: [...list, key] };
  });
  const reorderColumns = (from: EcuadorTop500Header, to: EcuadorTop500Header) => setVisibleColumns((current) => {
    const list = [...current[segment]];
    const fromIndex = list.indexOf(from); const toIndex = list.indexOf(to);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return current;
    list.splice(fromIndex, 1); list.splice(toIndex, 0, from);
    return { ...current, [segment]: list };
  });
  const moveColumn = (key: EcuadorTop500Header, delta: number) => {
    const index = currentColumns.indexOf(key); const target = index + delta;
    if (index < 0 || target < 0 || target >= currentColumns.length) return;
    reorderColumns(key, currentColumns[target]);
  };
  const resetColumns = () => setVisibleColumns((current) => ({ ...current, [segment]: DEFAULT_COLUMNS[segment] }));

  const startResizeColumn = (event: React.MouseEvent<HTMLSpanElement>, key: EcuadorTop500Header) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidthFor(key);
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const move = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const width = Math.max(90, Math.min(560, Math.round(startWidth + moveEvent.clientX - startX)));
      setColumnWidths((current) => ({ ...current, [key]: width }));
    };
    const stop = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', stop);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
    window.addEventListener('mousemove', move, { passive: false });
    window.addEventListener('mouseup', stop, { once: true });
  };
  const resetColumnWidth = (key: EcuadorTop500Header) => setColumnWidths((current) => { const next = { ...current }; delete next[key]; return next; });
  const columnStyle = (key: EcuadorTop500Header): React.CSSProperties => {
    const width = columnWidthFor(key);
    return { width, minWidth: width, maxWidth: width, '--customer-column-width': `${width}px` } as React.CSSProperties;
  };

  const syncFromTop = () => {
    if (topScrollRef.current && tableScrollRef.current) tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
  };
  const syncFromTable = () => {
    if (topScrollRef.current && tableScrollRef.current) topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
  };

  const saveView = () => {
    const name = window.prompt('保存当前客户表格视图名称');
    if (!name?.trim()) return;
    const view: SavedView = { id: `${Date.now()}`, name: name.trim(), segment, filters, sort, columns: currentColumns, columnWidths };
    setSavedViews((current) => [...current.filter((item) => item.name !== view.name), view]);
    setActiveSavedViewId(view.id);
  };
  const applyView = (id: string) => {
    const view = savedViews.find((item) => item.id === id); if (!view) return;
    setActiveSavedViewId(id);
    setSegment(view.segment);
    setFilters(normalizeFilters(view.filters));
    setSort(view.sort);
    setColumnWidths(view.columnWidths ?? {});
    setVisibleColumns((current) => ({ ...current, [view.segment]: view.columns.filter((header) => ECUADOR_TOP500_V46_HEADERS.includes(header)) }));
    setPage(1);
  };
  const deleteView = () => {
    const view = savedViews.find((item) => item.id === activeSavedViewId);
    if (!view) return;
    if (!window.confirm(`删除客户表格视图“${view.name}”？`)) return;
    setSavedViews((current) => current.filter((item) => item.id !== view.id));
    setActiveSavedViewId('');
  };

  return <div className="company-detail-pane customer-database-shell top500-company-table-shell" data-testid="top500-company-table" data-contract-fields="75">
    <div className="customer-segment-tabs" role="tablist" aria-label="客户公司分类">
      {([['ALL', '全部客户'], ['INDUSTRIAL', '工业用能客户'], ['CHANNEL', '渠道 / 经销商'], ['PROJECT', 'EPC / 项目型']] as Array<[SegmentView, string]>).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={segment === key} className={segment === key ? 'active' : ''} onClick={() => switchSegment(key)}>{label}<span>{segmentCounts[key]}</span></button>)}
    </div>

    <div className="customer-filter-bar top500-filter-bar">
      <label className="customer-search-field"><span>搜索客户资料</span><input aria-label="搜索客户公司" value={localSearch} onChange={(event) => { setLocalSearch(event.target.value); setPage(1); }} placeholder="公司、RUC、地址、联系人、用电、机会、证据…" /></label>
      <DynamicFilter label="国家/地区" value={filters.country} options={options.country} onChange={(value) => setFilter('country', value)} />
      <DynamicFilter label="行业大类" value={filters.industry} options={options.industry} onChange={(value) => setFilter('industry', value)} />
      <DynamicFilter label="开发进度" value={filters.stage} options={options.stage} onChange={(value) => setFilter('stage', value)} />
      <DynamicFilter label="销售负责人" value={filters.owner} options={options.owner} onChange={(value) => setFilter('owner', value)} />
      <DynamicFilter label="联系状态" value={filters.contactability} options={CONTACTABILITY_OPTIONS} onChange={(value) => setFilter('contactability', value)} />
      <DynamicFilter label="商机状态" value={filters.opportunity} options={OPPORTUNITY_OPTIONS} onChange={(value) => setFilter('opportunity', value)} />
    </div>

    <div className="customer-view-tools">
      <div><span>筛选结果 {sortedRows.length} / {segmentRows.length} 家 · 当前 {visibleStart}-{visibleEnd}{researchLoading ? ' · 正在同步研究字段' : ''}</span>{Object.values(filters).some(Boolean) && <button type="button" onClick={clearFilters}>清除筛选</button>}</div>
      <div>
        {isSuperAdmin && <>
          <button type="button" data-testid="company-select-filtered" onClick={toggleFilteredSelection} disabled={filteredBusinessIds.length === 0 || bulkDeleting}>{allFilteredSelected ? `取消当前筛选 (${filteredBusinessIds.length})` : `全选当前筛选结果 (${filteredBusinessIds.length})`}</button>
          {selectedIds.size > 0 && <button type="button" onClick={clearSelection} disabled={bulkDeleting}>取消选择</button>}
          <button type="button" className="danger-text-button" data-testid="company-bulk-delete" onClick={() => void deleteSelection()} disabled={selectedIds.size === 0 || bulkDeleting}>{bulkDeleting ? '批量删除中…' : `批量删除所选 (${selectedIds.size})`}</button>
        </>}
        {savedViews.length > 0 && <select aria-label="已保存客户表格视图" value={activeSavedViewId} onChange={(event) => { if (event.target.value) applyView(event.target.value); else setActiveSavedViewId(''); }}><option value="">客户表格视图…</option>{savedViews.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}</select>}
        <button type="button" onClick={saveView}>保存表格视图</button>
        <button type="button" onClick={deleteView} disabled={!activeSavedViewId}>删除视图</button>
        <button type="button" aria-expanded={columnPanelOpen} onClick={() => setColumnPanelOpen((value) => !value)}>列设置</button>
      </div>
    </div>

    {columnPanelOpen && <div className="customer-column-panel top500-column-panel" data-testid="top500-column-panel" data-column-count="75">
      <div className="column-panel-head"><div><strong>列设置</strong><span>选择需要显示的字段；可用箭头或拖拽表头调整顺序，拖动列边界可调整宽度。</span></div><button type="button" onClick={resetColumns}>恢复当前分类默认</button></div>
      {TOP500_V46_MODULES.map((module) => <section className="top500-column-module" key={module.title}><div className="top500-column-module-title"><strong>{module.title}</strong><span>{module.headers.length}项</span></div><div className="column-options">{module.headers.map((key) => { const visible = currentColumns.includes(key); const index = currentColumns.indexOf(key); return <div key={key} className={visible ? 'active' : ''} data-top500-column-option={key}><label><input type="checkbox" checked={visible} onChange={() => toggleColumn(key)} disabled={key === '公司名称'} />{key}</label><span><button type="button" aria-label={`左移${key}`} disabled={!visible || index <= 0} onClick={() => moveColumn(key, -1)}>←</button><button type="button" aria-label={`右移${key}`} disabled={!visible || index < 0 || index >= currentColumns.length - 1} onClick={() => moveColumn(key, 1)}>→</button></span></div>; })}</div></section>)}
    </div>}

    <div className="customer-table-top-scroll" ref={topScrollRef} onScroll={syncFromTop} aria-label="客户列表横向滚动条">
      <div style={{ width: tableWidth }} />
    </div>
    <div className="company-list-pane customer-table-scroll" ref={tableScrollRef} onScroll={syncFromTable}>
      <table className="customer-company-table top500-company-table" style={{ width: tableWidth, minWidth: tableWidth, tableLayout: 'fixed' }}>
        <colgroup>
          {isSuperAdmin && <col style={{ width: 44 }} />}
          {currentColumns.map((key) => <col key={key} style={{ width: columnWidthFor(key) }} />)}
          <col style={{ width: 86 }} />
        </colgroup>
        <thead><tr>{isSuperAdmin && <th style={{ width: 44, minWidth: 44 }}><input type="checkbox" aria-label="选择当前筛选结果" checked={allFilteredSelected} onChange={toggleFilteredSelection} disabled={filteredBusinessIds.length === 0 || bulkDeleting} /></th>}{currentColumns.map((key) => <th key={key} className="customer-resizable-column" style={columnStyle(key)} data-column-width={columnWidthFor(key)} data-user-width={columnWidths[key] ? 'true' : 'false'} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragColumn && dragColumn !== key) reorderColumns(dragColumn, key); setDragColumn(null); }}><button type="button" draggable onDragStart={() => setDragColumn(key)} onClick={() => sortBy(key)}>{key}<span>{sort.key === key ? sort.direction === 'asc' ? '↑' : '↓' : '↕'}</span></button><span className="customer-column-resizer" draggable={false} role="separator" aria-orientation="vertical" aria-label={`调整${key}列宽`} onMouseDown={(event) => startResizeColumn(event, key)} onDoubleClick={() => resetColumnWidth(key)} /></th>)}<th className="customer-actions-column">操作</th></tr></thead>
        <tbody>{pagedRows.map((row) => {
          const businessId = row.account.businessId ?? '';
          const secondaryName = row.values.RUC !== '待补充' ? row.values.RUC : row.values['商业名称'] !== '待补充' ? row.values['商业名称'] : '';
          return <tr key={businessId || row.account.displayName} className="company-list-row">{isSuperAdmin && <td style={{ width: 44, minWidth: 44 }}><input type="checkbox" aria-label={`选择${row.values['公司名称']}`} checked={Boolean(businessId && selectedIds.has(businessId))} disabled={!businessId || bulkDeleting} onChange={() => { if (businessId) toggleSelection(businessId); }} /></td>}{currentColumns.map((key) => <td key={key} style={columnStyle(key)} data-user-width={columnWidths[key] ? 'true' : 'false'} data-top500-cell={key}>{key === '公司名称' ? <div className="customer-name-cell"><div><strong>{row.values[key]}</strong>{secondaryName ? <small>{secondaryName}</small> : null}</div></div> : displayValue(key, row.values[key])}</td>)}<td className="customer-row-actions"><button type="button" onClick={() => onOpen(row.account)}>查看</button></td></tr>;
        })}</tbody>
      </table>
      {sortedRows.length === 0 && <div className="real-empty">没有符合当前筛选条件的客户公司。</div>}
    </div>

    {sortedRows.length > 0 && <div className="customer-pagination" data-testid="customer-pagination">
      <span>每页 {PAGE_SIZE} 家 · 显示 {visibleStart}-{visibleEnd} / 共 {sortedRows.length} 家</span>
      <div>
        <button type="button" aria-label="第一页" onClick={() => setPage(1)} disabled={page <= 1}>«</button>
        <button type="button" aria-label="上一页" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>上一页</button>
        <label>第 <input aria-label="跳转页码" type="number" min={1} max={totalPages} value={page} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) setPage(Math.max(1, Math.min(totalPages, Math.trunc(next)))); }} /> / {totalPages} 页</label>
        <button type="button" aria-label="下一页" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>下一页</button>
        <button type="button" aria-label="末页" onClick={() => setPage(totalPages)} disabled={page >= totalPages}>»</button>
      </div>
    </div>}
  </div>;
}

function DynamicFilter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label><span>{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value="">全部</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}
