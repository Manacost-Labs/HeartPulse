# Конфиг кадров

Файл JSON: общий `brand` и список `shots`. Образец —
`shots-top5.json` (пять кадров от 21.10.2026).

```json
{
  "brand": { "domain": "hearthpulse.net", "background": "tavern", "scale": 2 },
  "shots": [
    {
      "id": "meta-map",
      "route": "/standard/meta/",
      "waitFor": ".standard-meta-chart",
      "actions": [
        { "click": ".standard-meta-chart button:has-text('Показать')" }
      ],
      "target": ".standard-meta-map",
      "padding": 12,
      "caption": "Мета Hearthstone в одном графике",
      "subcaption": "Популярность × винрейт · Стандарт, Алмаз — Легенда",
      "layouts": [
        "x",
        { "layout": "vk", "viewport": { "width": 480, "height": 1000 } }
      ]
    }
  ]
}
```

## Поля `brand`

<!-- markdownlint-disable MD013 -->

| Поле | Значение |
| --- | --- |
| `domain` | Текст рядом с логотипом. Всегда `hearthpulse.net`. |
| `background` | Фон по умолчанию: `tavern` (тёмная таверна) или `parchment` (пергамент в деревянной рамке). |
| `scale` | Множитель пикселей макета. `2` — файлы @2x (2400×1350). |

<!-- markdownlint-enable MD013 -->

## Поля кадра

<!-- markdownlint-disable MD013 -->

| Поле | Обязательно | Значение |
| --- | --- | --- |
| `id` | да | Латиница и дефис. Имя файлов. |
| `route` | да | Путь страницы со слэшем в конце, можно с `?query`. |
| `waitFor` | нет | Селектор, который должен появиться до действий. |
| `actions` | нет | Шаги до снимка, по порядку (таблица ниже). |
| `hide` | нет | Ещё селекторы, которые спрятать (`display: none`). |
| `target` | нет | Селектор блока. Нет — снимается экран целиком. |
| `padding` | нет | Отступ вокруг блока, px. По умолчанию 24. Блок с рамкой — `0`. |
| `crop` | нет | Часть блока: `{ "x", "y", "width", "height" }` в px от левого верхнего угла блока. |
| `snap` | нет | `{ "rows": "tbody tr", "columns": "thead th" }`: обрезка кончается на целой строке/столбце. |
| `clip` | нет | Область страницы целиком `{ x, y, width, height }` вместо `target`. |
| `viewport` | нет | `{ "width", "height" }`. По умолчанию 1440×900. 480 — телефонная вёрстка. |
| `dpr` | нет | Плотность пикселей. По умолчанию 2. |
| `access` | нет | `"guest"` — снять как гость. По умолчанию подписчик. |
| `settleMs` | нет | Пауза после загрузки, мс. По умолчанию 800. |
| `after` | нет | Шаги после загрузки картинок, прямо перед снимком (например, `hover`). |
| `caption` | для макета | Заголовок, до ~45 знаков. |
| `subcaption` | нет | Вторая строка: срез, период. |
| `background` | нет | `tavern` или `parchment` для этого кадра. |
| `layouts` | для макета | Список форматов: `"x"`, `"vk"`, `"wide"`. Объект `{ "layout": "vk", ...поля }` снимает формат отдельно со своими полями (`viewport`, `crop`, `target`). |

<!-- markdownlint-enable MD013 -->

Без `caption` или `layouts` пишется только «сырой» кадр `<id>-raw.png/.webp`.

## Действия

<!-- markdownlint-disable MD013 -->

| Шаг | Что делает |
| --- | --- |
| `{ "click": "<селектор>" }` | Нажать. |
| `{ "hover": "<селектор>" }` | Навести курсор (подсказка, подсветка строки). |
| `{ "select": "<селектор select>", "value": "36.4.2" }` | Выбрать пункт списка. |
| `{ "fill": "<селектор>", "value": "текст" }` | Ввести текст. |
| `{ "press": "Escape" }` | Нажать клавишу. |
| `{ "waitFor": "<селектор>" }` | Ждать появления. |
| `{ "scroll": "<селектор>" }` | Прокрутить к элементу. |
| `{ "wait": 1000 }` | Пауза, мс. Только если нечего ждать селектором. |

<!-- markdownlint-enable MD013 -->

Селекторы — Playwright: CSS и `:has-text('…')`.

## Форматы

| Формат | Размер | Куда |
| --- | --- | --- |
| `x` | 1200×675 | X, Telegram, VK-пост с горизонтальной картинкой |
| `vk` | 1080×1350 | VK, Instagram, портрет |
| `wide` | 1600×900 | Сайт, презентации, 16:9 |

Портрет (`vk`) почти всегда снимай отдельно: узкий `viewport` 480 или
более высокий `crop`, иначе широкий блок станет полоской.

## Блоки (21.10.2026)

<!-- markdownlint-disable MD013 -->

| Блок | `route` | `target` | Подготовка |
| --- | --- | --- | --- |
| Карта меты | `/standard/meta/` | `.standard-meta-map` | `click` `.standard-meta-chart button:has-text('Показать')`, `waitFor` `.standard-meta-map svg` |
| Матрица матчапов | `/standard/matchups/` | `.ui-matchup-matrix` | архетип выбран в списке «Ваш архетип»; `crop` + `snap` |
| Шапка архетипа | `/standard/archetypes/standard/<slug>/` | `.archetype-dossier` | — |
| Винрейт по рангам | `/standard/archetypes/standard/<slug>/` | `.archetype-ranks` | — |
| Муллиган | `/standard/archetypes/standard/<slug>/` | `.constructed-card-stats` | `hide` `.constructed-card-stats__toolbar`; `snap` `tbody tr` |
| Sankey патча | `/standard/patches/` | `.hp-patch-flow` | `select` `select` = версия патча, `waitFor` `.hp-patch-flow svg` |

<!-- markdownlint-enable MD013 -->

Не все патчи имеют Sankey: он есть, когда изменённые карты играют в
популярных архетипах. `FAILED … not found` — выбери другой патч.
Слаг архетипа — из адреса его страницы.
