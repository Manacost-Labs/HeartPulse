import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, CircleAlert, CircleHelp } from 'lucide-react';
import {
  hsguruImpactTone,
  isLowCardSample,
  LOW_CARD_SAMPLE,
  type HsguruCardStatImpactKey,
  type HsguruCardStatSort,
  type HsguruCardStatSortKey,
} from './archetypeDetailModel';
import { publicResourceImageUrl, publicResourceUrl } from '../publicResourceUrl';

// Cells, the phone list and the toolbar of the mulligan table (ConstructedArchetypeCardStats).


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
  /** Only the full HSGuru slice has Not Drawn. */
  notDrawnImpact?: number | null;
  notDrawnCount?: number | null;
  keptImpact: number | null;
  keptCount: number | null;
};

export type Phase = {
  impact: HsguruCardStatImpactKey;
  count: HsguruCardStatSortKey;
  label: string;
  sample: string;
  description: string;
};

const MULLIGAN_PHASE: Phase = {
  impact: 'mulliganImpact', count: 'mulliganCount', label: 'Муллиган', sample: 'муллиганов',
  description: 'Разница между винрейтом матчей, где карта была в муллигане, и общим винрейтом колоды. Включает оставленные и заменённые карты. Ниже — сколько раз карта попадала на муллиган.',
};
const DRAWN_PHASE: Phase = {
  impact: 'drawnImpact', count: 'drawnCount', label: 'Добор', sample: 'доборов',
  description: 'Разница между винрейтом матчей, где карта была добрана, и общим винрейтом колоды. Ниже — сколько раз карту добрали.',
};
const NOT_DRAWN_PHASE: Phase = {
  impact: 'notDrawnImpact', count: 'notDrawnCount', label: 'Не пришла', sample: 'партий',
  description: 'Разница между винрейтом матчей, где карта так и не пришла в руку, и общим винрейтом колоды. Ниже — сколько было таких партий.',
};
const KEPT_PHASE: Phase = {
  impact: 'keptImpact', count: 'keptCount', label: 'Оставлена', sample: 'оставлений',
  description: 'Разница между винрейтом матчей, где карту оставили в муллигане, и общим винрейтом колоды. Ниже — сколько раз карту оставили.',
};

/** Impact and sample of one phase share a cell; each phase keeps its own definition tooltip. */
export const PHASES: readonly Phase[] = [MULLIGAN_PHASE, DRAWN_PHASE, KEPT_PHASE];
const FULL_PHASES: readonly Phase[] = [MULLIGAN_PHASE, DRAWN_PHASE, NOT_DRAWN_PHASE, KEPT_PHASE];

/** HSGuru's four phases when the rows carry Not Drawn, otherwise the three of the older slice. */
export function cardStatPhases(rows: readonly ConstructedCardStat[]): readonly Phase[] {
  return rows.some(row => row.notDrawnCount !== undefined && row.notDrawnCount !== null) ? FULL_PHASES : PHASES;
}

const LOW_SAMPLE_HINT = `Мало данных: выборка меньше ${LOW_CARD_SAMPLE}, влияние неустойчиво`;

/** The table's first page; «show all» reveals the rest. */
export const CARD_STATS_FIRST_PAGE = 15;

export function phaseOf(key: HsguruCardStatSortKey, phases: readonly Phase[] = PHASES): Phase {
  return phases.find(phase => phase.impact === key || phase.count === key) ?? phases[0];
}

