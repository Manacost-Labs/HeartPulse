'use client';

import { useMemo, useRef, useState, type ComponentPropsWithRef, type KeyboardEvent, type ReactNode } from 'react';
import { GridIcon } from '../icons';
import { cx } from '../primitives';
import { Breadcrumbs } from '../navigation/Breadcrumbs';
import { ChartAnnouncer, ChartEmpty, GlowFilter, TilesSkeleton } from './cartesian';
import { ChartDataTable } from './ChartDataTable';
import { ChartTooltip } from './ChartTooltip';
import { formatPercent } from './scale';
import { nearestInDirection, type Direction } from './spatialNav';
import { layoutTreemap, treeValue, type TreemapTile } from './treemapLayout';
import { useChartSize } from './useChartSize';
import { cssVars, truncateText, useCategoryColor, useSvgId, useTextMeasure, valueFormat, type ValueFormatter } from './utils';
import { useLocale } from '../theme/ThemeProvider';
import { tokenNumber, useThemeTokens } from '../theme/useThemeTokens';
import './Chart.css';
import './Treemap.css';

export interface TreemapNode {
  /** Identifies the node among its siblings (drill-down path, React keys). Default: the label. */
  id?: string;
  label: string;
  /** Size of a leaf. Groups use the sum of their children instead. */
  value?: number;
  children?: TreemapNode[];
  /** Any CSS color for a top-level node and everything inside it (`colorBy="group"`). */
  color?: string;
}

export interface TreemapLabels {
  /** Shown instead of the plot when there is nothing to draw. Default "No data". */
  empty: string;
  /** First breadcrumb: the whole tree. Default "All". */
  root: string;
  /** Accessible name of the breadcrumb trail. Default "Treemap level". */
  breadcrumb: string;
  /** Column headers of the accessible data table. */
  name: string;
  value: string;
  share: string;
}

const DEFAULT_LABELS: TreemapLabels = {
  empty: 'No data',
  root: 'All',
  breadcrumb: 'Treemap level',
  name: 'Name',
  value: 'Value',
  share: 'Share',
};

export interface TreemapProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** Top-level nodes; tile area follows each leaf's `value` (groups: the sum of their children). */
  data: TreemapNode[];
  /** Plot height in px; width follows the container. Default 360. */
  height?: number;
  /** `group`: each top-level node gets a palette color. `value`: one color, darker for larger values. */
  colorBy?: 'group' | 'value';
  /** Color of the `value` scale. Default `--ui-chart-1`. */
  color?: string;
  /** Levels drawn at once: groups with a header and their children inside. Default 2. */
  depth?: number;
  /** Click or Enter on a tile zooms into its group; a breadcrumb leads back. Default true. */
  drillDown?: boolean;
  /** Called on click / Enter with the node and its ancestors (outermost first). */
  onNodeClick?: (node: TreemapNode, path: TreemapNode[]) => void;
  /** Formats values on the tiles, in the tooltip and the data table. */
  valueFormatter?: ValueFormatter;
  /** BCP 47 locale for the default number formatting. Default: the `ThemeProvider` locale, then the browser's. */
  locale?: string;
  /** Overrides for the built-in strings. */
  labels?: Partial<TreemapLabels>;
  /** Shows a placeholder of the same height while data loads. */
  loading?: boolean;
  /** Content at the end of the breadcrumb row (with `drillDown`), e.g. a hint or the selected path. */
  actions?: ReactNode;
  /** Accessible name of the chart (also the caption of its sr-only data table). */
  ariaLabel: string;
}

const HEADER_H = 24;
const PAD = 8;
const LABEL_FONT = { size: 12, weight: 500 };
const VALUE_FONT = { size: 11 };
const HEADER_FONT = { size: 12, weight: 600 };
/** Characters a truncated tile label keeps at least (plus the ellipsis). */
const MIN_CHARS = 4;

const keyOf = (node: TreemapNode) => node.id ?? node.label;
const valueOf = (node: TreemapNode) => node.value;
const childrenOf = (node: TreemapNode) => node.children;

