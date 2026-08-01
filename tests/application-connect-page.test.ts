import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(
  new URL('../src/modules/applicationConnect/ApplicationConnectPage.tsx', import.meta.url),
  'utf8',
);
const view = readFileSync(
  new URL('../src/modules/applicationConnect/ApplicationConnectView.tsx', import.meta.url),
  'utf8',
);
const styles = readFileSync(
  new URL('../src/modules/applicationConnect/applicationConnect.css', import.meta.url),
  'utf8',
);

assert.match(view, /Подключить Manacost Tracker/);
assert.match(view, /Этапы подключения/);
assert.match(view, /Разрешить подключение/);
assert.match(view, /Приложение не сможет изменять профиль/);
assert.match(view, /Пароль не передаётся/);
assert.match(view, /aria-current/);
assert.match(page, /X-CSRF-Request/);
assert.match(page, /credentials: 'same-origin'/);
assert.match(view, /role="alert"/);
assert.doesNotMatch(`${page}\n${view}`, /adminAllowed|contactTelegram|blockedAt/);

assert.match(styles, /:focus-visible/);
assert.match(styles, /min-height: 3rem/);
assert.match(styles, /@media \(max-width: 760px\)/);
assert.match(styles, /@media \(max-width: 540px\)/);
assert.match(styles, /height: 3rem;\s+flex: 0 0 auto/);
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);

console.log('application connection page contract tests passed');
