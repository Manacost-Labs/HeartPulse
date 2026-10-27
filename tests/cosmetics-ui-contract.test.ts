import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buttons, elements, headings, importWithoutStyles, links, visibleText } from './helpers/renderedMarkup';

type CosmeticsModule = typeof import('../src/features/Cosmetics');
const { default: Cosmetics, HeroSkinCard } = await importWithoutStyles<CosmeticsModule>(
  new URL('../src/features/Cosmetics', import.meta.url));
const { RelatedCardGallery } = await importWithoutStyles<typeof import('../src/features/CosmeticsRelatedCardGallery')>(
  new URL('../src/features/CosmeticsRelatedCardGallery', import.meta.url));

const medivh = {
  cardId: 'HERO_08m', dbf: 101, name: { ru: 'Медив', en: 'Medivh' },
  class: { slug: 'mage', nameRu: 'Маг' }, rarity: { slug: 'legendary', nameRu: 'Легендарная' }, categorySlugs: ['shop'],
  health: 30, character: null, actor: null, artist: 'Арт Хоглунд', categories: [{ slug: 'shop', nameRu: 'Магазин' }],
  images: {
    static: 'https://static.example/hero.png',
    animated: 'https://static.example/hero.webm',
    fullArt: 'https://static.example/full.png',
  },
  gallery: [], sounds: [], sourceUrl: null,
};

const renderDetail = (detail: typeof medivh) => renderToStaticMarkup(React.createElement(Cosmetics, {
  currentPath: '/cosmetics/heroes/HERO_08m/', navigatePath: () => undefined, initialSearch: '', initialDetail: detail,
}));

test('a hero skin tile shows only the skin, named, and opens its page', () => {
  const html = renderToStaticMarkup(React.createElement(HeroSkinCard, { item: medivh, navigatePath: () => undefined, index: 5 }));
  assert.deepEqual(links(html), [{ name: 'Медив', href: '/cosmetics/heroes/HERO_08m/' }]);
  assert.equal(visibleText(html), 'Медив', 'no class, rarity or "animated" badge on the tile');
  assert.deepEqual(elements(html).filter(element => element.tag === 'img').map(image => image.attrs.alt), ['Скин героя «Медив»']);
  assert.ok(!elements(html).some(element => element.tag === 'video'), 'the grid never plays skin animations');
});

test('the hero page offers the animation and the full art as buttons', () => {
  const html = renderDetail(medivh);
  assert.deepEqual(buttons(html), [
    { name: 'Анимация скина', disabled: false },
    { name: 'Полный арт', disabled: false },
  ]);
  assert.deepEqual(headings(html), ['h1 Медив', 'h2 Медив', 'h2 Анимация и полный арт']);
  assert.ok(visibleText(html).includes('Маг · Легендарная'));
  assert.ok(visibleText(html).includes('Художник Арт Хоглунд'));
});

test('skin media loads straight from its public address, not through a site proxy', () => {
  const html = renderDetail(medivh);
  const fullArt = elements(html).find(element => element.tag === 'button' && element.text === 'Полный арт');
  assert.equal(fullArt?.attrs['data-lightbox-src'], 'https://static.example/full.png');
  assert.deepEqual([...new Set(elements(html).filter(element => element.tag === 'img').map(image => image.attrs.src))],
    ['https://static.example/hero.png', 'https://static.example/full.png']);
});

test('a skin without animation or full art shows no media section', () => {
  const html = renderDetail({ ...medivh, images: { static: medivh.images.static, animated: null, fullArt: null } });
  assert.deepEqual(buttons(html), []);
  assert.ok(!visibleText(html).includes('Анимация и полный арт'));
});

