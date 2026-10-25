import { csvCell } from '../lib/csvCell';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GbapSession } from '../hooks/useGbapSession';
import { parseCsvDocument, valueOf, type CsvRow } from '../lib/crmCsvImport';
import {
  COMPANY_IMPORT_FIELD_CATALOG,
  COMPANY_IMPORT_FIELD_BY_KEY,
  COMPANY_IMPORT_IDENTITY_KEYS,
  COMPANY_IMPORT_PROTECTED_KEYS,
  autoMapCompanyImportHeaders,
  companyImportFieldGroups,
  detectCompanyImportPreset,
  type CompanyImportPreset,
} from '../lib/crmCompanyImportCatalog';
import {
  createCompanyImportJob,
  getCompanyImportJob,
  listCompanyImportJobs,
  preflightCompanyImportJob,
  retryCompanyImportFailedRows,
  startCompanyImportJob,
  uploadCompanyImportRows,
  type CompanyImportJob,
  type CompanyImportMapping,
  type CompanyImportResultRow,
  type CompanyImportUploadRow,
} from '../lib/crmCompanyImportClient';
import './company-import-center.css';
import './company-import-detail.css';

type Props = {
  session: GbapSession;
  onDataChanged?: () => void;
};

type ParsedFile = {
  fileName: string;
  sourceDigest: string | null;
  headers: string[];
  rows: CsvRow[];
  preset: CompanyImportPreset | null;
};

type ResultFilter = 'ALL' | 'CREATE' | 'UPDATE' | 'CONFLICT' | 'FAILED';

const STEPS = ['上传文件', '字段映射', '匹配规则', '数据预检', '确认导入', '导入完成'] as const;
const HISTORY_PAGE_SIZE = 10;
const DETAIL_PAGE_SIZE = 50;
const PREVIEW_PAGE_SIZE = 50;

async function sha256Hex(file: File) {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    UPLOADING: '上传中',
    UPLOADED: '待预检',
    PREFLIGHT_READY: '预检通过',
    PREFLIGHT_BLOCKED: '预检阻断',
    RUNNING: '导入中',
    COMPLETED: '已完成',
    PARTIAL_FAILED: '部分失败',
  };
  return labels[status] ?? status;
}

function actionLabel(action: string | null) {
  const labels: Record<string, string> = {
    CREATE: '新增',
    UPDATE: '更新',
    SKIP: '无变化',
    CONFLICT: '冲突',
  };
  return action ? labels[action] ?? action : '待预检';
}

function formatTime(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}



