'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cx } from '../primitives';
import { cssVars } from './utils';
import './Chart.css';

export interface ChartTooltipRow {
  label: ReactNode;
  value: ReactNode;
  color?: string;
}

export interface ChartTooltipProps {
  /** Anchor x in pixels, relative to the positioned chart wrapper. */
  x: number;
  /** Anchor top edge in pixels. */
  y: number;
  /** Anchor bottom edge; the tooltip flips below it when there is no room above. Defaults to `y`. */
  bottom?: number;
  /** Width of the anchor for `side` placement (e.g. a bar group), so the tooltip never covers it. */
  anchorWidth?: number;
  /** Width of the wrapper — the tooltip is kept inside it. */
  containerWidth: number;
  /** Height of the wrapper; a side-placed tooltip moves up rather than hang below it. */
  containerHeight?: number;
  /** `side`: right of x (flips left), for crosshairs. `top`: centred above the anchor, for cells. */
  placement?: 'side' | 'top';
  title?: ReactNode;
  rows?: ChartTooltipRow[];
  children?: ReactNode;
  className?: string;
}

const GAP = 10;
const EDGE = 4;

/**
 * Hover card for charts: an absolutely positioned `.ui-floating` inside the chart
 * wrapper. Purely visual (aria-hidden) — charts expose the same data in an
 * sr-only table.
 */
export function ChartTooltip({
  x,
  y,
  bottom = y,
  anchorWidth = 0,
  containerWidth,
  containerHeight,
  placement = 'side',
  title,
  rows,
  children,
  className,
}: ChartTooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left: number;
    let top: number;
    if (placement === 'side') {
      const right = x + anchorWidth / 2 + GAP;
      left = right + w > containerWidth - EDGE ? x - anchorWidth / 2 - GAP - w : right;
      top = containerHeight != null ? Math.max(0, Math.min(y, containerHeight - h)) : y;
    } else {
      left = x - w / 2;
      top = y - GAP - h >= 0 ? y - GAP - h : bottom + GAP;
    }
    left = Math.max(EDGE, Math.min(left, containerWidth - w - EDGE));
    // Glide between positions, but appear in place the first time.
    el.style.transition = placed.current ? '' : 'none';
    el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    placed.current = true;
  });

  return (
    <div ref={ref} className={cx('ui-floating ui-chart-tooltip', className)} aria-hidden="true">
      {title != null && <div className="ui-chart-tooltip__title">{title}</div>}
      {rows && rows.length > 0 && (
        <ul className="ui-chart-tooltip__rows">
          {rows.map((row, i) => (
            <li key={i} className="ui-chart-tooltip__row">
              {row.color && <span className="ui-chart-tooltip__swatch" style={cssVars({ '--_color': row.color })} />}
              <span className="ui-chart-tooltip__label">{row.label}</span>
              <span className="ui-chart-tooltip__value">{row.value}</span>
            </li>
          ))}
        </ul>
      )}
      {children}
    </div>
  );
}
