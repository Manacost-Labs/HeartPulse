# Twitch-расширение: настройка сайта

Контракт API — `docs/specs/twitch-extension.md`. Без переменных ниже функция выключена: `GET /api/v1/twitch/status`
отвечает `configured: false`, остальные маршруты — `503 twitch_not_configured`, блок в кабинете скрыт. Сайт не падает.

## Переменные окружения (только env сервера, например `/etc/hs-arena/hs-arena.env`)

| Переменная | Где взять |
| --- | --- |
| `TWITCH_EXTENSION_CLIENT_ID` | dev.twitch.tv/console → Extensions → расширение → Client ID |
| `TWITCH_EXTENSION_SECRET` | там же, Extension Settings → Extension Secrets; строка base64 как есть |
| `TWITCH_EXTENSION_OWNER_ID` | числовой Twitch user id владельца расширения |
| `TWITCH_OAUTH_CLIENT_SECRET` | Client Secret того же Client ID (для OAuth привязки) |
| `TWITCH_OAUTH_REDIRECT_URI` | `https://hearthpulse.net/api/account/twitch/callback`; тот же адрес — в OAuth Redirect URLs расширения |

Нет или неверна любая — `configured: false`. Секреты не попадают в логи: ошибки Twitch логируются как
`[twitch-extension] <операция> failed: Twitch <операция> failed with <статус>`.

## Консоль Twitch

- Allowlist URL Fetching: `https://hearthpulse.net`; Image: `https://art.hearthstonejson.com`.
- OAuth Redirect URL: значение `TWITCH_OAUTH_REDIRECT_URI`.

## Проверка после деплоя

1. `GET /api/v1/twitch/status` с токеном приложения → `configured: true`.
2. Кабинет → «Персональные данные» → «Twitch-расширение» → «Привязать Twitch» → после входа `?twitch=linked`.
3. Приложение с включённым расширением: в журнале сервера нет `[twitch-extension] pubsub failed`, Local Test
   расширения показывает колоду.

## Откат

Убрать любую переменную и перезапустить сервис: маршруты ответят `503 twitch_not_configured`, данные привязок
(`twitch_links`) сохранятся.
