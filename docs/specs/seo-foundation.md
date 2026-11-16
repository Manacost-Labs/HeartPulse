# HearthPulse SEO foundation

## Objective

Protect the canonical `hearthpulse.net` identity, make public search-preview
media crawlable, and preserve the cache policy selected by the application.
This slice must not open private API responses to indexing or shared caches.

## Commands and entry points

- `npm run test:unit -- --run tests/article-image-src.test.ts` verifies the
  public article-cover host boundary.
- `node --test tests/koloda-domain-links.test.mjs` verifies canonical brand and
  compatibility-domain references.
- `node --test tests/robots-policy.test.mjs tests/nginx-html-routing.test.mjs`
  verifies crawler policy at both the public file and origin edge.
- `node --test tests/hearthpulse-shadow-nginx.test.mjs` verifies the canonical
  edge cache contract.
- `make check` remains the repository-wide release gate.

## Project structure

- Browser and shared URL policy lives in `shared/articleImageSrc.ts` and the
  owning frontend route modules.
- Express owns media validation and response cache headers.
- `deploy/nginx/arena-seo-map.conf` classifies API responses for search robots.
- `deploy/nginx/arena-html-routing.conf` applies that classification at origin.
- `deploy/nginx/hearthpulse-shadow-app.conf` must forward origin cache headers
  unchanged while preventing its own proxy cache from storing application
  responses.
- `public/robots.txt` describes the same public crawler boundary. Its one
  `Clean-param` line folds advertising labels (`utm_*`, `yclid`, `fbclid`,
  `gclid`, `ref`) for Yandex; a parameter that changes what a page shows
  (`format`, `period`, `q`, `class`, the faceted and deep-link parameters of
  `queryPolicies`) never belongs there.
- `public/llms.txt` is the AI-search index of the sections: canonical links,
  the data source, the refresh interval confirmed by a timer or config, and
  what is open versus subscription-only. It promises no figures that a guest's
  HTML does not contain.

## Code and configuration rules

- `hearthpulse.net` is the product identity. Bare `manacost.ru` is unrelated
  and must not appear in trust allowlists, initial source labels, or generated
  social artwork.
- Legacy `arena.hs-manacost.ru`, `cdn.arena.hs-manacost.ru`, and
  `hs-manacost.ru` remain migration transports; this slice does not remove
  them.
- Public titles end with `| HearthPulse`; the WebSite JSON-LD is named
  `HearthPulse` with `Manacost Arena` as `alternateName`. Manacost stays the
  publishing organization and the legal party in privacy and terms titles.
  The `/standard/meta` title deliberately leads with «HSGuru» for that query.
- Every URL in JSON-LD, sitemaps and internal links is the canonical
  trailing-slash form; a slash-less page URL costs a `301`.
- An entity sitemap `lastmod` moves only when the page content changes. Cache
  busters (card image `?v=`) and upstream sync stamps (cosmetics `updatedAt`)
  stay out of the semantic hash. The archetypes segment dates a change by the
  catalog's own `updatedAt` instead of the day the server saw it. `static.xml`
  has no `lastmod`: its pages are data-driven and no source dates their content
  honestly.
- Every indexable detail route has a sitemap segment: cards, BG cards and
  heroes, plus `cosmetics.xml` and `guides-archive.xml`, whose listings do not
  link the detail pages in server HTML. `archetypes.xml` lists only the
  archetype pages that pass the indexing rule, not every detail route.
- JSON-LD describes what the page shows. `numberOfItems` equals the listed
  items or is omitted, one list never repeats a URL, and a breadcrumb has no
  section crumb without its own page. A Dataset's `license` is the site terms
  (`/terms/`), the only reuse grant the owner has published, unless the node
  sets `"license": null`: a paywalled Dataset (`/tierlist`) has none, because
  the terms are not a grant to reuse its closed data. Its
  `dateModified` is the update date of the data the page shows, and
  `temporalCoverage` is written only when a source names the window
  (`docs/specs/seo-entity-indexing.md#json-ld-of-statistics-pages`).
- Article cards are real `<a href target="_blank">` links. A VIP article keeps
  its access flow on click; its `href` is the public, locked page.
