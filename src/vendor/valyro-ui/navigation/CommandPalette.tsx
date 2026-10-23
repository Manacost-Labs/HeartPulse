'use client';

import { useEffect, useMemo, useRef, useState, type ComponentPropsWithRef, type Dispatch, type KeyboardEvent, type ReactNode, type RefObject, type SetStateAction } from 'react';
import { SearchIcon } from '../icons';
import { cx, ModalLayer, useControllableState, useLatest, useListNavigation } from '../primitives';
import { usePointerMoved } from './internal';
import './CommandPalette.css';
import { withRef, useId } from '../primitives/react-compat';

export interface CommandPaletteItem {
  id: string;
  label: string;
  /** Heading the command is listed under. Groups keep the order of their first command. */
  group?: string;
  icon?: ReactNode;
  /** Extra search terms that don't appear in the label. */
  keywords?: string[];
  /** Keys shown as hints, e.g. ['⌘', 'D']. Display only; hidden on touch screens, which have no keyboard. */
  shortcut?: string[];
  /** Content after the label that is not a key hint (a badge, a count, a "Pro" tag); shown on every device. */
  trailing?: ReactNode;
  disabled?: boolean;
  onSelect?: () => void;
}

export interface CommandPaletteProps extends Omit<ComponentPropsWithRef<'div'>, 'children' | 'onSelect'> {
  /** Searchable commands, listed under their group headings and filtered by label and keywords. */
  commands: CommandPaletteItem[];
  /** Controlled open state of the modal palette. Ignored when `inline`. */
  open?: boolean;
  /** Initial open state when uncontrolled. Ignored when `inline`. */
  defaultOpen?: boolean;
  /** Called when the modal palette opens or closes. */
  onOpenChange?: (open: boolean) => void;
  /**
   * Render the palette in the page flow instead of a modal: always open, no scrim or focus trap, Escape clears
   * the query. For a command menu embedded in a page or a panel (a launcher, a search page).
   */
  inline?: boolean;
  /** Placeholder of the search field. */
  placeholder?: string;
  /** Shown when nothing matches; receives the trimmed query. */
  renderEmpty?: (query: string) => ReactNode;
  /** Overrides for the built-in English strings. */
  labels?: Partial<CommandPaletteLabels>;
}

export interface CommandPaletteLabels {
  /** Accessible name of the results list. */
  results: string;
  /** Footer hints. */
  navigate: string;
  run: string;
  close: string;
  /** Escape key cap. */
  escapeKey: string;
}

export const defaultCommandPaletteLabels: CommandPaletteLabels = {
  results: 'Commands',
  navigate: 'Navigate',
  run: 'Run',
  close: 'Close',
  escapeKey: 'esc',
};

