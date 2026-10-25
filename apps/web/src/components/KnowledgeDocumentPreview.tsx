import { useEffect, useMemo, useState } from 'react';
import { downloadKnowledgeSource, type KnowledgeDocument } from '../lib/knowledgeClient';
import { RagflowDocxPreview } from './knowledge-preview/RagflowDocxPreview';
import { RagflowExcelPreview } from './knowledge-preview/RagflowExcelPreview';
import { RagflowMarkdownPreview } from './knowledge-preview/RagflowMarkdownPreview';
import { RagflowPdfPreview } from './knowledge-preview/RagflowPdfPreview';
import { RagflowPptxPreview } from './knowledge-preview/RagflowPptxPreview';

type Props = {
  document: KnowledgeDocument;
};

type PreviewState =
  | { kind: 'loading' }
  | { kind: 'blob'; blob: Blob }
  | { kind: 'text'; text: string }
  | { kind: 'markdown'; text: string }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'error'; message: string };

const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'json', 'log']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']);
const TEXT_PREVIEW_LIMIT = 2 * 1024 * 1024;

function extension(document: KnowledgeDocument) {
  return (document.sourceFilename?.split('.').pop() ?? '').toLowerCase();
}

function ImageBlobPreview({ blob, title }: { blob: Blob; title: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  if (!url) return <div className="knowledge-preview-state">正在加载图片…</div>;
  return <div className="knowledge-image-preview"><img src={url} alt={title} /></div>;
}

export function KnowledgeDocumentPreview({ document }: Props) {
  const ext = useMemo(() => extension(document), [document.sourceFilename]);
  const [state, setState] = useState<PreviewState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setState({ kind: 'loading' });

      if (['doc', 'xls', 'ppt'].includes(ext)) {
        setState({ kind: 'unsupported', reason: '旧版二进制 Office 格式暂不支持内嵌预览，请下载原件或转换为 DOCX / XLSX / PPTX。' });
        return;
      }
      if (['epub', 'mp4', 'mov', 'mkv'].includes(ext)) {
        setState({ kind: 'unsupported', reason: '当前文件类型暂不支持内嵌预览，可以下载原件查看。' });
        return;
      }

      try {
        const blob = await downloadKnowledgeSource(document.id);
        if (cancelled) return;

        if (ext === 'md' || blob.type === 'text/markdown') {
          const previewBlob = blob.size > TEXT_PREVIEW_LIMIT ? blob.slice(0, TEXT_PREVIEW_LIMIT) : blob;
          const text = await previewBlob.text();
          if (!cancelled) {
            setState({
              kind: 'markdown',
              text: blob.size > TEXT_PREVIEW_LIMIT
                ? `${text}\n\n> 预览已截断，仅展示前 2 MB；完整内容请下载原件。`
                : text,
            });
          }
          return;
        }

        if (TEXT_EXTENSIONS.has(ext) || blob.type.startsWith('text/')) {
          const previewBlob = blob.size > TEXT_PREVIEW_LIMIT ? blob.slice(0, TEXT_PREVIEW_LIMIT) : blob;
          const text = await previewBlob.text();
          if (!cancelled) {
            setState({
              kind: 'text',
              text: blob.size > TEXT_PREVIEW_LIMIT
                ? `${text}\n\n—— 预览已截断，仅展示前 2 MB；完整内容请下载原件。——`
                : text,
            });
          }
          return;
        }

        setState({ kind: 'blob', blob });
      } catch {
        if (!cancelled) setState({ kind: 'error', message: '原始文件预览加载失败。' });
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [document.id, document.currentVersionId, ext]);

  if (state.kind === 'loading') {
    return <div className="knowledge-preview-state">正在加载原始文件…</div>;
  }

  if (state.kind === 'error') {
    return <div className="knowledge-preview-state error">{state.message}</div>;
  }

  if (state.kind === 'unsupported') {
    return (
      <div className="knowledge-preview-state">
        <strong>当前格式暂不提供内嵌预览</strong>
        <span>{state.reason}</span>
      </div>
    );
  }

  if (state.kind === 'text') {
    return <pre className="knowledge-text-preview">{state.text}</pre>;
  }

  if (state.kind === 'markdown') {
    return <RagflowMarkdownPreview text={state.text} />;
  }

  const blob = state.blob;
  if (ext === 'pdf' || blob.type === 'application/pdf') {
    return <RagflowPdfPreview blob={blob} />;
  }
  if (ext === 'docx') {
    return <RagflowDocxPreview blob={blob} filename={document.sourceFilename || 'document.docx'} />;
  }
  if (ext === 'xlsx') {
    return <RagflowExcelPreview blob={blob} />;
  }
  if (ext === 'pptx') {
    return <RagflowPptxPreview blob={blob} />;
  }
  if (IMAGE_EXTENSIONS.has(ext) || blob.type.startsWith('image/')) {
    return <ImageBlobPreview blob={blob} title={document.title} />;
  }

  return (
    <div className="knowledge-preview-state">
      <strong>当前格式暂不提供内嵌预览</strong>
      <span>原件已安全保存，可以下载查看。</span>
    </div>
  );
}
