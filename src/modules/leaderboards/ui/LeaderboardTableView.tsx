import { TableSurface } from '../../../shared/ui/analytics/TableSurface';
import {
  LEADERBOARD_RATING_LABELS, boardTitle, formatPlayers, formatRating, rankChange,
} from '../model/leaderboardsView';
import type { LeaderboardTable } from '../model/types';

function Pagination({ table, onPage }: { table: LeaderboardTable; onPage: (page: number) => void }) {
  if (table.pages <= 1) return null;
  const { page, pages } = table;
  return <nav className="leaderboards-pages" aria-label="Страницы таблицы">
    <button type="button" className="leaderboards-chip" disabled={page <= 1} onClick={() => onPage(1)} aria-label="Первая страница">«</button>
    <button type="button" className="leaderboards-chip" disabled={page <= 1} onClick={() => onPage(page - 1)}>Назад</button>
    <span className="leaderboards-pages__status">Страница {formatPlayers(page)} из {formatPlayers(pages)}</span>
    <button type="button" className="leaderboards-chip" disabled={page >= pages} onClick={() => onPage(page + 1)}>Далее</button>
    <button type="button" className="leaderboards-chip" disabled={page >= pages} onClick={() => onPage(pages)} aria-label="Последняя страница">»</button>
  </nav>;
}

/** Страница таблицы: место, ник, рейтинг (если он есть в режиме) и изменение места за сутки. */
export function LeaderboardTableView({ table, busy, selectedPlayer, onPage, onPlayer }: {
  table: LeaderboardTable;
  /** Идёт загрузка другой страницы: таблица остаётся на месте приглушённой. */
  busy: boolean;
  selectedPlayer: string | null;
  onPage: (page: number) => void;
  onPlayer: (name: string) => void;
}) {
  const { board, rows, hasPrevious } = table;
  const ratingLabel = board.rated ? LEADERBOARD_RATING_LABELS[board.mode] ?? 'Рейтинг' : null;
  const first = rows[0]?.rank;
  const last = rows.at(-1)?.rank;
  return <div className="leaderboards-table data-surface" aria-busy={busy || undefined}>
    <TableSurface title={boardTitle(table)} density="compact">
      <table>
        <caption className="sr-only">{boardTitle(table)}. Нажмите на ник, чтобы открыть историю игрока.</caption>
        <thead><tr>
          <th scope="col" className="is-numeric">Место</th>
          <th scope="col">Игрок</th>
          {ratingLabel && <th scope="col" className="is-numeric">{ratingLabel}</th>}
          {hasPrevious && <th scope="col" className="is-numeric">За сутки</th>}
        </tr></thead>
        <tbody>
          {rows.map(row => {
            const change = rankChange(row.rank, row.previousRank, hasPrevious);
            return <tr key={`${row.rank}-${row.name}`} data-selected={row.name === selectedPlayer || undefined}>
              <td className="is-numeric leaderboards-rank">{formatPlayers(row.rank)}</td>
              <td><button type="button" className="leaderboards-player-link" onClick={() => onPlayer(row.name)}>{row.name}</button></td>
              {ratingLabel && <td className="is-numeric">{formatRating(board.mode, row.rating)}</td>}
              {hasPrevious && <td className={`is-numeric leaderboards-change leaderboards-change--${change?.kind ?? 'same'}`}>
                {change && <span title={change.text}><span aria-hidden="true">{change.label}</span><span className="sr-only">{change.text}</span></span>}
              </td>}
            </tr>;
          })}
          {!rows.length && <tr><td colSpan={2 + Number(Boolean(ratingLabel)) + Number(hasPrevious)} className="leaderboards-empty">
            {table.query ? `Игроков с «${table.query}» в нике в этой таблице нет.` : 'В этой таблице пока нет игроков.'}
          </td></tr>}
        </tbody>
      </table>
    </TableSurface>
    <footer className="leaderboards-table__footer">
      <span role="status">
        {table.query ? `Найдено: ${formatPlayers(table.total)}` : `Мест в таблице: ${formatPlayers(table.total)}`}
        {!table.query && first !== undefined && last !== undefined ? ` · показаны ${formatPlayers(first)}–${formatPlayers(last)}` : ''}
      </span>
      <Pagination table={table} onPage={onPage} />
    </footer>
  </div>;
}
