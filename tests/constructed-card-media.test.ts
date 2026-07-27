import assert from 'node:assert/strict';
import {
  collectConstructedCardMedia,
  collectConstructedRelatedCardMedia,
  collectConstructedRelatedCardArtMedia,
  collectConstructedGeneratedPoolMedia,
  constructedGeneratedPoolCardImage,
  constructedCardRenderImage,
  collectConstructedCardVariants,
  flattenConstructedCardSounds,
} from '../src/features/constructedCardMedia.js';
import {
  normalizeConstructedRelatedCardText,
  normalizeConstructedRelatedCardGroups,
} from '../src/features/constructedRelatedCards.js';
import { constructedSoundGroupLabel } from '../src/features/constructedCardLabels.js';

const sounds = flattenConstructedCardSounds([
  {
    heading: 'Play',
    clips: [
      { file_title: 'VO_CARD_Play_01.wav', file_url: 'https://example.test/play.wav', description: 'For Azeroth!' },
      { file_title: 'CARD_Stinger.wav', file_url: 'https://example.test/stinger.wav', description: '<music stinger>' },
    ],
  },
  { group: 'Death', name: 'Legacy clip', src: 'https://example.test/death.wav' },
]);
assert.equal(sounds.length, 3);
assert.equal(sounds[0].group, 'Play');
assert.equal(sounds[0].description, 'For Azeroth!');
assert.equal(sounds[1].description, 'Музыкальная заставка', 'technical sound captions must be localized for the card page');
assert.equal(sounds[2].group, 'Death');
assert.equal(sounds[2].url, 'https://example.test/death.wav');
assert.equal(constructedSoundGroupLabel('Summon'), 'Призыв');
assert.equal(constructedSoundGroupLabel('Played against Garrosh Hellscream'), 'Особая реплика при встрече');

const media = collectConstructedCardMedia({
  images: {
    card: 'https://example.test/card.png',
    golden: 'https://example.test/golden.png',
    crop: 'https://example.test/art.jpg',
    animated: { golden: 'https://example.test/golden.webm' },
  },
  wiki: {
    golden_cards: [{ label: 'Golden duplicate', file_url: 'https://example.test/golden.png' }],
    signature_cards: [{ label: 'Signature', file_url: 'https://example.test/signature.png' }],
    gallery: [{ caption: 'Full art', file_url: 'https://example.test/full.jpg', thumb_url: 'https://example.test/thumb.jpg' }],
  },
});
assert.equal(media.length, 6, 'all unique card variants and gallery art must be available to the lightbox');
assert.equal(media.find(item => item.id === 'animated-golden')?.kind, 'video');
assert.equal(media.find(item => item.id === 'gallery-0')?.thumbnailUrl, 'https://example.test/thumb.jpg');
assert.equal(media.find(item => item.id === 'gallery-0')?.label, 'Полный арт', 'English wiki gallery captions must be localized');
assert.equal(media.find(item => item.id === 'signature_cards-0')?.label, 'Сигнатурная карта', 'English card-variant labels must be localized');

const variants = collectConstructedCardVariants({
  images: {
    card: 'https://example.test/card.png',
    golden: null,
    signature: null,
    diamond: null,
  },
  wiki: {
    golden_cards: [{ label: 'Golden', file_url: 'https://example.test/wiki-golden.png' }],
    signature_cards: [{ label: 'Signature', file_url: 'https://example.test/wiki-signature.png' }],
  },
});
assert.deepEqual(
  variants.map(item => [item.id, item.url]),
  [
    ['normal', 'https://example.test/card.png'],
    ['golden', 'https://example.test/wiki-golden.png'],
    ['signature', 'https://example.test/wiki-signature.png'],
  ],
  'card detail variants must fall back to wiki premium media when the catalog premium fields are empty',
);