- Meta descriptions go through `fitMetaDescription` (`src/shared/seo/metaDescription.ts`):
  at most 160 characters, cut at a word boundary.
- Generated tokens (`…t3`, `…t8_t`) have no card page; galleries show them
  without a link instead of linking to a `404`.
- Only the closed public media routes may omit `X-Robots-Tag: noindex`.
- Empty Nginx `add_header` map values intentionally suppress that header.
- The canonical edge bypasses its proxy cache but does not overwrite
  application `Cache-Control` with a global `no-store` response header.

## Открытый слой и платная разметка

Решение владельца (E21, 2026-11-15): платная страница отдаёт роботам и
анонимным посетителям один и тот же серверный HTML с открытым слоем, а
закрытая часть размечена как платная. Следующие срезы E21 (`/classes/`,
гайды, карточки) ссылаются на этот раздел.

Правила:

- **Один HTML для всех.** Ветвления по `User-Agent` нет: робот и аноним
  получают тот же документ. Подписчик получает его же, а полный список
  дорисовывает клиент после проверки доступа.
- **Закрытое не отправляется.** Открытый слой строит анонимная проекция
  Express по белому списку полей: объект собирается поле за полем, а не
  копированием строки датасета. Следующие поля не попадают ни в проекцию, ни
  в HTML, ни в RSC-payload (`self.__next_f`), ни в JSON-LD: винрейты
  (`winrate`, `deckWinrate`, `playedWinrate`), число игр по карте
  (`totalGames`), очки (`score`, `arenaScore`) и карты вне открытого среза.
  Размер выборки открыт только как нижняя граница: наибольшее число игр по
  одной карте, округлённое вниз до двух значащих цифр (`sampleGamesAtLeast`,
  987654 → 980000), на странице «по данным более N игр». Точное число игр по
  карте не публикуется ни в каком виде.
  Всё, что серверный компонент передаёт клиентскому через props, попадает в
  RSC-payload, поэтому клиентской части отдают только белый список, а
  серверный компонент открытого слоя передают в неё как `children`.
- **Страница повторно фильтрует ответ.** Загрузчик Next
  (`apps/public-web/lib/publicTierlistTeaserData.ts`) копирует только
  разрешённые поля и режет списки до 10 и 3 карт, так что лишнее поле в
  ответе Express не дойдёт до страницы.
- **Разметка платной части.** Узел страницы (у `/tierlist` это Dataset) с
  `isAccessibleForFree: false` и `hasPart` типа `WebPageElement` с
  `cssSelector` закрытого блока. Селектор должен совпадать с классом
  реального контейнера в HTML. Если данных для
  открытого слоя нет, страница отвечает 200 без него, а разметка остаётся.
- **Лицензия.** У платного Dataset нет поля `license` (`"license": null` в
  `config/public-seo-structured-data.json` означает «не писать»).
