import assert from 'node:assert/strict';
import express from 'express';
import {
  createPublicApiRouter,
  type ApiKeyManager,
  type PublicBattlegroundStatisticsSource,
} from '../server/modules/publicApi/public.js';

const calls: string[] = [];
let failLoads = false;

const battlegroundStatistics: PublicBattlegroundStatisticsSource = {
  loadHeroes: async () => {
    calls.push('heroes');
    if (failLoads) throw new Error('PRIVATE_BG_PROVIDER_FAILURE');
    return {
      fetched_at: '2026-07-30T11:30:00.000Z',
      site: 'private-provider.example',
      url: 'https://private-provider.example/heroes',
      view: {
        filters: {
          mmr_percentile: 'TOP_50_PERCENT',
          time_range: 'LAST_7_DAYS',
        },
        heroes: [
          {
            hero: 'Millificent Manastorm',
            dbfId: 57_946,
            pick_rate: '45.57%',
            best_comp: 'Mechs',
            best_composition_id: 8,
            avg_placement: '3.88',
            tier: 'S',
            placement_distribution: [
              '20.98%', '16.60%', '12.35%', '10.67%',
              '10.27%', '10.01%', '9.92%', '9.21%',
            ],
            image: 'https://private-provider.example/hero.png',
            hero_power: { private: true },
          },
          {
            hero: 'Test Hero',
            dbfId: 60_000,
            pick_rate: '2.10%',
            best_comp: 'Beasts',
            avg_placement: '4.72',
            tier: 'D',
            placement_distribution: [
              '8%', '9%', '10%', '11%', '12%', '14%', '17%', '19%',
            ],
          },
        ],
      },
    };
  },
  loadMinions: async () => {
    calls.push('minions');
    if (failLoads) throw new Error('PRIVATE_BG_PROVIDER_FAILURE');
    return {
      latest_run: {
        id: 12,
        source: 'private-provider.example',
        mmr_percentile: 'TOP_50_PERCENT',
        time_range: 'LAST_7_DAYS',
        completed_at: '2026-07-30T11:35:00.000Z',
        error: 'must not leak',
      },
      total: 2,
      minions: [
        {
          snapshot_id: 2_870,
          run_id: 12,
          fetched_at: '2026-07-30T11:35:00.000Z',
          dbf_id: 61_049,
          card_id: 'BGS_049',
          name: 'Freedealing Gambler',
          name_ru: 'Картежница',
          tavern_tier: 2,
          impact: 0.29,
          combat_winrate: 45.38,
          popularity: 7.78,
          games_with_minion: 173_043,
          games_without_minion: 2_049_761,
          avg_placement_with: 3.65,
          avg_placement_without: 3.94,
          privateField: true,
        },
        {
          dbf_id: 104_466,
          card_id: 'BG28_550',
          name: 'Rodeo Performer',
          name_ru: 'Звезда родео',
          tavern_tier: 5,
          impact: 0.45,
          combat_winrate: 50.75,
          popularity: 7.27,
          games_with_minion: 109_242,
          games_without_minion: 1_394_150,
          avg_placement_with: 3.29,
          avg_placement_without: 3.73,
        },
      ],
    };
  },
  loadTierLists: async () => {
    calls.push('tier-lists');
    if (failLoads) throw new Error('PRIVATE_BG_PROVIDER_FAILURE');
    return {
      generatedAt: '2026-07-30T11:40:00.000Z',
      strategySource: 'private-provider.example',
      lists: {
        heroes: {
          source: 'private-provider.example',
          fetchedAt: '2026-07-30T11:30:00.000Z',
          tiers: {},
        },
        minions: {
          source: 'private-provider.example',
          fetchedAt: '2026-07-30T11:35:00.000Z',
          tiers: {},
        },
        spells: {
          source: 'private-provider.example',
          fetchedAt: '2026-07-30T11:36:00.000Z',
          tiers: {
            S: [{
              id: 'BG31_243',
              dbfId: 119_470,
              name: 'Портал в фонтане',
              tavernTier: 3,
              avgPlacement: 1,
              avgPlacementOther: 4.006,
              impact: 3.006,
              totalPlayed: 8,
              image: 'https://private-provider.example/spell.png',
            }],
          },
        },
        trinkets: {
          source: 'private-provider.example',
          fetchedAt: '2026-07-30T11:37:00.000Z',
          tiers: {
            A: [{
              id: 'TRINKET_001',
              dbfId: 121_182,
              name: 'Beetle Band',
              localizedName: 'Жучиное кольцо',
              size: 'LARGE',
              cost: 5,
              pickRate: '14.6%',
              avgPlacement: 2.62,
              games: 50,
              placementDistribution: [
                { place: 1, rate: '38%' },
                { place: 2, rate: '16%' },
              ],
              upstreamImage: 'https://private-provider.example/trinket.png',
            }],
          },
        },
        strategies: {
          source: 'private-provider.example',
          fetchedAt: '2026-07-30T11:38:00.000Z',
          tiers: {
            S: [{
              key: 'firestone-mech-magnet',
              title: 'Mech Magnet',
              difficulty: 'Легкая',
              archetype: 'Механизмы',
              archetypeKey: 'mech',
              avgPlacement: 2.86,
              games: 11_260,
              popularity: '4.2%',
              firstPlace: '22.1%',
              url: 'https://private-provider.example/composition',
              cards: [{ cardId: 'PRIVATE_CARD' }],
            }],
          },
        },
      },
    };
  },
};

