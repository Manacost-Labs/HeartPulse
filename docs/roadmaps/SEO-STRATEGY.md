<!-- markdownlint-disable MD013 MD060 -->

# SEO-стратегия Manacost Stats

Дата аудита: 20 июля 2026 года
Обновлено: 21 июля 2026 года
Горизонт: 12 недель для базовой программы, затем постоянный цикл
Область: `arena.hs-manacost.ru`, React 19 + Vite SPA, Express API и текущий prerender

## 1. Цель

Сделать публичную часть Manacost Stats технически индексируемой, понятной поисковым системам и полезной пользователю до выполнения JavaScript. Одновременно нельзя раскрывать закрытую статистику тарифа «Алмаз» в HTML, sitemap, JSON-LD или Open Graph.

План опирается на текущую архитектуру проекта, а не предполагает полный переход на другой фреймворк. Базовый путь — единый SEO-реестр, prerender статических страниц и серверные HTML-снимки динамических сущностей. User-agent dependent dynamic rendering не используется.

## 2. Приоритеты

- **P0** — блокирует корректную индексацию, создаёт дубли, утечку paywall-данных или массовые soft 404.
- **P1** — заметно влияет на органический трафик, E-E-A-T, внутренние ссылки и Core Web Vitals.
- **P2** — масштабирование контента, GEO/AI-видимость и дальнейшая оптимизация после стабилизации P0/P1.

## 3. Фактическая отправная точка

### Что уже есть

- Статические метатеги и JSON-LD в `index.html`.
- Реестр навигации в `src/routes.ts` и единый реестр материализованных SEO-страниц в `config/public-seo-pages.json` + `src/seo/registry.ts`.
- Клиентское обновление title, description, canonical, Open Graph и Twitter Card в `src/routes.ts`.
- Prerender верхнеуровневых страниц и генерация `sitemap.xml` из того же реестра в `scripts/prerender.js`.
- Статические `public/robots.txt` и `public/llms.txt`.
- Страницы FAQ, статей, Standard, Arena и Battlegrounds.
- Авторизация и paywall на уровне UI/API.
- Яндекс Метрика и собственный сбор аналитики.

### Основные разрывы

| Проблема | Фактическое место | Риск | Приоритет |
|---|---|---|---|
| У детальных героев и BG-сущностей нет гарантированного HTML с уникальными метаданными до JS | SPA shell и текущий prerender | Пустые/неполные сниппеты, слабая индексация | P0 |
| Sitemap пока содержит только 23 материализованные static/listing страницы | `config/public-seo-pages.json`, `scripts/prerender.js` | Качественные detail pages нельзя публиковать до появления валидированных snapshots | P0 |
| Versioned robots/noindex contract требует production rollout | Release v2 и deploy уже блокируют runtime drift, но активный legacy release ещё не переведён на managed contract | До разрешённого rollout production может продолжить старую index policy | P0 |
| Detail canonical и HTTP status героев/BG-сущностей ещё не строятся из entity snapshot | SPA shell, nginx | Дубли, soft 404 и общий metadata fallback у оставшихся сущностей | P0 |
| Schema Dataset использует дату сборки, а не дату данных | `scripts/prerender.js` | Недостоверный `dateModified` и freshness | P1 |
| Счётчики ItemList могут быть захардкожены | `scripts/prerender.js` | Schema расходится с видимым содержимым | P1 |
| Нет внутренних страниц авторов и редакционной политики | Публичные маршруты | Недостаточный E-E-A-T для аналитического продукта | P1 |
| Статьи в `server/data/articles.json` в основном ведут на внешний домен | `/articles` | Нельзя честно разметить локальную страницу как полную Article | P1 |
| `llms.txt` описывает в основном Arena | `public/llms.txt` | Standard/BG/FAQ и методология плохо представлены AI-поиску | P2 |

### Реализовано после аудита

