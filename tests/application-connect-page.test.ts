import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(
  new URL('../src/modules/applicationConnect/ApplicationConnectPage.tsx', import.meta.url),
  'utf8',
);
const styles = readFileSync(
  new URL('../src/modules/applicationConnect/applicationConnect.css', import.meta.url),
  'utf8',
);

assert.match(page, /Подключение приложения/);
assert.match(page, /Manacost Tracker/);
assert.match(page, /Разрешить подключение/);
assert.match(page, /Приложение не сможет изменять профиль/);
assert.match(page, /X-CSRF-Request/);
assert.match(page, /credentials: 'same-origin'/);
assert.match(page, /role="alert"/);
assert.doesNotMatch(page, /adminAllowed|contactTelegram|blockedAt/);

assert.match(styles, /:focus-visible/);
assert.match(styles, /min-height: 3rem/);
assert.match(styles, /@media \(max-width: 720px\)/);
assert.match(styles, /height: 3rem;\s+flex: 0 0 auto/);
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);

console.log('application connection page contract tests passed');
