# Перенос Arena на hearthpulse.net

## Финальный контракт

- `https://hearthpulse.net` — единственный публичный canonical приложения;
- `https://www.hearthpulse.net/**` — `301` на apex с сохранением пути и query;
- `https://cdn.hearthpulse.net` — публичный CDN с закрытым private API;
- `https://arena.hs-manacost.ru/**` — `301` на тот же путь `hearthpulse.net`;
- `https://cdn.arena.hs-manacost.ru/**` — `301` на тот же путь нового CDN.

Старый origin-host остаётся внутренним транспортным контрактом между edge и
основным сервером. Его нельзя заменять редиректом на origin: иначе новый
публичный домен попадёт в цикл. Redirect-only конфигурации устанавливаются
только на узлах с ролью `edge`.

Cookies нельзя перенести между разными registrable domains. После перехода
пользователь входит один раз заново; аккаунт, подписка и серверные сессии не
удаляются. Сессионные токены запрещено передавать через URL.

## DNS и регионы

Целевой набор зоны Cloudflare остаётся DNS-only с TTL 120:

- apex: `162.19.220.14`, `194.67.92.242`, `186.246.28.244`;
- `cdn`: тот же набор A;
- `www`: CNAME на apex;
- AAAA отсутствуют до отдельного IPv6 rollout.

Узлы: Limburg, Москва и Новосибирск. Москва (`194.67.92.242`) является
отдельной обязательной проверкой, а не побочным результатом общего DNS-smoke.

С 25 сентября 2026 года Новосибирск временно исключён из A-записей apex и CDN:
у edge повторялись тайм-ауты TLS-handshake к upstream на статике и страницах.
После повторных `no live upstreams` на московском edge Москва также временно
исключалась. После восстановления обратных туннелей и проверки параллельной
загрузки страниц, CSS, JS и изображений Москва возвращена в A-записи apex и
CDN 25 сентября 2026 года. Рабочий набор сейчас — Limburg (`162.19.220.14`)
и Москва (`194.67.92.242`); `www` наследует его через CNAME. Новосибирск
остаётся в карантине до отдельной проверки.
Снимок записей до изменения находится в root-only файле
`/var/backups/hs-arena/hearthpulse-dns-before-novosibirsk-withdrawal-20260925-1209.json`.
Снимок перед выводом Москвы находится в
`/var/backups/hs-arena/hearthpulse-dns-before-moscow-withdrawal-20260925-1230.json`.
Обычный трёхузловой DNS-контракт сохраняется в мониторе по умолчанию. На время
карантина задайте `HEARTHPULSE_MONITOR_QUARANTINED_REGIONS=novosibirsk`
в `/etc/hs-arena/hearthpulse-shadow-monitor.env` (root-only): монитор требует
точный DNS-набор и проверяет оставшийся edge. Старый одиночный флаг
`HEARTHPULSE_MONITOR_QUARANTINED_REGION` поддерживается при поэтапном возврате.
Вернуть каждый IP можно после устранения тайм-аутов и браузерной проверки
параллельной загрузки CSS, JS и изображений через закреплённый IP; затем
обновить флаг карантина и проверить соответствующий DNS-контракт.
Монитор дополнительно загружает главную, статьи, каталог карт, favicon и
изображение карты параллельно на каждом активном edge: одиночные HEAD-запросы
не обнаруживали зависание обратных SSH-туннелей под браузерной нагрузкой.

Если Москва отвечает 502/504, проверьте `koloda-ru-proxy-tunnel@18443..18445`
на origin и владельцев портов на московском узле. После сетевого обрыва
неотвечающие SSH-сеансы могут удерживать порты, мешая systemd поднять новые
туннели. На Москве установите
`deploy/ssh/99-zz-hearthpulse-moscow-tunnel.conf` в
`/etc/ssh/sshd_config.d/`, проверьте `sshd -t` и эффективные параметры через
`sshd -T -C user=root,addr=151.80.21.140,host=localhost`, затем выполните
`systemctl reload ssh`. Правило отправляет проверки живости только сеансам
origin и освобождает порт примерно за 90 секунд после потери ответа. До
возврата Москвы в DNS проверьте одновременно страницы, CSS, JS и изображения
через `curl --resolve` и браузер с закреплённым московским IP.

