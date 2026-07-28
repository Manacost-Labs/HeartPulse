import assert from 'node:assert/strict';
import {
  publicProfileIdFromPath,
  publicProfilePath,
} from '../src/profileRoutes.js';
import { isKnownPath, tabFromPath } from '../src/routes.js';

const publicProfileId = 'p_AbCdEfGhIjKlMnOpQrStUv';
assert.equal(publicProfileIdFromPath(`/profiles/${publicProfileId}`), publicProfileId);
assert.equal(publicProfileIdFromPath(`/profiles/${publicProfileId}/`), publicProfileId);
assert.equal(publicProfileIdFromPath('/profiles/user_internal_id'), null);
assert.equal(publicProfileIdFromPath('/profiles/p_../../admin'), null);
assert.equal(publicProfilePath(publicProfileId), `/profiles/${publicProfileId}`);
assert.equal(publicProfilePath('user_internal_id'), '/');
assert.equal(isKnownPath(`/profiles/${publicProfileId}`), true);
assert.equal(isKnownPath('/profiles/user_internal_id'), false);
assert.equal(tabFromPath(`/profiles/${publicProfileId}`), 'home');

console.log('public profile client route contracts passed');
