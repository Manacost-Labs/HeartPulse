'use client';

import { useRef, type ComponentPropsWithRef } from 'react';
import { cx, mergeRefs } from '../primitives';
import { GlowFilter } from './cartesian';
import { areaPath, barPath, linePath, scaleLinear, splitDefined, type Curve, type Point } from './scale';
import { capsuleRadius, cssVars, toNumber, useSvgId } from './utils';
import { tokenNumber, useThemeTokens } from '../theme/useThemeTokens';
import './Sparkline.css';
import { withRef } from '../primitives/react-compat';

export interface SparklineProps extends Omit<ComponentPropsWithRef<'svg'>, 'children' | 'color'> {
  /** Values in order; missing (null / NaN) values leave a gap. */
  data: (number | null)[];
  /** `line`: trend line. `area`: line over a gradient fill. `bar`: one bar per value, growing from zero. */
  variant?: 'line' | 'area' | 'bar';
  /** Default 80. */
  width?: number;
  /** Default 24. */
  height?: number;
  /** Any CSS color. Default: green when the last value is above the first, red when below. */
  color?: string;
  /** False for metrics where a decrease is good (latency, bounce rate): swaps the trend colors. Default true. */
  higherIsBetter?: boolean;
  /** Dot on the last point (line and area). */
  showDot?: boolean;
  /** `monotone` smooths the line without overshooting the data; `linear` joins points straight. Ignored for bars. */
  curve?: Curve;
  /** Accessible name. Without it the sparkline is treated as decorative. */
  ariaLabel?: string;
}

/** Tiny inline chart without axes, colored by trend. */
export const Sparkline = withRef(function Sparkline({
  data,
  variant = 'line',
  width = 80,
  height = 24,
  color,
  higherIsBetter = true,
  showDot = false,
  curve = 'monotone',
  ariaLabel,
  className,
  style,
  ref: forwardedRef,
  ...rest
}: SparklineProps) {
  const ref = useRef<SVGSVGElement>(null);
  const tokens = useThemeTokens(ref, { '--ui-chart-capsule': '0', '--ui-sparkline-bar-radius': '1px' });
  const svgId = useSvgId('ui-sparkline');
  const values = data.map(toNumber);
  const defined = values.filter((v): v is number => v != null);
  const n = values.length;
  const first = defined[0] ?? 0;
  const last = defined[defined.length - 1] ?? 0;
  const trend = last > first ? 'up' : last < first ? 'down' : 'flat';

  // Room for the stroke and the end dot so nothing is clipped at the edges.
  const pad = showDot && variant !== 'bar' ? 3 : 1.5;
  // Bars grow from zero; lines use the data's own range to show its shape.
  const extent = variant === 'bar' ? [...defined, 0] : defined;
  const lo = defined.length ? Math.min(...extent) : 0;
  const hi = defined.length ? Math.max(...extent) : 1;
  const ys = scaleLinear(variant === 'bar' && hi === lo ? [lo, lo + 1] : [lo, hi], [height - pad, pad]);

  let body = null;
  if (defined.length > 0 && variant === 'bar') {
    const step = width / n;
    const gap = step > 3 ? Math.min(2, step * 0.25) : 0;
    const w = Math.max(0.5, step - gap);
    const zero = ys(0);
    const radius = capsuleRadius(tokenNumber(tokens['--ui-sparkline-bar-radius']), w, tokenNumber(tokens['--ui-chart-capsule']) > 0);
    body = values.map((v, i) => {
      if (v == null) return null;
      const y = ys(v);
      const d = barPath(i * step + gap / 2, Math.min(y, zero), w, Math.max(Math.abs(zero - y), 1), radius, v >= 0 ? 'top' : 'bottom');
      return <path key={i} className="ui-sparkline__bar" d={d} />;
    });
  } else if (defined.length > 0) {
    const xs = scaleLinear([0, Math.max(1, n - 1)], [pad, width - pad]);
    const runs = splitDefined(values.map((v, i): Point | null => (v == null ? null : [n === 1 ? width / 2 : xs(i), ys(v)])));
    const end = runs[runs.length - 1][runs[runs.length - 1].length - 1];
    body = (
      <>
        {variant === 'area' && (
          <>
            <defs>
              <linearGradient id={`${svgId}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" className="ui-sparkline__stop" data-pos="start" />
                <stop offset="100%" className="ui-sparkline__stop" data-pos="end" />
              </linearGradient>
            </defs>
            <path
              className="ui-sparkline__area"
              fill={`url(#${svgId}-fill)`}
              d={runs.map((run) => areaPath(run, run.map(([x]) => [x, height] as const), curve)).join('')}
            />
          </>
        )}
        {/* A lone point becomes a zero-length segment, which round caps draw as a dot. */}
        <path className="ui-sparkline__line" d={runs.map((run) => linePath(run.length === 1 ? [run[0], run[0]] : run, curve)).join('')} />
        {showDot && <circle className="ui-sparkline__dot" cx={end[0]} cy={end[1]} r={2.5} />}
      </>
    );
  }

  return (
    <svg
      {...rest}
      ref={mergeRefs(ref, forwardedRef)}
      className={cx('ui-sparkline', className)}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      data-trend={color ? undefined : trend}
      data-inverted={color || higherIsBetter ? undefined : ''}
      style={{ ...cssVars({ '--_glow': `url(#${svgId}-glow)`, ...(color ? { '--_color': color } : {}) }), ...style }}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <defs>
        <GlowFilter id={`${svgId}-glow`} blur={1.5} dy={1} opacity={0.5} />
      </defs>
      {body}
    </svg>
  );
});
