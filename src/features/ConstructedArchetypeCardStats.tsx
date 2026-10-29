import React, { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ExternalLink, Sparkles } from 'lucide-react';
import { DataTable, type DataTableColumn } from '../vendor/varylo-ui/data-display/DataTable';
import { csvDocument } from '../shared/ui/analytics/analyticsModel';
import CardPreviewTooltip, { type CardPreviewTarget } from './CardPreviewTooltip';
import {
  cardStatImpactScale,
  cardStatsCsvRows,
  hsguruAnalysisEmptyMessage,
  isLowCardSample,
  nextCardStatSort,
  sortHsguruCardStats,
  type HsguruAnalysisState,
  type HsguruCardStatImpactKey,
  type HsguruCardStatSort,
  type HsguruCardStatSortKey,
} from './archetypeDetailModel';
import {
  CARD_STATS_FIRST_PAGE, CardStatsList, CardStatsToolbar, CardTile, InfoTip, PhaseValue, cardStatPhases, phaseOf,
  type ConstructedCardStat, type Phase,
} from './ConstructedArchetypeCardStatsCells';
import { registerLightboxModule } from '../shared/ui/lightboxIntent';
import '../vendor/varylo-ui/styles/index.css';
import './ConstructedArchetypeCardStats.css';

export type { ConstructedCardStat };

const loadCardPreviewSheet = () => import('./CardPreviewSheet');
const CardPreviewSheet = React.lazy(loadCardPreviewSheet);
// The sheet's chunk downloads at idle, and at the latest on a hover, focus or touch (lightboxIntent).
registerLightboxModule('card-preview', loadCardPreviewSheet, { idle: true });


type CardStatsSource = {
  state: HsguruAnalysisState;
  cardStatsUpdatedAt: string | null;
  sourceUrls: { cards: string };
  cardStats: ConstructedCardStat[];
};

function cardRenderUrl(cardId: string): string {
  return `/api/public-resource/hsjson/v1/render/latest/ruRU/512x/${encodeURIComponent(cardId)}.png`;
}

type CardStatsTableProps = {
  rows: ConstructedCardStat[];
  phases: readonly Phase[];
  sort: HsguruCardStatSort;
  scales: Record<HsguruCardStatImpactKey, number>;
  rowKeys: Map<ConstructedCardStat, string>;
  onSort: (key: HsguruCardStatSortKey) => void;
  onOpen: (row: ConstructedCardStat) => void;
  onPreview: (row: ConstructedCardStat, target: HTMLElement) => void;
  onPreviewEnd: () => void;
};

function CardStatsTable({ rows, phases, sort, scales, rowKeys, onSort, onOpen, onPreview, onPreviewEnd }: CardStatsTableProps) {
  const sortedPhase = phaseOf(sort.key, phases);
  // Four phases leave the card a narrower column than the older three.
  const phaseWidth = phases.length > 3 ? '18%' : '22%';
  const columns = useMemo<DataTableColumn<ConstructedCardStat>[]>(() => [
    {
      key: 'card',
      header: 'Карта',
      width: phases.length > 3 ? '28%' : '34%',
      cell: row => {
        const name = <CardTile row={row} />;
        const low = isLowCardSample(row[sortedPhase.count] ?? null);
        return (
          <span className="card-stat-row" data-low-sample={low || undefined}>
            {row.cardId ? (
              <button
                type="button"
                className="card-stat-open"
                data-lightbox-module="card-preview"
                data-lightbox-src={cardRenderUrl(row.cardId)}
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
    ...phases.map(phase => ({
      key: phase.impact,
      header: phase.label,
      sortable: true,
      width: phaseWidth,
      cell: (row: ConstructedCardStat) => <PhaseValue row={row} phase={phase} scale={scales[phase.impact]} />,
    })),
  ], [onOpen, onPreview, onPreviewEnd, phaseWidth, phases, scales, sortedPhase]);

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

/**
 * `scope` names the slice in the eyebrow («HSGuru · Легенда · После банов»); `empty`
 * replaces the default message while a slice is still being collected.
 */
export function CardStatsPanel({ analysis, scope, empty }: { analysis: CardStatsSource | null; scope?: string; empty?: ReactNode }) {
  const [sort, setSort] = useState<HsguruCardStatSort>({ key: 'mulliganImpact', direction: 'desc' });
  const [showAll, setShowAll] = useState(false);
  const [csvError, setCsvError] = useState(false);
  const [preview, setPreview] = useState<CardPreviewTarget | null>(null);
  const [selectedCard, setSelectedCard] = useState<ConstructedCardStat | null>(null);
  const cardStats = analysis?.cardStats;
  const rows = useMemo(() => sortHsguruCardStats(cardStats ?? [], sort), [cardStats, sort]);
  const rowKeys = useMemo(() => cardStatKeys(cardStats ?? []), [cardStats]);
  const phases = useMemo(() => cardStatPhases(cardStats ?? []), [cardStats]);
  const scales = useMemo(() => Object.fromEntries(phases.map(phase =>
    [phase.impact, cardStatImpactScale(cardStats ?? [], phase.impact)])) as Record<HsguruCardStatImpactKey, number>, [cardStats, phases]);
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
          <span className="archetypes-eyebrow"><Sparkles aria-hidden="true" /> {scope ?? 'Статистика карт'}</span>
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
          <CardStatsToolbar phases={phases} sort={sort} onSort={pickSort} onDirection={() => changeSort(sort.key)} onCsv={exportCsv} csvError={csvError} />
          <CardStatsTable rows={visibleRows} phases={phases} sort={sort} scales={scales} rowKeys={rowKeys} onSort={changeSort}
            onOpen={setSelectedCard} onPreview={showPreview} onPreviewEnd={hidePreview} />
          <CardStatsList rows={visibleRows} phases={phases} sort={sort} scales={scales} rowKeys={rowKeys} onOpen={setSelectedCard} />
        </>
      ) : empty ?? (
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
