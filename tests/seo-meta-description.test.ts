import assert from 'node:assert/strict';
import { META_DESCRIPTION_MAX, fitMetaDescription } from '../src/shared/seo/metaDescription.js';
import { hasConstructedCardPage } from '../src/features/CosmeticsRelatedCardGallery.js';

assert.equal(fitMetaDescription('  Короткое   описание.  '), 'Короткое описание.', 'whitespace collapses');
const long = 'Сила героя '.repeat(30);
const fitted = fitMetaDescription(long);
assert.ok(fitted.length <= META_DESCRIPTION_MAX, `fitted to ${META_DESCRIPTION_MAX}: ${fitted.length}`);
assert.ok(fitted.endsWith('…'), 'a cut description shows the ellipsis');
assert.doesNotMatch(fitted, /\s…$/, 'no space before the ellipsis');
assert.ok(long.startsWith(fitted.slice(0, -1)), 'the cut keeps the beginning of the text');
assert.ok(fitMetaDescription('Без-пробелов-'.repeat(20), 40).length <= 40, 'a text without spaces is still cut to the limit');

for (const token of ['DAL_366t3', 'BG31_BOBt2', 'SW_052t8_t', 'TIME_713t', 'TTN_002t20', 'WW_001t18', 'JAM_000t3']) {
  assert.equal(hasConstructedCardPage(token), false, `${token} is a token without a card page`);
}
for (const card of ['AT_031', 'BG31_BOB', 'CATA_EVENT_402', 'TIME_054', 'TTN_921', 'WORK_019', 'EDR_455']) {
  assert.equal(hasConstructedCardPage(card), true, `${card} has a card page`);
}

console.log('SEO meta description and related card link contracts passed');
