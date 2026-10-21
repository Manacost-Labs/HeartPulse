import React, { useCallback, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, CircleHelp, ExternalLink, Sparkles } from 'lucide-react';
import { DataTable, type DataTableColumn } from '../shared/ui/varylo-ui/data-display/DataTable';
import { csvDocument } from '../shared/ui/analytics/analyticsModel';
import { constructedCardHorizontalArtwork } from '../modules/constructedCards/public';
import CardPreviewTooltip, { type CardPreviewTarget } from './CardPreviewTooltip';
import {
  cardStatImpactScale,
  cardStatsCsvRows,
  hsguruAnalysisEmptyMessage,
  hsguruImpactTone,
  isLowCardSample,
  LOW_CARD_SAMPLE,
  nextCardStatSort,
  sortHsguruCardStats,
  type HsguruAnalysisState,
  type HsguruCardStatImpactKey,
  type HsguruCardStatSort,
  type HsguruCardStatSortKey,
} from './archetypeDetailModel';
import { publicResourceUrl } from '../publicResourceUrl';
import '../shared/ui/varylo-ui/styles/index.css';
import './ConstructedArchetypeCardStats.css';

const CardPreviewSheet = React.lazy(() => import('./CardPreviewSheet'));

export type ConstructedCardStat = {
  cardId: string | null;
  dbfId: number | null;
  cardName: string;
  cost: number | null;
  tile?: string | null;
  artwork?: string | null;
  fullArtwork?: string | null;
  rarity?: string | null;
  mulliganImpact: number | null;
  mulliganCount: number;
  drawnImpact: number | null;
  drawnCount: number | null;
  keptImpact: number | null;
  keptCount: number | null;
};

type CardStatsSource = {
  state: HsguruAnalysisState;
  cardStatsUpdatedAt: string | null;
  sourceUrls: { cards: string };
  cardStats: ConstructedCardStat[];
};

type Phase = {
  impact: HsguruCardStatImpactKey;
  count: HsguruCardStatSortKey;
  label: string;
  sample: string;
  description: string;
};

/** Impact and sample of one phase share a cell; each phase keeps its own definition tooltip. */
const PHASES: readonly Phase[] = [
  {
    impact: 'mulliganImpact', count: 'mulliganCount', label: 'Муллиган', sample: 'муллиганов',
    description: 'Разница между винрейтом матчей, где карта была в муллигане, и общим винрейтом колоды. Включает оставленные и заменённые карты. Ниже — сколько раз карта попадала на муллиган.',
  },
  {
    impact: 'drawnImpact', count: 'drawnCount', label: 'Добор', sample: 'доборов',
    description: 'Разница между винрейтом матчей, где карта была добрана, и общим винрейтом колоды. Ниже — сколько раз карту добрали.',
  },
  {
    impact: 'keptImpact', count: 'keptCount', label: 'Оставлена', sample: 'оставлений',
    description: 'Разница между винрейтом матчей, где карту оставили в муллигане, и общим винрейтом колоды. Ниже — сколько раз карту оставили.',
  },
];

const SORT_OPTIONS: ReadonlyArray<{ key: HsguruCardStatSortKey; label: string }> = PHASES.flatMap(phase => [
  { key: phase.impact, label: `${phase.label}: влияние` },
  { key: phase.count, label: `${phase.label}: выборка` },
]);

/** The table's first page; «show all» reveals the rest. */
export const CARD_STATS_FIRST_PAGE = 15;

function phaseOf(key: HsguruCardStatSortKey): Phase {
  return PHASES.find(phase => phase.impact === key || phase.count === key) ?? PHASES[0];
}