- `SEO-101/102`: title и description 24 materialized pages перенесены в единый data-only реестр; `src/route-meta.ts` и неиспользуемый `PAGE_META` удалены.
- `SEO-106` для static/listing слоя: CI проверяет все 24 HTML-документа, один H1, robots, canonical, OG/Twitter metadata, JSON-LD parse и отсутствие закрытых bootstrap-полей.
- `SEO-202` для hero detail: `/heroes/:dbfId` разрешается по публичному каталогу и получает authoritative SSR 200/404/503, русские metadata/schema и whitelist без subscriber statistics; nginx сохраняет upstream status/headers, а CI проверяет identity-invariant HTML и отсутствие private sentinels.
- `SEO-202` для базовой BG-библиотеки: detail pages существ и заклинаний разрешаются по точному DBF через полностью проверенную пару active/archive каталогов, нормализуют неправильный slug одним `301`, получают authoritative SSR 200/404/503 и не раскрывают impact, winrate, popularity, games или paywall payload. Валидированная публичная проекция кешируется в памяти на пять минут с per-kind singleflight; неуспешное обновление не превращается в ложный `404` и не кешируется.
- `SEO-201`: `/standard/cards/:format/:cardId` получает SSR из авторитетного каталога, self-canonical, уникальные русские метаданные и публичную card schema; неизвестная карта возвращает `404`, недоступный каталог — `503`, а закрытая статистика и колоды не входят в HTML.
- Серверный resolver `/r/:slug` заменил клиентскую soft-redirect оболочку: активная ссылка сразу отвечает `302`, отсутствующая или приостановленная — `404`; обе ветки имеют `noindex, nofollow` и `no-store`.
- `/api`, `/health` и `/metrics` получают `X-Robots-Tag: noindex, nofollow` на любом upstream status без изменения тела или cache policy; syntactically valid route без materialized HTML получает fail-closed SPA shell с `noindex, follow`, а не индексируемый home canonical.
- `SEO-105`: robots policy закрывает crawl только для machine-only `/api`, `/health`, `/metrics` и `/_internal`; admin/auth HTML намеренно остаётся crawlable, чтобы бот увидел обязательный server-side `noindex`. CSS, JS, fonts и публичные изображения разрешены, а отдельный CI-контракт проверяет эту границу.
- `SEO-104`: versioned nginx map объединяет scheme/host/slash normalization в один `301` для всех 33 route templates, сохраняет query и не добавляет slash API, assets, unknown или removed URL. CI поднимает временный nginx и проверяет canonical, `www` и legacy hosts; production DNS/TLS alias проверяется отдельно при rollout.
- Release manifest v2 пакует полный versioned nginx contract, хранит install path/роль origin или edge, SHA-256 каждого файла и общий hash. Read-only verifier и deploy preflight проверяют artifact/runtime drift до любых мутаций; переход bootstrap/legacy/изменённого hash требует явного подтверждения N/N-1 compatibility и не может обойти drift.
- Sitemap генерируется при prerender и содержит ровно 23 index/self-canonical URL. `/standard/matchups`, `/gallery`, `/library/archive/minions` и `/library/archive/spells` больше не теряются.
- Недостоверные ручные `lastmod`, `changefreq` и `priority` удалены. Реальный `lastmod` появится только вместе с publication metadata сущностей.
- Detail-карты намеренно не добавлены в materialized SEO-реестр или sitemap до отдельного `SEO-203`; SSR resolver, authoritative 404/503 и тесты на утечку уже готовы.

### Ближайший порядок P0 SEO

1. Закрыть `SEO-103–105`: server-side `noindex` для admin/auth, реальные 404/410, единый slash/redirect contract и robots policy.
2. Реализовать `SEO-202`: SSR и валидные entity snapshots для героев и BG detail pages с fail-closed 404/503.
3. После crawl-проверки каждого detail URL выполнить `SEO-203/204`: sitemap index по типам сущностей и настоящий `lastmod` из publication metadata.
4. Закрыть `SEO-301/302`: публичный teaser paywall и автоматический тест, доказывающий отсутствие закрытых чисел, deck codes и subscriber payload в HTML/JSON-LD.
5. Подключить `SEO-501` и исправлять CWV только по field p75: LCP, INP и CLS отдельно для route template, mobile/desktop и release.
6. Запустить `SEO-601/602`: Search Console + Яндекс baseline, ежедневный SEO synthetic и алерт на status/canonical/sitemap/schema regression.

Каждый пункт выходит отдельным вертикальным срезом: реализация, HTML-contract tests, crawl без JavaScript, production HTTP smoke и измеримый rollback. Массовое добавление detail URL в sitemap запрещено до прохождения этих ворот.

## 4. Целевая SEO-архитектура

