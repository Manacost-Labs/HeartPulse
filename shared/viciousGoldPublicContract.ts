/**
 * The open frame of the Vicious Syndicate Gold report (`GET /api/vicious-syndicate-gold/public`, #656). The report is
 * the data of vS's paid report, so a guest gets only its frame: the header (title, format, source, update time, report
 * windows), the classes and archetypes of the report in a neutral order (class name, then archetype name), never by
 * share, and the names of the Power Tier rank brackets. Shares, games, win rates, ranks, the order by share or by
 * Power Tier, the rows of the Power Tier, the leaders, builds, the share threshold and the build coverage stay out.
 */
export const VICIOUS_GOLD_PUBLIC_PATH = '/api/vicious-syndicate-gold/public';

export type PublicViciousGoldClass = { class: string; classLabel: string; classIcon: string };
export type PublicViciousGoldArchetype = PublicViciousGoldClass & { deck: string; deckLabel: string; archetypeSlug: string | null };
export type PublicViciousGold = {
  title: string;
  format: string;
  source: string;
  sourceUrl: string;
  updatedAt: string | null;
  timeRanges: { distribution: string | null; tierLadder: string | null; tierMatchups: string | null };
  classes: PublicViciousGoldClass[];
  archetypes: PublicViciousGoldArchetype[];
  rankBrackets: Array<{ rankBracket: string; rankLabel: string }>;
};

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isTextOrNull = (value: unknown): value is string | null => value === null || typeof value === 'string';

function openClass(value: JsonRecord): PublicViciousGoldClass | null {
  return isText(value.class) && isText(value.classLabel) && isText(value.classIcon)
    ? { class: value.class, classLabel: value.classLabel, classIcon: value.classIcon } : null;
}

/**
 * The open frame of an answer, rebuilt field by field, or `null` when the answer is not one (a broken shape, no
 * archetypes). A view never renders more than the fields named here, whatever the answer carries.
 */
export function parsePublicViciousGold(raw: unknown): PublicViciousGold | null {
  const data = record(raw);
  const ranges = record(data?.timeRanges);
  if (!data || !ranges || !isText(data.title) || !isText(data.format) || !isText(data.source) || !isText(data.sourceUrl)
    || !isTextOrNull(data.updatedAt) || !Array.isArray(data.classes) || !Array.isArray(data.archetypes)
    || !Array.isArray(data.rankBrackets)) return null;
  const classes = data.classes.map(item => record(item)).map(item => (item ? openClass(item) : null));
  const archetypes = data.archetypes.map(item => record(item)).map(item => {
    const owner = item ? openClass(item) : null;
    return owner && item && isText(item.deck) && isText(item.deckLabel) && isTextOrNull(item.archetypeSlug ?? null)
      ? { ...owner, deck: item.deck, deckLabel: item.deckLabel, archetypeSlug: (item.archetypeSlug as string | null | undefined) ?? null }
      : null;
  });
  const rankBrackets = data.rankBrackets.map(item => record(item)).map(item => (
    item && isText(item.rankBracket) && isText(item.rankLabel) ? { rankBracket: item.rankBracket, rankLabel: item.rankLabel } : null));
  if (!archetypes.length || [...classes, ...archetypes, ...rankBrackets].some(item => item === null)) return null;
  const range = (value: unknown) => (typeof value === 'string' ? value : null);
  return {
    title: data.title,
    format: data.format,
    source: data.source,
    sourceUrl: data.sourceUrl,
    updatedAt: data.updatedAt,
    timeRanges: { distribution: range(ranges.distribution), tierLadder: range(ranges.tierLadder), tierMatchups: range(ranges.tierMatchups) },
    classes: classes as PublicViciousGoldClass[],
    archetypes: archetypes as PublicViciousGoldArchetype[],
    rankBrackets: rankBrackets as PublicViciousGold['rankBrackets'],
  };
}
