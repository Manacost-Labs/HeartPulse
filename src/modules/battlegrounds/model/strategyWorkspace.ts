const COLUMNS = 5;

export function normalizeWorkspaceRows(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10 ? value : 5;
}

/** Shrinking repacks overflow into free cells; it never discards a placed card. */
export function resizeStrategySlots<T extends { slot: number }>(cards: T[], requestedRows: number) {
  const rows = Math.max(normalizeWorkspaceRows(requestedRows), Math.ceil(cards.length / COLUMNS));
  const occupied = new Set(cards.filter(card => card.slot < rows * COLUMNS).map(card => card.slot));
  const placed = cards.map(card => {
    if (card.slot < rows * COLUMNS) return card;
    let slot = 0;
    while (occupied.has(slot)) slot++;
    occupied.add(slot);
    return { ...card, slot };
  });
  return { rows, placed };
}

export function strategySlotPosition(slot: number, rows: number) {
  const column = slot % COLUMNS;
  const row = Math.floor(slot / COLUMNS);
  return { x: (column + 0.5) / COLUMNS, y: (row + 0.5) / rows };
}

/** Pointer drops use the same centers as cards and the visible grid. */
export function nearestStrategySlot(x: number, y: number, rows: number) {
  let nearest = 0;
  let distance = Infinity;
  for (let slot = 0; slot < rows * COLUMNS; slot++) {
    const center = strategySlotPosition(slot, rows);
    const next = (center.x - x) ** 2 + (center.y - y) ** 2;
    if (next < distance) { nearest = slot; distance = next; }
  }
  return nearest;
}
