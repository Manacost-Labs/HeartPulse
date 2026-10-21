---
name: hearthpulse-motion
description: Анимации и переходы на HearthPulse. Использовать, когда добавляешь или меняешь анимацию, переход между видами (вкладки, Стандарт/Вольный, фильтры), вход страницы, раскрытие, модалку или bottom sheet, и при падении tests/motion-tokens.test.mjs или тестов переходов.
---

# HearthPulse: движение

Полные правила — `design.md`, раздел «Motion And Protected Interactions», и
`docs/specs/public-client-navigation.md` (раздел «ValyroUI transitions»).

## Шаг 1. Тайминги только из токенов

`src/styles/tokens.css`:

<!-- markdownlint-disable MD013 -->

| Токен | Значение | Для чего |
| --- | --- | --- |
| `--motion-instant` | 90 ms | отклик на нажатие |
| `--motion-fast` | 140 ms | hover, focus, мелкие состояния |
| `--motion-base` | 220 ms | меню, подсказки, диалоги, смена вида |
| `--motion-slow` | 360 ms | большие поверхности, полосы данных |
| `--motion-stagger` | 60 ms | шаг каскада |
| `--motion-reveal-delay` | 160 ms | скелетон появляется только после этой паузы |
| `--motion-ease` / `--motion-ease-exit` | кривые | появление / уход |

<!-- markdownlint-enable MD013 -->

В скриптах — `src/shared/ui/motionTokens.ts`. Литеральные `ms` в CSS ловит
`tests/motion-tokens.test.mjs`.

## Шаг 2. Что можно анимировать

- Только `transform` и `opacity`. Без layout-свойств (height, top, width).
- Смена контента после клика — 140–250 ms (`--motion-fast`…`--motion-base`).
  `shared-x` — короткий сдвиг на несколько пикселей с проявлением, его можно;
  `slide`/`slide-up` везут контент на всю ширину — на контент не ставить.
- Первая отрисовка и серверная разметка не двигаются: анимируется только
  изменение после действия пользователя.
- Шапку страницы и другие кандидаты в LCP не анимировать (атрибут
  `data-page-still`).
- `prefers-reduced-motion: reduce` — только смена или короткий fade.
- Защищённые взаимодействия (hover и лайтбокс карт, раскрытия ПС, золотые
  карты, drag/drop конструкторов) не трогать.

## Шаг 3. Готовые инструменты (ValyroUI)

Пресеты Valyro (`PageTransition`) вендорены в
`src/vendor/valyro-ui/motion-kit/`; адаптер сайта —
`src/components/transitions/`. Оба приходят с веткой
`claude/valyro-transitions-20261021`.

<!-- markdownlint-disable MD013 -->

| Ситуация | Инструмент |
| --- | --- |
| Вкладки одной страницы, Стандарт ↔ Вольный | `<ViewSwitch viewKey={…} order={…} preset="shared-x">` |
| Карточки/строки после фильтра (редкость, класс, мана) | `useListTransition(items, ref, mode)` — fade-through + FLIP |
| Переход между страницами | автоматически: `routeTransitionFor()` — `rise`, деталь `shared-z`, смена режима `shared-x` |
| Раскрытие панели снизу, модалка | `useDockedPanelEntrance`, пресеты `sheet` / `cover` |

<!-- markdownlint-enable MD013 -->

Как выбрать:

- Стандарт ↔ Вольный **меняет URL** (`/…/standard/` ↔ `/…/wild/`) —
  ничего не добавляй: `routeTransitionFor` сам играет `shared-x`.
- Режим или вкладка — **клиентское состояние** — оберни меняющуюся часть в
  `<ViewSwitch viewKey={mode} order={['standard', 'wild']}>`. Кнопки —
  `SegmentedControl` (`src/vendor/varylo-ui/navigation/SegmentedControl.tsx`,
  пример — `StandardMetaChartPlot.tsx`).
- Тот же список с новыми строками (фильтр, сортировка) — `useListTransition`,
  не `ViewSwitch`.
- Шапку в `ViewSwitch` не клади: она кандидат в LCP (`data-page-still`).
  Числа KPI в шапке при смене режима просто меняются, без анимации.
  Переход по URL (`routeTransitionFor`) анимирует контент под шапкой и
  элементы с `data-page-still` не трогает.
- Полосы данных при смене вида не «растут» заново: новый вид проявляется
  целиком.
- `ViewSwitch` и `useListTransition` сами обрабатывают reduced motion.

`order` — массив ключей в порядке кнопок (не число): более поздний ключ
играет «вперёд», более ранний — «назад».

Если `src/components/transitions/` ещё нет в `origin/main`, ветка переходов
не слита: не копируй её код к себе, спроси ведущую сессию.

Разрешённые пресеты: `fade`, `fade-through`, `shared-x`, `shared-y`,
`shared-z`, `rise`, `cover`, `sheet` (тип `SiteTransitionPreset`).
Движок пресетов грузится лениво (`lazyTransitionPresets.ts`); до загрузки
всё просто проявляется. Не импортируй пресеты в начальный бандл страницы.

## Шаг 4. Проверка

```bash
node --test tests/motion-tokens.test.mjs
npm run qa:ci
```

Плюс тест переходов (`tests/next-page-transitions-browser.test.mjs`) и
замер INP на телефоне до/после. Запись 1440 и 412 (кадры или видео) — в
отчёт.

## Проверь перед READY

- [ ] Ни одной литеральной длительности или кривой.
- [ ] Двигаются только transform/opacity, первая отрисовка неподвижна.
- [ ] LCP-элемент не анимируется.
- [ ] Reduced motion проверен.
- [ ] INP и CLS не хуже; бюджет бандла не превышен или одобрен.
