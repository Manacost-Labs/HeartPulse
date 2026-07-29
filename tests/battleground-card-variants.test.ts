import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  battlegroundBaseCardId,
  findBattlegroundCardVariants,
} from '../src/features/battlegroundCardVariants';

const normal = {
  card_id: 'BG27_080',
  dbf: 106487,
  attack: 2,
  health: 2,
  text_ru: 'Предсмертный хрип: дает +1/+1.',
  images: {
    card: '/cards/BG27_080.png',
    golden: '/golden/BG27_080.png',
  },
};

const golden = {
  card_id: 'BG27_080_G',
  dbf: 106488,
  attack: 4,
  health: 4,
  text_ru: 'Предсмертный хрип: дает +2/+2.',
  images: {
    card: '/cards/BG27_080.png',
    golden: '/golden/BG27_080.png',
  },
};

assert.equal(battlegroundBaseCardId('BG27_080_G'), 'BG27_080');
assert.equal(battlegroundBaseCardId('BG27_080_Gt'), 'BG27_080t');

const pair = findBattlegroundCardVariants(normal, [normal, golden]);
assert.equal(pair.normal, normal);
assert.equal(pair.golden, golden);
assert.equal(pair.golden?.attack, 4);
assert.match(pair.golden?.text_ru || '', /\+2\/\+2/);

const pairFromGoldenUrl = findBattlegroundCardVariants(golden, [normal, golden]);
assert.equal(pairFromGoldenUrl.normal, normal);
assert.equal(pairFromGoldenUrl.golden, golden);

const missingGolden = findBattlegroundCardVariants(normal, [normal]);
assert.equal(missingGolden.normal, normal);
assert.equal(missingGolden.golden, null);

const unrelatedGolden = {
  ...golden,
  card_id: 'BG27_081_G',
};
const exactPair = findBattlegroundCardVariants(normal, [unrelatedGolden, golden]);
assert.equal(exactPair.golden, golden);

const detailPageSource = readFileSync(
  new URL('../src/features/BgLibrary.tsx', import.meta.url),
  'utf8',
);
assert.match(
  detailPageSource,
  /q:\s*variantSearchCardId/,
  'detail page must request only the matching golden card record',
);
assert.match(
  detailPageSource,
  /<BattlegroundCardVariantToggle/,
  'detail page must render the normal/golden selector',
);
assert.match(
  detailPageSource,
  /selectedVariantCard/,
  'card text and metadata must be derived from the selected variant record',
);

console.log('battleground card variants contracts passed');
