# Мутационное тестирование

Stryker вносит в код маленькие ошибки («мутанты»: `>` вместо `>=`, пропущенная
проверка, пустая строка вместо подписи) и прогоняет тесты. Мутант, который
тесты не заметили, показывает проверку, которой нет. Это не CI-gate: полный
прогон идёт вручную или раз в неделю.

## Что покрыто

Модули с чистой логикой, ошибка в которых видна пользователю
(`stryker.config.json`, поле `mutate`):

- `src/features/constructedDeckCode.ts`, `server/deckCardData.ts` — код
  колоды из конструктора и список карт колоды;
- `server/modules/arena/classStatisticsNormalizer.ts` — тир-лист классов
  Арены: win rate, порядок, доли;
- `server/modules/leaderboards/contract.ts` — таблицы лидеров из hs-data-api;
- `src/modules/playerStats/model/format.ts` — числа, проценты, время и ранги
  в статистике игрока;
- `src/shared/seo/publicUrlPolicy.ts`, строки 73–168, — canonical URL и robots
  страниц; DOM-часть файла node-тесты не исполняют.

Тесты, которыми Stryker убивает мутантов, перечислены в `tap.testFiles`. Новый
тест на эти модули добавляйте и туда, и в `tests/test-suites.json`.

## Запуск

```bash
flock /tmp/hearthpulse-heavy.lock nice -n 19 ionice -c3 npm run test:mutation
```

Прогон занимает около минуты при `concurrency: 4`; на общем сервере не
поднимайте параллелизм выше 4. Отчёт: `reports/mutation/mutation.html`
(по строкам) и `reports/mutation/mutation.json`; папка и песочница
`.stryker-tmp/` не коммитятся. Workflow `Mutation testing` запускает то же
самое по понедельникам и по кнопке и выкладывает отчёт артефактом.

Раннер — `@stryker-mutator/tap-runner`: каждый тестовый файл идёт как
`node --import tsx --test --test-reporter=tap --experimental-test-isolation=none`,
поэтому и тесты на `node:test`, и простые скрипты с `assert` дают TAP, а
покрытие собирается по файлам (`coverageAnalysis: perTest`).

## Как читать выживших

Выживший мутант — повод для теста на поведение через публичный экспорт, а не
на строку кода. Не всех нужно убивать:

- тексты внутренних ошибок (`leaderboards: total is not an integer`): их не
  видит пользователь, контракт проверяется по типу ошибки;
- эквивалентные мутанты: результат не меняется (`.trim()` перед
  `Number(...)`, `/\s+/g` → `/\s/g` в глобальной замене, сортировка политик
  с одинаковым весом в текущем inventory);
- защитные пороги, которые в данных не встречаются (эпсилон `1e-9`
  в `comparison`).

## Property-based тесты

Инварианты на fast-check лежат рядом (`tests/*-property.test.ts`): код колоды
читается в игре как та же колода, тир-лист монотонен и стабилен, нормализаторы
hs-data-api не теряют обязательных полей и идемпотентны, canonical URL от
canonical URL — он сам. Seed зафиксирован в `tests/helpers/propertyRuns.ts`;
при падении fast-check печатает seed, путь и уменьшенный контрпример.
Повторить или сменить прогон: `FAST_CHECK_SEED=<seed> FAST_CHECK_RUNS=<n>`.
