'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentPropsWithRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { cx } from '../primitives';
import { announce } from '../primitives/liveAnnouncer';
import { collectionPart, partsOf } from '../primitives/compound';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  InboxIcon,
  MinusIcon,
  SearchIcon,
} from '../icons';
import { useLocale } from '../theme/ThemeProvider';
import { IconButton } from '../basic/IconButton';
import { Skeleton } from '../basic/Skeleton';
import { EmptyState } from './EmptyState';
import {
  ARIA_SORT,
  createValueFormatter,
  getCellValue,
  getVirtualWindow,
  selectRange,
  toSearchText,
  windowRuns,
  type SortDirection,
  type SortState,
} from './data-table';
import { useDataTable, type DataTableEntry } from './useDataTable';
import './DataTable.css';
import { withRef, useLayoutEffect } from '../primitives/react-compat';

export interface DataTableColumn<T> {
  /** Identifies the column; also the row field read when there is no `accessor`. */
  key: string;
  header: ReactNode;
  /** Computes the column value (for sorting, search and the default cell) instead of reading `row[key]`. */
  accessor?: (row: T) => unknown;
  /** Custom cell content; defaults to the value formatted for `locale`. */
  cell?: (row: T) => ReactNode;
  /**
   * Text matched by the search field. Defaults to the formatted value; set it when `cell`
   * shows something else (e.g. "2 minutes ago" for a date). Return '' to exclude the column.
   */
  getSearchValue?: (row: T) => string;
  sortable?: boolean;
  /** `left`/`right` are the start/end edges: they swap under dir="rtl", like the rest of the layout. */
  align?: 'left' | 'center' | 'right';
  width?: CSSProperties['width'];
}

export interface DataTableLabels {
  /** Accessible name of the search field. */
  search: (tableLabel: string | undefined) => string;
  searchPlaceholder: string;
  selectAll: string;
  /** Row checkbox name; `name` is the row's first-column text when it has one. */
  selectRow: (name: string | null) => string;
  selected: (count: number, total: number) => string;
  /** Read to screen readers when the sort changes; `column` is the header text, `direction` null when unsorted. */
  sorted: (column: string, direction: SortDirection | null) => string;
  range: (start: number, end: number, total: number) => string;
  rows: (count: number) => string;
  page: (page: number, pageCount: number) => string;
  previousPage: string;
  nextPage: string;
  empty: string;
  noResults: string;
  noResultsDescription: (query: string) => string;
  /** Default cell text for boolean values. */
  yes: string;
  no: string;
}

export interface DataTableProps<T extends object> extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** All rows; search, sorting and pagination run on this array in the browser. Or rows as children (see `children`). */
  data?: readonly T[];
  /** Column definitions: header, value accessor, cell renderer, sorting, alignment and width. */
  columns?: readonly DataTableColumn<T>[];
  /**
   * The compound form instead of `data` and `columns`: a `DataTable.Header` of `DataTable.Column`s and a
   * `DataTable.Body` of `DataTable.Row`s with a `DataTable.Cell` per column. Search, sorting and selection work on
   * the cells' `value` (or their text); `onRowClick` gets a DataTableRowData.
   */
  children?: ReactNode;
  /** Stable id for selection and keys. Defaults to `row.id`, then the row's index in `data`. */
  getRowId?: (row: T, index: number) => string;
  /** Accessible name of the table. */
  label?: string;
  /** Shows a search field that filters rows across all columns. */
  searchable?: boolean;
  /** Rows per page. Omit to show every row. */
  pageSize?: number;
  sort?: SortState | null;
  defaultSort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  /** Adds a checkbox column. */
  selectable?: boolean;
  selected?: string[];
  defaultSelected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  /** Makes rows clickable and focusable; Enter on a focused row calls it too. */
  onRowClick?: (row: T) => void;
  /** Skeleton rows (`pageSize` or 5) replace the body, and the select-all and paging buttons are disabled. */
  loading?: boolean;
  /** Row height and text size: `compact` has tighter cells and smaller text. */
  density?: 'comfortable' | 'compact';
  /** Limits the height; the body scrolls under a pinned header. */
  maxHeight?: CSSProperties['maxHeight'];
  /**
   * Renders only the rows scrolled into view, for thousands of rows without pagination.
   * Needs `maxHeight`; rows should share one height (the first rendered row is measured).
   */
  virtualize?: boolean;
  /** Keeps the first column (and the checkbox column) in view while scrolling sideways. */
  stickyFirstColumn?: boolean;
  /** Replaces the default empty state. */
  empty?: ReactNode;
  /** Locale for default number/date cells and counters. Defaults to the `ThemeProvider` locale, then the browser's. */
  locale?: string;
  labels?: Partial<DataTableLabels>;
}

