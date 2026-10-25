import { useEffect } from 'react';

const PAGE_ACTION_SELECTOR = [
  '.content > [data-surface] > .object-toolbar > .toolbar-actions',
  '.content > [data-surface] > .panel:first-child > .object-toolbar > .toolbar-actions',
  '.content > .panel > .object-toolbar > .toolbar-actions',
].join(', ');

const INTERACTIVE_SELECTOR = 'button, [role="button"], a[href]';
const FORWARD_ATTR = 'data-page-action-forward';
const PORTAL_SELECTOR = '[data-page-action-portal="true"]';
const CLONE_SELECTOR = '[data-page-action-clone="true"]';

function interactiveControls(root: HTMLElement) {
  const result: HTMLElement[] = [];
  if (root.matches(INTERACTIVE_SELECTOR)) result.push(root);
  result.push(...root.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR));
  return result;
}

function actionLabel(element: HTMLElement) {
  return element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent?.trim() || '';
}

function isPrimaryPageAction(label: string) {
  const normalized = label.replace(/\s+/g, '');
  return normalized.startsWith('新建') || normalized.startsWith('新增');
}

function markPrimaryAction(element: HTMLElement, label: string) {
  if (!isPrimaryPageAction(label)) return false;
  element.classList.add('page-primary-action');
  element.setAttribute('data-page-action-kind', 'primary');
  return true;
}

