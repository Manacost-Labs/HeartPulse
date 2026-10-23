import type { DataTableLabels } from '../../vendor/valyro-ui/data-display/DataTable';
import type { KpiGroupLabels } from '../../vendor/valyro-ui/data-display/KpiGroup';
import { pluralRu } from '../../shared/text/pluralRu';

/** Russian texts for the vendored Valyro widgets, which ship English defaults. */
export const DATA_TABLE_LABELS: Partial<DataTableLabels> = {
  search: label => (label ? `Поиск: ${label}` : 'Поиск'),
  searchPlaceholder: 'Поиск…',
  sorted: (column, direction) => `${column}: ${direction === 'asc' ? 'по возрастанию' : direction === 'desc' ? 'по убыванию' : 'без сортировки'}`,
  range: (start, end, total) => `${start}–${end} из ${total}`,
  rows: count => `${count} ${pluralRu(count, 'строка', 'строки', 'строк')}`,
  page: (page, pageCount) => `Страница ${page} из ${pageCount}`,
  previousPage: 'Предыдущая страница',
  nextPage: 'Следующая страница',
  empty: 'Нет данных',
  noResults: 'Ничего не найдено',
  noResultsDescription: query => `По запросу «${query}» ничего нет`,
  yes: 'Да',
  no: 'Нет',
};

export const KPI_LABELS: Partial<KpiGroupLabels> = {
  increase: 'рост',
  decrease: 'снижение',
  unchanged: 'без изменений',
  noData: 'нет данных',
  loading: 'Загружаем статистику',
};
