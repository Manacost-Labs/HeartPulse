import type { LegendariesData, LegendaryCard, LegendaryGroup, LegendarySource } from './types';

/**
 * The open layer of the legendary groups: what `GET /api/legendaries/public`
 * answers, copied field by field. A paid figure (`offerRate`, `score`, the
 * tier-list fields Express spreads into a card) is not read here, so it cannot
 * reach the server HTML, the RSC payload or the JSON-LD even if it arrived.
 */
export const PUBLIC_LEGENDARIES_PATH = '/api/legendaries/public';

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const percent = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
const image = (value: unknown): string | null => {
  const url = text(value);
  return url.startsWith('/') && !url.startsWith('//') || url.startsWith('https://') || /^data:image\/(?:png|webp|jpeg|svg\+xml)[;,]/.test(url) ? url : null;
};

function publicCard(value: unknown): LegendaryCard | null {
  const row = record(value);
  const cardId = text(row?.cardId);
  const name = text(row?.name);
  if (!row || !cardId || !name) return null;
  const card: LegendaryCard = { cardId, name };
  const cost = count(row.cost);
  if (cost !== null) card.cost = cost;
  if (text(row.type)) card.type = text(row.type);
  if (text(row.rarity)) card.rarity = text(row.rarity);
  if (text(row.classKey)) card.classKey = text(row.classKey);
  const copies = count(row.count);
  if (copies !== null) card.count = copies;
  const imageHa = image(row.imageHa);
  if (imageHa) card.imageHa = imageHa;
  card.imageRu = image(row.imageRu);
  return card;
}

function publicByClass(value: unknown): LegendaryGroup['byClass'] | undefined {
  const rows = record(value);
  if (!rows) return undefined;
  const byClass: NonNullable<LegendaryGroup['byClass']> = {};
  for (const [classKey, raw] of Object.entries(rows)) {
    const row = record(raw);
    if (!row || !/^[a-z-]{1,24}$/.test(classKey)) continue;
    byClass[classKey] = { winRate: percent(row.winRate), pickRate: percent(row.pickRate) };
  }
  return Object.keys(byClass).length ? byClass : undefined;
}

function publicGroup(value: unknown): LegendaryGroup | null {
  const row = record(value);
  const keyCard = publicCard(row?.keyCard);
  const classKey = text(row?.classKey);
  if (!row || !keyCard || !classKey || !Array.isArray(row.cards)) return null;
  const group: LegendaryGroup = {
    keyCard, classKey, cards: row.cards.slice(0, 12).flatMap(card => publicCard(card) ?? []),
    winRate: percent(row.winRate), pickRate: percent(row.pickRate), totalGames: count(row.totalGames),
  };
  const byClass = publicByClass(row.byClass);
  if (byClass) group.byClass = byClass;
  return group;
}

/** `null` when the answer is not an open projection or has no groups: the page then says «temporarily unavailable». */
export function parsePublicLegendaries(raw: unknown): LegendariesData | null {
  const data = record(raw);
  if (!data || !Array.isArray(data.groups)) return null;
  const groups = data.groups.slice(0, 400).flatMap(group => publicGroup(group) ?? []);
  if (!groups.length) return null;
  const updatedAt = text(data.updatedAt);
  const sourceId: LegendarySource | undefined = data.sourceId === 'hsreplay' || data.sourceId === 'firestone'
    ? data.sourceId : undefined;
  const flags = record(data.paidMetrics);
  const result: LegendariesData = {
    groups, source: text(data.source) || (sourceId === 'firestone' ? 'firestoneapp.com' : 'hsreplay.net'),
    updatedAt: updatedAt && Number.isFinite(Date.parse(updatedAt)) ? updatedAt : null,
    paidMetrics: { offerRate: flags?.offerRate !== false, score: flags?.score !== false },
  };
  if (sourceId) result.sourceId = sourceId;
  if (data.warning === 'stale' || data.warning === 'fallback') result.warning = data.warning;
  return result;
}

/**
 * The open groups with the subscriber's paid figures laid over them, matched by
 * the key card (and class). Only `offerRate`, `score` and the per-class pair
 * come from the protected answer; the order, names and winrate stay the open
 * layer's, so the page does not move when the paid figures arrive.
 */
export function mergeLegendaryPaid(open: LegendariesData, closed: LegendariesData | null): LegendariesData {
  if (!closed) return open;
  const exact = new Map<string, LegendaryGroup>();
  const byCard = new Map<string, LegendaryGroup>();
  for (const group of closed.groups) {
    exact.set(`${group.keyCard.cardId}|${group.classKey}`, group);
    if (!byCard.has(group.keyCard.cardId)) byCard.set(group.keyCard.cardId, group);
  }
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
  return { ...open, groups: open.groups.map(group => {
    const paid = exact.get(`${group.keyCard.cardId}|${group.classKey}`) ?? byCard.get(group.keyCard.cardId);
    if (!paid) return group;
    const byClass: NonNullable<LegendaryGroup['byClass']> = {};
    for (const classKey of new Set([...Object.keys(group.byClass ?? {}), ...Object.keys(paid.byClass ?? {})])) {
      const shown = group.byClass?.[classKey];
      const closedRow = paid.byClass?.[classKey];
      byClass[classKey] = {
        winRate: shown?.winRate ?? closedRow?.winRate ?? null, pickRate: shown?.pickRate ?? closedRow?.pickRate ?? null,
        offerRate: number(closedRow?.offerRate), score: number(closedRow?.score),
      };
    }
    return { ...group, byClass,
      offerRate: number(paid.offerRate ?? paid.keyCard.offerRate), score: number(paid.score ?? paid.keyCard.arenaScore) };
  }) };
}