const relatedGroups = normalizeConstructedRelatedCardGroups({
  related_cards_localized: [
    {
      heading: { ru: 'Награды', en: 'Rewards' },
      cards: [
        {
          card_id: 'QUEST_REWARD',
          name: { ru: 'Русская награда', en: 'Quest Reward' },
          mana_cost: 5,
          attack: 7,
          health: 7,
          artist: 'Wiki Artist',
          images: {
            card: 'https://example.test/QUEST_REWARD.png',
            art: 'https://example.test/QUEST_REWARD-full.jpg',
            crop: 'https://example.test/QUEST_REWARD-crop.jpg',
            art_metadata: {
              source: 'hearthstone.wiki.gg',
              file_title: 'File:Quest Reward full.jpg',
              file_page_url: 'https://hearthstone.wiki.gg/wiki/File:Quest_Reward_full.jpg',
              width: 3000,
              height: 4000,
              size_bytes: 123456,
              sha1: 'abc123',
              mime: 'image/jpeg',
            },
          },
          relationship: {
            wiki_url: 'https://hearthstone.wiki.gg/wiki/Quest_Reward',
          },
        },
      ],
    },
  ],
  wiki: {
    related_cards: [{ card_id: 'LEGACY_DUPLICATE', name: 'Legacy duplicate' }],
  },
});
assert.equal(relatedGroups.length, 1);
assert.equal(relatedGroups[0].headingRu, 'Награды');
assert.equal(relatedGroups[0].cards.length, 1, 'localized groups must take priority over the legacy flat list');
assert.equal(relatedGroups[0].cards[0].nameRu, 'Русская награда');
assert.equal(relatedGroups[0].cards[0].cardImageUrl, 'https://example.test/QUEST_REWARD.png');
assert.equal(relatedGroups[0].cards[0].artUrl, 'https://example.test/QUEST_REWARD-full.jpg');
assert.equal(relatedGroups[0].cards[0].artMetadata?.sha1, 'abc123');
assert.equal(relatedGroups[0].cards[0].artMetadata?.width, 3000);
assert.equal(relatedGroups[0].cards[0].wikiUrl, 'https://hearthstone.wiki.gg/wiki/Quest_Reward');
assert.equal(
  normalizeConstructedRelatedCardText('[x]Перемотка\nВы получаете  случайное\u00a0существо \n другого класса.'),
  'Перемотка Вы получаете случайное существо другого класса.',
  'game layout markers and forced line wraps must not leak into the related-card description',
);
assert.equal(normalizeConstructedRelatedCardText('   '), null);

const relatedCardMedia = collectConstructedRelatedCardMedia(relatedGroups);
assert.equal(relatedCardMedia.length, 1);
assert.deepEqual(
  relatedCardMedia[0],
  {
    id: 'related-card-QUEST_REWARD',
    label: 'Русская награда',
    description: 'QUEST_REWARD',
    url: 'https://example.test/QUEST_REWARD.png',
    thumbnailUrl: 'https://example.test/QUEST_REWARD.png',
    sourceUrl: null,
    kind: 'image',
    presentation: 'contain',
  },
  'related card images must be available to the existing lightbox without adding a wiki action',
);

const generatedPoolMedia = collectConstructedGeneratedPoolMedia([
  {
    pool: 'All minions',
    cards: [
      {
        card_id: 'POOL_1',
        name: { ru: 'Первая карта', en: 'First card' },
        images: { card: 'https://example.test/pool-1.png' },
      },
      {
        id: '',
        title: 'Second card',
        image_url: 'https://example.test/pool-2.png',
      },
      {
        id: '',
        title: 'Duplicate image',
        image_url: 'https://example.test/pool-2.png',
      },
    ],
  },
]);
assert.deepEqual(
  generatedPoolMedia.map(item => [item.id, item.label, item.url, item.presentation]),
  [
    ['generated-pool-POOL_1', 'Первая карта', '/api/card-image/POOL_1/full.webp?v=constructed-cards-20260727', 'contain'],
    ['generated-pool-0-1', 'Second card', 'https://example.test/pool-2.png', 'contain'],
  ],
  'generated-pool card renders must be deduplicated and available to the shared lightbox',
);
assert.equal(
  constructedGeneratedPoolCardImage({ card_id: '../unsafe', image_url: 'https://example.test/fallback.png' }),
  'https://example.test/fallback.png',
  'invalid card IDs must never be interpolated into the same-origin image proxy path',
);
assert.equal(
  constructedCardRenderImage('ETC_080', 'https://example.test/card.png', 'thumb'),
  '/api/card-image/ETC_080/thumb.webp?v=constructed-cards-20260727',
  'constructed card renders should use the same-origin WebP cache for Russian edge delivery',
);

