# Инструменты AI-агента

Проект предоставляет воспроизводимые команды для браузерной диагностики и
локального статического анализа. Инструменты не используют пользовательский
профиль браузера и не отправляют исходный код во внешние AI-сервисы.

## Начальный контекст

Сначала полностью прочитайте корневой `AGENTS.md`, затем откройте компактную
[карту HearthPulse](architecture/ai-project-map.md). Карта указывает текущие
точки входа, различает модульные и переходные области и ведёт к минимальному
набору команд и документов для конкретного изменения.

## Обязательная маршрутизация навыков

Навыки установлены на сервере, но агент обязан выбирать их по типу задачи:

- исследование кода — CodeGraph, а для актуальной документации библиотек —
  Context7;
- интерфейс и адаптивность — `frontend-design`, TypeUI fundamentals и
  `browser-testing-with-devtools`;
- React — `react-best-practices` и `frontend-testing-debugging`;
- скорость — `performance-optimization` и web-quality skills для performance,
  Core Web Vitals и accessibility;
- телеметрия — `observability-and-instrumentation`;
- внешние источники и сомнительные предположения — `source-driven-development`
  и `doubt-driven-development`.

Точные пути и обязательный порядок закреплены в `AGENTS.md`. После любого
изменения интерфейса агент должен открыть реальную страницу через Chrome
DevTools MCP, проверить целевые разрешения, overflow, консоль, сеть,
accessibility tree и показатели производительности.

## Проверенная навигация по архитектуре

Перед широким чтением используйте ownership-контекст для модуля, legacy-файла
или всего репозитория:

```bash
npm run agent:context -- client.battlegrounds
npm run agent:context -- src/features/BgLibrary.tsx
npm run agent:context -- shared-root.client
npm run agent:context -- server/shared/http/asyncRoute.ts
npm run agent:context -- root
```

Canonical shared roots are navigable by stable id, root or nested path. Their
schema-v3 records expose the declared owner, purpose, focused tests,
documentation and safe starts instead of synthesizing placeholder ownership.
Their context and check plan also conservatively include every canonical module
and migration area in the same runtime, so a legacy caller cannot silently lose
its focused test.
`agent:impact -- <module-id-or-path-or-root> --json` добавляет обратных callers,
затронутые контракты, focused tests, документацию, долг и маршруты.
`agent:check -- <target> --list` строит безопасный allowlisted план без запуска,
а без `--list` выполняет его. `agent:map -- --json` выдаёт детерминированную
полную карту модулей, owned shared roots, migration areas и канонических
публичных URL.

Служебные JSON-ответы не содержат абсолютных путей или timestamp. Маршруты не
копируются в module inventory: `routeScope` выбирает только существующих
owner-id, а pattern, route id и policy загружаются из
`src/shared/seo/publicRouteInventory.json`.

Сам architecture checker оставляет `scripts/check-module-boundaries.mjs`
стабильным facade для orchestration и CLI. Поиск файлов, безопасность путей,
грамматика аргументов CLI, парсинг импортов, resolution/glob-граф, циклы и
форматирование отчёта разнесены по именованным владельцам в `scripts/lib/`.
Config checker принимает только канонический repository-relative regular file,
запрещает symlink-компоненты и читает файл через проверенный descriptor. Размеры
всех владельцев ratcheted отдельными budget-проверками, а CLI и порядок
diagnostics закреплены characterization tests; при изменении правила агенту не
нужно читать весь checker целиком.

## Storybook и Storybook MCP

Storybook 10 работает как локальная мастерская React-компонентов и не входит в
production bundle. Запуск:

```bash
npm run storybook
```

Интерфейс откроется на `http://127.0.0.1:6006`, а официальный Storybook MCP —
на `http://127.0.0.1:6006/mcp`. После первого добавления `.mcp.json`
перезапустите Codex или Claude, чтобы клиент перечитал список MCP-серверов.

Обязательный цикл для переиспользуемого React-компонента:

1. Добавить или обновить расположенный рядом файл `*.stories.tsx`.
2. Через MCP получить актуальные инструкции Storybook и список stories.
3. Открыть каждое изменённое состояние в реальном браузере и проверить
   desktop/mobile, accessibility, консоль и сеть.
4. Выполнить:

   ```bash
   npm run test:storybook
   npm run build-storybook
   ```

Подключены официальные addons для документации, accessibility и MCP.
Документационный и development toolsets MCP включены. Test toolset пока
отключён: интерактивные `play`-сценарии компилируются и доступны в stories, а
отдельный Vitest Browser runner можно подключить позже без увеличения
production-зависимостей. Телеметрия Storybook отключена в обеих npm-командах.
Локальный MCP нельзя публиковать через production Nginx.

## Chrome DevTools MCP

Файл `.mcp.json` подключает Chrome DevTools MCP через локальную зафиксированную
версию npm-пакета. Сервер запускается командой:

```bash
npm run agent:devtools
```

Безопасные значения по умолчанию:

- отдельный временный профиль Chrome;
- headless-режим;
- отключённые usage statistics и CrUX;
- скрытие чувствительных сетевых заголовков;
- WebP-скриншоты ограниченного размера;
- разрешены только production-домены Manacost и локальные порты разработки.

На сервере Chrome запускается с `--no-sandbox`, потому что системная sandbox
недоступна. В окружении с рабочей Chrome sandbox установите:

```bash
MANACOST_DEVTOOLS_CHROME_SANDBOX=1 npm run agent:devtools
```

Список разрешённых адресов можно сузить через разделённую запятыми переменную
`MANACOST_DEVTOOLS_ALLOWED_URL_PATTERNS`.

