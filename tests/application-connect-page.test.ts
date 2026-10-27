import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buttons, elements, headings, importWithoutStyles, labelled, roles, visibleText } from './helpers/renderedMarkup';

type ViewModule = typeof import('../src/modules/applicationConnect/ApplicationConnectView');
type ViewProps = import('../src/modules/applicationConnect/ApplicationConnectView').ApplicationConnectViewProps;
const { ApplicationConnectView } = await importWithoutStyles<ViewModule>(
  new URL('../src/modules/applicationConnect/ApplicationConnectView', import.meta.url));

const user = {
  email: 'reader@example.test', name: 'Читатель', role: 'user', avatarInitials: 'ЧТ',
  adminAllowed: true, contactTelegram: '@secret_contact', blockedAt: '2026-01-01T00:00:00.000Z',
};
const authorization = {
  clientId: 'manacost-tracker', clientName: 'Manacost Tracker',
  scopes: ['profile.read', 'statistics.read', 'future.scope'], expiresAt: 1_800_000_000_000,
};

const render = (props: Partial<ViewProps>) => renderToStaticMarkup(React.createElement(ApplicationConnectView, {
  state: 'entry', userCode: '', user: null, authorization: null, errorMessage: '',
  onCodeChange: () => undefined, onInspect: () => undefined, onApprove: () => undefined, onDeny: () => undefined,
  ...props,
} as ViewProps));

/** The connection steps as a reader follows them, the current one marked. */
const steps = (html: string) => elements(html).filter(element => element.tag === 'li' && element.text.match(/Код устройства|Проверка доступа|Готово/))
  .map(step => `${step.text}${step.attrs['aria-current'] === 'step' ? ' (текущий)' : ''}`);

test('a visitor enters the device code first; the check waits for a full code', () => {
  const html = render({ userCode: 'ABCD' });
  assert.ok(visibleText(html).includes('Подключить Manacost Tracker'));
  assert.equal(labelled(html, 'Этапы подключения')?.tag, 'nav');
  assert.deepEqual(steps(html), ['1 Код устройства (текущий)', '2 Проверка доступа', '3 Готово']);
  assert.deepEqual(labelled(html, 'Гарантии безопасности')?.text, 'Пароль не передаётся Доступ можно отозвать');
  assert.deepEqual(buttons(html), [{ name: 'Проверить код', disabled: true }]);
  assert.deepEqual(buttons(render({ userCode: 'ABCD-2345' })), [{ name: 'Проверить код', disabled: false }]);
  assert.deepEqual(buttons(render({ state: 'loading', userCode: 'ABCD-2345' })), [{ name: 'Проверяем…', disabled: true }]);
});

test('a rejected code is announced as an alert next to the field', () => {
  const html = render({ state: 'error', userCode: 'ABCD-2345', errorMessage: 'Код не найден, уже использован или истёк.' });
  assert.deepEqual(roles(html), ['alert: Не удалось продолжить Код не найден, уже использован или истёк.']);
  const input = elements(html).find(element => element.tag === 'input');
  assert.equal(input?.attrs['aria-describedby'], 'application-connect-error');
});

test('the review names the app, the account and read-only permissions before approval', () => {
  const html = render({ state: 'review', userCode: 'ABCD-2345', user, authorization });
  assert.deepEqual(steps(html), ['✓ Код устройства', '2 Проверка доступа (текущий)', '3 Готово']);
  assert.deepEqual(headings(html).filter(heading => !heading.startsWith('h1')), [
    'h2 Введите код из приложения',
    'h2 Manacost Tracker',
    'h3 Ваш аккаунт',
    'h3 Разрешения только на чтение',
  ]);
  const text = visibleText(html);
  assert.ok(text.includes('ЧТ Читатель reader@example.test'));
  assert.ok(text.includes('✓ Имя, e-mail и публичный ID профиля ✓ Статистика карт и история показателей ✓ future.scope'));
  assert.ok(text.includes('Приложение не сможет изменять профиль, подписку или данные сайта.'));
  assert.ok(text.includes('Код действует до'));
  assert.deepEqual(buttons(html).slice(1), [
    { name: 'Отклонить', disabled: false },
    { name: 'Разрешить подключение', disabled: false },
  ]);
});

test('the review never shows staff flags or private contacts of the account', () => {
  const text = visibleText(render({ state: 'review', userCode: 'ABCD-2345', user, authorization }));
  assert.ok(!text.includes('@secret_contact'));
  assert.ok(!text.includes('2026-01-01'));
  assert.ok(!/админ|administrator/i.test(text));
});

