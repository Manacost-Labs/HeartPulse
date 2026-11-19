# Картинки карт: источник dbf и адресный сброс кеша

## Откуда берётся dbf

`/api/card-image/<cardId>/...` скачивает рендер Blizzard по dbf карты.
Авторитетный источник соответствия cardId и dbf — полный `cards.json`
HearthstoneJSON (`server/cardImageDbf.ts`, кеш в памяти на сутки, при сбое
остаётся прошлый индекс). `shared/server-data/cards_ru.json` служит только
запасным источником: он устарел (2026-06-08) и содержит предрелизные dbf.
Если dbf из `cards_ru.json` отличается от HearthstoneJSON, сервер берёт
HearthstoneJSON и пишет `[api/card-image] dbf mismatch` в лог. Если карты нет
в HearthstoneJSON, а её dbf там принадлежит другой карте, картинка Blizzard
не используется, отдаётся рендер HearthstoneJSON по cardId.

Причина #472: словарь `cards.collectible.json` не содержит токенов (`t1`,
`t2` и т.д.), и для них dbf брался из устаревшего файла, где у `TIME_609`,
`TIME_609t1`, `TIME_609t2` dbf сдвинуты на одну карту.

## Проверка масштаба

```bash
curl -sL https://api.hearthstonejson.com/v1/latest/enUS/cards.json -o /tmp/hsj.json
node scripts/audit-card-image-dbf.mjs <путь к cards_ru.json> /tmp/hsj.json
```

`wrongOtherCard` — картинка чужой карты; `wrongTwin` — dbf CORE-двойника, та
же картинка, исправлять не нужно.

## Адресный сброс

Список карт — `shared/cardImageRepairs.ts` (`CARD_IMAGE_REPAIR_CARD_IDS`).
Для них:

1. URL получает суффикс `-dbf472` в `?v=` (клиент и `cardImageProxyUrl`), так
   что браузер и CDN забывают старую картинку;
2. при первом запросе сервер удаляет старый `<id>-<variant>-blizzard-<версия>.webp`,
   скачивает картинку по верному dbf и пишет маркер
   `card-images/.repair-dbf472-<id>-<variant>` (маркеры rsync на edge не
   отправляет).

`CARD_IMAGE_CACHE_VERSION` не меняется: остальные картинки не перекачиваются.
Новую партию исправлений делают новым значением `CARD_IMAGE_REPAIR_REVISION`
и новым списком.

## Деплой

После выкладки один раз прогреть исправленные карты на origin, затем
синхронизировать edge (`deploy/arena-card-image-sync.sh`, он же таймер):

```bash
ids=$(grep -oE "'[A-Za-z0-9_]+'," shared/cardImageRepairs.ts | tr -d "',")
for id in $ids; do
  for v in thumb full; do
    curl -s -o /dev/null \
      "http://127.0.0.1:<порт origin>/api/card-image/$id/$v.webp"
  done
done
```

Пока edge не синхронизирован, он отдаёт локальный старый файл по пути без
учёта `?v=`; после `rsync --delete` файл заменяется или исчезает и запрос
уходит на origin.