## Semgrep CE

Неблокирующая проверка только изменённых авторских JS/TS-файлов:

```bash
npm run security:semgrep
```

Команда использует зафиксированную версию Semgrep через `uvx`, отключает
метрики и проверку обновлений, не применяет autofix и не разрешает локальные
сборки. Код анализируется локально; набор правил `p/typescript` загружается из
Semgrep Registry.

После классификации baseline доступен строгий режим:

```bash
npm run security:semgrep:strict
```

Строгий режим завершится ошибкой при любом новом finding или parser error.
Пока baseline не утверждён, он не входит в обязательный `verify:ci`.

## Gitleaks

Полная локальная проверка Git-истории:

```bash
npm run security:gitleaks
```

Команда проверяет Git-историю и текущие незакоммиченные файлы, использует
неизменяемый digest официального Docker-образа Gitleaks, включает редактирование
найденных значений и не создаёт отчёт с потенциальными секретами. Если текущий
пользователь не имеет доступа к Docker daemon, launcher пробует только
non-interactive `sudo -n`.

GitHub Actions повторяет полную проверку на pull request, `main`, по расписанию
и вручную. Комментарии и выгрузка артефактов отключены, чтобы найденное значение
не копировалось в дополнительные поверхности.

## CodeQL, OSV, Dependency Review, Trivy и OpenSSF Scorecard

- CodeQL запускает `security-extended` для JavaScript/TypeScript на pull
  request, `main` и по расписанию.
- OSV-Scanner блокирует новую уязвимость из pull request. Полный скан
  `package-lock.json` также строгий и публикует SARIF. Начальный baseline
  очищен обновлением уязвимых транзитивных PostCSS и js-yaml.
- OpenSSF Scorecard еженедельно оценивает настройки репозитория и загружает
  SARIF в GitHub Security. Публичная публикация результата и OIDC отключены.
- Dependabot еженедельно группирует minor/patch обновления production,
  development и GitHub Actions; major-обновления остаются отдельными PR.
- Dependency Review блокирует pull request, если он добавляет `HIGH` или
  `CRITICAL` уязвимость, неизвестный scope либо лицензию вне утверждённого
  SPDX allowlist. Исключения GHSA отсутствуют; комментарии в PR отключены.
- Trivy проверяет файловую систему проекта на package-уязвимости и
  misconfiguration. `HIGH`/`CRITICAL` findings блокируют workflow, а SARIF
  отправляется в GitHub Code Scanning. Secret scanner Trivy намеренно не
  дублирует Gitleaks.

Внешние GitHub Actions закреплены полными SHA. Dependabot и OSV не заменяют
`npm audit`: они добавляют независимые базы уязвимостей, проверку изменений
dependency graph, конфигураций и обновления lockfile.

## fast-check

Property-based тесты проверяют нормализацию недоверенных ответов parser-control
на 500 автоматически сгенерированных JSON-структурах:

```bash
npm run test:property
```

По умолчанию используется воспроизводимый seed `20260724`. Для повторения
другого найденного случая задайте `FAST_CHECK_SEED`.

## Knip

Обязательный dependency-контур:

```bash
npm run quality:knip
```

Он блокирует неиспользуемые, незадекларированные и неразрешимые зависимости.
CLI-пакеты Chrome DevTools MCP и React Doctor внесены в явный allowlist,
поскольку они запускаются через `node_modules/.bin`, а не импортируются.
Расширенный аудит файлов и экспортов пока информационный:

```bash
npm run quality:knip:full
```

## Sentry SDK, Web Vitals и MCP

Клиентский и серверный Sentry SDK полностью отключены, пока не задан
соответствующий DSN. `sendDefaultPii` выключен; перед отправкой удаляются
пользователь, headers, cookies, body, query string, extra/contexts и
неразрешённые tags. Email, bearer/token-подобные значения и длинные секреты
редактируются также в сообщениях ошибок. Session Replay не включён, а tracing
по умолчанию равен нулю.

Клиент в idle-время лениво загружает небольшой `web-vitals` chunk и группирует
LCP, CLS, INP, FCP и TTFB в один credential-free same-origin запрос. Сервер
валидирует фиксированную схему и при наличии server-only `SENTRY_DSN` отправляет
в Sentry distribution-метрики: `web.vital.lcp`, `web.vital.cls`,
`web.vital.inp`, `web.vital.fcp` и `web.vital.ttfb`. Большой browser Sentry SDK
не загружается ради RUM и остаётся ленивым аварийным контуром. В атрибуты
попадают только ограниченные значения `rating` и `navigation_type`; URL, metric
id, DOM target, cookies, пользователь и другие высококардинальные/чувствительные
данные не отправляются.

Для активации error monitoring задайте server-only `SENTRY_DSN` и, при
необходимости, публичный browser DSN `VITE_SENTRY_DSN` для клиентских ошибок.
RUM требует только server-only DSN и по умолчанию собирается для всех page
views; объём можно ограничить через `VITE_SENTRY_WEB_VITALS_SAMPLE_RATE` от `0`
до `1`. Tracing sampling повышайте только после проверки событий в тестовом
Sentry environment:

```bash
npm run test:sentry
```

Sentry MCP объявлен как удалённый OAuth-сервер
`https://mcp.sentry.dev/mcp`. Токены не хранятся в репозитории. Первый
поддерживающий MCP клиент запросит вход в Sentry; без него инструмент остаётся
неактивным. Не добавляйте устаревшие query-параметры к MCP URL: OAuth resource
должен точно совпадать с официальным базовым endpoint.
