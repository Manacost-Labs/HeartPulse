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

/** The filter chips: the tag and the reason code of the API it stands for. */
export const FUN_DECK_TAGS: ReadonlyArray<{ id: FunDeckTagId; label: string; reason: string }> = [
  { id: 'highlander', label: 'Хайлендер', reason: 'highlander_shape' },
  { id: 'xl', label: 'XL', reason: 'xl_shape' },
  { id: 'meme', label: 'Мем', reason: 'meme_low_winrate' },
  { id: 'cheese', label: 'Сыр', reason: 'cheese_high_winrate' },
  { id: 'concept', label: 'Концепт', reason: 'concept_title' },
];

/** Hero classes by the lower-case Latin key of `className`, listed in the order of their Russian names. */
export const FUN_DECK_CLASSES: ReadonlyArray<{ id: string; label: string; color: string; icon: string }> = [
  { id: 'warrior', label: 'Воин', color: '#8e342f', icon: '/class_icon/ui/warrior-64.webp' },
  { id: 'druid', label: 'Друид', color: '#8b4d25', icon: '/class_icon/ui/druid-64.webp' },
  { id: 'priest', label: 'Жрец', color: '#6e6862', icon: '/class_icon/ui/priest-64.webp' },
  { id: 'mage', label: 'Маг', color: '#326c97', icon: '/class_icon/ui/mage-64.webp' },
  { id: 'hunter', label: 'Охотник', color: '#3f792f', icon: '/class_icon/ui/hunter-64.webp' },
  { id: 'demonhunter', label: 'Охотник на демонов', color: '#556d24', icon: '/class_icon/ui/demonhunter-64.webp' },
  { id: 'paladin', label: 'Паладин', color: '#a77816', icon: '/class_icon/ui/paladin-64.webp' },
  { id: 'rogue', label: 'Разбойник', color: '#55545b', icon: '/class_icon/ui/rogue-64.webp' },
  { id: 'deathknight', label: 'Рыцарь смерти', color: '#397b87', icon: '/class_icon/ui/deathknight-64.webp' },
  { id: 'warlock', label: 'Чернокнижник', color: '#694477', icon: '/class_icon/ui/warlock-64.webp' },
  { id: 'shaman', label: 'Шаман', color: '#345aa0', icon: '/class_icon/ui/shaman-64.webp' },
];

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

/** Larger first (`direction` -1) or smaller first (1); a missing number goes last either way. */
function byNumber(key: Key, direction: 1 | -1) {
  return (left: FunDeckRow, right: FunDeckRow): number => {
    const a = key(left);
    const b = key(right);
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    return (a - b) * direction;
  };
}

const KEYS_BY_SORT: Record<FunDecksSortMode, Array<ReturnType<typeof byNumber>>> = {
  newest: [byNumber(newestKey, -1), byNumber(funKey, -1)],
  fun: [byNumber(funKey, -1), byNumber(newestKey, -1)],
  reliable: [byNumber(deck => deck.winRateCiLow ?? null, -1), byNumber(deck => deck.winRate, -1),
    byNumber(funKey, -1), byNumber(newestKey, -1)],
  distant: [byNumber(deck => deck.maxMetaSimilarity, 1), byNumber(funKey, -1), byNumber(newestKey, -1)],
};

/** The page's order. A key breaks ties by the next one; decks equal on all of them keep the order the API sent. */
export function orderFunDecks(decks: FunDeckRow[], sortMode: FunDecksSortMode): FunDeckRow[] {
  const keys = KEYS_BY_SORT[sortMode] ?? KEYS_BY_SORT.newest;
  return [...decks].sort((left, right) => {
    for (const compare of keys) {
      const difference = compare(left, right);
      if (difference) return difference;
    }
    return 0;
  });
}

const REASON_LABELS: Record<string, string> = {
  meta_core_outlier: 'Далеко от меты',
  low_meta_overlap: 'Мало общего с метой',
  concept_title: 'Концепт',
  rare_archetype_name: 'Редкий архетип',
  highlander_shape: 'Хайлендер',
  xl_shape: 'XL-колода',
  meme_low_winrate: 'Мем',
  cheese_high_winrate: 'Сыр',
};

/** Card packages that make a deck unusual. The neutral packages (quest, XL, …) explain nothing on their own. */
const PACKAGE_NAMES: Record<string, string> = {
  reno_highlander: 'Рено',
  odd_even: 'Чёт/нечёт',
  mechathun: 'Меха-К\'тун',
  togwaggle_mill: 'Вихлепых',
  cthun: 'К\'тун',
  whizbang: 'Чудастер',
  sathrovarr: 'Сатроварр',
  yogg_package: 'Йогг-Сарон',
  steal_package: 'Кража карт',
};

/** What makes a deck unusual first, how far it is from the meta last. */
const WHY_ORDER = ['package', 'highlander_shape', 'xl_shape', 'concept_title', 'meme_low_winrate',
  'cheese_high_winrate', 'rare_archetype_name', 'meta_core_outlier', 'low_meta_overlap'];

/** The filter tags a deck carries, from every reason code it has. */
export function funDeckTags(deck: Pick<FunDeckRow, 'reasons'>): FunDeckTagId[] {
  return FUN_DECK_TAGS.filter(tag => deck.reasons.includes(tag.reason)).map(tag => tag.id);
}

/**
 * Up to three Russian reasons the deck is "fun", in the order of
 * `WHY_ORDER`; a tag the reader filters by comes first, so the card always
 * shows why it matched. The API's internal codes (score arithmetic, rejection
 * reasons) and unknown ones never reach the page.
 */
export function funDeckWhy(deck: Pick<FunDeckRow, 'reasons'>, pinned: readonly FunDeckTagId[] = []): string[] {
  const pinnedReasons = new Set(FUN_DECK_TAGS.filter(tag => pinned.includes(tag.id)).map(tag => tag.reason));
  const found = new Map<string, string>();
  for (const reason of deck.reasons) {
    // Own keys only: a code such as "valueOf" must not find a label on Object.prototype.
    if (Object.hasOwn(REASON_LABELS, reason)) found.set(reason, REASON_LABELS[reason]);
    const name = reason.startsWith('pkg:') && Object.hasOwn(PACKAGE_NAMES, reason.slice(4)) ? PACKAGE_NAMES[reason.slice(4)] : '';
    if (name && !found.has('package')) found.set('package', `Пакет: ${name}`);
  }
  if (deck.reasons.includes('card_package') && !found.has('package')) found.set('package', 'Пакет карт');
  const rank = (code: string) => (pinnedReasons.has(code) ? 0 : 1000) + WHY_ORDER.indexOf(code);
  return [...found.entries()].sort(([a], [b]) => rank(a) - rank(b)).slice(0, WHY_TAGS_SHOWN).map(([, label]) => label);
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
    if (view.tags.length && !funDeckTags(deck).some(tag => view.tags.includes(tag))) return false;
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