const legacyRelatedGroups = normalizeConstructedRelatedCardGroups({
  wiki: {
    related_cards: [
      {},
      { card_id: 'TOKEN_1', name: { en: 'Token one' }, image_url: '/uploads/TOKEN_1.png' },
      { card_id: 'TOKEN_1', name: { en: 'Duplicate token' }, image_url: '/uploads/duplicate.png' },
      { card_id: 'TOKEN_2', name_ru: 'Второй токен', images: { crop: '/uploads/crop.jpg' } },
    ],
  },
});
assert.equal(legacyRelatedGroups.length, 1);
assert.equal(legacyRelatedGroups[0].headingRu, 'Связанные карты');
assert.deepEqual(
  legacyRelatedGroups[0].cards.map(item => [item.cardId, item.nameRu, item.nameEn, item.cardImageUrl, item.artUrl]),
  [
    ['TOKEN_1', null, 'Token one', '/uploads/TOKEN_1.png', null],
    ['TOKEN_2', 'Второй токен', null, null, null],
  ],
  'legacy related cards must be normalized, deduplicated, and never promote crop images to full art',
);

const sharedArtGroups = normalizeConstructedRelatedCardGroups({
  related_cards_localized: [{
    heading: { ru: 'Сопутствующие карты' },
    cards: [
      {
        card_id: 'EGG_1',
        name: { ru: 'Яйцо' },
        artist: 'Wiki Artist',
        images: {
          art: 'https://example.test/shared-full.jpg',
          art_metadata: {
            file_page_url: 'https://hearthstone.wiki.gg/wiki/File:Shared_full.jpg',
            width: 3000,
            height: 4000,
            sha1: 'shared-art',
          },
          crop: 'https://example.test/shared-crop.jpg',
        },
      },
      {
        card_id: 'EGG_2',
        name: { ru: 'Яйцо' },
        images: {
          art: 'https://example.test/shared-full-copy.jpg',
          art_metadata: { width: 3000, height: 4000, sha1: 'shared-art' },
        },
      },
      {
        card_id: 'BEAST_1',
        name: { ru: 'Зверь' },
        images: {
          art: 'https://example.test/beast-full.jpg',
          art_metadata: { width: 760, height: 1016 },
        },
      },
      {
        card_id: 'MISSING_ART',
        name: { ru: 'Без арта' },
        images: { crop: 'https://example.test/missing-crop.jpg' },
      },
    ],
  }],
});
const relatedArtMedia = collectConstructedRelatedCardArtMedia(sharedArtGroups);
assert.equal(relatedArtMedia.length, 2, 'identical wiki originals must be deduplicated by SHA-1');
assert.equal(relatedArtMedia[0].url, 'https://example.test/shared-full.jpg');
assert.equal(relatedArtMedia[0].thumbnailUrl, relatedArtMedia[0].url, 'full-art thumbnails must never use game crop images');
assert.equal(relatedArtMedia[0].presentation, 'contain');
assert.match(relatedArtMedia[0].description || '', /EGG_1, EGG_2/);
assert.match(relatedArtMedia[0].description || '', /3000×4000/);
assert.equal(relatedArtMedia[0].sourceUrl, 'https://hearthstone.wiki.gg/wiki/File:Shared_full.jpg');
assert.equal(relatedArtMedia.some(item => item.url.includes('crop')), false, 'crop images must not enter related full-art media');

console.log('constructed card media normalization tests passed');
