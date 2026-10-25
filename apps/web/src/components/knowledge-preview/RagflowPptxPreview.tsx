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
 * upstream source: web/src/components/document-preview/ppt-preview.tsx
 *
 * GBAP modification: accepts canonical source Blob and removes RAGFlow request/auth/UI wrappers.
 */
import { init } from 'pptx-preview';
import { useEffect, useRef, useState } from 'react';

type Props = { blob: Blob };

export function RagflowPptxPreview({ blob }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    const render = async () => {
      const container = containerRef.current;
      if (!container) return;
      container.replaceChildren();
      try {
        const arrayBuffer = await safeOfficeBytes(blob);
        if (cancelled || !containerRef.current) return;
        const width = Math.max(320, containerRef.current.clientWidth - 24);
        const height = Math.max(420, containerRef.current.clientHeight - 24);
        const previewer = init(containerRef.current, { width, height });
        await previewer.preview(arrayBuffer);
      } catch {
        if (!cancelled) setError('PPTX 文件无法预览，请下载原件查看。');
      }
    };

    void render();

    if (typeof ResizeObserver === 'undefined' || !containerRef.current) {
      return () => { cancelled = true; };
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void render(), 180);
    });
    observer.observe(containerRef.current);

    return () => {
      cancelled = true;
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [blob]);

  if (error) return <div className="knowledge-preview-state error">{error}</div>;
  return <div ref={containerRef} className="knowledge-office-preview knowledge-pptx-preview" aria-label="PPTX 文档预览" />;
}
