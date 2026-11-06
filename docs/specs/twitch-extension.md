# Twitch-расширение: API сайта (EBS)

Зритель стрима видит в расширении Hearthpulse оставшиеся карты колоды
стримера. Путь данных: приложение Hearthpulse → `POST /api/v1/twitch/state`
→ Twitch Extension PubSub (`broadcast`) → фронт расширения. Холодный старт
зрителя — `GET /api/v1/twitch/ext/snapshot`.

- Модуль: `server/modules/twitchExtension`.
- Регистрация: `server/app/registerTwitchExtension.ts`.
- Настройка и секреты: `docs/runbooks/twitch-extension.md`.

## Скрытая информация

Сайт пересылает только поля контракта ниже: состояние пересобирается поле за
полем, лишние поля тела (рука, порядок колоды, соперник) отбрасываются и в
PubSub не попадают. Порядок `cards` — порядок списка колоды в трекере, не в
игре.

## Привязка Twitch

- `GET /account/twitch` — адрес `linkUrl` для приложения, `302` на
  `/profile/#account-twitch` (блок «Twitch-расширение» на вкладке
  «Персональные данные»).
- `GET /api/account/twitch` (сессия сайта) →
  `{configured, linked, login, displayName, linkedAt, chatCommands}`; без
  входа `401`.
- `GET /api/account/twitch/connect` (сессия) — OAuth authorization code flow
  без scope. `state` — 24 случайных байта: он уходит в Twitch и в cookie
  `hp_twitch_oauth` (HttpOnly, SameSite=Lax, Secure, Path
  `/api/account/twitch`, 10 мин), а сервер помнит в памяти, какой аккаунт его
  начал и до когда (не больше 10 000 ожидающих). После перезапуска ожидающие
  привязки теряются — стример нажимает «Привязать» ещё раз.
- `GET /api/account/twitch/callback` — сверяет `state` из запроса с cookie
  (timing-safe), берёт запись с сервера один раз (повтор — ошибка), проверяет
  срок и что сессия — тот же аккаунт; обменивает `code`, читает `helix/users`
  (id, login, display_name) и сразу отзывает токен Twitch: сайт токенов Twitch
  не хранит. Итог — `302` на
  `/profile/?twitch=linked|cancelled|error|not_configured#account-twitch`.
- Один Twitch на аккаунт и один аккаунт на Twitch: повторная привязка того же
  Twitch к другому аккаунту переносит её (OAuth доказал владение). Таблица
  `twitch_links`, удаляется вместе с аккаунтом.
- `DELETE /api/account/twitch` (сессия + `X-CSRF-Request`) →
  `{linked:false}`; снимок канала забывается.
- `PUT /api/account/twitch/chat-commands` `{enabled:boolean}` (сессия +
  `X-CSRF-Request`) → `{chatCommands}`; без привязки `404`. Колонка
  `twitch_links.chat_commands`, по умолчанию `0`; перенос Twitch на другой
  аккаунт её сбрасывает. Чат-команды: [спецификация](chat-commands.md).
- Экспорт данных аккаунта (`GET /api/account/tracker-data/export`) несёт
  `twitch: [{ twitchUserId, login, displayName, linkedAt, chatCommands }]`
  после `usage`
  (пустой массив без привязки).
- Политика конфиденциальности, раздел 11 «Публичный профиль, Twitch и чат-команды»
  (`src/modules/legalPages/content.json`).

## Приложение → сайт

`POST /api/v1/twitch/state` · `Authorization: Bearer <access_token>` со scope
`tracker.write` · JSON ≤ 16 КБ:

```json
{ "v": 1, "seq": 42, "mode": "constructed",
  "deck": { "name": "Pirate Warrior", "hero": "HERO_01",
    "format": "standard", "left": 22,
    "cards": [{ "id": "CORE_CS2_106", "dbf": 69, "cost": 1,
      "name": "Fiery War Axe", "left": 1, "total": 2 }] },
  "game": { "turn": 5 } }
```

- `mode`: `constructed` | `none` (при `none` остальные поля не нужны и не
  пересылаются).
- `deck.name` и `deck.hero` могут быть `null`; `format`:
  `standard|wild|twist|classic|casual|other`; карт ≤ 80; `game` необязателен.
- Порядок проверок и ответы:
  1. `401 INVALID_ACCESS_TOKEN`;
  2. `403 INSUFFICIENT_SCOPE`;
  3. `503 twitch_not_configured`;
  4. `413 payload_too_large` — тело больше 16 КБ;
  5. `400 invalid_state`;
  6. `404 twitch_not_linked`;
  7. `413 payload_too_large` — конверт больше 5 КБ;
  8. `429 rate_limited` + `Retry-After` (с): не чаще раза в секунду на канал;
  9. `204` — отправлено, или `503 twitch_unavailable` — Twitch не принял
     (снимок при этом уже обновлён).
- Тела ошибок `{"error":{"code","message"}}`.
- Глобальный лимит API (120 в минуту) этот маршрут пропускает, у него свой:
  240 в минуту на клиента.

`GET /api/v1/twitch/status` · Bearer со scope `profile.read` →

```json
{ "configured": true, "linked": true, "login": "streamer",
  "displayName": "Streamer",
  "linkUrl": "https://hearthpulse.net/account/twitch" }
```

Без привязки `login` и `displayName` — `null`.

## Сайт → Twitch → фронт

`POST https://api.twitch.tv/helix/extensions/pubsub`, заголовки
`Client-Id: TWITCH_EXTENSION_CLIENT_ID` и `Authorization: Bearer <JWT>`.
JWT — HS256 на декодированном из base64 `TWITCH_EXTENSION_SECRET`:

```json
{ "exp": "now + 60 s", "user_id": "TWITCH_EXTENSION_OWNER_ID",
  "role": "external", "channel_id": "<twitch id>",
  "pubsub_perms": { "send": ["broadcast"] } }
```

Тело: `{target: ["broadcast"], broadcaster_id, is_global_broadcast: false,
message}`, где `message` — конверт:

```json
{ "v": 1, "seq": 42, "at": 1762500000000,
  "z": "<base64 gzip JSON state без v/seq>" }
```

`at` — время приёма сайтом (мс), только для отладки.

`GET /api/v1/twitch/ext/snapshot` ·
`Authorization: Bearer <JWT из Twitch.ext.onAuthorized>` (HS256, секрет
расширения; проверяются подпись, `exp` и `channel_id`):

- `200` — последний конверт канала не старше 30 минут;
- `204` — конверта нет;
- `401 invalid_extension_token`, `503 twitch_not_configured`;
- `Cache-Control: no-store`;
- CORS только для `https://<TWITCH_EXTENSION_CLIENT_ID>.ext-twitch.tv`
  (метод `GET`, заголовок `Authorization`, preflight `204`).

Снимки и лимит 1/с живут в памяти процесса: после перезапуска снимок вернётся
с ближайшим keepalive приложения (15 с).

OpenAPI: тег `Twitch` в `/api/v1/openapi.json` (версия 1.9.0).
