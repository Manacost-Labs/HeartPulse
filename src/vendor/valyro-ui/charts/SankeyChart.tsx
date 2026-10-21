'use client';

import { useMemo, useRef, useState, type ComponentPropsWithRef, type KeyboardEvent, type PointerEvent } from 'react';
import { cx } from '../primitives';
import { Skeleton } from '../basic/Skeleton';
import { ChartAnnouncer, GlowFilter } from './cartesian';
import { ChartDataTable } from './ChartDataTable';
import { ChartTooltip } from './ChartTooltip';
import { sankeyLayout } from './sankeyLayout';
import { formatPercent } from './scale';
import { nearestInDirection, type Direction } from './spatialNav';
import { useChartSize } from './useChartSize';
import { capsuleRadius, cssVars, truncateText, useCategoryColor, useSvgId, useTextMeasure, valueFormat, wrapText, type ValueFormatter } from './utils';
import { useLocale } from '../theme/ThemeProvider';
import { tokenNumber, useThemeTokens } from '../theme/useThemeTokens';
import './Chart.css';
import './SankeyChart.css';
import { withRef } from '../primitives/react-compat';

export interface SankeyNode {
  id: string;
  /** Display name. Default: the id. */
  label?: string;
  /** Any CSS color. Defaults to the next `--ui-chart-N` token. */
  color?: string;
}

export interface SankeyLink {
  /** Node ids. */
  source: string;
  target: string;
  value: number;
}

export interface SankeyChartLabels {
  /** Shown instead of the plot when there is nothing to draw. Default "No data". */
  empty: string;
  /** Tooltip rows and data table headers. */
  value: string;
  /** Share of the total flow entering the diagram. Default "Share of total". */
  share: string;
  /** Share of the source's outflow / the target's inflow carried by a link. */
  shareOfSource: string;
  shareOfTarget: string;
  /** Flow into and out of a node. */
  incoming: string;
  outgoing: string;
  source: string;
  target: string;
}

const DEFAULT_LABELS: SankeyChartLabels = {
  empty: 'No data',
  value: 'Value',
  share: 'Share of total',
  shareOfSource: 'Share of source',
  shareOfTarget: 'Share of target',
  incoming: 'In',
  outgoing: 'Out',
  source: 'Source',
  target: 'Target',
};

export interface SankeyChartProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** Nodes referenced by link ids; a node's height follows its larger of inflow and outflow, unlinked nodes are hidden. */
  nodes: SankeyNode[];
  /** Flows between nodes. Links that would close a cycle are not drawn. */
  links: SankeyLink[];
  /** Plot height in px; width follows the container. Default 360. */
  height?: number;
  /** Width of a node bar in px. Default: the theme's `--ui-sankey-chart-node-w` (10 in Vercel, 14 in Glass). */
  nodeWidth?: number;
  /** Vertical gap between nodes in px (less when a column is crowded). Default 16. */
  nodePadding?: number;
  /** `justify` puts nodes without outflow in the last column; `left` keeps them at their depth. */
  align?: 'justify' | 'left';
  /** Formats node and link values in labels, the tooltip and the data table. */
  valueFormatter?: ValueFormatter;
  /** BCP 47 locale for the default number formatting. Default: the `ThemeProvider` locale, then the browser's. */
  locale?: string;
  /** Overrides for the built-in strings. */
  labels?: Partial<SankeyChartLabels>;
  /** Shows a placeholder of the same height while data loads. */
  loading?: boolean;
  /** Accessible name of the chart (also the caption of its sr-only data table). */
  ariaLabel: string;
  /** HearthPulse: click, or Enter on the keyboard-picked node. On touch the first tap only shows the tooltip. */
  onNodeClick?: (node: SankeyNode) => void;
}

type Hover = { kind: 'node' | 'link'; index: number; keyboard: boolean } | null;

const LABEL_GAP = 6;
const LABEL_FONT = { size: 12, weight: 500 };
const VALUE_FONT = { size: 12 };
/** Vertical room for the label of a node at the very top or bottom. */
const EDGE = 4;
/**
 * Below this width only the first and last columns are labelled (on up to two lines each, with
 * the whole gap to themselves); the nodes in between are named by their tooltip.
 */
const COMPACT_WIDTH = 480;
const LINE_H = 14;

