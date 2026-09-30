/** Keeps field focus visible for Tab navigation without adding a ring while typing after a click. */
export function installFieldFocusMode(doc: Document): () => void {
  const root = doc.documentElement;
  const onPointerDown = () => { root.dataset.pointerFocus = ''; };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Tab') delete root.dataset.pointerFocus;
  };

  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('keydown', onKeyDown, true);
  return () => {
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('keydown', onKeyDown, true);
    delete root.dataset.pointerFocus;
  };
}
