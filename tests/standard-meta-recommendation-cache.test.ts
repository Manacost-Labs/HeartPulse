import assert from 'node:assert/strict';
import { cacheSuccessfulRecommendation } from '../server/standardMetaRecommendationCache.js';

const cache = new Map<string, { data: { deckCode: string }; expiresAt: number }>();

assert.equal(
  cacheSuccessfulRecommendation(cache, 'wild:legend:tog druid', null, Date.now() + 60_000),
  false,
);
assert.equal(cache.has('wild:legend:tog druid'), false, 'missing decks must remain retryable');

const recommendation = { deckCode: 'AAEBA-test' };
assert.equal(
  cacheSuccessfulRecommendation(cache, 'wild:legend:tog druid', recommendation, 123_456),
  true,
);
assert.deepEqual(cache.get('wild:legend:tog druid'), {
  data: recommendation,
  expiresAt: 123_456,
});

console.log('standard meta recommendation cache tests passed');