export const SankeyChart = withRef(function SankeyChart({
  nodes,
  links,
  height = 360,
  nodeWidth: nodeWidthProp,
  nodePadding = 16,
  align = 'justify',
  valueFormatter,
  locale: localeProp,
  labels,
  loading = false,
  ariaLabel,
  onNodeClick,
  className,
  style,
  ...rest
}: SankeyChartProps) {
  const locale = useLocale(localeProp);
  const { ref: plotRef, width } = useChartSize();
  const measure = useTextMeasure(plotRef);
  const tokens = useThemeTokens(plotRef, { '--ui-chart-capsule': '0', '--ui-sankey-chart-node-w': '10px', '--ui-sankey-chart-node-radius': '2px' });
  const categoryColor = useCategoryColor(plotRef);
  const svgId = useSvgId('ui-sankey');
  const text = { ...DEFAULT_LABELS, ...labels };
  const formatValue = valueFormat(valueFormatter, locale);
  const percent = (ratio: number) => formatPercent(ratio, 1, locale);
  const [hover, setHover] = useState<Hover>(null);
  // HearthPulse: which node was shown when a press began, so a first tap on touch only reveals it.
  const press = useRef<{ touch: boolean; shown: number | null }>({ touch: false, shown: null });
  const nodeWidth = nodeWidthProp ?? tokenNumber(tokens['--ui-sankey-chart-node-w'], 10);

  const layout = useMemo(
    () =>
      sankeyLayout(
        nodes.map((n) => n.id),
        links,
        { width: Math.max(0, width), height: Math.max(0, height - EDGE * 2), nodeWidth, nodePadding, align },
      ),
    [nodes, links, width, height, nodeWidth, nodePadding, align],
  );

  const name = (i: number) => nodes[layout.nodes[i].index].label ?? nodes[layout.nodes[i].index].id;
  const colorOf = (i: number) => categoryColor(layout.nodes[i].index, nodes[layout.nodes[i].index].color);
  // Total flow entering the diagram: everything that leaves a node with no inflow.
  const total = layout.nodes.reduce((s, n) => s + (n.incoming.length === 0 ? n.value : 0), 0);
  const lastColumn = layout.columns - 1;
  const columnX = (c: number) => layout.nodes.find((n) => n.column === c)?.x0;
  const compact = width > 0 && width < COMPACT_WIDTH;

  const nodeLabels = layout.nodes.map((n, i) => {
    const left = layout.columns > 1 && n.column === lastColumn;
    const hidden = compact && layout.columns > 2 && n.column > 0 && n.column < lastColumn;
    // Labels run into the gap towards the next column (or back towards the previous one). The
    // last gap holds labels from both sides, so each gets half of it — unless the middle ones are hidden.
    const lastGap = !compact && layout.columns > 1 && (left || n.column === lastColumn - 1);
    const gap = left ? n.x0 - (columnX(n.column - 1) ?? 0) - nodeWidth : (columnX(n.column + 1) ?? width) - n.x1;
    const room = Math.max(0, (lastGap ? gap / 2 : gap) - LABEL_GAP * 2);
    const value = formatValue(n.value);
    const valueW = measure(value, VALUE_FONT) + 6;
    const withValue = !compact && measure(name(i), LABEL_FONT) + valueW <= room;
    // Narrow charts wrap a long name onto a second line rather than cutting it.
    const lines = hidden ? [] : compact ? wrapText(name(i), room, measure, LABEL_FONT) : [truncateText(name(i), withValue ? room - valueW : room, measure, LABEL_FONT)];
    return {
      x: left ? n.x0 - LABEL_GAP : n.x1 + LABEL_GAP,
      y: EDGE + (n.y0 + n.y1) / 2,
      anchor: left ? ('end' as const) : ('start' as const),
      lines,
      label: lines.join(' '),
      value: withValue ? value : null,
    };
  });

  // Highlight: the whole path through the hovered node or link — every flow that feeds it and
  // every flow it feeds, back to the sources and on to the sinks.
  const litLinks = new Set<number>();
  const litNodes = new Set<number>();
  const trace = (node: number, dir: 'up' | 'down') => {
    litNodes.add(node);
    const n = layout.nodes[node];
    for (const l of dir === 'up' ? n.incoming : n.outgoing) {
      if (litLinks.has(l)) continue;
      litLinks.add(l);
      trace(dir === 'up' ? layout.links[l].source : layout.links[l].target, dir);
    }
  };
  if (hover?.kind === 'node') {
    trace(hover.index, 'up');
    trace(hover.index, 'down');
  } else if (hover?.kind === 'link') {
    const l = layout.links[hover.index];
    litLinks.add(hover.index);
    trace(l.source, 'up');
    trace(l.target, 'down');
  }

  const nodeRows = (i: number) => {
    const n = layout.nodes[i];
    return [
      { label: text.value, value: formatValue(n.value) },
      ...(total > 0 ? [{ label: text.share, value: percent(n.value / total) }] : []),
      // Pass-through nodes only list in and out when some flow starts or ends there.
      ...(n.incoming.length && n.outgoing.length && Math.abs(n.inValue - n.outValue) > 1e-9 * n.value
        ? [
            { label: text.incoming, value: formatValue(n.inValue) },
            { label: text.outgoing, value: formatValue(n.outValue) },
          ]
        : []),
    ];
  };
  const linkRows = (k: number) => {
    const l = layout.links[k];
    return [
      { label: text.value, value: formatValue(l.value) },
      { label: text.shareOfSource, value: percent(l.value / layout.nodes[l.source].outValue) },
      { label: text.shareOfTarget, value: percent(l.value / layout.nodes[l.target].inValue) },
    ];
  };
  const linkTitle = (k: number) => `${name(layout.links[k].source)} → ${name(layout.links[k].target)}`;

  const onKeyDown = (event: KeyboardEvent) => {
    const rects = layout.nodes;
    if (rects.length === 0) return;
    const at = hover?.kind === 'node' ? hover.index : -1;
    const directions: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    let next: number;
    // HearthPulse: Enter or Space opens the keyboard-picked node.
    if ((event.key === 'Enter' || event.key === ' ') && hover?.kind === 'node' && onNodeClick) {
      event.preventDefault();
      onNodeClick(nodes[layout.nodes[hover.index].index]);
      return;
    }
    if (directions[event.key]) next = at < 0 ? 0 : nearestInDirection(rects, at, directions[event.key]);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = rects.length - 1;
    else if (event.key === 'Escape' && hover) next = -2;
    else return;
    event.preventDefault();
    if (next === -2) setHover(null);
    else if (next >= 0) setHover({ kind: 'node', index: next, keyboard: true });
  };

  const ready = width > 0 && !loading;
  const hasData = layout.nodes.length > 0;
  const hoverNode = hover?.kind === 'node' ? layout.nodes[hover.index] : null;
  const hoverLink = hover?.kind === 'link' ? layout.links[hover.index] : null;
  const announce = hover?.keyboard && hoverNode
    ? `${name(hover.index)}: ${nodeRows(hover.index).map((r) => `${r.label} ${r.value}`).join(', ')}`
    : null;

  return (
    <div
      {...rest}
      className={cx('ui-chart ui-sankey-chart', className)}
      style={{ ...cssVars({ '--_glow': `url(#${svgId}-glow)` }), ...style }}
      aria-busy={loading || undefined}
    >
      <div ref={plotRef} className="ui-chart__plot" style={{ height }}>
        {loading && <Skeleton className="ui-chart__skeleton" height={height} />}
        {ready && (
          <svg
            className="ui-chart__svg"
            width={width}
            height={height}
            role="img"
            aria-label={ariaLabel}
            tabIndex={hasData ? 0 : undefined}
            onKeyDown={onKeyDown}
            onBlur={() => setHover(null)}
            onPointerLeave={(event) => event.pointerType === 'mouse' && setHover(null)}
            data-hover={hover ? '' : undefined}
          >
            <defs>
              <GlowFilter id={`${svgId}-glow`} blur={4} dy={1} opacity={0.4} />
            </defs>
            {!hasData && (
              <text className="ui-chart__empty" x={width / 2} y={height / 2} textAnchor="middle" dy="0.32em">
                {text.empty}
              </text>
            )}
            <g transform={`translate(0,${EDGE})`}>
              <g className="ui-sankey-chart__links">
                {layout.links.map((l, k) => {
                  const x0 = layout.nodes[l.source].x1;
                  const x1 = layout.nodes[l.target].x0;
                  const xm = (x0 + x1) / 2;
                  return (
                    <path
                      key={k}
                      className="ui-sankey-chart__link"
                      d={`M${x0},${l.y0}C${xm},${l.y0} ${xm},${l.y1} ${x1},${l.y1}`}
                      strokeWidth={Math.max(1, l.width)}
                      pathLength={1}
                      // A flow keeps the colour of where it comes from (a gradient to the target's reads as noise).
                      style={cssVars({ '--_color': colorOf(l.source), '--_i': layout.nodes[l.source].column })}
                      data-active={litLinks.has(k) || undefined}
                      onPointerEnter={() => setHover({ kind: 'link', index: k, keyboard: false })}
                    />
                  );
                })}
              </g>
              <g className="ui-sankey-chart__nodes">
                {layout.nodes.map((n, i) => (
                  <rect
                    key={n.id}
                    className="ui-sankey-chart__node"
                    x={n.x0}
                    y={n.y0}
                    width={n.x1 - n.x0}
                    height={Math.max(1, n.y1 - n.y0)}
                    rx={capsuleRadius(tokenNumber(tokens['--ui-sankey-chart-node-radius']), Math.min(nodeWidth, n.y1 - n.y0), tokenNumber(tokens['--ui-chart-capsule']) > 0)}
                    style={cssVars({ '--_color': colorOf(i), '--_i': n.column })}
                    data-active={litNodes.has(i) || undefined}
                    onPointerEnter={(event: PointerEvent<SVGRectElement>) => {
                      // HearthPulse: a touch enters right before its tap, so remember what was shown before it.
                      press.current = { touch: event.pointerType !== 'mouse', shown: hover?.kind === 'node' ? hover.index : null };
                      setHover({ kind: 'node', index: i, keyboard: false });
                    }}
                    // HearthPulse: node links (see `onNodeClick`).
                    data-clickable={onNodeClick ? '' : undefined}
                    onClick={onNodeClick ? () => {
                      if (press.current.touch && press.current.shown !== i) return;
                      onNodeClick(nodes[n.index]);
                    } : undefined}
                  />
                ))}
              </g>
            </g>
            <g className="ui-sankey-chart__labels" aria-hidden="true">
              {nodeLabels.map((l, i) =>
                l.lines.length === 0 ? null : (
                  <text
                    key={layout.nodes[i].id}
                    className="ui-sankey-chart__label"
                    x={l.x}
                    y={l.y}
                    dy={l.lines.length > 1 ? undefined : '0.32em'}
                    textAnchor={l.anchor}
                    data-active={litNodes.has(i) || undefined}
                  >
                    {l.lines.length > 1
                      ? l.lines.map((line, k) => (
                          <tspan key={k} x={l.x} dy={k === 0 ? 4 - ((l.lines.length - 1) * LINE_H) / 2 : LINE_H}>
                            {line}
                          </tspan>
                        ))
                      : l.label}
                    {l.value && (
                      <tspan className="ui-sankey-chart__value" dx={6}>
                        {l.value}
                      </tspan>
                    )}
                  </text>
                ),
              )}
            </g>
          </svg>
        )}
        {ready && hoverNode && hover && (
          <ChartTooltip
            className="ui-chart-tooltip--plain"
            x={(hoverNode.x0 + hoverNode.x1) / 2}
            y={EDGE + hoverNode.y0}
            // Wide enough to clear the node's label on either side.
            anchorWidth={(nodeWidth / 2 + LABEL_GAP + measure(nodeLabels[hover.index].label, LABEL_FONT) + (nodeLabels[hover.index].value ? measure(nodeLabels[hover.index].value!, VALUE_FONT) + 6 : 0)) * 2 + 8}
            containerWidth={width}
            containerHeight={height}
            title={
              <span className="ui-sankey-chart__tooltip-title">
                <span className="ui-chart-tooltip__swatch" style={cssVars({ '--_color': colorOf(hover.index) })} />
                {name(hover.index)}
              </span>
            }
            rows={nodeRows(hover.index)}
          />
        )}
        {ready && hoverLink && hover && (
          <ChartTooltip
            className="ui-chart-tooltip--plain"
            placement="top"
            x={(layout.nodes[hoverLink.source].x1 + layout.nodes[hoverLink.target].x0) / 2}
            y={EDGE + (hoverLink.y0 + hoverLink.y1) / 2 - hoverLink.width / 2}
            bottom={EDGE + (hoverLink.y0 + hoverLink.y1) / 2 + hoverLink.width / 2}
            containerWidth={width}
            title={linkTitle(hover.index)}
            rows={linkRows(hover.index)}
          />
        )}
        <ChartAnnouncer text={announce} />
      </div>
      <ChartDataTable
        caption={ariaLabel}
        columns={[text.source, text.target, text.value, text.shareOfSource]}
        rows={layout.links.map((l, k) => [name(l.source), name(l.target), formatValue(l.value), linkRows(k)[1].value])}
      />
    </div>
  );
});
