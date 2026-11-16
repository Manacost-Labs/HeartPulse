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

- Кабинет — главный документ сайта с `?login`; блок «Twitch-расширение» на
  вкладке «Персональные данные» открывает `/?login#account-twitch`. Этот адрес
  сайт и отдаёт приложению в `linkUrl`. Страницы `/profile/` у сайта нет.
- Адреса `/account/twitch` у сайта нет (`404`): origin nginx
  (`deploy/nginx/arena-html-routing.conf`) — белый список документов, и
  `/account/*` в нём нет. `location` для него не добавляли: это меняет
  nginx-контракт выкладки (`docs/runbooks/production-deployer-contract.md`) и
  требует ручной установки конфига на origin до релиза. Запасной адрес в
  приложении Hearthpulse (когда `linkUrl` не получен) должен быть
  `/?login#account-twitch`.
- Тест `tests/twitch-extension-routes.test.ts` проверяет, что все адреса,
  которые сайт отдаёт сам (`linkUrl` и цели редиректов привязки), — главный
  документ с `?login`.
- `GET /api/account/twitch` (сессия сайта) →
  `{configured, linked, login, displayName, linkedAt}`; без входа `401`.
- `GET /api/account/twitch/connect` (сессия) — OAuth authorization code flow
  без scope, с `force_verify=true`: Twitch всегда спрашивает, какой аккаунт
  привязать, даже если браузер уже вошёл в другой. `state` — 24 случайных
  байта: он уходит в Twitch и в cookie
  `hp_twitch_oauth` (HttpOnly, SameSite=Lax, Secure, Path
  `/api/account/twitch`, 10 мин), а сервер помнит в памяти, какой аккаунт его
  начал и до когда (не больше 10 000 ожидающих). После перезапуска ожидающие
  привязки теряются — стример нажимает «Привязать» ещё раз.
- `GET /api/account/twitch/callback` — сверяет `state` из запроса с cookie
  (timing-safe), берёт запись с сервера один раз (повтор — ошибка), проверяет
  срок и что сессия — тот же аккаунт; обменивает `code`, читает `helix/users`
  (id, login, display_name) и сразу отзывает токен Twitch: сайт токенов Twitch
  не хранит. Итог — `302` на
  `/?login&twitch=linked|cancelled|error|not_configured#account-twitch`.
- Один Twitch на аккаунт и один аккаунт на Twitch: повторная привязка того же
  Twitch к другому аккаунту переносит её (OAuth доказал владение), снимок,
  присланный прежним аккаунтом, при этом стирается. Таблица `twitch_links`,
  удаляется вместе с аккаунтом.
- `DELETE /api/account/twitch` (сессия + `X-CSRF-Request`: путь в
  `PROTECTED_MUTATION_PATHS`, `server/csrf.ts`, без заголовка — отказ CSRF) →
  `{linked:false}`; снимок канала забывается.
- Заблокированный аккаунт сайта не публикует. Блокировка удаляет только
  сессии браузера, токен приложения остаётся, поэтому `twitch/state` и
  `twitch/status` отвечают такому аккаунту `401 INVALID_ACCESS_TOKEN` (как
  `GET /api/v1/me`), снимок его канала стирается и зрителям не выдаётся.
- Экспорт данных аккаунта (`GET /api/account/tracker-data/export`) несёт
  `twitch: [{ twitchUserId, login, displayName, linkedAt }]` после `usage`
  (пустой массив без привязки).
- Политика конфиденциальности, раздел 11 «Публичный профиль и Twitch»
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
- Строго проверяется то, что защищает зрителя: типы, `id` карты и `hero`
  (`[A-Za-z0-9_]{1,64}`), размеры, список полей; `dbf` 0…10 000 000, `cost`
  0…999 (есть карта за 100 маны, `GDB_142`). Ошибка — `400 invalid_state`.
- Поля, которые только показываются, нормализуются, а не отклоняют состояние:
  `left` и `total` карты (целые) зажимаются в 0…99, `deck.left` — в 0…999;
  пустое имя карты заменяется её `id`, длинное обрезается до 80 знаков;
  пустое `deck.name` становится `null`, длинное обрезается до 100 знаков.
  Нормализация ничего не добавляет: лимиты тела 16 КБ и конверта 5 КБ и
  список пересылаемых полей прежние.
- Порядок проверок и ответы:
  1. `401 INVALID_ACCESS_TOKEN` (нет токена, он истёк или аккаунт
     заблокирован);
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
  "linkUrl": "https://hearthpulse.net/?login#account-twitch" }
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
- `204` — конверта нет, либо канал не привязан ни к одному аккаунту сайта
  (отвязка, удаление аккаунта), либо его аккаунт заблокирован: снимок при этом
  стирается;
- `401 invalid_extension_token`, `503 twitch_not_configured`;
- `Cache-Control: no-store`;
- CORS только для `https://<TWITCH_EXTENSION_CLIENT_ID>.ext-twitch.tv`
  (метод `GET`, заголовок `Authorization`, preflight `204`).

Снимки, лимит 1/с и ожидающие `state` привязки живут в памяти процесса:
после перезапуска снимок вернётся с ближайшим keepalive приложения (15 с).
Это верно только при одном процессе Express на весь сайт (сейчас так:
`deploy/hs-arena.service`). Второй экземпляр потребует общего хранилища для
всех трёх. Снимок старше 30 минут зрителям не выдаётся и стирается из памяти
в течение минуты (таймер раз в 60 с), а не только при запросе зрителя.

OpenAPI: тег `Twitch` в `/api/v1/openapi.json` (версия 1.9.0).
