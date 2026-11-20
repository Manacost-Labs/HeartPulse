import assert from 'node:assert/strict';
import { compactTierlistClass, openTierlistView } from '../apps/public-web/lib/openTierlistView.js';
import { TIERLIST_CLASS_SLUGS, tierlistClassIdFromSlug, tierlistClassPath } from '../apps/public-web/lib/tierlistClassPages.js';
import type { PublicTierlist } from '../apps/public-web/lib/publicTierlistData.js';

// The class pages of the Arena tier list (#617): every class of the open pool and the neutral cards have a page,
// the class choice links to it, and a class page carries the cards of its class only (the others stay named).

const card = (cardId: string, tier: string) => ({ cardId, name: `Карта ${cardId}`, tier, cost: 3, rarity: 'rare', type: 'minion',
  winrate: 55.5, pickRate: 40.1 });
const pool: PublicTierlist = {
  updatedAt: '2026-11-20T06:00:08.242Z', source: 'hsreplay.net', sampleGamesAtLeast: 53_000,
  classes: [
    { id: 'mage', name: 'Маг', cards: [card('M1', 'S'), card('M2', 'B')] },
    { id: 'warrior', name: 'Воин', cards: [card('W1', 'A')] },
    { id: 'any', name: 'Нейтральные', cards: [card('N1', 'C')] },
  ],
};

assert.equal(tierlistClassPath('__all__'), '/tierlist/', '«Все карты» is the tier list itself');
assert.equal(tierlistClassPath('death-knight'), '/tierlist/death-knight/');
assert.equal(tierlistClassPath('any'), '/tierlist/neutral/', 'the neutral cards have a page of their own');
for (const slug of TIERLIST_CLASS_SLUGS) {
  const id = tierlistClassIdFromSlug(slug);
  assert.ok(id, `${slug} is a class page`);
  assert.equal(tierlistClassPath(id!), `/tierlist/${slug}/`, `${slug} round-trips`);
}
for (const odd of ['any', '__all__', 'Mage', 'mage/', '', 'neutrals']) assert.equal(tierlistClassIdFromSlug(odd), null, `«${odd}» is no page`);

const mage = openTierlistView(compactTierlistClass(pool, 'mage'));
assert.deepEqual(mage.sections.map(section => section.id), ['mage', 'warrior', 'any'], 'every class is still named');
assert.deepEqual(mage.sections.map(section => section.totalCards), [2, 0, 0], 'only the page\'s class carries its cards');
assert.deepEqual(Object.keys(mage.cards).sort(), ['M1', 'M2']);
const neutral = openTierlistView(compactTierlistClass(pool, 'any'));
assert.deepEqual(neutral.sections.map(section => section.totalCards), [0, 0, 1]);
