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
| `--motion-ease` / `--motion-ease-exit` | кривые | появление / уход |

<!-- markdownlint-enable MD013 -->

В скриптах — `src/shared/ui/motionTokens.ts`. Литеральные `ms` в CSS ловит
`tests/motion-tokens.test.mjs`.

## Шаг 2. Что можно анимировать

- Только `transform` и `opacity`. Без layout-свойств (height, top, width).
- Ответ на клик — 150–250 ms. Длинные «путешествующие» пресеты (slide,
  slide-up) на контент не ставить.
- Первая отрисовка и серверная разметка не двигаются: анимируется только
  изменение после действия пользователя.
- Шапку страницы и другие кандидаты в LCP не анимировать (атрибут
  `data-page-still`).
- `prefers-reduced-motion: reduce` — только смена или короткий fade.
- Защищённые взаимодействия (hover и лайтбокс карт, раскрытия ПС, золотые
  карты, drag/drop конструкторов) не трогать.

## Шаг 3. Готовые инструменты (ValyroUI)

Пресеты Valyro вендорены в `src/vendor/valyro-ui/motion-kit/`; адаптер сайта —
`src/components/transitions/` (появляется с веткой
`claude/valyro-transitions-20261021`; до её слияния сверяйся с этой веткой).

<!-- markdownlint-disable MD013 -->

| Ситуация | Инструмент |
| --- | --- |
| Вкладки одной страницы, Стандарт ↔ Вольный | `<ViewSwitch viewKey={…} order={…} preset="shared-x">` |
| Карточки/строки после фильтра (редкость, класс, мана) | `useListTransition(items, ref, mode)` — fade-through + FLIP |
| Переход между страницами | автоматически: `routeTransitionFor()` — `rise`, деталь `shared-z`, смена режима `shared-x` |
| Раскрытие панели снизу, модалка | `useDockedPanelEntrance`, пресеты `sheet` / `cover` |

<!-- markdownlint-enable MD013 -->

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
