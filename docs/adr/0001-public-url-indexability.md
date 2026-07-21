<!-- markdownlint-disable MD013 MD060 -->

# ADR-0001: публичные URL, canonical, indexability и paywall

- Статус: принято
- Дата: 21 июля 2026 года
- Область: `arena.hs-manacost.ru`

## Контекст

Маршруты навигации, prerender и sitemap сейчас описаны в разных файлах. Часть canonical использует завершающий слеш, часть — нет; динамические карточки наследуют canonical листинга; служебные и query-состояния получают robots policy только после выполнения JavaScript.

SEO-, mobile- и stability-дорожные карты требуют общего inventory до массовой правки маршрутов и CSS. Машиночитаемая матрица находится в `config/public-route-inventory.json` и становится обязательным контрактом для новых публичных маршрутов.

## Решение

1. Канонический origin — `https://arena.hs-manacost.ru` без `www`.
2. Canonical каждой HTML-страницы имеет завершающий слеш. Path templates в inventory хранятся без него как нормализованные ключи; политика `canonicalTrailingSlash: always` добавляет слеш при рендеринге URL.
3. Вариант без слеша должен получить один постоянный redirect на canonical. HTTP и `www` также сходятся за один redirect hop. Это совпадает с текущим `nginx`, prerender и sitemap и не требует рисковой миграции публичных URL.
4. Каждый полезный статический листинг и валидная detail page получает self-canonical и может входить в sitemap.
5. Admin, auth/profile callbacks, персональные состояния, referrals, фильтры, сортировки и поиск не входят в sitemap. Robots policy должен присутствовать в исходном HTTP-ответе, а не появляться только после JavaScript.
6. Неизвестная сущность получает HTTP 404. Удалённые `/decks/**` и `/jobs/**` получают 410. Referral URL получает redirect и не индексируется.
7. Пагинация временно получает `noindex, follow` и canonical чистого листинга. Отдельная индексируемая pagination policy потребует нового ADR и полезного server-rendered содержимого страницы.
8. Gated analytics могут индексироваться только с содержательным публичным teaser. Исходный HTML, JSON-LD, Open Graph и client bootstrap не содержат закрытые статистические значения или subscriber/admin payload. Код сборки, уже показанной как публичная рекомендация, может оставаться публичным; персональные и закрытые сборки в bootstrap не попадают.
9. Один и тот же HTML-контракт применяется к людям и поисковым роботам; user-agent dependent rendering запрещён.

## Route inventory contract

Каждая запись обязана иметь:

- стабильный `id` и path template;
- owner и criticality;
- index/canonical/sitemap policy;
- ожидаемый HTTP status;
- HTML strategy;
- entitlement и mobile fixture.

CI сверяет registry навигации и prerender с inventory. Следующие срезы подключат тот же inventory к metadata, sitemap, server redirects/noindex и synthetic checks.

## Последствия

- Текущий sitemap уже следует выбранной slash-политике; следующий срез переведёт его на генерацию из inventory и дат из датасетов.
- Динамические Standard/Battlegrounds detail pages нельзя добавлять в sitemap до появления проверенного HTML snapshot и корректного 404.
- Любой новый route без owner, index policy, mobile fixture и criticality ломает CI.
- Решение не меняет entitlement: оно определяет только публичный teaser и поисковое поведение.

## Проверка

- `npm run test:route-inventory`;
- `npm run test:routes`;
- markdownlint для `docs/**/*.md`.
