import assert from 'node:assert/strict';
import {
  cardImageRemoteCandidates,
  downloadFallbackCardImage,
} from '../server/cardImageRemote.js';

const heroCandidates = cardImageRemoteCandidates('BG36_HERO_105');

assert.deepEqual(
  heroCandidates.map(candidate => candidate.kind),
  ['hsjson_render_ru', 'hsjson_render_en', 'wiki_card', 'hsjson_full_art'],
);
assert.equal(
  heroCandidates[2]?.url,
  'https://hearthstone.wiki.gg/wiki/Special:Redirect/file/BG36_HERO_105.png',
);
assert.equal(
  heroCandidates[3]?.url,
  'https://art.hearthstonejson.com/v1/orig/BG36_HERO_105.png',
);

assert.throws(() => cardImageRemoteCandidates('../secret'), /Invalid card image ID/);

const requested: string[] = [];
const downloaded = await downloadFallbackCardImage('BG36_HERO_105', async input => {
  const url = String(input);
  requested.push(url);
  if (url.includes('/render/latest/')) {
    return new Response('missing', { status: 404, headers: { 'content-type': 'text/plain' } });
  }
  return new Response(Buffer.from('wiki-card'), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });
});

assert.equal(downloaded.toString(), 'wiki-card');
assert.deepEqual(requested, heroCandidates.slice(0, 3).map(candidate => candidate.url));

console.log('card image remote candidate tests passed');
