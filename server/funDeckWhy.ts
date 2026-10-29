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
 * three), `tags` the filter tags it carries. The API's internal codes (score
 * arithmetic, rejection reasons) and unknown ones produce nothing.
 */
export function funDeckWhy(reasons: readonly string[]): { why: string[]; tags: string[] } {
  const found = new Map<string, string>();
  for (const reason of reasons) {
    // Own keys only: a code such as "valueOf" must not find a label on Object.prototype.
    if (Object.hasOwn(REASON_LABELS, reason)) found.set(reason, REASON_LABELS[reason]);
    const name = reason.startsWith('pkg:') && Object.hasOwn(PACKAGE_NAMES, reason.slice(4)) ? PACKAGE_NAMES[reason.slice(4)] : '';
    if (name && !found.has('package')) found.set('package', `Пакет: ${name}`);
  }
  if (reasons.includes('card_package') && !found.has('package')) found.set('package', 'Пакет карт');
  return {
    why: [...found].sort(([a], [b]) => WHY_ORDER.indexOf(a) - WHY_ORDER.indexOf(b)).map(([, label]) => label),
    tags: Object.keys(TAG_BY_REASON).filter(reason => reasons.includes(reason)).map(reason => TAG_BY_REASON[reason]),
  };
}