### 4.1. Один источник правды

Создать типизированный SEO-реестр, например `src/seo/registry.ts`, который содержит:

- паттерн маршрута и функцию построения canonical;
- режим индексирования;
- шаблоны title/description;
- тип страницы и builder JSON-LD;
- источник `dateModified`;
- правила Open Graph;
- требования к публичному teaser для paywall;
- принадлежность к sitemap.

Из него должны строиться:

1. клиентские метатеги;
2. prerender/server HTML;
3. sitemap;
4. SEO-контрактные тесты.

`src/routes.ts` остаётся источником навигации и entitlements, но не дублирует SEO-тексты. Неизвестный маршрут должен получать настоящий HTTP 404, а не успешный SPA shell с поздним клиентским `noindex`.

### 4.2. HTML-стратегия

- Верхнеуровневые страницы остаются prerendered.
- Детальные карты, BG-сущности, герои и будущие статьи получают HTML-снимок на этапе публикации данных или SSR из проверенного snapshot.
- HTML и контент после гидратации должны быть эквивалентны.
- Закрытые числовые данные не попадают в исходный HTML для посетителя без доступа.
- Нельзя отдавать поисковому роботу иной полный контент только по user-agent.

Это соответствует подходу Google к JavaScript SEO: prerender/SSR, корректные HTTP-коды и одинаковое содержимое для пользователя и робота.

## 5. Матрица индексируемости

| Маршрут/тип | Решение | Canonical и sitemap | Условие качества |
|---|---|---|---|
| `/` | Index | Сам на себя | Уникальное описание продукта и актуальные ссылки на режимы |
| `/faq` | Index | Сам на себя | FAQ видим в HTML; schema отражает только видимые ответы |
| `/articles` | Index | Сам на себя | CollectionPage/ItemList, реальные ссылки и даты |
| Будущий `/articles/:slug` | Index только после появления полного локального материала | Отдельный URL и article sitemap | Уникальный текст, автор, дата, редактор, изображение |
| `/standard/cards` | Index | Сам на себя | Публичная библиотека без раскрытия закрытой статистики |
| `/standard/cards/:format/:cardId` | Index при полном профиле карты | Отдельный canonical, card sitemap | Русское название, изображение, характеристики, дополнение, связи |
| `/standard/meta`, `/standard/matchups`, `/standard/vicious-gold` | Index только при содержательном публичном teaser | Сам на себя | Не тонкий экран «оформите подписку»; закрытые значения отсутствуют в HTML |
| `/classes`, `/tierlist`, `/legendaries` | Index при публичном описании методологии/teaser | Сам на себя | Текст объясняет сущность страницы даже без подписки |
| `/heroes`, `/library`, BG tier pages | Index | Отдельные detail canonical | Полные публичные справочные данные и актуальная дата |
| `/admin` и все вложенные admin states | Noindex, nofollow | Не включать | Серверный `X-Robots-Tag`, авторизация |
| Профиль, login callback, персональные URL | Noindex, nofollow | Не включать | Нет персональных данных в кэше/HTML |
| Поиск, сортировки и произвольные filter query | Noindex либо canonical на чистый листинг | Не включать | Фасеты не создают бесконечное crawl space |
| Пагинация | Index только если каждая страница полезна; иначе canonical policy по ADR | Согласованно | Нельзя canonical всех страниц на page 1 при отличающемся полезном наборе |
| Неизвестный/удалённый URL | HTTP 404/410 + noindex | Удалить | Пользовательская 404 без soft 404 |

По ADR принято единое правило: canonical с завершающим слешем, кроме `/`, и один redirect hop для варианта без слеша. Правило одновременно применяется в nginx, route inventory, prerender, клиенте и sitemap.

## 6. Structured data