function defaultLabels(n: (value: number) => string): DataTableLabels {
  return {
    search: (tableLabel) => (tableLabel ? `Search ${tableLabel}` : 'Search'),
    searchPlaceholder: 'Search…',
    selectAll: 'Select all rows on this page',
    selectRow: (name) => (name ? `Select ${name}` : 'Select row'),
    selected: (count, total) => `${n(count)} of ${n(total)} selected`,
    sorted: (column, direction) =>
      `${column}, ${direction === 'asc' ? 'sorted ascending' : direction === 'desc' ? 'sorted descending' : 'not sorted'}`,
    range: (start, end, total) => `${n(start)}–${n(end)} of ${n(total)}`,
    rows: (count) => `${n(count)} ${count === 1 ? 'row' : 'rows'}`,
    page: (page, pageCount) => `Page ${n(page)} of ${n(pageCount)}`,
    previousPage: 'Previous page',
    nextPage: 'Next page',
    empty: 'No data yet',
    noResults: 'No results',
    noResultsDescription: (query) => `Nothing matches “${query}”.`,
    yes: 'Yes',
    no: 'No',
  };
}

const SKELETON_WIDTHS = ['72%', '48%', '60%', '36%', '54%'];

/** Estimated body row height until the first rendered row is measured. */
const ESTIMATED_ROW_HEIGHT = 45;

/**
 * Tracks whether the viewport is scrolled sideways (to show the pinned-column edge) and its width;
 * with `trackY`, also the vertical scroll position and height (for virtualized rows).
 */
function useScrollViewport(trackY: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  // More columns past the end edge: the container shows a shadow there, so a phone user sees it scrolls.
  const [more, setMore] = useState(false);
  const [width, setWidth] = useState<number | null>(null);
  const [y, setY] = useState({ top: 0, height: 0 });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      // Math.abs: scrollLeft is negative in right-to-left layouts.
      setScrolled(Math.abs(node.scrollLeft) > 0);
      setMore(node.scrollWidth - node.clientWidth - Math.abs(node.scrollLeft) > 1);
      setWidth(node.clientWidth);
      if (trackY) {
        const next = { top: node.scrollTop, height: node.clientHeight };
        setY((prev) => (prev.top === next.top && prev.height === next.height ? prev : next));
      }
    };
    update();
    node.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    // The table growing wider (a new page, a search) changes what is past the end edge too.
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return () => {
      node.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [trackY]);
  return { ref, scrolled, more, width, y };
}

export interface DataTableHeaderProps {
  /** The `DataTable.Column` elements, in order. */
  children?: ReactNode;
}

export interface DataTableColumnPartProps extends Pick<DataTableColumn<object>, 'sortable' | 'align' | 'width'> {
  /** Column key (default: its position). */
  id?: string;
  /** Header content. */
  children?: ReactNode;
}

export interface DataTableBodyProps {
  /** The `DataTable.Row` elements. */
  children?: ReactNode;
}

export interface DataTableRowProps {
  /** Stable id for selection and keys (default: the row's position). */
  id?: string;
  /** One `DataTable.Cell` per column. */
  children?: ReactNode;
}

export interface DataTableCellProps {
  /** Value for sorting, search and the default empty cell; defaults to the children when they are text or a number. */
  value?: unknown;
  /** Cell content. */
  children?: ReactNode;
}

/** A row of the compound form, as `onRowClick` receives it. */
export interface DataTableRowData {
  id: string;
  /** Sort and search value of each cell, by column. */
  values: unknown[];
  cells: ReactNode[];
}

/** The header row (`DataTable.Header`). */
export const DataTableHeader = collectionPart<DataTableHeaderProps>('DataTable.Header');
/** A column header (`DataTable.Column`; DataTableColumn is the type of a `columns` entry). */
export const DataTableColumnPart = collectionPart<DataTableColumnPartProps>('DataTable.Column');
/** The rows (`DataTable.Body`). */
export const DataTableBody = collectionPart<DataTableBodyProps>('DataTable.Body');
/** A row (`DataTable.Row`). */
export const DataTableRow = collectionPart<DataTableRowProps>('DataTable.Row');
/** A cell (`DataTable.Cell`). */
export const DataTableCell = collectionPart<DataTableCellProps>('DataTable.Cell');

