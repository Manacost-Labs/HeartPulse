import assert from 'node:assert/strict';
import express from 'express';
import {
  createPublicApiRouter,
  type ApiKeyManager,
  type PublicArenaStatisticsSource,
  type PublicBattlegroundStatisticsSource,
} from '../server/modules/publicApi/public.js';

const arenaStatistics: PublicArenaStatisticsSource = {
  loadClasses: async () => ({
    updatedAt: '2026-07-30T12:00:00.000Z',
    dataPoints: 47_000,
    timePeriod: 'last-patch',
    classes: [{
      id: 'mage',
      name: 'Маг',
      winrate: 54.8,
      games: 12_345,
      wins: 6_765,
      losses: 5_580,
      pickRate: 11.4,
      sevenPlusWinsRate: 24.7,
      heroPowerCardId: 'HERO_08bp',
      winsDistribution: [
        { wins: 0, games: 1_000 },
        { wins: 1, games: 2_000 },
      ],
      matchups: [{
        opponentClassId: 'rogue',
        opponentHeroPowerCardId: 'HERO_03bp',
        games: 2_500,
        wins: 1_375,
        losses: 1_125,
        winrate: 55,
      }],
    }],
  }),
  loadCards: async () => ({
    updatedAt: '2026-07-30T12:00:00.000Z',
    sections: [{
      id: 'mage',
      tiers: [{
        tier: 'S',
        cards: [{
          cardId: 'TEST_001',
          name: 'Полная карта',
          classKey: 'mage',
          deckWinrate: 58.4,
          playedWinrate: 61.2,
          pickRate: 28.1,
          inDecks: 42.5,
          totalGames: 15_000,
          arenaScore: 132,
          arenaSmithTier: 'S',
          arenaSmithTierPosition: 'S',
          arenaSmithRank: 7,
          offerRate: 18.7,
          discardRate: 4.2,
          drawnWinrate: 59.1,
          mulliganWinrate: 55.4,
          keptRate: 72.2,
          avgCopies: 1.34,
        }],
      }],
    }],
  }),
  loadLegendaries: async () => ({
    updatedAt: '2026-07-30T12:00:00.000Z',
    groups: [{
      keyCard: {
        cardId: 'LEG_001',
        name: 'Ключевая легендарная карта',
        classKey: 'mage',
        totalGames: 3_000,
        deckWinrate: 57.3,
        playedWinrate: 59.8,
        drawnWinrate: 58.1,
        mulliganWinrate: 55.1,
        keptRate: 66.4,
        pickRate: 33.4,
        offerRate: 9.1,
        arenaScore: 126,
        arenaSmithRank: 12,
      },
      cards: [{
        cardId: 'TOKEN_001',
        name: 'Связанная карта',
        totalGames: 2_100,
        deckWinrate: 56.1,
        playedWinrate: 60.2,
        pickRate: 31.2,
        offerRate: 8.4,
        arenaScore: 119,
      }],
      winRate: 57.3,
      pickRate: 33.4,
      offerRate: 9.1,
      score: 126,
      classKey: 'mage',
      byClass: {
        mage: { winRate: 58.2, pickRate: 34.2, offerRate: 9.4, score: 129 },
        all: { winRate: 57.3, pickRate: 33.4, offerRate: 9.1, score: 126 },
      },
    }],
  }),
  loadMatchups: async source => ({
    updatedAt: '2026-07-30T12:00:00.000Z',
    source,
    matchups: [{
      classAId: 'mage',
      classBId: 'rogue',
      winrate: 53.2,
      games: 7_500,
    }],
  }),
};

