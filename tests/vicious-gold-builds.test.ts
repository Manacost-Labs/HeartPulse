import assert from 'node:assert/strict';
import {
  findSupplementalViciousGoldBuild,
  findViciousGoldCatalogItem,
  resolveViciousGoldArchetype,
} from '../server/viciousGoldBuilds.js';

const build = findSupplementalViciousGoldBuild('  Soothsayer   Priest ');
assert.ok(build, 'Soothsayer Priest must have its exact official list');
assert.equal(build.matchedArchetype, 'Prepared Soothsayer Priest');
assert.equal(build.source, 'vicious_syndicate_decks');
assert.equal(build.sourceUrl, 'https://www.vicioussyndicate.com/decks/prepared-soothsayer-priest/');
assert.match(build.deckCode, /^[A-Za-z0-9+/=]{40,}$/);

const bloodWarrior = findSupplementalViciousGoldBuild('Blood Warrior');
assert.ok(bloodWarrior, 'Blood Warrior must have the exact current dashboard list');
assert.equal(bloodWarrior.matchedArchetype, 'Blood Warrior');
assert.equal(bloodWarrior.source, 'hsguru_decks');
assert.match(bloodWarrior.deckCode, /^[A-Za-z0-9+/=]{40,}$/);

assert.equal(
  findSupplementalViciousGoldBuild('Control Priest'),
  null,
  'an unrelated Priest list must never be used as a same-class fallback',
);
assert.equal(findSupplementalViciousGoldBuild('Unknown Priest'), null);

assert.deepEqual(resolveViciousGoldArchetype('Two Rogue'), {
  matchedArchetype: 'Two-Bit Rogue',
  matchMethod: 'alias',
});
assert.deepEqual(resolveViciousGoldArchetype('Herald Warlock'), {
  matchedArchetype: 'Harold Warlock',
  matchMethod: 'alias',
});
assert.deepEqual(resolveViciousGoldArchetype('Spell DemonHunter'), {
  matchedArchetype: 'Spell Demon Hunter',
  matchMethod: 'alias',
});
assert.deepEqual(resolveViciousGoldArchetype('  Burn   Mage '), {
  matchedArchetype: 'Burn Mage',
  matchMethod: 'exact',
});

console.log('Vicious Gold supplemental exact-build tests passed');

const catalog = [
  { archetype: 'Pirate Warrior' }, { archetype: 'Harold DK' }, { archetype: 'Piglock' }, { archetype: 'Rafaamlock' },
  { archetype: 'Harold Warlock' }, { archetype: 'Void DH' }, { archetype: 'Two-Bit Rogue' }, { archetype: 'AYAYA Rogue' },
];
const catalogMatch = (deck: string) => findViciousGoldCatalogItem(catalog, deck)?.archetype ?? null;
assert.equal(catalogMatch('Pirate Warrior'), 'Pirate Warrior');
assert.equal(catalogMatch('Ayaya Rogue'), 'AYAYA Rogue', 'names match regardless of case');
assert.equal(catalogMatch('Herald DeathKnight'), 'Harold DK', 'vS Herald and DeathKnight are HSGuru Harold and DK');
assert.equal(catalogMatch('Void DemonHunter'), 'Void DH');
assert.equal(catalogMatch('Pig Warlock'), 'Piglock');
assert.equal(catalogMatch('Rafaam Warlock'), 'Rafaamlock');
assert.equal(catalogMatch('Herald Warlock'), 'Harold Warlock', 'an exact name wins over the -lock short form');
assert.equal(catalogMatch('Two Rogue'), 'Two-Bit Rogue', 'the alias table still applies');
assert.equal(catalogMatch('Blood Warrior'), null, 'a missing archetype never borrows a same-class one');
assert.equal(catalogMatch('Other Warlock'), null);
