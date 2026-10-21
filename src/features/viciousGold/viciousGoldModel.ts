import type { StandardMetaClass } from '../../../shared/standardMetaContract';
import type { HsReplayDeckCard } from '../HsReplayDeckList';
import {
  STANDARD_META_CLASS_COLORS, STANDARD_META_NEUTRAL_COLOR, STANDARD_META_TIER_FLOORS, type StandardMetaTier,
} from '../standardMetaClassModel';

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
  /** The matching archetype of our catalog (its page under /standard/archetypes/standard/), when there is one. */
  archetypeSlug?: string | null;
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
  /** vS windows of the shares, the ladder and the matchups behind the Power Tier (`lastDay`, …). */
  timeRanges?: { distribution: string | null; tierLadder: string | null; tierMatchups: string | null };
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

/** vS groups bots and unnamed lists per class («Bot Warlock»); without a translation they read «Боты» and «Прочие». */
export function deckDisplayLabel(deck: Pick<DeckDistribution, 'deck' | 'deckLabel' | 'classLabel'>, short = false): string {
  if (!isAggregateDeck(deck.deck) || deck.deckLabel !== deck.deck) return deck.deckLabel;
  const word = /^Bot\s/i.test(deck.deck) ? 'Боты' : 'Прочие';
  return short ? word : `${word} (${deck.classLabel})`;
}

/** The page of a deck's archetype on our site, or null when the catalog has none. */
export function archetypeHref(slug: string | null | undefined): string | null {
  return slug ? `/standard/archetypes/standard/${encodeURIComponent(slug)}/` : null;
}

/** vS reads only these windows from its live dashboard (hs-data-api `LIVE_TIME_RANGES`). */
const REPORT_WINDOWS: Record<string, string> = {
  lastDay: 'последние 24 часа',
  last3Days: 'последние 3 дня',
  lastWeek: 'последние 7 дней',
  last2Weeks: 'последние 2 недели',
};

export function reportWindowLabel(timeRange: string | null | undefined): string | null {
  return (timeRange && REPORT_WINDOWS[timeRange]) || null;
}

/** The report's leaders: the Power Tier #1 of all ranks, the most played archetype and class. */
export function reportHighlights({ classDistribution, deckDistribution, tierList }: Pick<ViciousGoldPayload, 'classDistribution' | 'deckDistribution' | 'tierList'>) {
  const byShare = <T extends { frequency: number }>(rows: readonly T[]) =>
    rows.reduce<T | null>((best, row) => (!best || row.frequency > best.frequency ? row : best), null);
  return {
    leader: tierList[0]?.decks[0] ?? null,
    popular: byShare(deckDistribution.filter(deck => !isAggregateDeck(deck.deck))),
    topClass: byShare(classDistribution),
  };
}

/** The site's class key (`DeathKnight` -> `deathknight`), or null for a class it does not know. */
export function classKey(className: string): StandardMetaClass | null {
  const key = className.toLowerCase();
  return key in STANDARD_META_CLASS_COLORS ? key as StandardMetaClass : null;
}

/**
 * The tier letter of a vS power win rate against the meta page's floors (S from 53%, D below 47%).
 * vS publishes no games per archetype, so there is no Wilson bound here: the letter reads the
 * win rate itself, which the reader sees next to it.
 */
export function siteTier(winrate: number): StandardMetaTier {
  return STANDARD_META_TIER_FLOORS.find(([, floor]) => winrate >= floor)?.[0] ?? 'D';
}

const TIER_ORDER: StandardMetaTier[] = ['S', 'A', 'B', 'C', 'D'];

function tierRange(tier: StandardMetaTier): string {
  const floor = STANDARD_META_TIER_FLOORS.find(([letter]) => letter === tier)?.[1];
  return floor === undefined ? `ниже ${STANDARD_META_TIER_FLOORS[STANDARD_META_TIER_FLOORS.length - 1][1]}%` : `от ${floor}%`;
}

/** Groups ranked decks into the non-empty site tiers, keeping the source order inside each tier. */
export function groupBySiteTier(decks: readonly TierDeck[]) {
  return TIER_ORDER
    .map(tier => ({ tier, range: tierRange(tier), decks: decks.filter(deck => siteTier(deck.winrate) === tier) }))
    .filter(group => group.decks.length > 0);
}