/** Ancestors from the root to the node with the given key path, or null when the path no longer exists. */
function resolvePath(data: TreemapNode[], path: readonly string[]): TreemapNode[] | null {
  const out: TreemapNode[] = [];
  let level = data;
  for (const key of path) {
    const node = level.find((n) => keyOf(n) === key);
    if (!node?.children?.length) return null;
    out.push(node);
    level = node.children;
  }
  return out;
}

export function Treemap({
  data,
  height = 360,
  colorBy = 'group',
  color = 'var(--ui-chart-1)',
  depth = 2,
  drillDown = true,
  onNodeClick,
  valueFormatter,
  locale: localeProp,
  labels,
  loading = false,
  actions,
  ariaLabel,
  className,
  style,
  ...rest
}: TreemapProps) {
  const locale = useLocale(localeProp);
  const { ref: plotRef, width } = useChartSize();
  const measure = useTextMeasure(plotRef);
  const tokens = useThemeTokens(plotRef, { '--ui-treemap-gap': '2px', '--ui-treemap-tile-radius': '3px', '--ui-treemap-group-radius': '4px' });
  const categoryColor = useCategoryColor(plotRef);
  const gap = tokenNumber(tokens['--ui-treemap-gap']);
  const svgId = useSvgId('ui-treemap');
  const svgRef = useRef<SVGSVGElement>(null);
  const text = { ...DEFAULT_LABELS, ...labels };
  const formatValue = valueFormat(valueFormatter, locale);
  const [pathKeys, setPathKeys] = useState<string[]>([]);
  const [cursor, setCursor] = useState<{ key: string; keyboard: boolean } | null>(null);

  // A path that vanished with new data falls back to the root.
  const path = resolvePath(data, pathKeys) ?? [];
  const level = path.length ? path[path.length - 1].children! : data;
  const levelKey = path.map(keyOf).join('/');

  const model = useMemo(() => {
    const total = level.reduce((s, n) => s + treeValue(n, valueOf, childrenOf), 0);
    const tiles = width > 0 ? layoutTreemap(level, { x0: 0, y0: 0, x1: width, y1: height }, { value: valueOf, children: childrenOf, depth, headerHeight: HEADER_H, padding: 3, gap }) : [];
    const leaves = tiles.map((_, i) => i).filter((i) => !tiles[i].isGroup);
    const values = leaves.map((i) => tiles[i].value);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    return { total, tiles, leaves, lo, hi };
  }, [level, width, height, depth, gap]);

  const { total, tiles, leaves, lo, hi } = model;
  const tileKey = (t: TreemapTile<TreemapNode>) => {
    const keys = [keyOf(t.node)];
    for (let p = t.parent; p >= 0; p = tiles[p].parent) keys.unshift(keyOf(tiles[p].node));
    return keys.join('/');
  };
  const activeIndex = cursor ? leaves.find((i) => tileKey(tiles[i]) === cursor.key) ?? null : null;
  const active = activeIndex != null ? tiles[activeIndex] : null;

  // Zoomed in, everything keeps the color of the top-level node it came from.
  const rootIndex = path.length ? data.indexOf(path[0]) : -1;
  const groupColor = (t: TreemapTile<TreemapNode>) =>
    rootIndex >= 0 ? categoryColor(rootIndex, path[0].color) : categoryColor(t.group, level[t.group]?.color);
  // Intensity in [0, 1]: by value across the view, or larger siblings stronger within a group.
  const intensity = (t: TreemapTile<TreemapNode>) =>
    colorBy === 'value' ? (hi > lo ? (t.value - lo) / (hi - lo) : 1) : t.siblings > 1 ? 1 - t.rank / (t.siblings - 1) : 1;

  const ancestors = (t: TreemapTile<TreemapNode>) => {
    const out: TreemapNode[] = [];
    for (let p = t.parent; p >= 0; p = tiles[p].parent) out.unshift(tiles[p].node);
    return [...path, ...out];
  };
  const pathLabel = (t: TreemapTile<TreemapNode>) => [...ancestors(t).slice(path.length), t.node].map((n) => n.label).join(' / ');
  const share = (v: number) => formatPercent(total > 0 ? v / total : 0, 1, locale);

  // Zooming goes into the top-level tile under the pointer (one level per step).
  const zoomTarget = (t: TreemapTile<TreemapNode>) => {
    let top = t;
    while (top.parent >= 0) top = tiles[top.parent];
    return drillDown && top.node.children?.length ? top.node : null;
  };
  const clickable = (t: TreemapTile<TreemapNode>) => !!onNodeClick || zoomTarget(t) != null;

  const activate = (t: TreemapTile<TreemapNode>) => {
    onNodeClick?.(t.node, ancestors(t));
    const target = zoomTarget(t);
    if (!target) return;
    setPathKeys([...path.map(keyOf), keyOf(target)]);
    setCursor(null);
  };

  const goTo = (count: number, focus: boolean) => {
    setPathKeys(path.slice(0, count).map(keyOf));
    setCursor(null);
    // The clicked crumb turns into the current (non-interactive) one: keep focus in the chart.
    if (focus) svgRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const rects = leaves.map((i) => tiles[i]);
    const at = activeIndex != null ? leaves.indexOf(activeIndex) : -1;
    const move = (next: number) => {
      event.preventDefault();
      if (next >= 0) setCursor({ key: tileKey(rects[next]), keyboard: true });
    };
    const directions: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    if (directions[event.key]) {
      if (rects.length) move(at < 0 ? 0 : nearestInDirection(rects, at, directions[event.key]));
      return;
    }
    switch (event.key) {
      case 'Home':
        if (rects.length) move(0);
        return;
      case 'End':
        if (rects.length) move(rects.length - 1);
        return;
      case 'Enter':
      case ' ':
        if (!active) return;
        event.preventDefault();
        activate(active);
        return;
      case 'Backspace':
        if (!path.length) return;
        event.preventDefault();
        goTo(path.length - 1, false);
        return;
      case 'Escape':
        if (active) {
          event.preventDefault();
          setCursor(null);
        } else if (path.length) {
          event.preventDefault();
          goTo(path.length - 1, false);
        }
        return;
    }
  };

  const ready = width > 0 && !loading;
  const hasData = total > 0;
  const radius = (t: TreemapTile<TreemapNode>, base: number) => Math.max(0, Math.min(base, (t.x1 - t.x0) / 4, (t.y1 - t.y0) / 4));

  const tableRows: string[][] = [];
  const walk = (nodes: TreemapNode[], prefix: string) => {
    for (const n of nodes) {
      const v = treeValue(n, valueOf, childrenOf);
      if (!(v > 0)) continue;
      const label = prefix ? `${prefix} / ${n.label}` : n.label;
      tableRows.push([label, formatValue(v), share(v)]);
      if (n.children?.length) walk(n.children, label);
    }
  };
  walk(level, '');

  return (
    <div
      {...rest}
      className={cx('ui-chart ui-treemap', className)}
      style={{ ...cssVars({ '--_glow': `url(#${svgId}-glow)` }), ...style }}
      data-color-by={colorBy}
      aria-busy={loading || undefined}
    >
      {drillDown && (
        <div className="ui-treemap__toolbar">
          <Breadcrumbs
            className="ui-treemap__breadcrumbs"
            aria-label={text.breadcrumb}
            maxItems={4}
            items={[
              { label: text.root, onClick: () => goTo(0, true) },
              ...path.map((node, i) => ({ label: node.label, onClick: () => goTo(i + 1, true) })),
            ]}
          />
          {actions != null && <div className="ui-treemap__actions">{actions}</div>}
        </div>
      )}
      <div ref={plotRef} className="ui-chart__plot" style={{ height }}>
        {loading && <TilesSkeleton />}
        {ready && (
          <svg
            ref={svgRef}
            className="ui-chart__svg ui-treemap__svg"
            width={width}
            height={height}
            role="img"
            aria-label={ariaLabel}
            tabIndex={hasData ? 0 : undefined}
            onKeyDown={onKeyDown}
            onBlur={() => setCursor(null)}
            onPointerLeave={(event) => event.pointerType === 'mouse' && setCursor(null)}
          >
            <defs>
              <GlowFilter id={`${svgId}-glow`} blur={6} dy={2} opacity={0.25} />
            </defs>
            <g key={levelKey} className="ui-treemap__level">
              {tiles.map((t, i) => {
                const w = t.x1 - t.x0;
                const h = t.y1 - t.y0;
                const tint = intensity(t);
                const vars = cssVars({ '--_color': colorBy === 'value' ? color : groupColor(t), '--_t': tint, '--_i': Math.min(i, 30) });
                if (t.isGroup) {
                  const label = truncateText(t.node.label, w - PAD * 2, measure, HEADER_FONT);
                  const valueText = formatValue(t.value);
                  const showValue = measure(label, HEADER_FONT) + measure(valueText) + PAD * 3 <= w;
                  return (
                    <g
                      key={tileKey(t)}
                      className="ui-treemap__group"
                      style={vars}
                      data-clickable={clickable(t) || undefined}
                      onPointerEnter={() => setCursor(null)}
                      onClick={() => activate(t)}
                    >
                      <rect className="ui-treemap__group-box" x={t.x0} y={t.y0} width={w} height={h} rx={radius(t, tokenNumber(tokens['--ui-treemap-group-radius']))} />
                      {w > 40 && (
                        <text className="ui-treemap__header" x={t.x0 + PAD} y={t.y0 + HEADER_H / 2 + 1} dy="0.32em" aria-hidden="true">
                          {label}
                          {showValue && (
                            <tspan className="ui-treemap__header-value" dx={PAD}>
                              {valueText}
                            </tspan>
                          )}
                        </text>
                      )}
                    </g>
                  );
                }
                // A label is drawn whole, or cut to at least a few characters — never a lone initial.
                const label = w >= 36 && h >= 22 ? truncateText(t.node.label, w - PAD * 2, measure, LABEL_FONT) : '';
                const fitsLabel =
                  !!label && (label === t.node.label || Array.from(label).length > MIN_CHARS) && measure(label, LABEL_FONT) <= w - PAD * 2;
                const valueText = formatValue(t.value);
                const fitsValue = fitsLabel && h >= 40 && measure(valueText, VALUE_FONT) <= w - PAD * 2;
                return (
                  <g
                    key={tileKey(t)}
                    className="ui-treemap__tile"
                    style={vars}
                    data-ink=""
                    data-clickable={clickable(t) || undefined}
                    data-active={activeIndex === i || undefined}
                    onPointerEnter={() => setCursor({ key: tileKey(t), keyboard: false })}
                    onClick={() => activate(t)}
                  >
                    <rect className="ui-treemap__rect" x={t.x0} y={t.y0} width={w} height={h} rx={radius(t, tokenNumber(tokens['--ui-treemap-tile-radius']))} />
                    {fitsLabel && (
                      <text className="ui-treemap__label" x={t.x0 + PAD} y={t.y0 + PAD + 9} aria-hidden="true">
                        {label}
                      </text>
                    )}
                    {fitsValue && (
                      <text className="ui-treemap__value" x={t.x0 + PAD} y={t.y0 + PAD + 25} aria-hidden="true">
                        {valueText}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        )}
        {ready && !hasData && <ChartEmpty icon={<GridIcon size={18} />}>{text.empty}</ChartEmpty>}
        {ready && active && (
          <ChartTooltip
            className="ui-chart-tooltip--plain"
            placement="top"
            x={(active.x0 + active.x1) / 2}
            y={active.y0}
            bottom={active.y1}
            containerWidth={width}
            title={pathLabel(active)}
            rows={[
              { label: text.value, value: formatValue(active.value) },
              { label: text.share, value: share(active.value) },
            ]}
          />
        )}
        <ChartAnnouncer
          text={cursor?.keyboard && active ? `${pathLabel(active)}: ${formatValue(active.value)}, ${share(active.value)}` : null}
        />
      </div>
      <ChartDataTable caption={ariaLabel} columns={[text.name, text.value, text.share]} rows={tableRows} />
    </div>
  );
}
