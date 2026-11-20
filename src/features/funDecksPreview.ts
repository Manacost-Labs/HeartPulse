import { DECK_CLASSES as FUN_DECK_CLASSES } from './deckViews/deckClass';

/** One line of a deck's card list as the public API sends it; `id` is the catalog id of `/standard/cards/<format>/<id>/`. */
export type FunDeckOpenCard = { id: string; name: string; cost: number; count: number };

export type FunDeckRow = {
  title: string;
  deckCode: string;
  format: string;
  className: string;
  streamer: string | null;
  /** `off_meta`: a forgotten archetype. Absent in an older response: a brew. */
  kind?: 'brew' | 'off_meta';
  /** The admin pinned the deck: it leads its format under every sort. */
  pinned?: boolean;
  funScore: number | null;
  maxMetaSimilarity: number | null;
  nearestArchetype: string | null;
  /** Russian name of the nearest archetype, from the site's archetype translations. */
  nearestArchetypeLabel?: string | null;
  winRate: number | null;
  /** 95% Wilson interval of `winRate`, in percent. Absent in an older dataset. */
  winRateCiLow?: number | null;
  winRateCiHigh?: number | null;
  /** Near-identical lists this deck absorbed. */
  variants?: number | null;
  sourceTitle?: string | null;
  games: number | null;
  reasons: string[];
  /** Russian reasons the deck is fun, most interesting first; the API's `funDeckWhy`. Absent in an older response. */
  why?: string[];
  /** The filter tags (`FUN_DECK_TAGS` ids) the deck carries. */
  tags?: string[];
  url: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  render?: {
    imageUrl: string;
    previewImageUrl: string;
  };
  /** The main-deck list decoded from `deckCode` by the API, as the server HTML prints it. Absent when the catalog could not name every card. */
  cards?: FunDeckOpenCard[];
};

export type FunDecksPayload = {
  fetchedAt: string | null;
  stats: {
    total: number;
    standard: number;
    wild: number;
  };
  methodology: {
    detectorVersion: string | null;
    minFunScore: number | null;
    maxMetaSimilarity: number | null;
    ladderMemberSim?: number | null;
  };
  decks: FunDeckRow[];
};

/** `newest`: first seen; `fun`: fun index; `reliable`: lower bound of the win rate interval; `distant`: least like the meta. */
export type FunDecksSortMode = 'newest' | 'fun' | 'reliable' | 'distant';
export type FunDecksFormat = 'all' | 'standard' | 'wild';
export type FunDeckTagId = 'highlander' | 'xl' | 'meme' | 'cheese' | 'concept' | 'offmeta';

export const FUN_DECKS_SORTS: ReadonlyArray<{ id: FunDecksSortMode; label: string }> = [
  { id: 'newest', label: 'Свежие' },
  { id: 'fun', label: 'Индекс фана' },
  { id: 'reliable', label: 'Надёжный винрейт' },
  { id: 'distant', label: 'Дальше от меты' },
];

/** The filter chips; `shown` is the tag's reason on a card when it differs from the chip. */
export const FUN_DECK_TAGS: ReadonlyArray<{ id: FunDeckTagId; label: string; shown?: string }> = [
  { id: 'highlander', label: 'Хайлендер' },
  { id: 'xl', label: 'XL', shown: 'XL-колода' },
  { id: 'meme', label: 'Мем' },
  { id: 'cheese', label: 'Сыр' },
  { id: 'concept', label: 'Концепт' },
  { id: 'offmeta', label: 'Офф-мета' },
];

/** Hero classes by the lower-case Latin key of `className` (deckViews/deckClass). */
export { FUN_DECK_CLASSES };

/** Below this many games a win rate is a rough guess, and the card says so. */
export const FUN_DECKS_FEW_GAMES = 100;
const WHY_TAGS_SHOWN = 3;

export function funDeckClassId(deck: Pick<FunDeckRow, 'className'>): string {
  return String(deck.className || '').toLowerCase().replace(/[^a-z]/g, '');
}

