<!-- markdownlint-disable MD013 -->

# Подключение Timeweb CDN для изображений карт

## Область действия

CDN обслуживает только публичные изображения `/api/card-image/**`. HTML, JSON API, авторизация, подписка и административные ответы остаются на `arena.hs-manacost.ru`.

Production-маршрут использует local-first зеркало и два резервных уровня:

1. `cdn.arena.hs-manacost.ru` через GeoDNS выбирает европейский, московский или новосибирский edge.
2. Региональный edge сначала читает синхронизированную карту из `/srv/arena/card-images/current`.
3. Только локальный промах запрашивается через технический домен Timeweb CDN `xa3umh5n3j.cdn.twcstorage.ru`.
4. Timeweb CDN получает отсутствующий объект с origin `arena.hs-manacost.ru`.

Если Timeweb отвечает `404`, `500`, `502`, `503` или `504`, региональный edge без участия браузера повторяет запрос через `arena.hs-manacost.ru` и сохраняет успешный ответ в тот же локальный кэш. Клиентский `onError`-fallback остаётся последним уровнем защиты.

Такая схема сохраняет управляемый региональный маршрут для РФ и Европы, не зависит от применения пользовательского сертификата на стороне Timeweb и не пропускает через CDN приватные API.

## Предварительные проверки

1. `cdn.arena.hs-manacost.ru` должен разрешаться через делегированный GeoDNS в региональные edge-узлы.
2. Сертификат должен быть валиден именно для `cdn.arena.hs-manacost.ru` на каждом edge.
3. Известная синхронизированная карта должна возвращать `200`, `X-Proxy-Cache: LOCAL` и `X-CDN-Upstream: local-mirror` на каждом edge.
4. Технический домен Timeweb CDN должен возвращать изображение с кодом `200` для локального промаха.
5. Удалённый fallback должен содержать `X-CDN-Upstream: timeweb` или `origin-fallback` и корректный `X-CDN-Region`.
6. Любой путь вне `/api/card-image/**` на CDN-домене должен возвращать `404`.
7. Страница каталога и lightbox должны успешно повторять запрос с origin после искусственного отказа CDN.

Сертификат выпускается DNS-01 challenge через `_acme-challenge.cdn.arena.hs-manacost.ru`. Certbot использует root-only hooks `/usr/local/sbin/cdn-arena-acme-auth` и `/usr/local/sbin/cdn-arena-acme-cleanup`; deploy hook `/etc/letsencrypt/renewal-hooks/deploy/deploy-cdn-arena-cert.sh` синхронизирует обновлённый сертификат на все три edge-узла и перезагружает Nginx только после успешного `nginx -t`.

## Публикация локального зеркала

Origin запускает `arena-card-image-sync.timer`. Скрипт `deploy/arena-card-image-sync.sh` копирует текущую версию и вызывает на edge `deploy/activate-arena-card-images.sh`.

Проверка `current` считается успешной только когда активна нужная версия, количество raw- и served-файлов совпадает и после manifest не появлялись новые raw-файлы. Новая публикация строится в отдельном generation-каталоге и атомарно переключает `current`; поэтому частично обновлённый каталог не становится активным.

Диагностика и безопасное восстановление:

```bash
sudo systemctl start arena-card-image-sync.service
sudo systemctl status arena-card-image-sync.service --no-pager
curl -I 'https://cdn.arena.hs-manacost.ru/api/card-image/JAIL_430/thumb.webp?v=health'
```

Ожидаются `200`, `X-Proxy-Cache: LOCAL` и региональный `X-CDN-Region`. Если файл уже находится в raw, но отсутствует в active generation, повторный запуск сервиса обязан перепубликовать зеркало, а не сообщить `already current`.

## Runtime-переключатель

Релиз содержит безопасную конфигурацию по умолчанию в `public/runtime-config.js`. Production использует root-managed файл `/var/www/koloda/data/www/hs-arena.ru/runtime/client-config.js`, который подключается к каждому новому релизу символической ссылкой.

Выключенное состояние:

```js
window.__ARENA_RUNTIME_CONFIG__ = {
  cardImageCdn: {
    enabled: false,
    origin: 'https://cdn.arena.hs-manacost.ru',
  },
};
```

После прохождения DNS, TLS, cache-hit и браузерной проверки значение `enabled` можно заменить на `true` без пересборки приложения. `/runtime-config.js` принудительно обходит региональный кэш и отдаётся с `no-store`, поэтому переключение применяется без очистки immutable-ассетов.

## Откат

Вернуть `enabled: false`. Новые URL изображений снова станут same-origin. Уже открытые изображения CDN при ошибке автоматически повторяются через `arena.hs-manacost.ru`, поэтому откат не требует изменения данных или очистки базы.

## Секреты

API-токены Timeweb и Cloudflare не передаются клиенту, не записываются в runtime-конфигурацию и не хранятся в Git. Для автоматизации используется только отдельный серверный secret-файл с правами `0600`.
