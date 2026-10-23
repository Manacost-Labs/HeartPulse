import type { DataTableLabels } from '../../vendor/varylo-ui/data-display/DataTable';
import type { KpiGroupLabels } from '../../vendor/varylo-ui/data-display/KpiGroup';
import { pluralRu } from '../../shared/text/pluralRu';

/** Russian texts for the vendored VaryloUI widgets, which ship English defaults. */
export const DATA_TABLE_LABELS: Partial<DataTableLabels> = {
  search: label => (label ? `Поиск: ${label}` : 'Поиск'),
  searchPlaceholder: 'Поиск…',
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
