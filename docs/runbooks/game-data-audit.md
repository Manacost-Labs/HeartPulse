# Эксплуатация pipeline контроля игровых данных

## Установка

После успешного production release установить units из текущего immutable
релиза:

```bash
sudo install -o root -g root -m 644 \
  deploy/systemd/hs-arena-game-data-audit.service \
  /etc/systemd/system/hs-arena-game-data-audit.service
sudo install -o root -g root -m 644 \
  deploy/systemd/hs-arena-game-data-audit.timer \
  /etc/systemd/system/hs-arena-game-data-audit.timer
audit_state_dir=/var/www/koloda/data/www/hs-arena.ru/shared/server-data
sudo install -d -o koloda -g koloda -m 750 "$audit_state_dir/game-data-audit"
sudo systemctl daemon-reload
sudo systemctl enable --now hs-arena-game-data-audit.timer
```

Unit выполняется от `koloda`, имеет read-only filesystem и может записывать
только в каталог аудита. Код ошибки `20` считается ожидаемым результатом
нарушенного инварианта: отчет сохранен, но данные требуют внимания.
Код `21` означает, что детерминированный отчет сохранен, но дополнительный
Codex-review не запустился или завершился ошибкой; systemd помечает такой запуск
неуспешным, чтобы проблема не оставалась незаметной.

## Включение Codex

Сначала авторизовать CLI для системного пользователя в отдельном `CODEX_HOME`.
Не копировать пользовательский профиль с лишними MCP, правилами или секретами.
После проверки создать `/etc/hs-arena/game-data-audit.env`:

```dotenv
GAME_DATA_AUDIT_CODEX_ENABLED=auto
CODEX_HOME=/var/lib/hs-arena/game-data-audit-codex
```

Файл должен принадлежать `root:koloda` и иметь режим `0640`. Проверить ручной
запуск:

```bash
audit_state_dir=/var/www/koloda/data/www/hs-arena.ru/shared/server-data
audit_state_dir="$audit_state_dir/game-data-audit"
sudo -u koloda env APP_ROOT_DIR=/var/www/koloda/data/www/hs-arena.ru/current \
  GAME_DATA_AUDIT_STATE_DIR="$audit_state_dir" \
  /usr/bin/node build/server/modules/gameDataAudit/cli.js --force --invoke-codex
```

Codex запускается только при `incomplete` или значимом изменении. Его ответ
сохраняется в `reviews/`; он не выполняет исправление.
Режим `auto` включает эскалацию только при наличии `auth.json` в отдельном
`CODEX_HOME`; детерминированный аудит не блокируется отсутствующей авторизацией.

## Наблюдение

```bash
systemctl list-timers hs-arena-game-data-audit.timer
journalctl -u hs-arena-game-data-audit.service -n 100 --no-pager
sudo -u koloda jq '{status, summary, issues}' \
  "/var/www/koloda/data/www/hs-arena.ru/shared/server-data/game-data-audit/latest.json"
```

После выхода патча `fastModeUntil` должен быть примерно на 72 часа позже
`checkedAt`. При обычной работе часовые вызовы между шестичасовыми аудитами
возвращают `{"status":"skipped","reason":"not_due"}`.

## Реакция на результаты

1. `source_lag`: проверить следующий запуск и состояние upstream. Не очищать
   исправный last-known-good snapshot.
2. `change_detected`: прочитать `changes` и review Codex, затем выполнить
   соответствующий patch runbook.
3. `incomplete`: найти `sourceId` и `code`, исправить импорт или upstream,
   затем запустить аудит с `--force`.
4. `MISSING_GOLDEN_VARIANT`: сверить `imageGold` Blizzard и локализованный
   HearthstoneJSON, затем использовать действующий golden fallback.
5. `MISSING_REQUIRED_FIELD`: проверить RU/EN, рендер и full art до публикации.

## Откат

Остановить timer, не удаляя накопленные отчеты:

```bash
sudo systemctl disable --now hs-arena-game-data-audit.timer
```

Unit не изменяет игровые данные, поэтому отдельный откат базы не требуется.