| Страница | Рекомендуемая схема | Ключевые поля и ограничения |
|---|---|---|
| Сайт | `WebSite`, `Organization`, `SearchAction` | Один стабильный `@id`, официальный логотип, реальный URL поиска |
| FAQ | `FAQPage` | Только вопросы и ответы, видимые пользователю; rich result не является KPI |
| Раздел данных | `Dataset` + `CollectionPage` | Реальные `dateModified`, `temporalCoverage`, источник, методология, лицензия и формат |
| Листинг | `ItemList` | Реальные позиции и количество текущего публичного списка |
| Статья | `Article`/`NewsArticle`, `Person`, `Organization` | Только для локального полного материала; автор, редактор, `datePublished`, `dateModified` |
| Профиль автора | `ProfilePage` + `Person` | Биография, компетенции, список материалов и внешние подтверждённые профили |
| Карта Hearthstone | `CreativeWork` или `Thing` | `name`, `alternateName`, `identifier`, `image`, `isPartOf`, `additionalProperty` |
| Навигация | `BreadcrumbList` | Тот же путь, что видит пользователь |
| Закрытый материал | `WebPage`/`Article` + `isAccessibleForFree: false` + `hasPart` | CSS selector указывает на фактически размеченную закрытую часть; данные не раскрываются |

У schema.org нет подходящего поддерживаемого типа `Card` для Hearthstone. Не использовать выдуманный `@type: Card` и не применять `Product`, если карта не продаётся. Игровые характеристики описывать через `PropertyValue` в `additionalProperty`.

FAQ-разметка остаётся семантической, но план не обещает FAQ rich results: Google ограничивает их в основном известными сайтами здравоохранения и государственных организаций.

## 7. Дорожная карта

### Фаза 0 — измерения и решения, неделя 1

| ID | P | Задача | Зависимости | Приёмка и проверка |
|---|---|---|---|---|
| SEO-001 | P0 | Зафиксировать production URL inventory из `src/routes.ts`, Express и prerender | Нет | Таблица содержит каждый статический и динамический шаблон, owner, index policy и HTTP-код |
| SEO-002 | P0 | Выгрузить baseline Search Console и Яндекс Вебмастера | Доступы владельца | Зафиксированы indexed/excluded, impressions, clicks, CTR, top queries, crawl и CWV отдельно mobile/desktop |
| SEO-003 | P0 | Принять ADR по canonical, slash, пагинации и paywall teaser | SEO-001 | Один документ решения, согласованный продуктом и backend/frontend |
| SEO-004 | P1 | Снять crawl с JS и без JS | SEO-001 | Отчёт по status/canonical/title/schema/internal links для всех шаблонов |

Контрольная точка: нет реализации до утверждения indexability matrix и перечня данных, которые считаются закрытыми.

### Фаза 1 — индексируемость и единый контракт, недели 2–3

| ID | P | Задача | Зависимости | Приёмка и проверка |
|---|---|---|---|---|
| SEO-101 | P0 | Вынести SEO-конфигурацию в единый типизированный реестр | SEO-003 | `src/routes.ts`, prerender и sitemap используют один источник; тест ловит отсутствующий маршрут |
| SEO-102 | P0 | Удалить/подчинить дубли `PAGE_META` после runtime-проверки | SEO-101 | В production bundle один владелец title/description/canonical |
| SEO-103 | P0 | Настроить реальные 404/410 и server-side noindex | SEO-003 | `curl` неизвестного URL получает 404; `/admin` и auth states имеют `X-Robots-Tag: noindex, nofollow` |
| SEO-104 | P0 | Нормализовать redirects/canonical/OG URL | SEO-003 | HTTP, www, slash и известные legacy URL дают один 301 hop; canonical совпадает с sitemap |
| SEO-105 | P0 | Пересобрать robots policy | SEO-103 | `/api/`, `/admin`, персональные states и технические URL не индексируются; важные CSS/JS не заблокированы |
| SEO-106 | P0 | Добавить HTML SEO-contract tests | SEO-101 | CI проверяет status, robots, canonical, уникальность title/description, OG и отсутствие закрытых чисел |

Контрольная точка: выборочный crawl не содержит canonical на неверный листинг, soft 404 и индексируемые admin URL.

Текущий статус фазы 1:

- `SEO-101` и `SEO-102` завершены для materialized static/listing страниц;
- static-часть `SEO-106` завершена и включена в общий CI;
- authoritative SSR и fail-closed поведение готовы для героев, существ и заклинаний; additional/archive BG entities остаются в `SEO-202`;
- `SEO-103–105` закрыты в versioned contract и защищены read-only deploy drift gate: real 404/410, admin/auth/technical headers, fail-closed SPA fallback, referral redirect, canonical host/slash и robots policy. Фаза остаётся открытой только до разрешённого production rollout и проверки DNS/TLS/HTTP matrix.

