import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getCrmFileContent, type CrmFile } from '../lib/gbapClient';
import { CrmFileDownloadButton } from './CrmFileDownloadButton';
import { RagflowDocxPreview } from './knowledge-preview/RagflowDocxPreview';
import { RagflowExcelPreview } from './knowledge-preview/RagflowExcelPreview';
import { RagflowMarkdownPreview } from './knowledge-preview/RagflowMarkdownPreview';
import { RagflowPdfPreview } from './knowledge-preview/RagflowPdfPreview';
import { RagflowPptxPreview } from './knowledge-preview/RagflowPptxPreview';
import './crm-file-preview.css';

type PreviewKind = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'image' | 'text' | 'markdown' | 'unsupported';
type State = { kind: 'loading' } | { kind: 'ready'; blob: Blob; text?: string; truncated?: boolean } | { kind: 'error'; message: string };
const TEXT_LIMIT = 2 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'tsv', 'json', 'xml', 'html', 'htm', 'yaml', 'yml', 'log', 'rtf']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'avif']);

function previewKind(file: CrmFile): PreviewKind {
  const ext = file.fileName.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf' || file.mimeType === 'application/pdf') return 'pdf';
  if (ext === 'docx' || ext === 'xlsx' || ext === 'pptx') return ext;
  if (ext === 'md' || file.mimeType === 'text/markdown') return 'markdown';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (TEXT_EXTENSIONS.has(ext) || file.mimeType.startsWith('text/')) return 'text';
  return 'unsupported';
}

function previewError(cause: unknown) {
  const status = typeof cause === 'object' && cause && 'status' in cause ? Number(cause.status) : 0;
  if (status === 401) return '登录状态已失效，请重新登录后查看。';
  if (status === 403) return '你没有查看此文件的权限。';
  if (status === 404) return '文件不存在或已移至回收站，请刷新文件列表。';
  return '文件预览加载失败，请重试或下载原件。';
}

class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <p role="alert">文件无法预览，请下载原件查看。</p> : this.props.children;
  }
}

function ImagePreview({ blob, title }: { blob: Blob; title: string }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  if (failed) return <p role="alert">图片无法预览，请下载原件查看。</p>;
  return url ? <img className="crm-file-preview-image" src={url} alt={title} onError={() => setFailed(true)} /> : null;
}

export default function CrmFilePreviewDialog({ file, onClose }: { file: CrmFile; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const kind = previewKind(file);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement;
    dialog.showModal();
    closeRef.current?.focus();
    return () => { dialog.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);

  useEffect(() => {
    if (kind === 'unsupported') return;
    const controller = new AbortController();
    setState({ kind: 'loading' });
    void (async () => {
      try {
        const blob = await getCrmFileContent(file.id, controller.signal);
        if (controller.signal.aborted) return;
        if (kind === 'text' || kind === 'markdown') {
          const text = await blob.slice(0, TEXT_LIMIT).text();
          if (!controller.signal.aborted) setState({ kind: 'ready', blob, text, truncated: blob.size > TEXT_LIMIT });
        } else {
          setState({ kind: 'ready', blob });
        }
      } catch (cause) {
        if (!controller.signal.aborted) setState({ kind: 'error', message: previewError(cause) });
      }
    })();
    return () => controller.abort();
  }, [file.id, kind, attempt]);

  let content: ReactNode;
  if (kind === 'unsupported') {
    content = <div className="crm-file-preview-message"><p>当前格式暂不支持在线查看。旧版 Word、Excel、PPT 可转换为 DOCX、XLSX、PPTX 后查看，也可以下载原件。</p></div>;
  } else if (state.kind === 'loading') {
    content = <p className="crm-file-preview-message" role="status">正在加载文件…</p>;
  } else if (state.kind === 'error') {
    content = <div className="crm-file-preview-message"><p role="alert">{state.message}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>重试预览</button></div>;
  } else {
    const blob = state.blob;
    content = <PreviewBoundary key={attempt}>
      {state.truncated && <p className="crm-file-preview-notice">仅预览前 2 MB 内容，完整内容可下载原件。</p>}
      {kind === 'pdf' && <RagflowPdfPreview blob={blob} />}
      {kind === 'docx' && <RagflowDocxPreview blob={blob} filename={file.fileName} />}
      {kind === 'xlsx' && <RagflowExcelPreview blob={blob} />}
      {kind === 'pptx' && <RagflowPptxPreview blob={blob} />}
      {kind === 'image' && <ImagePreview blob={blob} title={file.fileName} />}
      {kind === 'text' && <pre className="crm-file-preview-text">{state.text}</pre>}
      {kind === 'markdown' && <RagflowMarkdownPreview text={state.text ?? ''} />}
    </PreviewBoundary>;
  }

  return createPortal(<dialog ref={dialogRef} className="crm-file-preview" aria-label={`文件预览：${file.fileName}`} onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }}>
    <header className="crm-file-preview-header"><div><h3>{file.fileName}</h3><p>文件预览 · {Math.max(1, Math.round(file.sizeBytes / 1024))} KB</p></div><div className="crm-file-preview-actions"><CrmFileDownloadButton file={file} onStart={() => setDownloadError(null)} onError={setDownloadError} /><button ref={closeRef} type="button" aria-label="关闭文件预览" onClick={onClose}>关闭</button></div></header>
    {downloadError && <p className="crm-file-preview-notice" role="alert">{downloadError}</p>}
    <div className="crm-file-preview-body">{content}</div>
  </dialog>, document.body);
}
