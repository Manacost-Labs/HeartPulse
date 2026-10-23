import { cardRulesText, renderCardPlurals } from '../shared/hearthstoneCardText.js';

type JsonRecord = Record<string, unknown>;

type OriginalCardTextDependencies = {
  /** HearthstoneJSON `ruRU/cards.json`: the texts with their `N |4(…)` counts intact. */
  fetchJson: (url: string) => Promise<unknown>;
  url: string;
  ttlMs?: number;
  retryMs?: number;
  now?: () => number;
};

export type OriginalCardTexts = {
  /** The texts, downloading them when missing or expired. */
  load: () => Promise<ReadonlyMap<string, string>>;
  /** What is in memory now, without waiting: empty until the first download lands. */
  current: () => ReadonlyMap<string, string>;
  /** `load`, but no longer than `ms`: past that the request goes on with `current`. */
  within: (ms: number) => Promise<ReadonlyMap<string, string>>;
};

const NO_TEXTS: ReadonlyMap<string, string> = new Map();

/**
 * Original Russian texts of the cards that count something, by card ID. Only
 * those few hundred texts stay in memory. A failed download keeps the previous
 * map (or none) and is retried later; it never fails the request it serves.
 */
export function createOriginalCardTexts(dependencies: OriginalCardTextDependencies): OriginalCardTexts {
  const now = dependencies.now ?? Date.now;
  const ttlMs = dependencies.ttlMs ?? 12 * 60 * 60_000;
  const retryMs = dependencies.retryMs ?? 10 * 60_000;
  let cache: { value: ReadonlyMap<string, string>; expiresAt: number } | null = null;
  let job: Promise<ReadonlyMap<string, string>> | null = null;
  const load = () => {
    if (cache && cache.expiresAt > now()) return Promise.resolve(cache.value);
    job ??= dependencies.fetchJson(dependencies.url)
      .then(payload => {
        const texts = new Map<string, string>();
        for (const card of Array.isArray(payload) ? payload : []) {
          const id = typeof card?.id === 'string' ? card.id : '';
          const text = typeof card?.text === 'string' ? card.text : '';
          if (id && text.includes('|4(')) texts.set(id, text);
        }
        cache = { value: texts, expiresAt: now() + ttlMs };
        return texts;
      })
      .catch(() => {
        const value = cache?.value ?? NO_TEXTS;
        cache = { value, expiresAt: now() + retryMs };
        return value;
      })
      .finally(() => { job = null; });
    return job;
  };
  const current = () => cache?.value ?? NO_TEXTS;
  const within = (ms: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<ReadonlyMap<string, string>>(resolve => { timer = setTimeout(() => resolve(current()), ms); });
    return Promise.race([load(), late]).finally(() => clearTimeout(timer));
  };
  return { load, current, within };
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function cardId(card: JsonRecord): string {
  for (const key of ['card_id', 'cardId']) {
    if (typeof card[key] === 'string') return card[key] as string;
  }
  return '';
}

/**
 * Renders plural markup in every card text of a catalog payload, in place:
 * `text.ru`/`text.en` objects and flat `text_ru`/`text_en` fields alike.
 * Russian counts the catalog stripped are restored from `originals`.
 */
export function renderPayloadCardPlurals<T>(payload: T, originals: ReadonlyMap<string, string>): T {
  const seen = new Set<object>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as JsonRecord;
    const original = originals.get(cardId(node));
    const text = record(node.text);
    if (text) {
      if (typeof text.ru === 'string') text.ru = cardRulesText(text.ru, original);
      if (typeof text.en === 'string') text.en = renderCardPlurals(text.en);
    }
    if (typeof node.text_ru === 'string') node.text_ru = cardRulesText(node.text_ru, original);
    if (typeof node.text_en === 'string') node.text_en = renderCardPlurals(node.text_en);
    Object.values(node).forEach(visit);
  };
  visit(payload);
  return payload;
}
