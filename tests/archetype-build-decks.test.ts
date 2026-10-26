import assert from 'node:assert/strict';
import { resolveBuildCards } from '../src/features/archetypeBuildDecks.js';

// The compared builds' lists: one request per build and page, a failure forgotten for «Повторить».
const requests: string[] = [];
let answer: 'ok' | 'fail' = 'fail';
globalThis.fetch = (async (input: RequestInfo | URL) => {
  requests.push(String(input));
  return answer === 'ok'
    ? new Response(JSON.stringify({ ok: true, cards: [{ dbfId: 1, id: 'C_1', name: 'Искроцвет', cost: 0, count: 2 }] }), { status: 200 })
    : new Response('{"error":"Не удалось разобрать колоду"}', { status: 503 });
}) as typeof fetch;

await assert.rejects(resolveBuildCards('AAECODE', 'wild', 'Big Shaman'));
answer = 'ok';
const cards = await resolveBuildCards('AAECODE', 'wild', 'Big Shaman');
assert.equal(requests.length, 2, 'a failed list is requested again on the next read');
assert.deepEqual(cards.map(card => card.name), ['Искроцвет']);
assert.equal(await resolveBuildCards('AAECODE', 'wild', 'Big Shaman'), cards, 'a resolved list is read from memory');
assert.equal(requests.length, 2);
assert.equal(requests[0], '/api/deck/resolve?code=AAECODE&format=wild&archetype=Big+Shaman');
await resolveBuildCards('AAECODE', 'standard', 'Big Shaman');
assert.equal(requests.length, 3, 'the format is part of the list');
console.log('archetype build decks: ok');
