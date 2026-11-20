import assert from 'node:assert/strict';
import express from 'express';
import { encode } from '@firestone-hs/deckstrings';
import { createPublicFunDecksRouter } from '../server/adminFunDecksRoutes.js';

/**
 * The open fun-deck selection carries each deck's card list, decoded from its
 * code against the catalog of the deck's format: a deck the catalog cannot name
 * has no list, and a catalog that fails leaves the selection itself intact.
 */
const cardRows = Array.from({ length: 16 }, (_, index) => ({
  card_id: `FUN_${index}`, dbf: 2000 + index, name: { ru: `Карта ${index}`, en: `Card ${index}` },
  mana_cost: index % 8, rarity: index === 0 ? 'LEGENDARY' : 'COMMON',
}));
const code = (cards: number) => encode({ heroes: [7], format: 2, cards: cardRows.slice(0, cards).map((card, index) => [card.dbf, index === 0 ? 1 : 2] as [number, number]) });
const known = code(15);
const unknown = encode({ heroes: [7], format: 2, cards: Array.from({ length: 15 }, (_, index) => [900_000 + index, 2] as [number, number]) });

let catalogFails = false;
const formatsAsked: string[] = [];
const app = express();
app.use('/api', createPublicFunDecksRouter({
  loadFunDecks: async () => ({ data: { structured: { rows: [
    { title: 'Known', deck_code: known, format: 'Standard', candidate_source_id: 'internal_source' },
    { title: 'Wild known', deck_code: known, format: 'Wild' },
    { title: 'Unknown', deck_code: unknown, format: 'Standard' },
  ] } } }),
  loadCardCatalog: async format => {
    formatsAsked.push(format);
    if (catalogFails) throw new Error('catalog down');
    return { cards: cardRows };
  },
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const { port } = server.address() as { port: number };
try {
  const body = await (await fetch(`http://127.0.0.1:${port}/api/fun-decks`)).json() as { decks: Array<{ title: string; cards?: unknown[] }> };
  const by = (title: string) => body.decks.find(deck => deck.title === title);
  assert.equal(by('Known')?.cards?.length, 15);
  assert.deepEqual((by('Known')?.cards as unknown[])[0], { id: 'FUN_0', name: 'Карта 0', cost: 0, count: 1 });
  assert.equal(by('Wild known')?.cards?.length, 15);
  assert.ok(body.decks.every(deck => !('candidateSourceId' in deck)), 'the internal source id is not public');
  assert.ok(by('Unknown'), 'the deck stays in the selection');
  assert.equal(by('Unknown')?.cards, undefined, 'a deck the catalog cannot name has no list, not a half one');
  assert.deepEqual([...new Set(formatsAsked)].sort(), ['standard', 'wild'], 'each deck reads the catalog of its own format');
  assert.equal(formatsAsked.length, 2, 'one catalog read per format, not per deck');

  catalogFails = true;
  const degraded = await fetch(`http://127.0.0.1:${port}/api/fun-decks`);
  assert.equal(degraded.status, 200, 'a failing catalog does not take the selection down');
  const degradedBody = await degraded.json() as { decks: Array<{ cards?: unknown }> };
  assert.equal(degradedBody.decks.length, 3);
  assert.ok(degradedBody.decks.every(deck => deck.cards === undefined));
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
}
