import { useEffect, useMemo, useState } from 'react';
import { MetaTable, type MetaTier } from '../vendor/varylo-ui/gaming/MetaTable';
import type { MetaTableEntry } from '../vendor/varylo-ui/gaming/stats';
import type { GameRole } from '../vendor/varylo-ui/gaming/game';
import { Sparkline } from '../vendor/varylo-ui/charts/Sparkline';
import { TierBadge } from '../modules/arenaTierList/public';
import { canonicalPagePath } from '../app/routing/canonicalPagePath';
import { fetchWithDeadline } from '../shared/http/fetchWithDeadline';
import { datasetContractErrorMessage } from '../../shared/datasetEnvelope';
import type { StandardMetaClass, StandardMetaItem, StandardMetaPeriod } from '../../shared/standardMetaContract';
import { parseStandardMetaTrends, type StandardMetaTrends } from '../../shared/standardMetaTrendsContract';
import {
  STANDARD_META_CLASS_COLORS,
  STANDARD_META_CLASS_LABELS,
  standardMetaClassIcon,
  standardMetaTier,
} from './standardMetaClassModel';
import '../vendor/varylo-ui/styles/index.css';
import './StandardMetaVarylo.css';
import './StandardMetaTierTable.css';

const TIERS: MetaTier[] = ['S', 'A', 'B', 'C', 'D'].map(id => ({ id, label: id }));
// Fewer games than this: the row is marked and ranked after the rest.
const LOW_SAMPLE_GAMES = 500;
const percent = (value: number) => `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;

type TrendsState = { key: string; trends: StandardMetaTrends | null; error: string };

export type StandardMetaTierTableProps = {
  items: StandardMetaItem[];
  format: 'standard' | 'wild';
  rank: string;
  rankLabel: string;
  formatLabel: string;
  period: StandardMetaPeriod;
  periodLabel: string;
  minGames: number;
  /** Trends are a subscriber endpoint: without access the table shows the slice alone. */
  loadTrends: boolean;
  /** Stories and tests hand the trends in instead of fetching them. */
  initialTrends?: StandardMetaTrends | null;
};

function useTrends({ format, rank, period, minGames, loadTrends, initialTrends }: StandardMetaTierTableProps): TrendsState {
  const key = `${format}:${rank}:${period}:${minGames}`;
  const [state, setState] = useState<TrendsState>({ key: initialTrends === undefined ? '' : key, trends: initialTrends ?? null, error: '' });
  useEffect(() => {
    if (!loadTrends || initialTrends !== undefined) return undefined;
    const controller = new AbortController();
    const params = new URLSearchParams({ format, rank, period, coin: 'any_player', min_games: String(minGames) });
    fetchWithDeadline(`/api/standard-meta/trends?${params}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(response => {
        if (!response.ok) throw new Error('Динамика меты временно недоступна');
        return response.json();
      })
      .then(payload => setState({ key, trends: parseStandardMetaTrends(payload), error: '' }))
      .catch(cause => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setState({ key, trends: null, error: datasetContractErrorMessage(cause) });
      });
    return () => controller.abort();
  }, [format, rank, period, minGames, loadTrends, initialTrends, key]);
  return state.key === key ? state : { key, trends: null, error: '' };
}

/**
 * The meta as a tier table: tier, win rate and popularity with their change
 * against the previous window, games, and a win-rate sparkline over the
 * rolling windows. Rows beyond the visible ones render only while in view.
 */
