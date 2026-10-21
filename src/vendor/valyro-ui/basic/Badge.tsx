'use client';

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from '../primitives';
import './Badge.css';
import { withRef } from '../primitives/react-compat';

export type BadgeColor = 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'pink' | 'teal' | 'inverted';
export type BadgeVariant = 'subtle' | 'solid' | 'outline';

export interface BadgeProps extends ComponentPropsWithRef<'span'> {
  /** Hue of the fill, text and dot; `inverted` uses the page foreground as the fill in every variant. */
  color?: BadgeColor;
  /** `subtle` tinted fill, `solid` saturated fill with contrasting text, `outline` transparent with a tinted border. */
  variant?: BadgeVariant;
  /** Badge height, padding and text size. */
  size?: 'sm' | 'md' | 'lg';
  /** Icon before the label. */
  icon?: ReactNode;
  /** Leading status dot in the badge color. */
  dot?: boolean;
}

export const Badge = withRef(function Badge({
  color = 'gray',
  variant = 'subtle',
  size = 'md',
  icon,
  dot = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cx('ui-badge', className)}
      data-color={color}
      data-variant={variant}
      data-size={size}
      {...rest}
    >
      {dot && <span className="ui-badge__dot" aria-hidden="true" />}
      {icon && <span className="ui-badge__icon">{icon}</span>}
      {children != null && children !== false && <span className="ui-badge__label">{children}</span>}
    </span>
  );
});
