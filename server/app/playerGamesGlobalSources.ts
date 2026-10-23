import {
  createLocalBattlegroundStatisticsSource,
  createPublicBattlegroundStatistics,
} from '../modules/publicApi/public.js';
import {
  classKey,
  type GlobalArchetype,
  type GlobalArenaClass,
  type GlobalStatisticsSources,
} from '../modules/playerGames/public.js';

type Json = Record<string, unknown>;
const record = (value: unknown): Json => (value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {});
const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const CLASSES = new Set(['DEATHKNIGHT', 'DEMONHUNTER', 'DRUID', 'HUNTER', 'MAGE', 'PALADIN', 'PRIEST', 'ROGUE', 'SHAMAN', 'WARLOCK', 'WARRIOR']);

function knownClass(value: unknown): GlobalArenaClass['playerClass'] | null {
  const key = classKey(value);
  return CLASSES.has(key) ? key as GlobalArenaClass['playerClass'] : null;
}

/**
 * Adapts the site's existing global datasets to the player-statistics ports:
 * Battlegrounds heroes from the loopback HSReplay mirror, constructed
 * archetypes from the HSGuru meta and Arena classes from Firestone.
 */
export function createPlayerGamesGlobalSources(options: {
  loadConstructedMeta: (format: 'standard' | 'wild') => Promise<unknown>;
  loadArenaClasses: () => Promise<unknown>;
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
    async arenaClasses() {
      const payload = record(await options.loadArenaClasses());
      const classes = Array.isArray(payload.classes) ? payload.classes : [];
      return classes.map((item): GlobalArenaClass | null => {
        const source = record(item);
        const playerClass = knownClass(source.id);
        if (!playerClass) return null;
        const distribution = (Array.isArray(source.winsDistribution) ? source.winsDistribution : []).map(record);
        const runs = distribution.reduce((sum, entry) => sum + (finite(entry.games) ?? 0), 0);
        const wins = distribution.reduce((sum, entry) => sum + (finite(entry.wins) ?? 0) * (finite(entry.games) ?? 0), 0);
        return { playerClass, winrate: finite(source.winrate),
          averageWins: runs > 0 ? Math.round((wins / runs) * 100) / 100 : null };
      }).filter((item): item is GlobalArenaClass => Boolean(item));
    },
  };
}
