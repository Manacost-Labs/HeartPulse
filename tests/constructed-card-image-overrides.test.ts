import assert from 'node:assert/strict';
import {
  constructedCardImageOverrideCardId,
  resolveConstructedCardImageSourceUrl,
} from '../server/constructedCardImageOverrides.js';

const staleVoidscale = 'https://d15f34w2p8l1cc.cloudfront.net/hearthstone/c1d2c0af640c1c3cb4a580021cbc662ecf8510e469a04c265eeca2831a5c70b0.png';
const updatedVoidscale = 'https://art.hearthstonejson.com/v1/render/latest/ruRU/512x/JAIL_733.png';

assert.equal(
  resolveConstructedCardImageSourceUrl(126663, staleVoidscale),
  updatedVoidscale,
  'the known pre-36.2 Vicious Voidscale render must be replaced',
);
assert.equal(constructedCardImageOverrideCardId(126663), 'JAIL_733');

const futureOfficialUrl = 'https://d15f34w2p8l1cc.cloudfront.net/hearthstone/future-fixed-render.png';
assert.equal(
  resolveConstructedCardImageSourceUrl(126663, futureOfficialUrl),
  futureOfficialUrl,
  'a future Blizzard render URL must automatically retire the override',
);
assert.equal(
  resolveConstructedCardImageSourceUrl(999999, staleVoidscale),
  staleVoidscale,
  'unrelated cards must never inherit another card override',
);

console.log('constructed card image override tests passed');