function downloadCsv(fileName: string, headers: string[], rows: unknown[][]) {
  const text = '\uFEFF' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function mappedValue(row: CsvRow, mapping: CompanyImportMapping[], targetKey: string) {
  const source = mapping.find((item) => item.targetKey === targetKey)?.sourceHeader;
  return source ? valueOf(row, [source]).trim() : '';
}

function buildUploadRows(
  parsed: ParsedFile,
  mapping: CompanyImportMapping[],
  defaults: { country: string; registrationType: string },
): CompanyImportUploadRow[] {
  return parsed.rows.map((row, index) => {
    const displayName = mappedValue(row, mapping, COMPANY_IMPORT_IDENTITY_KEYS.displayName);
    const registrationCountry = mappedValue(row, mapping, COMPANY_IMPORT_IDENTITY_KEYS.country) || defaults.country;
    const registrationType = mappedValue(row, mapping, COMPANY_IMPORT_IDENTITY_KEYS.registrationType) || defaults.registrationType;
    const registrationId = mappedValue(row, mapping, COMPANY_IMPORT_IDENTITY_KEYS.registrationId);
    const fields: Record<string, string> = {};
    for (const item of mapping) {
      if (!item.targetKey || item.targetKey.startsWith('__')) continue;
      fields[item.targetKey] = valueOf(row, [item.sourceHeader]).trim();
    }
    if (parsed.preset?.id === 'gbap-ecuador-v46' && registrationId) fields.RUC = registrationId;
    return {
      rowNumber: index + 2,
      displayName,
      registrationCountry,
      registrationType,
      registrationId,
      fields,
    };
  });
}

function MetricCard({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: string }) {
  return (
    <div className={`company-import-metric company-import-metric-${tone}`}>
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}

export function CompanyImportCenter({ session, onDataChanged }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState(1);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<CompanyImportMapping[]>([]);
  const [defaultCountry, setDefaultCountry] = useState('');
  const [defaultRegistrationType, setDefaultRegistrationType] = useState('');
  const [updatePolicy, setUpdatePolicy] = useState<'OVERWRITE_MAPPED' | 'FILL_BLANK'>('OVERWRITE_MAPPED');
  const [importMode, setImportMode] = useState<'UPSERT' | 'CREATE_ONLY' | 'UPDATE_ONLY'>('UPSERT');
  const [job, setJob] = useState<CompanyImportJob | null>(null);
  const [previewRows, setPreviewRows] = useState<CompanyImportResultRow[]>([]);
  const [previewFilter, setPreviewFilter] = useState<ResultFilter>('ALL');
  const [busy, setBusy] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<CompanyImportJob[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyDetail, setHistoryDetail] = useState<CompanyImportJob | null>(null);
  const [historyDetailRows, setHistoryDetailRows] = useState<CompanyImportResultRow[]>([]);
  const [historyDetailTotal, setHistoryDetailTotal] = useState(0);
  const [historyDetailPage, setHistoryDetailPage] = useState(0);
  const [historyDetailBusy, setHistoryDetailBusy] = useState(false);

  const operatorName = session.identity?.username ?? '当前管理员';
  const currentBusinessFieldCount = COMPANY_IMPORT_FIELD_CATALOG.filter((field) => !field.identityOnly && !field.protected).length;
  const fieldGroups = useMemo(() => companyImportFieldGroups(), []);
  const mappedTargetKeys = useMemo(
    () => new Set(mapping.map((item) => item.targetKey).filter(Boolean)),
    [mapping],
  );
  const protectedMappedCount = useMemo(
    () => [...mappedTargetKeys].filter((key) => key && COMPANY_IMPORT_PROTECTED_KEYS.has(key)).length,
    [mappedTargetKeys],
  );
  const mappedBusinessCount = useMemo(
    () => [...mappedTargetKeys].filter((key) => key && !key.startsWith('__') && !COMPANY_IMPORT_PROTECTED_KEYS.has(key)).length,
    [mappedTargetKeys],
  );

  const loadHistory = useCallback(async () => {
    try {
      const result = await listCompanyImportJobs(HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE);
      setHistory(result.jobs);
      setHistoryTotal(result.total);
    } catch {
      // History should not prevent the active import wizard from working.
    }
  }, [historyPage]);

  const loadHistoryDetail = useCallback(async (jobId: string, page = 0) => {
    setHistoryDetailBusy(true);
    try {
      const result = await getCompanyImportJob(jobId, {
        limit: DETAIL_PAGE_SIZE,
        offset: page * DETAIL_PAGE_SIZE,
      });
      setHistoryDetail(result.job);
      setHistoryDetailRows(result.rows);
      setHistoryDetailTotal(result.total);
      setHistoryDetailPage(page);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取导入任务详情失败。');
    } finally {
      setHistoryDetailBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!job || job.status !== 'RUNNING') return;
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        try {
          const result = await getCompanyImportJob(job.id, { limit: PREVIEW_PAGE_SIZE });
          if (cancelled) return;
          setJob(result.job);
          setPreviewRows(result.rows);
          if (result.job.status === 'COMPLETED' || result.job.status === 'PARTIAL_FAILED') {
            setStep(6);
            setProgressText('');
            onDataChanged?.();
            void loadHistory();
            return;
          }
        } catch (cause) {
          if (!cancelled) setError(cause instanceof Error ? cause.message : '读取导入进度失败。');
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [job?.id, job?.status, loadHistory, onDataChanged]);

  function resetWizard() {
    setStep(1);
    setParsed(null);
    setMapping([]);
    setDefaultCountry('');
    setDefaultRegistrationType('');
    setUpdatePolicy('OVERWRITE_MAPPED');
    setImportMode('UPSERT');
    setJob(null);
    setPreviewRows([]);
    setPreviewFilter('ALL');
    setError(null);
    setProgressText('');
    if (inputRef.current) inputRef.current.value = '';
  }

  async function inspectFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      if (!/\.csv$/i.test(file.name)) {
        throw new Error('当前第一阶段先支持 CSV UTF-8。XLSX 将接到同一个导入中心，不会再增加第二套入口。');
      }
      const [text, sourceDigest] = await Promise.all([file.text(), sha256Hex(file)]);
      const document = parseCsvDocument(text);
      if (!document.headers.length || !document.rows.length) throw new Error('文件没有可导入的数据。');
      const preset = detectCompanyImportPreset(document.headers);
      const autoMapping = autoMapCompanyImportHeaders(document.headers);
      setParsed({
        fileName: file.name,
        sourceDigest,
        headers: document.headers,
        rows: document.rows,
        preset,
      });
      setMapping(autoMapping);
      setDefaultCountry(preset?.defaultCountry ?? '');
      setDefaultRegistrationType(preset?.defaultRegistrationType ?? '');
      setStep(2);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取导入文件失败。');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function updateMapping(sourceHeader: string, targetKey: string) {
    setMapping((current) => current.map((item) => (
      item.sourceHeader === sourceHeader ? { ...item, targetKey: targetKey || null } : item
    )));
  }

  const mappingReady = Boolean(
    parsed
      && mappedTargetKeys.has(COMPANY_IMPORT_IDENTITY_KEYS.displayName)
      && mappedTargetKeys.has(COMPANY_IMPORT_IDENTITY_KEYS.registrationId)
      && (mappedTargetKeys.has(COMPANY_IMPORT_IDENTITY_KEYS.country) || defaultCountry)
      && (mappedTargetKeys.has(COMPANY_IMPORT_IDENTITY_KEYS.registrationType) || defaultRegistrationType)
      && mappedBusinessCount > 0,
  );

  async function buildPreflight() {
    if (!parsed || !mappingReady || busy) return;
    setBusy(true);
    setError(null);
    setProgressText('正在创建导入任务…');
    try {
      const rows = buildUploadRows(parsed, mapping, {
        country: defaultCountry,
        registrationType: defaultRegistrationType,
      });
      const invalid = rows.find((row) => (
        !row.displayName || !row.registrationCountry || !row.registrationType || !row.registrationId
      ));
      if (invalid) throw new Error(`第 ${invalid.rowNumber} 行缺少公司名称、国家、注册号类型或企业注册号。`);

      let currentJob = await createCompanyImportJob({
        fileName: parsed.fileName,
        sourceDigest: parsed.sourceDigest,
        presetId: parsed.preset?.id ?? null,
        defaultCountry: defaultCountry || null,
        defaultRegistrationType: defaultRegistrationType || null,
        updatePolicy,
        importMode,
        rowCount: rows.length,
        mapping,
      });
      setJob(currentJob);

      for (let index = 0; index < rows.length; index += 200) {
        const chunk = rows.slice(index, index + 200);
        setProgressText(`正在上传数据 ${Math.min(index + chunk.length, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}…`);
        currentJob = await uploadCompanyImportRows(currentJob.id, chunk);
        setJob(currentJob);
      }

      setProgressText('正在服务器预检：匹配已有客户、检查冲突和重复身份…');
      currentJob = await preflightCompanyImportJob(currentJob.id);
      const details = await getCompanyImportJob(currentJob.id, { limit: PREVIEW_PAGE_SIZE });
      setJob(details.job);
      setPreviewRows(details.rows);
      setStep(4);
      void loadHistory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '客户公司导入预检失败。');
    } finally {
      setBusy(false);
      setProgressText('');
    }
  }

  async function startImport() {
    if (!job || job.status !== 'PREFLIGHT_READY' || busy) return;
    setBusy(true);
    setError(null);
    try {
      const started = await startCompanyImportJob(job.id);
      setJob(started);
      setStep(5);
      setProgressText('服务器正在后台导入。关闭当前页面也不会取消任务。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '启动客户公司导入失败。');
    } finally {
      setBusy(false);
    }
  }

  async function retryFailed() {
    if (!job || job.status !== 'PARTIAL_FAILED' || busy) return;
    setBusy(true);
    setError(null);
    try {
      const started = await retryCompanyImportFailedRows(job.id);
      setJob(started);
      setStep(5);
      setProgressText('正在仅重试失败行。已成功的数据不会重复写入。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '重试失败数据失败。');
    } finally {
      setBusy(false);
    }
  }

  async function downloadFailedRows(jobId: string, fileName: string) {
    setHistoryDetailBusy(true);
    setError(null);
    try {
      const allRows: CompanyImportResultRow[] = [];
      let offset = 0;
      while (true) {
        const result = await getCompanyImportJob(jobId, {
          limit: 200,
          offset,
          status: 'FAILED',
        });
        allRows.push(...result.rows);
        if (result.rows.length < 200) break;
        offset += result.rows.length;
      }
      if (allRows.length === 0) throw new Error('这个导入任务没有失败行。');
      downloadCsv(
        `${fileName.replace(/\.[^.]+$/, '')}_失败数据.csv`,
        ['原始行号', '公司名称', '国家', '注册号类型', '企业注册号', '计划动作', '失败原因', 'Provider警告'],
        allRows.map((row) => [
          row.rowNumber,
          row.displayName,
          row.registrationCountry,
          row.registrationType,
          row.registrationId,
          actionLabel(row.proposedAction),
          row.errorCode ?? row.reason ?? '',
          row.providerWarning ?? '',
        ]),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '下载失败数据失败。');
    } finally {
      setHistoryDetailBusy(false);
    }
  }

  const summary = job?.summary ?? {};
  const statusCounts = summary.statusCounts ?? {};
  const completedCount = Number(statusCounts.COMPLETE ?? 0);
  const failedCount = Number(statusCounts.FAILED ?? 0);
  const progress = job?.rowCount
    ? Math.min(100, Math.round(((completedCount + failedCount) / job.rowCount) * 100))
    : 0;
  const filteredRows = previewRows.filter((row) => {
    if (previewFilter === 'ALL') return true;
    if (previewFilter === 'FAILED') return row.status === 'FAILED';
    return row.proposedAction === previewFilter;
  });

  return (
    <div className="company-import-center" data-testid="company-import-center">
      <section className="company-import-hero">
        <div>
          <span className="company-import-path">客户与销售 / 客户公司导入</span>
          <h2>客户公司数据导入</h2>
          <p>一个入口处理所有国家和所有客户公司数据。字段模型可以持续新增、删减，导入器不绑定 TOP500，也不绑定固定字段数量。</p>
        </div>
        <div className="company-import-hero-actions">
          <span>操作人：{operatorName}</span>
          <button className="company-import-secondary" type="button" onClick={resetWizard}>新建导入</button>
        </div>
      </section>

      <section className="company-import-capabilities" aria-label="导入能力">
        <div><strong>字段可演进</strong><span>当前目录含 {currentBusinessFieldCount} 个可导入业务字段，后续可随业务模型增删</span></div>
        <div><strong>自动字段映射</strong><span>匹配常见中英文列名，可手工调整</span></div>
        <div><strong>精确数据预检</strong><span>新增、更新、冲突、错误先看清再执行</span></div>
        <div><strong>销售数据保护</strong><span>受保护字段永不被研究 CSV 覆盖</span></div>
        <div><strong>大批量任务</strong><span>最高 50,000 行，分块上传、后台执行、失败可重试</span></div>
      </section>

      <section className="company-import-stepper" aria-label="导入步骤">
        {STEPS.map((label, index) => {
          const number = index + 1;
          const active = step === number;
          const done = step > number;
          return (
            <div className={`company-import-step ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`} key={label}>
              <span>{done ? '✓' : number}</span>
              <strong>{label}</strong>
            </div>
          );
        })}
      </section>

      {error ? <div className="company-import-alert company-import-alert-error">{error}</div> : null}
      {progressText ? <div className="company-import-alert company-import-alert-info">{progressText}</div> : null}

      {step === 1 ? (
        <section className="company-import-panel company-import-upload-panel">
          <div className="company-import-panel-head">
            <div>
              <h3>上传客户公司文件</h3>
              <p>当前先接通 CSV UTF-8；XLSX 后续接到同一个 Import Job，不会再增加第二套导入入口。</p>
            </div>
          </div>
          <button className="company-import-dropzone" type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
            <strong>{busy ? '正在读取文件…' : '选择 CSV 文件'}</strong>
            <span>支持当前 Ecuador v46，也支持列名和字段数量不同的新客户公司 CSV</span>
          </button>
          <input
            ref={inputRef}
            hidden
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void inspectFile(file);
            }}
          />
        </section>
      ) : null}

      {step === 2 && parsed ? (
        <section className="company-import-panel">
          <div className="company-import-panel-head">
            <div>
              <h3>字段映射</h3>
              <p>
                {parsed.fileName} · {parsed.rows.length.toLocaleString()} 行 · {parsed.headers.length} 列
                {parsed.preset ? ` · 已识别模板：${parsed.preset.label}` : ''}
              </p>
            </div>
            <span className="company-import-count">已映射 {mappedTargetKeys.size} / {parsed.headers.length}</span>
          </div>
          <div className="company-import-mapping-table">
            <div className="company-import-mapping-header">
              <span>文件列</span><span>GBAP 客户字段</span><span>规则</span>
            </div>
            {mapping.map((item) => {
              const field = item.targetKey ? COMPANY_IMPORT_FIELD_BY_KEY.get(item.targetKey) : null;
              return (
                <div className="company-import-mapping-row" key={item.sourceHeader}>
                  <strong>{item.sourceHeader}</strong>
                  <select value={item.targetKey ?? ''} onChange={(event) => updateMapping(item.sourceHeader, event.target.value)}>
                    <option value="">不导入此列</option>
                    {fieldGroups.map((group) => (
                      <optgroup label={group.label} key={group.label}>
                        {group.fields.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}{option.protected ? '（受保护）' : ''}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <span className={field?.protected ? 'is-protected' : ''}>
                    {field?.protected ? '受保护，不覆盖' : field?.identityOnly ? '企业身份匹配' : field ? field.group : '忽略'}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="company-import-footer-actions">
            <button className="company-import-secondary" type="button" onClick={() => setStep(1)}>上一步</button>
            <button
              className="company-import-primary"
              type="button"
              disabled={!mappedTargetKeys.has(COMPANY_IMPORT_IDENTITY_KEYS.displayName) || !mappedTargetKeys.has(COMPANY_IMPORT_IDENTITY_KEYS.registrationId)}
              onClick={() => setStep(3)}
            >
              下一步：匹配规则
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 && parsed ? (
        <section className="company-import-panel">
          <div className="company-import-panel-head">
            <div>
              <h3>匹配与更新规则</h3>
              <p>企业身份与覆盖策略在执行前固定下来。当前文件映射 {mappedBusinessCount} 个可写业务字段，{protectedMappedCount} 个销售字段受保护。</p>
            </div>
          </div>
          <div className="company-import-rule-grid">
            <label>
              <span>默认国家/地区代码</span>
              <input value={defaultCountry} onChange={(event) => setDefaultCountry(event.target.value.toUpperCase())} placeholder="EC / PH / TZ / SA" maxLength={2} disabled={mappedTargetKeys.has(COMPANY_IMPORT_IDENTITY_KEYS.country)} />
              <small>文件已有国家列时不使用默认值。</small>
            </label>
            <label>
              <span>默认企业注册号类型</span>
              <input value={defaultRegistrationType} onChange={(event) => setDefaultRegistrationType(event.target.value.toUpperCase())} placeholder="RUC / TIN / CRN" disabled={mappedTargetKeys.has(COMPANY_IMPORT_IDENTITY_KEYS.registrationType)} />
              <small>不同国家可以映射文件中的注册号类型列。</small>
            </label>
            <label>
              <span>导入模式</span>
              <select value={importMode} onChange={(event) => setImportMode(event.target.value as typeof importMode)}>
                <option value="UPSERT">新增 + 更新</option>
                <option value="CREATE_ONLY">仅新增</option>
                <option value="UPDATE_ONLY">仅更新</option>
              </select>
              <small>默认使用企业注册身份匹配已有客户。</small>
            </label>
            <label>
              <span>已映射字段更新策略</span>
              <select value={updatePolicy} onChange={(event) => setUpdatePolicy(event.target.value as typeof updatePolicy)}>
                <option value="OVERWRITE_MAPPED">本次 CSV 非保护字段为准</option>
                <option value="FILL_BLANK">只补系统空白字段</option>
              </select>
              <small>未映射字段不会被清除；受保护销售字段永不覆盖。</small>
            </label>
          </div>
          <div className="company-import-safety-note">
            <strong>匹配优先级</strong>
            <span>国家 + 注册号类型 + 企业注册号 → 历史唯一精确公司名安全认领。任何歧义都进入“冲突”，不会猜测、不会创建重复客户。</span>
          </div>
          <div className="company-import-footer-actions">
            <button className="company-import-secondary" type="button" onClick={() => setStep(2)}>上一步</button>
            <button className="company-import-primary" type="button" disabled={!mappingReady || busy} onClick={() => void buildPreflight()}>
              {busy ? '正在生成预检…' : `生成数据预检（${parsed.rows.length.toLocaleString()} 行）`}
            </button>
          </div>
        </section>
      ) : null}

      {step === 4 && job ? (
        <section className="company-import-panel">
          <div className="company-import-panel-head">
            <div><h3>数据预检结果</h3><p>预检不会写入客户数据。先确认新增、更新、冲突和错误，再进入真正导入。</p></div>
            <span className={`company-import-status company-import-status-${job.status.toLowerCase()}`}>{statusLabel(job.status)}</span>
          </div>
          <div className="company-import-metrics">
            <MetricCard label="总计" value={job.rowCount} />
            <MetricCard label="新增" value={Number(summary.create ?? 0)} tone="success" />
            <MetricCard label="更新" value={Number(summary.update ?? 0)} tone="primary" />
            <MetricCard label="无变化/跳过" value={Number(summary.unchanged ?? 0)} />
            <MetricCard label="冲突" value={Number(summary.conflict ?? 0)} tone="warning" />
          </div>
          <div className="company-import-filterbar">
            {(['ALL', 'CREATE', 'UPDATE', 'CONFLICT'] as ResultFilter[]).map((filter) => (
              <button type="button" key={filter} className={previewFilter === filter ? 'is-active' : ''} onClick={() => setPreviewFilter(filter)}>
                {filter === 'ALL' ? '全部' : actionLabel(filter)}
              </button>
            ))}
          </div>
          <div className="company-import-preview-table">
            <table>
              <thead><tr><th>#</th><th>状态</th><th>公司名称</th><th>企业注册号</th><th>国家</th><th>原因</th></tr></thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td><span className={`company-import-action action-${String(row.proposedAction ?? '').toLowerCase()}`}>{actionLabel(row.proposedAction)}</span></td>
                    <td>{row.displayName}</td><td>{row.registrationId}</td><td>{row.registrationCountry}</td><td>{row.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {job.status === 'PREFLIGHT_BLOCKED' ? (
            <div className="company-import-alert company-import-alert-error">
              预检已阻断。本批存在身份冲突或历史客户无法 100% 安全匹配，系统不会创建可能重复的公司。
            </div>
          ) : null}
          <div className="company-import-footer-actions">
            <button className="company-import-secondary" type="button" onClick={resetWizard}>取消本次导入</button>
            <button className="company-import-primary" type="button" disabled={job.status !== 'PREFLIGHT_READY'} onClick={() => setStep(5)}>下一步：确认导入</button>
          </div>
        </section>
      ) : null}

      {step === 5 && job ? (
        <section className="company-import-panel company-import-confirm-panel">
          <div>
            <h3>{job.status === 'RUNNING' ? '正在后台导入' : '确认开始导入'}</h3>
            <p>文件：{job.fileName} · {job.rowCount.toLocaleString()} 行 · {job.mappedFieldCount} 个非保护映射字段</p>
          </div>
          {job.status === 'RUNNING' ? (
            <>
              <div className="company-import-progress"><span style={{ width: `${progress}%` }} /></div>
              <strong>{progress}% · 已完成 {completedCount.toLocaleString()} · 失败 {failedCount.toLocaleString()}</strong>
              <p>任务由服务器继续执行；关闭页面不会取消导入。</p>
            </>
          ) : (
            <>
              <div className="company-import-confirm-summary">
                <span>将新增 <strong>{Number(summary.create ?? 0).toLocaleString()}</strong> 家</span>
                <span>将更新 <strong>{Number(summary.update ?? 0).toLocaleString()}</strong> 家</span>
                <span>{job.protectedFieldCount} 个受保护销售字段不会被覆盖</span>
              </div>
              <button className="company-import-start-button" type="button" disabled={busy} onClick={() => void startImport()}>
                {busy ? '正在启动…' : `开始导入 ${job.rowCount.toLocaleString()} 条客户公司数据`}
              </button>
            </>
          )}
        </section>
      ) : null}

      {step === 6 && job ? (
        <section className="company-import-panel company-import-result-panel">
          <div className="company-import-result-mark">{job.status === 'COMPLETED' ? '✓' : '!'}</div>
          <div>
            <h3>{job.status === 'COMPLETED' ? '客户公司导入完成' : '客户公司导入完成，但存在失败行'}</h3>
            <p>{job.fileName} · 完成 {completedCount.toLocaleString()} / {job.rowCount.toLocaleString()} · 失败 {failedCount.toLocaleString()}</p>
          </div>
          <div className="company-import-result-actions">
            <button className="company-import-secondary" type="button" onClick={resetWizard}>新建导入</button>
            {job.status === 'PARTIAL_FAILED' ? (
              <button className="company-import-primary" type="button" onClick={() => void retryFailed()} disabled={busy}>仅重试失败数据</button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="company-import-panel company-import-history" data-testid="company-import-history">
        <div className="company-import-panel-head">
          <div>
            <h3>客户公司导入记录</h3>
            <p>只显示真实持久化 Import Job。每次上传、预检、执行和失败重试都属于同一个任务，不再拼造 TOP500 历史。</p>
          </div>
          <button className="company-import-link" type="button" onClick={() => void loadHistory()}>刷新记录</button>
        </div>
        <div className="company-import-history-table">
          <table>
            <thead><tr><th>导入时间</th><th>文件名</th><th>总数</th><th>新增</th><th>更新</th><th>失败</th><th>状态</th><th>操作人</th><th>操作</th></tr></thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>{formatTime(item.createdAt)}</td>
                  <td>{item.fileName}</td>
                  <td>{item.rowCount.toLocaleString()}</td>
                  <td>{Number(item.summary.actionCounts?.CREATE ?? item.summary.create ?? 0).toLocaleString()}</td>
                  <td>{Number(item.summary.actionCounts?.UPDATE ?? item.summary.update ?? 0).toLocaleString()}</td>
                  <td>{Number(item.summary.statusCounts?.FAILED ?? 0).toLocaleString()}</td>
                  <td><span className={`company-import-status company-import-status-${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span></td>
                  <td>{item.actorUsername ?? '—'}</td>
                  <td><button className="company-import-link" type="button" onClick={() => void loadHistoryDetail(item.id, 0)}>查看</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="company-import-pagination">
          <span>共 {historyTotal.toLocaleString()} 条真实导入记录</span>
          <div>
            <button type="button" disabled={historyPage === 0} onClick={() => setHistoryPage((value) => Math.max(0, value - 1))}>上一页</button>
            <span>第 {historyPage + 1} 页</span>
            <button type="button" disabled={(historyPage + 1) * HISTORY_PAGE_SIZE >= historyTotal} onClick={() => setHistoryPage((value) => value + 1)}>下一页</button>
          </div>
        </div>
      </section>

      {historyDetail ? (
        <section className="company-import-panel company-import-history-detail" data-testid="company-import-history-detail">
          <div className="company-import-panel-head">
            <div>
              <h3>导入任务详情</h3>
              <p>{historyDetail.fileName} · 任务 {historyDetail.id.slice(0, 8)} · {historyDetail.rowCount.toLocaleString()} 行 · {statusLabel(historyDetail.status)}</p>
            </div>
            <div className="company-import-detail-actions">
              {Number(historyDetail.summary.statusCounts?.FAILED ?? 0) > 0 ? (
                <button className="company-import-secondary" type="button" disabled={historyDetailBusy} onClick={() => void downloadFailedRows(historyDetail.id, historyDetail.fileName)}>下载失败数据</button>
              ) : null}
              <button className="company-import-link" type="button" onClick={() => setHistoryDetail(null)}>关闭</button>
            </div>
          </div>
          <div className="company-import-detail-summary">
            <span>创建：{formatTime(historyDetail.createdAt)}</span>
            <span>开始：{formatTime(historyDetail.startedAt)}</span>
            <span>完成：{formatTime(historyDetail.completedAt)}</span>
            <span>更新策略：{historyDetail.updatePolicy === 'OVERWRITE_MAPPED' ? '本次映射值为准' : '只补空白'}</span>
            <span>字段：{historyDetail.mappedFieldCount} 个可写 / {historyDetail.protectedFieldCount} 个受保护</span>
          </div>
          <div className="company-import-preview-table">
            <table>
              <thead><tr><th>#</th><th>状态</th><th>公司名称</th><th>国家</th><th>注册号</th><th>计划动作</th><th>结果/错误</th></tr></thead>
              <tbody>
                {historyDetailRows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td>{row.status}</td>
                    <td>{row.displayName}</td>
                    <td>{row.registrationCountry}</td>
                    <td>{row.registrationId}</td>
                    <td>{actionLabel(row.proposedAction)}</td>
                    <td>{row.errorCode ?? row.providerWarning ?? row.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="company-import-pagination">
            <span>显示 {historyDetailPage * DETAIL_PAGE_SIZE + 1}–{Math.min((historyDetailPage + 1) * DETAIL_PAGE_SIZE, historyDetailTotal)} / {historyDetailTotal.toLocaleString()}</span>
            <div>
              <button type="button" disabled={historyDetailBusy || historyDetailPage === 0} onClick={() => void loadHistoryDetail(historyDetail.id, Math.max(0, historyDetailPage - 1))}>上一页</button>
              <span>第 {historyDetailPage + 1} 页</span>
              <button type="button" disabled={historyDetailBusy || (historyDetailPage + 1) * DETAIL_PAGE_SIZE >= historyDetailTotal} onClick={() => void loadHistoryDetail(historyDetail.id, historyDetailPage + 1)}>下一页</button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
