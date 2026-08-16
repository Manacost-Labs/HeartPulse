---
name: verify-gate
description: Использовать перед каждым коммитом и при выборе, какие проверки запускать. В проекте около 176 npm-скриптов; этот скилл говорит, что запускать в каком объёме и как читать типовые падения.
---

# Проверки: три уровня

## Быстрый (перед каждым коммитом)

```bash
npm run lint && npm run lint:architecture
```

`lint` — это `tsc --noEmit`, а не линтер стиля. `lint:architecture` — четыре
скрипта: дубликаты компонентов, CSS-архитектура, мёртвый код в точках входа,
бюджеты размера модулей.

## Доменный (после правки домена)

Запусти тесты только затронутого домена, например `npm run test:constructed-card-routes`.
Список сгруппирован по префиксам `test:*` в `package.json`. Ищи по имени домена:

```bash
node -e "const s=require('./package.json').scripts;for(const k of Object.keys(s))if(k.startsWith('test:')&&k.includes('battleground'))console.log(k)"
```

## Полный (перед завершением фазы и перед PR)

```bash
npm run verify:ci
```

Это длинная цепочка: lint → architecture → react-doctor → storybook + build-storybook →
security-tooling → property → sentry → knip → react-changed → `npm test` → build →
server-build → recovery-runtime → budget → browser-qa-ci → lint:docs.

## Типовые падения

- `[module-size] over` — файл вырос выше ratchet-бюджета в
  `scripts/check-module-size-budgets.mjs`. **Не поднимай порог, режь файл.**
  Опускать порог можно и нужно по факту сокращения.
- `[css-architecture] !important declarations: N / 1188` — превышен лимит.
  Переписывай через специфичность или токены, лимит не поднимай.
- `check-component-duplicates` — дубль компонента; вынеси общий в `src/shared/ui/`
  (сегодня переиспользуемые примитивы ещё лежат в `src/components/`).
- `check-entry-dead-code` — недостижимый код в точке входа.
- `knip` — неиспользуемый экспорт или зависимость. Удаляй причину, а не добавляй
  в `ignore` в `knip.json`.
- Падение contract-теста (`tests/*contract*.test.*`) — ты изменил публичный
  контракт. Откатывайся, тест не трогай. См. скилл `api-contract-change`.

## По типу изменения

`AGENTS.md` требует дополнительно, в зависимости от того, что тронуто:

```bash
npm run security:semgrep      # авторский JS/TS
npm run lint:react-changed    # React
npm run test:storybook        # story или визуальное состояние компонента
npm run qa:screens            # CSS и вёрстка
npm run test:agent-tooling    # правка MCP-интеграций или контракта скиллов
npm run security:gitleaks     # перед публикацией security-чувствительных правок
```

Для browser-facing изменений текстового ревью недостаточно: нужен реальный
просмотр через Chrome DevTools MCP.

## Правило

Красный `verify:ci` не коммитится и не пушится. Никогда не «чини» его
ослаблением проверки, поднятием бюджета или правкой теста.
