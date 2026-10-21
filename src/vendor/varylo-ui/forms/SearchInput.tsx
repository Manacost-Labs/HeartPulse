'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type KeyboardEvent } from 'react';
import { SearchIcon } from '../icons';
import { composeHandlers, cx, mergeRefs, useEventCallback } from '../primitives';
import { Spinner } from '../basic/Spinner';
import { TextInput, type TextInputProps } from './TextInput';
import './SearchInput.css';

export interface SearchInputProps
  extends Omit<TextInputProps, 'type' | 'value' | 'defaultValue' | 'clearable' | 'leftIcon' | 'prefix' | 'suffix'> {
  value?: string;
  defaultValue?: string;
  /** Called as the text changes — after `debounce` ms of no typing when set; clearing is reported immediately. */
  onValueChange?: (value: string) => void;
  /** Quiet period before `onValueChange` fires, ms; 0 reports every keystroke. */
  debounce?: number;
  /** Called on Enter with the current text. */
  onSearch?: (value: string) => void;
  /** Keyboard hint shown in the field, e.g. "mod+k" (⌘K on Apple, Ctrl K elsewhere) or "/". */
  shortcut?: string;
  /** Also focus the field when `shortcut` is pressed anywhere on the page. */
  globalShortcut?: boolean;
  /** Swaps the search icon for a spinner and sets aria-busy on the input. */
  loading?: boolean;
}

interface ParsedShortcut {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.toLowerCase().split('+');
  const key = parts.pop() ?? '';
  return { key, mod: parts.includes('mod'), shift: parts.includes('shift'), alt: parts.includes('alt') };
}

const noopSubscribe = () => () => {};
const isApplePlatform = () => /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

function shortcutKeys({ key, mod, shift, alt }: ParsedShortcut, apple: boolean) {
  const keys: string[] = [];
  if (mod) keys.push(apple ? '⌘' : 'Ctrl');
  if (alt) keys.push(apple ? '⌥' : 'Alt');
  if (shift) keys.push(apple ? '⇧' : 'Shift');
  keys.push(key.length > 1 ? key[0].toUpperCase() + key.slice(1) : key.toUpperCase());
  return keys;
}

function ariaShortcut({ key, mod, shift, alt }: ParsedShortcut, apple: boolean) {
  const keys: string[] = [];
  if (mod) keys.push(apple ? 'Meta' : 'Control');
  if (alt) keys.push('Alt');
  if (shift) keys.push('Shift');
  keys.push(key.length === 1 ? key.toUpperCase() : key);
  return keys.join('+');
}

function isEditable(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/** Search field: icon, clear button, Escape to clear, Enter to search, optional debounce and ⌘K-style hotkey. */
export function SearchInput({
  value: valueProp,
  defaultValue,
  onValueChange,
  debounce = 0,
  onSearch,
  shortcut,
  globalShortcut = false,
  loading = false,
  placeholder = 'Search…',
  className,
  ref,
  onChange,
  onKeyDown,
  ...rest
}: SearchInputProps) {
  // The field shows typed text at once even when `onValueChange` (and a controlled `value`) lag behind the debounce.
  const [text, setText] = useState(valueProp ?? defaultValue ?? '');
  const [syncedValue, setSyncedValue] = useState(valueProp);
  if (valueProp !== syncedValue) {
    setSyncedValue(valueProp);
    if (valueProp !== undefined) setText(valueProp);
  }

  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number>(undefined);
  const pending = useRef<string | null>(null);
  const lastReported = useRef<string | null>(null);
  const emit = useEventCallback((next: string) => {
    lastReported.current = next;
    onValueChange?.(next);
  });
  const apple = useSyncExternalStore(noopSubscribe, isApplePlatform, () => false);
  const parsed = shortcut ? parseShortcut(shortcut) : null;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // A value set from outside (a "Clear filters" button) wins over typing that still waits for the debounce:
  // reporting that text afterwards would undo the parent's change. An echo is not such a change — the parent
  // mirroring each keystroke through onChange, or an earlier report coming back late (router, transition) —
  // so the waiting text is still reported then.
  useEffect(() => {
    if (pending.current === null || valueProp === undefined) return;
    if (valueProp === pending.current || valueProp === lastReported.current) return;
    window.clearTimeout(timer.current);
    pending.current = null;
  }, [valueProp]);

  const report = (next: string, immediate: boolean) => {
    window.clearTimeout(timer.current);
    if (immediate || debounce <= 0) {
      pending.current = null;
      emit(next);
      return;
    }
    pending.current = next;
    timer.current = window.setTimeout(() => {
      pending.current = null;
      emit(next);
    }, debounce);
  };

  useEffect(() => {
    if (!shortcut || !globalShortcut) return;
    const target = parseShortcut(shortcut);
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const modPressed = apple ? event.metaKey : event.ctrlKey;
      if (
        event.key.toLowerCase() !== target.key ||
        modPressed !== target.mod ||
        event.shiftKey !== target.shift ||
        event.altKey !== target.alt
      ) {
        return;
      }
      // A bare key like "/" must still be typeable in other fields.
      if (!target.mod && !target.alt && isEditable(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcut, globalShortcut, apple]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setText(next);
    report(next, next === '');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // IME composition (Japanese, Chinese, Korean): Enter and Escape confirm or cancel the conversion, not the field.
    // keyCode 229: Safari reports the composition's last keydown with isComposing false.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter') {
      if (pending.current !== null) report(pending.current, true);
      onSearch?.(text);
    } else if (event.key === 'Escape' && text !== '') {
      // Handled here so an enclosing dialog or popover does not also close.
      event.preventDefault();
      setText('');
      report('', true);
    }
  };

  return (
    <TextInput
      enterKeyHint="search"
      autoComplete="off"
      aria-keyshortcuts={parsed && globalShortcut ? ariaShortcut(parsed, apple) : undefined}
      aria-busy={loading || undefined}
      {...rest}
      ref={mergeRefs(inputRef, ref)}
      type="search"
      placeholder={placeholder}
      className={cx('ui-search-input', className)}
      value={text}
      onChange={composeHandlers(onChange, handleChange)}
      onKeyDown={composeHandlers(onKeyDown, handleKeyDown)}
      clearable
      leftIcon={loading ? <Spinner size={16} label={null} /> : <SearchIcon />}
      rightIcon={
        parsed && text === '' ? (
          <span className="ui-search-input__shortcut" aria-hidden="true">
            {shortcutKeys(parsed, apple).map((key) => (
              <kbd key={key} className="ui-kbd">
                {key}
              </kbd>
            ))}
          </span>
        ) : undefined
      }
    />
  );
}