### Фаза 2 — динамические страницы и sitemap, недели 3–6

| ID | P | Задача | Зависимости | Приёмка и проверка |
|---|---|---|---|---|
| SEO-201 | P0 | Сделать HTML-снимки detail pages Standard-карт | SEO-101, валидированный card snapshot | До JS видны уникальные title, description, H1, картинка, card facts и canonical |
| SEO-202 | P0 | Аналогично покрыть `/heroes/:dbfId` и detail pages `/library/**` | SEO-101 | Герои и base minion/spell details проходят 200/301/404/503/meta/schema/privacy/cache tests; остаются additional/archive detail pages |
| SEO-203 | P0 | Генерировать sitemap index и сегменты | SEO-201, SEO-202 | Отдельные sitemap для static, standard cards, BG library, heroes и будущих articles; только 200 canonical URL |
| SEO-204 | P0 | Использовать реальный `lastmod` | Data publication metadata | `lastmod` меняется только при значимом изменении сущности/набора, а не при каждом deploy |
| SEO-205 | P1 | Добавить динамические OG-изображения | SEO-201 | 1200×630, русское имя, режим и бренд; fallback проверен; image URL отдаёт 200 и корректный MIME |
| SEO-206 | P1 | Устранить hard-coded ItemList counts | SEO-101 | Count/position строятся из публичного snapshot и совпадают с HTML |

Текущий статус фазы 2: `SEO-201` завершён для SSR detail pages Standard/Wild-карт. В `SEO-202` завершены hero и base minion/spell details; additional/archive BG details остаются в работе. Entity sitemap не публикуется до отдельного `SEO-203` и проверки всех URL на `200`/canonical/indexability.

Контрольная точка: sitemap validator не находит redirects, 4xx, noindex или non-canonical URL; выборка detail pages корректна без JavaScript.

### Фаза 3 — schema и безопасный paywall, недели 5–7

| ID | P | Задача | Зависимости | Приёмка и проверка |
|---|---|---|---|---|
| SEO-301 | P0 | Реализовать paywall structured data и публичный teaser contract | SEO-003, SEO-101 | Schema соответствует Google, selector существует, закрытая статистика отсутствует в HTML/JSON-LD |
| SEO-302 | P0 | Ввести snapshot-тест на утечку тарифа | SEO-301 | Анонимный HTML всех gated routes не содержит закрытые значения, deck codes или payload API |
| SEO-303 | P1 | Исправить `Dataset` | Publication metadata | Реальная дата, охват, источник, методология, creator, license/usage terms; validator без ошибок |
| SEO-304 | P1 | Добавить card entity schema | SEO-201 | Валидный `CreativeWork`/`Thing`, стабильный `@id`, русское и английское имя, ID и дополнение |
| SEO-305 | P1 | Добавить авторов и Article schema | Полные локальные статьи | Schema только на локальных article pages; внешние статьи остаются ItemList links |
| SEO-306 | P1 | Сверить FAQPage с видимым FAQ | Контент-владелец | Ни одного скрытого/устаревшего вопроса в schema; тест JSON-LD ↔ DOM |

Базовый Standard/Wild-срез `SEO-304` реализован вместе с `SEO-201`: SSR содержит только публичные `CreativeWork`, `BreadcrumbList` и `PropertyValue`. Расширение schema для других entity templates остаётся частью следующих срезов.

Контрольная точка: валидатор структурированных данных и ручная проверка URL Inspection не показывают критических ошибок; paywall не раскрыт.

### Фаза 4 — E-E-A-T и контентные кластеры, недели 6–10

| ID | P | Задача | Зависимости | Приёмка и проверка |
|---|---|---|---|---|
| SEO-401 | P1 | Создать страницы авторов и редакторов | Модель author/editor | Биография, Hearthstone-опыт, материалы, контакты/профили, Person schema |
| SEO-402 | P1 | Опубликовать методологию данных | Владельцы парсеров | Источники, ранги, период, размер выборки, early/stable, ограничения и обновление |
| SEO-403 | P1 | Добавить редакционную политику, исправления и контакты | Контент-команда | Политики доступны из footer и article pages; есть дата изменения |
| SEO-404 | P1 | Построить хабы Standard, Arena, Battlegrounds | SEO-201–305 | Каждый хаб связывает статистику, гайды, карточки, FAQ и методологию |
| SEO-405 | P1 | Добавить breadcrumbs/related entities | SEO-404 | Нет orphan indexable pages; 2–5 релевантных внутренних ссылок на detail page без спама |
| SEO-406 | P2 | Запустить редакционный календарь | SEO-404 | Для каждого кластера есть owner, intent, формат, дата пересмотра и критерий обновления |

