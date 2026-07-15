import assert from 'node:assert/strict';
import { findSupplementalViciousGoldBuild } from '../server/viciousGoldBuilds.js';

const build = findSupplementalViciousGoldBuild('  Soothsayer   Priest ');
assert.ok(build, 'Soothsayer Priest must have its exact official list');
assert.equal(build.matchedArchetype, 'Prepared Soothsayer Priest');
assert.equal(build.source, 'vicious_syndicate_decks');
assert.equal(build.sourceUrl, 'https://www.vicioussyndicate.com/decks/prepared-soothsayer-priest/');
assert.match(build.deckCode, /^[A-Za-z0-9+/=]{40,}$/);

assert.equal(
  findSupplementalViciousGoldBuild('Control Priest'),
  null,
  'an unrelated Priest list must never be used as a same-class fallback',
);
assert.equal(findSupplementalViciousGoldBuild('Unknown Priest'), null);

console.log('Vicious Gold supplemental exact-build tests passed');
