<!-- markdownlint-disable-file MD013 -->

# Шаблон: строка списка с винрейтом

Строка = иконка класса + русское имя (английское мелко) + `WinrateCell` +
игры. Вся строка — ссылка. Малая выборка приглушена.
Источник: `src/features/StandardMetaArchetypeTable.tsx`,
`src/features/StandardMetaWinrateCells.tsx`.

## Перед копированием

Список архетипов всей меты или одного класса — не копируй этот шаблон.
Используй готовый `StandardMetaArchetypeTable` (см. `components-and-data.md`).
Этот шаблон — для другого списка: топ роста, архетипы в блоке, похожие.

## Как использовать

1. Скопируй файл 1 и файл 2.
2. Замени префикс `page-rows` на свой.
3. Передай массив `rows` из своей модели.
4. Структуру строки не меняй.

## Файл 1. `src/features/PageRows.tsx`

```tsx
import { CircleAlert } from 'lucide-react';
import type { StandardMetaClass } from '../../shared/standardMetaContract';
import { canonicalPagePath } from '../app/routing/canonicalPagePath';
import { standardMetaClassIcon } from './standardMetaClassModel';
import { STANDARD_META_LOW_SAMPLE_GAMES, standardMetaWinrateEstimate } from './standardMetaTableModel';
import { WinrateCell } from './StandardMetaWinrateCells';
import './StandardMetaArchetypeTable.css';   // стили WinrateCell — без них ячейка голая
import './PageRows.css';

export type PageRow = {
  id: string;
  slug: string;                    // для ссылки на архетип
  format: 'standard' | 'wild';
  classKey: StandardMetaClass | null; // 'priest', 'deathknight', ...
  archetypeLabel: string;          // русское имя
  archetype: string;               // английское имя
  winrate: number | null;          // в процентах, 0–100
  games: number | null;
  change: number | null;           // п.п.: winrate − trend.previous.winrate, или null
};

const LOW_SAMPLE_HINT = `Меньше ${STANDARD_META_LOW_SAMPLE_GAMES.toLocaleString('ru-RU')} игр: оценка приблизительная`;

export function PageRows({ rows, emptyText }: { rows: PageRow[]; emptyText: string }) {
  if (rows.length === 0) return <p className="page-rows__empty">{emptyText}</p>;
  return (
    <ul className="page-rows">
      {rows.map(row => {
        const estimate = standardMetaWinrateEstimate(row.winrate, row.games);
        return (
          <li key={row.id} className={estimate?.lowSample ? 'is-low-sample' : undefined}>
            <a className="page-rows__row" href={canonicalPagePath(`/standard/archetypes/${row.format}/${row.slug}`)}>
              <img src={standardMetaClassIcon(row.classKey)} alt="" width="28" height="28" loading="lazy" decoding="async" />
              <span className="page-rows__name">
                <strong>{row.archetypeLabel}</strong>
                <small>{row.archetype}</small>
              </span>
              <WinrateCell estimate={estimate} change={row.change} />
              <small className="page-rows__games">
                {row.games === null ? '—' : `${row.games.toLocaleString('ru-RU')} игр`}
                {estimate?.lowSample ? (
                  <span role="img" aria-label={LOW_SAMPLE_HINT} title={LOW_SAMPLE_HINT}>
                    <CircleAlert aria-hidden="true" />
                  </span>
                ) : null}
              </small>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
```

## Файл 2. `src/features/PageRows.css`