test('related cards stay open as a gallery; real cards link, generated tokens do not', () => {
  const html = renderToStaticMarkup(React.createElement(RelatedCardGallery, { title: 'Связанные карты', items: [
    { cardId: 'CORE_EX1_001', dbf: 1, name: { ru: 'Страж света', en: 'Lightwarden' } },
    { cardId: 'DAL_366t3', dbf: 2, name: { ru: 'Жетон', en: 'Token' } },
  ] }));
  assert.deepEqual(headings(html), ['h3 Связанные карты']);
  assert.deepEqual(links(html), [{ name: 'Страж света CORE_EX1_001', href: '/standard/cards/wild/CORE_EX1_001/' }]);
  assert.ok(visibleText(html).includes('Жетон DAL_366t3'), 'a token is still shown, just not linked');
  assert.deepEqual(elements(html).filter(element => element.tag === 'img').map(image => image.attrs.src), [
    '/api/card-image/CORE_EX1_001/full.webp?v=cosmetics-20260726',
    '/api/card-image/DAL_366t3/full.webp?v=cosmetics-20260726',
  ]);
  assert.ok(!elements(html).some(element => element.tag === 'details'), 'the gallery is never collapsed');
  assert.equal(renderToStaticMarkup(React.createElement(RelatedCardGallery, { title: 'Пусто', items: [] })), '');
});

// The lightbox opens in a portal after a click; the tile's frameless look, the
// full-screen lightbox and the gallery grid are layout; the page surface is
// chosen by the Next page shell. No DOM or layout engine runs here, so these
// stay guarded by their source.
test('cosmetics keep their direct-media lightbox, frameless tiles and game-data surface', () => {
  const component = readFileSync(new URL('../src/features/Cosmetics.tsx', import.meta.url), 'utf8');
  assert.match(component, /<video\s+src=\{cosmeticMediaSource\(media\.src\)\}/);
  assert.match(component, /<LightboxImage src=\{cosmeticMediaSource\(media\.src\)\} alt=\{media\.title\} \/>/);
  assert.match(component, /aria-label="Закрыть просмотр"/);
  assert.doesNotMatch(component, /\/api\/cosmetics\/media\?url=/);
  const styles = readFileSync(new URL('../src/features/Cosmetics.css', import.meta.url), 'utf8');
  const pageClient = readFileSync(new URL('../apps/public-web/ui/CosmeticsPageClient.tsx', import.meta.url), 'utf8');
  const pageShell = readFileSync(new URL('../src/app/shell/PublicPageShell.tsx', import.meta.url), 'utf8');
  const cardStyles = styles.match(/\.cosmetics-card \{[\s\S]*?\n}\n\n\.cosmetics-card:hover/)?.[0] ?? '';
  assert.match(cardStyles, /border:\s*0/);
  assert.match(cardStyles, /background:\s*transparent/);
  assert.match(cardStyles, /box-shadow:\s*none/);
  const hoverStyles = styles.match(/\.cosmetics-card:hover,[\s\S]*?\n}\n/)?.[0] ?? '';
  assert.doesNotMatch(hoverStyles, /transform:/);
  assert.match(hoverStyles, /--cosmetics-tile-accent:\s*var\(--cosmetics-gold-bright\)/);
  assert.match(styles, /\.cosmetics-media-lightbox__backdrop\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;/,
    'the lightbox backdrop must cover the complete viewport');
  assert.match(styles, /\.cosmetics-media-lightbox__panel\s*\{[\s\S]*?height:\s*min\(/,
    'the lightbox panel must reserve viewport height instead of shrinking to intrinsic media size');
  assert.match(styles, /\.cosmetics-related-gallery\s*\{[\s\S]*?grid-template-columns:/);
  assert.match(pageClient, /<PublicPageShell activeTab="cosmetics"(?![^>]*\beditorial\b)[^>]*>/,
    'cosmetics must use the parchment game-data shell, not the editorial one');
  assert.match(pageShell, /editorial \? 'editorial' : BG_TAB_IDS\.has\(activeTab\) \? 'battlegrounds' : 'game-data'/,
    'pages that are neither editorial nor Battlegrounds get the game-data surface');
});
