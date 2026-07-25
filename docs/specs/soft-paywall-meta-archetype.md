# Spec: мягкий paywall для «Меты» и «Архетипов»

## Objective

Показать гостю реальные данные текущей меты до точки ограничения и
объяснить ценность тарифа «Алмаз» в контексте выбранной страницы.

- «Мета» показывает фильтры, карту и три ведущих архетипа текущего среза.
- Каталог архетипов остаётся доступным целиком.
- Страница архетипа показывает обложку, основные показатели и обезличенное
  превью главной сборки.
- Коды колод, все сборки, матчапы, муллиган и история доступны только при
  действующем entitlement `standard`.

## Tech Stack

React, TypeScript, Express, существующие HSGuru datasets и CSS-тема Manacost Arena.

## Commands

- Typecheck: `npm run lint`
- Route tests: `npm run test:standard-meta-routes && npm run test:constructed-archetype-routes`
- UI contract: `npx tsx tests/soft-paywall-ui-contract.test.ts`
- Browser QA: `node tests/soft-paywall-browser.test.mjs`
- Build: `npm run build`
- Security: `npm run security:semgrep`

## Project Structure

- `server/*Routes.ts` — приватные и публичные teaser API-контракты.
- `src/components/PaywallGate.tsx` — общий контекстный CTA.
- `src/features/StandardMeta.tsx` — реальный teaser меты.
- `src/features/ConstructedArchetypes.tsx` — открытый каталог и teaser детали.
- `tests/` — API, source-contract и browser-проверки.

## Code Style

```tsx
{hasFullAccess ? <FullAnalysis /> : (
  <PaywallGate
    active
    presentation="inline"
    surface="archetype"
    title="Колоды, матчапы и муллиган"
  />
)}
```

Используем существующие классы и данные, не создаём отдельную дизайн-систему
и не дублируем проверку подписки на клиенте как security boundary.

## Testing Strategy

- API-тест доказывает, что teaser доступен без подписки и не содержит
  платных полей.
- API-тест доказывает, что полный ответ по-прежнему требует entitlement.
- UI-contract фиксирует маршрутизацию teaser/full endpoint’ов.
- Browser QA проверяет desktop/mobile, overflow, focus targets, console
  и axe.

## Boundaries

- Always: сохранять серверный `accessGuard` на полном payload; исключать
  `deckCode`, `history` и `analysis` из teaser.
- Ask first: изменение тарифа, провайдера оплаты или entitlement.
- Never: считать скрытие DOM/CSS защитой платных данных или отправлять
  приватный payload гостю.

## Success Criteria

- Гость видит реальные teaser-данные вместо размытой заглушки.
- Полные endpoint’ы возвращают 403 без entitlement.
- Teaser-ответы не содержат коды колод, историю, матчапы или муллиган.
- Paywall соответствует пергаментно-бордовой теме и не создаёт
  горизонтальный overflow на 320–1440 px.

## Open Questions

Нет. Пользователь утвердил мягкий paywall и начал реализацию.
