import assert from 'node:assert/strict';
import { pickDownloads, APP_RELEASES_URL } from '../apps/public-web/lib/appDownloads';
import { deckEmbedBody, deckTitle, manaCurve, replayEmbedBody } from '../apps/public-web/lib/embedBodies';
import { embedDocument, embedMessage, embedResponse, escapeHtml } from '../apps/public-web/lib/embedDocument';
import { oembedIframe, oembedSize, oembedTarget } from '../apps/public-web/lib/oembed';
import { normalizeDeckCode, readDeck, type PublicDeck } from '../apps/public-web/lib/publicDeckData';
import type { PublicReplay } from '../apps/public-web/lib/publicReplay';
import { readYearReview } from '../apps/public-web/lib/publicYearReviewData';
import { replayShareText, replayUrls } from '../apps/public-web/lib/replayShare';

// ---- link previews: text built only from the sanitized summary --------------------------------------------------

const constructed: PublicReplay = {
  id: 'abcDEF1234', kind: 'constructed', createdAt: '2026-11-06T10:00:00.000Z',
  summary: { mode: 'Рейтинговая игра', result: 'Победа', turns: 9, placement: 0, heroName: 'Джайна', opponentHeroName: 'Гаррош',
    opponentArchetype: 'Zoolock', finalBoard: [], heroCardId: 'HERO_08', opponentHeroCardId: 'HERO_01', resultKey: 'Win', deckCode: '' },
  turns: [],
};
const battlegrounds: PublicReplay = {
  ...constructed, kind: 'battlegrounds',
  summary: { ...constructed.summary, mode: 'Поля сражений', result: '', placement: 2, heroName: 'Рено', opponentHeroName: '', opponentArchetype: '',
    finalBoard: [{ cardId: 'BG_1', name: 'Мурлок <b>', attack: 3, health: 4, golden: false }], heroCardId: 'TB_BaconShop_HERO_41', resultKey: 'Win' },
};

assert.deepEqual(replayShareText(constructed), {
  title: 'Победа: Джайна против Гаррош',
  description: 'Рейтинговая игра · 9 ход. · соперник: Zoolock. Реплей из приложения Hearthpulse.',
});
assert.equal(replayShareText(battlegrounds).title, '2-е место: Рено');
assert.match(replayShareText(battlegrounds).description, /итоговый стол: Мурлок <b>/);
assert.deepEqual(replayUrls('abcDEF1234'), {
  page: 'https://hearthpulse.net/replay/abcDEF1234/',
  image: 'https://hearthpulse.net/og/replay/abcDEF1234/',
  embed: 'https://hearthpulse.net/embed/replay/abcDEF1234/',
});

// ---- embeds: escaped, frameable anywhere, nothing but their own origin loads ------------------------------------

