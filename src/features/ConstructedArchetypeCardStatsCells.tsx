import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, CircleHelp } from 'lucide-react';
import { constructedCardHorizontalArtwork } from '../modules/constructedCards/public';
import {
  hsguruImpactTone,
  isLowCardSample,
  LOW_CARD_SAMPLE,
  type HsguruCardStatImpactKey,
  type HsguruCardStatSort,
  type HsguruCardStatSortKey,
} from './archetypeDetailModel';
import { publicResourceUrl } from '../publicResourceUrl';

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

/** Impact and sample of one phase share a cell; each phase keeps its own definition tooltip. */
export const PHASES: readonly Phase[] = [
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

export function phaseOf(key: HsguruCardStatSortKey): Phase {
  return PHASES.find(phase => phase.impact === key || phase.count === key) ?? PHASES[0];
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

/** Small art, mana and the full name: the provider's tile image bakes a truncated name into pixels. */
export function CardName({ row }: { row: ConstructedCardStat }) {
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

export function PhaseValue({ row, phase, scale }: { row: ConstructedCardStat; phase: Phase; scale: number }) {
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

export function CardStatsList({ rows, sort, scales, rowKeys, onOpen }: {
  rows: ConstructedCardStat[];
  sort: HsguruCardStatSort;
  scales: Record<HsguruCardStatImpactKey, number>;
  rowKeys: Map<ConstructedCardStat, string>;
  onOpen: (row: ConstructedCardStat) => void;
}) {
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

/** The toolbar is shared by the desktop table and the phone list, so every metric stays sortable at any width. */
export function CardStatsToolbar({ sort, onSort, onDirection, onCsv, csvError }: {
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
