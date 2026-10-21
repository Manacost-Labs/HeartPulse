'use client';

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from '../primitives';
import { cssVars } from './utils';
import './Chart.css';

export interface ChartLegendItem {
  label: ReactNode;
  color: string;
  /** Right-aligned value (e.g. total or percentage) — mostly for the vertical layout. */
  value?: ReactNode;
  /** The series is switched off (with `onItemToggle`): hollow swatch, faded label. */
  hidden?: boolean;
}

export interface ChartLegendProps extends ComponentPropsWithRef<'ul'> {
  items: ChartLegendItem[];
  orientation?: 'horizontal' | 'vertical';
  /** Highlighted item; the others are dimmed. */
  activeIndex?: number | null;
  /** Hovering an item reports its index (null on leave), so the chart can highlight it too. */
  onActiveIndexChange?: (index: number | null) => void;
  /** Makes every item a toggle button (`aria-pressed`) that reports its index, to show or hide a series. */
  onItemToggle?: (index: number) => void;
}

export function ChartLegend({
  items,
  orientation = 'horizontal',
  activeIndex = null,
  onActiveIndexChange,
  onItemToggle,
  className,
  ...rest
}: ChartLegendProps) {
  return (
    <ul className={cx('ui-chart-legend', className)} data-orientation={orientation} {...rest}>
      {items.map((item, i) => (
        <li
          key={i}
          className="ui-chart-legend__item"
          data-dimmed={activeIndex != null && activeIndex !== i ? '' : undefined}
          onPointerEnter={onActiveIndexChange && (() => onActiveIndexChange(i))}
          onPointerLeave={onActiveIndexChange && (() => onActiveIndexChange(null))}
          data-hidden={item.hidden || undefined}
        >
          {onItemToggle ? (
            <button
              type="button"
              className="ui-chart-legend__toggle"
              aria-pressed={!item.hidden}
              onClick={() => onItemToggle(i)}
              onFocus={onActiveIndexChange && (() => onActiveIndexChange(i))}
              onBlur={onActiveIndexChange && (() => onActiveIndexChange(null))}
            >
              <LegendContent item={item} />
            </button>
          ) : (
            <LegendContent item={item} />
          )}
        </li>
      ))}
    </ul>
  );
}

function LegendContent({ item }: { item: ChartLegendItem }) {
  return (
    <>
      <span className="ui-chart-legend__swatch" style={cssVars({ '--_color': item.color })} aria-hidden="true" />
      <span className="ui-chart-legend__label">{item.label}</span>
      {item.value != null && <span className="ui-chart-legend__value">{item.value}</span>}
    </>
  );
}
