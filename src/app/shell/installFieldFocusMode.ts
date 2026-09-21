/** Keeps field focus visible for Tab navigation without adding a ring while typing after a click. */
export function installFieldFocusMode(doc: Document): (() => void) | undefined {
  const root = doc.documentElement;
  const onPointerDown = () => { root.dataset.pointerFocus = ''; };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Tab') delete root.dataset.pointerFocus;
  };

  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('keydown', onKeyDown, true);
  // Production listeners live for the page; only development needs HMR cleanup.
  if (import.meta.env.DEV) {
    return () => {
      doc.removeEventListener('pointerdown', onPointerDown, true);
      doc.removeEventListener('keydown', onKeyDown, true);
      delete root.dataset.pointerFocus;
    };
  }
}
