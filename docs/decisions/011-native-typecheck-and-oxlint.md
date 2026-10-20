# ADR 011: tsgo для проверки типов и oxlint первым проходом

## Статус

Принято.

## Контекст

Каждый push в `main` проходит `npm run verify:release` в CI и только потом
деплоится. Медиана шага на пяти зелёных прогонах 20.10.2026 — 18,6 минуты.
Почти всё время уходит на браузерные тесты в `npm test` (~16 минут
последовательно). Проверка типов — `lint`, `lint:next` и сборка Next.js —
занимала около 50 секунд. Отдельного линтера кода в проекте не было: ESLint
приходит только транзитивно через `react-doctor`, который проверяет React
в изменённых файлах.

Сайт и бандлер не меняются: Next.js остаётся на SWC с `--webpack`.

## Решение

### Проверка типов: tsgo

`lint`, `lint:next` и `lint:domains` запускают tsgo из
`@typescript/native-preview` — нативный компилятор TypeScript 7 на Go.
Компилятор выбирает одна строка в `package.json`:

```json
"config": { "typescript_checker": "tsgo" }
```

Значение `tsc` возвращает все три скрипта на TypeScript 5.9.
`npm run typecheck:tsc` и `npm run typecheck:tsgo` проверяют все три проекта
конкретным компилятором, чтобы сравнить их.

TypeScript 7 меняет умолчания: включает `strict` и
`noUncheckedSideEffectImports`. Корневой `tsconfig.json` явно задаёт прежние
значения. Для `tsc` 5.9 это ничего не меняет, а `tsconfig.domains.json`
по-прежнему включает `strict` для своих модулей.

Стабильный `typescript@7.0.2` не подключён. Его пакет называется
`typescript` и ставит бинарник `tsc`, а Next.js, Storybook, knip и
react-doctor используют JS API TypeScript 5. Через npm-алиас оба пакета
претендуют на один `.bin/tsc`. Чистая установка оставляет 5.9, а
инкрементальный `npm install` перелинковал его на 7.0.2. После этого
`build:server` молча собирался бы другим компилятором. У
`@typescript/native-preview` отдельный бинарник `tsgo`, конфликта нет.

Компилятором `tsc` остаются:

- `build:server` — эмит серверного артефакта, который уходит в production;
- проверка типов внутри `next build` — Next.js вызывает свой пакет
  `typescript`.

### Расхождения диагностик

- Наборы проверяемых файлов совпадают во всех четырёх конфигах:
  1396 файлов в корневом, 60 в domains, 656 в Next.js и 278 в серверном.
- В текущем виде оба компилятора не находят ошибок.
- Под `--strict --noUncheckedSideEffectImports` у обоих 180 ошибок в
  корневом конфиге и конфиге Next.js. Совпадают 179 позиций. Одна ошибка
  TS2322 в `tests/subscription-routes.test.ts` выводится в соседнем свойстве
  объекта: TypeScript 7 детерминированно упорядочивает кандидатов вывода
  дженериков и сообщает о той же несовместимости с другой стороны.
- Без явных умолчаний tsgo сообщал 185 ошибок: 153 в корневом конфиге,
  27 в Next.js и 5 в domains. Все они вызваны `strict` и
  `noUncheckedSideEffectImports`.
- Внедрённые ошибки — несовпадение типа, неявный `any` в strict-модуле
  domains и ошибка в Next.js — роняют `lint`, `lint:domains` и `lint:next`.

### oxlint

`npm run lint:oxlint` — первый шаг `verify:release` и `verify:ci`, а также
быстрая проверка `oxlint` в `config/quality-guard.json`. Конфиг
`.oxlintrc.json` включает категорию `correctness` (96 правил) как ошибки.
Десять правил с существующими срабатываниями остаются предупреждениями,
всего 158 штук. Сайт ради них не переписывается:

| Правило | Срабатываний |
| --- | --- |
| `no-unused-vars` | 86 |
| `no-control-regex` | 18 |
| `no-useless-escape` | 14 |
| `unicorn/no-new-array` | 13 |
| `unicorn/no-useless-fallback-in-spread` | 8 |
| `no-unsafe-optional-chaining` | 7 (тесты) |
| `unicorn/prefer-string-starts-ends-with` | 6 |
| `unicorn/no-useless-spread` | 3 |
| `no-unsafe-finally` | 2 (`scripts/server-build-smoke.mjs`) |
| `unicorn/no-invalid-fetch-options` | 1 (тест) |

Дублирующих правил ESLint, которые можно было бы снять через
`eslint-plugin-oxlint`, в проекте нет: конфига ESLint нет вообще. Правила
React (`react`, `react-hooks`, React Compiler) не включены: их уже проверяет
`react-doctor` в изменённых файлах, а на всём дереве они дали бы ещё 122
предупреждения.

## Замеры

Локально, медиана трёх прогонов на общем сервере с 16 ядрами:

| Проверка | tsc 5.9 | tsgo 7 |
| --- | --- | --- |
| `lint` (корневой конфиг) | 12,1 с | 1,5 с |
| `lint:next`, холодный | 6,4 с | 0,6 с |
| `lint:next`, с `tsbuildinfo` | 1,4 с | 0,25 с |
| `lint:domains` | 1,5 с | 0,16 с |
| `tsconfig.server.json`, без эмита | 3,8 с | 0,4 с |
| Все три проекта (`typecheck:*`) | 22,8 с | 2,6 с |
| `lint:oxlint`, 1529 файлов | — | 0,14 с |

GitHub Actions, шаги `verify:release`. «До» — пять зелёных прогонов `main`
20.10.2026, «после» — прогон 39492051915 этой ветки:

| Шаг | До | После |
| --- | --- | --- |
| `lint:oxlint` | — | < 1 с |
| `lint` | 22–25 с | 4 с |
| `lint:next` | 12–13 с | 2 с |
| `build:server` (tsc, эмит) | 6–7 с | 8 с |
| TypeScript внутри `build:next` | 12,6 с | 14,5 с |
| `npm test` | 16–22 мин | 23,6 мин |
| Весь шаг `verify:release` | 14,7–25,1 мин, медиана 18,6 | 26,2 мин |

Проверка типов в CI сократилась с ~37 до ~6 секунд. Общее время задания
определяют браузерные тесты: их разброс между раннерами — минуты, на
порядок больше выигрыша.

## Последствия

- Проверка типов в CI и локально стала примерно в 8–10 раз быстрее. Общее
  время CI почти не меняется: его определяют браузерные тесты.
- Новый линтер ловит ошибки корректности на всём дереве за доли секунды.
  Новое срабатывание любого из 86 чистых правил роняет verify.
- `@typescript/native-preview` — dev-сборка от 07.07.2026, её публикация
  остановлена после выхода TypeScript 7.0. Когда Next.js, Storybook, knip и
  react-doctor смогут работать с `typescript@7` вместе с
  `@typescript/typescript6`, нужно перейти на стабильный пакет.
- Откат: `"typescript_checker": "tsc"` в `package.json`. Полный откат —
  ещё удалить `@typescript/native-preview`, `oxlint`, `.oxlintrc.json` и шаг
  `lint:oxlint`.