```css
.page-rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.page-rows li + li {
  border-top: 1px solid var(--arena-paper-line);
}

.page-rows__row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) minmax(9rem, 14rem) 6rem;
  gap: 0.75rem;
  align-items: center;
  min-height: 52px;
  padding: 0.35rem 1rem;
  color: var(--arena-ink);
  text-decoration: none;
  font-variant-numeric: tabular-nums;
  transition: background-color var(--motion-fast) var(--motion-ease);
}

.page-rows__row:hover {
  background: rgba(255, 248, 225, 0.5);
}

.page-rows__row:focus-visible {
  outline: 2px solid var(--arena-red);
  outline-offset: -2px;
}

.page-rows__name {
  min-width: 0;
}

.page-rows__name strong {
  display: block;
  overflow: hidden;
  font-family: var(--font-display);
  font-size: 0.9rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-rows__name small,
.page-rows__games {
  color: var(--arena-muted-ink);
  font-size: 0.7rem;
}

.page-rows__games {
  display: inline-flex;
  gap: 0.25rem;
  align-items: center;
  justify-content: flex-end;
}

.page-rows__games svg {
  width: 12px;
  height: 12px;
}

.page-rows .is-low-sample {
  opacity: 0.75;
}

.page-rows__empty {
  margin: 0;
  padding: 0.75rem 1rem;
  color: var(--arena-muted-ink);
  font-size: 0.8rem;
}

@media (max-width: 767px) {
  .page-rows__row {
    grid-template-columns: 28px minmax(0, 1fr) auto;
    min-height: 56px;
  }

  .page-rows__row > :nth-child(3) {
    grid-column: 2 / -1;
  }
}
```

## Топ (рост, падение)

Данные топа — те, что страница уже загрузила. Свой `fetch` не пиши.
Период топа — период, выбранный на странице. Свой период не задавай.

На `/standard/meta/` это `items` из `StandardMeta.tsx`. Тренды сейчас
грузит только ленивая таблица (`StandardMetaArchetypeTable` вызывает
`useStandardMetaTrends`). Блоку тоже нужны тренды — остановись и спроси
ведущую сессию: хук надо поднять в `StandardMeta.tsx` и передать в таблицу
и в блок через `initialTrends`. Второй вызов хука даст второй запрос.

Модель топа (меняй только имена):

```ts
import type { StandardMetaItem } from '../../shared/standardMetaContract';
import type { StandardMetaTrends } from '../../shared/standardMetaTrendsContract';
import { standardMetaWinrateEstimate } from './standardMetaTableModel';
import type { PageRow } from './PageRows';

// Изменение считается так же, как в StandardMetaArchetypeTable.tsx (ArchetypeRow).
export function pageRowsWithChange(items: StandardMetaItem[], trends: StandardMetaTrends | null, format: 'standard' | 'wild'): PageRow[] {
  const previousById = new Map(trends?.items.map(item => [item.id, item.previous?.winrate ?? null]) ?? []);
  return items.map(item => {
    const previous = previousById.get(item.id) ?? null;
    return {
      id: item.id, slug: item.slug, format, classKey: item.classKey,
      archetypeLabel: item.archetypeLabel, archetype: item.archetype,
      winrate: item.winrate, games: item.games,
      change: previous !== null && item.winrate !== null ? item.winrate - previous : null,
    };
  });
}

export function topByChange(rows: PageRow[], direction: 'up' | 'down', limit = 5): PageRow[] {
  return rows
    .filter(row => row.change !== null)
    .filter(row => !standardMetaWinrateEstimate(row.winrate, row.games)?.lowSample)   // малые выборки исключаем
    .filter(row => (direction === 'up' ? row.change! > 0 : row.change! < 0))
    .sort((a, b) => (direction === 'up' ? b.change! - a.change! : a.change! - b.change!))
    .slice(0, limit);
}
```

Нет `trends.comparison` (у периода нет прошлого окна) — блок топа не
показывай. Гость (`loadTrends: false`) — блок топа не показывай.

### Топ на странице, где винрейт уже есть в таблице

Правило №1: число дважды не показывай. На `/standard/meta/` винрейт уже
в таблице, поэтому в строке топа замени `<WinrateCell … />` на изменение:

```tsx
import { point } from './StandardMetaWinrateCells';

<span className="standard-meta-table__change" data-direction={row.change! > 0 ? 'up' : 'down'}>
  {row.change! > 0 ? '▲ +' : '▼ −'}{point(Math.abs(row.change!))} п.п.
</span>
```

Остальную строку не меняй.