/** Columns and rows of the compound form, in the shape the `columns` / `data` props take. */
function tableFromParts(children: ReactNode) {
  const header = partsOf<DataTableHeaderProps>(children, DataTableHeader)[0];
  const body = partsOf<DataTableBodyProps>(children, DataTableBody)[0];
  const columns: DataTableColumn<DataTableRowData>[] = partsOf<DataTableColumnPartProps>(header?.props.children, DataTableColumnPart).map(
    ({ props: { id, children: title, ...column } }, index) => ({
      ...column,
      key: id ?? String(index),
      header: title,
      accessor: (row) => row.values[index],
      cell: (row) => row.cells[index],
      getSearchValue: (row) => String(row.values[index] ?? ''),
    }),
  );
  const data = partsOf<DataTableRowProps>(body?.props.children, DataTableRow).map(({ props }, index): DataTableRowData => {
    const cells = partsOf<DataTableCellProps>(props.children, DataTableCell).map((cell) => cell.props);
    return {
      id: props.id ?? String(index),
      values: cells.map((cell) => (cell.value !== undefined ? cell.value : typeof cell.children === 'string' || typeof cell.children === 'number' ? cell.children : undefined)),
      cells: cells.map((cell) => cell.children),
    };
  });
  return { columns, data };
}

export const DataTable = withRef(function DataTable<T extends object>({
  data: dataProp,
  columns: columnsProp,
  children,
  getRowId,
  label,
  searchable = false,
  pageSize,
  sort: sortProp,
  defaultSort = null,
  onSortChange,
  selectable = false,
  selected: selectedProp,
  defaultSelected = [],
  onSelectedChange,
  onRowClick,
  loading = false,
  density = 'comfortable',
  maxHeight,
  virtualize = false,
  stickyFirstColumn = true,
  empty,
  locale: localeProp,
  labels: labelsProp,
  className,
  ...rest
}: DataTableProps<T>) {
  const parts = useMemo(() => (dataProp && columnsProp ? null : tableFromParts(children)), [dataProp, columnsProp, children]);
  const data = (dataProp ?? parts?.data ?? []) as readonly T[];
  const columns = (columnsProp ?? parts?.columns ?? []) as readonly DataTableColumn<T>[];
  const viewport = useScrollViewport(virtualize);
  const locale = useLocale(localeProp);
  const tableRef = useRef<HTMLTableElement>(null);
  const prevPageRef = useRef<HTMLButtonElement>(null);
  const nextPageRef = useRef<HTMLButtonElement>(null);
  const [rowMetrics, setRowMetrics] = useState({ row: 0, head: 0 });

  const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const labels = useMemo(
    () => ({ ...defaultLabels((value) => numberFormat.format(value)), ...labelsProp }),
    [numberFormat, labelsProp],
  );
  const format = useMemo(
    () => createValueFormatter({ locale, yes: labels.yes, no: labels.no }),
    [locale, labels.yes, labels.no],
  );

  const valueOf = useMemo(() => {
    const byKey = new Map(columns.map((column) => [column.key, column]));
    return (row: T, key: string) => {
      const column = byKey.get(key);
      return column?.accessor ? column.accessor(row) : getCellValue(row, key);
    };
  }, [columns]);

  // Stable per data/columns change: the hook reads it once per row, so typing in the search box stays cheap on large tables.
  const getSearchText = useCallback(
    (row: T) =>
      columns
        .map((column) => (column.getSearchValue ? column.getSearchValue(row) : toSearchText(valueOf(row, column.key), format)))
        .join('\n')
        .toLowerCase(),
    [columns, valueOf, format],
  );
  // Search, sort, pages and selection come from the headless hook, so `useDataTable` drives the same table.
  const table = useDataTable({
    data,
    getRowId,
    getValue: valueOf,
    getSearchText: searchable ? getSearchText : undefined,
    sort: sortProp,
    defaultSort,
    onSortChange,
    selected: selectedProp,
    defaultSelected,
    onSelectedChange,
    pageSize,
    locale,
  });
  const { entries, results: sorted, sort, query, selectionState: headerState, selectedCount } = table;
  const paged = pageSize ? { page: table.page, pageCount: table.pageCount, start: table.pageStart, rows: table.rows } : null;
  const visible = table.rows;
  const visibleIds = useMemo(() => visible.map((entry) => entry.id), [visible]);

  // The new order is read out, as React Aria's tables do: screen readers do not announce a changed aria-sort on their
  // own, and after a click focus is still on the same header button.
  const announcedSort = useRef(sort);
  useEffect(() => {
    const previous = announcedSort.current;
    announcedSort.current = sort;
    if (previous?.key === sort?.key && previous?.direction === sort?.direction) return;
    const index = columns.findIndex((column) => column.key === (sort ?? previous)?.key);
    if (index === -1) return;
    const header = columns[index].header;
    const name =
      typeof header === 'string' || typeof header === 'number'
        ? String(header)
        : (tableRef.current?.tHead?.rows[0]?.cells[index + (selectable ? 1 : 0)]?.textContent?.trim() ?? '');
    if (name) announce(labels.sorted(name, sort?.direction ?? null), 'assertive', 500);
  }, [sort, columns, selectable, labels]);
  // The row checkbox toggled last: Shift+click extends from it.
  const anchorRef = useRef<string | null>(null);

  const windowed = virtualize && !loading;
  const rowHeight = rowMetrics.row || ESTIMATED_ROW_HEIGHT;
  const range = windowed
    ? getVirtualWindow(visible.length, {
        scrollTop: viewport.y.top,
        viewportHeight: viewport.y.height,
        rowHeight,
        offset: rowMetrics.head,
      })
    : { start: 0, end: visible.length };
  // The row holding focus stays mounted while scrolled out of the window.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const focusedIndex = windowed && focusedId !== null ? visible.findIndex((entry) => entry.id === focusedId) : -1;
  const runs = windowRuns(range, focusedIndex);

  // Spacer rows stand in for the skipped rows, so their height has to match the real ones.
  useLayoutEffect(() => {
    if (!windowed) return;
    const table = tableRef.current;
    const row = table?.querySelector<HTMLElement>('tbody > tr:not(.ui-data-table__spacer)');
    if (!table || !row) return;
    const next = { row: row.getBoundingClientRect().height, head: table.tHead?.getBoundingClientRect().height ?? 0 };
    setRowMetrics((prev) =>
      Math.abs(prev.row - next.row) < 0.5 && Math.abs(prev.head - next.head) < 0.5 ? prev : next,
    );
  });
  const columnCount = columns.length + (selectable ? 1 : 0);
  const trimmedQuery = query.trim();

  const rowName = (row: T) => {
    const first = columns[0];
    if (!first) return null;
    const text = format(valueOf(row, first.key)) || first.getSearchValue?.(row);
    return text || null;
  };

  let summary: string;
  if (selectable && selectedCount > 0) summary = labels.selected(selectedCount, entries.length);
  else if (sorted.length === 0) summary = labels.noResults;
  else if (paged) summary = labels.range(paged.start + 1, paged.start + paged.rows.length, sorted.length);
  else summary = labels.rows(sorted.length);

  const pin = (index: number) => (stickyFirstColumn && index === 0 ? 'first' : undefined);
  const selectPin = stickyFirstColumn ? 'select' : undefined;

  const renderCell = (row: T, column: DataTableColumn<T>) => {
    if (column.cell) return column.cell(row);
    const text = format(valueOf(row, column.key));
    return text === '' ? <span className="ui-data-table__blank">—</span> : text;
  };

  const spacer = (rows: number, key: string) =>
    rows > 0 && (
      <tr key={key} className="ui-data-table__spacer" aria-hidden="true">
        <td colSpan={columnCount} style={{ height: rows * rowHeight }} />
      </tr>
    );

  const renderRow = ({ row, id }: DataTableEntry<T>, index: number) => {
    const isSelected = table.isSelected(id);
    return (
      <tr
        key={id}
        aria-rowindex={windowed ? index + 2 : undefined}
        data-selected={isSelected || undefined}
        data-clickable={onRowClick ? true : undefined}
        tabIndex={onRowClick ? 0 : undefined}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
        onKeyDown={
          onRowClick
            ? (event) => {
                if (event.key === 'Enter' && event.target === event.currentTarget) {
                  event.preventDefault();
                  onRowClick(row);
                }
              }
            : undefined
        }
        onFocus={windowed ? () => setFocusedId(id) : undefined}
        onBlur={
          windowed
            ? (event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusedId((prev) => (prev === id ? null : prev));
              }
            : undefined
        }
      >
        {selectable && (
          // The checkbox cell must not trigger the row's click action.
          <td className="ui-data-table__select" data-pin={selectPin} onClick={(event) => event.stopPropagation()}>
            <TableCheckbox
              label={labels.selectRow(rowName(row))}
              checked={isSelected}
              onChange={(event) => {
                const anchor = anchorRef.current;
                anchorRef.current = id;
                // Shift+click sets every visible row from the last toggled one to this one, as in mail clients.
                if ((event.nativeEvent as MouseEvent).shiftKey && anchor !== null && anchor !== id) {
                  table.setSelected(selectRange(table.selected, visibleIds, anchor, id, !isSelected));
                } else table.toggleRow(id);
              }}
            />
          </td>
        )}
        {columns.map((column, index) => (
          <td key={column.key} data-align={column.align} data-pin={pin(index)}>
            {/* Pinned content gets its own box so it can sit above the Glass frost (see the CSS). */}
            {pin(index) ? <div className="ui-data-table__pinned">{renderCell(row, column)}</div> : renderCell(row, column)}
          </td>
        ))}
      </tr>
    );
  };

  const bodyRows = () => {
    const out: ReactNode[] = [];
    let at = 0;
    runs.forEach(([start, end], run) => {
      out.push(spacer(start - at, `spacer-${run}`));
      for (let index = start; index < end; index++) out.push(renderRow(visible[index], index));
      at = end;
    });
    out.push(spacer(visible.length - at, 'spacer-end'));
    return out;
  };

  return (
    <div
      className={cx('ui-data-table', className)}
      data-density={density}
      data-selectable={selectable || undefined}
      {...rest}
    >
      {searchable && (
        <div className="ui-data-table__toolbar">
          <label className="ui-field ui-data-table__search" data-size="sm">
            <span className="ui-field__icon">
              <SearchIcon size={16} />
            </span>
            <input
              className="ui-field__input"
              type="search"
              value={query}
              placeholder={labels.searchPlaceholder}
              aria-label={labels.search(label)}
              onChange={(event) => {
                table.setQuery(event.target.value);
              }}
            />
          </label>
        </div>
      )}

      <div className="ui-data-table__container ui-panel">
        {/* Holds the end-edge scroll shadow still while the table scrolls under it. */}
        <div className="ui-data-table__viewport" data-scroll-more={viewport.more || undefined}>
          <div
            ref={viewport.ref}
            className="ui-data-table__scroll"
            data-scrolled={viewport.scrolled || undefined}
            data-scroll-y={maxHeight !== undefined || undefined}
            style={
              {
                maxHeight,
                '--_viewport-w': viewport.width !== null ? `${viewport.width}px` : undefined,
              } as CSSProperties
            }
          >
            <table
              ref={tableRef}
              className="ui-data-table__table"
              aria-label={label}
              aria-busy={loading || undefined}
              aria-rowcount={windowed ? visible.length + 1 : undefined}
            >
              <thead>
                <tr>
                  {selectable && (
                    <th scope="col" className="ui-data-table__select" data-pin={selectPin}>
                      <TableCheckbox
                        label={labels.selectAll}
                        checked={headerState === 'all'}
                        indeterminate={headerState === 'some'}
                        disabled={loading || visible.length === 0}
                        onChange={() => {
                          anchorRef.current = null;
                          table.toggleAll();
                        }}
                      />
                    </th>
                  )}
                  {columns.map((column, index) => {
                    const direction = sort?.key === column.key ? sort.direction : undefined;
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        data-align={column.align}
                        data-pin={pin(index)}
                        style={column.width !== undefined ? { width: column.width } : undefined}
                        // `none` tells screen-reader users the column can be sorted (React Aria does the same).
                        aria-sort={direction ? ARIA_SORT[direction] : column.sortable ? 'none' : undefined}
                      >
                        {column.sortable ? (
                          <button
                            type="button"
                            className="ui-data-table__sort"
                            data-active={direction ? true : undefined}
                            onClick={() => {
                              table.toggleSort(column.key);
                            }}
                          >
                            <span className="ui-data-table__sort-label">{column.header}</span>
                            {direction === 'asc' ? (
                              <ArrowUpIcon size={14} />
                            ) : direction === 'desc' ? (
                              <ArrowDownIcon size={14} />
                            ) : (
                              <ChevronsUpDownIcon size={14} className="ui-data-table__sort-idle" />
                            )}
                          </button>
                        ) : (
                          <span className="ui-data-table__head">{column.header}</span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: pageSize ?? 5 }, (_, r) => (
                    <tr key={r} className="ui-data-table__skeleton-row">
                      {selectable && (
                        <td className="ui-data-table__select" data-pin={selectPin}>
                          <Skeleton className="ui-data-table__skeleton-check" />
                        </td>
                      )}
                      {columns.map((column, c) => (
                        <td key={column.key} data-align={column.align} data-pin={pin(c)}>
                          <Skeleton
                            height={12}
                            width={SKELETON_WIDTHS[(r + c) % SKELETON_WIDTHS.length]}
                            style={{
                              minWidth: 48,
                              marginInlineStart: column.align === 'right' || column.align === 'center' ? 'auto' : undefined,
                              marginInlineEnd: column.align === 'center' ? 'auto' : undefined,
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : visible.length === 0 ? (
                  <tr className="ui-data-table__empty-row">
                    <td colSpan={columnCount} className="ui-data-table__empty">
                      {/* Pinned to the visible viewport so it stays centred when the table is wider than the screen. */}
                      <div className="ui-data-table__empty-inner">
                        {empty ?? (
                          <EmptyState
                            size="sm"
                            icon={trimmedQuery ? <SearchIcon /> : <InboxIcon />}
                            title={trimmedQuery ? labels.noResults : labels.empty}
                            description={trimmedQuery ? labels.noResultsDescription(trimmedQuery) : undefined}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  bodyRows()
                )}
              </tbody>
            </table>
          </div>
        </div>

        {(paged || selectable) && (
          <div className="ui-data-table__footer">
            <span className="ui-data-table__summary" aria-live="polite">
              {loading ? <Skeleton width={112} height={12} /> : summary}
            </span>
            {paged && paged.pageCount > 1 && (
              <div className="ui-data-table__pager">
                <span className="ui-data-table__page">{labels.page(paged.page + 1, paged.pageCount)}</span>
                <IconButton
                  size="sm"
                  variant="secondary"
                  label={labels.previousPage}
                  icon={<ChevronLeftIcon />}
                  ref={prevPageRef}
                  disabled={loading || paged.page === 0}
                  onClick={() => {
                    table.setPage(paged.page - 1);
                    // The button disables on the first page: focus moves to Next instead of falling to the page.
                    // After the re-render: Next is still disabled now (on a two-page table), and a disabled button takes no focus.
                    if (paged.page - 1 === 0) requestAnimationFrame(() => nextPageRef.current?.focus());
                  }}
                />
                <IconButton
                  size="sm"
                  variant="secondary"
                  label={labels.nextPage}
                  icon={<ChevronRightIcon />}
                  ref={nextPageRef}
                  disabled={loading || paged.page >= paged.pageCount - 1}
                  onClick={() => {
                    table.setPage(paged.page + 1);
                    if (paged.page + 1 >= paged.pageCount - 1) requestAnimationFrame(() => prevPageRef.current?.focus());
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}, { Header: DataTableHeader, Column: DataTableColumnPart, Body: DataTableBody, Row: DataTableRow, Cell: DataTableCell });

interface TableCheckboxProps {
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

/** Minimal local checkbox; `indeterminate` exists only as a DOM property, so it is set through a ref. */
function TableCheckbox({ label, checked, indeterminate = false, disabled, onChange }: TableCheckboxProps) {
  return (
    // A label, so its touch hit area (CSS ::after) toggles the input; aria-label still names it.
    <label className="ui-data-table__checkbox">
      <input
        ref={(node) => {
          if (node) node.indeterminate = indeterminate;
        }}
        type="checkbox"
        className="ui-data-table__checkbox-input"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <CheckIcon size={12} strokeWidth={3} className="ui-data-table__checkbox-check" />
      <MinusIcon size={12} strokeWidth={3} className="ui-data-table__checkbox-dash" />
    </label>
  );
}
