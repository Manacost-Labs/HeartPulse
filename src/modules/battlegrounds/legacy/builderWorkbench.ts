import { createBuilderHistory, createBuilderPage, restoreTierPlacements, restoreStrategyDraft, pickBuilderSlot } from '../model/builderWorkbench';
import { normalizeWorkspaceRows, resizeStrategySlots, strategySlotPosition, nearestStrategySlot } from '../model/strategyWorkspace';
import { mountBuilderSidebarResize } from './sidebarResize';

const sessions = new WeakMap<HTMLElement, ReturnType<typeof createSession>>();

function createPagedCatalog<T>(root: HTMLElement, key: (card: T) => string, createCard: (card: T) => HTMLElement) {
  const page = createBuilderPage();
  const more = root.ownerDocument.createElement('button');
  more.type = 'button';
  more.hidden = true;
  more.className = 'secondary-button builder-load-more';
  more.textContent = 'Показать ещё 60 карт';
  root.after(more);
  let cards: T[] = [];
  let query = '';
  let nodes = new Map<string, HTMLElement>();
  function paint() {
    const visible = cards.slice(0, page.limit(query));
    const next = new Map<string, HTMLElement>();
    const children = visible.map(card => {
      const id = key(card);
      const node = nodes.get(id) || createCard(card);
      next.set(id, node);
      return node;
    });
    nodes = next;
    root.replaceChildren(...children);
    more.hidden = visible.length >= cards.length;
    more.textContent = `Показать ещё ${Math.min(60, cards.length - visible.length)} карт`;
  }
  more.addEventListener('click', () => { page.more(); paint(); });
  return {
    render(nextCards: T[], nextQuery: string) {
      if (query !== nextQuery) root.scrollTop = 0;
      cards = nextCards;
      query = nextQuery;
      paint();
    },
    dispose() { more.remove(); nodes.clear(); },
  };
}

