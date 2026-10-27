# Как помочь HearthPulse

Спасибо за интерес к проекту. HearthPulse — инженерное имя репозитория и
production-платформы; публичный интерфейс сохраняет бренд Manacost Arena. Даже
небольшое изменение должно сохранять корректность данных, скорость интерфейса,
адаптивность и возможность безопасного отката.

## Перед началом

1. Проверьте существующие issues и открытые pull requests.
2. Для ошибки приложите публичный URL и минимальные шаги воспроизведения.
3. Не публикуйте токены, cookies, содержимое `.env`, персональные данные и
   приватные ответы API.
4. Уязвимости сообщайте через
   [GitHub Private Vulnerability Reporting](https://github.com/Manacost-Labs/HeartPulse/security/advisories/new),
   а не через публичный issue.

## Локальная разработка

```bash
git clone https://github.com/Manacost-Labs/HeartPulse.git
cd HeartPulse
npm ci
cp .env.example .env
npm run dev
```

Node.js 22+ обязателен. Большинство страниц может работать на сохранённых
snapshots без внешних ключей; не добавляйте тестовые секреты в репозиторий.

## Навигация по архитектуре

Перед изменением кода получите карту владельцев и оцените область влияния:

```bash
npm run agent:map
npm run agent:context -- client.identity
npm run agent:context -- src/features/BgLibrary.tsx
npm run agent:context -- root
npm run agent:impact -- src/modules/identity/public.ts
npm run agent:check -- src/modules/identity/public.ts --list
```

`agent:map` показывает модули и отдельный реестр публичных URL,
`agent:context` — контракт модуля, канонический shared root, проверенную
legacy-зону или общий обзор репозитория, `agent:impact` — вызывающий код,
затронутые контракты, маршруты и
тесты. После просмотра плана уберите `--list`, чтобы `agent:check` безопасно
запустил архитектурную проверку, TypeScript и только целевые тесты. Для чистого
JSON используйте `npm run --silent ... -- --json`.

## Перед pull request

Запустите единый gate:

```bash
npm run verify:ci
```

Для изменений зависимостей или security-контура дополнительно полезны:

```bash
npm run security:gitleaks
npm run security:semgrep
npm run quality:knip
```

GitHub повторно выполнит CI, CodeQL, Gitleaks, OSV-Scanner, Trivy, Dependency
Review и OpenSSF Scorecard. Не отключайте проверку ради зелёного статуса:
исправьте причину либо явно документируйте подтверждённое исключение.

## Как запустить часть тестов

Все тесты перечислены в `tests/test-suites.json`, `npm test` выполняет их
целиком. Для одного файла отдельный npm-скрипт не нужен:

```bash
npx tsx tests/page-tour-auto-start.test.ts
node --test tests/next-page-transitions-browser.test.mjs
```

Тесты модуля из `config/architecture-catalog.json` и группа реестра:

```bash
npm run test:module -- <module-id>
node scripts/test-suite-runner.mjs --suite browser
```

Скрипты `test:*` в `package.json` остаются для составных проверок и тех, на
которые ссылаются CI, конфигурация и документация.

## Пользовательские сценарии в браузере

Ключевые пути пользователя проверяют `tests/user-flow-*-browser.test.mjs`.
Стенд — `startPublicCardPilot` из `tests/helpers/publicCardPilot.mjs`:
настоящие Next, Express и SQLite, вместо hs-data-api — локальная фикстура.
Её ответы дополняет `externalRoutes`, например
`tests/helpers/browserMetaFixture.mjs`. Браузер из `launchUserBrowser()`
не резолвит ни один хост, кроме loopback, поэтому страница не уходит
ни в интернет, ни на прод.

Элементы ищите по роли и доступному имени, проверяйте адрес, фокус,
буфер обмена и состояние `aria-*`. Классы, `style` и внутреннее состояние
не проверяйте. Помощники для этого — в `tests/helpers/browserUserView.mjs`.
Ждите событие, а не время: `waitForSelector` и `waitForFunction`.

## Pull request

- Делайте одну законченную тему на PR.
- Объясняйте пользовательский результат, риск и способ отката.
- Добавляйте тест, воспроизводящий исправленную ошибку.
- Для UI проверяйте 320, 375, 768, 1024 и 1440 px, клавиатуру и axe.
- Для нового источника данных сохраняйте provenance, время обновления и
  устойчивый snapshot на случай отказа upstream.

Архитектура, production-релизы и дизайн-контракты описаны в
[README.md](README.md), [карте проекта](docs/architecture/ai-project-map.md),
[DEPLOYMENT.md](DEPLOYMENT.md), [STABILIZATION.md](STABILIZATION.md) и
[assets.md](assets.md).
