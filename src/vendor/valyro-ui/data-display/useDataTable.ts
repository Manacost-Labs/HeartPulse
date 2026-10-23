'use client';

import { useMemo, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type RefCallback } from 'react';
import { useControllableState } from '../primitives/useControllableState';
import { withUserProps, type UserProps } from '../primitives/prop-getters';
import {
  ARIA_SORT,
  filterRows,
  getCellValue,
  getSelectionState,
  nextSort,
  paginate,
  sortRows,
  toggleAll,
  toggleOne,
  type SelectionState,
  type SortState,
} from './data-table';

/*
 * The row model of DataTable without its markup: search, a sort that cycles ascending → descending → off,
 * pages and row selection (a header checkbox for the rows on screen), each controlled or not. DataTable renders
 * with it; your own table, list or grid of cards can too.
 */

export interface DataTableOptions<T> {
  /** The rows, in their original order. */
  data: readonly T[];
  /** Id of a row, for selection and keys. Default: its `id` field, else its index. */
  getRowId?: (row: T, index: number) => string;
  /** Value a column sorts by. Default: the row's field of that key. Keep it stable (useCallback). */
  getValue?: (row: T, key: string) => unknown;
  /** Text the search matches, lower-cased; without it the query filters nothing. Keep it stable (useCallback). */
  getSearchText?: (row: T) => string;
  sort?: SortState | null;
  defaultSort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  /** Ids of the selected rows. */
  selected?: string[];
  defaultSelected?: string[];
  onSelectedChange?: (selected: string[]) => void;
  /** Search query. */
  query?: string;
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;
  /** Rows per page; without it every row is on one page. */
  pageSize?: number;
  /** Zero-based page. */
  page?: number;
  defaultPage?: number;
  onPageChange?: (page: number) => void;
  /** Locale of string comparison. */
  locale?: string;
}

/** A row with its id. */
export interface DataTableEntry<T> {
  row: T;
  id: string;
}

export interface DataTableState<T> {
  /** Every row with its id, in the original order. */
  entries: DataTableEntry<T>[];
  /** The rows that match the query, sorted, on every page. */
  results: DataTableEntry<T>[];
  /** The rows of the current page. */
  rows: DataTableEntry<T>[];
  sort: SortState | null;
  setSort: (sort: SortState | null) => void;
  /** Cycles a column ascending → descending → off and goes back to the first page. */
  toggleSort: (key: string) => void;
  query: string;
  /** Sets the query and goes back to the first page. */
  setQuery: (query: string) => void;
  /** Zero-based, clamped to the pages there are. */
  page: number;
  pageCount: number;
  /** Index in `results` of the page's first row. */
  pageStart: number;
  setPage: (page: number) => void;
  selected: string[];
  setSelected: (selected: string[]) => void;
  isSelected: (id: string) => boolean;
  toggleRow: (id: string) => void;
  /** Selects the rows on the page, or clears them when they all are. */
  toggleAll: () => void;
  /** Header checkbox state for the rows on the page. */
  selectionState: SelectionState;
  /** Selected rows among all rows. */
  selectedCount: number;
  /** The header cell (`<th>`) of a column: `aria-sort`. */
  getColumnProps: (key: string, props?: UserProps) => HTMLAttributes<HTMLElement>;
  /** The sort button in a header cell. */
  getSortProps: (key: string, props?: UserProps) => ButtonHTMLAttributes<HTMLButtonElement>;
  /** A row: `data-selected`, for styling (a table row takes no `aria-selected`: its checkbox tells). */
  getRowProps: (id: string, props?: UserProps) => HTMLAttributes<HTMLElement> & { 'data-selected'?: true };
  /** A row's checkbox. Give it an `aria-label` naming the row. */
  getRowCheckboxProps: (id: string, props?: UserProps) => InputHTMLAttributes<HTMLInputElement>;
  /** The header checkbox: checked, mixed (`indeterminate`) or not, for the rows on the page. */
  getSelectAllProps: (props?: UserProps) => InputHTMLAttributes<HTMLInputElement> & { ref: RefCallback<HTMLInputElement> };
  /** The search field. */
  getSearchProps: (props?: UserProps) => InputHTMLAttributes<HTMLInputElement>;
}

/** The `id` field of a row (a string or number), else its index. */
export function defaultRowId(row: unknown, index: number) {
  const id = getCellValue(row, 'id');
  return typeof id === 'string' || typeof id === 'number' ? String(id) : String(index);
}

