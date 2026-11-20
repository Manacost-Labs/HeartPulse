import { BATTLEGROUND_TIER_LISTS, type BattlegroundTierListKey } from '../modules/battlegrounds/public';
import {
  buildTrinketStatsRequest,
  normalizeTrinketMmr,
  normalizeTrinketTimeRange,
  normalizeTrinketView,
  type TrinketMmr,
  type TrinketTimeRange,
  type TrinketView,
} from './battlegroundTrinkets';
import { bgItemTitle, bgNormalizeDeepLinkValue } from './battlegroundTierListItems';

// The state of the Battlegrounds tier list that lives in the address, and the request each slice is read with.

export type BattlegroundStrategySource = 'hsreplay' | 'firestone';
export type BattlegroundTrinketSize = 'ALL' | 'SMALL' | 'LARGE';

/** The list and strategy source a viewer without access sees: the open builds (HSReplay compositions). */
export const OPEN_TIER_LIST: BattlegroundTierListKey = 'strategies';
export const OPEN_STRATEGY_SOURCE: BattlegroundStrategySource = 'hsreplay';

export const BG_TIER_ORDER = ['S', 'A', 'B', 'C', 'D'];
function bgTierListKeyFromValue(value: unknown, fallback: BattlegroundTierListKey): BattlegroundTierListKey {
  const raw = String(value || '').toLowerCase();
  return BATTLEGROUND_TIER_LISTS.some(item => item.id === raw) ? raw as BattlegroundTierListKey : fallback;
}

export function bgVisibleLimitKey(list: BattlegroundTierListKey, tier: string): string {
  return `${list}:${tier}`;
}

function bgStrategySourceFromValue(value: unknown, fallback: BattlegroundStrategySource): BattlegroundStrategySource {
  const raw = String(value || '').toLowerCase();
  return raw === 'hsreplay' || raw === 'firestone' ? raw : fallback;
}

export type BattlegroundTierListUrlState = {
  list: BattlegroundTierListKey;
  source: BattlegroundStrategySource;
  trinketSize: BattlegroundTrinketSize;
  trinketMmr: TrinketMmr;
  trinketTimeRange: TrinketTimeRange;
  trinketView: TrinketView;
  strategyKey: string;
  strategyTitle: string;
};

/**
 * The tier list state written in `search`. `open` (a viewer without access) starts on the open builds:
 * the strategies list with the HSReplay source; a subscriber starts on the minions and Firestone.
 */
export function bgTierListUrlState(search: string, open = false): BattlegroundTierListUrlState {
  const params = new URLSearchParams(search);
  const list = bgTierListKeyFromValue(params.get('list'), open ? OPEN_TIER_LIST : 'minions');
  const requestedSize = String(params.get('size') || '').toUpperCase();
  return {
    list,
    source: bgStrategySourceFromValue(params.get('source'), open ? OPEN_STRATEGY_SOURCE : 'firestone'),
    trinketSize: requestedSize === 'ALL' || requestedSize === 'SMALL' || requestedSize === 'LARGE'
      ? requestedSize
      : (list === 'trinkets' ? 'LARGE' : 'ALL'),
    trinketMmr: normalizeTrinketMmr(params.get('mmr')),
    trinketTimeRange: normalizeTrinketTimeRange(params.get('timeRange')),
    trinketView: normalizeTrinketView(params.get('view')),
    strategyKey: params.get('strategy') || '',
    strategyTitle: params.get('q') || '',
  };
}

/** The request of one slice; it is also the key a tier-list source answers by. */
export function bgTierListRequest(list: BattlegroundTierListKey, source: BattlegroundStrategySource, trinketMmr?: TrinketMmr, trinketTimeRange?: TrinketTimeRange): string {
  if (list === 'trinkets') return buildTrinketStatsRequest(normalizeTrinketMmr(trinketMmr), normalizeTrinketTimeRange(trinketTimeRange));
  const params = new URLSearchParams({ list });
  if (list === 'strategies') params.set('source', source);
  return `/api/bg/tier-lists?${params.toString()}`;
}

export function bgStrategyMatchesDeepLink(item: any, key: string, title: string): boolean {
  if (!key && !title) return false;
  const itemKey = String(item?.key || '');
  if (key && itemKey === key) return true;
  if (key && bgNormalizeDeepLinkValue(itemKey) === bgNormalizeDeepLinkValue(key)) return true;
  return Boolean(title && bgNormalizeDeepLinkValue(bgItemTitle(item)) === bgNormalizeDeepLinkValue(title));
}