Предлагаемая структура кластеров:

| Хаб | Основные страницы | Поддерживающий контент |
|---|---|---|
| Standard | Cards, Meta, Matchups, Vicious Gold | Патч-разборы, механики, колоды, methodology, glossary |
| Arena | Classes, Tier List, Legendaries | Гайды по драфту, объяснение рейтинга, изменения патчей |
| Battlegrounds | Heroes, Library, Tier List, Strategies | Пулы существ, механики, кривые таверны, patch history |

### Фаза 5 — Core Web Vitals и media SEO, недели 7–11

| ID | P | Задача | Зависимости | Приёмка и проверка |
|---|---|---|---|---|
| SEO-501 | P0 | Включить field RUM для LCP/INP/CLS | Consent/privacy review | p75 виден отдельно по mobile/desktop, route template, release и connection class |
| SEO-502 | P1 | Найти LCP-элемент каждого шаблона | SEO-501 | В отчёте route → LCP element → TTFB/load/render breakdown |
| SEO-503 | P1 | Оптимизировать hero/card/article images | SEO-502 | Размеры заданы, modern formats, responsive `srcset`, lazy ниже fold, LCP не lazy |
| SEO-504 | P1 | Снизить blocking JS/CSS на detail pages | Bundle report | Маршрут загружает только нужные чанки; тяжёлые admin/deckview модули не входят в публичный initial path |
| SEO-505 | P1 | Устранить layout shifts | SEO-501 | Зарезервированы изображения, шрифты, paywall и async widgets; CLS p75 соответствует цели |
| SEO-506 | P2 | Подготовить image sitemap при доказанной пользе | SEO-203 | Только indexable canonical images с лицензией/attribution policy |

Целевые Core Web Vitals по реальным пользователям, p75, отдельно для mobile и desktop:

- LCP ≤ 2,5 секунды;
- INP ≤ 200 миллисекунд;
- CLS ≤ 0,1.

Lab Lighthouse используется для диагностики, но не подменяет field p75.

### Фаза 6 — мониторинг, GEO и непрерывная работа, недели 10–12+

| ID | P | Задача | Зависимости | Приёмка и проверка |
|---|---|---|---|---|
| SEO-601 | P0 | Настроить dashboard Search Console + Яндекс Вебмастер | SEO-002 | Еженедельно видны coverage, sitemap, crawl, queries, CTR, CWV и ручные санкции |
| SEO-602 | P0 | Добавить SEO synthetic monitor | SEO-106 | Проверяет representative URLs, robots, status, canonical, sitemap lag и schema parse |
| SEO-603 | P1 | Настроить алерты на падение indexable count/traffic | SEO-601 | Порог учитывает сезонность; есть owner и runbook, а не только уведомление |
| SEO-604 | P2 | Обновить `llms.txt` и AI-readable summaries | SEO-402, SEO-404 | Покрыты Standard/Arena/BG/FAQ, источники, дата, методология и canonical URLs |
| SEO-605 | P2 | Добавить короткие фактологические summaries | SEO-402 | Ответы с датой/выборкой и ссылками на первичные страницы; без маркетинговых неподтверждённых claims |
| SEO-606 | P2 | Принять политику AI crawler access | Legal/product decision | Явное решение по каждому классу crawler, отражённое в robots и политике использования |

## 8. Тестовая стратегия

### Автоматические проверки в CI

- Построить приложение и prerender.
- Для каждого indexable route проверить HTTP 200, ровно один canonical и один H1.
- Для каждого noindex route проверить server header или исходный `<meta name="robots">`.
- Убедиться, что canonical и sitemap используют один slash/host/protocol.
- Разобрать все JSON-LD как JSON и проверить обязательные поля внутренними схемами.
- Проверить, что все sitemap URL возвращают 200, indexable и self-canonical.
- Проверить уникальность title/description внутри одного шаблона detail pages.
- Проверить анонимный HTML на отсутствие закрытых статистических полей.
- Сравнить SSR/prerender DOM summary с hydrated DOM.
- Проверить 404 для неизвестного маршрута и удалённой сущности.

