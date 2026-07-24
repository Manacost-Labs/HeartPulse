# Инструменты AI-агента

Проект предоставляет воспроизводимые команды для браузерной диагностики и
локального статического анализа. Инструменты не используют пользовательский
профиль браузера и не отправляют исходный код во внешние AI-сервисы.

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

## CodeQL, OSV и OpenSSF Scorecard

- CodeQL запускает `security-extended` для JavaScript/TypeScript на pull
  request, `main` и по расписанию.
- OSV-Scanner блокирует новую уязвимость из pull request. Полный скан
  `package-lock.json` также строгий и публикует SARIF. Начальный baseline
  очищен обновлением уязвимых транзитивных PostCSS и js-yaml.
- OpenSSF Scorecard еженедельно оценивает настройки репозитория и загружает
  SARIF в GitHub Security. Публичная публикация результата и OIDC отключены.
- Dependabot еженедельно группирует minor/patch обновления production,
  development и GitHub Actions; major-обновления остаются отдельными PR.

Внешние GitHub Actions закреплены полными SHA. Dependabot и OSV не заменяют
`npm audit`: они добавляют независимую базу уязвимостей и обновления lockfile.

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

## Sentry SDK и MCP

Клиентский и серверный Sentry SDK полностью отключены, пока не задан
соответствующий DSN. `sendDefaultPii` выключен; перед отправкой удаляются
пользователь, headers, cookies, body, query string, extra/contexts и
неразрешённые tags. Email, bearer/token-подобные значения и длинные секреты
редактируются также в сообщениях ошибок. Session Replay не включён, а tracing
по умолчанию равен нулю.

Для активации error monitoring задайте server-only `SENTRY_DSN` и, при
необходимости, публичный browser DSN `VITE_SENTRY_DSN`. Sampling повышайте
только после проверки событий в тестовом Sentry environment:

```bash
npm run test:sentry
```

Sentry MCP объявлен как удалённый OAuth-сервер
`https://mcp.sentry.dev/mcp?skills=inspect,triage`. Токены не хранятся в
репозитории. Первый поддерживающий MCP клиент запросит вход в Sentry; без него
инструмент остаётся неактивным.
