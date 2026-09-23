# Аберрации на Полях сражений

HearthstoneJSON `ABERRATION` соответствует типу API `aberration`, названию
«Аберрация» в библиотеке и «Аберрации» в тир-листах и конструкторах.
Существующие типы и существа без типа сохраняют прежнее поведение.

Иконка — локальная копия предоставленного изображения
`https://art.hearthstonejson.com/v1/256x/TB_BaconShop_HP_041l.webp`.
Она используется в библиотеке, деталях карт, тир-листах и конструкторах.
Заклинания и аксессуары остаются в собственных разделах; новый тип существа
не меняет их классификацию.

Импортер `panel/scripts/scan_cards.php` в `hs-data-api` сохраняет тип,
справочники `panel/api/index.php` и `panel/index.php` предоставляют название.
Регрессионная проверка: `php panel/tests/battleground_creature_types_test.php`.
Пример: `BG36_110` («Счастье», DBF 131718) должен получить `aberration`,
а не `null`; обычная и золотая версии используют одно преобразование.

Клиентская проверка включает `npm run test:battleground-accessories`,
`npm run verify:release` и Storybook `Battlegrounds/Library/AberrationFilter`
в Chrome DevTools на desktop/mobile. Изменения проверены также в отдельной
рабочей копии с локальной миграцией Next.js, но production-релиз содержит
только поддержку аберраций и не публикует эту миграцию.

Порядок обновления импортированных записей:
[обновление данных после патча](../runbooks/battlegrounds-patch-refresh.md).
