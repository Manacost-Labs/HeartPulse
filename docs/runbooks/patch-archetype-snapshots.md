# Снимки архетипов для патчноутов

Страница патча показывает архетипы на день до выхода патча, а не
сегодняшние (`docs/specs/patch-notes.md`, раздел «Meta impact and history»).

## Где лежит

- SQLite:
  `<SERVER_DATA_DIR>/patch-archetype-snapshots-v1/snapshots.sqlite`
  (по умолчанию `server/data/…` рядом с приложением).
- `daily_snapshots` — один снимок на формат и московский день данных,
  хранится 45 дней.
- `patch_snapshots` — снимки, закреплённые за версией патча; не удаляются.

## Когда пишется

- Express при `BACKGROUND_JOBS_ENABLED` (по умолчанию включено) пишет
  снимок через 2 минуты после старта и потом раз в час. Ещё одна запись
  идёт при каждом обновлении архива патчей (раз в 30 минут, если страницу
  открывают).
- День снимка — день `fetched_at` каталога HSGuru. Если hs-data-api отдаёт
  устаревший каталог, снимок попадает в день его данных, а не в сегодня.
- Закрепление: как только наступил московский день D выхода патча, снимки
  дня D−1 копируются в `patch_snapshots` и больше не меняются.

## Проверка

На проде `SERVER_DATA_DIR` —
`/var/www/koloda/data/www/hs-arena.ru/shared/server-data`
(`deploy/hs-arena.service`).

```bash
cd /var/www/koloda/data/www/hs-arena.ru/shared/server-data
```

```bash
sqlite3 patch-archetype-snapshots-v1/snapshots.sqlite \
  "SELECT format, day, recorded_at FROM daily_snapshots ORDER BY day DESC;"
```

```bash
sqlite3 patch-archetype-snapshots-v1/snapshots.sqlite \
  "SELECT version, format, day, pinned_at FROM patch_snapshots;"
```

## Если что-то пошло не так

- Нет снимка за D−1 (Express лежал весь день или каталог не читался):
  у патча не будет блока архетипов. Подставлять другой день нельзя:
  это и есть требование.
- Закреплён неверный снимок: удалите строки этой версии из
  `patch_snapshots` и при необходимости исправьте `daily_snapshots` за D−1;
  при следующем обновлении архива (до 30 минут) снимок закрепится заново.
- Файл потерян: старые закрепления не восстановить из hs-data-api — его
  бэкапы датасетов живут несколько дней. Включите каталог в резервное
  копирование `SERVER_DATA_DIR`, как остальные хранилища в нём.
