<!-- markdownlint-disable-file MD013 -->

# Шаблон: карты списком

Карта = плитка как в колоде (`CardTile`) + одно число справа.
Источник: `CardList` в `src/features/ArchetypeBuildComparison.tsx`,
`CardTile` в `src/features/ConstructedArchetypeCardStatsCells.tsx`.

## Как использовать

1. Скопируй файл 1 и файл 2.
2. Замени префикс `card-rows` на свой.
3. Передай массив `cards` и функцию `value` (что показать справа).
4. Справа одно число. Второе не добавляй.
5. Вся строка — ссылка на карту. Кнопку «Подробнее» не добавляй.
6. Плитку карты не перерисовывай: только `CardTile`.

## Файл 1. `src/features/CardRows.tsx`

```tsx
import { canonicalPagePath } from '../app/routing/canonicalPagePath';
import { CardTile } from './ConstructedArchetypeCardStatsCells';
import './ConstructedArchetypeCardStats.css';   // стили .card-stat-tile
import './CardRows.css';

export type CardRow = {
  cardId: string;            // 'TOY_102' — для арта
  cardName: string;          // русское имя карты
  cost: number | null;
  rarity: string | null;     // 'common' | 'rare' | 'epic' | 'legendary'
  artwork: string | null;    // запасной арт, обычно null
};

type CardRowsProps<T extends CardRow> = {
  cards: T[];
  format: 'standard' | 'wild';  // для ссылки на страницу карты
  value: (card: T) => string;   // например: card => `${card.drawnImpact! > 0 ? '+' : ''}${card.drawnImpact!.toFixed(1)}` (влияние при доборе, поле cardStats)
  emptyText: string;            // например: 'Карт нет'
};

export function CardRows<T extends CardRow>({ cards, format, value, emptyText }: CardRowsProps<T>) {
  if (cards.length === 0) return <p className="card-rows__empty">{emptyText}</p>;
  return (
    <ul className="card-rows">
      {cards.map(card => (
        <li key={card.cardId}>
          <a className="card-rows__link" href={canonicalPagePath(`/standard/cards/${format}/${encodeURIComponent(card.cardId)}`)}>
            <CardTile row={card} />
            <span className="card-rows__value">{value(card)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
```

## Файл 2. `src/features/CardRows.css`

```css
.card-rows {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
  gap: 0.35rem 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.card-rows__link {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 4.5rem;
  gap: 0.5rem;
  align-items: center;
  min-height: 42px;
  color: inherit;
  text-decoration: none;
}

.card-rows__link:focus-visible {
  outline: 2px solid var(--arena-red);
  outline-offset: 2px;
}

.card-rows__value {
  color: var(--arena-ink);
  font-size: 0.85rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.card-rows__empty {
  margin: 0;
  color: var(--arena-muted-ink);
  font-size: 0.8rem;
}
```

## Правила

1. Карты сортируй по стоимости, потом по имени (как в колоде), если задача
   не про рейтинг.
2. Рейтинг (лучшие карты) — сортируй по числу справа, до 10 карт.
3. Подпись колонки («Винрейт при взятии») пиши один раз в описании
   раздела, не в каждой строке.
4. Таблица карт со многими колонками — не этот шаблон. Используй
   существующий `ConstructedArchetypeCardStats.tsx`.
