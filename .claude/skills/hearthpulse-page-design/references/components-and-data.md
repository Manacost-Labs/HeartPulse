<!-- markdownlint-disable-file MD013 -->

# Компоненты (пропсы) и данные

Сигнатуры сверены с кодом 21.10.2026. Если что-то не совпадает — верь
коду, а здесь поправь.

## Иконки

`lucide-react` (`import { LayoutGrid, CircleAlert } from 'lucide-react'`),
всегда `aria-hidden="true"`. Иконки классов — `classIconUrl(classKey)` из
`src/features/classIcons.ts`; на мете — `standardMetaClassIcon`.

`classKey` — нижний регистр без пробелов: `deathknight demonhunter druid
hunter mage paladin priest rogue shaman warlock warrior`. Для каждого есть
`public/archetype-art/classes/<classKey>-{960,1920}.webp`.

## Винрейт и интервал — две функции, разные шкалы

| Функция | Вход | Выход | Где брать |
| --- | --- | --- | --- |
| `wilsonInterval(winratePercent, games)` | проценты (55.2) | `[low, high]` в процентах | `src/features/archetypeInsightsModel.ts` |
| `wilsonInterval(p, n)` | доля (0.552) | `[low, high]` доли | `src/vendor/varylo-ui/gaming/stats.ts` |
| `standardMetaWinrateEstimate(winrate, games)` | проценты | `{ winrate, low, high, lowSample }` или `null` | `src/features/standardMetaTableModel.ts` |

Новые строки с винрейтом считай через `standardMetaWinrateEstimate` — он
уже ставит `lowSample` по порогу `STANDARD_META_LOW_SAMPLE_GAMES` (500).

## Готовые ячейки и компоненты

| Компонент | Импорт | Пропсы |
| --- | --- | --- |
| `WinrateCell` | `src/features/StandardMetaWinrateCells.tsx` | `{ estimate: StandardMetaWinrateEstimate \| null; change: number \| null }` — число, полоса от 50%, интервал, изменение |
| `WinrateSparkline` | там же | `{ winrates: (number \| null)[] \| null; buckets: string[] }` |
| `KpiGroup` | `src/vendor/varylo-ui/data-display/KpiGroup.tsx` | принимает все пропсы `<ul>` (в т.ч. `className`); `items: KpiItem[]` (`{ id, label, value, format?, previous?, delta?, trend?, caption? }`), `comparisonLabel?`, `variant?: 'joined' \| 'cards'`, `minTileWidth?`, `loading?` |
| `TrendValue` | `src/vendor/varylo-ui/widgets/TrendValue.tsx` | `value` (знак = направление), `format?`, `fractionDigits?`, `invert?` |
| `SegmentedControl` | `src/vendor/varylo-ui/navigation/SegmentedControl.tsx` | `options: { value, label }[]`, `value`, `onValueChange`, `size?`, `fullWidth?`, `aria-label` |
| `LineChart` | `src/shared/ui/analytics/LineChart.tsx` | `title, points: ChartPoint[], unit?, color?, domain?, segmentLabel?, bandLabel?` |
| `rankHeatCell(winrate, games)` | `src/features/archetypeRankHeatModel.ts` | → `{ fill, ink, tone, significant, low, high }` |
| `MetricComparison` | `src/vendor/valyro-ui/charts/MetricComparison.tsx` | `metrics`, `bars`, `currentLabel`, `previousLabel`, `labels` — см. образец ниже |
| `CardTile` | `src/features/ConstructedArchetypeCardStatsCells.tsx` | `{ row: { cardId, cardName, cost, rarity, artwork } }` — плитка карты как в колоде |
| `DeckListView` | `src/features/decklist/DeckListView.tsx` | список колоды по контракту `.hsrdv` (design.md) |
| `LoadingSurface` | `src/shared/ui/LoadingSurface.tsx` | `label` (что грузится), `detail?`, `quiet?`; появляется после `--motion-reveal-delay` (160 ms) |
| `ViewSwitch` | `src/components/transitions/ViewSwitch.tsx` (если ещё нет в `origin/main` — спроси) | `viewKey`, `order?` (массив ключей в порядке кнопок; без него — `direction`), `preset?: 'shared-x' \| 'fade-through' \| 'shared-y' \| 'shared-z'`, `className?`, `children` |
| `StandardMetaArchetypeTable` | `src/features/StandardMetaArchetypeTable.tsx` (default export) | `items: StandardMetaItem[]` + подписи фильтров и `loadTrends`; для подмножества (один класс) передай отфильтрованные `items` из `/standard-meta` — не пиши свою таблицу |

Не экспортируются (только образец для копирования): `MetaShareList` и
`shareTree` в `StandardMetaChartPlot.tsx`.

## Строка таблицы — ссылка целиком

Не оборачивай `<tr>` в `<a>`. Ссылка стоит в ячейке имени, а
`::after` растягивает её на всю строку (`StandardMetaArchetypeTable.tsx`):

```css
.page-table tr { position: relative; }
.page-table__link::after { content: ''; position: absolute; inset: 0; z-index: 1; }
.page-table__link:focus-visible { outline: none; }
.page-table__link:focus-visible::after { outline: 2px solid var(--arena-red); outline-offset: -2px; }
```