const apiKeys: ApiKeyManager = {
  create: () => { throw new Error('not used'); },
  list: () => [],
  revoke: () => null,
  authenticate: (key, requiredScope) => {
    if (key === 'statistics-key' && requiredScope === 'statistics.read') {
      return {
        id: 'api_key_statistics',
        name: 'Battleground statistics integration',
        prefix: 'mca_live_statistics',
        scopes: ['statistics.read'],
        createdAt: '2026-07-30T10:00:00.000Z',
        createdBy: 'admin-1',
        lastUsedAt: '2026-07-30T10:00:00.000Z',
        revokedAt: null,
        status: 'ACTIVE',
      };
    }
    return key ? 'FORBIDDEN' : null;
  },
};

const app = express();
app.use('/api/v1', createPublicApiRouter({ apiKeys, battlegroundStatistics }));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}/api/v1`;
const headers = { 'X-API-Key': 'statistics-key' };

try {
  const unauthenticated = await fetch(`${origin}/battlegrounds/statistics/heroes`);
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(calls, [], 'authentication must run before loading Battlegrounds statistics');

  const heroes = await fetch(
    `${origin}/battlegrounds/statistics/heroes?tier=S&minPickRate=10`,
    { headers },
  );
  assert.equal(heroes.status, 200);
  const heroesPayload = await heroes.json() as Record<string, any>;
  assert.equal(heroesPayload.data.length, 1);
  assert.equal(heroesPayload.data[0].heroId, '57946');
  assert.equal(heroesPayload.data[0].metrics.pickRatePercent, 45.57);
  assert.equal(heroesPayload.data[0].metrics.averagePlacement, 3.88);
  assert.equal(heroesPayload.data[0].bestComposition.name, 'Mechs');
  assert.equal(heroesPayload.meta.sample.mmrPercentile, 'TOP_50_PERCENT');
  assert.equal(JSON.stringify(heroesPayload).includes('private-provider'), false);
  assert.equal(JSON.stringify(heroesPayload).includes('hero_power'), false);

  const minions = await fetch(
    `${origin}/battlegrounds/statistics/minions?tavernTier=2&minGames=100000`,
    { headers },
  );
  assert.equal(minions.status, 200);
  const minionsPayload = await minions.json() as Record<string, any>;
  assert.equal(minionsPayload.data.length, 1);
  assert.equal(minionsPayload.data[0].cardId, 'BGS_049');
  assert.equal(minionsPayload.data[0].localizedName, 'Картежница');
  assert.equal(minionsPayload.data[0].metrics.impact, 0.29);
  assert.equal(minionsPayload.data[0].metrics.combatWinratePercent, 45.38);
  assert.equal(minionsPayload.data[0].metrics.gamesWithMinion, 173_043);
  assert.equal(JSON.stringify(minionsPayload).includes('snapshot_id'), false);
  assert.equal(JSON.stringify(minionsPayload).includes('privateField'), false);

  const spells = await fetch(
    `${origin}/battlegrounds/statistics/tier-lists/spells?tier=S`,
    { headers },
  );
  assert.equal(spells.status, 200);
  const spellsPayload = await spells.json() as Record<string, any>;
  assert.equal(spellsPayload.data[0].entityId, 'BG31_243');
  assert.equal(spellsPayload.data[0].metrics.averagePlacement, 1);
  assert.equal(spellsPayload.data[0].metrics.games, 8);

  const trinkets = await fetch(
    `${origin}/battlegrounds/statistics/tier-lists/trinkets`,
    { headers },
  );
  assert.equal(trinkets.status, 200);
  const trinketsPayload = await trinkets.json() as Record<string, any>;
  assert.equal(trinketsPayload.data[0].localizedName, 'Жучиное кольцо');
  assert.deepEqual(trinketsPayload.data[0].metrics.placementDistributionPercent, [38, 16]);

  const strategies = await fetch(
    `${origin}/battlegrounds/statistics/tier-lists/strategies?minGames=1000`,
    { headers },
  );
  assert.equal(strategies.status, 200);
  const strategiesPayload = await strategies.json() as Record<string, any>;
  assert.equal(strategiesPayload.data[0].entityId, 'firestone-mech-magnet');
  assert.equal(strategiesPayload.data[0].archetype.id, 'mech');
  assert.equal(strategiesPayload.data[0].metrics.firstPlacePercent, 22.1);
  assert.equal(JSON.stringify(strategiesPayload).includes('private-provider'), false);
  assert.equal(JSON.stringify(strategiesPayload).includes('PRIVATE_CARD'), false);

  for (const path of [
    '/battlegrounds/statistics/heroes?tier=Z',
    '/battlegrounds/statistics/heroes?minPickRate=-1',
    '/battlegrounds/statistics/minions?tavernTier=9',
    '/battlegrounds/statistics/minions?limit=501',
    '/battlegrounds/statistics/tier-lists/private',
    '/battlegrounds/statistics/tier-lists/strategies?minGames=-1',
  ]) {
    const invalid = await fetch(`${origin}${path}`, { headers });
    assert.equal(invalid.status, 400, path);
  }

  failLoads = true;
  const unavailable = await fetch(`${origin}/battlegrounds/statistics/heroes`, { headers });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), {
    error: {
      code: 'BATTLEGROUNDS_STATISTICS_UNAVAILABLE',
      message: 'Battlegrounds statistics are temporarily unavailable',
    },
  });
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

console.log('public API Battlegrounds statistics contract tests passed');
