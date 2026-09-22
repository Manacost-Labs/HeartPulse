import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { ArenaSynergyCardIdentity } from '../src/features/ArenaSynergyCardIdentity';

const markup = renderToStaticMarkup(
  <ArenaSynergyCardIdentity
    card={{
      id: 'AT_001/variant',
      name: 'Тестовая карта',
      cost: 3,
      type: 'MINION',
      rarity: 'COMMON',
      deckWinRate: 52.4,
      twelveWinRunQuality: null,
      runs: 100,
    }}
  />,
);

assert.match(
  markup,
  /src="\/api\/public-resource\/hsjson\/v1\/tiles\/AT_001%2Fvariant\.webp"/,
  'Arena synergy art must use the same-origin public-resource route and encode the card id',
);
assert.doesNotMatch(markup, /art\.hearthstonejson\.com/);

console.log('Arena synergy card identity tests passed');
