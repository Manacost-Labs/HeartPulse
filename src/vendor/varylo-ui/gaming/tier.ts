/*
 * Pure tier-list operations behind TierList. A placement maps a tier id to the ordered ids of the items in it;
 * items in no tier sit in the pool. Unknown ids and repeats are dropped when a placement is read.
 */

/** Tier id → item ids in order. Items in no tier are unranked (the pool). */
export type TierPlacement = Record<string, string[]>;

export interface TierRow {
  /** Tier id; `null` for the pool of unranked items. */
  tier: string | null;
  items: string[];
}

/**
 * The rows to render: one per tier in `tierIds` order, then the pool with every known item that no tier holds.
 * An item listed under two tiers stays in the first; ids that are not in `itemIds` are dropped.
 */
export function tierRows(tierIds: readonly string[], itemIds: readonly string[], placement: TierPlacement): TierRow[] {
  const known = new Set(itemIds);
  const placed = new Set<string>();
  const rows: TierRow[] = tierIds.map((tier) => {
    const items: string[] = [];
    for (const id of placement[tier] ?? []) {
      if (!known.has(id) || placed.has(id)) continue;
      placed.add(id);
      items.push(id);
    }
    return { tier, items };
  });
  rows.push({ tier: null, items: itemIds.filter((id) => !placed.has(id)) });
  return rows;
}

/** Where an item is: row index and position inside the row; `null` when no row holds it. */
export function locateTierItem(rows: readonly TierRow[], itemId: string): { row: number; index: number } | null {
  for (let row = 0; row < rows.length; row++) {
    const index = rows[row].items.indexOf(itemId);
    if (index !== -1) return { row, index };
  }
  return null;
}

/**
 * Moves an item to row `toRow` so that it ends up at `toIndex` (its final position, clamped). Returns the same
 * array when nothing changes.
 */
export function moveTierItem(rows: readonly TierRow[], itemId: string, toRow: number, toIndex: number): TierRow[] {
  const from = locateTierItem(rows, itemId);
  if (!from || toRow < 0 || toRow >= rows.length) return rows as TierRow[];
  const same = from.row === toRow;
  const length = rows[toRow].items.length - (same ? 1 : 0);
  const index = Math.min(Math.max(0, Math.floor(toIndex)), length);
  if (same && index === from.index) return rows as TierRow[];
  const next = rows.slice();
  const remaining = rows[from.row].items.filter((id) => id !== itemId);
  if (same) {
    remaining.splice(index, 0, itemId);
    next[from.row] = { ...rows[from.row], items: remaining };
  } else {
    const target = rows[toRow].items.slice();
    target.splice(index, 0, itemId);
    next[from.row] = { ...rows[from.row], items: remaining };
    next[toRow] = { ...rows[toRow], items: target };
  }
  return next;
}

/** The rows with only the items `visible` keeps: what a filtered view shows. */
export function filterTierRows(rows: readonly TierRow[], visible: (id: string) => boolean): TierRow[] {
  return rows.map((row) => ({ ...row, items: row.items.filter(visible) }));
}

/**
 * `moveTierItem` for a filtered view: `toIndex` counts only the items `visible` keeps, the moved one aside. The item
 * lands just before the visible item now at that position, or right after the last visible one; hidden items keep
 * their order. With every item visible this is `moveTierItem`.
 */
export function moveTierItemVisible(rows: readonly TierRow[], itemId: string, toRow: number, toIndex: number, visible: (id: string) => boolean): TierRow[] {
  const target = rows[toRow];
  if (!target) return rows as TierRow[];
  const items = target.items.filter((id) => id !== itemId);
  const shown = items.filter(visible);
  const at = Math.max(0, Math.floor(toIndex));
  const index = at < shown.length ? items.indexOf(shown[at]) : shown.length ? items.indexOf(shown[shown.length - 1]) + 1 : items.length;
  return moveTierItem(rows, itemId, toRow, index);
}

/** Back from rows to a placement: every tier is listed, the pool is left out. */
export function rowsToPlacement(rows: readonly TierRow[]): TierPlacement {
  const out: TierPlacement = {};
  for (const row of rows) if (row.tier !== null) out[row.tier] = row.items.slice();
  return out;
}

/** A drop slot (0…length, counted with the dragged item still in place) as the final index for `moveTierItem`. */
export function tierSlotToIndex(slot: number, from: { row: number; index: number } | null, toRow: number): number {
  return from && from.row === toRow && from.index < slot ? slot - 1 : slot;
}

/**
 * The item a vertical arrow lands on in the next row: the one at the same position, or the row's last item when
 * the row is shorter. `null` when the row is empty or missing.
 */
export function nearestInRow(rows: readonly TierRow[], row: number, index: number): string | null {
  const items = rows[row]?.items;
  if (!items?.length) return null;
  return items[Math.min(index, items.length - 1)];
}

/**
 * Plain-text export, one tier per line: `S: Name, Name`. Empty tiers keep their line, the pool is left out unless
 * `poolLabel` names it.
 */
export function tierListText(
  rows: readonly TierRow[],
  tierLabel: (tier: string) => string,
  itemName: (id: string) => string,
  poolLabel?: string,
): string {
  return rows
    .filter((row) => row.tier !== null || (poolLabel !== undefined && row.items.length > 0))
    .map((row) => `${row.tier === null ? poolLabel : tierLabel(row.tier)}: ${row.items.map(itemName).join(', ')}`.trimEnd())
    .join('\n');
}

/**
 * A compact, URL-safe share code: `S~a.b_A~c` (tiers by `_`, items by `.`, each id URI-encoded). Tiers with no
 * items are left out; `parseTierCode` restores the placement.
 */
export function tierCode(placement: TierPlacement, tierIds: readonly string[]): string {
  const enc = (s: string) => encodeURIComponent(s).replace(/[.~_]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return tierIds
    .filter((tier) => placement[tier]?.length)
    .map((tier) => `${enc(tier)}~${placement[tier].map(enc).join('.')}`)
    .join('_');
}

/** Reads a `tierCode` back; malformed parts are skipped, never thrown on. */
export function parseTierCode(code: string): TierPlacement {
  const out: TierPlacement = {};
  const dec = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return null;
    }
  };
  for (const part of code.trim().split('_')) {
    const [tierPart, itemsPart, extra] = part.split('~');
    if (extra !== undefined || !tierPart || itemsPart === undefined) continue;
    const tier = dec(tierPart);
    if (tier === null) continue;
    const items = itemsPart
      .split('.')
      .map(dec)
      .filter((id): id is string => !!id);
    out[tier] = [...(out[tier] ?? []), ...items];
  }
  return out;
}
