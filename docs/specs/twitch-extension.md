# Twitch-расширение: API сайта (EBS)

Зритель стрима видит в расширении Hearthpulse оставшиеся карты колоды стримера. Путь данных: приложение
Hearthpulse → `POST /api/v1/twitch/state` → Twitch Extension PubSub (`broadcast`) → фронт расширения. Холодный
старт зрителя — `GET /api/v1/twitch/ext/snapshot`. Модуль: `server/modules/twitchExtension`, регистрация:
`server/app/registerTwitchExtension.ts`. Настройка и секреты: `docs/runbooks/twitch-extension.md`.

## Скрытая информация

Сайт пересылает только поля контракта ниже: состав модели пересобирается поле за полем, лишние поля тела
(рука, порядок колоды, соперник) отбрасываются и в PubSub не попадают. Порядок `cards` — порядок списка колоды в
трекере, не в игре.

## Привязка Twitch

- `GET /account/twitch` — адрес `linkUrl` для приложения, `302` на `/profile/#account-twitch` (блок
  «Twitch-расширение» на вкладке «Персональные данные»).
- `GET /api/account/twitch` (сессия сайта) → `{configured, linked, login, displayName, linkedAt}`; без входа `401`.
- `GET /api/account/twitch/connect` (сессия) — OAuth authorization code flow без scope. `state` — 24 случайных
  байта; cookie `hp_twitch_oauth` (HttpOnly, SameSite=Lax, Secure, Path `/api/account/twitch`, 10 мин) хранит
  `state.expiresAt.hmac`, где HMAC-SHA256 на `TWITCH_OAUTH_CLIENT_SECRET` связывает `state`, срок и id аккаунта.
- `GET /api/account/twitch/callback` — проверяет `state` из запроса против cookie (timing-safe), подпись, срок и
  что сессия — тот же аккаунт; обменивает `code`, читает `helix/users` (id, login, display_name) и сразу отзывает
  токен Twitch: сайт токенов Twitch не хранит. Итог — `302` на `/profile/?twitch=linked|cancelled|error|not_configured#account-twitch`.
- Один Twitch на аккаунт и один аккаунт на Twitch: повторная привязка того же Twitch к другому аккаунту
  переносит её (OAuth доказал владение). Таблица `twitch_links`, удаляется вместе с аккаунтом.
- `DELETE /api/account/twitch` (сессия + `X-CSRF-Request`) → `{linked:false}`; снимок канала забывается.

## Приложение → сайт

`POST /api/v1/twitch/state` · `Authorization: Bearer <access_token>` со scope `tracker.write` · JSON ≤ 16 КБ:

```json
{ "v": 1, "seq": 42, "mode": "constructed",
  "deck": { "name": "Pirate Warrior", "hero": "HERO_01", "format": "standard", "left": 22,
    "cards": [{ "id": "CORE_CS2_106", "dbf": 69, "cost": 1, "name": "Fiery War Axe", "left": 1, "total": 2 }] },
  "game": { "turn": 5 } }
```

- `mode`: `constructed` | `none` (при `none` остальные поля не нужны и не пересылаются).
- `deck.name` и `deck.hero` могут быть `null`; `format`: `standard|wild|twist|classic|casual|other`; карт ≤ 80;
  `game` необязателен.
- Порядок проверок и ответы: `401 INVALID_ACCESS_TOKEN` · `403 INSUFFICIENT_SCOPE` · `503 twitch_not_configured` ·
  `413 payload_too_large` (тело > 16 КБ) · `400 invalid_state` · `404 twitch_not_linked` · `413 payload_too_large`
  (конверт > 5 КБ) · `429 rate_limited` + `Retry-After` (с), не чаще 1 раза в секунду на канал · `204` — отправлено ·
  `503 twitch_unavailable` — Twitch не принял (снимок при этом уже обновлён). Тела ошибок `{"error":{"code","message"}}`.
- Перед глобальным лимитом API (120/мин) этот маршрут исключён и имеет свой: 240/мин на клиента.

`GET /api/v1/twitch/status` · Bearer со scope `profile.read` →
`{"configured": true, "linked": true, "login": "streamer", "displayName": "Streamer", "linkUrl": "https://hearthpulse.net/account/twitch"}`
(`login`/`displayName` — `null` без привязки).

## Сайт → Twitch → фронт

`POST https://api.twitch.tv/helix/extensions/pubsub`, заголовки `Client-Id: TWITCH_EXTENSION_CLIENT_ID` и
`Authorization: Bearer <JWT>`; JWT HS256 на декодированном из base64 `TWITCH_EXTENSION_SECRET`:
`{exp: now+60 с, user_id: TWITCH_EXTENSION_OWNER_ID, role: "external", channel_id, pubsub_perms: {send: ["broadcast"]}}`.
Тело: `{target: ["broadcast"], broadcaster_id: <twitch id>, is_global_broadcast: false, message}`, где `message` — конверт:

```json
{ "v": 1, "seq": 42, "at": 1762500000000, "z": "<base64 gzip JSON state без v/seq>" }
```

`at` — время приёма сайтом (мс), только для отладки.

`GET /api/v1/twitch/ext/snapshot` · `Authorization: Bearer <JWT из Twitch.ext.onAuthorized>` (HS256, секрет
расширения, проверяются подпись, `exp` и `channel_id`) → `200` последний конверт канала не старше 30 минут ·
`204` · `401 invalid_extension_token` · `503 twitch_not_configured`. `Cache-Control: no-store`. CORS: только
`https://<TWITCH_EXTENSION_CLIENT_ID>.ext-twitch.tv` (метод `GET`, заголовок `Authorization`, preflight `204`).
Снимки и лимит 1/с живут в памяти процесса: после перезапуска снимок вернётся с ближайшим keepalive приложения (15 с).

OpenAPI: теги `Twitch` в `/api/v1/openapi.json` (версия 1.9.0).
