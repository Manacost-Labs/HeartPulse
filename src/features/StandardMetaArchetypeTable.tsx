import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { TableSurface } from '../shared/ui/analytics/TableSurface';
import { canonicalPagePath } from '../app/routing/canonicalPagePath';
import type { StandardMetaItem } from '../../shared/standardMetaContract';
import type { StandardMetaTrendItem } from '../../shared/standardMetaTrendsContract';
import { standardMetaClassIcon } from './standardMetaClassModel';
import {
  STANDARD_META_LOW_SAMPLE_GAMES,
  sortStandardMetaItems,
  standardMetaWinrateEstimate,
  type StandardMetaSort,
  type StandardMetaSortKey,
} from './standardMetaTableModel';
import { point, WinrateCell, WinrateSparkline } from './StandardMetaWinrateCells';
import { useStandardMetaTrends, type StandardMetaTrendsQuery } from './useStandardMetaTrends';
import '../vendor/varylo-ui/styles/index.css';
import './StandardMetaVarylo.css';
import './StandardMetaArchetypeTable.css';

const number = (value: number | null, digits = 1, suffix = '') => (
  value === null ? '—' : `${value.toLocaleString('ru-RU', { maximumFractionDigits: digits })}${suffix}`
);

const COLUMNS: Array<{ key: StandardMetaSortKey; label: string; short?: string; secondary?: boolean }> = [
  { key: 'archetype', label: 'Архетип' },
  { key: 'winrate', label: 'Винрейт' },
  { key: 'popularity', label: 'Популярность', short: 'Попул.' },
  { key: 'games', label: 'Игры' },
  { key: 'turns', label: 'Ходы', secondary: true },
  { key: 'durationMinutes', label: 'Длительность', short: 'Мин', secondary: true },
  { key: 'climbingSpeed', label: 'Набор', short: '★/ч', secondary: true },
];

export type StandardMetaArchetypeTableProps = StandardMetaTrendsQuery & {
  items: StandardMetaItem[];
  /** Place of each archetype in the source order (by win rate). */
  rankById: ReadonlyMap<string, number>;
  formatLabel: string;
  rankLabel: string;
  periodLabel: string;
};

/**
 * The meta as a dense table: win rate first, with its 95% interval against
 * 50%, then the share of games; turns, duration and climb speed recede. The
 * whole row links to the archetype. Below 640px every row is a card.
 */
export default function StandardMetaArchetypeTable(props: StandardMetaArchetypeTableProps) {
  const { items, rankById, format, formatLabel, rankLabel, periodLabel, loadTrends } = props;
  const [sort, setSort] = useState<StandardMetaSort>({ key: null, direction: 'desc' });
  const { trends, error } = useStandardMetaTrends(props);
  const trendById = useMemo(() => new Map(trends?.items.map(item => [item.id, item]) ?? []), [trends]);
  const rows = useMemo(() => sortStandardMetaItems(items, sort, rankById), [items, sort, rankById]);
  const maxPopularity = useMemo(() => Math.max(0, ...items.map(item => item.popularity ?? 0)), [items]);
  const comparison = trends?.comparison ?? null;
  const changeSort = (key: StandardMetaSortKey) => setSort(current => (current.key === key
    ? { key, direction: current.direction === 'desc' ? 'asc' : 'desc' }
    : { key, direction: key === 'archetype' ? 'asc' : 'desc' }));
  const missing = !loadTrends ? 'Изменение и тренд доступны с подпиской.'
    : error ? `Изменение и тренд не загрузились: ${error}`
      : trends && !comparison ? `Для периода «${periodLabel}» источник не даёт предыдущего окна, поэтому изменение не показано.` : '';

  return (
    <section className="standard-meta-archetypes standard-meta-varylo" data-meta-surface="table" aria-label={`Таблица архетипов: ${formatLabel}, ${rankLabel}`}>
      <label className="standard-meta-archetypes__mobile-sort">
        <span>Сортировка</span>
        <select
          value={sort.key ? `${sort.key}:${sort.direction}` : ''}
          onChange={event => {
            const [key, direction] = event.target.value.split(':') as [StandardMetaSortKey | '', 'asc' | 'desc'];
            setSort({ key: key || null, direction: direction ?? 'desc' });
          }}
        >
          <option value="">По винрейту источника</option>
          <option value="winrate:asc">Винрейт, по возрастанию</option>
          <option value="popularity:desc">Популярность</option>
          <option value="games:desc">Игры</option>
          <option value="climbingSpeed:desc">Набор звёзд</option>
          <option value="archetype:asc">Название</option>
        </select>
      </label>
      <TableSurface title="Мета: архетипы">
        <table className="standard-meta-table">
          <caption className="sr-only">Мета Hearthstone: {formatLabel}, {rankLabel}, {periodLabel}</caption>
          <thead>
            <tr>
              <th scope="col" className="standard-meta-table__position" data-export-value="Место"><span className="sr-only">Место</span>#</th>
              {COLUMNS.slice(0, 2).map(column => <SortHeading key={column.key} column={column} sort={sort} onSort={changeSort} />)}
              {loadTrends && <th scope="col" className="standard-meta-table__trend">Тренд</th>}
              {COLUMNS.slice(2).map(column => <SortHeading key={column.key} column={column} sort={sort} onSort={changeSort} />)}
            </tr>
          </thead>
          <tbody>
            {rows.map((item, index) => (
              <ArchetypeRow
                key={item.id}
                item={item}
                position={rankById.get(item.id) ?? index + 1}
                href={canonicalPagePath(`/standard/archetypes/${format}/${item.slug}`)}
                tourTarget={index === 0}
                trend={trendById.get(item.id) ?? null}
                showChange={Boolean(comparison)}
                showTrend={loadTrends}
                buckets={trends?.buckets ?? []}
                maxPopularity={maxPopularity}
              />
            ))}
          </tbody>
        </table>
      </TableSurface>
      <p className="standard-meta-archetypes__legend">
        <span className="standard-meta-archetypes__legend-bar" aria-hidden="true"><i /></span>
        Полоса винрейта отсчитана от 50%, светлая зона — 95% доверительный интервал Уилсона: чем меньше игр, тем он шире.
        {' '}Бледные строки — меньше {STANDARD_META_LOW_SAMPLE_GAMES.toLocaleString('ru-RU')} игр, оценка приблизительная.
        {comparison && <> Изменение — {comparison.label} ({comparison.description}).</>}
        {trends && <> Тренд — винрейт в окнах {trends.buckets.join(' → ')}.</>}
        {missing && <strong> {missing}</strong>}
      </p>
    </section>
  );
}

