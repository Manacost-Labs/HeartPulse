/** `off_meta`: a forgotten archetype; every other deck, and any row of an API that predates the field, is a brew. */
export type FunDeckKind = 'brew' | 'off_meta';

export function normalizeFunDeckKind(value: unknown): FunDeckKind {
  return value === 'off_meta' ? 'off_meta' : 'brew';
}

const REASON_LABELS: Record<string, string> = {
  unique_list: 'Уникальный список',
  far_from_ladder: 'Далеко от меты',
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
const WHY_ORDER = ['off_meta', 'package', 'unique_list', 'highlander_shape', 'xl_shape', 'concept_title', 'meme_low_winrate',
  'cheese_high_winrate', 'rare_archetype_name', 'far_from_ladder', 'meta_core_outlier', 'low_meta_overlap'];

/** The reason codes the page filters by, and the tag each stands for. */
const TAG_BY_REASON: Record<string, string> = {
  highlander_shape: 'highlander',
  xl_shape: 'xl',
  meme_low_winrate: 'meme',
  cheese_high_winrate: 'cheese',
  concept_title: 'concept',
};

/**
 * What a deck says about itself, from the API's machine-readable `reasons`:
 * `why` is every Russian reason in order of interest (the page shows the first
 * three), `tags` the filter tags it carries (`offmeta` follows the deck's `kind`, not a reason). The API's internal codes (score
 * arithmetic, rejection reasons) and unknown ones produce nothing.
 */
export function funDeckWhy(reasons: readonly string[], kind: FunDeckKind = 'brew'): { why: string[]; tags: string[] } {
  const found = new Map<string, string>();
  if (kind === 'off_meta') found.set('off_meta', 'Офф-мета');
  for (const reason of reasons) {
    // Own keys only: a code such as "valueOf" must not find a label on Object.prototype.
    if (Object.hasOwn(REASON_LABELS, reason)) found.set(reason, REASON_LABELS[reason]);
    const name = reason.startsWith('pkg:') && Object.hasOwn(PACKAGE_NAMES, reason.slice(4)) ? PACKAGE_NAMES[reason.slice(4)] : '';
    if (name && !found.has('package')) found.set('package', `Пакет: ${name}`);
  }
  if (reasons.includes('card_package') && !found.has('package')) found.set('package', 'Пакет карт');
  return {
    why: [...found].sort(([a], [b]) => WHY_ORDER.indexOf(a) - WHY_ORDER.indexOf(b)).map(([, label]) => label),
    tags: [
      ...Object.keys(TAG_BY_REASON).filter(reason => reasons.includes(reason)).map(reason => TAG_BY_REASON[reason]),
      ...(kind === 'off_meta' ? ['offmeta'] : []),
    ],
  };
}
