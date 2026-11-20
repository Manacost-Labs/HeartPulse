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
- Every `<url>` of every `/sitemaps/*.xml` and every `<sitemap>` of
  `/sitemap.xml` carries a `lastmod` (`YYYY-MM-DD`, UTC). The production
  monitor fails on an entry without one, on a malformed one, and on an index
  date that is not the latest date of its sitemap. The rules are in
  «`lastmod` semantics» below.

## `lastmod` semantics

`lastmod` is the day the content a visitor sees in the main part of the page
(figures, composition, text) last changed. The day of a build, a deploy or a
request never goes into it. Only a change of that content moves it: the line
«данные обновлены <дата>» with the same figures is not a change, and neither
are cache busters (card image `?v=`) or upstream sync stamps (cosmetics
`updatedAt`, `sourceAddedAt`); the semantic hash of an entity leaves them out.

- **Entity segments** (`SemanticSitemapStore`, one durable file per segment in
  `SERVER_DATA_DIR`, which lives in the `shared/` directory of the server and
  so survives a deploy; the `*.lkg.json` mirror guards a torn write). The store
  dates every address, by this order:
  1. an address whose semantic hash changed: the date its source states for the
     data (`dataDate`: archetypes take the catalog's `updatedAt`), else the day
     the store saw the change; never ahead of today, never before the stored
     date;
  2. an address the store has no date for (new, or kept from before the store
     dated every address): `dataDate`, else the day its entity states it came
     into being (`createdOn`: a guide's publication day, `published_iso`), else
     the day the store first saw it. `dataDate` goes first, as in rule 1: it is
     when the data was produced, and an entity cannot have been produced before
     it came into being, so it is the closer answer to «when did the content last
     change»; the creation day is only the earliest that content can date from.
     No segment states both today. That day is stored, so a rebuild, a restart
     or a deploy does not move it;
  3. an address whose hash did not change keeps the stored date.
  An address that leaves the segment and returns is a new address.
  State saved before the store dated every address has addresses without a
  day. When a segment is served from that state (a rebuild did not finish in
  2 s, or the index reads it), each such address takes the day the store first
  sees it, as in rule 2 without the source's own dates (they are not at hand),
  and the completed state is written back. The rebuild that catches up then
  keeps that stored day (rule 3), so the day shown from the saved copy and the
  day the store keeps are one. No served document has a `<url>` without
  `lastmod`.
- **Static pages** (`static.xml`). The build gives each page a content
  fingerprint (`scripts/lib/public-seo-model.mjs`, `staticPageFingerprints`,
  written to `dist/sitemaps/static-fingerprints.json`): a hash of its registry
  record (`config/public-seo-pages.json`) and, for the text pages (`/faq`,
  `/privacy`, `/terms`, `/developers/api`), of the text a visitor reads in the
  main part of the page. That text is the real page component rendered at
  build time and reduced to text by the project's HTML parser
  (`scripts/render-public-page-texts.tsx`, run under `tsx` by
  `scripts/lib/public-page-texts.mjs`); the page shell (navigation, footer)
  is not part of it. A comment, a reformat or a renamed variable in a source
  file therefore does not move the date; a changed word of the visible text
  does. The fingerprint depends on nothing else, so a rebuild of the same
  content repeats it. The server keeps those fingerprints in the same
  store (internal segment `static-pages`, no sitemap of its own) and dates a
  page by the day it first saw the current fingerprint. A page that lists the
  entities of a segment (cards, archetypes, BG heroes and library, cosmetics
  by kind, guides archive) has the later of that date and the latest `lastmod`
  of the entities it lists (`STATIC_PAGE_LISTINGS`), because its figures are
  those entities. A data page whose data this router does not load (meta,
  matchups, tier lists, classes, leaderboards and the like) is dated by its
  fingerprint alone: its `lastmod` follows the page's registry record, not the
  daily refresh of its figures (a known gap, issue 427).
- **Index.** The `lastmod` of a `<sitemap>` is the latest `lastmod` of the
  addresses of that sitemap. The index is built per request and never waits
  for a rebuild when it can avoid it: a segment's fresh document is used when
  the process has one, and in a process that has built nothing yet the saved
  state is read (a file read) while the rebuild starts behind it. Only a
  segment with no document and no state is waited for, once, for at most the 2
  s answer deadline, so the index answers within 2 s. A segment that cannot be
  built is dated from the state the store saved earlier (the last-known-good
  copy, which survives a restart); if that state holds no day for any address,
  the day its state was last written stands in. When no day can be had for any
  record, that sitemap is left out of the index: it has nothing to serve and
  its own address answers with an error, while one failing segment must not
  take every sitemap from crawlers. Every record that is listed has a
  `lastmod`. The index answers `503` with `Retry-After` only when no record at
  all can be dated. The production monitor compares the exact set of segments,
  so a missing one is reported by name.
- **Monitor and the edge cache.** The edge caches `/sitemap.xml` and every
  segment separately, each by `$request_uri` with its query string, for five
  minutes (`deploy/nginx/arena-edge-static-cache.conf`), so right after an
  update the index date may lag or lead the segment's latest date. The
  monitor therefore asks again before it calls that an error: it fetches the
  index and the segment under a query string no cache holds
  (`?lastmod-recheck=<random>`; the cache key includes the query, so the
  request goes to the origin, and Express ignores it). A disagreement that
  survives two such pairs is an error; one that does not is a warning.
- The date of first sight is the date of the first successful request after the
  change reaches production, a few minutes after a deploy at the latest while
  the monitor polls the sitemaps. If the state file is lost, every address is
  dated by the day it is first seen again.
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

## Индексируемое содержимое — интерфейс

Правило владельца (E25 #538, 2026-11-20) для всех SEO-срезов: в индекс идёт
полезный интерфейс, а не текст для робота.

- Индексируемое содержимое — плашки с метриками, таблицы и блоки ссылок на
  связанные страницы. Абзацы SEO-текста в конце или в начале страницы
  («Насколько силён … сейчас», пересказ тех же цифр прозой) не пишутся.
- Никаких служебных фраз и простыней: «как читать эти цифры», «в этом тексте
  их нет», «ниже — …», «доступно по подписке — здесь этого нет».
- Пояснение к метрике — подсказкой у самой метрики или в блоке «О странице»
  (как в E22 A, #454), а не отдельным абзацем.
- Данные остаются в серверном HTML. Скрывать содержимое от людей и
  показывать его роботу нельзя (это клоакинг): что видит робот, видит и
  посетитель.
- Порог индексации (`shared/seoIndexThreshold.ts`) страница проходит
  фактами интерфейса (`INDEX_MIN_OWN_FACTS`), а не словами, добавленными
  ради счёта.

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
  (`apps/public-web/lib/publicTierlistData.ts`) копирует только
  разрешённые поля и округляет винрейт и частоту выбора до 0,1, так что
  лишнее поле в ответе Express не дойдёт до страницы.
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
  (`scripts/lib/post-deploy-data-pages.mjs`: перечень и признак данных в HTML).

Что держит правило тестами: `tests/tierlist-public.test.ts`
(проекция, маршрут, JSON-LD, мутация) и `tests/next-tierlist-public.test.mjs`
(собранная страница: HTML, RSC-payload и JSON-LD, браузер). Фикстура
`tests/helpers/tierlistPublicFixture.ts` даёт каждому платному показателю
уникальное значение (метки `mulliganWinrate: 58.765`, `arenaSmithRank: 4242`,
`winrate: 55.5555`, который гость видит как 55,6); тест падает, если любое
значение или имя платного ключа найдено в выводе, а мутация (проекция,
копирующая строку) проверяет, что сторож краснеет. Первая страница с
открытым слоем: `/tierlist/`.

### `/tierlist/`: весь пул карт (E21 OL3, #440)

Решение владельца 2026-11-18 расширило открытый слой `/tierlist/` с топ-10
до всего пула карт текущей Арены. Открыто: `cardId`, `name`, `classKey`,
`className`, `tier`, `cost`, `rarity`, `type`, картинка (в API), `winrate` и
`pickRate` (до 0,1), `updatedAt`, `source`, `sampleGamesAtLeast`. Платно:
`playedWinrate`, `inDecks`, `totalGames`, `offerRate`, `discardRate`,
`drawnWinrate`, `mulliganWinrate`, `keptRate`, `avgCopies`, поля ArenaSmith,
винрейт точнее 0,1, сортировки и фильтры по ним, история. Источники открытого
слоя: HSReplay и Firestone; HearthArena не открыт. Подробности и порядок
отказов: [Arena tier list](arena-tierlist.md#open-layer-for-guests-and-robots).

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
- **Свежесть `/legendaries/` и `/heroes/`** (#463). Обе страницы тоже входят
  в `DATA_PAGES`, прогрев и минутное правило edge-узла; прогрев ждёт блок
  данных (`legendary-group-card`, `bg-heroes-public__hero`), а не пустую
  копию сборки.

Тесты: `tests/classes-public-teaser.test.ts` (проекция, маршрут, JSON-LD) и
`tests/next-classes-teaser.test.mjs` (собранная страница: HTML, RSC-payload,
JSON-LD). Фикстура `tests/helpers/classesTeaserFixture.ts` даёт винрейтам с
лишними знаками, победам, долям и разбивкам уникальные значения; тест падает,
если любое из них найдено в выводе.

## Бюджет открытых JSON API

Открытые данные слоя (`/api/**/public`, `/teaser`, `/public-teaser`,
`/api/public/*`, `/api/fun-decks`) отдаются гостям без входа, поэтому на клиента
действует бюджет запросов: короткое и длинное окно, ключ IPv4 или IPv6 /64,
сверх бюджета 429 с `Retry-After`. Проверенные по обратному и прямому DNS
Googlebot, Google-InspectionTool, YandexBot и Bingbot лимита не имеют;
loopback (SSR, прогрев) не считается. Значения и режим `log|enforce` лежат в
`config/public-data-api-guard.json`. Подробности и откат:
`docs/runbooks/public-data-api-guard.md`.

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
