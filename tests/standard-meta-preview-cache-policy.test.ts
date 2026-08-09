import assert from 'node:assert/strict';
import { standardMetaPreviewCacheAction } from '../server/standardMetaPreviewCachePolicy.js';

assert.equal(standardMetaPreviewCacheAction(true, false), 'reuse');
assert.equal(
  standardMetaPreviewCacheAction(true, true),
  'refresh',
  'refresh must retain the last valid preview until its replacement succeeds',
);
assert.equal(standardMetaPreviewCacheAction(false, false), 'evict');
assert.equal(standardMetaPreviewCacheAction(false, true), 'evict');

console.log('standard meta preview cache policy tests passed');
