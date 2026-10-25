import { safeOfficeBytes } from '../../lib/officeArchive';
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
 * upstream source: web/src/components/document-preview/doc-preview.tsx
 *
 * GBAP modification: accepts already-authorized canonical source Blob instead
 * of fetching a RAGFlow document URL; RAGFlow auth/request/UI dependencies are removed.
 */

import {
  DocxEditorViewer,
  packageToArrayBuffer,
  parseDocx,
  useDocxEditor,
  useDocxPageLayout,
} from '@extend-ai/react-docx';
import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  blob: Blob;
  filename: string;
};

const ZIP_HEADER_0 = 0x50;
const ZIP_HEADER_1 = 0x4b;
const DEFAULT_LINE_SPACING_TWIPS = 312;
const DEFAULT_LINE_SPACING_TAG = `<w:spacing w:line="${DEFAULT_LINE_SPACING_TWIPS}" w:lineRule="auto"/>`;
const DEFAULT_LINE_SPACING_PPR_DEFAULT = `<w:pPrDefault><w:pPr>${DEFAULT_LINE_SPACING_TAG}</w:pPr></w:pPrDefault>`;

async function isZipLikeBlob(blob: Blob) {
  const bytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  return bytes.length >= 2 && bytes[0] === ZIP_HEADER_0 && bytes[1] === ZIP_HEADER_1;
}

function ensureDefaultLineSpacing(stylesXml: string): string {
  const docDefaults = stylesXml.match(/<w:docDefaults\b[^>]*>[\s\S]*?<\/w:docDefaults>/i)?.[0];
  if (!docDefaults) {
    const selfClosing = stylesXml.match(/<w:docDefaults\b[^>]*\/>/i)?.[0];
    if (selfClosing) {
      return stylesXml.replace(selfClosing, `<w:docDefaults>${DEFAULT_LINE_SPACING_PPR_DEFAULT}</w:docDefaults>`);
    }
    const stylesOpen = stylesXml.match(/<w:styles\b[^>]*>/i)?.[0];
    return stylesOpen
      ? stylesXml.replace(stylesOpen, `${stylesOpen}<w:docDefaults>${DEFAULT_LINE_SPACING_PPR_DEFAULT}</w:docDefaults>`)
      : stylesXml;
  }

  const pprDefault = docDefaults.match(/<w:pPrDefault\b[^>]*>[\s\S]*?<\/w:pPrDefault>/i)?.[0];
  if (!pprDefault) {
    const open = docDefaults.match(/<w:docDefaults\b[^>]*>/i)?.[0];
    if (!open) return stylesXml;
    return stylesXml.replace(docDefaults, docDefaults.replace(open, `${open}${DEFAULT_LINE_SPACING_PPR_DEFAULT}`));
  }

  const spacingTag = pprDefault.match(/<w:spacing\b[^>]*?\/?>/i)?.[0];
  if (spacingTag) {
    if (/\bw:line\s*=/i.test(spacingTag)) return stylesXml;
    let tag = spacingTag.replace(/\s*\/?>$/, '');
    tag += ` w:line="${DEFAULT_LINE_SPACING_TWIPS}"`;
    if (!/\bw:lineRule\s*=/i.test(spacingTag)) tag += ' w:lineRule="auto"';
    return stylesXml.replace(docDefaults, docDefaults.replace(pprDefault, pprDefault.replace(spacingTag, `${tag}/>`)));
  }

  const pprTag = pprDefault.match(/<w:pPr\b[^>]*>/i)?.[0];
  if (pprTag) {
    const next = pprTag.endsWith('/>')
      ? pprDefault.replace(pprTag, `<w:pPr>${DEFAULT_LINE_SPACING_TAG}</w:pPr>`)
      : pprDefault.replace(pprTag, `${pprTag}${DEFAULT_LINE_SPACING_TAG}`);
    return stylesXml.replace(docDefaults, docDefaults.replace(pprDefault, next));
  }

  return stylesXml;
}

async function normalizeDocxLineSpacing(blob: Blob) {
  const verified = await safeOfficeBytes(blob);
  try {
    const pkg = await parseDocx(verified);
    const stylesPart = pkg.parts.get('word/styles.xml');
    if (!stylesPart) return blob;
    const patched = ensureDefaultLineSpacing(stylesPart.content);
    if (patched === stylesPart.content) return blob;
    stylesPart.content = patched;
    return new Blob([packageToArrayBuffer(pkg)], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  } catch {
    return blob;
  }
}

export function RagflowDocxPreview({ blob, filename }: Props) {
  const editor = useDocxEditor({ initialFileName: filename || 'document.docx' });
  const { importDocxFile, status, totalPages } = editor;
  const { layout } = useDocxPageLayout(editor);
  const [zoom, setZoom] = useState(100);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const load = useCallback(async () => {
    cancelled.current = false;
    setLoading(true);
    setError(null);
    try {
      if (!(await isZipLikeBlob(blob))) {
        setError('该文件不是有效的 DOCX 文件；旧版 .doc 暂不支持内嵌预览。');
        return;
      }
      const normalized = await normalizeDocxLineSpacing(blob);
      if (cancelled.current) return;
      const file = new File([normalized], filename || 'document.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      await importDocxFile(file);
    } catch {
      if (!cancelled.current) setError('DOCX 文件无法预览，请下载原件查看。');
    } finally {
      if (!cancelled.current) setLoading(false);
    }
  }, [blob, filename, importDocxFile]);

  useEffect(() => {
    void load();
    return () => { cancelled.current = true; };
  }, [load]);

  useEffect(() => {
    if (status === 'Only .docx files are supported') {
      setError('仅支持 DOCX 格式文件。');
      setLoading(false);
    }
  }, [status]);

  return (
    <div className="knowledge-office-preview knowledge-docx-preview">
      <div className="knowledge-preview-toolbar">
        <span>{loading ? '正在打开 DOCX…' : error ? 'DOCX 预览不可用' : `共 ${totalPages || '-'} 页`}</span>
        <div>
          <button type="button" aria-label="缩小 DOCX" onClick={() => setZoom((value) => Math.max(50, value - 25))} disabled={zoom <= 50 || loading || !!error}>−</button>
          <strong>{zoom}%</strong>
          <button type="button" aria-label="放大 DOCX" onClick={() => setZoom((value) => Math.min(200, value + 25))} disabled={zoom >= 200 || loading || !!error}>＋</button>
        </div>
      </div>
      {error && <div className="knowledge-preview-state error">{error}</div>}
      {loading && !error && <div className="knowledge-preview-state">正在打开 DOCX 文档…</div>}
      {!loading && !error && (
        <div className="knowledge-docx-canvas">
          <div style={{ zoom: zoom / 100, width: layout?.pageWidthPx ? `${layout.pageWidthPx}px` : undefined }}>
            <DocxEditorViewer
              editor={editor}
              mode="read-only"
              loadingState={<div className="knowledge-preview-state">正在显示页面…</div>}
              pageGapBackgroundColor="#f5f5f5"
            />
          </div>
        </div>
      )}
    </div>
  );
}