export default function StandardMetaTierTable(props: StandardMetaTierTableProps) {
  const { items, format, rank, rankLabel, formatLabel, periodLabel, loadTrends } = props;
  const { trends, error } = useTrends(props);
  const trendById = useMemo(() => new Map(trends?.items.map(item => [item.id, item]) ?? []), [trends]);
  const slugById = useMemo(() => new Map(items.map(item => [item.id, item.slug])), [items]);

  const entries = useMemo(() => items.flatMap((item): MetaTableEntry[] => {
    if (item.winrate === null || !item.games) return [];
    const previous = trendById.get(item.id)?.previous;
    return [{
      id: item.id,
      name: item.archetypeLabel,
      image: standardMetaClassIcon(item.classKey),
      role: item.classKey ?? undefined,
      stats: {
        [rank]: {
          games: item.games,
          winRate: item.winrate / 100,
          pickRate: item.popularity === null ? undefined : item.popularity / 100,
          tier: standardMetaTier(item.winrate, item.games),
          previous: previous ? {
            winRate: previous.winrate === null ? undefined : previous.winrate / 100,
            pickRate: previous.popularity === null ? undefined : previous.popularity / 100,
          } : undefined,
        },
      },
    }];
  }), [items, rank, trendById]);

  const roles = useMemo((): GameRole[] => {
    const present = new Set(items.map(item => item.classKey).filter((key): key is StandardMetaClass => Boolean(key)));
    return [...present].sort((left, right) => STANDARD_META_CLASS_LABELS[left].localeCompare(STANDARD_META_CLASS_LABELS[right], 'ru'))
      .map(classKey => ({ id: classKey, label: STANDARD_META_CLASS_LABELS[classKey], color: STANDARD_META_CLASS_COLORS[classKey] }));
  }, [items]);

  const comparison = trends?.comparison;
  const missing = !loadTrends ? 'Изменение и тренд доступны с подпиской.'
    : error ? `Изменение и тренд не загрузились: ${error}`
      : trends && !comparison ? `Для периода «${periodLabel}» источник не даёт предыдущего окна, поэтому изменение не показано.` : '';

  return (
    <section className="standard-meta-tiers standard-meta-varylo" aria-label="Тир-таблица меты">
      <MetaTable
        entries={entries}
        ranks={[{ id: rank, label: rankLabel }]}
        roles={roles}
        tiers={TIERS}
        renderTier={tier => <TierBadge tier={tier.id} small />}
        showBanRate={false}
        minGames={LOW_SAMPLE_GAMES}
        maxHeight="min(70vh, 640px)"
        locale="ru-RU"
        title="Тиры архетипов"
        headingLevel={2}
        subtitle={`${formatLabel} · ${rankLabel} · ${periodLabel}${comparison ? ` · изменение ${comparison.label} (${comparison.description})` : ''}`}
        onRowClick={entry => window.location.assign(canonicalPagePath(`/standard/archetypes/${format}/${slugById.get(entry.id) ?? ''}`))}
        trendColumn={{
          header: 'Тренд WR',
          label: 'Тренд',
          cell: entry => <WinrateSparkline winrates={trendById.get(entry.id)?.winrates ?? null} buckets={trends?.buckets ?? []} />,
        }}
        labels={{
          title: 'Тиры архетипов',
          roleFilter: 'Класс',
          allRoles: 'Все',
          rank: 'Рейтинг',
          search: 'Найти архетип',
          position: '#',
          name: 'Архетип',
          tier: 'Тир',
          winRate: 'Винрейт',
          pickRate: 'Популярность',
          games: 'Игры',
          interval: (low, high) => `95% интервал от ${low} до ${high}`,
          change: signed => `${signed} п. п.`,
          sinceLastPatch: comparison?.label ?? 'к прошлому окну',
          lowSample: `Меньше ${LOW_SAMPLE_GAMES.toLocaleString('ru-RU')} игр: оценка приблизительная`,
          count: (shown, total) => (shown === total ? `${total} архетипов` : `${shown} из ${total} архетипов`),
          details: name => `Открыть архетип ${name}`,
          noResults: 'Нет архетипов под эти фильтры.',
          empty: 'В этом срезе нет архетипов.',
          loading: 'Загружаем мету',
        }}
      />
      <p className="standard-meta-tiers__note">
        Тир — по нижней границе 90% доверительного интервала винрейта: S от 53%, A от 51%, B от 49%, C от 47%, ниже — D.
        Тренд — винрейт в непересекающихся окнах за 30 дней ({trends?.buckets.join(' → ') ?? '14–30 дн. → 0–3 ч'}).
        {missing && <strong> {missing}</strong>}
      </p>
    </section>
  );
}

function WinrateSparkline({ winrates, buckets }: { winrates: Array<number | null> | null; buckets: string[] }) {
  const known = winrates?.filter((value): value is number => value !== null) ?? [];
  if (!winrates || known.length < 2) return <span className="standard-meta-tiers__no-trend" title="Мало окон с достаточной выборкой">—</span>;
  const spoken = winrates.map((value, index) => `${buckets[index] ?? ''}: ${value === null ? 'нет данных' : percent(value)}`).join(', ');
  return <Sparkline data={winrates} width={88} height={26} showDot ariaLabel={`Винрейт по окнам: ${spoken}`} />;
}
