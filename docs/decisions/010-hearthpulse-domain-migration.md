# ADR-010: Поэтапный перенос Arena на hearthpulse.net

## Статус

Принято. Теневая волна пройдена; одобрен полный переход на новый canonical.

## Дата

20 августа 2026 года.

## Контекст

Публичный адрес Arena меняется с `arena.hs-manacost.ru` на
`hearthpulse.net`. Сервис уже использует три региональных edge-узла, отдельный
публичный CDN-host, авторизацию, подписки и большой набор индексируемых URL.
Одновременная смена DNS, TLS, canonical, OAuth и поисковых сигналов создала бы
слишком широкий и плохо диагностируемый отказ.

## Решение

Использовать strangler-переход в две ступени.

1. `hearthpulse.net`, `www.hearthpulse.net` и `cdn.hearthpulse.net` сначала
   работают параллельно старым адресам на тех же трёх edge-узлах. Shadow-host
   передаёт запросы проверенному origin как `arena.hs-manacost.ru` и добавляет
   `X-Robots-Tag: noindex, nofollow`.
2. После регионального smoke-теста отдельный релиз меняет canonical origin,
   runtime CDN origin, OAuth callback и sitemap. Только затем старый домен
   получает постоянные постраничные редиректы с сохранением query string.

DNS первого этапа остаётся DNS-only и содержит все три edge IPv4. Это сохраняет
прямой путь к российским узлам; бесплатный Cloudflare-план не используется как
HTTP reverse proxy или как недокументированный health-aware балансировщик.

## Последствия

- Старый production остаётся рабочим и не зависит от готовности нового домена.
- Теневой домен можно удалить из DNS и отключить на edge без изменения данных.
- На первом этапе canonical и вход остаются привязаны к старому origin; это
  ожидаемое ограничение shadow-проверки, а не финальное состояние.
- До второго этапа автоматический монитор обязан проверять TLS, `noindex`,
  доступность приложения и закрытость private API на CDN для каждого edge.
- После второго этапа тот же монитор проверяет indexable canonical, `www` и
  legacy-redirect, CDN privacy boundary и каждый регион, включая Москву.
- Cookies между `hs-manacost.ru` и `hearthpulse.net` не переносятся; безопасный
  результат — разовый повторный вход без передачи токена в URL.

## Источники

- Cloudflare: [DNS-only Load Balancing](https://developers.cloudflare.com/load-balancing/understand-basics/proxy-modes/#dns-only-load-balancing)
- Google Search Central: [Site moves with URL changes](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)
