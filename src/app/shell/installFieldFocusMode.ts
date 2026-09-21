/** Keeps field focus visible for Tab navigation without adding a ring while typing after a click. */
export function installFieldFocusMode(doc: Document): () => void {
  const root = doc.documentElement;
  root.dataset.fieldFocus = 'keyboard';
  const onPointerDown = () => { root.dataset.fieldFocus = 'pointer'; };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Tab') root.dataset.fieldFocus = 'keyboard';
  };

  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('keydown', onKeyDown, true);
  return () => {
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('keydown', onKeyDown, true);
    delete root.dataset.fieldFocus;
  };
}