## Порядок переключения

1. Запустить `npm run verify:release`, security-проверки и браузерную матрицу.
2. Установить в root-only runtime environment `APP_URL=https://hearthpulse.net`.
3. Развернуть immutable release с новым canonical, sitemap, robots, JSON-LD,
   OAuth callback и `cdn.hearthpulse.net`.
4. На каждом edge установить проверенные release-контрактом файлы:
   `hearthpulse-shadow-app.conf`, `hearthpulse-shadow-cdn.conf`,
   `arena-legacy-app-redirect.conf`, `arena-legacy-cdn-redirect.conf`.
   Историческое `shadow` в имени двух файлов сохраняется на время миграции,
   чтобы обновить существующие symlink без параллельных `server_name`.
   По состоянию на 2026-09-25 на активном Limburg edge файл отличается от
   release-контракта: выделенный `/identity/`-маршрут в репозитории требует
   локальных туннелей `18443–18445`, которых на узле нет. При обновлении
   сжатия `/_next/` сохранять работающие identity-маршруты и переносить только
   проверенный блок ассетов. Полную синхронизацию делать после восстановления
   туннелей и отдельной проверки входа; не включать DNS-карантинные edge заранее.
5. На каждом узле выполнить `nginx -t`; reload разрешён только после успеха.
   Для активного edge дополнительно проверить большой `/_next/static/` JS-файл
   с `Accept-Encoding: gzip`: ответ должен иметь `Content-Encoding: gzip` и
   `Vary: Accept-Encoding`. Узлы в DNS-карантине проверять до возврата в DNS.
6. Запустить `deploy/monitor-hearthpulse-shadow.sh` и браузерные проверки.
7. Добавить новый sitemap в поисковые панели; старый домен оставить с `301`
   минимум на год и продолжать продлевать его сертификат.

Certbot deploy hook использует versioned
`deploy/deploy-hearthpulse-cert.sh`: после renewal он синхронизирует сертификат
на все три edge, проверяет `nginx -t` и только затем выполняет reload.

Telegram OIDC должен разрешать callback
`https://hearthpulse.net/api/auth/telegram/callback`. Проверка считается
полной, когда `/api/auth/telegram/config` возвращает новый URL, старт входа
ставит host-only Secure cookie на HearthPulse, а callback не возвращает ошибку
redirect URI.

Для входа через внешние сервисы зарегистрируйте ровно следующие redirect URI:

- Google: `https://hearthpulse.net/api/auth/google/callback`
- Discord: `https://hearthpulse.net/api/auth/discord/callback`
- Яндекс ID: `https://hearthpulse.net/api/auth/yandex/callback`

В Google также разрешите JavaScript origin `https://hearthpulse.net`. В Яндекс
ID поле Suggest Hostname оставьте пустым. Не добавляйте ключи в репозиторий:
сервер показывает кнопку конкретного провайдера только после задания пары
переменных окружения `*_OAUTH_CLIENT_ID` и `*_OAUTH_CLIENT_SECRET`.

## Проверка

```bash
npm run test:hearthpulse-shadow
npm run test:hearthpulse-monitor
sudo /bin/bash /var/www/koloda/data/www/hs-arena.ru/current/deploy/monitor-hearthpulse-shadow.sh
```

Дополнительно в desktop и mobile браузере проверить главную, каталог, detail,
login/logout, отсутствие console errors, failed network requests и старых
resource URL. `robots.txt`, sitemap, canonical, OpenGraph и JSON-LD должны
указывать только на `hearthpulse.net`.

## Откат

1. Восстановить резервные копии четырёх edge-vhost и выполнить `nginx -t`.
2. Вернуть `APP_URL=https://arena.hs-manacost.ru` и предыдущий immutable release.
3. Вернуть `X-Robots-Tag: noindex, nofollow` и короткий HSTS на HearthPulse.
4. Проверить старое приложение и CDN на каждом российском edge.

DNS нового домена при обычном rollback не удаляется: это предотвращает NXDOMAIN
для уже открытых ссылок. Удаление DNS — отдельная аварийная мера после TTL 120
плюс не менее 60 секунд запаса.
