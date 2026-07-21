import {
  addModalToStack,
  removeModalFromStack,
  topModalId,
} from './modalSurfaceModel';

export const MODAL_FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[contenteditable="true"]:not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export type ModalSurfaceRegistration = {
  id: string;
  surface: HTMLElement;
  panel: HTMLElement;
  trigger: HTMLElement | null;
  initialFocus: () => HTMLElement | null;
  close: () => void;
  keyDown?: (event: KeyboardEvent) => void;
};

type IsolatedRootState = {
  element: HTMLElement;
  inert: boolean;
  hadAriaHidden: boolean;
  ariaHidden: string | null;
};

let modalIds: string[] = [];
let registrations = new Map<string, ModalSurfaceRegistration>();
let isolatedRoot: IsolatedRootState | null = null;
let listenersAttached = false;

function isUsableFocusTarget(element: HTMLElement | null | undefined): element is HTMLElement {
  if (!element?.isConnected || element.closest('[inert]')) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none'
    && style.visibility !== 'hidden'
    && element.getClientRects().length > 0;
}

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR))
    .filter(isUsableFocusTarget);
}

function focusWithoutScroll(element: HTMLElement | null | undefined): boolean {
  if (!isUsableFocusTarget(element)) return false;
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
  return document.activeElement === element;
}

function topRegistration(): ModalSurfaceRegistration | null {
  const id = topModalId(modalIds);
  return id ? registrations.get(id) ?? null : null;
}

function focusEntry(entry: ModalSurfaceRegistration): void {
  if (focusWithoutScroll(entry.initialFocus())) return;
  if (focusWithoutScroll(focusableElements(entry.panel)[0])) return;
  focusWithoutScroll(entry.panel);
}

function synchronizeStackAccessibility(): void {
  const topId = topModalId(modalIds);
  for (const [id, entry] of registrations) {
    const top = id === topId;
    entry.surface.inert = !top;
    entry.surface.dataset.modalSurfaceState = top ? 'top' : 'covered';
    if (top) entry.surface.removeAttribute('aria-hidden');
    else entry.surface.setAttribute('aria-hidden', 'true');
  }
}

function isolateApplicationRoot(): void {
  if (isolatedRoot) return;
  const root = document.getElementById('root');
  if (!root) return;
  isolatedRoot = {
    element: root,
    inert: root.inert,
    hadAriaHidden: root.hasAttribute('aria-hidden'),
    ariaHidden: root.getAttribute('aria-hidden'),
  };
  root.inert = true;
  root.setAttribute('aria-hidden', 'true');
}

function restoreApplicationRoot(): void {
  if (!isolatedRoot) return;
  const { element, inert, hadAriaHidden, ariaHidden } = isolatedRoot;
  element.inert = inert;
  if (hadAriaHidden && ariaHidden != null) element.setAttribute('aria-hidden', ariaHidden);
  else element.removeAttribute('aria-hidden');
  isolatedRoot = null;
}

function restoreFocus(trigger: HTMLElement | null, removedId: string): void {
  const apply = () => {
    const top = topRegistration();
    if (top) {
      if (trigger && top.surface.contains(trigger) && focusWithoutScroll(trigger)) return;
      focusEntry(top);
      return;
    }
    if (focusWithoutScroll(trigger)) return;
    const root = document.getElementById('root');
    const fallback = root?.querySelector<HTMLElement>(MODAL_FOCUSABLE_SELECTOR) ?? null;
    if (!focusWithoutScroll(fallback)) focusWithoutScroll(document.body);
  };
  apply();
  queueMicrotask(() => {
    if (registrations.has(removedId)) return;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body || !active.isConnected) apply();
  });
}

function trapTab(event: KeyboardEvent, entry: ModalSurfaceRegistration): void {
  const focusables = focusableElements(entry.panel);
  if (focusables.length === 0) {
    event.preventDefault();
    focusEntry(entry);
    return;
  }
  const first = focusables[0];
  const last = focusables.at(-1)!;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !entry.panel.contains(active))) {
    event.preventDefault();
    focusWithoutScroll(last);
  } else if (!event.shiftKey && (active === last || !entry.panel.contains(active))) {
    event.preventDefault();
    focusWithoutScroll(first);
  }
}

function handleDocumentKeyDown(event: KeyboardEvent): void {
  const entry = topRegistration();
  if (!entry) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    entry.close();
    return;
  }
  if (event.key === 'Tab') trapTab(event, entry);
  entry.keyDown?.(event);
}

function handleDocumentFocusIn(event: FocusEvent): void {
  const entry = topRegistration();
  if (!entry || entry.surface.contains(event.target as Node)) return;
  focusEntry(entry);
}

function attachListeners(): void {
  if (listenersAttached) return;
  document.addEventListener('keydown', handleDocumentKeyDown, true);
  document.addEventListener('focusin', handleDocumentFocusIn, true);
  listenersAttached = true;
}

function detachListeners(): void {
  if (!listenersAttached || modalIds.length > 0) return;
  document.removeEventListener('keydown', handleDocumentKeyDown, true);
  document.removeEventListener('focusin', handleDocumentFocusIn, true);
  listenersAttached = false;
}

export function isTopModalSurface(id: string): boolean {
  return topModalId(modalIds) === id;
}

export function registerModalSurface(entry: ModalSurfaceRegistration): () => void {
  const firstSurface = modalIds.length === 0;
  registrations.set(entry.id, entry);
  modalIds = addModalToStack(modalIds, entry.id);
  if (firstSurface) isolateApplicationRoot();
  attachListeners();
  synchronizeStackAccessibility();
  focusEntry(entry);

  return () => {
    if (registrations.get(entry.id)?.surface !== entry.surface) return;
    const wasTop = isTopModalSurface(entry.id);
    registrations.delete(entry.id);
    modalIds = removeModalFromStack(modalIds, entry.id);
    synchronizeStackAccessibility();
    if (modalIds.length === 0) restoreApplicationRoot();
    detachListeners();
    if (wasTop) restoreFocus(entry.trigger, entry.id);
  };
}
