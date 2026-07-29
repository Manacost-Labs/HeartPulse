import assert from 'node:assert/strict';
import { isPublicMediaApiRequest } from '../server/apiRateLimitPolicy';

assert.equal(isPublicMediaApiRequest('GET', '/public-resource/db/uploads/card.png'), true);
assert.equal(isPublicMediaApiRequest('HEAD', '/article-cover'), true);
assert.equal(isPublicMediaApiRequest('POST', '/article-cover'), false);
assert.equal(isPublicMediaApiRequest('GET', '/constructed-cards'), false);
assert.equal(isPublicMediaApiRequest('GET', '/public-resource-unsafe/db/card.png'), false);

console.log('API rate-limit policy tests passed');
