const TIERS = ['S', 'A', 'B', 'C', 'D'] as const;

export function createBuilderPage(pageSize = 60) {
  let query = '';
  let visible = pageSize;
  return {
    limit(nextQuery: string) {
      if (query !== nextQuery) { query = nextQuery; visible = pageSize; }
      return visible;
    },
    more() { visible += pageSize; },
  };
}

/** Stores distinct editor snapshots, with bounded memory and no redo branch. */
export function createBuilderHistory() {
  const snapshots: string[] = [];
  return {
    commit(value: unknown) {
      const snapshot = JSON.stringify(value);
      if (snapshots.at(-1) === snapshot) return false;
      snapshots.push(snapshot);
      if (snapshots.length > 30) snapshots.shift();
      return true;
    },
    canUndo: () => snapshots.length > 1,
    undo(): unknown | null {
      if (snapshots.length < 2) return null;
      snapshots.pop();
      const previous = snapshots.at(-1);
      return previous ? JSON.parse(previous) : null;
    },
  };
}

export function restoreTierPlacements(cardIds: string[], draft: unknown): Record<string, string[]> {
  const placements: Record<string, string[]> = { POOL: [], S: [], A: [], B: [], C: [], D: [] };
  const available = new Set(cardIds);
  const saved = draft && typeof draft === 'object' ? draft as Record<string, unknown> : {};
  for (const tier of TIERS) {
    const ids = saved[tier];
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      if (typeof id !== 'string' || !available.delete(id)) continue;
      placements[tier].push(id);
    }
  }
  placements.POOL = cardIds.filter(id => available.has(id));
  return placements;
}

type StrategyIdentity = { id: string; source: string };
type PlacedIdentity = StrategyIdentity & { uid: string; slot: number; highlighted: boolean };
type BuilderAnnotation = { id: string; type: string; cardUids: string[]; text?: string };

/** Restores identities only; the adapter supplies current names and image URLs. */
export function restoreStrategyDraft(cards: StrategyIdentity[], draft: unknown, slotCount = 25) {
  const saved = draft && typeof draft === 'object' ? draft as Record<string, unknown> : {};
  const available = new Set(cards.map(card => `${card.source}:${card.id}`));
  const occupied = new Set<number>();
  const uids = new Set<string>();
  const placed: PlacedIdentity[] = [];
  for (const entry of Array.isArray(saved.placed) ? saved.placed : []) {
    if (!entry || typeof entry !== 'object') continue;
    const { id, source, uid, slot } = entry;
    if (typeof id !== 'string' || typeof source !== 'string' || typeof uid !== 'string' || !uid || uid.length > 80 || !/^[a-zA-Z0-9_-]+$/.test(uid)) continue;
    if (!available.has(`${source}:${id}`) || !Number.isInteger(slot) || slot < 0 || slot >= slotCount || occupied.has(slot) || uids.has(uid)) continue;
    occupied.add(slot); uids.add(uid);
    placed.push({ id, source, uid, slot, highlighted: entry.highlighted === true });
  }
  const annotations: BuilderAnnotation[] = [];
  const types = new Set(['strike', 'question', 'label', 'arrow', 'plus', 'equals', 'double-arrow']);
  for (const entry of Array.isArray(saved.annotations) ? saved.annotations.slice(0, 200) : []) {
    if (!entry || !types.has(entry.type) || typeof entry.id !== 'string') continue;
    const cardUids = entry.cardUids;
    const count = ['strike', 'question', 'label'].includes(entry.type) ? 1 : 2;
    if (!Array.isArray(cardUids) || cardUids.length !== count || !cardUids.every(uid => uids.has(uid))) continue;
    if (entry.type === 'label' && typeof entry.text !== 'string') continue;
    annotations.push({ id: entry.id, type: entry.type, cardUids, ...(entry.type === 'label' ? { text: entry.text.slice(0, 80) } : {}) });
  }
  return { placed, annotations };
}

export function pickBuilderSlot(occupiedSlots: number[], preferred: number | null, slotCount = 25): number | null {
  const occupied = new Set(occupiedSlots);
  if (preferred !== null && Number.isInteger(preferred) && preferred >= 0 && preferred < slotCount && !occupied.has(preferred)) return preferred;
  for (let slot = 0; slot < slotCount; slot += 1) {
    if (!occupied.has(slot)) return slot;
  }
  return null;
}
