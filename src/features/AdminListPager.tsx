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
