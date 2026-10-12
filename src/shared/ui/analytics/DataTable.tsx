import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from 'lucide-react';
import { flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from '@tanstack/react-table';
import { csvDocument } from './analyticsModel';

export type DataColumn<T> = {
  key: string; label: string; value: (row: T) => string | number | null;
  render?: (row: T) => ReactNode; numeric?: boolean; sortable?: boolean;
};

/** Client sorting and CSV cover every supplied row, independent of the current page. */
export function DataTable<T>({ title, rows, columns, tourId, rowKey, searchable = false, pageSize = 12 }: {
  title: string; rows: T[]; columns: DataColumn<T>[]; tourId?: string;
  rowKey?: (row: T, index: number) => string; searchable?: boolean; pageSize?: number;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const definitions = useMemo<ColumnDef<T>[]>(() => columns.map(column => ({
    id: column.key, accessorFn: row => column.value(row) ?? undefined, header: column.label,
    cell: info => column.render ? column.render(info.row.original) : (info.getValue() ?? '—') as ReactNode,
    enableSorting: column.sortable !== false, sortUndefined: 'last',
    sortingFn: column.numeric ? 'basic' : 'alphanumeric',
  })), [columns]);
  const table = useReactTable({
    data: rows, columns: definitions, state: { sorting, globalFilter },
    onSortingChange: setSorting, onGlobalFilterChange: setGlobalFilter, getRowId: rowKey,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });
  const exportRows = async () => {
    setExporting(true); setExportError('');
    try {
      const { downloadBlob } = await import('./chartExport');
      const csv = csvDocument(columns.map(column => column.label), table.getPrePaginationRowModel().rows.map(row => columns.map(column => column.value(row.original))));
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${title}.csv`);
    } catch { setExportError('Не удалось скачать таблицу. Попробуйте ещё раз.'); }
    finally { setExporting(false); }
  };
  return <section className="analytics-table" data-tour-id={tourId}>
    <header className="analytics-table__header"><h3>{title}</h3><div className="analytics-table__tools">
      {searchable && <input type="search" value={globalFilter} onChange={event => setGlobalFilter(event.target.value)} placeholder="Найти строку" aria-label={`Поиск: ${title}`} />}
      <button type="button" onClick={() => void exportRows()} disabled={!rows.length || exporting} aria-label={`Скачать ${title}: CSV`}><Download size={15} aria-hidden="true" />CSV</button>
    </div></header>
    <div className="analytics-table__scroll" tabIndex={0} role="region" aria-label={`${title}: таблица с горизонтальной прокруткой`}>
      <table><caption className="sr-only">{title}. Нажмите заголовок, чтобы изменить сортировку.</caption>
        <thead>{table.getHeaderGroups().map(group => <tr key={group.id}>{group.headers.map((header, index) => {
          const sort = header.column.getIsSorted();
          return <th key={header.id} scope="col" className={columns[index]?.numeric ? 'is-numeric' : ''} aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : 'none'}>
            {header.column.getCanSort() ? <button type="button" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{sort === 'asc' ? <ArrowUp size={14} aria-hidden="true" /> : sort === 'desc' ? <ArrowDown size={14} aria-hidden="true" /> : <ArrowUpDown size={14} aria-hidden="true" />}</button> : flexRender(header.column.columnDef.header, header.getContext())}
          </th>;
        })}</tr>)}</thead>
        <tbody>{table.getRowModel().rows.map(row => <tr key={row.id}>{row.getVisibleCells().map((cell, index) => <td key={cell.id} className={columns[index]?.numeric ? 'is-numeric' : ''}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}
          {!table.getFilteredRowModel().rows.length && <tr><td colSpan={columns.length}>Подходящих строк пока нет.</td></tr>}
        </tbody>
      </table>
    </div>
    <footer className="analytics-table__footer"><span role="status">{table.getFilteredRowModel().rows.length.toLocaleString('ru-RU')} строк{table.getPageCount() > 1 ? ` · страница ${table.getState().pagination.pageIndex + 1} из ${table.getPageCount()}` : ''}</span>
      {table.getPageCount() > 1 && <nav aria-label={`Страницы: ${title}`}><button type="button" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Назад</button><button type="button" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Далее</button></nav>}
    </footer>
    {exportError && <p role="alert" className="analytics-chart__error">{exportError}</p>}
  </section>;
}