function SortHeading({ column, sort, onSort }: {
  column: (typeof COLUMNS)[number];
  sort: StandardMetaSort;
  onSort: (key: StandardMetaSortKey) => void;
}) {
  const active = sort.key === column.key;
  const directionLabel = active && sort.direction === 'asc' ? 'по возрастанию' : 'по убыванию';
  return (
    <th
      scope="col"
      className={`standard-meta-table__sortable-heading standard-meta-table__${column.key}${column.secondary ? ' standard-meta-table__secondary' : ''}`}
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
      data-export-value={column.label}
    >
      <button
        type="button"
        className="standard-meta-table__sort-button"
        data-sort-key={column.key}
        data-active={active ? 'true' : 'false'}
        onClick={() => onSort(column.key)}
        aria-label={`Сортировать по ${column.label.toLowerCase()}${active ? `, сейчас ${directionLabel}` : ''}`}
        title={column.short ? column.label : undefined}
      >
        <span>{column.short ?? column.label}</span>
        {active ? (sort.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ChevronsUpDown size={12} />}
      </button>
    </th>
  );
}

type ArchetypeRowProps = {
  item: StandardMetaItem;
  position: number;
  href: string;
  tourTarget: boolean;
  trend: StandardMetaTrendItem | null;
  showChange: boolean;
  showTrend: boolean;
  buckets: string[];
  maxPopularity: number;
};

function ArchetypeRow({ item, position, href, tourTarget, trend, showChange, showTrend, buckets, maxPopularity }: ArchetypeRowProps) {
  const estimate = standardMetaWinrateEstimate(item.winrate, item.games);
  const previous = showChange ? trend?.previous?.winrate ?? null : null;
  const change = previous !== null && item.winrate !== null ? item.winrate - previous : null;
  const share = item.popularity !== null && maxPopularity > 0 ? (item.popularity / maxPopularity) * 100 : 0;
  return (
    <tr data-meta-archetype={item.id} data-low-sample={estimate?.lowSample ? '' : undefined}>
      <td className="standard-meta-table__position">{position}</td>
      <th scope="row" className="standard-meta-table__archetype" data-export-value={item.archetypeLabel}>
        <img src={standardMetaClassIcon(item.classKey)} alt="" width="28" height="28" loading="lazy" decoding="async" />
        <span className="standard-meta-table__name">
          <a className="standard-meta-table__link" href={href} data-tour-id={tourTarget ? 'meta-deck-action' : undefined}>
            {item.archetypeLabel}
          </a>
          <small>{item.translated ? item.archetype : 'перевод ожидается'}</small>
        </span>
      </th>
      <td className="standard-meta-table__winrate" data-label="Винрейт" data-export-value={number(item.winrate, 1, '%')}>
        <WinrateCell estimate={estimate} change={change} />
      </td>
      {showTrend && (
        <td className="standard-meta-table__trend" data-label="Тренд" data-export-value="">
          <WinrateSparkline winrates={trend?.winrates ?? null} buckets={buckets} />
        </td>
      )}
      <td className="standard-meta-table__popularity" data-label="Популярность" data-export-value={number(item.popularity, 2, '%')}>
        <span className="standard-meta-table__share">
          <span>{item.popularity === null ? '—' : `${point(item.popularity)}%`}</span>
          <span className="standard-meta-table__share-bar" aria-hidden="true"><i style={{ inlineSize: `${share}%` }} /></span>
        </span>
      </td>
      <td className="standard-meta-table__games" data-label="Игры" data-export-value={item.games ?? ''}>
        {item.games?.toLocaleString('ru-RU') ?? '—'}
        {estimate?.lowSample && <span className="standard-meta-table__low-sample">мало</span>}
      </td>
      <td className="standard-meta-table__secondary" data-label="Ходы">{number(item.turns)}</td>
      <td className="standard-meta-table__secondary" data-label="Мин">{number(item.durationMinutes)}</td>
      <td
        className={`standard-meta-table__secondary${item.climbingSpeed !== null && item.climbingSpeed < 0 ? ' standard-meta-table__climb--negative' : ''}`}
        data-label="★/ч"
      >
        {number(item.climbingSpeed, 2)}
      </td>
    </tr>
  );
}
