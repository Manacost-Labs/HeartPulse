import http from 'node:http';
import { closeLocal, listenLocal } from './publicCardFixture.mjs';

const archetype = (slug, games) => ({
  slug, archetype: slug, archetypeLabel: `Архетип ${slug}`, translated: true, classKey: 'priest', format: 'standard',
  games, winrate: 52.1, popularity: 4.2, turns: 8, durationMinutes: 7, climbingSpeed: 1, deckCount: 3,
  sourceUrl: 'https://www.hsguru.com/meta', builds: [],
});
const funDeck = (code, firstSeenAt) => ({
  title: `Колода ${code}`, deckCode: code, format: 'Standard', className: 'mage', streamer: null, funScore: 0.7,
  maxMetaSimilarity: 0.3, nearestArchetype: null, winRate: 51, games: 120, reasons: ['Необычная идея'], url: null,
  firstSeenAt, lastSeenAt: null,
});
/** The decks in order of their first sighting, oldest first; a guest is shown the newest three. */
export const funDecksPayload = codes => ({
  fetchedAt: '2026-10-03T10:00:00.000Z', stats: { total: codes.length, standard: codes.length, wild: 0 },
  methodology: { detectorVersion: 'v3', minFunScore: 0.55, maxMetaSimilarity: 0.42 },
  decks: codes.map((code, index) => funDeck(code, `2026-10-${String(index + 1).padStart(2, '0')}`)),
});
const label = slug => ({ slug, nameRu: `Метка ${slug}` });
const cosmetics = {
  heroes: Array.from({ length: 24 }, (_, i) => ({
    cardId: `HERO_${i}`, dbf: 5000 + i, name: { ru: `Облик героя номер ${i}`, en: `Hero skin ${i}` }, class: label('mage'),
    rarity: label('epic'), categorySlugs: [], images: { static: null, animated: null },
  })),
  coins: Array.from({ length: 24 }, (_, i) => ({
    cardId: `COIN_${i}`, dbf: 6000 + i, name: { ru: `Монета номер ${i}`, en: `Coin ${i}` }, textRu: 'Косметическая монета для игры',
    images: { card: null, crop: null },
  })),
  pets: Array.from({ length: 24 }, (_, i) => ({
    petId: i + 1, name: `Питомец номер ${i}`, variants: [{ cardId: `PET_${i}`, dbf: 7000 + i, variantId: 1, name: `Питомец ${i}`, level: 1, images: { card: null } }],
  })),
};
const cosmeticsPage = items => ({ items, pagination: { page: 1, perPage: 24, total: items.length, totalPages: 1 }, updatedAt: null, source: 'fixture' });

/**
 * A stand for the Express that Next reads: it forwards to a real Express (`upstreamOrigin`) and answers a few
 * projections that the fixture backend has no data for. `setDelay` makes every `/api/` answer late, `setDown`
 * makes it a 503; both apply to what the server reads, and `routes` can be replaced to change the data.
 */
export async function startSlowExpress(upstreamOrigin) {
  const upstream = new URL(upstreamOrigin);
  const state = { delay: 0, down: false, reads: [] };
  const routes = {
    '/api/constructed-archetypes/teaser': () => ({
      format: 'standard', formatLabel: 'Стандарт', patch: '36.6.3', minimumGames: 50, updatedAt: '2026-10-03T21:30:00.000Z',
      coverage: {}, items: Array.from({ length: 40 }, (_, i) => archetype(`fixture-${i}`, 9000 - i)),
    }),
    '/api/fun-decks': () => funDecksPayload(['PAID_DECK_OLDEST', 'PAID_DECK_OLD', 'FREE_DECK_C', 'FREE_DECK_A', 'FREE_DECK_B']),
    '/api/home/summary': () => ({
      topClasses: ['mage', 'priest', 'druid', 'hunter', 'rogue', 'shaman', 'warlock', 'warrior', 'paladin', 'demonhunter', 'deathknight']
        .map(id => ({ id, name: `Класс ${id}`, winrate: 51.5 })),
    }),
    '/api/articles': () => ({
      updatedAt: '2026-10-03T10:00:00.000Z',
      articles: Array.from({ length: 6 }, (_, i) => ({
        id: `stand-${i}`, title: `Статья стенда номер ${i}`, date: '2026-10-01', image: '', tag: 'Гайд', mode: 'standard',
        excerpt: 'Короткое описание статьи, которое видно на главной странице рядом с её названием и датой.',
        url: `/articles/stand-${i}/`, likes: 3, dislikes: 0,
      })),
    }),
    '/api/cosmetics/heroes': () => cosmeticsPage(cosmetics.heroes),
    '/api/cosmetics/coins': () => cosmeticsPage(cosmetics.coins),
    '/api/cosmetics/pets': () => cosmeticsPage(cosmetics.pets),
  };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://stand');
    state.reads.push({ path: `${url.pathname}${url.search}`, cookie: request.headers.cookie ?? '', authorization: request.headers.authorization ?? '' });
    const answer = () => {
      if (state.down) { response.writeHead(503).end('{"error":"Stand outage"}'); return; }
      const route = routes[url.pathname];
      if (route) { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(route(request))); return; }
      const forwarded = http.request({ host: upstream.hostname, port: upstream.port, path: request.url, method: request.method, headers: request.headers },
        incoming => { response.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(response); });
      forwarded.on('error', () => response.writeHead(502).end());
      request.pipe(forwarded);
    };
    if (url.pathname.startsWith('/api/') && state.delay) setTimeout(answer, state.delay);
    else answer();
  });
  const origin = await listenLocal(server);
  return {
    origin, state, routes,
    setDelay(ms) { state.delay = ms; },
    setDown(down) { state.down = down; },
    close: () => closeLocal(server),
  };
}