const battlegroundCalls: Array<{ method: string; input?: unknown }> = [];
const battlegroundStatistics: PublicBattlegroundStatisticsSource = {
  loadHeroes: async selection => {
    battlegroundCalls.push({ method: 'heroes', input: selection });
    return {
      fetched_at: '2026-07-30T12:10:00.000Z',
      view: {
        mode: 'duos',
        filters: {
          mmr_percentile: 'TOP_1_PERCENT',
          time_range: 'CURRENT_BATTLEGROUNDS_PATCH',
        },
        heroes: [{
          hero: 'Millificent Manastorm',
          dbfId: 57_946,
          id: 'TB_BaconShop_HERO_17',
          pick_rate: '45.57%',
          pick_rate_value: 45.57,
          avg_placement: 3.88,
          adjusted_avg_placement: 3.81,
          anomaly_adjusted: true,
          best_composition_id: 8,
          best_composition: 'Механизмы',
          hero_power: {
            dbf: 57_949,
            card: { name: 'Изобретательность' },
          },
          key_minions_top3: [{
            id: 'BGS_071',
            dbfId: 61_930,
            name: 'Deflect-o-Bot',
            techLevel: 3,
          }],
          tier: 'S',
          placement_distribution: [
            '20.98%', '16.60%', '12.35%', '10.67%',
            '10.27%', '10.01%', '9.92%', '9.21%',
          ],
        }],
      },
    };
  },
  loadHeroDetails: async (heroId, selection) => {
    battlegroundCalls.push({ method: `hero:${heroId}`, input: selection });
    return {
      fetched_at: '2026-07-30T12:11:00.000Z',
      stats: {
        hero: {
          hero: 'Millificent Manastorm',
          dbfId: 57_946,
          id: 'TB_BaconShop_HERO_17',
          tier: 'S',
          pick_rate_value: 45.57,
          avg_placement: 3.88,
          adjusted_avg_placement: 3.81,
          anomaly_adjusted: true,
          placement_distribution: [
            '20.98%', '16.60%', '12.35%', '10.67%',
            '10.27%', '10.01%', '9.92%', '9.21%',
          ],
          best_composition_id: 8,
          best_composition: 'Механизмы',
          key_minions_top3: [{
            id: 'BGS_071',
            dbfId: 61_930,
            name: 'Deflect-o-Bot',
            techLevel: 3,
          }],
        },
        mode: 'duos',
        filters: {
          mmr_percentile: 'TOP_1_PERCENT',
          time_range: 'CURRENT_BATTLEGROUNDS_PATCH',
        },
        as_of: {
          tavern_up: '2026-07-30T12:00:00.000Z',
          hero_power: '2026-07-30T12:00:00.000Z',
          combat_winrate: '2026-07-30T12:00:00.000Z',
          composition_stats: '2026-07-30T12:00:00.000Z',
        },
        tavern_up: [{
          turn: 2,
          tavern_tier: 2,
          occurrences: 12_000,
          pct_at_tier: 96.53,
          num_games: 12_391,
        }],
        tavern_up_by_turn: [{
          turn: 2,
          recommended_tavern_tier: 2,
          pct_at_tier: 96.53,
          num_games: 12_391,
        }],
        hero_power: [{
          turn: 5,
          tavern_tier: 4,
          gold: 7,
          end_of_round_median_tavern_tier: 4,
          times_invoked: 8_705,
          invoked_rate: 93.64,
          total_data_points: 9_296,
        }],
        hero_power_by_turn: [{
          turn: 5,
          invoked_rate: 71.44,
          total_data_points: 12_292,
        }],
        combat_winrate: [{
          combat_round: 8,
          data_points: 44_715,
          combat_winrate: 62.11,
        }],
        compositions: [{
          composition_id: 8,
          name: 'Механизмы',
          num_games: 46_925,
          avg_placement: 3.619,
          placement_distribution: ['24.04%', '18%', '13.18%', '10.59%'],
          confidence_interval: 0.03,
          popularity_value: 92.75,
          popularity_first_place: '96.29%',
          popularity_top_4: '94.24%',
          is_recent: true,
          num_days: 58,
          lineup: [{
            id: 'BGS_071',
            dbfId: 61_930,
            minion_dbf_id: 61_930,
            zone_position: 2,
            premium: false,
            attack: 2_909,
            health: 1_888,
            taunt: false,
            poison: false,
            divine_shield: true,
          }],
          final_form_minions: [{
            id: 'BGS_071',
            dbfId: 61_930,
            minion_dbf_id: 61_930,
            tavern_tier: 7,
            at_least_one: '35.43%',
            more_than_one: '8%',
            at_least_one_premium: '16.92%',
            normal_attack_avg: 1_085,
            normal_health_avg: 1_032,
            premium_attack_avg: 1_262,
            premium_health_avg: 1_163,
            divine_shield_buff_freq: '0%',
            taunt_buff_freq: '7.8%',
            poison_buff_freq: '0%',
            position_freq: ['28.52%', '32.43%', '22.82%'],
          }],
        }],
        best_composition: {
          composition_id: 8,
          name: 'Механизмы',
          num_games: 46_925,
          avg_placement: 3.619,
          popularity_value: 92.75,
        },
        source_url: 'https://private-provider.example/must-not-leak',
      },
    };
  },
  loadMinions: async () => ({
    latest_run: {
      mmr_percentile: 'TOP_50_PERCENT',
      time_range: 'LAST_7_DAYS',
      completed_at: '2026-07-30T12:12:00.000Z',
    },
    minions: [],
  }),
  loadMinionHistory: async dbfId => {
    battlegroundCalls.push({ method: `minion-history:${dbfId}` });
    const recentObservation = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return {
      minion: {
        dbf_id: 61_049,
        card_id: 'BGS_049',
        name: 'Freedealing Gambler',
        name_ru: 'Картежница',
        tavern_tier: 2,
        first_seen_at: '2026-06-22T13:02:06.000Z',
        updated_at: '2026-07-30T12:12:00.000Z',
        raw_card_json: { private: true },
      },
      history: [{
        fetched_at: recentObservation,
        impact: 0.31,
        combat_winrate: 45.83,
        popularity: 7.67,
        games_with_minion: 169_092,
        avg_placement_with: 3.62,
        avg_placement_without: 3.94,
        tavern_tier: 2,
      }],
      chart_series: {
        impact: [{ x: recentObservation, y: 0.31 }],
      },
    };
  },
  loadSpells: async () => ({
    fetched_at: '2026-07-30T12:13:00.000Z',
    view: {
      last_update_date: '2026-07-30T12:13:00.000Z',
      total_data_points: 143_340,
      tiers: {
        1: [{
          id: 'BG28_503',
          card_id: 'BG28_503',
          dbfId: 103_791,
          name: 'Укрепление',
          tavern_tier: 1,
          total_played: 143_340,
          average_placement: 3.4647,
          average_placement_other: 4.2254,
          impact: 0.7607,
          image_url: 'https://private-provider.example/spell.png',
        }],
      },
    },
  }),
  loadTierLists: async selection => {
    battlegroundCalls.push({ method: 'tier-lists', input: selection });
    return {
      list: 'trinkets',
      fetchedAt: '2026-07-30T12:14:00.000Z',
      mmr: 'TOP_20_PERCENT',
      timeRange: 'LAST_7_DAYS',
      gamesNote: 'rounded lower bound',
      tiers: {
        A: [{
          id: 'TRINKET_001',
          dbfId: 121_182,
          name: 'Beetle Band',
          size: 'LARGE',
          cost: 5,
          pickRate: '14.6%',
          avgPlacement: 2.62,
          games: 50,
          gamesIsMinimum: true,
          placementDistribution: [
            { place: 1, rate: '38%' },
            { place: 2, rate: '16%' },
          ],
        }],
      },
    };
  },
};