/** Commands whose label or keywords contain every whitespace-separated term of the query. */
export function filterCommands(commands: CommandPaletteItem[], query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return commands;
  return commands.filter((command) => {
    const haystack = [command.label, ...(command.keywords ?? [])].join(' ').toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

interface CommandGroup {
  heading: string;
  commands: CommandPaletteItem[];
}

function groupCommands(commands: CommandPaletteItem[]): CommandGroup[] {
  const groups = new Map<string, CommandPaletteItem[]>();
  for (const command of commands) {
    const heading = command.group ?? '';
    const list = groups.get(heading);
    if (list) list.push(command);
    else groups.set(heading, [command]);
  }
  return Array.from(groups, ([heading, list]) => ({ heading, commands: list }));
}

/** Results in display order: grouped, so keyboard order matches what is on screen. */
function arrange(commands: CommandPaletteItem[], query: string) {
  const groups = groupCommands(filterCommands(commands, query));
  return { groups, flat: groups.flatMap((group) => group.commands) };
}

/** Toggles the palette with ⌘K (macOS) / Ctrl+K anywhere on the page. */
export function useCommandPaletteHotkey(setOpen: Dispatch<SetStateAction<boolean>>) {
  const setOpenRef = useLatest(setOpen);
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      // Modifiers first: autofill fires keydown events without a `key`.
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key?.toLowerCase() !== 'k') return;
      event.preventDefault();
      setOpenRef.current((open) => !open);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [setOpenRef]);
}

export const CommandPalette = withRef(function CommandPalette({
  commands,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  inline = false,
  placeholder = 'Type a command or search…',
  renderEmpty = (query) => (query ? `No results for “${query}”` : 'No commands'),
  labels,
  className,
  'aria-label': ariaLabel = 'Command palette',
  ...rest
}: CommandPaletteProps) {
  const [open, setOpen] = useControllableState({ value: openProp, defaultValue: defaultOpen, onChange: onOpenChange });
  const inputRef = useRef<HTMLInputElement>(null);

  if (inline) {
    return (
      <div {...rest} role="group" aria-label={ariaLabel} className={cx('ui-command-palette', className)} data-inline="">
        <PaletteBody
          commands={commands}
          placeholder={placeholder}
          renderEmpty={renderEmpty}
          labels={{ ...defaultCommandPaletteLabels, ...labels }}
          inputRef={inputRef}
        />
      </div>
    );
  }

  return (
    <ModalLayer
      {...rest}
      open={open}
      onClose={() => setOpen(false)}
      placement="top"
      initialFocusRef={inputRef}
      aria-label={ariaLabel}
      className={cx('ui-command-palette', className)}
    >
      <PaletteBody
        commands={commands}
        placeholder={placeholder}
        renderEmpty={renderEmpty}
        labels={{ ...defaultCommandPaletteLabels, ...labels }}
        inputRef={inputRef}
        onClose={() => setOpen(false)}
      />
    </ModalLayer>
  );
});

interface PaletteBodyProps {
  commands: CommandPaletteItem[];
  placeholder: string;
  renderEmpty: (query: string) => ReactNode;
  labels: CommandPaletteLabels;
  inputRef: RefObject<HTMLInputElement | null>;
  /** Closes the modal palette; absent inline, where running a command clears the query instead. */
  onClose?: () => void;
}

/* Mounted per open (ModalLayer unmounts its children when closed), so the query starts empty. */
function PaletteBody({ commands, placeholder, renderEmpty, labels, inputRef, onClose }: PaletteBodyProps) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-option-${index}`;
  const [query, setQuery] = useState('');
  const { groups, flat } = useMemo(() => arrange(commands, query), [commands, query]);
  const firstEnabled = (list: CommandPaletteItem[]) => list.findIndex((command) => !command.disabled);

  const search = (value: string) => {
    setQuery(value);
    setActiveIndex(firstEnabled(arrange(commands, value).flat));
  };

  const run = (command: CommandPaletteItem | undefined) => {
    if (!command || command.disabled) return;
    if (onClose) onClose();
    else if (query) search('');
    command.onSelect?.();
  };

  const { activeIndex, setActiveIndex, onKeyDown } = useListNavigation({
    count: flat.length,
    isDisabled: (index) => !flat[index] || !!flat[index].disabled,
    onSelect: (index) => run(flat[index]),
    initialIndex: firstEnabled(flat),
  });

  // Scrolls the list only, never the page: an inline palette below the fold must not pull the page to itself.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const option = activeIndex >= 0 ? document.getElementById(`${baseId}-option-${activeIndex}`) : null;
    if (!list || !option) return;
    const bounds = list.getBoundingClientRect();
    const rect = option.getBoundingClientRect();
    if (rect.top < bounds.top) list.scrollTop -= bounds.top - rect.top;
    else if (rect.bottom > bounds.bottom) list.scrollTop += rect.bottom - bounds.bottom;
  }, [activeIndex, baseId]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Only list keys go to the navigation; Space, Home and End keep editing the query.
    // keyCode 229: Safari reports the IME composition's last keydown with isComposing false.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter') onKeyDown(event);
    // Inline there is nothing to close: Escape clears the query instead.
    else if (event.key === 'Escape' && !onClose && query) {
      event.preventDefault();
      search('');
    }
  };

  const pointerMoved = usePointerMoved();

  let counter = -1;

  return (
    <>
      <div className="ui-command-palette__search">
        <span className="ui-field__icon">
          <SearchIcon size={18} />
        </span>
        <input
          ref={inputRef}
          className="ui-field__input ui-command-palette__input"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={placeholder}
          value={query}
          onChange={(event) => search(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {onClose && <kbd className="ui-kbd ui-command-palette__esc">{labels.escapeKey}</kbd>}
      </div>
      {/* The listbox has no items to read when nothing matches: say so in a live region instead. */}
      <div className="ui-sr-only" role="status">
        {flat.length === 0 ? renderEmpty(query.trim()) : null}
      </div>
      <div ref={listRef} id={listId} role="listbox" aria-label={labels.results} className="ui-command-palette__list">
        {flat.length === 0 ? (
          <div className="ui-command-palette__empty" role="presentation" aria-hidden="true">
            {renderEmpty(query.trim())}
          </div>
        ) : (
          groups.map((group, groupIndex) => {
            const headingId = `${baseId}-group-${groupIndex}`;
            return (
              <div
                key={group.heading}
                role="group"
                aria-labelledby={group.heading ? headingId : undefined}
                className="ui-command-palette__group"
              >
                {group.heading && (
                  <div id={headingId} className="ui-menu-label" role="presentation">
                    {group.heading}
                  </div>
                )}
                {group.commands.map((command) => {
                  const index = ++counter;
                  return (
                    <div
                      key={command.id}
                      id={optionId(index)}
                      role="option"
                      aria-selected={index === activeIndex}
                      aria-disabled={command.disabled || undefined}
                      className="ui-menu-item ui-command-palette__option"
                      data-highlighted={index === activeIndex || undefined}
                      onPointerMove={(event) => {
                        if (!pointerMoved(event)) return;
                        if (!command.disabled && index !== activeIndex) setActiveIndex(index);
                      }}
                      onClick={() => run(command)}
                    >
                      {command.icon && <span className="ui-menu-item__icon">{command.icon}</span>}
                      <span className="ui-menu-item__label">{command.label}</span>
                      {command.trailing != null && <span className="ui-command-palette__trailing">{command.trailing}</span>}
                      {command.shortcut && (
                        <span className="ui-command-palette__shortcut" aria-hidden="true">
                          {command.shortcut.map((key) => (
                            <kbd key={key} className="ui-kbd">
                              {key}
                            </kbd>
                          ))}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
      <div className="ui-command-palette__footer" aria-hidden="true">
        <span className="ui-command-palette__hint">
          <kbd className="ui-kbd">↑</kbd>
          <kbd className="ui-kbd">↓</kbd>
          {labels.navigate}
        </span>
        <span className="ui-command-palette__hint">
          <kbd className="ui-kbd">↵</kbd>
          {labels.run}
        </span>
        {onClose && (
          <span className="ui-command-palette__hint">
            <kbd className="ui-kbd">{labels.escapeKey}</kbd>
            {labels.close}
          </span>
        )}
      </div>
    </>
  );
}
