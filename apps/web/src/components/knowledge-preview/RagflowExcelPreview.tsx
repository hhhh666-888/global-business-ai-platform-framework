import { safeOfficeBytes } from '../../lib/officeArchive';
import { randomUuidV4 } from '../../lib/randomUuid';
/*
 *  Copyright 2026 The InfiniFlow Authors. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * Adapted for GBAP GBAP from RAGFlow v0.27.2
 * upstream commit: a024bea0cd93f39e6652a42bf84dd20c55bc560b
 * upstream source: web/src/components/document-preview/hooks.ts + excel-preview.tsx
 *
 * GBAP modification: accepts canonical source Blob and uses native ResizeObserver.
 */

import JSZip from 'jszip';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

type Props = { blob: Blob };

async function stripWpsDispImg(data: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(data);
  const worksheetPaths = Object.keys(zip.files).filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path));
  let modified = false;
  for (const path of worksheetPaths) {
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async('string');
    if (!xml.includes('DISPIMG')) continue;
    modified = true;
    let cleaned = xml.replace(/<f\b[^>]*>[\s\S]*?DISPIMG[\s\S]*?<\/f>/g, '');
    cleaned = cleaned.replace(/<v>[^<]*DISPIMG[^<]*<\/v>/g, '<v>[图片]</v>');
    zip.file(path, cleaned);
  }
  return modified ? zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' }) : data;
}

async function normalizeXlsxForExcelJS(data: ArrayBuffer): Promise<ArrayBuffer> {
  try {
    const zip = await JSZip.loadAsync(data);
    const workbookFile = zip.file('xl/workbook.xml');
    if (!workbookFile) return data;
    const xml = await workbookFile.async('string');
    if (!/<\w+:workbook[\s>]/.test(xml)) return data;
    // Normalize element prefixes without parsing untrusted workbooks through the
    // obsolete SheetJS 0.18 runtime. Preserve cell contents and relationships.
    for (const path of Object.keys(zip.files).filter(path => path.endsWith('.xml'))) {
      const xmlFile = zip.file(path);
      if (!xmlFile) continue;
      const content = await xmlFile.async('string');
      zip.file(path, content.replace(/(<\/?)[A-Za-z_][\w.-]*:([A-Za-z_][\w.-]*)(?=[\s/>])/g, '$1$2'));
    }
    return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  } catch {
    return data;
  }
}

async function sanitizeSheetNames(data: ArrayBuffer): Promise<ArrayBuffer> {
  try {
    const zip = await JSZip.loadAsync(data);
    const workbookFile = zip.file('xl/workbook.xml');
    if (!workbookFile) return data;
    const xml = await workbookFile.async('string');
    const cleaned = xml.replace(
      /(<sheet\b[^>]*\bname=")([^"]*)(")/g,
      (_match, prefix: string, name: string, suffix: string) => prefix + name.replace(/[:\\/?*[\]]/g, '_') + suffix,
    );
    if (cleaned === xml) return data;
    zip.file('xl/workbook.xml', cleaned);
    return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  } catch {
    return data;
  }
}

async function prepareWorkbook(blob: Blob) {
  let data = await safeOfficeBytes(blob);
  data = await normalizeXlsxForExcelJS(data);
  data = await stripWpsDispImg(data);
  data = await sanitizeSheetNames(data);
  return data;
}

export function RagflowExcelPreview({ blob }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const source = useMemo(() => `/preview/excel.html?reader=${randomUuidV4()}`, [blob]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useLayoutEffect(() => {
    let active = true;
    let ready = false;
    let sent = false;
    let data: ArrayBuffer | null = null;
    setError(null); setLoading(true);
    const timeout = setTimeout(() => { if (active) { setLoading(false); setError('XLSX 预览服务暂时无法响应，请下载原件查看。'); } }, 45_000);
    const send = () => {
      if (!active || !ready || sent || !data || !frameRef.current?.contentWindow) return;
      sent = true;
      frameRef.current.contentWindow.postMessage({ type: 'GBAP_EXCEL_RENDER', data }, window.location.origin, [data]);
    };
    const receive = (event: MessageEvent) => {
      if (!active || event.source !== frameRef.current?.contentWindow || event.origin !== window.location.origin) return;
      if (event.data?.type === 'GBAP_EXCEL_READY') { ready = true; send(); }
      if (event.data?.type === 'GBAP_EXCEL_RENDERED') { clearTimeout(timeout); setLoading(false); }
      if (event.data?.type === 'GBAP_EXCEL_FAILED') { clearTimeout(timeout); setLoading(false); setError('XLSX 文件无法预览，请下载原件查看。'); }
      if (event.data?.type === 'GBAP_EXCEL_ESCAPE') frameRef.current?.closest('dialog')?.dispatchEvent(new Event('cancel', { cancelable: true }));
    };
    window.addEventListener('message', receive);
    void prepareWorkbook(blob).then((bytes) => { if (active) { data = bytes; send(); } }).catch(() => {
      if (active) { clearTimeout(timeout); setLoading(false); setError('XLSX 文件无法预览，请下载原件查看。'); }
    });
    return () => { active = false; clearTimeout(timeout); window.removeEventListener('message', receive); };
  }, [blob, source]);
  if (error) return <div role="alert" className="knowledge-preview-state error">{error}</div>;
  return <iframe ref={frameRef} src={source} title="XLSX 文档预览" aria-busy={loading} className="knowledge-office-preview knowledge-excel-preview" style={{ width: '100%', border: 0, display: 'block' }} />;
}