const apiKeys: ApiKeyManager = {
  create: () => { throw new Error('not used'); },
  list: () => [],
  revoke: () => null,
  authenticate: (key, requiredScope) => key === 'statistics-key'
    && requiredScope === 'statistics.read'
    ? {
        id: 'api-key',
        name: 'Complete statistics test',
        prefix: 'mca_test',
        scopes: ['statistics.read'],
        createdAt: '2026-07-30T12:00:00.000Z',
        createdBy: 'admin-1',
        lastUsedAt: null,
        revokedAt: null,
        status: 'ACTIVE',
      }
    : null,
};

const app = express();
app.use('/api/v1', createPublicApiRouter({
  apiKeys,
  arenaStatistics,
  battlegroundStatistics,
}));
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
  const classes = await fetch(`${origin}/arena/statistics/classes`, { headers });
  const classesPayload = await classes.json() as Record<string, any>;
  assert.equal(classesPayload.data[0].metrics.pickRatePercent, 11.4);
  assert.equal(classesPayload.data[0].metrics.sevenPlusWinsPercent, 24.7);
  assert.equal(classesPayload.data[0].metrics.wins, 6_765);
  assert.equal(classesPayload.data[0].metrics.losses, 5_580);
  assert.equal(classesPayload.data[0].heroPowerCardId, 'HERO_08bp');
  assert.equal(classesPayload.data[0].winsDistribution[1].games, 2_000);
  assert.equal(classesPayload.data[0].matchups[0].metrics.winratePercent, 55);
  assert.equal(classesPayload.meta.sample.dataPoints, 47_000);
  assert.equal(classesPayload.meta.sample.timePeriod, 'last-patch');

  const cards = await fetch(`${origin}/arena/statistics/cards`, { headers });
  const cardsPayload = await cards.json() as Record<string, any>;
  assert.equal(cardsPayload.data[0].arenaSmithTier, 'S');
  assert.equal(cardsPayload.data[0].arenaSmithRank, 7);

  const legendaries = await fetch(`${origin}/arena/statistics/legendaries`, { headers });
  const legendariesPayload = await legendaries.json() as Record<string, any>;
  assert.equal(legendariesPayload.data[0].byClass.mage.winratePercent, 58.2);
  assert.equal(legendariesPayload.data[0].keyCard.metrics.playedWinratePercent, 59.8);
  assert.equal(legendariesPayload.data[0].relatedCards[0].metrics.deckWinratePercent, 56.1);

  const matchups = await fetch(
    `${origin}/arena/statistics/matchups?source=firestone`,
    { headers },
  );
  const matchupsPayload = await matchups.json() as Record<string, any>;
  assert.equal(matchupsPayload.data[0].metrics.games, 7_500);
  assert.equal(matchupsPayload.meta.source, 'firestone');

  const heroes = await fetch(
    `${origin}/battlegrounds/statistics/heroes?mode=duos&mmr=TOP_1_PERCENT`,
    { headers },
  );
  const heroesPayload = await heroes.json() as Record<string, any>;
  assert.equal(heroesPayload.meta.sample.mode, 'duos');
  assert.equal(heroesPayload.meta.sample.mmrPercentile, 'TOP_1_PERCENT');
  assert.equal(heroesPayload.data[0].cardId, 'TB_BaconShop_HERO_17');
  assert.equal(heroesPayload.data[0].metrics.adjustedAveragePlacement, 3.81);
  assert.equal(heroesPayload.data[0].isAnomalyAdjusted, true);
  assert.equal(heroesPayload.data[0].heroPower.dbfId, 57_949);
  assert.equal(heroesPayload.data[0].keyMinions[0].cardId, 'BGS_071');

  const hero = await fetch(
    `${origin}/battlegrounds/statistics/heroes/57946?mode=duos&mmr=TOP_1_PERCENT`,
    { headers },
  );
  assert.equal(hero.status, 200);
  const heroPayload = await hero.json() as Record<string, any>;
  assert.equal(heroPayload.data.tavernUpgradeByTurn[0].games, 12_391);
  assert.equal(heroPayload.data.heroPowerByTurn[0].invocationRatePercent, 71.44);
  assert.equal(heroPayload.data.combatByTurn[0].winratePercent, 62.11);
  assert.equal(heroPayload.data.compositions[0].metrics.games, 46_925);
  assert.equal(heroPayload.data.hero.keyMinions[0].tavernTier, 3);
  assert.equal(heroPayload.data.compositions[0].lineup[0].metrics.attack, 2_909);
  assert.equal(
    heroPayload.data.compositions[0].finalFormMinions[0].metrics.atLeastOnePercent,
    35.43,
  );
  assert.equal(JSON.stringify(heroPayload).includes('source_url'), false);
  assert.equal(JSON.stringify(heroPayload).includes('private-provider'), false);

  const minionHistory = await fetch(
    `${origin}/battlegrounds/statistics/minions/61049/history?days=30`,
    { headers },
  );
  assert.equal(minionHistory.status, 200);
  const minionHistoryPayload = await minionHistory.json() as Record<string, any>;
  assert.equal(minionHistoryPayload.data.history[0].metrics.impact, 0.31);
  assert.equal(minionHistoryPayload.data.history[0].metrics.gamesWithMinion, 169_092);
  assert.equal(JSON.stringify(minionHistoryPayload).includes('raw_card_json'), false);

  const spells = await fetch(`${origin}/battlegrounds/statistics/spells`, { headers });
  assert.equal(spells.status, 200);
  const spellsPayload = await spells.json() as Record<string, any>;
  assert.equal(spellsPayload.data[0].cardId, 'BG28_503');
  assert.equal(spellsPayload.data[0].metrics.games, 143_340);
  assert.equal(spellsPayload.data[0].metrics.averagePlacementWithout, 4.2254);
  assert.equal(JSON.stringify(spellsPayload).includes('private-provider'), false);

  const trinkets = await fetch(
    `${origin}/battlegrounds/statistics/tier-lists/trinkets`
      + '?mmr=TOP_20_PERCENT&timeRange=LAST_7_DAYS',
    { headers },
  );
  const trinketsPayload = await trinkets.json() as Record<string, any>;
  assert.equal(trinketsPayload.meta.sample.mmrPercentile, 'TOP_20_PERCENT');
  assert.equal(trinketsPayload.meta.sample.timeRange, 'LAST_7_DAYS');
  assert.equal(trinketsPayload.data[0].metrics.gamesIsMinimum, true);

  assert.deepEqual(battlegroundCalls[0], {
    method: 'heroes',
    input: {
      mode: 'duos',
      mmr: 'TOP_1_PERCENT',
      timeRange: 'CURRENT_BATTLEGROUNDS_PATCH',
    },
  });
  assert.deepEqual(battlegroundCalls.at(-1), {
    method: 'tier-lists',
    input: {
      kind: 'trinkets',
      mmr: 'TOP_20_PERCENT',
      timeRange: 'LAST_7_DAYS',
      source: null,
    },
  });

  for (const path of [
    '/battlegrounds/statistics/heroes?mode=invalid',
    '/battlegrounds/statistics/heroes/abc',
    '/battlegrounds/statistics/minions/0/history',
    '/battlegrounds/statistics/minions/61049/history?days=3651',
    '/battlegrounds/statistics/spells?tavernTier=9',
    '/battlegrounds/statistics/tier-lists/trinkets?mmr=invalid',
    '/battlegrounds/statistics/tier-lists/strategies?source=invalid',
  ]) {
    const response = await fetch(`${origin}${path}`, { headers });
    assert.equal(response.status, 400, path);
    const payload = await response.json() as Record<string, any>;
    assert.equal(payload.error.code, 'INVALID_BATTLEGROUNDS_STATISTICS_QUERY', path);
  }

  const unauthorizedDetail = await fetch(
    `${origin}/battlegrounds/statistics/heroes/57946`,
  );
  assert.equal(unauthorizedDetail.status, 401);
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

console.log('public API complete game-mode statistics contract tests passed');
