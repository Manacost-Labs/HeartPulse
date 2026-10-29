export type FunDeckRow = {
  title: string;
  deckCode: string;
  format: string;
  className: string;
  streamer: string | null;
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
    minFunScore: number;
    maxMetaSimilarity: number;
  };
  decks: FunDeckRow[];
};

/** `newest`: first seen; `fun`: fun index; `reliable`: lower bound of the win rate interval; `distant`: least like the meta. */
export type FunDecksSortMode = 'newest' | 'fun' | 'reliable' | 'distant';
export type FunDecksFormat = 'all' | 'standard' | 'wild';
export type FunDeckTagId = 'highlander' | 'xl' | 'meme' | 'cheese' | 'concept';

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
];

/** Hero classes by the lower-case Latin key of `className`, listed in the order of their Russian names. */
export const FUN_DECK_CLASSES: ReadonlyArray<{ id: string; label: string; color: string; icon: string }> = [
  ['warrior', 'Воин', '#8e342f'],
  ['druid', 'Друид', '#8b4d25'],
  ['priest', 'Жрец', '#6e6862'],
  ['mage', 'Маг', '#326c97'],
  ['hunter', 'Охотник', '#3f792f'],
  ['demonhunter', 'Охотник на демонов', '#556d24'],
  ['paladin', 'Паладин', '#a77816'],
  ['rogue', 'Разбойник', '#55545b'],
  ['deathknight', 'Рыцарь смерти', '#397b87'],
  ['warlock', 'Чернокнижник', '#694477'],
  ['shaman', 'Шаман', '#345aa0'],
].map(([id, label, color]) => ({ id, label, color, icon: `/class_icon/ui/${id}-64.webp` }));

/** Decks a guest sees; the rest of the selection is for Diamond subscribers. */
export const FUN_DECKS_FREE_PREVIEW_COUNT = 3;
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

/** The page's order. A key breaks ties by the next one; decks equal on all of them keep the order the API sent. */
export function orderFunDecks(decks: FunDeckRow[], sortMode: FunDecksSortMode): FunDeckRow[] {
  const keys = KEYS_BY_SORT[sortMode] ?? KEYS_BY_SORT.newest;
  return [...decks].sort((left, right) => {
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
 * The decks the page shows. The format and the order pick what is open to the
 * reader: all of it for a subscriber, the first three for a guest. Class,
 * tags and search only narrow that, so no filter opens a deck the guest's
 * view of the format does not.
 */
export function selectFunDecks(decks: FunDeckRow[], view: FunDecksView, hasFullAccess: boolean): FunDeckRow[] {
  const inFormat = decks.filter(deck => view.format === 'all' || (deck.format.toLowerCase() === 'wild' ? 'wild' : 'standard') === view.format);
  const ordered = orderFunDecks(inFormat, view.sort);
  const open = hasFullAccess ? ordered : ordered.slice(0, FUN_DECKS_FREE_PREVIEW_COUNT);
  const needle = view.query.trim().toLocaleLowerCase('ru-RU');
  return open.filter(deck => {
    if (view.classes.length && !view.classes.includes(funDeckClassId(deck))) return false;
    if (view.tags.length && !deck.tags?.some(tag => view.tags.includes(tag as FunDeckTagId))) return false;
    if (!needle) return true;
    return [deck.title, deck.sourceTitle, classLabel(deck), deck.streamer, deck.nearestArchetype, deck.nearestArchetypeLabel]
      .filter(Boolean).join(' ').toLocaleLowerCase('ru-RU').includes(needle);
  });
}

/**
 * What a guest's first view shows: the selection's summary and its newest
 * free decks. This is all that may enter server-rendered HTML; the complete
 * selection is paid and stays a browser request.
 */
export function funDecksGuestPreview(payload: FunDecksPayload): FunDecksPayload {
  return { ...payload, decks: orderFunDecks(payload.decks, 'newest').slice(0, FUN_DECKS_FREE_PREVIEW_COUNT) };
}