/** Win-rate points of a deck in this bracket against the same deck in all ranks; null without a baseline. */
export function rankDelta(deck: TierDeck, section: TierSection, tierList: readonly TierSection[]): number | null {
  const baseline = tierList[0];
  if (!baseline || baseline === section) return null;
  const same = baseline.decks.find(row => row.deck === deck.deck);
  return same ? Math.round((deck.winrate - same.winrate) * 100) / 100 : null;
}

/**
 * An archetype's name inside its class bar: the class heads the row, so «Контроль Жрец» reads
 * «Контроль» and fits a narrow segment (its title keeps the full name).
 */
export function withoutClass(label: string, classLabel: string): string {
  const escaped = classLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rest = label.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'iu'), ' ').replace(/\s+/g, ' ').trim();
  return rest ? rest[0].toLocaleUpperCase('ru-RU') + rest.slice(1) : label;
}


const DECK_PLURAL = new Intl.PluralRules('ru-RU');
const DECK_WORD: Partial<Record<Intl.LDMLPluralRule, string>> = { one: 'колода', few: 'колоды' };

export function deckCount(count: number): string {
  return `${count} ${DECK_WORD[DECK_PLURAL.select(count)] ?? 'колод'}`;
}

const INK_DARK = '#2a1d14';
const INK_LIGHT = '#ffffff';

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map(channel => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two `#rrggbb` colours. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** The class colour mixed with white (`amount` > 0) or black (< 0), as `#rrggbb`. */
function tint(hex: string, amount: number): string {
  const target = amount >= 0 ? 255 : 0;
  return `#${rgb(hex).map(channel => Math.round(channel + (target - channel) * Math.abs(amount)).toString(16).padStart(2, '0')).join('')}`;
}

/** A shade with readable text: a mid-tone that reaches 4.5:1 with neither ink moves towards the ink's opposite. */
function readableShade(hex: string, amount: number): { background: string; ink: string } {
  for (let step = 0; step <= 12; step += 1) {
    for (const shift of step ? [-step * 0.05, step * 0.05] : [0]) {
      const background = tint(hex, Math.max(-0.6, Math.min(0.7, amount + shift)));
      const ink = inkFor(background);
      if (contrastRatio(background, ink) >= 4.5) return { background, ink };
    }
  }
  const background = tint(hex, amount);
  return { background, ink: inkFor(background) };
}

/** Text colour for a background: the one of dark ink and white with the higher contrast. */
function inkFor(background: string): string {
  return contrastRatio(background, INK_LIGHT) >= contrastRatio(background, INK_DARK) ? INK_LIGHT : INK_DARK;
}

/**
 * One row per class for the stacked share bars: the class's archetypes, largest first, as
 * segments in shades of the class colour (the largest the deepest, the rest lighter steps
 * up to 55% white, a mid-tone nudged until its text reaches 4.5:1) with that text colour, and `rest` — the class share of
 * archetypes below the page's threshold, shown as one "other" remainder.
 */
export function classShareRows(classes: readonly ClassDistribution[], decks: readonly DeckDistribution[]) {
  return classes.map(item => {
    const key = classKey(item.class);
    const color = key ? STANDARD_META_CLASS_COLORS[key] : STANDARD_META_NEUTRAL_COLOR;
    const own = decks.filter(deck => deck.class === item.class).sort((a, b) => b.frequency - a.frequency);
    const segments = own.map((deck, index) => {
      const shade = readableShade(color, own.length > 1 ? (index / (own.length - 1)) * 0.55 : 0);
      return {
        deck: deck.deck, label: withoutClass(deckDisplayLabel(deck, true), item.classLabel), fullLabel: deckDisplayLabel(deck),
        frequency: deck.frequency, ...shade,
      };
    });
    const listed = own.reduce((sum, deck) => sum + deck.frequency, 0);
    return { ...item, color, segments, rest: Math.max(0, Math.round((item.frequency - listed) * 100) / 100) };
  });
}