function mountWorkspaceSwitch(root: HTMLElement) {
  const library = root.querySelector<HTMLElement>('.builder-sidebar');
  const board = root.querySelector<HTMLElement>('.builder-canvas-panel, .hero-tier-board');
  const group = root.ownerDocument.createElement('div');
  group.className = 'builder-workspace-switch';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Раздел редактора');
  const buttons = new Map<string, HTMLButtonElement>();
  const boardLabel = root.querySelector('#tier-builder-rows') ? 'Тир-лист' : 'Поле';
  const prefix = root.id || `builder-${crypto.randomUUID()}`;
  for (const [view, panel, label] of [['library', library, 'Библиотека'], ['board', board, boardLabel]] as const) {
    if (!panel) continue;
    panel.id ||= `${prefix}-${view}`;
    const button = root.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'builder-workspace-tab';
    button.dataset.view = view;
    button.textContent = label;
    button.setAttribute('aria-controls', panel.id);
    button.setAttribute('aria-pressed', String(view === 'library'));
    button.addEventListener('click', () => {
      root.dataset.builderView = view;
      buttons.forEach((control, name) => control.setAttribute('aria-pressed', String(name === view)));
      const target = view === 'board' ? panel.querySelector('.strategy-board, #tier-builder-rows') || panel : panel;
      target.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    buttons.set(view, button);
    group.append(button);
  }
  root.dataset.builderView = 'library';
  root.prepend(group);
  return {
    setCount(count: number) {
      const button = buttons.get('board');
      if (button) button.textContent = `${boardLabel} · ${count}`;
    },
    dispose() { group.remove(); delete root.dataset.builderView; },
  };
}

function createSession(root: HTMLElement, storageKey: string) {
  const controller = new AbortController();
  const workspace = mountWorkspaceSwitch(root);
  const history = createBuilderHistory();
  const disposers: (() => void)[] = [mountBuilderSidebarResize(root, controller.signal)];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: unknown;
  let undoButton: HTMLButtonElement | undefined;
  let status: HTMLElement | undefined;
  let exportStatus: HTMLElement | undefined;
  let disposed = false;
  // The board drawn before the saved draft is read is a placeholder: saving it
  // would replace the draft with an empty board while the library still loads.
  let restored = false;
  function persist() {
    if (pending === undefined) return;
    try {
      root.ownerDocument.defaultView?.localStorage.setItem(storageKey, JSON.stringify({ version: 1, draft: pending }));
      if (status) status.textContent = 'Черновик сохранён в этом браузере';
    } catch {
      if (status) status.textContent = 'Браузер не разрешает сохранить черновик. Экспортируйте результат перед выходом.';
    }
  }
  const session = {
    signal: controller.signal,
    setBoardCount: workspace.setCount,
    readDraft(): unknown {
      restored = true;
      try {
        const saved = JSON.parse(root.ownerDocument.defaultView?.localStorage.getItem(storageKey) || 'null');
        return saved?.version === 1 ? saved.draft : null;
      } catch { return null; }
    },
    commit(value: unknown) {
      if (disposed || !restored) return;
      history.commit(value);
      pending = value;
      if (undoButton) undoButton.disabled = !history.canUndo();
      if (status) status.textContent = 'Сохраняю черновик…';
      clearTimeout(timer);
      timer = setTimeout(persist, 250);
    },
    mountUndo(toolbar: HTMLElement, restore: (draft: unknown) => void) {
      undoButton = root.ownerDocument.createElement('button');
      undoButton.type = 'button';
      undoButton.className = 'secondary-button builder-undo';
      undoButton.textContent = 'Отменить';
      undoButton.disabled = true;
      undoButton.addEventListener('click', () => {
        const draft = history.undo();
        if (draft !== null) restore(draft);
        if (undoButton) undoButton.disabled = !history.canUndo();
      }, { signal: controller.signal });
      status = root.ownerDocument.createElement('p');
      status.className = 'builder-draft-status';
      status.setAttribute('role', 'status');
      exportStatus = root.ownerDocument.createElement('p');
      exportStatus.className = 'builder-export-status';
      exportStatus.setAttribute('role', 'status');
      exportStatus.hidden = true;
      toolbar.append(undoButton, status, exportStatus);
    },
    listen(target: EventTarget, type: string, listener: EventListener, options: AddEventListenerOptions = {}) {
      target.addEventListener(type, listener, { ...options, signal: controller.signal });
    },
    catalog<T>(element: HTMLElement, key: (card: T) => string, createCard: (card: T) => HTMLElement) {
      const catalog = createPagedCatalog(element, key, createCard);
      disposers.push(() => catalog.dispose());
      return catalog;
    },
    async export(button: HTMLButtonElement, action: () => Promise<void>) {
      if (root.getAttribute('aria-busy') === 'true') return;
      const label = button.textContent;
      root.setAttribute('aria-busy', 'true');
      button.disabled = true;
      button.textContent = 'Готовлю…';
      if (exportStatus) { exportStatus.hidden = false; exportStatus.textContent = 'Готовлю изображение…'; }
      try {
        await action();
        if (exportStatus) exportStatus.textContent = 'Файл готов к скачиванию';
      } catch {
        if (exportStatus) exportStatus.textContent = 'Не удалось экспортировать изображение. Попробуйте ещё раз.';
      } finally {
        root.removeAttribute('aria-busy');
        button.disabled = false;
        button.textContent = label;
      }
    },
    onDispose(dispose: () => void) { disposers.push(dispose); },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      persist();
      controller.abort();
      workspace.dispose();
      disposers.forEach(dispose => dispose());
    },
  };
  return session;
}

/** Owns classic editor lifetimes; composition must dispose the mounted root. */
export const battlegroundBuilderWorkbenchV1 = Object.freeze({
  install(target: object) {
    Reflect.set(target, '__hsArenaBgBuilderWorkbenchV1', {
      workspaceVersion: 2,
      createSession(root: HTMLElement, key: string) {
        sessions.get(root)?.dispose();
        const session = createSession(root, key);
        sessions.set(root, session);
        return session;
      },
      restoreTierPlacements,
      restoreStrategyDraft,
      pickBuilderSlot,
      normalizeWorkspaceRows,
      resizeStrategySlots,
      strategySlotPosition,
      nearestStrategySlot,
    });
  },
  dispose(root: HTMLElement | null) {
    if (!root) return;
    sessions.get(root)?.dispose();
    sessions.delete(root);
  },
});