function timestamp(value: string | null): number {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

type Key = (deck: FunDeckRow) => number | null;
const newestKey: Key = deck => timestamp(deck.firstSeenAt);
const funKey: Key = deck => deck.funScore ?? 0;

/** Each sort's keys in turn, larger first (-1) or smaller first (1); a missing number goes last either way. */
const KEYS_BY_SORT: Record<FunDecksSortMode, Array<[Key, 1 | -1]>> = {
  newest: [[newestKey, -1], [funKey, -1]],
  fun: [[funKey, -1], [newestKey, -1]],
  reliable: [[deck => deck.winRateCiLow ?? null, -1], [deck => deck.winRate, -1], [funKey, -1], [newestKey, -1]],
  distant: [[deck => deck.maxMetaSimilarity, 1], [funKey, -1], [newestKey, -1]],
};

/** The page's order: pinned decks first, then each sort's keys. A key breaks ties by the next one; decks equal on all of them keep the order the API sent. */
export function orderFunDecks(decks: FunDeckRow[], sortMode: FunDecksSortMode): FunDeckRow[] {
  const keys = KEYS_BY_SORT[sortMode] ?? KEYS_BY_SORT.newest;
  return [...decks].sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1;
    for (const [key, direction] of keys) {
      const a = key(left);
      const b = key(right);
      if (a !== b) return a === null ? 1 : b === null ? -1 : (a - b) * direction;
    }
    return 0;
  });
}

/**
 * Up to three of the deck's reasons; one the reader filters by comes first,
 * so the card always shows why it matched.
 */
export function funDeckWhy(deck: Pick<FunDeckRow, 'why'>, pinned: readonly FunDeckTagId[] = []): string[] {
  const first = FUN_DECK_TAGS.filter(tag => pinned.includes(tag.id)).map(tag => tag.shown ?? tag.label);
  const why = deck.why ?? [];
  return [...why.filter(label => first.includes(label)), ...why.filter(label => !first.includes(label))].slice(0, WHY_TAGS_SHOWN);
}

/** The 95% interval of the win rate, when the dataset has one that holds together. */
export function funDeckInterval(deck: Pick<FunDeckRow, 'winRateCiLow' | 'winRateCiHigh'>): { low: number; high: number } | null {
  const low = deck.winRateCiLow;
  const high = deck.winRateCiHigh;
  if (typeof low !== 'number' || typeof high !== 'number' || !Number.isFinite(low) || !Number.isFinite(high) || low > high) return null;
  return { low, high };
}

export function funDeckHasFewGames(deck: Pick<FunDeckRow, 'games'>): boolean {
  return typeof deck.games === 'number' && deck.games < FUN_DECKS_FEW_GAMES;
}

export type FunDecksView = {
  format: FunDecksFormat;
  /** Class ids; a deck of any of them matches. Empty: every class. */
  classes: readonly string[];
  /** Tag ids; a deck with any of them matches. Empty: every deck. */
  tags: readonly FunDeckTagId[];
  query: string;
  sort: FunDecksSortMode;
};

export const DEFAULT_FUN_DECKS_VIEW: FunDecksView = { format: 'all', classes: [], tags: [], query: '', sort: 'newest' };

export function funDecksFiltered(view: FunDecksView): boolean {
  return view.format !== 'all' || view.classes.length > 0 || view.tags.length > 0 || view.query.trim() !== '';
}

function classLabel(deck: FunDeckRow): string {
  return FUN_DECK_CLASSES.find(item => item.id === funDeckClassId(deck))?.label || deck.className;
}

/**
 * The decks the page shows: the whole selection for everyone, narrowed by the
 * format, the class, the tags and the search, in the order of the sort.
 */
export function selectFunDecks(decks: FunDeckRow[], view: FunDecksView): FunDeckRow[] {
  const inFormat = decks.filter(deck => view.format === 'all' || (deck.format.toLowerCase() === 'wild' ? 'wild' : 'standard') === view.format);
  const ordered = orderFunDecks(inFormat, view.sort);
  const needle = view.query.trim().toLocaleLowerCase('ru-RU');
  return ordered.filter(deck => {
    if (view.classes.length && !view.classes.includes(funDeckClassId(deck))) return false;
    if (view.tags.length && !deck.tags?.some(tag => view.tags.includes(tag as FunDeckTagId))) return false;
    if (!needle) return true;
    return [deck.title, deck.sourceTitle, classLabel(deck), deck.streamer, deck.nearestArchetype, deck.nearestArchetypeLabel]
      .filter(Boolean).join(' ').toLocaleLowerCase('ru-RU').includes(needle);
  });
}

/**
 * What the server renders for everyone: the selection's summary and every
 * deck, the newest first. The selection is open (its answer is public), so
 * the page has no guest cut.
 */
export function funDecksOpenPreview(payload: FunDecksPayload): FunDecksPayload {
  return { ...payload, decks: orderFunDecks(payload.decks, 'newest') };
}
