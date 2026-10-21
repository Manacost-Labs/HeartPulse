<!-- markdownlint-disable-file MD013 -->

# Шаблоны для копирования

Каждый шаблон взят из работающего кода. Скопируй, замени префикс
`page-` на префикс страницы (как у её корневого компонента: мета —
`standard-meta-`, матчапы — `standard-matchups-`, архетип — `archetype-`,
новая страница — её маршрут через дефис), остальное не меняй.

Литеральные цвета в шаблонах 1–2 — принятая палитра красной плашки
(`#fff0c8`, `#3a0610`, градиент). Если `npm run lint:architecture` или
ревью требуют токен — добавь `--plate-*` токены в CSS своей страницы, не
меняй цвета.

## 1. Кинематографическая шапка (страница одной сущности)

Для страниц-списков (мета, карты, матчапы) шапка уже есть — общий баннер
режима (`src/features/TraditionalModeBanner.css`, `PageBannerPreload.tsx`);
новую шапку туда не добавляй.

Источник: `src/features/ConstructedArchetypes.tsx` (секция
`.archetype-dossier`) и `src/features/ConstructedArchetypes.css`.

```tsx
<section className="page-dossier" data-page-still>   {/* шапка — кандидат в LCP: не анимируется */}
  {backdrop ? (
    <img
      className="page-dossier__backdrop"
      src={backdrop.src}
      srcSet={backdrop.srcSet}            // 960w и 1920w
      sizes="(min-width: 1480px) 1440px, 100vw"
      style={{ objectPosition: backdrop.focus }}
      width={1920} height={800}
      alt="" aria-hidden="true"
      decoding="async" fetchPriority="high"
      onError={event => { event.currentTarget.hidden = true; }}
    />
  ) : null}
  <div className="page-dossier__identity">  {/* classIconUrl из src/features/classIcons.ts */}
    <img src={classIconUrl(classKey)} alt="" width="92" height="92" />
    <h1>{title}</h1>
  </div>
  <PageKpis />   {/* KPI-полоса, см. шаблон 2 */}
</section>
```

Фон шапки — арт класса: `archetypeClassBackdrop(classKey)` в
`src/features/archetypeDetailModel.ts` отдаёт
`/archetype-art/classes/<class>-{960,1920}.webp` и точку фокуса.

```css
.page-dossier {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.1rem;
  overflow: hidden;
  min-height: 15rem;
  padding: clamp(1rem, 2vw, 1.5rem);
  border: 12px solid transparent;
  border-image: url('/wallpaper/main-page-rail-border.png') 18 stretch;
  color: #fff0c8;
  background: #3a0610;
  isolation: isolate;
}
.page-dossier__backdrop {
  position: absolute; z-index: 0; inset: 0;
  width: 100%; height: 100%; object-fit: cover;
}
/* Градиент: плотно слева под текстом, арт виден справа. */
.page-dossier::after {
  position: absolute; z-index: 1; inset: 0;
  background:
    linear-gradient(90deg, rgba(40,3,9,.96) 0%, rgba(52,5,11,.86) 30%,
      rgba(60,6,12,.42) 58%, rgba(60,6,12,.08) 100%),
    linear-gradient(0deg, rgba(30,3,7,.7) 0%, rgba(30,3,7,0) 45%);
  content: '';
  pointer-events: none;
}
.page-dossier__identity {
  position: relative; z-index: 3;
  display: flex; gap: 1rem; align-items: center; min-width: 0;
}
.page-dossier h1 {
  margin: 0;
  color: #fff0c8;
  font-family: var(--font-display);
  font-size: clamp(1.75rem, 3vw, 2.7rem);
  line-height: 1.15;
  text-shadow: 0 3px 14px rgba(21, 1, 5, .7);
}
```

## 2. KPI-полоса в шапке

Источник: `src/features/ArchetypeDossierKpis.tsx` (KpiGroup из
`src/vendor/varylo-ui/data-display/KpiGroup.tsx`).

```css
.page-dossier .page-dossier__metrics {
  position: relative; z-index: 3;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  border: 1px solid rgba(239, 201, 111, .28);
  background: rgba(30, 4, 9, .5);
  -webkit-backdrop-filter: blur(10px) saturate(1.15);
  backdrop-filter: blur(10px) saturate(1.15);
}
/* Плитка резервирует место под тренд и спарклайн — их приход ничего не сдвигает. */
.page-dossier__metrics .ui-kpi-group__tile { min-height: 9.6rem; }
@media (max-width: 767px) {
  .page-dossier__metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
```

## 3. Раздел в деревянной рамке с заголовком

Источник: `.archetype-builds` и `.archetype-section-heading` в
`src/features/ConstructedArchetypes.css`.

```tsx
<section className="page-section" aria-labelledby="page-builds-title">
  <header className="page-section-heading">
    <div>
      <span className="page-section-heading__eyebrow">
        <LayoutGrid aria-hidden="true" /> Готовые сборки
      </span>
      <h2 id="page-builds-title">Сборки архетипа</h2>
      <p>Одна строка: что здесь и как читать.</p>
    </div>
    {/* __count — только если этого числа больше нигде на экране нет */}
    <span className="page-section-heading__count">{count} сборок</span>
  </header>
  {/* содержимое: одна таблица, или один график, или одна галерея */}
</section>
```

