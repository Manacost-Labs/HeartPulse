import { useState } from 'react';
import { ChevronDown, Hourglass } from 'lucide-react';
import { useArchetypeHsguruStats } from '../modules/constructedArchetypes/public';
import { CardStatsPanel } from './ConstructedArchetypeCardStats';
import { ClassMatchupsPanel, type ClassMatchupRow } from './ConstructedArchetypeClassMatchups';
import type { ConstructedCardStat } from './ConstructedArchetypeCardStatsCells';
import type { HsguruAnalysisState } from './archetypeDetailModel';
import {
  hsguruCoverageText, hsguruOptions, hsguruSliceLabel, hsguruSliceQuery, nearestCollectedSlices,
  type HsguruSlice, type HsguruSliceField, type HsguruStats,
} from './hsguruStatsModel';
import './HsguruArchetypeStats.css';

const FIELDS: ReadonlyArray<{ field: HsguruSliceField; label: string }> = [
  { field: 'period', label: 'Период' },
  { field: 'rank', label: 'Ранг' },
  { field: 'coin', label: 'Очерёдность хода' },
  { field: 'opponentClass', label: 'Соперник' },
];
const LEGACY_SCOPE = 'HSGuru · Легенда · Неделя';

/** The older Legend · week analysis (`section=analysis`), the fallback while a slice is collected. */
type LegacyAnalysis = {
  state: HsguruAnalysisState;
  cardStatsUpdatedAt: string | null;
  matchupsUpdatedAt: string | null;
  sourceUrls: { cards: string; matchups: string };
  cardStats: ConstructedCardStat[];
  classMatchups: ClassMatchupRow[];
};

function formatDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function SliceFilters({ slice, stats, page, busy, onChange }: {
  slice: HsguruSlice; stats: HsguruStats | null; page: HsguruStats['mulligan']; busy: boolean; onChange: (next: HsguruSlice) => void;
}) {
  const updated = formatDate(page?.checkedAt ?? null);
  return (
    <div className="hsguru-slice" aria-busy={busy}>
      <div className="hsguru-slice__filters">
        {FIELDS.map(({ field, label }) => (
          <label key={field} className="hsguru-slice__field">
            <span>{label}</span>
            <select value={slice[field]} disabled={!stats} onChange={event => onChange({ ...slice, [field]: event.target.value })}>
              {hsguruOptions(field, slice, stats?.slices ?? []).map(option => (
                <option key={option.id} value={option.id}>{option.collected ? option.label : `${option.label} — собирается`}</option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" />
          </label>
        ))}
      </div>
      {page ? (
        <p className="hsguru-slice__summary">
          HSGuru · {page.games === null ? 'выборка неизвестна' : `${Math.round(page.games).toLocaleString('ru-RU')} игр`}
          {updated ? ` · обновлено ${updated}` : ''}
        </p>
      ) : null}
    </div>
  );
}

/** The slice is not collected yet: what is offered instead, and the pipeline progress. */
function CollectingNotice({ slice, stats, fallback, onPick }: {
  slice: HsguruSlice; stats: HsguruStats; fallback: boolean; onPick: (next: HsguruSlice) => void;
}) {
  const coverage = hsguruCoverageText(stats.coverage);
  const nearest = nearestCollectedSlices(slice, stats.slices);
  return (
    <div className="hsguru-collecting" role="status">
      <Hourglass aria-hidden="true" />
      <div>
        <strong>Срез «{hsguruSliceLabel(slice)}» ещё собирается</strong>
        <p>
          Подробная статистика HSGuru загружается постепенно{coverage ? `: ${coverage}` : ''}.
          {fallback ? ` Пока показан прошлый срез «${LEGACY_SCOPE.replace('HSGuru · ', '')}».` : ''}
        </p>
        {nearest.length ? (
          <div className="hsguru-collecting__picks">
            {nearest.map(next => (
              <button key={hsguruSliceQuery(next)} type="button" onClick={() => onPick(next)}>{hsguruSliceLabel(next)}</button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * HSGuru card stats and class matchups of one slice (period, rank, coin,
 * opponent). The older Legend · week analysis fills a slice that is still
 * being collected, under a notice naming what is shown.
 */
export function HsguruArchetypeStats({ format, slug, legacy }: {
  format: 'standard' | 'wild'; slug: string; legacy: LegacyAnalysis | null;
}) {
  const [picked, setPicked] = useState<HsguruSlice | null>(null);
  const read = useArchetypeHsguruStats<HsguruStats>(format, slug, hsguruSliceQuery(picked), true);
  // The last answer stays on screen while the next slice loads, so the filters do not jump.
  const [last, setLast] = useState<HsguruStats | null>(null);
  if (read.data && read.data !== last) setLast(read.data);
  const stats = read.data ?? last;
  const slice = picked ?? stats?.slice ?? { rank: 'legend', period: 'current', coin: 'any_player', opponentClass: 'any' };
  const answered = stats && hsguruSliceQuery(stats.slice) === hsguruSliceQuery(slice) ? stats : null;
  // While another slice loads, the previous one stays (dimmed) instead of the fallback flashing in.
  const shown = answered ?? (read.loading ? last : null);
  const shownSlice = shown?.slice ?? slice;
  const mulligan = shown?.mulligan ?? null;
  const legacyCards = shown && !mulligan && legacy?.cardStats.length ? legacy : null;
  const matchups = shown?.classMatchups?.rows.length ? shown.classMatchups : null;
  const legacyMatchups = shown && !matchups && legacy?.classMatchups.length ? legacy : null;
  const scope = (page: unknown, fallback: unknown, label: string) => (page || !fallback ? `HSGuru · ${label}` : LEGACY_SCOPE);
  const empty = (text: string) => <p className="constructed-analysis-empty">{text}</p>;
  const waiting = !shown && read.loading;

  return (
    <div className="constructed-analysis-stack" data-tour-id="archetype-analysis">
      <SliceFilters slice={slice} stats={stats} page={mulligan} busy={read.loading} onChange={setPicked} />
      {read.error && !read.loading ? (
        <div className="hsguru-collecting" role="alert">
          <div><strong>{read.error}</strong></div>
          <button type="button" className="hsguru-collecting__retry" onClick={read.retry}>Повторить</button>
        </div>
      ) : answered && !mulligan ? (
        <CollectingNotice slice={slice} stats={answered} fallback={Boolean(legacyCards)} onPick={setPicked} />
      ) : null}
      <div className="hsguru-slice__panels" data-busy={read.loading || undefined}>
        <ClassMatchupsPanel
          scope={scope(matchups, legacyMatchups, hsguruSliceLabel(shownSlice, false))}
          rows={matchups?.rows ?? legacyMatchups?.classMatchups ?? []}
          updatedAt={matchups?.checkedAt ?? legacyMatchups?.matchupsUpdatedAt ?? null}
          sourceUrl={matchups?.sourceUrl ?? legacyMatchups?.sourceUrls.matchups ?? ''}
          empty={empty(waiting ? 'Загружаем срез HSGuru…' : 'Матчапы по классам для этого среза ещё собираются.')}
        />
        <CardStatsPanel
          scope={scope(mulligan, legacyCards, hsguruSliceLabel(shownSlice))}
          analysis={mulligan
            ? { state: 'ok', cardStatsUpdatedAt: mulligan.checkedAt, sourceUrls: { cards: mulligan.sourceUrl }, cardStats: mulligan.rows }
            : legacyCards}
          empty={empty(waiting ? 'Загружаем срез HSGuru…' : 'Статистика карт для этого среза ещё собирается.')}
        />
      </div>
    </div>
  );
}
