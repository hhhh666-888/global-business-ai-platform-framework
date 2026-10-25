import type { ReactNode } from 'react';
import { NativeModalLayer } from './NativeModalLayer';
import './business-record-modal.css';

type Props = {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  width?: 'medium' | 'large';
};

export function BusinessRecordModal({ title, description, onClose, children, width = 'large' }: Props) {
  return (
    <NativeModalLayer
      className="business-record-modal-backdrop"
      title={title}
      onClose={onClose}
    >
      <section
        className={`business-record-modal business-record-modal-${width}`}
      >
        <header className="business-record-modal-header">
          <div>
            <h3>{title}</h3>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="business-record-modal-close" aria-label={`关闭${title}`} onClick={onClose}>×</button>
        </header>
        <div className="business-record-modal-body">{children}</div>
      </section>
    </NativeModalLayer>
  );
}
