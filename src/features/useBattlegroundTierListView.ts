import { useMemo } from 'react';
import type { BattlegroundTierListKey } from '../modules/battlegrounds/public';
import { sortTrinketTierItems } from './battlegroundTrinkets';
import { BG_RACE_ORDER, bgItemRaces } from './battlegroundTierListItems';
import { BG_TIER_ORDER, type BattlegroundTrinketSize } from './battlegroundTierListState';

const tierItems = (tiers: Record<string, unknown>, tier: string): any[] => Array.isArray(tiers[tier]) ? tiers[tier] as any[] : [];

/**
 * What the tier list shows of a loaded slice: the entries of each tier after the minion (race, tavern) and
 * trinket (size) filters, their count, the first tier with an entry, and the filter choices the slice offers.
 */
export function useDisplayedTiers(data: any | null, list: BattlegroundTierListKey, race: string, tavern: string, trinketSize: BattlegroundTrinketSize) {
  const tiers = useMemo<Record<string, unknown>>(() => data?.tiers || {}, [data?.tiers]);
  const minionOptions = useMemo(() => {
    const raceSet = new Set<string>();
    const tavernSet = new Set<string>();
    BG_TIER_ORDER.forEach(tier => tierItems(tiers, tier).forEach((item: any) => {
      bgItemRaces(item).forEach((entry: string) => raceSet.add(String(entry || 'NONE')));
      if (item.tavernTier) tavernSet.add(String(item.tavernTier));
    }));
    return {
      races: BG_RACE_ORDER.filter(entry => entry === 'ALL' || raceSet.has(entry)),
      taverns: ['ALL', ...Array.from(tavernSet).sort((a, b) => Number(a) - Number(b))],
    };
  }, [tiers]);
  const trinketSizes = useMemo(() => {
    const sizeSet = new Set<string>();
    BG_TIER_ORDER.forEach(tier => tierItems(tiers, tier).forEach((item: any) => {
      const size = String(item?.size || '').toUpperCase();
      if (size) sizeSet.add(size);
    }));
    // Until a slice arrives both sizes are offered, so the row does not jump in.
    return ['ALL', ...(['SMALL', 'LARGE'].filter(size => !sizeSet.size || sizeSet.has(size)))];
  }, [tiers]);
  const displayedTiers = useMemo(() => {
    if (list !== 'minions' && list !== 'trinkets') return tiers as Record<string, any[]>;
    const next: Record<string, any[]> = {};
    BG_TIER_ORDER.forEach(tier => {
      const items = tierItems(tiers, tier).filter((item: any) => {
        if (list === 'trinkets') return trinketSize === 'ALL' || String(item?.size || '').toUpperCase() === trinketSize;
        const races = bgItemRaces(item);
        return (race === 'ALL' || races.includes(race)) && (tavern === 'ALL' || String(item.tavernTier || '') === tavern);
      });
      next[tier] = list === 'trinkets' ? sortTrinketTierItems(items) : items;
    });
    return next;
  }, [list, race, tavern, tiers, trinketSize]);
  const displayedCount = useMemo(() => BG_TIER_ORDER.reduce((total, tier) => total + tierItems(displayedTiers, tier).length, 0), [displayedTiers]);
  const firstResultTier = useMemo(() => BG_TIER_ORDER.find(tier => tierItems(displayedTiers, tier).length > 0), [displayedTiers]);
  return { minionOptions, trinketSizes, displayedTiers, displayedCount, firstResultTier };
}
