import assert from 'node:assert/strict';
import { battlegroundHeroPatchChange, battlegroundHeroPatchEntries } from '../src/features/battlegroundHeroPatchChanges.js';

// Armor follows the direction of the number: more armor is a buff.
assert.deepEqual(battlegroundHeroPatchChange('Now has 8 armor (previously: 10).'), { text: 'Броня: 10 → 8', kind: 'nerf', minor: false });
assert.deepEqual(battlegroundHeroPatchChange('Now has 10 armor in Duos (previously: 7).'), { text: 'Броня в дуо: 7 → 10', kind: 'buff', minor: false });
assert.deepEqual(battlegroundHeroPatchChange('Now has 5 armor at lower levels (previously: none).'), { text: 'Броня на низком рейтинге: 0 → 5', kind: 'buff', minor: false });
assert.deepEqual(battlegroundHeroPatchChange('Now has no armor in Duos (previously: 4).'), { text: 'Броня в дуо: 4 → 0', kind: 'nerf', minor: false });
assert.deepEqual(battlegroundHeroPatchChange('2024-01-02: Armor tier is now 3 (previously: 2).'), { text: 'Уровень брони: 2 → 3', kind: 'buff', minor: false });
assert.equal(battlegroundHeroPatchChange('Armor tier is now none (previously: 2).').minor, true);
assert.deepEqual(battlegroundHeroPatchChange('Now has 30 health (Down from 40).'), { text: 'Здоровье: 40 → 30', kind: 'nerf', minor: false });

// Hero texts instead of card ones; the pool and the hero power by name.
assert.deepEqual(battlegroundHeroPatchChange('Added.'), { text: 'Герой добавлен', kind: 'added', minor: false });
assert.deepEqual(battlegroundHeroPatchChange('Added to the pool of available heroes in Battlegrounds.'), { text: 'Герой добавлен в пул', kind: 'added', minor: false });
assert.deepEqual(battlegroundHeroPatchChange('Returned to the hero pool.'), { text: 'Герой возвращён в пул', kind: 'added', minor: false });
assert.deepEqual(battlegroundHeroPatchChange('Removed from the pool of available heroes in Battlegrounds.'), { text: 'Герой убран из пула', kind: 'removed', minor: false });
assert.deepEqual(battlegroundHeroPatchChange('Hero Power changed from Deadeye to Lock and Load .'), { text: 'Новая сила героя: «Lock and Load» вместо «Deadeye»', kind: 'change', minor: false });
assert.deepEqual(battlegroundHeroPatchChange('Now banned in Pirate lobbies in Battlegrounds.'), { text: 'Не выпадает в лобби с пиратами', kind: 'change', minor: false });
assert.deepEqual(battlegroundHeroPatchChange('No longer banned in Naga lobbies in Battlegrounds.'), { text: 'Снова выпадает в лобби с нагами', kind: 'change', minor: false });
assert.deepEqual(battlegroundHeroPatchChange('Is now restricted to Beast lobbies in Battlegrounds.'), { text: 'Выпадает только в лобби со зверями', kind: 'change', minor: false });
assert.deepEqual(battlegroundHeroPatchChange('Is no longer restricted to Demon lobbies in Battlegrounds.'), { text: 'Выпадает не только в лобби с демонами', kind: 'change', minor: false });

// Card grammar still applies to hero power cost and text.
assert.deepEqual(battlegroundHeroPatchChange('Now costs 1 (Down from 2).'), { text: 'Стоимость: 2 → 1', kind: 'buff', minor: false });

// Raw tag diffs, art credits and English notes stay out of the main lines.
for (const line of ['bg_buddyDbfId : NULL to 12345 .', 'heroPowerDbfId : 1 to 2 .', 'Rarity is now Free (previously: no rarity).',
  'Class is now Neutral (previously: Druid).', 'Artist is now Matt Dixon (previously: no artist).', 'Shortened name is now Deathwing (previously: no name).']) {
  assert.equal(battlegroundHeroPatchChange(line).minor, true, line);
}
assert.equal(battlegroundHeroPatchChange('Dinotamer Brann’s Hero Power will now wait until you have handspace.', true).minor, true);

// Both wiki groups of one patch become one entry, newest first, with the article and the wiki links.
const entries = battlegroundHeroPatchEntries([
  { heading: 'Card changes', entries: [
    { date: '2026-09-03', patch: 'Patch 36.4.2.251332', patch_title: 'Обновление 36.4.2', patch_url: 'https://hs-manacost.ru/obnovlenie-36-4-2/', wiki_url: 'https://hearthstone.wiki.gg/wiki/Patch_36.4.2.251332',
      items: ['Now has 8 armor (previously: 10).', 'Now has 6 armor in Duos (previously: 8).'] },
    { date: '2024-04-25', patch: 'Patch 29.2.0.197000', patch_url: 'https://hearthstone.wiki.gg/wiki/Patch_29.2.0.197000', items: ['Added to the pool of available heroes in Battlegrounds.'] },
  ] },
  { heading: 'Bug fixes and other changes', entries: [
    { date: '2026-09-03', patch: 'Patch 36.4.2.251332', patch_url: 'https://hs-manacost.ru/obnovlenie-36-4-2/', wiki_url: 'https://hearthstone.wiki.gg/wiki/Patch_36.4.2.251332',
      items: ['Fixed a bug where Alexstrasza could discover a minion twice.'] },
  ] },
  'not a group',
]);
assert.equal(entries.length, 2);
assert.deepEqual(entries[0], {
  version: 'Патч 36.4.2',
  date: '2026-09-03',
  changes: [
    { text: 'Броня: 10 → 8', kind: 'nerf', minor: false },
    { text: 'Броня в дуо: 8 → 6', kind: 'nerf', minor: false },
    { text: 'Fixed a bug where Alexstrasza could discover a minion twice.', kind: 'change', minor: true },
  ],
  articleUrl: 'https://hs-manacost.ru/obnovlenie-36-4-2/',
  articleTitle: 'Обновление 36.4.2',
  wikiUrl: 'https://hearthstone.wiki.gg/wiki/Patch_36.4.2.251332',
});
assert.equal(entries[1].version, 'Патч 29.2');
assert.equal(entries[1].articleUrl, null);
assert.equal(entries[1].wikiUrl, 'https://hearthstone.wiki.gg/wiki/Patch_29.2.0.197000');
assert.deepEqual(battlegroundHeroPatchEntries(undefined), []);
