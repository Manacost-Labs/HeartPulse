import assert from 'node:assert/strict';
import { encode } from '@firestone-hs/deckstrings';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConstructedCardDataService } from '../server/constructedCardRoutes.js';

const card = {
  card_id: 'CARD_1', dbf: 1, name: { ru: 'Альфа', en: 'Alpha' }, card_set: 'CORE',
  card_type: { slug: 'MINION', name_ru: 'Существо' }, class: 'MAGE', multi_class: [], rarity: 'COMMON',
  mana_cost: 2, attack: 3, health: 4, mechanics: [], referenced_tags: [],
  images: { card: 'https://cdn.example.test/CARD_1.png' },
};
const deckCode = encode({
  format: 2,
  heroes: [637],
  cards: Array.from({ length: 30 }, (_, index) => [index + 1, 1] as [number, number]),
});
const deckRows = Array.from({ length: 1_400 }, (_, index) => ({
  id: `deck-${index + 1}`, archetype: 'Test Mage', class: 'Mage', format: 'Standard',
  deck_code: deckCode, updated_at: '2026-10-27T08:00:00.000Z',
}));
const relatedIds = Array.from({ length: 12 }, (_, index) => `RELATED_${index + 1}`);

// Counts concurrent in-flight calls per kind; each call yields long enough to overlap.
const active = { decks: 0, related: 0 };
const peak = { decks: 0, related: 0 };
const started = { decks: 0, related: 0 };
async function track<T>(kind: keyof typeof active, produce: () => T): Promise<T> {
  active[kind] += 1;
  started[kind] += 1;
  peak[kind] = Math.max(peak[kind], active[kind]);
  await new Promise(resolve => setTimeout(resolve, 5));
  active[kind] -= 1;
  return produce();
}

const directory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-fanout-'));
try {
  const service = createConstructedCardDataService({
    stateDirectory: directory,
    now: () => Date.parse('2026-10-27T09:00:00.000Z'),
    catalogPageConcurrency: 3,
    maxCatalogStaleMs: 48 * 60 * 60_000,
    minimumCatalogCardsByFormat: { standard: 1, wild: 1 },
    catalogBaseUrl: 'https://db.example.test/api/v1',
    statsDatasetByFormat: { standard: 'standard-cards', wild: 'wild-cards' },
    statsBaseUrl: 'https://stats.example.test',
    constructedDecksUrl: 'https://decks.example.test/v1/constructed/decks',
    fetchJson: async url => {
      const parsed = new URL(url);
      if (parsed.hostname === 'db.example.test' && parsed.pathname.endsWith('/constructed-cards')) {
        return { data: [card], updated_at: '2026-10-27T08:55:00.000Z', pagination: { page: 1, total: 1, total_pages: 1 } };
      }
      if (parsed.hostname === 'db.example.test' && parsed.pathname.endsWith('/constructed-cards/CARD_1')) {
        return { data: { ...card, wiki: { patch_changes: [], related_cards: relatedIds.map(card_id => ({ card_id })) } } };
      }
      if (parsed.hostname === 'db.example.test' && parsed.pathname.includes('/constructed-cards/RELATED_')) {
        const cardId = decodeURIComponent(parsed.pathname.split('/').pop() || '');
        return track('related', () => ({ data: { ...card, card_id: cardId } }));
      }
      if (parsed.hostname === 'stats.example.test') {
        return { fetched_at: '2026-10-27T08:55:00.000Z', url: 'https://hsreplay.net/cards/', view: { cards: [] } };
      }
      if (parsed.hostname === 'decks.example.test') {
        const offset = Number(parsed.searchParams.get('offset') ?? 0);
        const page = { data: deckRows.slice(offset, offset + 200), meta: { count: deckRows.length, limit: 200, offset } };
        return offset === 0 ? page : track('decks', () => page);
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  });

  const detail = await service.loadCardDetail('standard', 'CARD_1');
  assert.ok(detail, 'the card detail must load');
  assert.equal(detail.partial, false, 'bounded fan-out must still read every deck page');
  assert.equal(started.decks, 6, 'all remaining deck pages are requested');
  assert.ok(peak.decks <= 3, `deck pages must respect catalogPageConcurrency, saw ${peak.decks}`);
  assert.ok(peak.decks > 1, 'deck pages still run in parallel');
  assert.equal(started.related, relatedIds.length, 'every missing related card is requested');
  assert.ok(peak.related <= 3, `related cards must respect catalogPageConcurrency, saw ${peak.related}`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log('constructed card fan-out limit tests passed');
