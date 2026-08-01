import assert from 'node:assert/strict';
import {
  publicProfileIdFromPath,
} from '../src/profileRoutes.js';
import { publicProfilePath } from '../src/publicProfilePath.js';
import { isKnownPath, tabFromPath } from '../src/routes.js';

assert.equal(publicProfileIdFromPath('/id/1'), '1');
assert.equal(publicProfileIdFromPath('/id/2147483647/'), '2147483647');
assert.equal(publicProfileIdFromPath('/id/user_internal_id'), null);

const legacyPublicProfileId = 'p_AbCdEfGhIjKlMnOpQrStUv';
assert.equal(publicProfileIdFromPath(`/profiles/${legacyPublicProfileId}`), legacyPublicProfileId,
  'old shared profile links must remain readable during migration');
assert.equal(publicProfileIdFromPath('/profiles/p_../../admin'), null);

assert.equal(publicProfilePath('1'), '/id/1');
assert.equal(publicProfilePath('01'), '/');
assert.equal(publicProfilePath('2147483648'), '/');
assert.equal(publicProfilePath('user_internal_id'), '/');
assert.equal(isKnownPath('/id/1'), true);
assert.equal(isKnownPath(`/profiles/${legacyPublicProfileId}`), true);
assert.equal(isKnownPath('/id/user_internal_id'), false);
assert.equal(tabFromPath('/id/1'), 'home');

console.log('numeric public profile client route contracts passed');
