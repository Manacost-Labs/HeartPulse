import { wilsonInterval } from '../vendor/varylo-ui/gaming/stats';
import type { StandardMetaClass } from '../../shared/standardMetaContract';

/** Deck-header colours of the meta page; the charts colour each class with them too. */
export const STANDARD_META_CLASS_COLORS: Record<StandardMetaClass, string> = {
  deathknight: '#43596b',
  demonhunter: '#17613d',
  druid: '#9a541d',
  hunter: '#3f7821',
  mage: '#39779b',
  paladin: '#9b771c',
  priest: '#727984',
  rogue: '#4a5058',
  shaman: '#28568b',
  warlock: '#68417d',
  warrior: '#832b24',
};

export const STANDARD_META_CLASS_LABELS: Record<StandardMetaClass, string> = {
  deathknight: 'Рыцарь смерти',
  demonhunter: 'Охотник на демонов',
  druid: 'Друид',
  hunter: 'Охотник',
  mage: 'Маг',
  paladin: 'Паладин',
  priest: 'Жрец',
  rogue: 'Разбойник',
  shaman: 'Шаман',
  warlock: 'Чернокнижник',
  warrior: 'Воин',
};

export const STANDARD_META_NEUTRAL_COLOR = '#5a4430';

export function standardMetaClassIcon(classKey: StandardMetaClass | null): string {
  return classKey ? `/class_icon/ui/${classKey}-64.webp` : '/class_icon/neutral.webp';
}

export type StandardMetaTier = 'S' | 'A' | 'B' | 'C' | 'D';

// One-sided 90% bound: a thin sample keeps its tier only as far as its games
// confirm it, without burying every mid-sized archetype under D.
const TIER_Z = 1.2816;
const TIER_FLOORS: Array<[StandardMetaTier, number]> = [['S', 53], ['A', 51], ['B', 49], ['C', 47]];

/** The tier of an archetype: its win rate's lower confidence bound against fixed floors (S ≥ 53%, … D below 47%). */
export function standardMetaTier(winrate: number, games: number): StandardMetaTier {
  const [lower] = wilsonInterval(winrate / 100, games, TIER_Z);
  return TIER_FLOORS.find(([, floor]) => lower * 100 >= floor)?.[0] ?? 'D';
}
