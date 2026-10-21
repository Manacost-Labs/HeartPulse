'use client';

import type { ComponentPropsWithRef } from 'react';
import { cx } from '../primitives';
import './Spinner.css';

export interface SpinnerProps extends ComponentPropsWithRef<'span'> {
  /** Pixel size. Default 16. */
  size?: number;
  /** Accessible label; pass `null` when the spinner is decorative (e.g. inside a busy button). */
  label?: string | null;
}

const SPOKES = 12;

/** 12-spoke activity indicator — the shape both Geist and Apple use. */
export function Spinner({ size = 16, label = 'Loading', className, style, ...rest }: SpinnerProps) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      className={cx('ui-spinner', className)}
      style={{ width: size, height: size, ...style }}
      {...rest}
    >
      {Array.from({ length: SPOKES }, (_, i) => (
        <span
          key={i}
          className="ui-spinner__spoke"
          style={{
            transform: `rotate(${i * (360 / SPOKES)}deg) translateY(-140%)`,
            animationDelay: `${-1.2 + i * 0.1}s`,
          }}
        />
      ))}
    </span>
  );
}
