# Страница «Сборка» (`/standard/assemble/`)

Отдельный интерактивный инструмент для 13 карт Властвования Чёрной Империи
с механикой «Собирает» (HeartPulse#534). Данные те же, что в секции на
страницах карт (`docs/specs/card-assemble.md`); здесь они собраны на одной
странице с крупным выбором карты. На страницах карт вместо полной секции теперь компактный блок со ссылкой сюда
(HeartPulse#535, `docs/specs/card-assemble.md`).

## Адрес

- `/standard/assemble/` — карта по умолчанию, Стандарт.
- `?card=<card_id>` выбирает карту (`[A-Za-z0-9_]{2,80}`). Нет параметра,
  значение не похоже на id или карты нет в списке — карта по умолчанию:
  нейтральная с данными (сейчас РЕ-3-ВЕР), иначе первая с данными. Всегда
  200, без редиректов и 404.
- `?format=wild` — Вольный, любое другое значение — Стандарт. Ссылки выбора
  сохраняют формат, Стандарт параметра не пишет.
- Выбор базы и класса игрока в адрес не пишется.
- `/standard/assemble` (без слэша) nginx переводит на `/standard/assemble/` 301
  с сохранением запроса.
- Canonical любого запроса — `https://hearthpulse.net/standard/assemble/`;
  страница индексируемая (`index`, `canonicalPolicy: self`, в карте сайта).

## Данные и SSR

Страница `force-dynamic` и читает `searchParams` (без этого `?format=wild` без
JS получил бы Стандарт). `lib/publicCardAssemble.ts` читает Express анонимно
(`fetchPublicExpress`) в общем бюджете `FIRST_PAINT_READ_BUDGET_MS` (600 мс):

1. `GET /api/card-assemble/:format` — список карт (контракт HeartPulse#533:
   `state`, размер пула, средний винрейт);
2. `GET /api/card-assemble/:format/:cardId?base=top` — выбранная карта,
   существующий прокси с кешем 10 минут. Запрошенная карта читается рядом со
   списком, карта по умолчанию — после него.

Что не уложилось в бюджет или не прошло проверку формы (`isAssembleList`,
`isAssembleCardData`), приходит `null`: страница рисует то, что есть, а
браузер догружает остальное (`useCardAssembleList`, `useCardAssemble`).
Второго контракта нет: на клиент уходят те же проекции `CardAssembleListData`
и `CardAssembleData`. Размер HTML с `?card=BE_044&format=wild` — около 28 КБ gzip.

## Интерфейс

- H1 «Сборка» (баннер раздела), переключатель «Стандарт / Вольный»
  (ссылки), источник HSReplay и дата данных списка.
- `AssembleCardPicker`: плитки-ссылки 13 карт — арт, мана, название, класс,
  размер пула и средний винрейт; карта без данных (`state` не `ok`)
  подписана «Нет данных» и не выбирается по умолчанию, но открывается по
  ссылке и объясняет, что данных нет. Без JS плитка — обычный переход; с JS —
  мягкая навигация (`navigate`), плитка загорается сразу, секция тускнеет до
  ответа сервера. Сетка: от 11 rem, на 390 px — две колонки.
- Секция выбранной карты — тот же `CardAssembleSection` (сводка, выбор класса
  у РЕ-3-ВЕР, «Что выпало?» с поиском, «Лучшие сборки», «Мне предложили» с
  полным пулом, источник и дата). Ей добавлены `initial` (данные сервера,
  первый запрос пропускается), `staticStyles` (CSS даёт маршрут, ворота
  `styled` не нужны) и `heading` (заголовок — название карты). Секция сбрасывается
  `key` по формату и карте (ключ стоит на `AssembleTool`, оболочка страницы не пересоздаётся).
  Повторный клик по уже открытой карте ничего не загружает и не оставляет страницу в «ожидании» (#582).
- `PortraitPicker` считает «две строки по три» на телефоне через
  `useSyncExternalStore` (сервер рисует широкий вариант), чтобы гидрация не
  расходилась.

## Бандл и CSS

`public.ts` экспортирует `AssembleTool` ленивой ссылкой (`AssembleToolLazy`),
как секцию: страницы карт и каталог не растут. Стили страницы и секции
подключает маршрут (`apps/public-web/ui/AssemblePage.css`), поэтому SSR
не пустой. Бюджет: `config/next-bundle-budgets/baselines/standard--assemble.json`
(JS ≤ 200 000 Б, CSS ≤ 56 000 Б gzip); пункт меню увеличил общую оболочку —
`approvals/designer-534-assemble-tool.json`.

## Меню и маршрутизация

- `navigationData.ts`: `standard-assemble` после «Конструктора колод»,
  `entitlement: null`; двойник Вольного `wild-assemble`
  (`/standard/assemble?format=wild`). Иконка — `public/menu/icons/standard-assemble-{40,80,120}.webp`
  (`render_art.py`, «две половины карты, соединённые швом»), `menuArt.json`.
- Реестры: `public-seo-pages.json`, `public-seo-structured-data.json`
  (хлебные крошки и `CollectionPage`), `publicRouteInventory.json`,
  `routeOwnership.mjs`, `documentCaching.mjs`, `webVitalsDimensions.ts`,
  `public/llms.txt`.
- nginx origin: `standard/assemble` в `arena-html-routing.conf` (редирект
  без слэша и проксирование в Next с `$arena_next_html_robots_header`) и в
  `arena-seo-map.conf`; хеш контракта в `ci.yml` обновлён. Edge-конфиг не
  менялся: страница не ISR.

## Проверки

`tests/assemble-page.test.ts` (адрес, выбор карты по умолчанию, проверки
формы), `tests/next-assemble-tool-browser.test.mjs` (HTML без JS, Вольный,
плитки-ссылки, мягкая навигация и «Назад», меню, 1440 и 390 px без
горизонтального скролла, axe wcag2a/aa).