```css
.page-section {
  margin-top: 1rem;
  border: 8px solid transparent;
  border-image: url('/wallpaper/main-page-rail-border.png') 18 stretch;
  background:
    linear-gradient(rgba(250, 235, 197, .9), rgba(229, 199, 144, .8)),
    var(--arena-parchment-texture) center / cover;
}
.page-section-heading {
  display: flex; gap: 1rem; align-items: end; justify-content: space-between;
  padding: 1rem;
  border-bottom: 1px solid var(--arena-paper-line);
}
.page-section-heading__eyebrow {
  display: inline-flex; gap: .35rem; align-items: center;
  color: var(--arena-red);
  font-size: .68rem; font-weight: 800;
  letter-spacing: .06em; text-transform: uppercase;
}
.page-section-heading h2 {
  margin: .2rem 0 0;
  font-family: var(--font-display);
  font-size: clamp(1.3rem, 2.5vw, 1.8rem);
}
.page-section-heading p {
  max-width: 740px; margin: .35rem 0 0;
  color: var(--arena-muted-ink); font-size: .78rem; line-height: 1.5;
}
```

## 4. Винрейт против 50% с интервалом Уилсона

Для строки списка/таблицы — готовая оценка и ячейка:

```tsx
import { standardMetaWinrateEstimate } from './standardMetaTableModel';
import { WinrateCell } from './StandardMetaWinrateCells';

const estimate = standardMetaWinrateEstimate(row.winrate, row.games); // проценты
// estimate: { winrate, low, high, lowSample } | null
<WinrateCell estimate={estimate} change={row.change ?? null} />
```

Внимание: в проекте две функции Уилсона с разными шкалами (проценты и
доли) — см. `components-and-data.md`. Цвет клетки по расходящейся шкале:
`rankHeatCell(winrate, games)` из `src/features/archetypeRankHeatModel.ts`
→ `{ fill, ink, significant }`.

## 5. Малая выборка: приглушить, а не подписать

```tsx
import { CircleAlert } from 'lucide-react';
import { STANDARD_META_LOW_SAMPLE_GAMES } from './standardMetaTableModel';

const LOW_SAMPLE_HINT = `Меньше ${STANDARD_META_LOW_SAMPLE_GAMES.toLocaleString('ru-RU')} игр: оценка приблизительная`;

<li className={estimate?.lowSample ? 'is-low-sample' : undefined}>
  …
  <small>
    {row.games.toLocaleString('ru-RU')} игр
    {estimate?.lowSample ? (
      <span role="img" aria-label={LOW_SAMPLE_HINT} title={LOW_SAMPLE_HINT}>
        <CircleAlert aria-hidden="true" />
      </span>
    ) : null}
  </small>
</li>
```

```css
.is-low-sample { opacity: .75; }   /* 0.72–0.78, текст остаётся читаемым */
```

`estimate` — из `standardMetaWinrateEstimate` (§4), он уже знает порог
архетипов (`STANDARD_META_LOW_SAMPLE_GAMES`, 500 игр). Для карт порог —
`LOW_CARD_SAMPLE` в `ConstructedArchetypeCardStatsCells.tsx`. Новый порог не
выдумывай; если окно данных короче (неделя), а 500 игр отсекает почти всё —
это стоп-условие, спроси.

## 6. История во времени с разрывами периодов

`LineChart` из `src/shared/ui/analytics/LineChart.tsx`. Точки — `ChartPoint`
(`src/shared/ui/analytics/analyticsModel.ts`): `y: null` рвёт линию,
`segment` рисует подписанную границу, `low`/`high` — полоса интервала.

```tsx
<LineChart
  title="Винрейт"
  unit="%"
  domain={{ minimum: 40, maximum: 65 }}
  points={rows.map(row => ({
    x: Date.parse(row.date),
    y: row.games > 0 ? row.winrate : null,        // нет данных ≠ 0
    segment: row.period,                          // смена периода = разрыв
    low: row.low, high: row.high,                 // интервал Уилсона
    label: formatDay(row.date),
  }))}
  segmentLabel={period => PERIOD_LABELS[period] ?? period}
  bandLabel="95% интервал"
/>
```

Пример целиком: `src/features/ArchetypeHistoryCharts.tsx`.

## 7. Сравнение двух вещей

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

## 8. Доли: treemap + список

Пример: `shareTree()` и `MetaShareList` в
`src/features/StandardMetaChartPlot.tsx`. Правило: treemap не бывает один —
рядом всегда список «иконка класса · название · полоса доли · %» с фильтром
по классу; клик по классу в treemap фильтрует список. Плитки архетипов —
оттенки цвета класса, подпись в мелкой плитке прячется в подсказку.

## 9. Тема для компонентов VaryloUI/Valyro

Обёртка `.hp-varylo` из `src/features/archetypeVaryloTheme.css`
сопоставляет `--ui-*` с пергаментом. Для своей страницы:

```css
/* src/features/<Page>Varylo.css — только переопределения поверх hp-varylo */
.page-varylo {
  --ui-fg: var(--arena-ink);
  --ui-fg-muted: var(--arena-muted-ink);
  --ui-surface: rgba(255, 248, 225, .6);
  --ui-border: var(--arena-paper-line);
  --ui-accent: var(--arena-red);
  --ui-elevated: #fffaf0;            /* подсказки: непрозрачные */
  --ui-floating-border-color: #b89d6c;
}
```

Подключай базу `src/vendor/varylo-ui/styles/index.css` и одну из готовых
тем (`archetypeVaryloTheme.css`, `src/shared/ui/varyloParchment.css`,
`StandardMetaVarylo.css`) — свою добавляй только если их не хватает.

## 10. Телефон: матрица → список

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
