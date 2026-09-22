import assert from 'node:assert/strict';
import { constructedCardPath, constructedCardRoute } from '../src/modules/constructedCards/public';
import { projectConstructedCardSitemapCatalog } from '../server/entitySitemapProjections';

for (const format of ['standard', 'wild'] as const) {
  for (const cardId of ['CARD_1', 'blizzard:12345']) {
    const path = constructedCardPath(format, cardId);
    assert.deepEqual(constructedCardRoute(`${path}/?view=table#stats`), { page: 'detail', format, cardId });
    const entries = projectConstructedCardSitemapCatalog([
      { card_id: cardId, name: { ru: 'Карта' }, card_type: { slug: 'MINION' } },
    ], format);
    assert.equal(entries[0].location, `https://hearthpulse.net${path}/`);
  }
  for (const encoded of ['blizzard:12345', 'blizzard%3a12345', 'blizzard%3A12345']) {
    assert.equal(constructedCardRoute(`/standard/cards/${format}/${encoded}`).cardId, 'blizzard:12345');
  }
  for (const encoded of ['%', '%ZZ', 'blizzard%253A12345', 'blizzard:0', 'CARD%2F1', 'CARD%3F1', 'CARD%231']) {
    assert.equal(constructedCardRoute(`/standard/cards/${format}/${encoded}`).cardId, null);
  }
  assert.throws(() => constructedCardPath(format, 'CARD/1'), /Invalid/);
}
console.log('constructed card URL contract passed');
