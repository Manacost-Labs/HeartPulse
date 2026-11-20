import 'server-only';
import type { CardFormat, PublicCardDeckSeed, PublicCardDetailSeed, PublicCardSeed } from '@/src/modules/constructedCards/public';
import { fetchPublicExpress } from './expressApi';

/**
 * The page waits this long for the open detail, then renders the seed alone, as before the detail existed.
 * Short on purpose: a stalled Express has already cost the proxy its two seconds (the outage budget of a
 * card page is 3.5 s), and Express finishes and caches an abandoned read for the next visit anyway.
 */
const DETAIL_READ_DEADLINE_MS = 800;
/** A record heavier than this (hundreds of generated cards) is not worth its weight in every HTML response. */
const MAX_DETAIL_LENGTH = 192 * 1024;

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null;
const texts = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const textRecord = (value: unknown): Record<string, string> =>
  Object.fromEntries(Object.entries(record(value)).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));

/** Whitelisted deck fields; the scores are dropped here too, not only by Express. */
function deck(value: unknown): PublicCardDeckSeed[] {
  const item = record(value);
  const id = text(item.id); const deckCode = text(item.deckCode);
  if (!id || !deckCode) return [];
  return [{ id, title: text(item.title) ?? '', archetype: text(item.archetype), archetypeLabel: text(item.archetypeLabel),
    className: text(item.className), deckCode, winrate: null, score: null }];
}

/**
 * The open detail of the anonymous card API on top of the seed. Null when the
 * answer is not this card, claims statistics access, or is too heavy: the page
 * then keeps the seed. The seed's own facts stay, so the title and the
 * description computed from it do not change.
 */
export function publicCardDetailSeed(seed: PublicCardSeed, payload: unknown): PublicCardDetailSeed | null {
  const data = record(payload); const card = record(data.card);
  if (card.card_id !== seed.card_id || data.statsAccess !== false) return null;
  const wikiPage = record(card.wiki_page);
  const translations = textRecord(data.mechanicTranslations);
  const detail: PublicCardDetailSeed = {
    ...seed,
    formats: (Array.isArray(card.formats) ? card.formats : []).flatMap(value => {
      const format = record(value); const slug = text(format.slug);
      return slug ? [{ slug, ...(text(format.name_ru) ? { name_ru: String(format.name_ru) } : {}), ...(text(format.name_en) ? { name_en: String(format.name_en) } : {}) }] : [];
    }),
    mechanics: texts(card.mechanics),
    referenced_tags: texts(card.referenced_tags),
    minion_type: text(card.minion_type),
    spell_school: text(card.spell_school),
    wiki: record(card.wiki),
    wiki_page: text(wikiPage.url) ? { title: text(wikiPage.title), url: text(wikiPage.url) } : null,
    related_cards_localized: Array.isArray(card.related_cards_localized) ? card.related_cards_localized : [],
    decks: (Array.isArray(card.decks) ? card.decks : []).flatMap(deck),
    mechanicTranslations: translations,
    mechanicOverrides: data.mechanicOverrides === undefined ? translations : textRecord(data.mechanicOverrides),
  };
  return JSON.stringify(detail).length <= MAX_DETAIL_LENGTH ? detail : null;
}

/**
 * The anonymous read of `/api/constructed-cards/<id>`, the same address the
 * browser asks with the default statistics context. Any failure keeps the seed.
 */
export async function loadPublicCardDetail(format: CardFormat, seed: PublicCardSeed): Promise<PublicCardDetailSeed | null> {
  const query = new URLSearchParams({ format, statsFormat: format, period: '1d', rank: 'legend' });
  try {
    const response = await fetchPublicExpress(`/api/constructed-cards/${encodeURIComponent(seed.card_id)}?${query}`,
      undefined, { timeoutMs: DETAIL_READ_DEADLINE_MS });
    return response.ok ? publicCardDetailSeed(seed, await response.json()) : null;
  } catch {
    return null;
  }
}
