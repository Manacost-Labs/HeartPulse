/*
 * Arrow-key navigation between marks laid out in 2D (treemap tiles, sankey nodes).
 * Pure functions, no React.
 */

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * The rectangle an arrow key should move to from `from`: the nearest one whose centre lies
 * in that direction (within a 45° cone first, then anywhere in that half-plane), weighting
 * sideways offset more than forward distance. -1 when there is none.
 */
export function nearestInDirection(rects: readonly Rect[], from: number, direction: Direction): number {
  const a = rects[from];
  if (!a) return -1;
  const ax = (a.x0 + a.x1) / 2;
  const ay = (a.y0 + a.y1) / 2;
  let best = -1;
  let bestScore = Infinity;
  rects.forEach((b, i) => {
    if (i === from) return;
    const bx = (b.x0 + b.x1) / 2;
    const by = (b.y0 + b.y1) / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const forward = direction === 'right' ? dx : direction === 'left' ? -dx : direction === 'down' ? dy : -dy;
    const side = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (forward <= 0.5) return;
    // Out-of-cone candidates rank after every in-cone one.
    const score = forward + side * 2 + (side > forward ? 1e6 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}