### Representative route matrix

- `/`, `/faq`, `/articles`;
- `/standard/cards` и одна карта Standard;
- `/standard/meta`, `/standard/matchups`, `/standard/vicious-gold` без подписки и с «Алмазом»;
- `/classes`, `/tierlist`, `/legendaries`;
- `/heroes` и один герой;
- `/library`, одна BG-карта и archive page;
- `/battlegrounds/tier-list`, `/battlegrounds/strategies`;
- `/admin`, login/profile state;
- неизвестный URL и неизвестный entity ID.

### Ручные проверки перед контрольными релизами

- URL Inspection в Google и Яндекс Вебмастере.
- Rich Results/Schema validator без критических ошибок.
- Сниппет и social share preview для 10 URL разных типов.
- Crawl с отключённым JavaScript.
- Проверка paywall анонимно, с тарифом и истёкшим доступом.
- Lighthouse mobile/desktop плюс field RUM после накопления выборки.

## 9. KPI и SLO SEO

Baseline фиксируется на неделе 1. Абсолютные traffic targets утверждаются только после этого, чтобы не выдавать предположение за факт.

| KPI | Цель | Окно |
|---|---|---|
| Валидные canonical URL в sitemap | 100% | Каждый deploy |
| Sitemap URL с 200/index/self-canonical | ≥ 99,5%, 100% для P0-маршрутов | Ежедневно |
| Indexable URL с уникальными title/description | ≥ 99% | Каждый deploy |
| Soft 404 среди известных route templates | 0 | Ежедневно |
| Утечки закрытой статистики в public HTML/schema | 0 | Каждый deploy |
| CWV p75 mobile и desktop | LCP ≤ 2,5s; INP ≤ 200ms; CLS ≤ 0,1 | 28-дневное окно |
| Доля valid indexed от submitted | ≥ 90% после очистки intentional noindex | 90 дней |
| Рост non-brand impressions/clicks | Цель ставится от baseline по кластеру | 90/180 дней |
| Organic CTR | Не ниже baseline; отдельная цель по позиционным группам | 90 дней |
| Freshness lag sitemap после публикации | ≤ 30 минут | Постоянно |

## 10. Владельцы и процесс

Нужны назначенные роли, даже если несколько ролей выполняет один человек:

- SEO owner — index policy, Search Console/Яндекс, контентные кластеры;
- frontend owner — metadata hydration, CWV, internal links;
- backend/data owner — status codes, snapshots, freshness, sitemap feed;
- editorial owner — авторы, методология, даты и исправления;
- security/subscription owner — paywall contract и тесты на утечку;
- SRE owner — synthetic monitor, алерты и runbook.

Каждый новый публичный route не считается готовым без SEO-записи, index policy, canonical, metadata, schema decision, sitemap decision, 404 behavior и representative test.

## 11. Definition of Done программы

- Один SEO-реестр управляет клиентом, prerender/SSR, sitemap и тестами.
- Все indexable detail pages имеют полезный HTML до JS и self-canonical.
- Служебные/персональные страницы и ошибки получают server-side noindex и правильный HTTP-код.
- Paywall размечен корректно и не раскрывает данные.
- Sitemap сегментирован, генерируется из валидированных сущностей и использует реальные даты.
- Article/Card/FAQ/Dataset schema соответствует фактическому содержимому.
- Авторы, методология и политика исправлений опубликованы и связаны внутренними ссылками.
- CWV измеряется по p75 mobile/desktop и достигает целевых значений.
- Search Console, Яндекс Вебмастер и synthetic monitor имеют владельца и runbook.

## 12. Официальные опоры

- [Google: paywalled content structured data](https://developers.google.com/search/docs/appearance/structured-data/paywalled-content)
- [Google: Dataset structured data](https://developers.google.com/search/docs/appearance/structured-data/dataset)
- [Google: introduction to structured data](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)
- [Google: JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google: изменения FAQ/HowTo rich results](https://developers.google.com/search/blog/2023/08/howto-faq-changes)
- [web.dev: Web Vitals](https://web.dev/articles/vitals)
