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
 * upstream source: web/src/components/document-preview/pdf-preview.tsx
 *
 * GBAP modification: accepts canonical source Blob/object URL and removes
 * provider auth, RAGFlow request helpers and editable highlight actions.
 */
import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, TextLayer, type PDFDocumentProxy } from 'pdfjs-dist';
import './pdf-text-layer.css';

GlobalWorkerOptions.workerSrc = '/pdfjs-dist/pdf.worker.min.mjs';

/** Bounded read-only PDF renderer. No PDF JavaScript or annotation actions run. */
export function RagflowPdfPreview({ blob }: { blob: Blob }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const url = URL.createObjectURL(blob);
    const task = getDocument({
      url, enableXfa: false, maxImageSize: 16_000_000,
      cMapUrl: '/pdfjs-dist/cmaps/', cMapPacked: true,
      standardFontDataUrl: '/pdfjs-dist/standard_fonts/', wasmUrl: '/pdfjs-dist/wasm/',
    });
    setDocument(null); setPageNumber(1); setError(''); setLoading(true);
    task.promise.then((loaded) => { if (active) setDocument(loaded); }).catch(() => {
      if (active) { setError('PDF 文件无法预览，请下载原件查看。'); setLoading(false); }
    });
    return () => { active = false; void task.destroy(); URL.revokeObjectURL(url); };
  }, [blob]);

  useEffect(() => {
    if (!document || !canvas.current || !text.current || !frame.current) return;
    let active = true;
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    let textLayer: TextLayer | undefined;
    const canvasElement = canvas.current;
    const textElement = text.current;
    const width = Math.max(240, frame.current.clientWidth - 24);
    setLoading(true); setError(''); textElement.replaceChildren();
    void (async () => {
      const page = await document.getPage(pageNumber);
      if (!active) return;
      const base = page.getViewport({ scale: 1 });
      // Bound both backing pixels and logical viewport for large/malicious pages.
      const scale = Math.min(width / base.width * zoom, 2400 / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8_000_000 / (viewport.width * viewport.height)));
      canvasElement.width = Math.ceil(viewport.width * ratio);
      canvasElement.height = Math.ceil(viewport.height * ratio);
      canvasElement.style.width = `${viewport.width}px`;
      canvasElement.style.height = `${viewport.height}px`;
      textElement.style.width = `${viewport.width}px`;
      textElement.style.height = `${viewport.height}px`;
      textElement.style.setProperty('--total-scale-factor', String(scale));
      renderTask = page.render({ canvas: canvasElement, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      await renderTask.promise;
      if (!active) return;
      textLayer = new TextLayer({ textContentSource: await page.getTextContent(), container: textElement, viewport });
      await textLayer.render();
      if (active) setLoading(false);
    })().catch((reason: unknown) => {
      if (active && (reason as Error)?.name !== 'RenderingCancelledException') {
        setError('此页无法预览，请下载原件查看。'); setLoading(false);
      }
    });
    return () => { active = false; renderTask?.cancel(); textLayer?.cancel(); };
  }, [document, pageNumber, zoom]);

  return <div className="knowledge-office-preview knowledge-pdf-highlighter">
    <div className="knowledge-pdf-toolbar" aria-label="PDF 阅读工具">
      <button type="button" disabled={!document || pageNumber <= 1 || loading} onClick={() => setPageNumber((value) => value - 1)}>上一页</button>
      <span aria-live="polite">{document ? `${pageNumber} / ${document.numPages} 页` : '正在加载 PDF…'}</span>
      <button type="button" disabled={!document || pageNumber >= document.numPages || loading} onClick={() => setPageNumber((value) => value + 1)}>下一页</button>
      <label>缩放 <select aria-label="PDF 缩放" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
        <option value={0.75}>75%</option><option value={1}>适合宽度</option><option value={1.5}>150%</option><option value={2}>200%</option>
      </select></label>
    </div>
    {error && <div role="alert" className="knowledge-preview-state error">{error}</div>}
    {!error && <div className="PdfHighlighter knowledge-pdf-pages" ref={frame} aria-busy={loading}>
      {loading && <div className="knowledge-preview-state" role="status">正在渲染 PDF…</div>}
      <div className="knowledge-pdf-page"><canvas ref={canvas} aria-label={`PDF 第 ${pageNumber} 页`} /><div ref={text} className="textLayer" /></div>
    </div>}
  </div>;
}
