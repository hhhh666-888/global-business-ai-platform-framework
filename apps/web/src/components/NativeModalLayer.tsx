import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './native-modal-layer.css';

/** Native top-layer modality also keeps nested file previews and Escape scoped. */
export function NativeModalLayer({ title, className, onClose, children }: { title: string; className: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef(typeof document === 'undefined' ? null : document.activeElement);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    dialog.querySelector<HTMLElement>('input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])')?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      const previous = previousFocus.current;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  if (typeof document === 'undefined') return null;
  return createPortal(<dialog ref={dialogRef} className={`gbap-modal-layer ${className}`} aria-label={title}
    onCancel={(event) => {
      // Portals bubble through the React tree; ignore a nested reader's cancel.
      if (event.target !== event.currentTarget) return;
      event.preventDefault(); event.stopPropagation(); onClose();
    }}
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    {children}
  </dialog>, document.body);
}
