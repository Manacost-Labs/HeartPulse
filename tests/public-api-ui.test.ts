import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { elements, headings, importWithoutStyles, labelled, links, visibleText } from './helpers/renderedMarkup';

const { DeveloperApiPage } = await importWithoutStyles<typeof import('../src/modules/developerApi/ui/DeveloperApiPage')>(
  new URL('../src/modules/developerApi/ui/DeveloperApiPage', import.meta.url));
const { AdminApiKeys } = await importWithoutStyles<typeof import('../src/modules/developerApi/ui/AdminApiKeys')>(
  new URL('../src/modules/developerApi/ui/AdminApiKeys', import.meta.url));
const { default: SiteFooter } = await importWithoutStyles<typeof import('../src/components/SiteFooter')>(
  new URL('../src/components/SiteFooter', import.meta.url));

/** The endpoint table as a reader scans it: "METHOD path" per row. */
function endpointRows(html: string): string[] {
  const rendered = elements(html);
  return rendered.flatMap((element, index) => element.tag === 'span' && /^(GET|POST)$/.test(element.text)
    && rendered[index + 1]?.tag === 'code' ? [`${element.text} ${rendered[index + 1].text}`] : []);
}

test('the developer page documents every public endpoint with its method', () => {
  const html = renderToStaticMarkup(React.createElement(DeveloperApiPage));
  assert.deepEqual(endpointRows(html), [
    'GET /api/v1/catalog/manifest',
    'GET /api/v1/cards',
    'GET /api/v1/cards/{cardId}',
    'GET /api/v1/card-statistics',
    'GET /api/v1/cards/{cardId}/statistics',
    'GET /api/v1/cards/{cardId}/statistics/history',
    'GET /api/v1/meta-statistics',
    'GET /api/v1/archetypes/{slug}/statistics',
    'GET /api/v1/archetypes/{slug}/statistics/history',
    'GET /api/v1/archetypes/{slug}/analysis',
    'GET /api/v1/deck-statistics',
    'GET /api/v1/decks/{deckId}/statistics',
    'GET /api/v1/arena/statistics/classes',
    'GET /api/v1/arena/statistics/cards',
    'GET /api/v1/arena/statistics/legendaries',
    'GET /api/v1/arena/statistics/matchups',
    'GET /api/v1/battlegrounds/statistics/heroes',
    'GET /api/v1/battlegrounds/statistics/heroes/{heroId}',
    'GET /api/v1/battlegrounds/statistics/minions',
    'GET /api/v1/battlegrounds/statistics/minions/{dbfId}/history',
    'GET /api/v1/battlegrounds/statistics/spells',
    'GET /api/v1/battlegrounds/statistics/tier-lists/{kind}',
    'GET /api/v1/cards/{cardId}/images/{variant}.webp',
    'POST /api/v1/oauth/device/code',
    'POST /api/v1/oauth/token',
    'GET /api/v1/me',
    'GET /api/v1/openapi.json',
  ]);
  assert.deepEqual(links(html), [{ name: 'Открыть OpenAPI JSON', href: '/api/v1/openapi.json' }]);
});

test('the developer page explains keys, device sign-in and what is available', () => {
  const html = renderToStaticMarkup(React.createElement(DeveloperApiPage));
  const text = visibleText(html);
  assert.ok(text.includes('Manacost Public API'));
  assert.deepEqual(headings(html).filter(heading => heading.startsWith('h2 ')), [
    'h2 Доступно сейчас',
    'h2 Планируется',
    'h2 Сервисный API-ключ',
    'h2 Вход пользователя в трекере',
    'h2 Точки входа',
    'h2 Ошибки и совместимость',
  ]);
  assert.ok(text.includes('Передавайте выданный администратором ключ в заголовке X-API-Key'));
  assert.ok(text.includes('Данные карты, связанные токены и пулы генерации'));
  assert.ok(text.includes('Показатели сборок, коды колод и канонические ссылки'));
  assert.ok(text.includes('Access token действует 15 минут'));
  assert.ok(text.includes('Refresh token храните в системном хранилище учётных данных'));
});

test('both terminal examples are labelled scroll regions a keyboard can reach', () => {
  const html = renderToStaticMarkup(React.createElement(DeveloperApiPage));
  const curl = labelled(html, 'Пример запроса cURL');
  const device = labelled(html, 'Запуск авторизации приложения');
  assert.equal(curl?.attrs.tabindex, '0');
  assert.equal(device?.attrs.tabindex, '0');
  assert.ok(curl?.text.includes('-H "X-API-Key: mca_live_••••••••"'));
  assert.ok(device?.text.includes('curl -X POST https://hearthpulse.net/api/v1/oauth/device/code'));
});

test('the footer links visitors to the developer documentation', () => {
  const html = renderToStaticMarkup(React.createElement(SiteFooter));
  assert.deepEqual(headings(html), ['h2 Разделы', 'h2 Сообщество', 'h2 Разработчикам']);
  const footerLinks = links(html);
  assert.ok(footerLinks.some(link => link.name === 'API для разработчиков' && link.href === '/developers/api/'));
  assert.ok(footerLinks.some(link => link.name === 'OpenAPI JSON' && link.href === '/api/v1/openapi.json'));
});

test('the admin key screen warns the secret is shown once and offers every scope', () => {
  const html = renderToStaticMarkup(React.createElement(AdminApiKeys, { client: {
    list: async () => [], create: async () => { throw new Error('not called during render'); }, revoke: async () => undefined,
  } }));
  const text = visibleText(html);
  assert.ok(text.includes('Секрет повторно не показывается'));
  const checkboxes = elements(html).filter(element => element.tag === 'input' && element.attrs.type === 'checkbox');
  assert.equal(checkboxes.length, 3);
  assert.ok(checkboxes.every(checkbox => 'checked' in checkbox.attrs), 'a new key starts with every scope selected');
  const scopes = elements(html).filter(element => element.tag === 'code').map(element => element.text);
  assert.deepEqual(scopes, ['catalog.read', 'images.read', 'statistics.read']);
  assert.deepEqual(links(html), [{ name: 'Документация API', href: '/developers/api/' }]);
  assert.ok(text.includes('Загружаем ключи…'));
});

// Copying, closing and revoking happen after clicks. This suite has no DOM to
// click in, so these interactions stay guarded by their source until a browser
// scenario covers the admin key screen.
test('the admin key screen copies, hides and revokes through the browser', () => {
  const admin = readFileSync(new URL('../src/modules/developerApi/ui/AdminApiKeys.tsx', import.meta.url), 'utf8');
  assert.match(admin, /navigator\.clipboard\.writeText/);
  assert.match(admin, /window\.confirm/);
  assert.match(admin, /setCreated\(null\)/);
});
