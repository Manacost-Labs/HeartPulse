'use client';

import { useRef, useState, type ComponentPropsWithRef, type ReactNode } from 'react';
import { EyeIcon, EyeOffIcon, XIcon } from '../icons';
import { cx, mergeRefs } from '../primitives';
import { useFormReset } from './form-reset';
import './TextInput.css';

export interface TextInputLabels {
  clear: string;
  /** Name of the reveal toggle; its on/off state is exposed with aria-pressed. */
  showPassword: string;
}

export const defaultTextInputLabels: TextInputLabels = {
  clear: 'Clear',
  showPassword: 'Show password',
};

export interface TextInputProps extends Omit<ComponentPropsWithRef<'input'>, 'size' | 'prefix'> {
  /** Field height and text size. */
  size?: 'sm' | 'md' | 'lg';
  /** Icon inside the field, before the text. */
  leftIcon?: ReactNode;
  /** Icon inside the field, after the text and the clear/password buttons. */
  rightIcon?: ReactNode;
  /** Attached text before the input, e.g. "https://". */
  prefix?: ReactNode;
  /** Attached text after the input, e.g. ".vercel.app". */
  suffix?: ReactNode;
  /** Error border and aria-invalid on the input (an explicit `aria-invalid` wins). */
  invalid?: boolean;
  /** Shows a clear button while the input has a value. */
  clearable?: boolean;
  /** Accessible names of the clear and show/hide password buttons. */
  labels?: Partial<TextInputLabels>;
}

/**
 * Single-line text field. `className` and `style` go to the field wrapper,
 * every other prop (including `ref`, `id`, aria-*) to the native <input>.
 * `type="password"` adds a show/hide toggle.
 */
export function TextInput({
  size = 'md',
  leftIcon,
  rightIcon,
  prefix,
  suffix,
  invalid = false,
  clearable = false,
  labels: labelsProp,
  type = 'text',
  disabled,
  readOnly,
  value,
  defaultValue,
  onChange,
  className,
  style,
  ref,
  'aria-invalid': ariaInvalid,
  ...rest
}: TextInputProps) {
  const labels = { ...defaultTextInputLabels, ...labelsProp };
  const inputRef = useRef<HTMLInputElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [innerFilled, setInnerFilled] = useState(() => String(defaultValue ?? '') !== '');
  const filled = value !== undefined ? String(value) !== '' : innerFilled;
  useFormReset(inputRef, (input) => setInnerFilled(input.value !== ''), value === undefined);
  const isPassword = type === 'password';
  const editable = !disabled && !readOnly;

  const clear = () => {
    const input = inputRef.current;
    if (!input) return;
    // The native setter + an `input` event makes React fire onChange, so controlled and uncontrolled inputs both clear.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  };

  return (
    <div
      className={cx('ui-field', 'ui-text-input', className)}
      style={style}
      data-size={size}
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      data-readonly={readOnly || undefined}
      onMouseDown={(event) => {
        // Clicks on padding, icons and addons focus the input; buttons keep their own behaviour.
        const target = event.target as Element;
        if (target === inputRef.current || target.closest('button')) return;
        event.preventDefault();
        inputRef.current?.focus();
      }}
    >
      {prefix != null && <span className="ui-text-input__addon" data-side="start">{prefix}</span>}
      {leftIcon && <span className="ui-field__icon">{leftIcon}</span>}
      <input
        aria-invalid={ariaInvalid ?? (invalid || undefined)}
        {...rest}
        ref={mergeRefs(inputRef, ref)}
        type={isPassword && revealed ? 'text' : type}
        className="ui-field__input ui-text-input__input"
        disabled={disabled}
        readOnly={readOnly}
        value={value}
        defaultValue={defaultValue}
        onChange={(event) => {
          setInnerFilled(event.target.value !== '');
          onChange?.(event);
        }}
      />
      {clearable && filled && editable && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={labels.clear}
          className="ui-text-input__action"
          data-action="clear"
          onMouseDown={(event) => event.preventDefault()}
          onClick={clear}
        >
          <XIcon size={12} strokeWidth={2.5} />
        </button>
      )}
      {isPassword && (
        <button
          type="button"
          aria-label={labels.showPassword}
          aria-pressed={revealed}
          className="ui-text-input__action"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setRevealed((r) => !r)}
        >
          {revealed ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      )}
      {rightIcon && <span className="ui-field__icon">{rightIcon}</span>}
      {suffix != null && <span className="ui-text-input__addon" data-side="end">{suffix}</span>}
    </div>
  );
}
