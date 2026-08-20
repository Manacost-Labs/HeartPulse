# Перенос Arena на hearthpulse.net

## Текущий этап: shadow

Новые имена доступны параллельно production, но не являются canonical:

- `hearthpulse.net` и `www.hearthpulse.net` — приложение через старый origin;
- `cdn.hearthpulse.net` — только публичные изображения и versioned assets;
- `arena.hs-manacost.ru` и `cdn.arena.hs-manacost.ru` продолжают работать без
  редиректов и изменений DNS.

Shadow application всегда возвращает `X-Robots-Tag: noindex, nofollow`.
Короткий HSTS (`max-age=300`) не фиксирует незавершённую схему надолго.

## DNS

В зоне Cloudflare `hearthpulse.net` используются DNS-only записи с TTL 120:

- apex: A на `162.19.220.14`, `194.67.92.242`, `186.246.28.244`;
- `cdn`: тот же набор A;
- `www`: CNAME на apex.

Не включать orange-cloud proxy до отдельной проверки доступности из РФ. Free
DNS round-robin не заменяет health-aware балансировщик: доступность каждого
узла контролирует `deploy/monitor-hearthpulse-shadow.sh`.

## Установка edge-конфигурации

На каждом edge:

1. Установить общий публичный сертификат в
   `/etc/nginx/ssl/hearthpulse.net/{fullchain.pem,privkey.pem}` с root-only
   правами на ключ.
2. Установить `deploy/nginx/hearthpulse-shadow-app.conf` и
   `deploy/nginx/hearthpulse-shadow-cdn.conf` в `/etc/nginx/sites-available/`.
3. Включить оба файла через `sites-enabled`, выполнить `nginx -t` и только
   затем reload. Файлы брать только из immutable release-каталога, сверять их
   с `release.json` через `scripts/verify-nginx-contract.mjs --role=edge`, а
   после включения подтверждать symlink и фактический ответ каждого edge
   монитором.

На основном сервере установить versioned units
`deploy/systemd/hearthpulse-shadow-monitor.{service,timer}` в `/etc/systemd/system/`,
включить timer и убедиться, что журнал содержит успешную проверку каждые пять
минут. Эти записи журнала являются доказательством 24-часового shadow-периода.

## Проверка

```bash
npm run test:hearthpulse-shadow
sudo deploy/monitor-hearthpulse-shadow.sh
```

Дополнительно проверить в изолированном браузере:

- главную, каталог карт и одну detail-страницу;
- отсутствие console errors и failed network requests;
- `X-Robots-Tag: noindex, nofollow` на HTML;
- изображение через `cdn.hearthpulse.net`;
- отсутствие private API через CDN (`404`).

## Откат shadow-этапа

1. Удалить только записи apex, `www` и `cdn` из зоны `hearthpulse.net`.
2. Подождать не менее 180 секунд (TTL 120 плюс запас для рекурсивных DNS).
3. Отключить оба hearthpulse shadow vhost на edge и выполнить `nginx -t`.
4. Перезагрузить Nginx.

Старые домены, база, release и пользовательские файлы при таком откате не
изменяются.

## Условия второго этапа

Не менять canonical/301, пока одновременно не выполнены:

- монитор зелёный на всех трёх edge не менее 24 часов;
- проверены login/logout, OAuth callback и host-only cookies на новом домене;
- готовы sitemap, robots, structured data и Search Console;
- `job.hs-manacost.ru` больше не ссылается DNS-именем на Arena;
- документирован и проверен обратный переключатель на старый canonical.
