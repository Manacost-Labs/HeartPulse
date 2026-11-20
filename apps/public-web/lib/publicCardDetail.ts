import 'server-only';
import type { CardFormat, PublicCardDeckSeed, PublicCardDetailSeed, PublicCardSeed } from '@/src/modules/constructedCards/public';
import { fetchPublicExpress } from './expressApi';

/**
 * The page waits this long for the open detail, then renders the seed alone, as before the detail existed.
 * Short on purpose: a stalled Express has already cost the proxy its two seconds (the outage budget of a
 * card page is 3.5 s), and Express finishes and caches an abandoned read for the next visit anyway.
 */
const DETAIL_READ_DEADLINE_MS = 800;
/** The weight a detail may add to the HTML; a heavier one is cut down (see `trimmed`), and dropped only if still heavier. */
const MAX_DETAIL_LENGTH = 192 * 1024;
/** How many decks, generated or related cards, pictures and sounds a cut-down detail keeps: more than a page first shows. */
const TRIMMED_LIST_LENGTH = 12;
/** The wiki keys the card page reads; the rest of the wiki record never reaches the HTML. */
const WIKI_KEYS = ['patch_changes', 'wiki_mechanics', 'wiki_tags', 'wiki_mechanics_localized', 'wiki_tags_localized',
  'gallery', 'sounds', 'external_links', 'generated_card_pools', 'animated', 'related_cards',
  // The variant tabs of the picture (constructedCardMedia.ts): without them the tabs appear only after the load and the page jumps.
  'golden_cards', 'signature_cards', 'diamond_cards'] as const;

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
 * answer is not this card or claims statistics access, or is too heavy even cut
 * down: the page then keeps the seed. The seed's own facts stay, so the title and the
 * description computed from it do not change.
 */
export function publicCardDetailSeed(seed: PublicCardSeed, payload: unknown): PublicCardDetailSeed | null {
  const data = record(payload); const card = record(data.card);
  if (card.card_id !== seed.card_id || data.statsAccess !== false) return null;
  const wikiPage = record(card.wiki_page);
  const wiki = record(card.wiki);
  const translations = textRecord(data.mechanicTranslations);
  const related = Array.isArray(card.related_cards_localized) ? card.related_cards_localized : [];
  const images = record(card.images);
  const animated = textRecord(images.animated);
  const detail: PublicCardDetailSeed = {
    ...seed,
    // The picture variants of the full record; the seed keeps its own main picture.
    images: {
      ...seed.images,
      ...Object.fromEntries((['golden', 'signature', 'diamond', 'crop'] as const).flatMap(key => text(images[key]) ? [[key, String(images[key])]] : [])),
      ...(Object.keys(animated).length ? { animated } : {}),
    },
    formats: (Array.isArray(card.formats) ? card.formats : []).flatMap(value => {
      const format = record(value); const slug = text(format.slug);
      return slug ? [{ slug, ...(text(format.name_ru) ? { name_ru: String(format.name_ru) } : {}), ...(text(format.name_en) ? { name_en: String(format.name_en) } : {}) }] : [];
    }),
    mechanics: texts(card.mechanics),
    referenced_tags: texts(card.referenced_tags),
    minion_type: text(card.minion_type),
    spell_school: text(card.spell_school),
    // The wiki related cards are a fallback the page reads only without the localized ones.
    wiki: Object.fromEntries(WIKI_KEYS.filter(key => key in wiki && !(key === 'related_cards' && related.length)).map(key => [key, wiki[key]])),
    wiki_page: text(wikiPage.url) ? { title: text(wikiPage.title), url: text(wikiPage.url) } : null,
    related_cards_localized: related,
    decks: (Array.isArray(card.decks) ? card.decks : []).flatMap(deck),
    mechanicTranslations: translations,
    mechanicOverrides: data.mechanicOverrides === undefined ? translations : textRecord(data.mechanicOverrides),
  };
  if (JSON.stringify(detail).length <= MAX_DETAIL_LENGTH) return detail;
  const cut = trimmed(detail);
  return JSON.stringify(cut).length <= MAX_DETAIL_LENGTH ? cut : null;
}

/** The first entries of a list; anything else (sounds grouped by kind) stays as it is. */
const head = (value: unknown): unknown => Array.isArray(value) ? value.slice(0, TRIMMED_LIST_LENGTH) : value;

/**
 * A popular card can bring hundreds of decks or generated cards (ETC_080: 404 decks; SCH_351: 400 KB of pools).
 * The cut keeps what the page states about the card itself (mechanics, patch history, links) whole and the first
 * entries of every long list; the browser loads the full record after the page as before.
 */
function trimmed(detail: PublicCardDetailSeed): PublicCardDetailSeed {
  const { wiki } = detail;
  return {
    ...detail,
    decks: detail.decks.slice(0, TRIMMED_LIST_LENGTH),
    related_cards_localized: detail.related_cards_localized.slice(0, TRIMMED_LIST_LENGTH).map(group => {
      const value = record(group);
      return { ...value, cards: head(value.cards) };
    }),
    wiki: {
      ...wiki,
      ...('gallery' in wiki ? { gallery: head(wiki.gallery) } : {}),
      ...('sounds' in wiki ? { sounds: head(wiki.sounds) } : {}),
      ...('related_cards' in wiki ? { related_cards: head(wiki.related_cards) } : {}),
      ...('generated_card_pools' in wiki ? { generated_card_pools: (Array.isArray(wiki.generated_card_pools) ? wiki.generated_card_pools.slice(0, TRIMMED_LIST_LENGTH) : []).map(pool => {
        const value = record(pool);
        return { ...value, cards: head(value.cards) };
      }) } : {}),
    },
  };
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
