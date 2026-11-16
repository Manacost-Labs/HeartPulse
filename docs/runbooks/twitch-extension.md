# Twitch-расширение: настройка сайта

Контракт API — `docs/specs/twitch-extension.md`. Без переменных ниже функция
выключена: `GET /api/v1/twitch/status` отвечает `configured: false`,
остальные маршруты — `503 twitch_not_configured`, блок в кабинете скрыт. Сайт
не падает.

## Переменные окружения

Только env сервера, например `/etc/hs-arena/hs-arena.env`:

- `TWITCH_EXTENSION_CLIENT_ID` — dev.twitch.tv/console → Extensions →
  расширение → Client ID.
- `TWITCH_EXTENSION_SECRET` — там же, Extension Settings → Extension Secrets;
  строка base64 как есть.
- `TWITCH_EXTENSION_OWNER_ID` — числовой Twitch user id владельца расширения.
- `TWITCH_OAUTH_CLIENT_SECRET` — Client Secret того же Client ID (для OAuth
  привязки).
- `TWITCH_OAUTH_REDIRECT_URI` —
  `https://hearthpulse.net/api/account/twitch/callback`; тот же адрес — в
  OAuth Redirect URLs расширения.

Нет или неверна любая — `configured: false`. Секреты не попадают в логи:
ошибки Twitch логируются как
`[twitch-extension] <операция> failed: Twitch <операция> failed with <статус>`.

## Консоль Twitch

- Allowlist URL Fetching: `https://hearthpulse.net`; Image:
  `https://art.hearthstonejson.com`.
- OAuth Redirect URL: значение `TWITCH_OAUTH_REDIRECT_URI`.

## Проверка после деплоя

1. `GET /api/v1/twitch/ext/snapshot` без токена → `401` (не `404`: код
   выложен; не `503`: переменные заданы).
2. `GET /api/v1/twitch/status` с токеном приложения → `configured: true`.
3. `linkUrl` из ответа (`https://hearthpulse.net/?login#account-twitch`)
   открывается в браузере (не `404`). Адреса `/account/twitch` у сайта нет
   (`docs/specs/twitch-extension.md`).
4. Кабинет → «Персональные данные» → «Twitch-расширение» → «Привязать
   Twitch» → Twitch спрашивает аккаунт → возврат на
   `/?login&twitch=linked#account-twitch`.
5. Приложение с включённым расширением: в журнале сервера нет
   `[twitch-extension] pubsub failed`, Local Test расширения показывает
   колоду.

## Ограничения

- Снимки каналов, лимит 1/с, очередь отправок, поколения привязок и
  ожидающие привязки хранятся в памяти одного
  процесса Express. Запускать второй экземпляр сервера нельзя, пока они не
  вынесены в общее хранилище.
- На живом Twitch не проверено (нужны переменные из консоли): приём пустого
  `scope` и `force_verify`, external-JWT и PubSub в Helix, origin расширения.
  Проверка выше — первая такая проверка.
- Очистка у зрителей при отвязке, переносе, блокировке и удалении аккаунта —
  одно сообщение `mode: none` без гарантии доставки. До включения проверить
  на живом Twitch: после «Отвязать» колода исчезает у открытого зрителя, а
  фронт расширения сам убирает колоду, если сообщения давно нет. В журнале
  отказ виден как `[twitch-extension] pubsub-clear failed`.

## Откат

Убрать любую переменную и перезапустить сервис: маршруты ответят
`503 twitch_not_configured`, данные привязок (`twitch_links`) сохранятся.
