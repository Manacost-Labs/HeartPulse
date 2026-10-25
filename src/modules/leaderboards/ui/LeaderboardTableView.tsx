'use client';

import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { preferredScrollBehavior } from '../../../shared/ui/scrollBehavior';
import {
  LEADERBOARD_RATING_LABELS, boardTitle, formatLeaderboardTime, formatPlayers, formatRating, rankChange,
} from '../model/leaderboardsView';
import type { LeaderboardTable } from '../model/types';
import { StreamerBadge } from './StreamerBadge';

function Pagination({ table, onPage }: { table: LeaderboardTable; onPage: (page: number) => void }) {
  if (table.pages <= 1) return null;
  const { page, pages } = table;
  return <nav className="leaderboards-pages" aria-label="Страницы таблицы">
    <button type="button" className="leaderboards-chip" disabled={page <= 1} onClick={() => onPage(1)} aria-label="Первая страница"><ChevronsLeft aria-hidden="true" /></button>
    <button type="button" className="leaderboards-chip" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Назад"><ChevronLeft aria-hidden="true" /></button>
    <span className="leaderboards-pages__status">{formatPlayers(page)} из {formatPlayers(pages)}</span>
    <button type="button" className="leaderboards-chip" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Далее"><ChevronRight aria-hidden="true" /></button>
    <button type="button" className="leaderboards-chip" disabled={page >= pages} onClick={() => onPage(pages)} aria-label="Последняя страница"><ChevronsRight aria-hidden="true" /></button>
  </nav>;
}

/**
 * Страница таблицы: место (топ-3 выделены), ник со значком стримера, рейтинг
 * (если он есть в режиме) и изменение места за сутки. Строка места, к
 * которому перешли, подсвечена и прокручена в середину экрана.
 */
export function LeaderboardTableView({ table, busy, selectedPlayer, targetRank, onPage, onPlayer }: {
  table: LeaderboardTable;
  /** Идёт загрузка другой страницы: таблица остаётся на месте приглушённой. */
  busy: boolean;
  selectedPlayer: string | null;
  /** Место, к которому перешли. */
  targetRank: number | null;
  onPage: (page: number) => void;
  onPlayer: (name: string) => void;
}) {
  const { board, rows, hasPrevious } = table;
  const target = useRef<HTMLTableRowElement>(null);
  const hasTarget = !busy && rows.some(row => row.rank === targetRank);
  useEffect(() => {
    if (hasTarget) target.current?.scrollIntoView({ block: 'center', behavior: preferredScrollBehavior() });
  }, [hasTarget, targetRank]);
  const ratingLabel = board.rated ? LEADERBOARD_RATING_LABELS[board.mode] ?? 'Рейтинг' : null;
  return <div className="leaderboards-table data-surface" aria-busy={busy || undefined}>
    <table>
      <caption className="sr-only">{boardTitle(table)}. Нажмите на ник, чтобы открыть историю игрока.</caption>
      <colgroup>
        <col className="leaderboards-table__rank" />
        <col />
        {ratingLabel && <col className="leaderboards-table__rating" />}
        {hasPrevious && <col className="leaderboards-table__change" />}
      </colgroup>
      <thead><tr>
        <th scope="col" className="is-numeric">Место</th>
        <th scope="col">Игрок</th>
        {ratingLabel && <th scope="col" className="is-numeric">{ratingLabel}</th>}
        {hasPrevious && <th scope="col" className="is-numeric">За сутки</th>}
      </tr></thead>
      <tbody>
        {rows.map(row => {
          const change = rankChange(row.rank, row.previousRank, hasPrevious);
          const isTarget = row.rank === targetRank;
          return <tr key={`${row.rank}-${row.name}`} ref={isTarget ? target : undefined}
            data-selected={row.name === selectedPlayer || undefined} data-target={isTarget || undefined}>
            <td className="is-numeric leaderboards-rank">{row.rank <= 3
              ? <span className="leaderboards-medal">{row.rank}</span>
              : formatPlayers(row.rank)}</td>
            <td><div className="leaderboards-name">
              <button type="button" className="leaderboards-player-link" onClick={() => onPlayer(row.name)}>{row.name}</button>
              {row.streamer && <StreamerBadge streamer={row.streamer} />}
            </div></td>
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
    <footer className="leaderboards-table__footer">
      <span role="status">{table.query && rows.length
        ? `Найдено: ${formatPlayers(table.total)}`
        : `Снимок ${formatLeaderboardTime(table.snapshot.capturedAt)}${table.snapshot.stale ? ' · данные давно не обновлялись' : ''}${board.final ? ' · сезон завершён' : ''}`}</span>
      <Pagination table={table} onPage={onPage} />
    </footer>
  </div>;
}
