/*
 * Squarified treemap layout (Bruls, Huizing & van Wijk) with nested groups.
 * Pure functions, no React.
 */

import type { Rect } from './spatialNav';

export type { Rect };

/** Worst aspect ratio of a row of areas laid along a side (lower is squarer). */
function worst(sum: number, min: number, max: number, side: number) {
  const s2 = side * side;
  const sum2 = sum * sum;
  return Math.max((s2 * max) / sum2, sum2 / (s2 * min));
}

/**
 * Splits `rect` into one rectangle per value with areas proportional to the values and
 * aspect ratios close to 1. Larger values are placed first (top-left); the result keeps
 * the input order. Values ≤ 0 or non-finite get an empty rectangle.
 */
export function squarify(values: readonly number[], rect: Rect): Rect[] {
  const out: Rect[] = values.map(() => ({ x0: rect.x0, y0: rect.y0, x1: rect.x0, y1: rect.y0 }));
  const order = values
    .map((_, i) => i)
    .filter((i) => Number.isFinite(values[i]) && values[i] > 0)
    .sort((a, b) => values[b] - values[a] || a - b);
  const total = order.reduce((s, i) => s + values[i], 0);
  let { x0, y0 } = rect;
  const { x1, y1 } = rect;
  const area = (x1 - x0) * (y1 - y0);
  if (!(total > 0) || !(area > 0)) return out;
  const k = area / total;

  let i = 0;
  while (i < order.length) {
    const w = x1 - x0;
    const h = y1 - y0;
    const side = Math.min(w, h);
    let sum = values[order[i]] * k;
    let ratio = worst(sum, sum, sum, side);
    let j = i + 1;
    // Grow the row while it gets squarer (values are sorted, so the newest is the smallest).
    for (; j < order.length; j++) {
      const a = values[order[j]] * k;
      const next = worst(sum + a, a, values[order[i]] * k, side);
      if (next > ratio) break;
      sum += a;
      ratio = next;
    }
    const last = j === order.length;
    if (w >= h) {
      // A column along the left edge; the final row takes all remaining space (no float drift).
      const colW = last ? w : sum / h;
      let y = y0;
      for (let m = i; m < j; m++) {
        const bottom = m === j - 1 ? y1 : y + (values[order[m]] * k) / colW;
        out[order[m]] = { x0, y0: y, x1: x0 + colW, y1: bottom };
        y = bottom;
      }
      x0 += colW;
    } else {
      const rowH = last ? h : sum / w;
      let x = x0;
      for (let m = i; m < j; m++) {
        const right = m === j - 1 ? x1 : x + (values[order[m]] * k) / rowH;
        out[order[m]] = { x0: x, y0, x1: right, y1: y0 + rowH };
        x = right;
      }
      y0 += rowH;
    }
    i = j;
  }
  return out;
}

export interface TreemapTile<T> extends Rect {
  node: T;
  /** Sum of the leaf values below (or the node's own value for a leaf). */
  value: number;
  /** 0 for the top-level nodes. */
  depth: number;
  /** Index of the tile of the parent in the result, or -1 at the top level. */
  parent: number;
  /** Index of the top-level node this tile belongs to (its colour group). */
  group: number;
  /** Rank by value among its siblings (0 = largest). */
  rank: number;
  siblings: number;
  /** Children are laid out inside, under a header strip. */
  isGroup: boolean;
}

export interface TreemapLayoutOptions<T> {
  value: (node: T) => number | null | undefined;
  children: (node: T) => readonly T[] | null | undefined;
  /** Levels drawn; deeper nodes are summed into their ancestor at the last level. Default 2. */
  depth?: number;
  /** Height of a group's header strip. Default 24. */
  headerHeight?: number;
  /** Inset of children inside a group (sides and bottom). Default 3. */
  padding?: number;
  /** Space between neighbouring tiles. Default 2. */
  gap?: number;
  /** A group smaller than this (either side, after its header) is drawn as one tile. Default 24. */
  minGroupSize?: number;
}

/** Total of a subtree: leaves count their own value, groups the sum of their children. */
export function treeValue<T>(node: T, value: TreemapLayoutOptions<T>['value'], children: TreemapLayoutOptions<T>['children']): number {
  const kids = children(node);
  if (kids && kids.length > 0) return kids.reduce((s, c) => s + treeValue(c, value, children), 0);
  const v = value(node);
  return v != null && Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Nested squarified layout. Each group reserves a header strip and lays its children
 * out inside; groups too small for that become plain tiles. Tiles are returned parents
 * first (draw order), with `gap` between neighbours and flush outer edges.
 */
export function layoutTreemap<T>(nodes: readonly T[], rect: Rect, options: TreemapLayoutOptions<T>): TreemapTile<T>[] {
  const { value, children, depth: maxDepth = 2, headerHeight = 24, padding = 3, gap = 2, minGroupSize = 24 } = options;
  const out: TreemapTile<T>[] = [];
  const half = gap / 2;

  const place = (items: readonly T[], area: Rect, depth: number, parent: number, group: number) => {
    const values = items.map((n) => treeValue(n, value, children));
    // Lay out in an area grown by half a gap, then shrink every tile by it: neighbours end up
    // exactly one gap apart while the outer tiles stay flush with the area.
    const rects = squarify(values, { x0: area.x0 - half, y0: area.y0 - half, x1: area.x1 + half, y1: area.y1 + half });
    const ranks = values
      .map((v, i) => ({ v, i }))
      .filter((e) => e.v > 0)
      .sort((a, b) => b.v - a.v || a.i - b.i);
    const rankOf = new Map(ranks.map((e, r) => [e.i, r]));
    items.forEach((node, i) => {
      if (!(values[i] > 0)) return;
      const r = rects[i];
      const tile = {
        x0: r.x0 + half,
        y0: r.y0 + half,
        x1: Math.max(r.x0 + half, r.x1 - half),
        y1: Math.max(r.y0 + half, r.y1 - half),
      };
      const kids = children(node);
      const index = out.length;
      const g = depth === 0 ? i : group;
      const inner: Rect = { x0: tile.x0 + padding, y0: tile.y0 + headerHeight, x1: tile.x1 - padding, y1: tile.y1 - padding };
      const isGroup =
        !!kids &&
        kids.length > 0 &&
        depth < maxDepth - 1 &&
        inner.x1 - inner.x0 >= minGroupSize &&
        inner.y1 - inner.y0 >= minGroupSize;
      out.push({ ...tile, node, value: values[i], depth, parent, group: g, rank: rankOf.get(i) ?? 0, siblings: ranks.length, isGroup });
      if (isGroup) place(kids!, inner, depth + 1, index, g);
    });
  };

  place(nodes, rect, 0, -1, 0);
  return out;
}