export function useDataTable<T>({
  data,
  getRowId,
  getValue = getCellValue,
  getSearchText,
  sort: sortProp,
  defaultSort = null,
  onSortChange,
  selected: selectedProp,
  defaultSelected = [],
  onSelectedChange,
  query: queryProp,
  defaultQuery = '',
  onQueryChange,
  pageSize,
  page: pageProp,
  defaultPage = 0,
  onPageChange,
  locale,
}: DataTableOptions<T>): DataTableState<T> {
  const [sort, setSort] = useControllableState({ value: sortProp, defaultValue: defaultSort, onChange: onSortChange });
  const [selected, setSelected] = useControllableState({ value: selectedProp, defaultValue: defaultSelected, onChange: onSelectedChange });
  const [query, setQueryState] = useControllableState({ value: queryProp, defaultValue: defaultQuery, onChange: onQueryChange });
  const [pageState, setPage] = useControllableState({ value: pageProp, defaultValue: defaultPage, onChange: onPageChange });

  const entries = useMemo<DataTableEntry<T>[]>(
    () => data.map((row, index) => ({ row, id: getRowId ? getRowId(row, index) : defaultRowId(row, index) })),
    [data, getRowId],
  );
  // Read once per data change, so typing in the search box stays cheap on large tables.
  const searchText = useMemo(
    () => (getSearchText ? new Map(entries.map((entry) => [entry, getSearchText(entry.row)])) : null),
    [entries, getSearchText],
  );
  const filtered = useMemo(
    () => (searchText ? filterRows(entries, query, (entry) => searchText.get(entry) ?? '') : entries),
    [entries, query, searchText],
  );
  const results = useMemo(
    () => sortRows(filtered, sort, (entry, key) => getValue(entry.row, key), locale),
    [filtered, sort, getValue, locale],
  );
  const paged = useMemo(
    () => (pageSize ? paginate(results, pageState, pageSize) : { rows: results, page: 0, pageCount: 1, start: 0 }),
    [results, pageState, pageSize],
  );

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const pageIds = useMemo(() => paged.rows.map((entry) => entry.id), [paged.rows]);
  const selectionState = useMemo(() => getSelectionState(pageIds, selected), [pageIds, selected]);
  const selectedCount = useMemo(
    () => entries.reduce((n, entry) => n + (selectedSet.has(entry.id) ? 1 : 0), 0),
    [entries, selectedSet],
  );
  // The header checkbox's mixed state is a DOM property, set from a ref that changes with it.
  const mixed = selectionState === 'some';
  const selectAllRef = useMemo<RefCallback<HTMLInputElement>>(
    () => (input) => {
      if (input) input.indeterminate = mixed;
    },
    [mixed],
  );

  const toggleSort = (key: string) => {
    setSort((prev) => nextSort(prev, key));
    setPage(0);
  };
  const setQuery = (next: string) => {
    setQueryState(next);
    setPage(0);
  };
  const toggleRow = (id: string) => setSelected((prev) => toggleOne(prev, id));
  const togglePage = () => setSelected((prev) => toggleAll(prev, pageIds));

  return {
    entries,
    results,
    rows: paged.rows,
    sort,
    setSort,
    toggleSort,
    query,
    setQuery,
    page: paged.page,
    pageCount: paged.pageCount,
    pageStart: paged.start,
    setPage,
    selected,
    setSelected,
    isSelected: (id) => selectedSet.has(id),
    toggleRow,
    toggleAll: togglePage,
    selectionState,
    selectedCount,
    getColumnProps: (key, props) =>
      withUserProps({ 'aria-sort': sort?.key === key ? ARIA_SORT[sort.direction] : undefined }, props),
    getSortProps: (key, props) => withUserProps({ type: 'button' as const, onClick: () => toggleSort(key) }, props),
    getRowProps: (id, props) =>
      withUserProps({ 'data-selected': selectedSet.has(id) || undefined }, props) as never,
    getRowCheckboxProps: (id, props) =>
      withUserProps({ type: 'checkbox', checked: selectedSet.has(id), onChange: () => toggleRow(id) }, props),
    getSelectAllProps: (props) =>
      withUserProps(
        {
          ref: selectAllRef,
          type: 'checkbox',
          checked: selectionState === 'all',
          'aria-checked': mixed ? ('mixed' as const) : selectionState === 'all',
          disabled: pageIds.length === 0,
          onChange: togglePage,
        },
        props,
      ),
    getSearchProps: (props) =>
      withUserProps(
        { type: 'search', value: query, onChange: (event: { target: { value: string } }) => setQuery(event.target.value) },
        props,
      ),
  };
}