function formatImpact(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

function formatCount(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : Math.round(value).toLocaleString('ru-RU');
}

function cardRenderUrl(cardId: string): string {
  return `/api/public-resource/hsjson/v1/render/latest/ruRU/512x/${encodeURIComponent(cardId)}.png`;
}

export function InfoTip({ label, description }: { label: string; description: string }) {
  return (
    <span className="constructed-analysis-tip">
      <button type="button" aria-label={`${label}: ${description}`}>
        <CircleHelp aria-hidden="true" />
      </button>
      <span role="tooltip">
        <strong>{label}</strong>
        {description}
      </span>
    </span>
  );
}

/** Small art, mana and the full name: the provider's tile image bakes a truncated name into pixels. */
function CardName({ row }: { row: ConstructedCardStat }) {
  const [artFailed, setArtFailed] = useState(false);
  const art = publicResourceUrl(row.artwork) || (row.cardId ? constructedCardHorizontalArtwork(row.cardId) : '');
  return (
    <span className="card-stat-name" data-rarity={(row.rarity || 'common').trim().toLowerCase()}>
      <span className="card-stat-name__thumb" aria-hidden="true">
        {art && !artFailed ? <img src={art} alt="" width={320} height={64} loading="lazy" decoding="async" onError={() => setArtFailed(true)} /> : null}
        <b>{row.cost ?? '—'}</b>
      </span>
      <span className="card-stat-name__text">{row.cardName}</span>
    </span>
  );
}

function PhaseValue({ row, phase, scale }: { row: ConstructedCardStat; phase: Phase; scale: number }) {
  const impact = row[phase.impact];
  const count = row[phase.count];
  const share = impact === null || !Number.isFinite(impact) ? 0 : Math.min(1, Math.abs(impact) / scale);
  return (
    <span className="card-stat-phase" data-impact={hsguruImpactTone(impact)} data-low-sample={isLowCardSample(count) || undefined}>
      <span className="card-stat-phase__line">
        <strong>{formatImpact(impact)}</strong>
        <span className="card-stat-phase__bar" aria-hidden="true">
          <i style={{ inlineSize: `${share * 50}%`, insetInlineStart: impact !== null && impact < 0 ? `${50 - share * 50}%` : '50%' }} />
        </span>
      </span>
      <small>{formatCount(count)} {phase.sample}</small>
    </span>
  );
}

type CardStatsTableProps = {
  rows: ConstructedCardStat[];
  sort: HsguruCardStatSort;
  scales: Record<HsguruCardStatImpactKey, number>;
  rowKeys: Map<ConstructedCardStat, string>;
  onSort: (key: HsguruCardStatSortKey) => void;
  onOpen: (row: ConstructedCardStat) => void;
  onPreview: (row: ConstructedCardStat, target: HTMLElement) => void;
  onPreviewEnd: () => void;
};

function CardStatsTable({ rows, sort, scales, rowKeys, onSort, onOpen, onPreview, onPreviewEnd }: CardStatsTableProps) {
  const sortedPhase = phaseOf(sort.key);
  const columns = useMemo<DataTableColumn<ConstructedCardStat>[]>(() => [
    {
      key: 'card',
      header: 'Карта',
      width: '34%',
      cell: row => {
        const name = <CardName row={row} />;
        return (
          <span className="card-stat-row" data-low-sample={isLowCardSample(row[sortedPhase.count]) || undefined}>
            {row.cardId ? (
              <button
                type="button"
                className="card-stat-open"
                onClick={() => onOpen(row)}
                onMouseEnter={event => onPreview(row, event.currentTarget)}
                onMouseLeave={onPreviewEnd}
                onFocus={event => onPreview(row, event.currentTarget)}
                onBlur={onPreviewEnd}
                aria-label={`${row.cardName}, ${row.cost ?? 'неизвестная стоимость'} маны. Открыть полную карту`}
              >{name}</button>
            ) : name}
          </span>
        );
      },
    },
    ...PHASES.map(phase => ({
      key: phase.impact,
      header: phase.label,
      sortable: true,
      width: '22%',
      cell: (row: ConstructedCardStat) => <PhaseValue row={row} phase={phase} scale={scales[phase.impact]} />,
    })),
  ], [onOpen, onPreview, onPreviewEnd, scales, sortedPhase]);

  return (
    <div className="constructed-card-stats__table">
      <DataTable
        data={rows}
        columns={columns}
        label="Муллиган и влияние карт"
        getRowId={row => rowKeys.get(row) ?? row.cardName}
        // The rows arrive in this order already; the table only shows which column leads.
        sort={sort}
        onSortChange={next => onSort((next?.key ?? sort.key) as HsguruCardStatSortKey)}
        density="compact"
        locale="ru-RU"
        labels={{ empty: 'Нет карт' }}
      />
    </div>
  );
}

function CardStatsList({ rows, sort, scales, rowKeys, onOpen }: Pick<CardStatsTableProps, 'rows' | 'sort' | 'scales' | 'rowKeys' | 'onOpen'>) {
  const sortedPhase = phaseOf(sort.key);
  return (
    <ol className="constructed-card-stats__list">
      {rows.map(row => (
        <li key={rowKeys.get(row)} data-low-sample={isLowCardSample(row[sortedPhase.count]) || undefined}>
          <details>
            <summary>
              <CardName row={row} />
              <span className="constructed-card-stats__lead">
                <PhaseValue row={row} phase={sortedPhase} scale={scales[sortedPhase.impact]} />
              </span>
              <ChevronDown className="constructed-card-stats__chevron" aria-hidden="true" />
            </summary>
            <dl>
              {PHASES.map(phase => (
                <div key={phase.impact}>
                  <dt>{phase.label}</dt>
                  <dd><PhaseValue row={row} phase={phase} scale={scales[phase.impact]} /></dd>
                </div>
              ))}
            </dl>
            {row.cardId ? <button type="button" className="constructed-card-stats__open" onClick={() => onOpen(row)}>Открыть карту</button> : null}
          </details>
        </li>
      ))}
    </ol>
  );
}

// Cards can have multiple observations; key by source position before sorting.
function cardStatKeys(rows: readonly ConstructedCardStat[]) {
  return new Map(rows.map((row, sourcePosition) => [row, `${row.cardId || row.dbfId || row.cardName}-${sourcePosition}`]));
}

function formatDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'срез ещё не готов';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

async function downloadCsv(rows: readonly ConstructedCardStat[]) {
  const { header, rows: body } = cardStatsCsvRows(rows);
  const exporter = await import('../shared/ui/analytics/chartExport');
  exporter.downloadBlob(new Blob([csvDocument(header, body)], { type: 'text/csv;charset=utf-8' }), 'Муллиган и влияние карт.csv');
}

/** The toolbar is shared by the desktop table and the phone list, so every metric stays sortable at any width. */
function CardStatsToolbar({ sort, onSort, onDirection, onCsv, csvError }: {
  sort: HsguruCardStatSort;
  onSort: (key: HsguruCardStatSortKey) => void;
  onDirection: () => void;
  onCsv: () => void;
  csvError: boolean;
}) {
  const descending = sort.direction === 'desc';
  return (
    <div className="constructed-card-stats__toolbar">
      <label className="constructed-card-stats__sort">
        <span>Сортировка</span>
        <select value={sort.key} onChange={event => onSort(event.target.value as HsguruCardStatSortKey)}>
          {SORT_OPTIONS.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
      </label>
      <button type="button" className="constructed-card-stats__direction" onClick={onDirection}
        aria-label={descending ? 'Сейчас по убыванию. Сортировать по возрастанию' : 'Сейчас по возрастанию. Сортировать по убыванию'}>
        {descending ? <ArrowDown aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
      </button>
      <span className="constructed-card-stats__legend">
        {PHASES.map(phase => <span key={phase.impact}>{phase.label}<InfoTip label={phase.label} description={phase.description} /></span>)}
        <span className="constructed-card-stats__low">Бледные — выборка меньше {LOW_CARD_SAMPLE}</span>
      </span>
      <button type="button" className="constructed-card-stats__csv" onClick={onCsv} aria-label="Скачать таблицу муллигана: CSV">CSV</button>
      {csvError ? <p className="analytics-chart__error" role="alert">Не удалось скачать таблицу. Попробуйте ещё раз.</p> : null}
    </div>
  );
}

export function CardStatsPanel({ analysis }: { analysis: CardStatsSource | null }) {
  const [sort, setSort] = useState<HsguruCardStatSort>({ key: 'mulliganImpact', direction: 'desc' });
  const [showAll, setShowAll] = useState(false);
  const [csvError, setCsvError] = useState(false);
  const [preview, setPreview] = useState<CardPreviewTarget | null>(null);
  const [selectedCard, setSelectedCard] = useState<ConstructedCardStat | null>(null);
  const cardStats = analysis?.cardStats;
  const rows = useMemo(() => sortHsguruCardStats(cardStats ?? [], sort), [cardStats, sort]);
  const rowKeys = useMemo(() => cardStatKeys(cardStats ?? []), [cardStats]);
  const scales = useMemo(() => Object.fromEntries(PHASES.map(phase =>
    [phase.impact, cardStatImpactScale(cardStats ?? [], phase.impact)])) as Record<HsguruCardStatImpactKey, number>, [cardStats]);
  const visibleRows = useMemo(() => showAll ? rows : rows.slice(0, CARD_STATS_FIRST_PAGE), [rows, showAll]);
  const selectedPreviewCard = selectedCard?.cardId
    ? { id: selectedCard.cardId, name: selectedCard.cardName, imageUrl: cardRenderUrl(selectedCard.cardId) }
    : null;
  const changeSort = (key: HsguruCardStatSortKey) => setSort(current => nextCardStatSort(current, key));
  const pickSort = (key: HsguruCardStatSortKey) => setSort(current => current.key === key ? current : { key, direction: 'desc' });
  const showPreview = useCallback((row: ConstructedCardStat, target: HTMLElement) => {
    if (row.cardId) setPreview({ id: row.cardId, name: row.cardName, imageUrl: cardRenderUrl(row.cardId), rect: target.getBoundingClientRect() });
  }, []);
  const hidePreview = useCallback(() => setPreview(null), []);
  const exportCsv = () => {
    setCsvError(false);
    downloadCsv(visibleRows).catch(() => setCsvError(true));
  };

  return (
    <section className="constructed-analysis-panel constructed-card-stats" aria-labelledby="constructed-card-stats-title">
      <header className="constructed-analysis-heading">
        <div>
          <span className="archetypes-eyebrow"><Sparkles aria-hidden="true" /> Статистика карт</span>
          <h2 id="constructed-card-stats-title">Муллиган и влияние карт</h2>
          <p>
            Влияние — разница с средним винрейтом архетипа: зелёное выше среднего, красное ниже. Под значением — размер выборки.
            {' '}
            <InfoTip
              label="Влияние на винрейт"
              description="Насколько событие, связанное с картой, меняет винрейт относительно среднего винрейта колоды."
            />
          </p>
        </div>
        <span className="archetype-section-heading__count">{rows.length} карт</span>
      </header>

      {visibleRows.length ? (
        <>
          <CardStatsToolbar sort={sort} onSort={pickSort} onDirection={() => changeSort(sort.key)} onCsv={exportCsv} csvError={csvError} />
          <CardStatsTable rows={visibleRows} sort={sort} scales={scales} rowKeys={rowKeys} onSort={changeSort}
            onOpen={setSelectedCard} onPreview={showPreview} onPreviewEnd={hidePreview} />
          <CardStatsList rows={visibleRows} sort={sort} scales={scales} rowKeys={rowKeys} onOpen={setSelectedCard} />
        </>
      ) : (
        <p className="constructed-analysis-empty">
          {hsguruAnalysisEmptyMessage(analysis?.state ?? null, 'cards')}
        </p>
      )}

      {rows.length > CARD_STATS_FIRST_PAGE && !showAll ? (
        <button type="button" className="constructed-card-stats__more" onClick={() => setShowAll(true)}>
          Показать все {rows.length} карт <ChevronDown aria-hidden="true" />
        </button>
      ) : null}
      <footer className="constructed-analysis-source">
        <span>Обновлено: {formatDate(analysis?.cardStatsUpdatedAt ?? null)}</span>
        {analysis?.sourceUrls.cards ? (
          <a href={analysis.sourceUrls.cards} target="_blank" rel="noreferrer">
            Проверить на HSGuru <ExternalLink aria-hidden="true" />
          </a>
        ) : null}
      </footer>
      {preview ? <CardPreviewTooltip preview={preview} /> : null}
      {selectedPreviewCard ? (
        <React.Suspense fallback={null}>
          <CardPreviewSheet card={selectedPreviewCard} onClose={() => setSelectedCard(null)} />
        </React.Suspense>
      ) : null}
    </section>
  );
}
