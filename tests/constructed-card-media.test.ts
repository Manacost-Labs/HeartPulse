import assert from 'node:assert/strict';
import { collectConstructedCardMedia, flattenConstructedCardSounds } from '../src/features/constructedCardMedia.js';

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
assert.equal(sounds[2].group, 'Death');
assert.equal(sounds[2].url, 'https://example.test/death.wav');

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

console.log('constructed card media normalization tests passed');
