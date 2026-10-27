import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { elements, importWithoutStyles, labelled, links, visibleText } from './helpers/renderedMarkup';

const { default: SocialLoginLinks } = await importWithoutStyles<typeof import('../src/modules/identity/ui/SocialLoginLinks')>(
  new URL('../src/modules/identity/ui/SocialLoginLinks', import.meta.url));

const providers = [
  { provider: 'google', authUrl: '/api/auth/google/start' },
  { provider: 'discord', authUrl: '/api/auth/discord/start' },
  { provider: 'yandex', authUrl: '/api/auth/yandex/start' },
  { provider: 'patreon', authUrl: '/api/auth/patreon/start' },
  { provider: 'vk', authUrl: '/api/auth/vk/start' },
  { provider: 'google' },
];

const render = (props: Partial<React.ComponentProps<typeof SocialLoginLinks>>) => renderToStaticMarkup(
  React.createElement(SocialLoginLinks, { disabled: false, providers, withDivider: true, ...props }));

test('every configured provider is a named sign-in link, Telegram first', () => {
  const html = render({ telegramAuthUrl: '/api/auth/telegram/start' });
  assert.deepEqual(links(html), [
    { name: 'Войти через Telegram', href: '/api/auth/telegram/start' },
    { name: 'Войти через Google', href: '/api/auth/google/start' },
    { name: 'Войти через Discord', href: '/api/auth/discord/start' },
    { name: 'Войти через Яндекс ID', href: '/api/auth/yandex/start' },
    { name: 'Войти через Patreon', href: '/api/auth/patreon/start' },
  ]);
  assert.equal(labelled(html, 'Вход через социальные сети')?.attrs.role, 'group');
  assert.equal(visibleText(html), 'или Telegram Google Discord Яндекс ID Patreon',
    'every sign-in provider names itself next to its icon');
});

test('each provider shows its own icon', () => {
  const icons = elements(render({ telegramAuthUrl: '/api/auth/telegram/start' }))
    .filter(element => element.tag === 'img').map(element => element.attrs.src);
  assert.deepEqual(icons, ['/auth-icons/telegram.svg', '/auth-icons/google.svg', '/auth-icons/discord.svg',
    '/auth-icons/yandex.svg', '/auth-icons/patreon.svg']);
  for (const provider of ['telegram', 'google', 'discord', 'yandex', 'patreon']) {
    assert.ok(existsSync(new URL(`../public/auth-icons/${provider}.svg`, import.meta.url)), `missing ${provider} icon`);
  }
});

test('while a sign-in runs the links are announced disabled and leave the tab order', () => {
  const disabledLinks = elements(render({ disabled: true })).filter(element => element.tag === 'a');
  assert.equal(disabledLinks.length, 4);
  for (const link of disabledLinks) {
    assert.equal(link.attrs['aria-disabled'], 'true');
    assert.equal(link.attrs.tabindex, '-1');
  }
  const enabledLinks = elements(render({})).filter(element => element.tag === 'a');
  assert.ok(enabledLinks.every(link => !('aria-disabled' in link.attrs) && !('tabindex' in link.attrs)));
});

test('the divider is optional and nothing renders without providers', () => {
  assert.ok(!visibleText(render({ withDivider: false })).includes('или'));
  assert.equal(render({ providers: [] }), '');
  assert.equal(render({ providers: 'google' }), '');
});

// The login panel chooses Telegram's link from its runtime config, which
// arrives after mount; a disabled link swallows its click; the grid's two
// columns are layout. No DOM or layout engine runs here, so these stay guarded
// by their source.
test('the login panel wires its runtime config, disabled links ignore clicks, the grid keeps two columns', () => {
  const socialLoginLinks = readFileSync(new URL('../src/modules/identity/ui/SocialLoginLinks.tsx', import.meta.url), 'utf8');
  assert.match(socialLoginLinks, /onClick=\{disabled \? event => event\.preventDefault\(\) : undefined\}/);
  const loginPanel = readFileSync(new URL('../src/modules/identity/ui/LoginPanel.tsx', import.meta.url), 'utf8');
  const socialLoginStyles = readFileSync(new URL('../src/modules/identity/ui/SocialLoginLinks.css', import.meta.url), 'utf8');
  assert.match(loginPanel, /socialProviders: socialLoginProviders,[\s\S]*useTelegramAuthConfig\(\)/);
  assert.match(loginPanel, /telegramAuthUrl=\{telegramEnabled && telegramMode !== 'legacy-widget'/);
  assert.match(loginPanel, /withDivider=\{!\(telegramEnabled && telegramMode === 'legacy-widget' && telegramBotUsername\)\}/);
  assert.match(socialLoginStyles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