test('while the decision is saved both choices are locked', () => {
  const html = render({ state: 'submitting', userCode: 'ABCD-2345', user, authorization });
  assert.deepEqual(buttons(html).slice(1), [
    { name: 'Отклонить', disabled: true },
    { name: 'Подключаем…', disabled: true },
  ]);
});

test('the result tells the visitor what happened and that no password was shared', () => {
  const approved = render({ state: 'approved', userCode: 'ABCD-2345', user, authorization });
  assert.deepEqual(steps(approved), ['✓ Код устройства', '✓ Проверка доступа', '3 Готово (текущий)']);
  assert.ok(visibleText(approved).includes('Подключение подтверждено Manacost Tracker подключён'));
  assert.ok(visibleText(approved).includes('Пароль и данные входа не передавались'));
  assert.deepEqual(buttons(approved), []);
  const denied = render({ state: 'denied', userCode: 'ABCD-2345', user, authorization });
  assert.ok(visibleText(denied).includes('Запрос отклонён Доступ не предоставлен'));
});

test('a signed-out visitor is asked to sign in before the code', () => {
  const html = render({ loginPanel: React.createElement('form', { 'aria-label': 'Вход' }) });
  assert.ok(headings(html).includes('h2 Войдите в аккаунт Manacost'));
  assert.equal(labelled(html, 'Вход')?.tag, 'form');
  assert.ok(!elements(html).some(element => element.tag === 'input'), 'no code field until the visitor signs in');
});

// The page's requests (CSRF header, same-origin credentials) are covered by
// tests/application-connect-api.test.ts. Focus rings, touch-size controls and
// breakpoints are layout, and the rest are dependency contracts of the account
// surfaces; no layout engine or bundler runs here, so they stay guarded by
// their source.
test('application connect keeps its layout and dependency contracts', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const page = read('../src/modules/applicationConnect/ApplicationConnectPage.tsx');
  const styles = read('../src/modules/applicationConnect/applicationConnect.css');
  const accountRoute = read('../src/modules/accountRoute/AccountRoute.tsx');
  const identityPublicEntry = read('../src/modules/identity/public.ts');
  const deferredRoutes = read('../src/features/DeferredRoutes.tsx');
  const accessSource = read('../apps/public-web/ui/usePublicAccess.ts');

  assert.match(styles, /:focus-visible/);
  assert.match(styles, /min-height: 3rem/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /@media \(max-width: 540px\)/);
  assert.match(styles, /height: 3rem;\s+flex: 0 0 auto/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);

  assert.doesNotMatch(page, /\bfetch\s*\(/, 'the page talks to the server only through its API client');
  assert.match(accountRoute, /loginPanelComponent=\{LazyLoginPanel\}/);
  assert.match(page, /\.\.\/identity\/public/,
    'Application Connect must consume the identity module public contract');
  assert.match(accountRoute, /\.\.\/identity\/public/,
    'the account route must consume the identity module public contract');
  assert.doesNotMatch(`${page}\n${accountRoute}`, /features\/DeferredRoutes/,
    'account surfaces must not reach back into the legacy deferred-route bundle');
  assert.match(identityPublicEntry, /loadLoginPanel[\s\S]*?import\('\.\/ui\/LoginPanel'\)/,
    'the identity module public contract must expose a lazy login-panel loader');
  assert.match(identityPublicEntry, /loadPublicProfileCard[\s\S]*?import\('\.\/ui\/PublicProfileCard'\)/,
    'the identity module public contract must expose a lazy public-profile card loader');
  assert.doesNotMatch(identityPublicEntry, /export\s+\{[^}]*\bPublicProfileCard\b/,
    'the public-profile card must remain behind its route-level lazy boundary');
  assert.doesNotMatch(identityPublicEntry, /export\s+\{\s*LoginPanel\s*\}/,
    'the large login panel must not become an eager identity public export');
  assert.doesNotMatch(deferredRoutes, /export function LoginPanel\s*\(/,
    'the legacy deferred-route bundle must not own the account login panel');
  for (const [label, source] of [['usePublicAccess', accessSource], ['DeferredRoutes', deferredRoutes]] as const) {
    assert.doesNotMatch(source, /type AuthUser\s*=/, `${label} must consume the canonical identity user contract`);
    assert.match(source, /modules\/identity\/public/, `${label} must reach identity through its public entry`);
  }
});
