<!-- markdownlint-disable-file MD013 -->

# Шаблон: раздел страницы

Раздел = деревянная рамка + заголовок (eyebrow, h2, одна строка) + одно
содержимое. Источник: `.archetype-builds` и `.archetype-section-heading` в
`src/features/ConstructedArchetypes.css`.

## Как использовать

1. Скопируй файл 1 и файл 2 целиком.
2. Замени `PageSection` на имя своего блока (например, `MetaWeekSummary`).
3. Замени префикс `page-section` на свой (например, `meta-week`).
4. Поменяй тексты: eyebrow, заголовок, описание.
5. Поменяй иконку eyebrow на подходящую из `lucide-react`.
6. В `{children}` вставь одно содержимое: список, таблицу или график.
7. Структуру и CSS-свойства не меняй.

## Файл 1. `src/features/PageSection.tsx`

```tsx
import type { ReactNode } from 'react';
import { LayoutGrid } from 'lucide-react';       // МЕНЯЙ: иконка eyebrow
import './PageSection.css';

type PageSectionProps = {
  id: string;                 // уникальный id заголовка, например 'meta-week-title'
  eyebrow: string;            // короткая метка, например 'За 7 дней'
  title: string;              // заголовок, например 'Итоги недели'
  description: string;        // одна строка: что здесь и как читать
  children: ReactNode;        // одно содержимое
};

export function PageSection({ id, eyebrow, title, description, children }: PageSectionProps) {
  return (
    <section className="page-section" aria-labelledby={id}>
      <header className="page-section__heading">
        <span className="page-section__eyebrow">
          <LayoutGrid aria-hidden="true" /> {eyebrow}
        </span>
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
      </header>
      <div className="page-section__body">{children}</div>
    </section>
  );
}
```

## Файл 2. `src/features/PageSection.css`

```css
.page-section {
  margin-top: 1rem;
  border: 8px solid transparent;
  border-image: url('/wallpaper/main-page-rail-border.png') 18 stretch;
  background:
    linear-gradient(rgba(250, 235, 197, 0.9), rgba(229, 199, 144, 0.8)),
    var(--arena-parchment-texture) center / cover;
}

.page-section__heading {
  padding: 1rem;
  border-bottom: 1px solid var(--arena-paper-line);
}

.page-section__eyebrow {
  display: inline-flex;
  gap: 0.35rem;
  align-items: center;
  color: var(--arena-red);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.page-section__eyebrow svg {
  width: 14px;
  height: 14px;
}

.page-section__heading h2 {
  margin: 0.2rem 0 0;
  color: var(--arena-ink);
  font-family: var(--font-display);
  font-size: clamp(1.3rem, 2.5vw, 1.8rem);
}

.page-section__heading p {
  max-width: 740px;
  margin: 0.35rem 0 0;
  color: var(--arena-muted-ink);
  font-size: 0.78rem;
  line-height: 1.5;
}

.page-section__body {
  padding: 1rem;
}
```

## Использование

```tsx
<PageSection
  id="meta-week-title"
  eyebrow="За 7 дней"
  title="Итоги недели"
  description="Архетипы, у которых винрейт вырос или упал сильнее всего."
>
  {/* одно содержимое: см. template-row.md, template-chart.md, template-card.md */}
</PageSection>
```

## Несколько групп внутри раздела

Если в разделе 2–3 группы (рост / падение / новые):

```tsx
<div className="page-section__groups">
  <div className="page-section__group">
    <h3>Растут</h3>
    {/* до 5 строк */}
  </div>
  <div className="page-section__group">
    <h3>Падают</h3>
    {/* до 5 строк */}
  </div>
</div>
```

```css
.page-section__groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
}

.page-section__group + .page-section__group {
  border-left: 1px solid var(--arena-paper-line);
}

.page-section__group h3 {
  margin: 0 0 0.5rem;
  padding: 0 1rem;
  font-family: var(--font-display);
  font-size: 1rem;
}

@media (max-width: 767px) {
  .page-section__group + .page-section__group {
    border-top: 1px solid var(--arena-paper-line);
    border-left: 0;
  }
}
```

Правила:

1. В каждой группе одинаковый лимит строк (5).
2. Пустая группа — одна строка «Нет изменений за неделю».
3. Групп внутри раздела без рамок: только линия `--arena-paper-line`.
4. Счётчик в заголовке раздела не добавляй.
