'use client';

import type { ComponentPropsWithRef, CSSProperties } from 'react';
import { cx } from '../primitives';
import './Skeleton.css';

export interface SkeletonProps extends ComponentPropsWithRef<'span'> {
  /** CSS width; a number is px. When omitted, fills the container, or equals `height` for a circle. */
  width?: CSSProperties['width'];
  /** CSS height; a number is px. When omitted, 16px; with children, the children's own height. */
  height?: CSSProperties['height'];
  /** Fully round (avatars). */
  circle?: boolean;
  /** Corner radius; a number is px. When omitted, the theme's small radius. Ignored with `circle`. */
  radius?: CSSProperties['borderRadius'];
  /** `shimmer`: a sheen sweeps across (default). `pulse`: the placeholder breathes in place. `none`: static. */
  animation?: 'shimmer' | 'pulse' | 'none';
  /**
   * With children: the placeholder takes the children's size while they are hidden, and `loaded` reveals
   * them with a short fade instead of swapping the layout.
   */
  loaded?: boolean;
}

export function Skeleton({
  width,
  height,
  circle,
  radius,
  animation = 'shimmer',
  loaded = false,
  className,
  style,
  children,
  ...rest
}: SkeletonProps) {
  const wraps = children !== undefined && children !== null;
  const h = height ?? (wraps ? undefined : 16);
  return (
    <span
      aria-hidden={wraps && loaded ? undefined : 'true'}
      className={cx('ui-skeleton', className)}
      data-animation={animation === 'shimmer' ? undefined : animation}
      data-wrap={wraps ? '' : undefined}
      data-loaded={wraps && loaded ? '' : undefined}
      style={{
        width: width ?? (circle ? h : wraps ? undefined : '100%'),
        height: h,
        borderRadius: circle ? '50%' : radius,
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}

export interface SkeletonTextProps extends ComponentPropsWithRef<'div'> {
  lines?: number;
  /** Width of the last line. */
  lastLineWidth?: CSSProperties['width'];
  /** Passed to every line; see Skeleton. */
  animation?: SkeletonProps['animation'];
}

export function SkeletonText({ lines = 3, lastLineWidth = '60%', animation, className, ...rest }: SkeletonTextProps) {
  return (
    <div aria-hidden="true" className={cx('ui-skeleton-text', className)} {...rest}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 && lines > 1 ? lastLineWidth : '100%'} animation={animation} />
      ))}
    </div>
  );
}
