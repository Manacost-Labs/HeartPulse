'use client';

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from '../primitives';
import { InboxIcon } from '../icons';
import './EmptyState.css';
import { withRef } from '../primitives/react-compat';

export interface EmptyStateProps extends Omit<ComponentPropsWithRef<'div'>, 'title'> {
  /** Shown in a tile above the title. Defaults to an inbox icon; pass `null` to hide. */
  icon?: ReactNode;
  /** Heading (an `<h3>`), e.g. "No projects yet". */
  title: ReactNode;
  /** Muted text under the title explaining the state or the next step. */
  description?: ReactNode;
  /** Main call to action, e.g. a `<Button>`. Placed after the secondary one; stacks on top when the row wraps. */
  primaryAction?: ReactNode;
  /** Less prominent action shown before the primary one, e.g. "Learn more". */
  secondaryAction?: ReactNode;
  /** Icon tile, title size and padding; `sm` fits inside tables and panels, `lg` fills a page. */
  size?: 'sm' | 'md' | 'lg';
  /** Dashed outline around the whole state, e.g. as a drop-zone-like placeholder. */
  bordered?: boolean;
}

export const EmptyState = withRef(function EmptyState({
  icon = <InboxIcon />,
  title,
  description,
  primaryAction,
  secondaryAction,
  size = 'md',
  bordered = false,
  className,
  ...rest
}: EmptyStateProps) {
  return (
    <div className={cx('ui-empty-state', className)} data-size={size} data-bordered={bordered || undefined} {...rest}>
      {icon && (
        <span className="ui-empty-state__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="ui-empty-state__text">
        <h3 className="ui-empty-state__title">{title}</h3>
        {description && <p className="ui-empty-state__description">{description}</p>}
      </div>
      {(primaryAction || secondaryAction) && (
        <div className="ui-empty-state__actions">
          {secondaryAction}
          {primaryAction}
        </div>
      )}
    </div>
  );
});