function isElementVisible(element: HTMLElement) {
  if (!element.isConnected) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

/* The bridge intentionally hides the React-owned source toolbar after cloning it.
   With React Activity, previously visited surfaces remain mounted and hidden. Therefore
   source selection cannot use the toolbar's own computed display after we add
   data-page-action-source=true; it must judge the surrounding page/surface instead. */
function isActionContextVisible(element: HTMLElement, content: HTMLElement) {
  if (!element.isConnected) return false;
  let current = element.parentElement;
  while (current && current !== content) {
    const style = window.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden' || current.getClientRects().length === 0) return false;
    current = current.parentElement;
  }
  return current === content;
}

function visiblePortal(slot: HTMLElement) {
  return [...slot.querySelectorAll<HTMLElement>(PORTAL_SELECTOR)].find(isElementVisible) ?? null;
}

function visiblePageActionSource(content: HTMLElement) {
  return [...content.querySelectorAll<HTMLElement>(PAGE_ACTION_SELECTOR)].find((candidate) => isActionContextVisible(candidate, content)) ?? null;
}

export function PageActionBridge() {
  useEffect(() => {
    const topActions = document.querySelector<HTMLElement>('.top-actions');
    const content = document.querySelector<HTMLElement>('.content');
    if (!topActions || !content) return undefined;

    const existingSlot = document.getElementById('page-action-slot');
    const slot = existingSlot instanceof HTMLElement ? existingSlot : document.createElement('div');
    const ownsSlot = !(existingSlot instanceof HTMLElement);
    if (ownsSlot) {
      slot.id = 'page-action-slot';
      slot.className = 'page-action-slot';
      slot.setAttribute('aria-label', '页面操作');
      topActions.append(slot);
    }

    let source: HTMLElement | null = null;
    let sourceObserver: MutationObserver | null = null;

    const clearClones = () => {
      slot.querySelectorAll<HTMLElement>(CLONE_SELECTOR).forEach((element) => element.remove());
    };

    const clearSource = () => {
      sourceObserver?.disconnect();
      sourceObserver = null;
      source?.removeAttribute('data-page-action-source');
      source = null;
    };

    const renderClone = () => {
      if (visiblePortal(slot)) {
        clearClones();
        return;
      }

      clearClones();
      if (!source || !isActionContextVisible(source, content)) return;

      const sourceChildren = [...source.children] as HTMLElement[];
      const clone = source.cloneNode(true) as HTMLElement;
      clone.removeAttribute('data-page-action-source');
      clone.setAttribute('data-page-action-clone', 'true');
      const cloneChildren = [...clone.children] as HTMLElement[];

      sourceChildren.forEach((originalChild, childIndex) => {
        const cloneChild = cloneChildren[childIndex];
        if (!cloneChild) return;
        const originalControls = interactiveControls(originalChild);
        const clonedControls = interactiveControls(cloneChild);
        const childLabel = actionLabel(originalChild);

        if (originalControls.length === 0) {
          cloneChild.setAttribute(FORWARD_ATTR, `direct:${childIndex}`);
          cloneChild.setAttribute('role', 'button');
          cloneChild.setAttribute('tabindex', '0');
          if (childLabel) cloneChild.setAttribute('aria-label', childLabel);
          markPrimaryAction(cloneChild, childLabel);
          return;
        }

        /* Some external UI components render one real button inside a layout wrapper.
           Expose that wrapper as one stable topbar control rather than leaking the
           third-party DOM shape into our page-action contract. */
        if (!originalChild.matches(INTERACTIVE_SELECTOR) && originalControls.length === 1) {
          const originalControl = originalControls[0];
          const clonedControl = clonedControls[0];
          const label = actionLabel(originalControl) || childLabel;
          cloneChild.setAttribute(FORWARD_ATTR, `control:${childIndex}:0`);
          cloneChild.setAttribute('role', 'button');
          cloneChild.setAttribute('tabindex', originalControl.hasAttribute('disabled') ? '-1' : '0');
          if (label) cloneChild.setAttribute('aria-label', label);
          if (originalControl.hasAttribute('disabled')) cloneChild.setAttribute('aria-disabled', 'true');
          markPrimaryAction(cloneChild, label);
          if (clonedControl) {
            clonedControl.removeAttribute(FORWARD_ATTR);
            clonedControl.setAttribute('aria-hidden', 'true');
            clonedControl.setAttribute('tabindex', '-1');
          }
          return;
        }

        clonedControls.forEach((control, controlIndex) => {
          const original = originalControls[controlIndex];
          if (!original) return;
          control.setAttribute(FORWARD_ATTR, `control:${childIndex}:${controlIndex}`);
          const label = actionLabel(original) || childLabel;
          if (label && !control.getAttribute('aria-label')) control.setAttribute('aria-label', label);
          markPrimaryAction(control, label);
        });
      });

      slot.append(clone);

      const forward = (trigger: HTMLElement) => {
        if (!source || !isActionContextVisible(source, content)) return;
        const token = trigger.getAttribute(FORWARD_ATTR);
        if (!token) return;
        const [kind, childPart, controlPart] = token.split(':');
        const childIndex = Number(childPart);
        const sourceChild = source.children.item(childIndex) as HTMLElement | null;
        if (!sourceChild) return;
        if (kind === 'direct') {
          sourceChild.click();
          return;
        }
        const controlIndex = Number(controlPart);
        interactiveControls(sourceChild)[controlIndex]?.click();
      };

      clone.addEventListener('click', (event) => {
        const trigger = event.target instanceof Element ? event.target.closest<HTMLElement>(`[${FORWARD_ATTR}]`) : null;
        if (!trigger) return;
        event.preventDefault();
        event.stopPropagation();
        forward(trigger);
      });

      clone.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const trigger = event.target instanceof Element ? event.target.closest<HTMLElement>(`[${FORWARD_ATTR}]`) : null;
        if (!trigger || trigger.getAttribute('role') !== 'button') return;
        event.preventDefault();
        forward(trigger);
      });
    };

    const slotObserver = new MutationObserver(() => {
      const portal = visiblePortal(slot);
      const clone = slot.querySelector<HTMLElement>(CLONE_SELECTOR);
      if (portal) {
        if (clone) clearClones();
        return;
      }
      if (source && isActionContextVisible(source, content) && !clone) renderClone();
    });
    slotObserver.observe(slot, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden', 'aria-hidden'] });

    const syncSource = () => {
      const next = visiblePageActionSource(content);
      if (next === source) {
        renderClone();
        return;
      }
      clearSource();
      source = next;
      if (!source) {
        clearClones();
        return;
      }

      source.setAttribute('data-page-action-source', 'true');
      renderClone();
      sourceObserver = new MutationObserver(renderClone);
      sourceObserver.observe(source, { subtree: true, childList: true, characterData: true, attributes: true });
    };

    const contentObserver = new MutationObserver(syncSource);
    contentObserver.observe(content, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style', 'hidden', 'aria-hidden'],
    });
    syncSource();

    return () => {
      contentObserver.disconnect();
      slotObserver.disconnect();
      clearSource();
      clearClones();
      if (ownsSlot) slot.remove();
    };
  }, []);

  return null;
}
