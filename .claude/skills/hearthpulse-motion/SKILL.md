---
name: hearthpulse-motion
description: Анимации и переходы на HearthPulse. Использовать, когда добавляешь или меняешь анимацию, переход, переключатель вида (вкладки, Стандарт/Вольный, фильтры), вход страницы, раскрытие, модалку, bottom sheet, hover, а также при падении tests/motion-tokens.test.mjs или тестов переходов. Даёт фиксированные решения и токены.
---

# HearthPulse: движение

Правило: **анимация только как ответ на действие пользователя. Сомневаешься —
не анимируй.**

Полные правила: `design.md` («Motion And Protected Interactions»),
`docs/specs/public-client-navigation.md` («ValyroUI transitions»).

## Шаг 1. Найди ситуацию

Не выбирай сам. Найди строку и сделай, как в ней написано.

<!-- markdownlint-disable MD013 -->

| Ситуация | Делай |
| --- | --- |
| Hover, focus строки или кнопки | `transition: background-color var(--motion-fast) var(--motion-ease);` |
| Нажатие кнопки | `transition: transform var(--motion-instant) var(--motion-ease);` |
| Стандарт ↔ Вольный меняет URL (`/standard/` ↔ `/wild/`) | Ничего не добавляй. Переход по URL уже анимирован. |
| Вкладка или режим без смены URL | `SegmentedControl` + `ViewSwitch` (шаг 3) |
| Фильтр или сортировка того же списка | `useListTransition` (шаг 3) |
| Загрузка | `LoadingSurface`: он сам ждёт `--motion-reveal-delay` |
| Модалка, панель снизу | `useDockedPanelEntrance`, пресет `cover` или `sheet` |
| Первая отрисовка страницы | Ничего. Первая отрисовка неподвижна. |
| Шапка страницы, первая картинка | Ничего. Это кандидат в LCP. |
| Hover и лайтбокс карт, раскрытия ПС, золотые карты, drag/drop конструкторов | Не трогай. Это защищённые взаимодействия. |
| Ситуации нет в таблице | Не анимируй. Спроси ведущую сессию. |

<!-- markdownlint-enable MD013 -->

## Шаг 2. Бери тайминги только из токенов

Файл `src/styles/tokens.css`. В скриптах — `src/shared/ui/motionTokens.ts`.

<!-- markdownlint-disable MD013 -->

| Токен | Значение | Для чего |
| --- | --- | --- |
| `--motion-instant` | 90 ms | нажатие |
| `--motion-fast` | 140 ms | hover, focus |
| `--motion-base` | 220 ms | меню, подсказка, диалог, смена вида |
| `--motion-slow` | 360 ms | большая поверхность, полоса данных |
| `--motion-stagger` | 60 ms | шаг каскада |
| `--motion-reveal-delay` | 160 ms | пауза перед скелетоном |
| `--motion-ease` | кривая | появление |
| `--motion-ease-exit` | кривая | уход |

<!-- markdownlint-enable MD013 -->

Плохо → хорошо:

```css
/* плохо: литерал, layout-свойство */
.row { transition: height 200ms ease; }

/* хорошо: токен, только opacity/transform */
.row { transition: opacity var(--motion-base) var(--motion-ease); }
```

Правила:

1. Анимируй только `transform` и `opacity`.
2. Не анимируй `height`, `width`, `top`, `left`, `margin`.
3. Не пиши `ms`, `s`, `ease-in-out` в CSS. Тест `motion-tokens` упадёт.
4. Под `@media (prefers-reduced-motion: reduce)` — только смена без движения.
5. Полосы данных при смене вида заново не «растут».

## Шаг 3. Переключатель вида

Сначала проверь, что адаптер переходов есть в `main`:

```bash
git ls-tree -r --name-only origin/main | grep src/components/transitions/ViewSwitch.tsx
```

1. Пусто — адаптер ещё на ветке `claude/valyro-transitions-20261021`.
   Не копируй его к себе. Сделай переключатель без анимации (только
   `SegmentedControl`) и напиши об этом в отчёте.
2. Есть — используй шаблон ниже.

Шаблон (меняй только ключи, подписи и содержимое):

```tsx
import { useState } from 'react';
import { SegmentedControl } from '../vendor/varylo-ui/navigation/SegmentedControl';
import { ViewSwitch } from '../components/transitions/ViewSwitch';

const MODES = ['table', 'map'] as const;                     // МЕНЯЙ: ключи
type Mode = typeof MODES[number];
const OPTIONS = [
  { value: 'table', label: 'Таблица' },                      // МЕНЯЙ: подписи
  { value: 'map', label: 'Карта меты' },
];

export function PageModes() {
  const [mode, setMode] = useState<Mode>('table');
  return (
    <>
      <SegmentedControl
        aria-label="Вид"
        options={OPTIONS}
        value={mode}
        onValueChange={value => setMode(value as Mode)}
      />
      <ViewSwitch viewKey={mode} order={[...MODES]} preset="shared-x">
        {mode === 'table' ? <MetaTableView /> : <MetaMapView />}   {/* МЕНЯЙ */}
      </ViewSwitch>
    </>
  );
}
```

Правила:

1. `order` — массив ключей в порядке кнопок. Не число.
2. `preset` — только `shared-x` (вкладки) или `fade-through` (разный вид).
3. Шапку и `SegmentedControl` в `ViewSwitch` не клади.
4. Пресеты `slide` и `slide-up` для контента не используй.
5. Пресеты в начальный бандл не импортируй: адаптер грузит их лениво.

Фильтр того же списка:

```tsx
import { useListTransition } from '../components/transitions/useListTransition';

// возвращает ref для списка
const listRef = useListTransition<HTMLUListElement>(filteredItems);
return <ul ref={listRef}>{filteredItems.map(item => <li key={item.id}>…</li>)}</ul>;
```

У каждого `<li>` стабильный `key` (id, не индекс). Без этого анимация
неверная.

## Сделано, если

```bash
node --test tests/motion-tokens.test.mjs
npm run qa:ci
```

Обе команды зелёные, и:

- [ ] Ситуация взята из таблицы шага 1.
- [ ] Ни одной литеральной длительности или кривой.
- [ ] Двигаются только `transform` и `opacity`.
- [ ] Первая отрисовка и шапка неподвижны.
- [ ] Reduced motion проверен (DevTools → Rendering → prefers-reduced-motion).
- [ ] Если адаптера нет в `main` — это написано в отчёте.
