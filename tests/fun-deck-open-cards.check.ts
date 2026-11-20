import assert from 'node:assert/strict';
import express from 'express';
import { encode } from '@firestone-hs/deckstrings';
import { createPublicFunDecksRouter } from '../server/adminFunDecksRoutes.js';

/**
 * The open fun-deck selection carries each deck's card list, decoded from its
 * code, and never drops a deck: a card the catalog lacks is named from the
 * dictionary without a page, a card nobody knows keeps its place, a failed
 * catalog serves the last good one, and without any a deck keeps its code.
 */
const cardRows = Array.from({ length: 16 }, (_, index) => ({
  card_id: `FUN_${index}`, dbf: 2000 + index, name: { ru: `Карта ${index}`, en: `Card ${index}` },
  mana_cost: index % 8, rarity: index === 0 ? 'LEGENDARY' : 'COMMON',
}));
const cardsOf = (extra: number[]) => encode({ heroes: [7], format: 2,
  cards: [...cardRows.slice(0, 14).map((card, index) => [card.dbf, index === 0 ? 1 : 2] as [number, number]), ...extra.map(dbf => [dbf, 1] as [number, number])] });
const known = cardsOf([]);
const withToken = cardsOf([777_001]); // in the dictionary only (not collectible)
const withStranger = cardsOf([777_002]); // in no dictionary
const dictionary = { TIME_609t1: { dbfId: 777_001, id: 'TIME_609t1', name: 'Рейнджер-капитан Алерия', mana: 3 } };

let catalogFails = false;
let dictionaryFails = false;
const formatsAsked: string[] = [];
const app = express();
app.use('/api', createPublicFunDecksRouter({
  loadFunDecks: async () => ({ data: { structured: { rows: [
    { title: 'Known', deck_code: known, format: 'Standard', candidate_source_id: 'internal_source' },
    { title: 'Wild known', deck_code: known, format: 'Wild' },
    { title: 'Token', deck_code: withToken, format: 'Standard' },
    { title: 'Stranger', deck_code: withStranger, format: 'Standard' },
    { title: 'Garbled', deck_code: 'A'.repeat(40), format: 'Standard' },
  ] } } }),
  loadCardCatalog: async format => {
    formatsAsked.push(format);
    if (catalogFails) throw new Error('catalog down');
    return { cards: cardRows };
  },
  loadCardDictionaries: async () => {
    if (dictionaryFails) throw new Error('dictionary down');
    return [dictionary];
  },
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const { port } = server.address() as { port: number };
type Card = { id: string | null; name: string | null; cost: number | null; count: number; hasPage: boolean };
type Deck = { title: string; cards?: Card[] };
const read = async () => (await (await fetch(`http://127.0.0.1:${port}/api/fun-decks`)).json() as { decks: Deck[] }).decks;
try {
  let decks = await read();
  const by = (title: string) => decks.find(deck => deck.title === title);
  assert.deepEqual(decks.map(deck => deck.title).sort(), ['Garbled', 'Known', 'Stranger', 'Token', 'Wild known'], 'no deck is dropped');
  assert.equal(by('Known')?.cards?.length, 14);
  assert.deepEqual(by('Known')?.cards?.[0], { id: 'FUN_0', name: 'Карта 0', cost: 0, count: 1, hasPage: true });
  assert.ok(decks.every(deck => !('candidateSourceId' in deck)), 'the internal source id is not public');
  const token = by('Token')?.cards?.find(card => card.id === 'TIME_609t1');
  assert.deepEqual(token, { id: 'TIME_609t1', name: 'Рейнджер-капитан Алерия', cost: 3, count: 1, hasPage: false }, 'a card outside the catalog is named, without a page');
  assert.equal(by('Token')?.cards?.length, 15);
  assert.deepEqual(by('Stranger')?.cards?.find(card => card.name === null), { id: null, name: null, cost: null, count: 1, hasPage: false }, 'a card nobody knows keeps its place');
  assert.equal(by('Garbled')?.cards, undefined, 'a code that does not decode has no list, and stays');
  assert.equal(formatsAsked.length, 2, 'one catalog read per format');

  // A failing catalog serves the last good one; a failing dictionary only leaves the extra cards unnamed.
  catalogFails = true; dictionaryFails = true;
  decks = await read();
  assert.equal(decks.length, 5);
  assert.equal(by('Known')?.cards?.length, 14, 'the last good catalog answers');
  assert.equal(by('Token')?.cards?.find(card => card.count === 1 && card.hasPage === false)?.name, null, 'without the dictionary the token has no name');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
}

// No catalog has ever answered: every deck still comes with its code.
const cold = express();
cold.use('/api', createPublicFunDecksRouter({
  loadFunDecks: async () => ({ data: { structured: { rows: [{ title: 'Known', deck_code: known, format: 'Standard' }, { title: 'Wild', deck_code: known, format: 'Wild' }] } } }),
  loadCardCatalog: async () => { throw new Error('catalog down'); },
}));
const coldServer = cold.listen(0, '127.0.0.1');
await new Promise<void>(resolve => coldServer.once('listening', resolve));
try {
  const response = await fetch(`http://127.0.0.1:${(coldServer.address() as { port: number }).port}/api/fun-decks`);
  assert.equal(response.status, 200);
  const body = await response.json() as { decks: Array<Deck & { deckCode: string }> };
  assert.equal(body.decks.length, 2);
  assert.ok(body.decks.every(deck => deck.deckCode === known && deck.cards === undefined));
} finally {
  await new Promise<void>((resolve, reject) => coldServer.close(error => (error ? reject(error) : resolve())));
}
