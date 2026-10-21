'use client';

import {
  cloneElement,
  isValidElement,
  type ComponentPropsWithRef,
  type CSSProperties,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cx, Slot } from '../primitives';
import { Spinner } from './Spinner';
import '../primitives/motion.css';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  /** Solid `primary`/`accent`/`danger` fill, outlined `secondary`, transparent `ghost`, or unpadded text `link`. */
  variant?: ButtonVariant;
  /** Control height, padding and text size. */
  size?: ButtonSize;
  /** Icon or element before the label. */
  leftIcon?: ReactNode;
  /** Icon or element after the label. */
  rightIcon?: ReactNode;
  /**
   * Shows a spinner and blocks activation without changing the button's width:
   * the spinner takes the left icon's place, or covers the label when there is
   * no left icon. The button stays focusable and gets aria-busy.
   */
  loading?: boolean;
  /** Stretch to the full width of the container. */
  fullWidth?: boolean;
  /** Fully rounded ends, regardless of theme. */
  pill?: boolean;
  /** Render the single child element (e.g. an <a>) with button styling. */
  asChild?: boolean;
  /**
   * Scale under a hovering mouse, e.g. `1.05`; it springs back with a slight bounce. Off by default (the
   * theme's own hover). Skipped on touch and under reduced motion.
   */
  hoverScale?: number;
  /** Scale while pressed, e.g. `0.95`, instead of the theme's press transform; springs back on release. */
  tapScale?: number;
}

const SPINNER_SIZE: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 };

// Swallows activation while disabled/loading. Capture phase, so the element's
// own onClick never runs either.
function blockClick(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}

export function Button({
  variant = 'secondary',
  size = 'md',
  leftIcon,
  rightIcon,
  loading = false,
  fullWidth = false,
  pill = false,
  asChild = false,
  hoverScale,
  tapScale,
  disabled,
  type,
  className,
  style,
  children,
  ...rest
}: ButtonProps) {
  const hasLeftIcon = leftIcon != null && leftIcon !== false;
  const hasRightIcon = rightIcon != null && rightIcon !== false;
  const spinner = loading ? (
    <Spinner className="ui-button__spinner" size={SPINNER_SIZE[size]} label={null} />
  ) : null;

  const common = {
    className: cx('ui-button', className),
    'data-variant': variant,
    'data-size': size,
    'data-full-width': fullWidth || undefined,
    'data-pill': pill || undefined,
    // "icon" when the spinner swaps in for the left icon, "cover" when it overlays the content.
    'data-loading': loading ? (hasLeftIcon ? 'icon' : 'cover') : undefined,
    'aria-busy': loading || undefined,
    'data-scale': hoverScale != null || tapScale != null || undefined,
    style:
      hoverScale != null || tapScale != null
        ? ({ '--_hover-scale': hoverScale ?? 1, '--_tap-scale': tapScale ?? hoverScale ?? 1, ...style } as CSSProperties)
        : style,
  };

  const content = (inner: ReactNode) => (
    <>
      {hasLeftIcon && (
        <span className="ui-button__icon">
          {leftIcon}
          {spinner}
        </span>
      )}
      {inner != null && inner !== false && <span className="ui-button__label">{inner}</span>}
      {hasRightIcon && <span className="ui-button__icon">{rightIcon}</span>}
      {!hasLeftIcon && spinner}
    </>
  );

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ children?: ReactNode }>;
    const inert = disabled || loading;
    return (
      <Slot
        {...common}
        {...rest}
        aria-disabled={inert || undefined}
        tabIndex={disabled ? -1 : rest.tabIndex}
        onClickCapture={inert ? blockClick : rest.onClickCapture}
      >
        {cloneElement(child, undefined, content(child.props.children))}
      </Slot>
    );
  }

  // While loading the button keeps focus (no `disabled`), so keyboard users do not lose their place.
  return (
    <button
      {...common}
      {...rest}
      type={type ?? 'button'}
      disabled={disabled}
      aria-disabled={loading || rest['aria-disabled'] || undefined}
      onClickCapture={loading ? blockClick : rest.onClickCapture}
    >
      {content(children)}
    </button>
  );
}