assert.equal(escapeHtml(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
const replayBody = replayEmbedBody(battlegrounds);
assert.ok(replayBody.includes('Мурлок &lt;b&gt; 3/4'), 'board names are escaped');
assert.ok(!replayBody.includes('<b>'), 'no raw markup from card names');
assert.match(replayBody, /href="https:\/\/hearthpulse\.net\/replay\/abcDEF1234\/"/, 'the embed links its replay page');
assert.ok(replayEmbedBody(constructed).includes('hp-badge win'));

const page = embedResponse(embedDocument({ title: 'T', body: '<p>x</p>', back: 'https://hearthpulse.net/', script: true }), 200, 'no-cache');
const csp = page.headers.get('content-security-policy') ?? '';
assert.match(csp, /frame-ancestors \*/);
assert.match(csp, /default-src 'none'/);
assert.match(csp, /script-src 'sha256-[A-Za-z0-9+/=]+'/, 'only the copy script runs');
assert.equal(page.headers.get('x-frame-options'), null, 'the embed sends no SAMEORIGIN of its own');
assert.equal(page.headers.get('x-robots-tag'), 'noindex');
const html = await page.text();
assert.ok(html.includes('Сделано в Hearthpulse'));
assert.match(html, /href="https:\/\/hearthpulse\.net\/download\/"/, 'the footer links the download landing');
assert.equal(embedMessage('нет', 404).status, 404);

// ---- deck embed --------------------------------------------------------------------------------------------------

assert.equal(normalizeDeckCode('AAECAZ8F BBB/ccc=='), 'AAECAZ8F+BBB/ccc==', 'a + sent as a space is restored');
assert.equal(normalizeDeckCode('<script>'), null);
const resolved = readDeck({
  ok: true, format: 'standard', heroDbfId: 637, deckCode: 'AAECAf0EAA==', totalCards: 3,
  archetype: { archetypeLabel: 'Маг на секретах' },
  cards: [
    { id: 'CS2_029', name: 'Огненный шар', cost: 4, rarity: 'FREE', count: 2 },
    { id: 'EX1_559', name: 'Антонидас', cost: 7, rarity: 'LEGENDARY', count: 1 },
    { name: 'no id' },
  ],
}) as PublicDeck;
assert.equal(resolved.cards.length, 2);
assert.equal(deckTitle(resolved), 'Маг на секретах · Стандартный');
assert.equal(deckTitle({ ...resolved, archetype: null }), 'Колода: Маг · Стандартный');
assert.equal(deckTitle({ ...resolved, archetype: null, heroDbfId: 123, format: 'wild' }), 'Колода Hearthstone · Вольный');
assert.deepEqual(manaCurve(resolved), [0, 0, 0, 0, 2, 0, 0, 1]);
const deckBody = deckEmbedBody(resolved);
assert.ok(deckBody.includes('data-copy="AAECAf0EAA=="'));
assert.ok(deckBody.includes('Скопировать код'));
assert.ok(deckBody.indexOf('Огненный шар') < deckBody.indexOf('Антонидас'), 'cards by cost');
assert.equal(readDeck({ ok: false }), null);

// ---- oEmbed ------------------------------------------------------------------------------------------------------

assert.deepEqual(oembedTarget('https://hearthpulse.net/replay/abcDEF1234/'), { kind: 'replay', id: 'abcDEF1234' });
assert.deepEqual(oembedTarget('https://hearthpulse.net/embed/replay/abcDEF1234'), { kind: 'replay', id: 'abcDEF1234' });
assert.deepEqual(oembedTarget('https://hearthpulse.net/embed/deck/AAECAf0E%2BAA%3D%3D/'), { kind: 'deck', code: 'AAECAf0E+AA==' });
assert.equal(oembedTarget('http://hearthpulse.net/replay/abcDEF1234/'), null, 'https only');
assert.equal(oembedTarget('https://evil.example/replay/abcDEF1234/'), null);
assert.equal(oembedTarget('https://hearthpulse.net/tierlist/'), null);
assert.equal(oembedTarget(null), null);
assert.deepEqual(oembedSize('replay', null, null), { width: 600, height: 360 });
assert.deepEqual(oembedSize('deck', 300, 400), { width: 300, height: 400 });
assert.deepEqual(oembedSize('replay', 100, 9999), { width: 280, height: 360 });
assert.equal(oembedIframe('https://hearthpulse.net/embed/replay/x/', 'A "b" <c>', 600, 360),
  '<iframe src="https://hearthpulse.net/embed/replay/x/" title="A &quot;b&quot; &lt;c>" width="600" height="360" loading="lazy" '
  + 'style="border:0;border-radius:10px;max-width:100%" referrerpolicy="strict-origin-when-cross-origin"></iframe>');

// ---- download landing ---------------------------------------------------------------------------------------------

const release = pickDownloads({
  tag_name: 'v0.14.0',
  assets: [
    { name: 'Hearthpulse-Setup-0.14.0-win-x64.exe', browser_download_url: 'https://github.com/Zulut30/Hearthpulse_App/releases/download/v0.14.0/Hearthpulse-Setup-0.14.0-win-x64.exe' },
    { name: 'Hearthpulse-0.14.0-macOS-arm64.dmg', browser_download_url: 'https://github.com/Zulut30/Hearthpulse_App/releases/download/v0.14.0/Hearthpulse-0.14.0-macOS-arm64.dmg' },
    { name: 'Hearthpulse-0.14.0-linux-x64.AppImage', browser_download_url: 'https://evil.example/x.AppImage' },
    { name: 'Hearthpulse-Portable-0.14.0-win-x64.zip', browser_download_url: 'https://github.com/Zulut30/Hearthpulse_App/releases/download/v0.14.0/p.zip' },
  ],
});
assert.equal(release.version, '0.14.0');
assert.deepEqual(release.downloads.map(item => item.platform), ['windows', 'mac-arm'], 'only release assets of the app repository');
assert.deepEqual(pickDownloads(null), { version: null, downloads: [] });
assert.match(APP_RELEASES_URL, /^https:\/\/github\.com\/Zulut30\/Hearthpulse_App\/releases\/latest$/);

// ---- year in review projection --------------------------------------------------------------------------------------

const review = readYearReview({
  year: 2026, games: 120, hours: 40.5, modes: { battlegrounds: 50, standard: 60, wild: 0, arena: 10 }, wins: 40, winRate: 0.571,
  bestStreak: 7, bestMonth: { month: 11, games: 30 }, favouriteClass: { playerClass: 'MAGE', games: 30 },
  favouriteDeck: { name: null, archetype: null, playerClass: 'MAGE', deckCode: 'AAECAf0EAA==', games: 20, wins: 12, battleTag: 'Zulut#2' },
  topCards: [{ dbfId: 1, cardId: 'CS2_029', name: 'Огненный шар', games: 20 }, { dbfId: 2, cardId: null, name: null, games: 3 }],
  battlegrounds: { games: 50, favouriteHero: { cardId: 'TB_BaconShop_HERO_41', name: 'Рено', games: 12 }, top4Rate: 0.62, averagePlacement: 3.9, bestRating: 7000 },
  playerName: 'Zulut',
});
assert.ok(review);
assert.equal(review.favouriteClass?.label, 'Маг');
assert.equal(review.favouriteDeck?.title, 'Колода: Маг');
assert.equal(review.topCards.length, 1, 'cards without a resolved name are left out');
assert.equal(JSON.stringify(review).includes('Zulut'), false, 'fields outside the contract never render');
assert.equal(readYearReview({ games: 1 }), null);

console.log('growth share and embeds: ok');
