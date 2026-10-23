import {
  createLocalBattlegroundStatisticsSource,
  createPublicBattlegroundStatistics,
} from '../modules/publicApi/public.js';
import {
  classKey,
  type GlobalArchetype,
  type GlobalStatisticsSources,
} from '../modules/playerGames/public.js';

type Json = Record<string, unknown>;
const record = (value: unknown): Json => (value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {});
const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const CLASSES = new Set(['DEATHKNIGHT', 'DEMONHUNTER', 'DRUID', 'HUNTER', 'MAGE', 'PALADIN', 'PRIEST', 'ROGUE', 'SHAMAN', 'WARLOCK', 'WARRIOR']);

function knownClass(value: unknown): GlobalArchetype['playerClass'] {
  const key = classKey(value);
  return CLASSES.has(key) ? key as GlobalArchetype['playerClass'] : null;
}

/**
 * Adapts the site's existing global datasets to the player-statistics ports:
 * Battlegrounds heroes from the loopback HSReplay mirror, constructed
 * archetypes from the HSGuru meta. Arena has no global comparison: the only
 * per-class Arena dataset with run results comes from Firestone, whose data the
 * site may not use.
 */
export function createPlayerGamesGlobalSources(options: {
  loadConstructedMeta: (format: 'standard' | 'wild') => Promise<unknown>;
}): GlobalStatisticsSources {
  const battlegrounds = createPublicBattlegroundStatistics(createLocalBattlegroundStatisticsSource());
  return {
    async battlegroundsHeroes({ duos, mmr }) {
      const result = await battlegrounds.heroes({ mode: duos ? 'duos' : 'solo', mmr, limit: '500' });
      return result.data.filter(hero => hero.cardId).map(hero => ({
        heroId: hero.heroId,
        cardId: hero.cardId as string,
        averagePlacement: hero.metrics.averagePlacement,
        pickRatePercent: hero.metrics.pickRatePercent,
        placementPercent: hero.metrics.placementDistributionPercent.length === 8
          ? hero.metrics.placementDistributionPercent : null,
      }));
    },
    async battlegroundsHeroCombat(heroId, { duos, mmr }) {
      const result = await battlegrounds.heroDetail(heroId, { mode: duos ? 'duos' : 'solo', mmr });
      return (result?.data.combatByTurn ?? [])
        .filter(round => round.winratePercent !== null)
        .map(round => ({ turn: round.turn, winrate: round.winratePercent as number }));
    },
    async constructedArchetypes(format) {
      const payload = record(await options.loadConstructedMeta(format));
      const items = Array.isArray(payload.items) ? payload.items : [];
      return items.map((item): GlobalArchetype | null => {
        const source = record(item);
        const archetype = typeof source.archetype === 'string' ? source.archetype : '';
        if (!archetype) return null;
        return { archetype, label: typeof source.archetypeLabel === 'string' ? source.archetypeLabel : null,
          playerClass: knownClass(source.classKey), winrate: finite(source.winrate),
          games: finite(source.games) ?? 0 };
      }).filter((item): item is GlobalArchetype => Boolean(item));
    },
  };
}
