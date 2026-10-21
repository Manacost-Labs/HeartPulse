'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  WEEKLY_DECKS_PERIODS, weeklyDeckItems, weeklyDeckRows, weeklyDecksPath,
  type WeeklyDeckRow, type WeeklyDeckSource, type WeeklyDecksPeriod,
} from '../modules/home/public';
import { fetchWithDeadline } from '../shared/http/fetchWithDeadline';
import { Leaderboard, type LeaderboardItem } from '../vendor/varylo-ui/widgets/Leaderboard';
import { CONSTRUCTED_CLASS_LABELS } from './constructedCardFilterOptions';
import '../vendor/varylo-ui/styles/index.css';
import '../shared/ui/varyloParchment.css';
import './WeeklyDecksLeaderboard.css';

type Slice = { current: WeeklyDeckSource[]; wider: WeeklyDeckSource[] | null };
type Load = { period: WeeklyDecksPeriod; slice: Slice | null; failed: boolean };

const percent = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const count = new Intl.NumberFormat('ru-RU');

function gamesLabel(games: number): string {
  const tens = games % 100;
  const ones = games % 10;
  const word = tens >= 11 && tens <= 14 ? 'игр' : ones === 1 ? 'игра' : ones >= 2 && ones <= 4 ? 'игры' : 'игр';
  return `${count.format(games)} ${word}`;
}

async function readTeaser(period: string, signal: AbortSignal): Promise<WeeklyDeckSource[]> {
  const response = await fetchWithDeadline(weeklyDecksPath(period), { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return weeklyDeckItems(await response.json());
}

function boardItem(row: WeeklyDeckRow, widerLabel: string): LeaderboardItem {
  const classLabel = row.classKey ? CONSTRUCTED_CLASS_LABELS[row.classKey.toUpperCase()] : undefined;
  return {
    id: row.slug,
    title: row.archetypeLabel,
    subtitle: [classLabel, row.trend === null ? null : row.widerPlace === null
      ? `не было в топ-3 за ${widerLabel}` : `${row.widerPlace}-е место за ${widerLabel}`].filter(Boolean).join(' · '),
    ...(row.classKey ? { imageSrc: `/class_icon/ui/${encodeURIComponent(row.classKey)}-96.webp` } : {}),
    ...(row.winrate !== null ? { value: `${percent.format(row.winrate)}%` } : {}),
    ...(row.games !== null ? { secondary: gamesLabel(row.games) } : {}),
    ...(row.trend ? { trend: row.trend } : {}),
    href: `/standard/archetypes/standard/${encodeURIComponent(row.slug)}/`,
  };
}

export type WeeklyDecksBoardState = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; rows: WeeklyDeckRow[] };

/** The board itself: medals, class picture, win rate, games and the place change, or its loading and error states. */
export function WeeklyDecksBoard({ period, onPeriodChange, state, onRetry }: {
  period: WeeklyDecksPeriod;
  onPeriodChange: (period: WeeklyDecksPeriod) => void;
  state: WeeklyDecksBoardState;
  onRetry: () => void;
}) {
  const definition = WEEKLY_DECKS_PERIODS.find(item => item.value === period) ?? WEEKLY_DECKS_PERIODS[2];
  const items = useMemo(() => state.status === 'ready' ? state.rows.map(row => boardItem(row, definition.widerLabel)) : [],
    [state, definition.widerLabel]);
  return (
    <div className="weekly-decks hp-varylo-parchment" aria-busy={state.status === 'loading'}>
      <Leaderboard
        title={definition.title}
        headingLevel={2}
        locale="ru-RU"
        items={items}
        periods={WEEKLY_DECKS_PERIODS.map(({ value, label }) => ({ value, label }))}
        period={period}
        onPeriodChange={next => onPeriodChange(next as WeeklyDecksPeriod)}
        labels={{ rank: place => `${place}-е место`, up: 'Поднялась', down: 'Опустилась', flat: 'Без изменений', period: 'Период' }}
        footer={<>
          {state.status === 'failed'
            ? <span role="alert">Мета сейчас недоступна. <button type="button" onClick={onRetry}>Повторить</button></span>
            : state.status === 'ready' && items.length === 0
              ? <span>За этот период нет колод с 100+ играми.</span>
              : <span>Винрейт и игры HSGuru, Алмаз–Легенда, от 100 игр. Стрелка — место против топа за {definition.widerLabel}.</span>}
          {' '}<a href="/standard/meta/">Вся мета</a>
        </>}
      />
      {state.status === 'loading' && <div className="weekly-decks__loading" role="status">Загружаем лучшие колоды…</div>}
    </div>
  );
}

/**
 * The home page's best decks: the public top three of the meta for a period,
 * ranked against the wider window. It loads in the browser when its section
 * nears the viewport.
 */
export default function WeeklyDecksLeaderboard() {
  const [period, setPeriod] = useState<WeeklyDecksPeriod>('past_week');
  const [load, setLoad] = useState<Load>({ period, slice: null, failed: false });
  const [attempt, setAttempt] = useState(0);
  const wider = (WEEKLY_DECKS_PERIODS.find(item => item.value === period) ?? WEEKLY_DECKS_PERIODS[2]).wider;

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      // The comparison is optional: without it the board shows no trend instead of failing.
      const comparison = readTeaser(wider, controller.signal).catch(() => null);
      try {
        const items = await readTeaser(period, controller.signal);
        if (controller.signal.aborted) return;
        // The top three show at once; the place change follows when the wider window answers.
        setLoad({ period, slice: { current: items, wider: null }, failed: false });
        const widerItems = await comparison;
        if (!controller.signal.aborted && widerItems) setLoad({ period, slice: { current: items, wider: widerItems }, failed: false });
      } catch {
        if (!controller.signal.aborted) setLoad({ period, slice: null, failed: true });
      }
    })();
    return () => controller.abort();
  }, [period, wider, attempt]);

  const slice = load.period === period ? load.slice : null;
  const state: WeeklyDecksBoardState = slice ? { status: 'ready', rows: weeklyDeckRows(slice.current, slice.wider) }
    : load.failed && load.period === period ? { status: 'failed' } : { status: 'loading' };
  const retry = () => {
    setLoad({ period, slice: null, failed: false });
    setAttempt(value => value + 1);
  };
  return <WeeklyDecksBoard period={period} onPeriodChange={setPeriod} state={state} onRetry={retry} />;
}
