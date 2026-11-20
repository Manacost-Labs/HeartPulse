import {
  HeroCompositionAnalytics,
  HeroOverview,
  HeroPowerAnalytics,
  HeroTavernAnalytics,
} from '../modules/battlegrounds/public';
import { BattlegroundHeroStatistics } from './BattlegroundHeroStatistics';
import { bgHeroStatisticsScope } from './battlegroundHeroDetailText';
import type { BattlegroundHeroStatisticsInput } from './BattlegroundHeroDetailView';

/** The subscriber's statistics block: the four analytics tabs; a tab without data gets no panel. */
export function BattlegroundHeroDetailAnalytics({ stats, hero, analyticsCards }: BattlegroundHeroStatisticsInput) {
  return (
    <BattlegroundHeroStatistics
      description={bgHeroStatisticsScope(stats)}
      overview={hero.placement_distribution?.length || stats.combat_winrate?.length
        ? <HeroOverview placement={hero.placement_distribution} combat={stats.combat_winrate} /> : null}
      power={stats.hero_power_by_turn?.length || stats.hero_power?.length
        ? <HeroPowerAnalytics byTurn={stats.hero_power_by_turn} byTier={stats.hero_power} /> : null}
      tavern={stats.tavern_up_by_turn?.length || stats.tavern_up?.length
        ? <HeroTavernAnalytics byTurn={stats.tavern_up_by_turn} distribution={stats.tavern_up} /> : null}
      compositions={stats.compositions?.length || stats.best_composition?.lineup?.length || stats.best_composition?.final_form_minions?.length
        ? <HeroCompositionAnalytics best={stats.best_composition} compositions={stats.compositions} cards={analyticsCards} /> : null}
    />
  );
}
