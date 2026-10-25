import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const DESKTOP_QUERY = '(min-width: 1100px)';

function ensurePageActionSlot() {
  const existing = document.getElementById('page-action-slot');
  if (existing instanceof HTMLElement) return existing;
  const topActions = document.querySelector<HTMLElement>('.top-actions');
  if (!topActions) return null;
  const slot = document.createElement('div');
  slot.id = 'page-action-slot';
  slot.className = 'page-action-slot';
  slot.setAttribute('aria-label', '页面操作');
  topActions.append(slot);
  return slot;
}

export function PageActionsPortal({ children, activityManaged = false }: { children: ReactNode; activityManaged?: boolean }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const syncMedia = () => setDesktop(media.matches);
    syncMedia();
    media.addEventListener('change', syncMedia);

    const resolveSlot = () => setSlot(ensurePageActionSlot());
    resolveSlot();
    const observer = new MutationObserver(resolveSlot);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      media.removeEventListener('change', syncMedia);
      observer.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    if (!activityManaged) return undefined;
    const actions = actionsRef.current;
    if (!actions) return undefined;

    // React Activity preserves portal DOM outside the hidden surface. Its layout-effect
    // lifecycle therefore owns whether this node participates in the one-authoritative-
    // toolbar contract. A hidden stale portal must not remain selectable as toolbar-actions
    // while PageActionBridge installs the current visible surface's clone.
    actions.classList.add('toolbar-actions');
    actions.hidden = false;
    actions.removeAttribute('aria-hidden');
    return () => {
      actions.classList.remove('toolbar-actions');
      actions.hidden = true;
      actions.setAttribute('aria-hidden', 'true');
    };
  }, [activityManaged, desktop, slot]);

  const actions = <div ref={actionsRef} className="toolbar-actions" data-page-action-portal="true" data-page-action-activity-managed={activityManaged ? 'true' : undefined}>{children}</div>;
  if (desktop && slot) return createPortal(actions, slot);
  return actions;
}
