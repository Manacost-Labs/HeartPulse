/** «Всего 36 · страница 1 из 2», or «Найдено …» while a filter narrows the list. */
export function adminListCount(filtered: number, total: number, page: number, pageCount: number): string {
  return `${filtered === total ? 'Всего' : 'Найдено'} ${filtered.toLocaleString('ru-RU')} · страница ${page} из ${pageCount}`;
}

/** One-line result summary under the filters: the count line plus the load time. */
export function adminListSummary(filtered: number, total: number, page: number, pageCount: number, loadedAt: string): string {
  return `${adminListCount(filtered, total, page, pageCount)} · загружено ${loadedAt || 'только что'}`;
}
