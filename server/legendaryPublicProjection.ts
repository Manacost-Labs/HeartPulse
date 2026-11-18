import { createHash } from 'node:crypto';

/**
 * The open slice of a legendary dataset for anonymous visitors. Every field is
 * copied by name (an allowlist): paid metrics, tierlist fields mixed into the
 * cards and any field a source adds later never reach the guest.
 */
export type PublicLegendaryCard = {
  cardId: string;
  name: string | null;
  cost: number | null;
  type: string | null;
  rarity: string | null;
  classKey: string | null;
  count: number | null;
  imageRu: string | null;
  imageHa: string | null;
};

export type PublicLegendaryGroup = {
  classKey: string | null;
  winRate: number | null;
  pickRate: number | null;
  totalGames: number | null;
  keyCard: PublicLegendaryCard;
  cards: PublicLegendaryCard[];
  byClass?: Record<string, { winRate: number | null; pickRate: number | null }>;
};

export type PublicLegendaries = {
  updatedAt: string | null;
  source: string | null;
  sourceId: string;
  warning?: 'stale' | 'fallback';
  paidMetrics: { offerRate: boolean; score: boolean };
  groups: PublicLegendaryGroup[];
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const num = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const str = (value: unknown): string | null => typeof value === 'string' && value ? value : null;
const has = (value: unknown): boolean => value !== null && value !== undefined;

function projectCard(value: unknown): PublicLegendaryCard | null {
  const card = record(value);
  const cardId = str(card.cardId);
  if (!cardId) return null;
  return {
    cardId,
    name: str(card.name),
    cost: num(card.cost),
    type: str(card.type),
    rarity: str(card.rarity),
    classKey: str(card.classKey),
    count: num(card.count),
    imageRu: str(card.imageRu),
    imageHa: str(card.imageHa),
  };
}

function projectByClass(value: unknown): PublicLegendaryGroup['byClass'] {
  const out: NonNullable<PublicLegendaryGroup['byClass']> = {};
  for (const [key, entry] of Object.entries(record(value))) {
    const metrics = record(entry);
    out[key] = { winRate: num(metrics.winRate), pickRate: num(metrics.pickRate) };
  }
  return Object.keys(out).length ? out : undefined;
}

export function compareLegendaryGroups(a: PublicLegendaryGroup, b: PublicLegendaryGroup): number {
  const left = a.winRate ?? Number.NEGATIVE_INFINITY;
  const right = b.winRate ?? Number.NEGATIVE_INFINITY;
  if (left !== right) return right - left;
  return a.keyCard.cardId < b.keyCard.cardId ? -1 : a.keyCard.cardId > b.keyCard.cardId ? 1 : 0;
}

/** `null` when no group survives: the caller must not answer 200 then. */
export function projectLegendariesPublic(
  dataset: unknown,
  sourceId: string,
  warning?: 'stale' | 'fallback',
): PublicLegendaries | null {
  const data = record(dataset);
  const rawGroups = list(data.groups).map(record);
  const groups: PublicLegendaryGroup[] = [];
  for (const raw of rawGroups) {
    const keyCard = projectCard(raw.keyCard);
    if (!keyCard) continue;
    const group: PublicLegendaryGroup = {
      classKey: str(raw.classKey),
      winRate: num(raw.winRate),
      pickRate: num(raw.pickRate),
      totalGames: num(raw.totalGames),
      keyCard,
      cards: list(raw.cards).map(projectCard).filter((card): card is PublicLegendaryCard => card !== null),
    };
    const byClass = projectByClass(raw.byClass);
    if (byClass) group.byClass = byClass;
    groups.push(group);
  }
  if (!groups.length) return null;
  groups.sort(compareLegendaryGroups);
  return {
    updatedAt: str(data.updatedAt),
    source: str(data.source),
    sourceId,
    ...(warning ? { warning } : {}),
    // Only whether the source has the metric, never a value.
    paidMetrics: {
      offerRate: rawGroups.some(group => has(group.offerRate)),
      score: rawGroups.some(group => has(group.score) || has(group.arenaScore)),
    },
    groups,
  };
}

export function legendariesPublicEtag(body: PublicLegendaries): string {
  return `"legendaries-public-${createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 24)}"`;
}
