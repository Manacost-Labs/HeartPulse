import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import test from 'node:test';
import {
  isWebVitalDevice,
  isWebVitalLcpTarget,
  isWebVitalRoute,
  type LcpElementLike,
  WEB_VITAL_ROUTE_TEMPLATES,
  webVitalLcpTarget,
  webVitalRouteTemplate,
} from '../shared/webVitalsDimensions.js';

const APP_DIRECTORY = 'apps/public-web/app';

function appPageTemplates(directory = APP_DIRECTORY): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return appPageTemplates(path);
    if (entry.name !== 'page.tsx') return [];
    const route = relative(APP_DIRECTORY, directory).split(sep).filter(Boolean).join('/');
    return [route ? `/${route}/` : '/'];
  });
}

function element(tagName: string, classes: string[] = [], parentElement: LcpElementLike | null = null) {
  return { tagName, classList: classes, parentElement, textContent: 'Leeroy Jenkins secret@example.com' };
}

test('the route allowlist names every Next.js page template and nothing else', () => {
  assert.deepEqual([...WEB_VITAL_ROUTE_TEMPLATES].sort(), appPageTemplates().sort());
});

test('paths collapse to their page template, never to raw ids', () => {
  const cases: Array<[string, string]> = [
    ['/', '/'],
    ['/faq/', '/faq/'],
    ['/faq', '/faq/'],
    ['/standard/cards/', '/standard/cards/'],
    ['/standard/cards/standard/', '/standard/cards/[format]/'],
    ['/standard/cards/standard/CARD_QA_0002/', '/standard/cards/[format]/[cardId]/'],
    ['/standard/meta/wild/odd-warrior/', '/standard/meta/[format]/[archetypeSlug]/'],
    ['/heroes/57421/', '/heroes/[dbfId]/'],
    ['/id/a1b2c3d4/', '/id/[publicProfileId]/'],
    ['/archetypes/wild/', '/archetypes/wild/'],
    ['/archetypes/123/', '/archetypes/[archetypeId]/'],
    ['/library/minions/', '/library/[kind]/'],
    ['/library/archive/', '/library/archive/'],
    ['/library/archive/minions/', '/library/archive/[kind]/'],
    ['/library/minions/murloc-tidehunter-976/', '/library/[kind]/[slugAndDbfId]/'],
    ['/library/archive/minions/murloc-tidehunter-976/', '/library/archive/[kind]/[slugAndDbfId]/'],
    ['/cosmetics/card-backs/123/', '/cosmetics/[kind]/[cardId]/'],
  ];
  for (const [pathname, template] of cases) {
    assert.equal(webVitalRouteTemplate(pathname), template, pathname);
  }
});

test('unknown, nested or oversized paths report as other', () => {
  for (const pathname of [
    '/does-not-exist/',
    '/heroes/57421/extra/',
    '/standard/cards/standard/CARD_QA_0002/history/',
    '/health/next/',
    `/heroes/${'9'.repeat(600)}/`,
  ]) {
    assert.equal(webVitalRouteTemplate(pathname), 'other', pathname);
  }
});

test('the route validator accepts only templates and other', () => {
  assert.equal(isWebVitalRoute('/standard/cards/[format]/[cardId]/'), true);
  assert.equal(isWebVitalRoute('other'), true);
  for (const value of [
    '/standard/cards/standard/CARD_QA_0002/',
    '/?utm_source=telegram',
    '/faq',
    'unknown',
    '',
    42,
    null,
    ['/'],
  ]) {
    assert.equal(isWebVitalRoute(value), false, String(value));
  }
});

test('the device class is mobile or desktop', () => {
  assert.equal(isWebVitalDevice('mobile'), true);
  assert.equal(isWebVitalDevice('desktop'), true);
  for (const value of ['tablet', 'Mobile', '', undefined, 1]) assert.equal(isWebVitalDevice(value), false);
});

test('the LCP target is a tag plus one component class and never page text', () => {
  assert.equal(webVitalLcpTarget(element('H1', ['site-page-hero__title', 'text-xl'])), 'h1.site-page-hero__title');
  assert.equal(webVitalLcpTarget(element('IMG', ['deck-tile__art', 'hsrdv-card-art'])), 'img.deck-tile__art');
  assert.equal(webVitalLcpTarget(element('DIV', ['flex', 'arena-hero', 'items-center'])), 'div.arena-hero',
    'utility classes describe styling, not the component');
  assert.equal(webVitalLcpTarget(element('IMG', ['h-8', 'w-8', 'object-contain'],
    element('BUTTON', ['constructed-card-detail__visual-button']))), 'img.constructed-card-detail__visual-button',
  'an unclassed image takes the class of its nearest component');
  assert.equal(webVitalLcpTarget(element('P', [], element('DIV', [], element('DIV', [],
    element('DIV', [], element('MAIN', ['too-far-away'])))))), 'p', 'the ancestor search is bounded');
  assert.equal(webVitalLcpTarget(element('IMG', ['card-12345', 'User_Name', 'text-[#7a5a35]', 'sm:px-4'])), 'img',
    'id-like, mixed-case and arbitrary-value classes are dropped');
  assert.equal(webVitalLcpTarget(element('IMG', [`a${'b'.repeat(60)}`])), 'img', 'long classes are dropped');
  assert.equal(webVitalLcpTarget(element('CANVAS', ['game-board'])), 'other.game-board');
  assert.equal(webVitalLcpTarget(element('image', ['hero-portrait'])), 'image.hero-portrait');
  assert.equal(webVitalLcpTarget(null), 'none');
  assert.equal(webVitalLcpTarget(undefined), 'none');
});

test('every derived LCP target passes the server validator', () => {
  for (const value of [
    webVitalLcpTarget(element('H1', ['site-page-hero__title'])),
    webVitalLcpTarget(element('IMG', ['account-access__option--subscribe'])),
    webVitalLcpTarget(element('CANVAS', [])),
    webVitalLcpTarget(null),
  ]) {
    assert.equal(isWebVitalLcpTarget(value), true, value);
  }
});

test('the LCP target validator rejects free text, selectors and unknown tags', () => {
  for (const value of [
    'img.card art',
    'img#hero',
    'img.hero.title',
    'IMG',
    'script',
    'img.',
    '.hero',
    'img.card-12345',
    'img.text-sm',
    `img.${'a'.repeat(60)}`,
    'Leeroy Jenkins',
    'unknown',
    '',
    null,
    7,
  ]) {
    assert.equal(isWebVitalLcpTarget(value), false, String(value));
  }
});
