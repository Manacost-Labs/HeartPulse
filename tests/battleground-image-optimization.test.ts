import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  battlegroundImageTransformCacheKey,
  battlegroundImageTransformFromQuery,
  optimizeBattlegroundImage,
} from '../server/battlegroundImageOptimization.js';
import { publicResourceUrl } from '../shared/publicResourceUrl.js';
import {
  battlegroundFullCardImage,
  preferredBattlegroundGoldenBuddyImage,
  preferredBattlegroundHeroImage,
} from '../src/features/battlegroundHeroImages.js';
import { optimizedBattlegroundThumbnailUrl } from '../src/features/battlegroundImageUrls.js';

const transform = battlegroundImageTransformFromQuery({
  width: '220',
  quality: '76',
  format: 'webp',
});
assert.deepEqual(transform, { width: 220, quality: 76, format: 'webp' });
assert.equal(battlegroundImageTransformCacheKey(transform!), 'webp:w220:q76');
assert.equal(battlegroundImageTransformFromQuery({}), null);
assert.deepEqual(
  battlegroundImageTransformFromQuery({ width: '9999', quality: '2' }),
  { width: 512, quality: 55, format: 'webp' },
);

const source = await sharp({
  create: {
    width: 404,
    height: 558,
    channels: 4,
    background: { r: 92, g: 48, b: 120, alpha: 1 },
  },
}).png().toBuffer();
const optimized = await optimizeBattlegroundImage(source, transform!);
const metadata = await sharp(optimized.body).metadata();
assert.equal(optimized.contentType, 'image/webp');
assert.equal(metadata.format, 'webp');
assert.equal(metadata.width, 220);
assert.ok((metadata.height || 0) <= 304);
assert.ok(optimized.body.length < source.length);

const legacyUrl = optimizedBattlegroundThumbnailUrl(
  'https://bg.kolodahearthstone.ru/api/remote-image?src=https%3A%2F%2Fexample.cloudfront.net%2Fcard.png',
  220,
);
assert.equal(
  legacyUrl,
  '/api/remote-image?src=https%3A%2F%2Fexample.cloudfront.net%2Fcard.png&width=220&quality=76&format=webp',
);

assert.equal(
  optimizedBattlegroundThumbnailUrl(
    'https://bg.kolodahearthstone.ru/assset/cards/BG_TEST.webp',
    160,
  ),
  '/api/public-resource/bg/assset/cards/BG_TEST.webp?width=160&quality=76&format=webp',
);

const externalUrl = optimizedBattlegroundThumbnailUrl('https://art.hearthstonejson.com/card.png', 160);
const parsedExternal = new URL(externalUrl, 'https://arena.hs-manacost.ru');
assert.equal(parsedExternal.pathname, '/api/remote-image');
assert.equal(parsedExternal.searchParams.get('src'), 'https://art.hearthstonejson.com/card.png');
assert.equal(parsedExternal.searchParams.get('width'), '160');
assert.equal(optimizedBattlegroundThumbnailUrl('/arena-logo-icon.webp', 220), '/arena-logo-icon.webp');

assert.equal(
  preferredBattlegroundHeroImage({
    cardId: 'BG36_HERO_105',
    apiImage: 'https://hearthstone.wiki.gg/images/BG36_HERO_105.png?f657db',
    fallback: '/arena-logo-icon.webp',
  }),
  'https://hearthstone.wiki.gg/images/BG36_HERO_105.png?f657db',
  'new heroes must retain the dedicated hero portrait supplied by the statistics API',
);

assert.equal(
  preferredBattlegroundHeroImage({
    cardId: 'TB_BaconShop_HERO_17',
    apiImage: 'https://hearthstone.wiki.gg/images/TB_BaconShop_HERO_17.png?7a7139',
    libraryImage: 'https://hearthstone.wiki.gg/images/TB_BaconShop_HERO_17.png?7a7139',
    fallback: '/arena-logo-icon.webp',
  }),
  'https://hearthstone.wiki.gg/images/TB_BaconShop_HERO_17.png?7a7139',
  'legacy Battlegrounds heroes must not be replaced with a hero-power card frame',
);

assert.equal(
  publicResourceUrl('https://hearthstone.wiki.gg/images/TB_BaconShop_HERO_17.png?7a7139'),
  '/api/public-resource/wiki/images/TB_BaconShop_HERO_17.png?7a7139',
  'dedicated hero portraits must still be delivered through Arena same-origin media proxy',
);

assert.equal(
  preferredBattlegroundHeroImage({
    cardId: 'invalid/card-id',
    apiImage: 'https://hearthstone.wiki.gg/images/legacy-hero.png',
    fallback: '/arena-logo-icon.webp',
  }),
  'https://hearthstone.wiki.gg/images/legacy-hero.png',
  'heroes without a safe card id must retain the upstream fallback chain',
);

assert.equal(
  preferredBattlegroundHeroImage({
    apiImage: { url: 'https://untrusted.example/hero.png' },
    fallback: '/arena-logo-icon.webp',
  }),
  '/arena-logo-icon.webp',
  'non-string upstream image values must not become invalid DOM URLs',
);

assert.equal(
  battlegroundFullCardImage(
    'TB_BaconShop_HERO_56_Buddy',
    'https://api.kolodahearthstone.com/uploads/framed/TB_BaconShop_HERO_56_Buddy.png?v=2026-09-10%2015%3A17%3A10',
  ),
  'https://api.kolodahearthstone.com/uploads/cards/TB_BaconShop_HERO_56_Buddy.png?v=2026-09-10%2015%3A17%3A10',
  'buddy media must use the current full card while preserving the data refresh version',
);

assert.equal(
  battlegroundFullCardImage(
    'TB_BaconShop_HERO_56_Buddy_G',
    'https://api.kolodahearthstone.com/uploads/cards/TB_BaconShop_HERO_56_Buddy_G.png?v=gold',
  ),
  'https://api.kolodahearthstone.com/uploads/cards/TB_BaconShop_HERO_56_Buddy_G.png?v=gold',
  'already-full golden buddy media must remain unchanged',
);

assert.equal(
  battlegroundFullCardImage('TB_BaconShop_HERO_56_Buddy', 'https://hearthstone.wiki.gg/images/Valestraz.png'),
  'https://hearthstone.wiki.gg/images/Valestraz.png',
  'unrelated providers must not be rewritten',
);

assert.equal(
  battlegroundFullCardImage(
    'TB_BaconShop_HERO_56_Buddy_G',
    '/uploads/cards/TB_BaconShop_HERO_56_Buddy_G.png?v=current',
  ),
  'https://api.kolodahearthstone.com/uploads/cards/TB_BaconShop_HERO_56_Buddy_G.png?v=current',
  'relative first-party card paths must retain their API origin before same-origin proxying',
);

assert.equal(
  preferredBattlegroundGoldenBuddyImage(
    {
      card_id: 'TB_BaconShop_HERO_56_Buddy',
      image_gold: '/uploads/cards/TB_BaconShop_HERO_56_Buddy_G.png?v=current',
    },
    {
      card_id: 'TB_BaconShop_HERO_56_Buddy_G',
      image: 'https://hearthstone.wiki.gg/images/Valestraz_golden.png',
    },
  ),
  'https://api.kolodahearthstone.com/uploads/cards/TB_BaconShop_HERO_56_Buddy_G.png?v=current',
  'the current full golden card on buddy.card must win over the nested wiki portrait',
);

console.log('battleground image optimization tests passed');