- **Свежесть после деплоя.** `/tierlist/` входит в `DATA_PAGES`
  (`app/health/next/revalidate/route.ts`) и прогрев
  (`scripts/warm-prerendered-pages.mjs`), а на edge-узле держит копию
  минуту, а не пять: правило пятиминутных ISR-страниц в
  `deploy/nginx/hearthpulse-shadow-app.conf` — только страницы без серверных
  данных (список сверяет `tests/hearthpulse-shadow-nginx.test.mjs`). Копия
  сборки без среза заменяется сразу после деплоя (#404).
  Прогрев после деплоя проверяет и динамические страницы с данными
  (`scripts/lib/post-deploy-data-pages.mjs`: перечень и минимум слов).

Что держит правило тестами: `tests/tierlist-public-teaser.test.ts`
(проекция, маршрут, JSON-LD) и `tests/next-tierlist-teaser.test.mjs`
(собранная страница: HTML, RSC-payload и JSON-LD). Фикстура
`tests/helpers/tierlistTeaserFixture.ts` даёт каждому винрейту и каждому
числу игр уникальное значение; тест падает, если любое из них (или имя карты
вне среза) найдено в выводе. Первая страница с открытым слоем: `/tierlist/`.

### `/classes/`: порядок классов

Вторая страница с открытым слоем (E21 S1, #374). Открыт порядок классов
Арены: класс, место, винрейт на дату, размер выборки по классу, дата
обновления и источник. Разбивки (по картам, периодам), история и сравнение закрыты.

- **Проекция.** `GET /api/winrates/public-teaser` (`server/winrateRoutes.ts`,
  без `accessGuard`) читает только основной источник (HSReplay), через тот же
  кеш, Redis и снимок, что и полный `GET /api/winrates` (он по-прежнему
  закрыт). Белый список: `place`, `id`, `name`, `winrate`, `sample`,
  `updatedAt`, `source`, `sampleUnit`. Места считаются по винрейту датасета
  (только для порядка); `source` — подпись «HSReplay» или «Firestone», а не адрес
  провайдера. При сбое источника проекция строится из снимка (LKG), без
  данных — 502, а страница отвечает 200 без таблицы.
- **Закрытое значение.** Винрейт точнее 0,1 п.п. закрыт так же, как
  разбивки: проекция и загрузчик Next
  (`apps/public-web/lib/publicClassesTeaserData.ts`) округляют его до 0,1
  сами, а не доверяют входу. Остальное (победы, поражения, доля выбора, доля
  7+ побед, распределения, матчапы, разбивки по периодам и картам) в
  белый список не входит. Размер выборки по классу открыт целиком, как решил
  владелец, а его единицу называет Express по источнику (`sampleUnit`):
  `drafts` у HSReplay (`num_drafts` — число забегов, не партий), `games` у
  Firestone (`totalGames`). Колонка называется «Забегов» или «Игр»; загрузчик
  Next пропускает только эти два значения, иначе числа нет. Если источник
  числа не дал (старый снимок), в таблице «—».
- **Расположение.** Серверный компонент `ClassesPublicTeaser` стоит сразу
  под заголовком и хлебными крошками, перед платной заглушкой, поэтому гость
  видит таблицу без прокрутки. Подписчику открытая таблица скрыта
  (`hidden`), он видит полную страницу; в HTML она одна и та же для всех.
  Закрытая часть (`ArenaClassesResults` с заглушкой) обёрнута в
  `.paywalled-classes`, как и называет JSON-LD (`hasPart.cssSelector`);
  `license` у Dataset `/classes` не пишется.
- **Свежесть.** `/classes/` входит в `DATA_PAGES` и прогрев и держит копию
  на edge-узле минуту, как `/tierlist/`: после деплоя копия сборки без
  таблицы заменяется сразу (#404).

Тесты: `tests/classes-public-teaser.test.ts` (проекция, маршрут, JSON-LD) и
`tests/next-classes-teaser.test.mjs` (собранная страница: HTML, RSC-payload,
JSON-LD). Фикстура `tests/helpers/classesTeaserFixture.ts` даёт винрейтам с
лишними знаками, победам, долям и разбивкам уникальные значения; тест падает,
если любое из них найдено в выводе.

## Testing strategy

1. Add failing contract assertions for each boundary.
2. Change the smallest owning implementation or Nginx map.
3. Run focused tests after every logical change.
4. Run TypeScript, build, security, Nginx, and full repository gates before
   integration.
5. Review the affected production URLs in a real browser after deployment.

## Safety boundaries and rollback

- Authentication, account, subscription, admin, and all unclassified API
  routes remain `noindex` and `no-store` where selected by the application.
- Public-media allowlisting is path based; clients cannot opt an arbitrary API
  response into indexing.
- A failure is rolled back by reverting the relevant commit. No database or
  content migration is part of this slice.

## Success criteria

- Bare `manacost.ru` is absent from HearthPulse trust and branding paths.
- `/api/article-cover`, `/api/card-image/`, and `/api/public-resource/` may be
  crawled on `hearthpulse.net`; other API routes retain `noindex`.
- Immutable/public origin responses remain immutable/public at the canonical
  edge, while private responses retain their origin-selected `no-store` policy.
- Focused contracts, `make check`, security checks, browser review, production
  SHA verification, and the production smoke all pass.

## Open questions for the next slice

- Decide which legacy internal links can move from redirects to direct
  canonical URLs without affecting saved content.
- Use Search Console data to prioritize title and landing-page improvements.
