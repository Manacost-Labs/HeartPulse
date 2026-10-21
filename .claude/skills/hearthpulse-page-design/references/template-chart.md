<!-- markdownlint-disable-file MD013 -->

# Шаблон: график во времени

График = общий `LineChart` из `src/shared/ui/analytics/LineChart.tsx`.
Источник: `src/features/ArchetypeHistoryCharts.tsx` и
`archetypeHistoryCharts` в `src/features/archetypeInsightsModel.ts`.

Свой SVG-график не пиши. Recharts, Chart.js и другие библиотеки не ставь.

## Цвет линии — только из этой таблицы

`LineChart` рисует цвет в SVG-атрибутах, поэтому передаётся строкой.
Это значения из уже выпущенных графиков. Других не придумывай.

| Что на графике | `color` | `unit` | `domain` |
| --- | --- | --- | --- |
| Винрейт | `'#8d171d'` | `'%'` | не передавай |
| Популярность, доля | `'#2f6c9e'` | `'%'` | `{ minimum: 0 }` |
| Игры, количество | `'#8a5b24'` | `'count'` | `{ minimum: 0 }` |

## Как использовать

1. Скопируй файл 1 (модель) и файл 2 (компонент).
2. Замени имена `trend*` на свои.
3. Меняй только: `title`, `subtitle`, строку из таблицы цветов.
4. Каждая точка получает `segment` — период данных (патч или окно HSGuru).
   Где `segment` меняется, линия рвётся. Это обязательно.
5. Нет значения — `y: null`. Ноль вместо пропуска не ставь.

## Файл 1. Модель `src/features/trendChartModel.ts`

```ts
import type { ChartPoint } from '../shared/ui/analytics/analyticsModel';
import { wilsonInterval } from './archetypeInsightsModel';   // проценты на входе и выходе

export type TrendPoint = {
  recordedAt: string;        // ISO-дата среза
  winrate: number | null;    // в процентах, 0–100
  games: number;
  patch?: string | null;     // период; меняется — линия рвётся
};

export function trendWinratePoints(points: readonly TrendPoint[], timeZone?: string): ChartPoint[] {
  const full = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone });
  const short = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone });
  return points.map(point => {
    const date = new Date(point.recordedAt);
    const [low, high] = point.winrate === null ? [null, null] : wilsonInterval(point.winrate, point.games);
    return {
      x: date.getTime(),
      y: point.winrate,
      low,
      high,
      label: full.format(date),
      tick: short.format(date).replace('.', ''),
      segment: point.patch ?? undefined,
      detail: `${point.games.toLocaleString('ru-RU')} игр`,
    };
  });
}
```

## Файл 2. Компонент `src/features/TrendChart.tsx`

```tsx
import { useMemo } from 'react';
import { LineChart } from '../shared/ui/analytics/LineChart';
import { useViewerTimeZone } from '../shared/ui/useViewerTimeZone';
import { historyPeriodLabel } from './archetypeInsightsModel';
import { trendWinratePoints, type TrendPoint } from './trendChartModel';
import '../shared/ui/analytics/Analytics.css';

export function TrendChart({ history }: { history: readonly TrendPoint[] }) {
  const timeZone = useViewerTimeZone();
  const points = useMemo(() => trendWinratePoints(
    history
      .filter(point => Number.isFinite(Date.parse(point.recordedAt)))
      .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt)),
    timeZone,
  ), [history, timeZone]);
  return (
    <LineChart
      title="Винрейт"                                          // МЕНЯЙ
      subtitle="Полоса — 95% интервал · пунктир — смена периода" // МЕНЯЙ
      unit="%"                                                // из таблицы цветов
      color="#8d171d"                                         // из таблицы цветов
      points={points}
      segmentLabel={historyPeriodLabel}
      bandLabel="95% интервал"
    />
  );
}
```

## Правила

1. Один график — одна величина. Две величины — два графика рядом.
2. Полоса интервала — только у винрейта (`low`/`high`).
3. Пустой график не показывай: нет точек — нет блока.
4. Подпись осей и легенду не добавляй: их даёт `LineChart`.
5. Сетка из 2–3 графиков: `display: grid; grid-template-columns:
   repeat(auto-fit, minmax(20rem, 1fr)); gap: 1rem;`.