Для списка (`<ul>`) проще: `<li><a class="row">…</a></li>` с `display: grid`.
Ссылка — обычный `<a href={canonicalPagePath('/standard/archetypes/…')}>`
(`src/app/routing/canonicalPagePath.ts`), не `next/link`: так делает таблица меты.

## Откуда данные

| Данные | API (префикс `/api`) | Сервер | Клиент |
| --- | --- | --- | --- |
| Мета (архетипы, винрейт, популярность, игры) | `GET /standard-meta?format=standard&rank=diamond_legend&period=past_day&coin=any_player&min_games=100` (разбор — `server/standardMetaQuery.ts`); гость — `/standard-meta/teaser` с теми же параметрами | `server/standardMetaRoutes.ts` | `src/features/StandardMeta.tsx` |
| Изменение к прошлому окну и тренд | `GET /standard-meta/trends` (подписка) | там же | `useStandardMetaTrends.ts` |
| Архетипы: каталог и деталь | `GET /constructed-archetypes`, `/constructed-archetypes/:format/:slug` | `server/constructedArchetypeRoutes.ts` | `ConstructedArchetypes.tsx` |
| Матчапы | `GET /standard/matchups` (подписка) | `server/standardMatchupRoutes.ts` | `StandardMatchups.tsx` |
| Карты и история карты | `GET /constructed-cards`, `/constructed-cards/:cardId` | `server/constructedCardRoutes.ts` | `StandardCards.tsx`, `ConstructedCardHistoryPanel.tsx` |
| Патчноуты | `GET /patch-notes`, `/patch-notes/:version` | `server/modules/patchNotes/routes.ts` | `src/features/patchNotes/` |
| Vicious Syndicate | `GET /vicious-syndicate-gold` | `server/standardMetaRoutes.ts` | `src/features/viciousGold/` |

Правила:

- Блок, у которого нет своего источника в этой таблице (например, «новые
  архетипы недели»), без ответа ведущей сессии не делай.
- Блок с платными данными показывает гостю то же, что соседние платные
  блоки страницы (тизер или превью под замком) — повтори их схему, логику
  доступа не трогай.

- Русское имя архетипа — поле `archetypeLabel`, английское — `archetype`;
  `translated: false` → показывай английское и «перевод ожидается».
- Изменение за период = `item.winrate − trend.previous.winrate` из
  `/standard-meta/trends` (вложенные окна HSGuru), как в
  `StandardMetaArchetypeTable.tsx`. Другие формулы и свои снимки не делай. Сравнение через
  смену периода (патч → дополнение) не делай.
- Для «топов» (рост, падение, лучшие) отсекай строки с `lowSample` —
  приглушение для таблицы, исключение для рейтинга.
- **Нужных данных нет в API — остановись и спроси ведущую сессию**, прежде
  чем писать новый эндпоинт или считать «на глаз».
- Платные данные — только через существующие ручки с `accessGuard`; гость
  видит тизер, логику доступа не трогай.

## Реальная фикстура для Storybook и тестов

```bash
curl -s 'https://hearthpulse.net/api/standard-meta/teaser?format=standard&rank=diamond_legend&coin=any_player&min_games=100' \
  > tests/fixtures/<page>-real-<YYYYMMDD>.json
```

Публичные ответы можно сохранять как есть. Для платных ручек бери уже
сохранённые фикстуры из `tests/fixtures/` (`ls tests/fixtures | grep <тема>`)
или срежь публичную часть; персональные данные в фикстуры не кладут.

## Образец: сравнение двух вещей

`MetricComparison` из `src/vendor/valyro-ui/charts/MetricComparison.tsx`.
Пример: `src/features/ArchetypeBuildComparison.tsx`.

```tsx
import { MetricComparison, type ComparisonMetric } from '../vendor/valyro-ui/charts/MetricComparison';
import '../vendor/varylo-ui/styles/index.css';
import './archetypeVaryloTheme.css';

<div className="hp-varylo">
  <MetricComparison
    metrics={metrics}                       // ComparisonMetric[]
    bars="paired"
    currentLabel={`A · ${nameA}`}
    previousLabel={`Б · ${nameB}`}
    locale="ru-RU"
    labels={{ metric: 'Показатель', change: 'Вывод', new: 'Новое',
      increase: 'Больше', decrease: 'Меньше' }}
    ariaLabel={`${nameA} против ${nameB}`}
  />
</div>
```

## Образец: доли (treemap + список)

Пример: `shareTree()` и `MetaShareList` в
`src/features/StandardMetaChartPlot.tsx`. Правило: treemap не бывает один —
рядом всегда список «иконка класса · название · полоса доли · %» с фильтром
по классу; клик по классу в treemap фильтрует список. Плитки архетипов —
оттенки цвета класса, подпись в мелкой плитке прячется в подсказку.

## Образец: телефон (матрица → список)

```css
@media (max-width: 767px) {
  .page-matrix { display: none; }
  .page-matrix-list { display: grid; gap: .5rem; }
}
.page-table-scroll { overflow-x: auto; }          /* скролл внутри, не у страницы */
.page-table-scroll th:first-child,
.page-table-scroll td:first-child { position: sticky; left: 0; }
```

Пример переключения: `src/features/StandardMatchupMatrix.tsx` (матрица) и
`src/features/StandardMatchupsOverview.tsx` (список полос от 50%).
