<!-- markdownlint-disable-file MD013 -->

# Шаблон: шапка страницы сущности

Шапка = арт класса на всю ширину + иконка класса + `h1` + полоса KPI.
Источник: `.archetype-dossier` в `src/features/ConstructedArchetypes.css`,
разметка в `src/features/ConstructedArchetypes.tsx`, KPI в
`src/features/ArchetypeDossierKpis.tsx`.

## Когда нужна

1. Страница одной сущности (архетип, класс, герой, патч) — нужна.
2. Страница-список (мета, карты, матчапы) — не нужна: там уже есть баннер.
3. Шапка одна на странице. Вторую не добавляй.

## Как использовать

1. Скопируй файл 1 и файл 2.
2. Замени префикс `entity-header` на свой (например, `class-header`).
3. Передай `classKey`, `title` и до 6 KPI.
4. Структуру, порядок слоёв и цвета не меняй.

## Файл 1. `src/features/EntityHeader.tsx`

```tsx
import { KpiGroup, type KpiItem } from '../vendor/varylo-ui/data-display/KpiGroup';
import { archetypeClassBackdrop } from './archetypeDetailModel';
import { classIconUrl } from './classIcons';
import '../vendor/varylo-ui/styles/index.css';
import './archetypeVaryloTheme.css';
import './EntityHeader.css';

const LABELS = {
  increase: 'Рост',
  decrease: 'Снижение',
  unchanged: 'Без изменений',
  noData: 'Нет данных',
  loading: 'Загружаем статистику',
  ofTarget: (percent: string, target: string) => `${percent} от ${target}`,
};

type EntityHeaderProps = {
  classKey: string | null;   // 'priest', 'deathknight', ... или null
  title: string;             // русское имя сущности
  kpis: KpiItem[];           // 3–6 штук; проценты передавай долей (0.552), format: PERCENT
};

export function EntityHeader({ classKey, title, kpis }: EntityHeaderProps) {
  const backdrop = archetypeClassBackdrop(classKey);
  return (
    <section className="entity-header">
      {backdrop ? (
        <img
          className="entity-header__backdrop"
          src={backdrop.src}
          srcSet={backdrop.srcSet}
          sizes="(min-width: 1480px) 1440px, 100vw"
          style={{ objectPosition: backdrop.focus }}
          width={1920}
          height={800}
          alt=""
          aria-hidden="true"
          decoding="async"
          fetchPriority="high"
          onError={event => { event.currentTarget.hidden = true; }}
        />
      ) : null}
      <div className="entity-header__identity">
        <img src={classIconUrl(classKey)} alt="" width="68" height="68" />
        <h1>{title}</h1>
      </div>
      <KpiGroup
        className="entity-header__metrics hp-varylo hp-varylo--plate"
        items={kpis}
        minTileWidth={104}
        locale="ru-RU"
        labels={LABELS}
      />
    </section>
  );
}
```

Пример `kpis`:

```ts
const PERCENT: Intl.NumberFormatOptions = { style: 'percent', maximumFractionDigits: 1 };
const kpis: KpiItem[] = [
  { id: 'winrate', label: 'Винрейт', value: winrate === null ? null : winrate / 100, format: PERCENT },
  { id: 'popularity', label: 'Популярность', value: popularity === null ? null : popularity / 100, format: PERCENT },
  { id: 'games', label: 'Игры', value: games, format: { maximumFractionDigits: 0 } },
];
```

## Файл 2. `src/features/EntityHeader.css`

```css
.entity-header {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.1rem;
  align-items: center;
  overflow: hidden;
  min-height: 15rem;
  padding: clamp(1rem, 2vw, 1.5rem);
  border: 12px solid transparent;
  border-image: url('/wallpaper/main-page-rail-border.png') 18 stretch;
  color: #fff0c8;
  background: #3a0610;
  isolation: isolate;
}

.entity-header__backdrop {
  position: absolute;
  z-index: 0;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.entity-header::after {
  position: absolute;
  z-index: 1;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(40, 3, 9, 0.96) 0%, rgba(52, 5, 11, 0.86) 30%, rgba(60, 6, 12, 0.42) 58%, rgba(60, 6, 12, 0.08) 100%),
    linear-gradient(0deg, rgba(30, 3, 7, 0.7) 0%, rgba(30, 3, 7, 0) 45%);
  content: '';
  pointer-events: none;
}

.entity-header__identity {
  position: relative;
  z-index: 3;
  display: flex;
  gap: 1rem;
  align-items: center;
  min-width: 0;
}

.entity-header__identity > img {
  flex: 0 0 auto;
  width: 68px;
  height: 68px;
  filter: drop-shadow(0 7px 10px rgba(0, 0, 0, 0.32));
}

.entity-header h1 {
  margin: 0;
  color: #fff0c8;
  overflow-wrap: anywhere;
  font-family: var(--font-display);
  font-size: clamp(1.75rem, 3vw, 2.7rem);
  line-height: 1.15;
  text-shadow: 0 3px 14px rgba(21, 1, 5, 0.7);
}

.entity-header__metrics {
  position: relative;
  z-index: 3;
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.entity-header .entity-header__metrics {
  border: 1px solid rgba(239, 201, 111, 0.28);
  background: rgba(30, 4, 9, 0.5);
  -webkit-backdrop-filter: blur(10px) saturate(1.15);
  backdrop-filter: blur(10px) saturate(1.15);
}

@media (max-width: 820px) {
  .entity-header { min-height: 0; gap: 0.85rem; padding: 1.5rem 0.8rem 0.8rem; border-width: 8px; }
  .entity-header::after {
    background:
      linear-gradient(180deg, rgba(40, 3, 9, 0.25) 0%, rgba(44, 4, 10, 0.62) 42%, rgba(36, 3, 8, 0.92) 100%),
      linear-gradient(90deg, rgba(40, 3, 9, 0.55) 0%, rgba(40, 3, 9, 0) 80%);
  }
  .entity-header__identity > img { width: 62px; height: 62px; }
  .entity-header h1 { font-size: clamp(1.65rem, 9vw, 2.35rem); }
  .entity-header__metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
```

## Правила

1. Число из KPI в шапке ниже на экране не повторяй.
2. KPI без данных не показывай: убери элемент из `kpis`.
3. Подпись под `h1` (eyebrow, «Класс», «Архетип») не добавляй.
4. Кнопки в шапку не добавляй.
5. Хлебные крошки — над шапкой, как в `ConstructedArchetypes.tsx`.
