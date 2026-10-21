'use client';

import {
  createElement,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { animateSpring, cx, getDirection, inlineArrowStep, Portal, useControllableState, useFlip, useLatest } from '../primitives';
import { AlertCircleIcon, CheckIcon, CopyIcon, DownloadIcon } from '../icons';
import { Button } from '../basic/Button';
import { SegmentedControl } from '../navigation/SegmentedControl';
import { useLabels } from '../agents/labels';
import { useCopyToClipboard } from '../ai/useCopyToClipboard';
import { DEFAULT_TIERS, type GameImageSource, type GameRole, type TierDef } from './game';
import { GameImage, GameRoleBadge, roleFilterOptions } from './picture';
import { gameToneColor } from './tone';
import {
  filterTierRows,
  locateTierItem,
  moveTierItemVisible,
  nearestInRow,
  rowsToPlacement,
  tierListText,
  tierRows,
  tierSlotToIndex,
  type TierPlacement,
  type TierRow,
} from './tier';
import './TierList.css';

export interface TierItem {
  id: string;
  name: string;
  /** Portrait: an image URL or a node. Without it, or when it fails to load, the initials on the role or tier colour. */
  image?: GameImageSource;
  /** Role id from `roles`: its badge sits on the portrait and the role filter finds the item by it. */
  role?: string;
  /** Read after the name and shown in the tooltip, e.g. a win rate or a build. */
  note?: string;
}

export type TierListMode = 'view' | 'edit';

export interface TierListLabels {
  title: string;
  mode: string;
  view: string;
  edit: string;
  /** Name of the role filter. */
  roleFilter: string;
  /** First option of the role filter. */
  allRoles: string;
  /** Name of the row of unranked items (edit mode). */
  pool: string;
  /** Placeholder of an empty row while editing. */
  emptyTier: string;
  /** Text of an empty tier in view mode. */
  emptyView: string;
  /** Visible hint in edit mode. */
  hint: string;
  instructions: string;
  /** e.g. "Tier A, 2 of 5". */
  position: (tier: string, position: number, total: number) => string;
  pickedUp: (item: string, position: string) => string;
  dropped: (item: string, position: string) => string;
  cancelled: (item: string, position: string) => string;
  copyText: string;
  copied: string;
  copyFailed: string;
  download: string;
  /** Screen-reader item count of a tier. */
  count: (count: number) => string;
}

const DEFAULT_LABELS: TierListLabels = {
  title: 'Tier list',
  mode: 'Mode',
  view: 'View',
  edit: 'Edit',
  roleFilter: 'Role',
  allRoles: 'All',
  pool: 'Unranked',
  emptyTier: 'Drop here',
  emptyView: 'Empty',
  hint: 'Drag with the mouse, a long press, or Space and the arrow keys',
  instructions: 'Arrow keys move between items. Space picks an item up; then arrows move it, Space drops it and Escape cancels.',
  position: (tier, position, total) => `${tier}, ${position} of ${total}`,
  pickedUp: (item, position) => `Picked up ${item}. ${position}.`,
  dropped: (item, position) => `Dropped ${item}. ${position}.`,
  cancelled: (item, position) => `Move cancelled. ${item} is back in ${position}.`,
  copyText: 'Copy as text',
  copied: 'Copied',
  copyFailed: 'Could not copy',
  download: 'Download JSON',
  count: (count) => `${count} ${count === 1 ? 'item' : 'items'}`,
};

/** Portrait sizes in px per `size`. */
const PORTRAIT = { sm: 40, md: 52, lg: 64 } as const;

export interface TierListProps extends Omit<ComponentPropsWithRef<'section'>, 'title' | 'children' | 'defaultValue' | 'role'> {
  /** Everything that can be ranked. Items in no tier wait in the unranked row. */
  items: TierItem[];
  /** Tiers from best to worst. Default S+, S, A, B, C, D. */
  tiers?: TierDef[];
  /** Roles of the items: badges on the portraits and, with two or more, a role filter. */
  roles?: GameRole[];
  /** Tier id → item ids in order. */
  value?: TierPlacement;
  /** Initial placement when uncontrolled. Default: everything unranked. */
  defaultValue?: TierPlacement;
  /** Called with the new placement after every drop. */
  onValueChange?: (value: TierPlacement) => void;
  /** Role id the list is narrowed to; `''` shows every role. */
  roleFilter?: string;
  /** Initial role filter when uncontrolled. Default `''` (every role). */
  defaultRoleFilter?: string;
  /** Called when the reader picks a role. */
  onRoleFilterChange?: (role: string) => void;
  /** `view` reads the list; `edit` drags items between tiers and shows the unranked row. */
  mode?: TierListMode;
  /** Initial mode when uncontrolled. Default `view`. */
  defaultMode?: TierListMode;
  /** Called when the reader switches the mode. */
  onModeChange?: (mode: TierListMode) => void;
  /** Shows the view / edit switch. Default true; false keeps the list read-only unless `mode` is `edit`. */
  editable?: boolean;
  /** Shows the copy-as-text and download buttons. Default true. */
  exportable?: boolean;
  /** File name of the JSON download, without the extension. Default `tier-list`. */
  exportName?: string;
  /** Portraits of 40, 52 or 64 px. Default `md`. */
  size?: 'sm' | 'md' | 'lg';
  /** Names under the portraits. Default true; without them the name is in the tooltip and read aloud. */
  showNames?: boolean;
  /** Custom tile content, e.g. a portrait with a hover card. Default: portrait, role badge and name. */
  renderItem?: (item: TierItem, mode: TierListMode) => ReactNode;
  /** Makes tiles buttons in view mode. */
  onItemClick?: (item: TierItem) => void;
  /** Heading. Default: `labels.title`. */
  title?: ReactNode;
  /** Line under the heading: patch, rank, sample. */
  caption?: ReactNode;
  /** Level of the heading (default 3). */
  headingLevel?: 2 | 3 | 4 | 5;
  labels?: Partial<TierListLabels>;
}

interface PointerDrag {
  id: string;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  /** Portrait size of the tile, so the lifted copy matches it at any container width. */
  portrait: number;
}

interface DropTarget {
  row: number;
  /** Insertion slot among the shown tiles, counted with the dragged one still in place. */
  slot: number;
}

const DRAG_THRESHOLD = 4;
const LONG_PRESS_MS = 260;

/** Slot under the pointer in a wrapping row: before the first tile that is below it or to its inline end. */
function slotFromPointer(list: HTMLElement, x: number, y: number, rtl: boolean) {
  const tiles = list.querySelectorAll<HTMLElement>('[data-tier-item]');
  for (let i = 0; i < tiles.length; i++) {
    const r = tiles[i].getBoundingClientRect();
    if (y < r.top) return i;
    if (y <= r.bottom && (rtl ? x > r.left + r.width / 2 : x < r.left + r.width / 2)) return i;
  }
  return tiles.length;
}

/** Row under a pointer y: the one containing it, else the nearest. */
function pickRow(rects: readonly DOMRect[], y: number) {
  let best = -1;
  let distance = Infinity;
  rects.forEach((rect, i) => {
    const d = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    if (d < distance) {
      best = i;
      distance = d;
    }
  });
  return best;
}

/**
 * Rank champions, heroes or items in tiers S+ to D on a colour scale. Portraits carry a role badge and a role filter
 * narrows the list. View mode reads as a labelled list per tier; edit mode drags tiles between tiers with the
 * mouse, a long press on touch, or the keyboard (Space to pick up, arrows to move, Space to drop), with every move
 * announced. While dragging, a lifted copy follows the pointer, the target tier lights up and its tiles part to
 * show where the tile lands. The result copies as text or downloads as JSON.
 */
export function TierList({
  items,
  tiers = DEFAULT_TIERS,
  roles,
  value: valueProp,
  defaultValue = {},
  onValueChange,
  roleFilter: roleFilterProp,
  defaultRoleFilter = '',
  onRoleFilterChange,
  mode: modeProp,
  defaultMode = 'view',
  onModeChange,
  editable = true,
  exportable = true,
  exportName = 'tier-list',
  size = 'md',
  showNames = true,
  renderItem,
  onItemClick,
  title,
  caption,
  headingLevel = 3,
  labels,
  className,
  style,
  onBlur,
  ref,
  ...rest
}: TierListProps) {
  const copy = useLabels(DEFAULT_LABELS, labels);
  const uid = useId();
  const [placement, setPlacement] = useControllableState<TierPlacement>({ value: valueProp, defaultValue, onChange: onValueChange });
  const [mode, setModeState] = useControllableState<TierListMode>({ value: modeProp, defaultValue: defaultMode, onChange: onModeChange });
  const [roleFilterState, setRoleFilterState] = useControllableState({ value: roleFilterProp, defaultValue: defaultRoleFilter, onChange: onRoleFilterChange });
  const editing = mode === 'edit';
  const tierIds = useMemo(() => tiers.map((t) => t.id), [tiers]);
  const itemIds = useMemo(() => items.map((i) => i.id), [items]);
  const tierById = useMemo(() => new Map(tiers.map((t) => [t.id, t])), [tiers]);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const roleById = useMemo(() => new Map((roles ?? []).map((r) => [r.id, r])), [roles]);
  const rows = useMemo(() => tierRows(tierIds, itemIds, placement), [tierIds, itemIds, placement]);
  const roleFilter = roleFilterState && roleById.has(roleFilterState) ? roleFilterState : '';
  const filtering = roleFilter !== '';
  const visible = useMemo(() => (filtering ? (id: string) => itemById.get(id)?.role === roleFilter : () => true), [filtering, itemById, roleFilter]);

  const [grab, setGrab] = useState<{ id: string; preview: TierRow[] } | null>(null);
  const [drag, setDrag] = useState<PointerDrag | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [justDropped, setJustDropped] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const { state: copyState, copy: copyText } = useCopyToClipboard();

  const rowsRef = useRef<HTMLDivElement>(null);
  const listRefs = useRef(new Map<number, HTMLElement>());
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const overlayRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const pendingFocus = useRef<string | null>(null);
  const dragCleanup = useRef<(() => void) | null>(null);
  /** Where the lifted copy was when it was let go: the dropped tile settles from there. */
  const settleFrom = useRef<{ id: string; rect: DOMRect } | null>(null);
  const capture = useFlip(rowsRef, { spring: 'snappy' });
  const latest = useLatest({ rows, dropTarget, copy, capture, visible });

  const shown = useMemo(() => filterTierRows(grab?.preview ?? rows, visible), [grab, rows, visible]);
  const visibleRows = editing ? shown : shown.slice(0, -1);
  const rowName = (row: TierRow) => (row.tier === null ? copy.pool : (tierById.get(row.tier)?.label ?? row.tier));
  const itemName = (id: string) => itemById.get(id)?.name ?? id;
  /** Position text as the reader sees it: within the shown (filtered) tiles. */
  const describe = (list: readonly TierRow[], id: string) => {
    const seen = filterTierRows(list, visible);
    const at = locateTierItem(seen, id);
    if (!at) return '';
    return copy.position(rowName(seen[at.row]), at.index + 1, seen[at.row].items.length);
  };
  const tabStop = focusId && locateTierItem(shown, focusId) ? focusId : (shown.find((r) => r.items.length)?.items[0] ?? null);

  const setMode = (next: TierListMode) => {
    capture();
    setModeState(next);
  };

  const setRoleFilter = (next: string) => {
    capture();
    setGrab(null);
    setRoleFilterState(next);
  };

  // A tile that moves to another row remounts there, so focus has to follow it.
  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    const node = itemRefs.current.get(id);
    if (node && document.activeElement !== node) node.focus();
  });

  // The dropped tile glides from the lifted copy into its slot (after useFlip has laid out the others).
  useLayoutEffect(() => {
    const settle = settleFrom.current;
    if (!settle) return;
    settleFrom.current = null;
    const node = itemRefs.current.get(settle.id);
    if (!node || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    for (const running of node.getAnimations()) running.cancel();
    const rect = node.getBoundingClientRect();
    const dx = settle.rect.left + settle.rect.width / 2 - (rect.left + rect.width / 2);
    const dy = settle.rect.top + settle.rect.height / 2 - (rect.top + rect.height / 2);
    animateSpring(node, { translate: [`${dx}px ${dy}px`, '0px 0px'], scale: ['1.06', '1'] }, 'snappy');
  });

  useEffect(() => () => dragCleanup.current?.(), []);

  useEffect(() => {
    if (!justDropped) return;
    const timer = window.setTimeout(() => setJustDropped(null), 700);
    return () => window.clearTimeout(timer);
  }, [justDropped]);

  // Leaving edit mode drops any half-finished keyboard move.
  useEffect(() => {
    if (!editing) setGrab(null);
  }, [editing]);

  const commit = (next: TierRow[]) => {
    capture();
    setPlacement(rowsToPlacement(next));
  };

  /* ── Pointer drag: a lifted copy follows the pointer; the tile stays behind as a ghost ── */

  useEffect(() => {
    if (!drag) return;
    let frame = 0;
    const tick = () => {
      const { x, y } = pointer.current;
      const overlay = overlayRef.current;
      if (overlay) overlay.style.transform = `translate3d(${x - drag.offsetX}px, ${y - drag.offsetY}px, 0)`;
      const indexes = [...listRefs.current.keys()].sort((a, b) => a - b);
      const nodes = indexes.map((i) => listRefs.current.get(i)!);
      const at = pickRow(
        nodes.map((n) => (n.closest('[data-tier-row]') ?? n).getBoundingClientRect()),
        y,
      );
      const next = at === -1 ? null : { row: indexes[at], slot: slotFromPointer(nodes[at], x, y, getDirection(nodes[at]) === 'rtl') };
      const prev = latest.current.dropTarget;
      if (prev?.row !== next?.row || prev?.slot !== next?.slot) {
        // Tiles slide to open (or close) the gap where the tile would land.
        latest.current.capture();
        setDropTarget(next);
      }
      const edge = 48;
      if (y < edge) window.scrollBy(0, -12);
      else if (y > window.innerHeight - edge) window.scrollBy(0, 12);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [drag, latest]);

  const onTilePointerDown = (event: ReactPointerEvent<HTMLLIElement>, id: string) => {
    if (!editing || grab || drag || event.button !== 0 || !event.isPrimary) return;
    if ((event.target as HTMLElement).closest('a, button, input, textarea, select')) return;
    const node = event.currentTarget;
    const start = { x: event.clientX, y: event.clientY };
    const isTouch = event.pointerType === 'touch';
    let started = false;
    let pressTimer = 0;

    const begin = () => {
      started = true;
      const rect = node.getBoundingClientRect();
      setFocusId(id);
      const portrait = node.querySelector('.ui-game-image')?.getBoundingClientRect().width || PORTRAIT[size];
      setDrag({ id, width: rect.width, height: rect.height, offsetX: start.x - rect.left, offsetY: start.y - rect.top, portrait });
    };
    const cleanup = () => {
      window.clearTimeout(pressTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('touchmove', onTouchMove);
      dragCleanup.current = null;
    };
    const finish = (drop: boolean) => {
      cleanup();
      if (!started) return;
      const { rows: current, dropTarget: target, copy: text, capture: snap, visible: keep } = latest.current;
      const lifted = overlayRef.current?.firstElementChild?.getBoundingClientRect();
      snap();
      setDrag(null);
      setDropTarget(null);
      if (!drop || !target) return;
      const seen = filterTierRows(current, keep);
      const from = locateTierItem(seen, id);
      const next = moveTierItemVisible(current, id, target.row, tierSlotToIndex(target.slot, from, target.row), keep);
      if (next === current) return;
      if (lifted) settleFrom.current = { id, rect: lifted };
      setPlacement(rowsToPlacement(next));
      setJustDropped(id);
      const nextSeen = filterTierRows(next, keep);
      const at = locateTierItem(nextSeen, id);
      if (at) {
        const row = nextSeen[at.row];
        const name = row.tier === null ? text.pool : (tierById.get(row.tier)?.label ?? row.tier);
        setAnnouncement(text.dropped(itemById.get(id)?.name ?? id, text.position(name, at.index + 1, row.items.length)));
      }
    };
    function onMove(e: PointerEvent) {
      if (e.pointerId !== event.pointerId) return;
      pointer.current = { x: e.clientX, y: e.clientY };
      if (started) return;
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (isTouch) {
        if (moved > 8) cleanup();
      } else if (moved > DRAG_THRESHOLD) begin();
    }
    function onUp(e: PointerEvent) {
      if (e.pointerId === event.pointerId) finish(true);
    }
    function onCancel(e: PointerEvent) {
      if (e.pointerId === event.pointerId) finish(false);
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== 'Escape' || !started) return;
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    }
    function onTouchMove(e: TouchEvent) {
      if (started && e.cancelable) e.preventDefault();
    }

    pointer.current = start;
    dragCleanup.current = cleanup;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
    if (isTouch) {
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      pressTimer = window.setTimeout(begin, LONG_PRESS_MS);
    }
  };

  /* ── Keyboard: arrows move focus; Space picks up, arrows move the item, Space drops, Escape cancels ── */

  const focusItem = (id: string | null) => {
    if (!id) return;
    setFocusId(id);
    pendingFocus.current = id;
  };

  const onTileKeyDown = (event: KeyboardEvent<HTMLLIElement>, id: string) => {
    if (event.target !== event.currentTarget || drag) return;
    const at = locateTierItem(shown, id);
    if (!at) return;
    const step = inlineArrowStep(event.key, getDirection(event.currentTarget));

    if (!grab) {
      let target: string | null = null;
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        setGrab({ id, preview: rows });
        setAnnouncement(copy.pickedUp(itemName(id), describe(rows, id)));
        return;
      }
      if (step) target = shown[at.row].items[at.index + step] ?? null;
      else if (event.key === 'Home') target = shown[at.row].items[0];
      else if (event.key === 'End') target = shown[at.row].items.at(-1) ?? null;
      else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const dir = event.key === 'ArrowUp' ? -1 : 1;
        for (let r = at.row + dir; r >= 0 && r < shown.length && !target; r += dir) target = nearestInRow(shown, r, at.index);
      } else return;
      event.preventDefault();
      focusItem(target);
      return;
    }
    if (grab.id !== id) return;

    const { preview } = grab;
    let next = preview;
    if (step) next = moveTierItemVisible(preview, id, at.row, at.index + step, visible);
    else if (event.key === 'ArrowUp' && at.row > 0) next = moveTierItemVisible(preview, id, at.row - 1, at.index, visible);
    else if (event.key === 'ArrowDown' && at.row < shown.length - 1) next = moveTierItemVisible(preview, id, at.row + 1, at.index, visible);
    else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      pendingFocus.current = id;
      // Apply the move to the list as it is now, so changes made meanwhile stay.
      const dropped = moveTierItemVisible(rows, id, at.row, at.index, visible);
      commit(dropped);
      setGrab(null);
      setJustDropped(id);
      setAnnouncement(copy.dropped(itemName(id), describe(dropped, id)));
      return;
    } else if (event.key === 'Escape') {
      event.preventDefault();
      pendingFocus.current = id;
      capture();
      setGrab(null);
      setAnnouncement(copy.cancelled(itemName(id), describe(rows, id)));
      return;
    } else if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;

    event.preventDefault();
    if (next === preview) return;
    pendingFocus.current = id;
    capture();
    setGrab({ id, preview: next });
    setAnnouncement(describe(next, id));
    requestAnimationFrame(() => itemRefs.current.get(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  };

  const cancelGrab = () => {
    if (!grab) return;
    capture();
    setGrab(null);
    setAnnouncement(copy.cancelled(itemName(grab.id), describe(rows, grab.id)));
  };

  const download = () => {
    const data = {
      tiers: rows
        .filter((row) => row.tier !== null)
        .map((row) => ({ id: row.tier, label: rowName(row), items: row.items.map((id) => ({ id, name: itemName(id), role: itemById.get(id)?.role })) })),
      unranked: rows.at(-1)!.items.map((id) => ({ id, name: itemName(id), role: itemById.get(id)?.role })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${exportName}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const isNoopSlot = (row: number, slot: number) => {
    const at = drag ? locateTierItem(shown, drag.id) : null;
    return !!at && at.row === row && (slot === at.index || slot === at.index + 1);
  };

  const tooltip = (item: TierItem) => {
    const role = item.role ? roleById.get(item.role) : undefined;
    return [item.name, role?.label, item.note].filter(Boolean).join(' · ');
  };

  const content = (item: TierItem, tier: TierDef | null | undefined) => {
    if (renderItem) return renderItem(item, mode);
    const role = item.role ? roleById.get(item.role) : undefined;
    return (
      <>
        <span className="ui-tier-list__portrait">
          <GameImage src={item.image} name={item.name} color={role?.color ?? tier?.color} size={PORTRAIT[size]} />
          {role && !filtering && <GameRoleBadge role={role} className="ui-tier-list__role" />}
        </span>
        <span className={showNames ? 'ui-tier-list__name' : 'ui-sr-only'}>{item.name}</span>
        {(role || item.note) && <span className="ui-sr-only">{[role?.label, item.note].filter(Boolean).map((part) => `, ${part}`).join('')}</span>}
      </>
    );
  };

  const heading = createElement(`h${headingLevel}`, { className: 'ui-tier-list__title', id: `${uid}-title` }, title ?? copy.title);
  const dragged = drag ? itemById.get(drag.id) : undefined;
  const draggedTier = dragged ? locateTierItem(rows, dragged.id) : null;
  const ranked = rows.slice(0, -1).reduce((sum, row) => sum + row.items.length, 0);
  const showRoles = !!roles && roles.length > 1;

  return (
    <section
      ref={ref}
      className={cx('ui-tier-list', 'ui-panel', className)}
      aria-labelledby={`${uid}-title`}
      data-mode={mode}
      data-size={size}
      data-names={showNames || undefined}
      data-grabbing={grab ? true : undefined}
      data-dragging={drag ? true : undefined}
      style={{ '--ui-game-image-size': `${PORTRAIT[size]}px`, ...style } as CSSProperties}
      onBlur={(event) => {
        onBlur?.(event);
        if (!grab) return;
        const root = event.currentTarget;
        // Checked a frame later: a tile remounting in another row blurs briefly before refocusing.
        requestAnimationFrame(() => {
          if (root.isConnected && !root.contains(document.activeElement)) cancelGrab();
        });
      }}
      {...rest}
    >
      <header className="ui-tier-list__header">
        <div className="ui-tier-list__heading">
          {heading}
          {caption && <p className="ui-tier-list__caption">{caption}</p>}
        </div>
        <div className="ui-tier-list__tools">
          {editable && (
            <SegmentedControl
              size="sm"
              aria-label={copy.mode}
              value={mode}
              onValueChange={(next) => setMode(next as TierListMode)}
              options={[
                { value: 'view', label: copy.view },
                { value: 'edit', label: copy.edit },
              ]}
            />
          )}
          {exportable && (
            <>
              <Button
                size="sm"
                variant="ghost"
                aria-label={copyState === 'copied' ? copy.copied : copyState === 'error' ? copy.copyFailed : copy.copyText}
                leftIcon={copyState === 'copied' ? <CheckIcon aria-hidden="true" /> : copyState === 'error' ? <AlertCircleIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
                onClick={() => void copyText(tierListText(rows, (tier) => tierById.get(tier)?.label ?? tier, itemName))}
              >
                <span className="ui-tier-list__tool-label">{copyState === 'copied' ? copy.copied : copyState === 'error' ? copy.copyFailed : copy.copyText}</span>
              </Button>
              <Button size="sm" variant="ghost" aria-label={copy.download} leftIcon={<DownloadIcon aria-hidden="true" />} onClick={download}>
                <span className="ui-tier-list__tool-label">{copy.download}</span>
              </Button>
            </>
          )}
        </div>
      </header>

      {(showRoles || editing) && (
        <div className="ui-tier-list__bar">
          {showRoles && (
            <SegmentedControl
              size="sm"
              className="ui-tier-list__roles"
              aria-label={copy.roleFilter}
              value={roleFilter}
              onValueChange={setRoleFilter}
              options={roleFilterOptions(roles!, copy.allRoles)}
            />
          )}
          {editing && (
            <p className="ui-tier-list__hint" aria-hidden="true">
              {copy.hint}
            </p>
          )}
        </div>
      )}

      <div className="ui-tier-list__rows" ref={rowsRef} data-ranked={ranked}>
        {visibleRows.map((row, rowIndex) => {
          const tier = row.tier === null ? null : tierById.get(row.tier);
          const labelId = `${uid}-row-${rowIndex}`;
          const over = dropTarget?.row === rowIndex;
          const target = over && !isNoopSlot(rowIndex, dropTarget.slot) ? dropTarget : null;
          const label = rowName(row);
          const slot = (
            <li
              key="\u0000slot"
              className="ui-tier-list__slot"
              data-flip-id={`\u0000slot-${rowIndex}`}
              aria-hidden="true"
              style={drag ? { inlineSize: drag.width, blockSize: drag.height } : undefined}
            />
          );
          return (
            <div
              key={row.tier ?? '\u0000pool'}
              className="ui-tier-list__row"
              data-tier-row=""
              data-pool={row.tier === null || undefined}
              data-over={over || undefined}
              style={tier ? ({ '--_tier': gameToneColor(tier.color ?? 'gray') } as CSSProperties) : undefined}
            >
              <div className="ui-tier-list__label" id={labelId}>
                <span className={row.tier === null ? 'ui-tier-list__pool' : 'ui-game-tier ui-tier-list__chip'} data-long={label.length > 3 || undefined}>
                  {label}
                </span>
                {tier?.description && <span className="ui-tier-list__description">{tier.description}</span>}
                <span className="ui-sr-only">{`, ${copy.count(row.items.length)}`}</span>
              </div>
              <ul
                ref={(node) => {
                  if (!node) return;
                  listRefs.current.set(rowIndex, node);
                  return () => {
                    if (listRefs.current.get(rowIndex) === node) listRefs.current.delete(rowIndex);
                  };
                }}
                className="ui-tier-list__items"
                aria-labelledby={labelId}
              >
                {row.items.map((id, index) => {
                  const item = itemById.get(id)!;
                  if (!editing) {
                    return (
                      <li key={id} className="ui-tier-list__item" data-flip-id={id}>
                        {onItemClick ? (
                          <button type="button" className="ui-tier-list__tile" title={tooltip(item)} onClick={() => onItemClick(item)}>
                            {content(item, tier)}
                          </button>
                        ) : (
                          <span className="ui-tier-list__tile" title={tooltip(item)}>
                            {content(item, tier)}
                          </span>
                        )}
                      </li>
                    );
                  }
                  return [
                    target?.slot === index ? slot : null,
                    <li
                      key={id}
                      ref={(node) => {
                        if (!node) return;
                        itemRefs.current.set(id, node);
                        return () => {
                          if (itemRefs.current.get(id) === node) itemRefs.current.delete(id);
                        };
                      }}
                      className="ui-tier-list__item ui-tier-list__tile"
                      data-flip-id={id}
                      data-tier-item=""
                      data-dragging={drag?.id === id || undefined}
                      data-grabbed={grab?.id === id || undefined}
                      data-dropped={justDropped === id || undefined}
                      title={tooltip(item)}
                      tabIndex={id === tabStop ? 0 : -1}
                      aria-describedby={`${uid}-instructions`}
                      onPointerDown={(event) => onTilePointerDown(event, id)}
                      onKeyDown={(event) => onTileKeyDown(event, id)}
                      onFocus={(event) => {
                        if (event.target !== event.currentTarget) return;
                        setFocusId(id);
                        if (grab && grab.id !== id) cancelGrab();
                      }}
                    >
                      {content(item, tier)}
                    </li>,
                  ];
                })}
                {editing && target && target.slot >= row.items.length && row.items.length > 0 && slot}
                {row.items.length === 0 &&
                  (editing && target ? (
                    slot
                  ) : (
                    <li className="ui-tier-list__placeholder" data-active={over || undefined}>
                      {editing ? copy.emptyTier : copy.emptyView}
                    </li>
                  ))}
              </ul>
            </div>
          );
        })}
      </div>

      {drag && dragged && (
        <Portal>
          <div
            ref={(node) => {
              if (node) node.style.transform = `translate3d(${pointer.current.x - drag.offsetX}px, ${pointer.current.y - drag.offsetY}px, 0)`;
              overlayRef.current = node;
            }}
            className="ui-tier-list__overlay"
            data-size={size}
            data-names={showNames || undefined}
            style={{ width: drag.width, height: drag.height, '--ui-game-image-size': `${drag.portrait}px` } as CSSProperties}
            aria-hidden="true"
          >
            <div className="ui-tier-list__tile ui-tier-list__tile--lifted">
              {content(dragged, draggedTier ? tierById.get(rows[draggedTier.row].tier ?? '') : null)}
            </div>
          </div>
        </Portal>
      )}

      <p id={`${uid}-instructions`} className="ui-sr-only">
        {copy.instructions}
      </p>
      <div className="ui-sr-only" aria-live="assertive" aria-atomic="true">
        {announcement}
      </div>
    </section>
  );
}
