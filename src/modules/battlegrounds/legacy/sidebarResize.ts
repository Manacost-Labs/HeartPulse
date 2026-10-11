const WIDTH_KEY = 'hearthpulse-builder-sidebar-width-v1';

/** Pointer and keyboard resizing share one persisted preference for both editors. */
export function mountBuilderSidebarResize(root: HTMLElement, signal: AbortSignal) {
  const gridElement = root.querySelector<HTMLElement>('.bg-strategy-builder-legacy, .bg-tier-builder-legacy');
  const sidebarElement = root.querySelector<HTMLElement>('.builder-sidebar');
  const windowElement = root.ownerDocument.defaultView;
  if (!gridElement || !sidebarElement || !windowElement) return () => {};
  const grid = gridElement;
  const sidebar = sidebarElement;
  const doc = root.ownerDocument;
  const win = windowElement;
  let preferred = 320;
  try { preferred = Number(win.localStorage.getItem(WIDTH_KEY)) || 320; } catch { /* Storage is optional. */ }
  const label = doc.createElement('label');
  label.className = 'builder-sidebar-size';
  const text = doc.createElement('span');
  text.textContent = 'Ширина библиотеки';
  const input = doc.createElement('input');
  input.type = 'range'; input.min = '260'; input.max = '600'; input.step = '1';
  const output = doc.createElement('output');
  label.append(text, input, output);
  const head = doc.createElement('div');
  head.className = 'builder-library-head';
  const search = sidebar.querySelector<HTMLElement>('.control-field[data-tour-id$="-search"]');
  const searchParent = search?.parentNode;
  const searchNext = search?.nextSibling;
  head.append(label);
  if (search) head.append(search);
  sidebar.prepend(head);
  const separator = doc.createElement('div');
  separator.className = 'builder-sidebar-resize';
  separator.tabIndex = 0;
  separator.setAttribute('role', 'separator');
  separator.setAttribute('aria-orientation', 'vertical');
  separator.setAttribute('aria-label', 'Ширина библиотеки: перетяните или используйте стрелки');
  separator.setAttribute('aria-valuemin', '260');
  separator.title = 'Потяните границу, чтобы изменить ширину библиотеки';
  grid.append(separator);
  let dragging = false;
  let frame = 0;
  function maximum() { return Math.max(260, Math.min(600, grid.clientWidth - 450 - 18)); }
  function paint() {
    frame = 0;
    const max = maximum();
    const width = Math.round(Math.max(260, Math.min(Math.floor(max), preferred)));
    grid.style.setProperty('--builder-sidebar-width', `${width}px`);
    input.max = String(Math.floor(max));
    input.value = String(width);
    output.textContent = `${width} px`;
    separator.setAttribute('aria-valuemax', String(Math.round(max)));
    separator.setAttribute('aria-valuenow', String(width));
    separator.style.left = `${width + 1}px`;
  }
  function save() {
    try { win.localStorage.setItem(WIDTH_KEY, String(preferred)); } catch { /* The resized panel still works. */ }
  }
  function set(value: number) { preferred = Math.max(260, Math.min(maximum(), value)); paint(); }
  input.addEventListener('input', () => set(Number(input.value)), { signal });
  input.addEventListener('change', save, { signal });
  separator.addEventListener('keydown', event => {
    const width = Number(separator.getAttribute('aria-valuenow'));
    if (event.key === 'ArrowLeft') set(width - 20);
    else if (event.key === 'ArrowRight') set(width + 20);
    else if (event.key === 'Home') set(260);
    else if (event.key === 'End') set(maximum());
    else return;
    event.preventDefault(); save();
  }, { signal });
  separator.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    dragging = true; separator.setPointerCapture(event.pointerId);
    separator.classList.add('is-resizing'); event.preventDefault();
  }, { signal });
  separator.addEventListener('pointermove', event => {
    if (!dragging) return;
    preferred = Math.max(260, Math.min(maximum(), event.clientX - grid.getBoundingClientRect().left));
    if (!frame) frame = win.requestAnimationFrame(paint);
  }, { signal });
  function finish() {
    if (!dragging) return;
    dragging = false; separator.classList.remove('is-resizing'); paint(); save();
  }
  separator.addEventListener('pointerup', finish, { signal });
  separator.addEventListener('pointercancel', finish, { signal });
  separator.addEventListener('lostpointercapture', finish, { signal });
  const observer = new ResizeObserver(() => { if (!frame) frame = win.requestAnimationFrame(paint); });
  observer.observe(grid);
  paint();
  return () => {
    observer.disconnect(); win.cancelAnimationFrame(frame);
    if (search && searchParent) searchParent.insertBefore(search, searchNext?.parentNode === searchParent ? searchNext : null);
    head.remove(); separator.remove(); grid.style.removeProperty('--builder-sidebar-width');
  };
}