function formatImpact(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

function formatCount(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : Math.round(value).toLocaleString('ru-RU');
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

/** What a tile draws; resolved deck cards map onto it as well as card statistics. */
type TileCard = Pick<ConstructedCardStat, 'cardId' | 'cardName' | 'cost' | 'rarity' | 'artwork'>;

/**
 * The art band of a deck tile. A 256 px trimmed original covers the tile's art area at
 * twice its size; the 320x64 horizontal provider art is only the fallback.
 */
function tileArtUrl(row: TileCard): string {
  if (row.cardId) {
    return `${publicResourceImageUrl(`/api/public-resource/hsjson/v1/orig/${encodeURIComponent(row.cardId)}.png`, { width: 256 })}&trim=1`;
  }
  return publicResourceUrl(row.artwork);
}

/** A decklist tile: rarity edge, drawn mana gem, the whole name, and art fading in from the right. */
export function CardTile({ row }: { row: TileCard }) {
  const [artFailed, setArtFailed] = useState(false);
  const art = tileArtUrl(row);
  return (
    <span className="card-stat-tile" data-rarity={(row.rarity || 'common').trim().toLowerCase()}>
      {art && !artFailed ? <img className="card-stat-tile__art" src={art} alt="" loading="lazy" decoding="async" onError={() => setArtFailed(true)} /> : null}
      <b className="card-stat-tile__mana" aria-hidden="true">{row.cost ?? '?'}</b>
      <span className="card-stat-tile__name">{row.cardName}</span>
    </span>
  );
}

export function PhaseValue({ row, phase, scale }: { row: ConstructedCardStat; phase: Phase; scale: number }) {
  const impact = row[phase.impact] ?? null;
  const count = row[phase.count] ?? null;
  const share = impact === null || !Number.isFinite(impact) ? 0 : Math.min(1, Math.abs(impact) / scale);
  return (
    <span className="card-stat-phase" data-impact={hsguruImpactTone(impact)} data-low-sample={isLowCardSample(count) || undefined}>
      <span className="card-stat-phase__line">
        <strong>{formatImpact(impact)}</strong>
        <span className="card-stat-phase__bar" aria-hidden="true">
          <i style={{ inlineSize: `${share * 50}%`, insetInlineStart: impact !== null && impact < 0 ? `${50 - share * 50}%` : '50%' }} />
        </span>
      </span>
      <small>
        {formatCount(count)} {phase.sample}
        {isLowCardSample(count) ? (
          <span className="card-stat-phase__low" role="img" aria-label={LOW_SAMPLE_HINT} title={LOW_SAMPLE_HINT}><CircleAlert aria-hidden="true" /></span>
        ) : null}
      </small>
    </span>
  );
}

function CardStatsListItem({ row, phases, sortedPhase, scales, onOpen }: {
  row: ConstructedCardStat;
  phases: readonly Phase[];
  sortedPhase: Phase;
  scales: Record<HsguruCardStatImpactKey, number>;
  onOpen: (row: ConstructedCardStat) => void;
}) {
  const [open, setOpen] = useState(false);
  const low = isLowCardSample(row[sortedPhase.count] ?? null);
  const tile = <CardTile row={row} />;
  return (
    <li data-low-sample={low || undefined}>
      <div className="constructed-card-stats__row">
        {row.cardId
          ? <button type="button" className="card-stat-open" onClick={() => onOpen(row)}
              aria-label={`${row.cardName}, ${row.cost ?? 'неизвестная стоимость'} маны. Открыть полную карту`}>{tile}</button>
          : tile}
        <button type="button" className="constructed-card-stats__lead" aria-expanded={open} onClick={() => setOpen(value => !value)}
          aria-label={`${row.cardName}: все этапы`}>
          <PhaseValue row={row} phase={sortedPhase} scale={scales[sortedPhase.impact]} />
          <ChevronDown className="constructed-card-stats__chevron" aria-hidden="true" />
        </button>
      </div>
      {open ? (
        <dl>
          {phases.map(phase => (
            <div key={phase.impact}>
              <dt>{phase.label}</dt>
              <dd><PhaseValue row={row} phase={phase} scale={scales[phase.impact]} /></dd>
            </div>
          ))}
        </dl>
      ) : null}
    </li>
  );
}

export function CardStatsList({ rows, phases, sort, scales, rowKeys, onOpen }: {
  rows: ConstructedCardStat[];
  phases: readonly Phase[];
  sort: HsguruCardStatSort;
  scales: Record<HsguruCardStatImpactKey, number>;
  rowKeys: Map<ConstructedCardStat, string>;
  onOpen: (row: ConstructedCardStat) => void;
}) {
  const sortedPhase = phaseOf(sort.key, phases);
  return (
    <ol className="constructed-card-stats__list">
      {rows.map(row => <CardStatsListItem key={rowKeys.get(row)} row={row} phases={phases} sortedPhase={sortedPhase} scales={scales} onOpen={onOpen} />)}
    </ol>
  );
}

/** The toolbar is shared by the desktop table and the phone list, so every metric stays sortable at any width. */
export function CardStatsToolbar({ phases, sort, onSort, onDirection, onCsv, csvError }: {
  phases: readonly Phase[];
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
          {phases.flatMap(phase => [
            <option key={phase.impact} value={phase.impact}>{`${phase.label}: влияние`}</option>,
            <option key={phase.count} value={phase.count}>{`${phase.label}: выборка`}</option>,
          ])}
        </select>
      </label>
      <button type="button" className="constructed-card-stats__direction" onClick={onDirection}
        aria-label={descending ? 'Сейчас по убыванию. Сортировать по возрастанию' : 'Сейчас по возрастанию. Сортировать по убыванию'}>
        {descending ? <ArrowDown aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
      </button>
      <span className="constructed-card-stats__legend">
        {phases.map(phase => <span key={phase.impact}>{phase.label}<InfoTip label={phase.label} description={phase.description} /></span>)}
      </span>
      <button type="button" className="constructed-card-stats__csv" onClick={onCsv} aria-label="Скачать таблицу муллигана: CSV">CSV</button>
      {csvError ? <p className="analytics-chart__error" role="alert">Не удалось скачать таблицу. Попробуйте ещё раз.</p> : null}
    </div>
  );
}
