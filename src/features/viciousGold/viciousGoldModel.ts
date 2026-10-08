import type { HsReplayDeckCard } from '../HsReplayDeckList';

export type DeckBuild = {
  deckCode: string;
  source: string;
  sourceLabel: string;
  sourceUrl: string;
  matchedArchetype: string;
  matchMethod: 'exact' | 'alias';
  updatedAt: string | null;
  winrate: number | null;
  sampleGames: number | null;
  deckCards: HsReplayDeckCard[];
};

export type ClassDistribution = {
  class: string;
  classLabel: string;
  classIcon: string;
  frequency: number;
};

export type DeckDistribution = ClassDistribution & {
  deck: string;
  deckLabel: string;
  build: DeckBuild | null;
};

export type TierDeck = Omit<DeckDistribution, 'frequency'> & {
  rank: number;
  winrate: number;
};

export type TierSection = {
  rankBracket: string;
  rankLabel: string;
  decks: TierDeck[];
};

export type ViciousGoldPayload = {
  title: string;
  format: string;
  games: number;
  source: string;
  sourceUrl: string;
  updatedAt: string | null;
  minimumDeckFrequency: number;
  classDistribution: ClassDistribution[];
  deckDistribution: DeckDistribution[];
  tierList: TierSection[];
  buildCoverage: { found: number; total: number };
};

export type BuildState = 'loading' | 'ready' | 'error';

export function classIcon(icon: string): string {
  return `/class_icon/ui/${icon.replace(/-/g, '')}-64.webp`;
}

export function formatDate(value: string | null): string {
  if (!value) return 'нет данных';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const PERCENT_FORMATTER = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const THRESHOLD_FORMATTER = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

export function percent(value: number): string {
  return `${PERCENT_FORMATTER.format(value)}%`;
}

export function thresholdPercent(value: number): string {
  return `${THRESHOLD_FORMATTER.format(value)}%`;
}

/** Bar width against the leader, so 15% and 5% shares read as different lengths. */
export function shareOfLeader(value: number, leader: number): string {
  return `${leader > 0 ? Math.min(100, (value / leader) * 100) : 0}%`;
}

export function isAggregateDeck(deck: string): boolean {
  return /^(?:Other|Bot)\s/i.test(deck.replace(/^tier:/, ''));
}

export function missingBuildLabel(deck: string, buildState: BuildState): string {
  if (isAggregateDeck(deck)) return 'Сборная категория';
  if (buildState === 'loading') return 'Сборка загружается';
  if (buildState === 'error') return 'Сборка временно недоступна';
  return 'Сборка обновляется';
}

type PowerTierId = 'one' | 'two' | 'three' | 'four';

// Win-rate bands of the Power Tier board, strongest first.
const POWER_TIERS: Array<{ id: PowerTierId; label: string; range: string; from: number }> = [
  { id: 'one', label: 'Тир 1', range: 'винрейт 52% и выше', from: 52 },
  { id: 'two', label: 'Тир 2', range: 'винрейт от 50 до 52%', from: 50 },
  { id: 'three', label: 'Тир 3', range: 'винрейт от 47 до 50%', from: 47 },
  { id: 'four', label: 'Тир 4', range: 'винрейт ниже 47%', from: -Infinity },
];

export function powerTier(winrate: number) {
  return POWER_TIERS.find(tier => winrate >= tier.from) ?? POWER_TIERS[POWER_TIERS.length - 1];
}

/** Groups ranked decks into the non-empty win-rate bands, keeping the source order inside each band. */
export function groupByPowerTier(decks: TierDeck[]) {
  return POWER_TIERS
    .map(tier => ({ ...tier, decks: decks.filter(deck => powerTier(deck.winrate).id === tier.id) }))
    .filter(tier => tier.decks.length > 0);
}

const DECK_PLURAL = new Intl.PluralRules('ru-RU');
const DECK_WORD: Partial<Record<Intl.LDMLPluralRule, string>> = { one: 'колода', few: 'колоды' };

export function deckCount(count: number): string {
  return `${count} ${DECK_WORD[DECK_PLURAL.select(count)] ?? 'колод'}`;
}
