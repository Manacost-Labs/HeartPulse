/* Anchors of the patch page: sections, groups, and opening a folded section before the browser scrolls to one. */

export function sectionAnchor(id: string) {
  return `hp-patch-section-${id}`;
}

export function groupAnchor(id: string) {
  return `hp-patch-group-${id.replace(/[^a-zа-яё0-9]+/giu, '-')}`;
}

/** Opens a collapsed section before the browser scrolls to its anchor; a link's `hash` percent-encodes Cyrillic ids. */
export function openTarget(hash: string) {
  let id = hash.slice(1);
  try {
    id = decodeURIComponent(id);
  } catch {
    // A malformed escape is looked up as written.
  }
  const target = document.getElementById(id);
  const details = target?.closest('details') ?? (target instanceof HTMLDetailsElement ? target : null);
  if (details) details.open = true;
}
