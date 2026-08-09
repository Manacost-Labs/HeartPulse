import assert from 'node:assert/strict';

import {
  MAX_IMAGE_LOAD_RETRIES,
  recoverExhaustedImageLoad,
  settleExhaustedImageLoad,
  type DeckImageLoadState,
} from '../src/features/deckrender/deckImageLoadState.js';

const previewFailure: DeckImageLoadState = {
  error: '',
  fullImageUrl: 'https://api.blizzcore.ru/render-cache/deck.jpg',
  imageRetryAttempt: MAX_IMAGE_LOAD_RETRIES,
  imageReady: false,
  previewImageUrl: 'https://api.blizzcore.ru/render-cache/deck.preview-v1.webp',
};

const fullFallback = settleExhaustedImageLoad(previewFailure);
assert.equal(fullFallback.previewImageUrl, previewFailure.fullImageUrl);
assert.equal(fullFallback.imageRetryAttempt, 0);
assert.equal(fullFallback.error, '');

const fullFailure = settleExhaustedImageLoad({
  ...fullFallback,
  imageRetryAttempt: MAX_IMAGE_LOAD_RETRIES,
});
assert.equal(fullFailure.previewImageUrl, previewFailure.fullImageUrl);
assert.equal(fullFailure.imageRetryAttempt, MAX_IMAGE_LOAD_RETRIES);
assert.match(fullFailure.error, /Не удалось загрузить/);

// Terminal failures are idempotent: another error event cannot reset the
// counter or change src and therefore cannot start an unbounded request loop.
assert.deepEqual(settleExhaustedImageLoad(fullFailure), fullFailure);

const recovered = recoverExhaustedImageLoad({
  ...fullFailure,
  renderRecoveryAttempt: 0,
  requestVersion: 0,
});
assert.equal(recovered.error, '');
assert.equal(recovered.fullImageUrl, '');
assert.equal(recovered.previewImageUrl, '');
assert.equal(recovered.imageRetryAttempt, 0);
assert.equal(recovered.renderRecoveryAttempt, 1);
assert.equal(recovered.requestVersion, 1);

const terminal = recoverExhaustedImageLoad({
  ...fullFailure,
  renderRecoveryAttempt: 1,
  requestVersion: 1,
});
assert.match(terminal.error, /Не удалось загрузить/);
assert.equal(terminal.renderRecoveryAttempt, 1, 'automatic server refresh must be attempted only once');

console.log('Deck render image failure state tests passed');
