type AdminListPagerProps = {
  label: string;
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
};

/** Previous/next pager shared by the admin lists that page on the client. */
export function AdminListPager({ label, page, pageCount, onPage }: AdminListPagerProps) {
  if (pageCount <= 1) return null;
  return (
    <nav className="admin-pagination" aria-label={label}>
      <button type="button" disabled={page === 1} onClick={() => onPage(Math.max(1, page - 1))}>Назад</button>
      <span>Страница {page} из {pageCount}</span>
      <button type="button" disabled={page === pageCount} onClick={() => onPage(Math.min(pageCount, page + 1))}>Далее</button>
    </nav>
  );
}

/** One-line result summary under the filters: total or filtered count, page and load time. */
export function adminListSummary(filtered: number, total: number, page: number, pageCount: number, loadedAt: string): string {
  return `${filtered === total ? 'Всего' : 'Найдено'} ${filtered.toLocaleString('ru-RU')} · страница ${page} из ${pageCount} · загружено ${loadedAt || 'только что'}`;
}
