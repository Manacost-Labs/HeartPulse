/** Типы модели страницы радара; разбор ответа hs-data-api — в contract.ts. */

export const RADAR_CLASS_KEYS = [
  'deathknight', 'demonhunter', 'druid', 'hunter', 'mage', 'paladin',
  'priest', 'rogue', 'shaman', 'warlock', 'warrior', 'neutral',
] as const;

export type RadarClassKey = typeof RADAR_CLASS_KEYS[number];
export type RadarKind = 'card' | 'archetype' | 'class';
export type RadarPostSource = 'reddit' | 'x';
export type RadarSentiment = 'negative' | 'mixed' | 'neutral' | 'positive' | 'no_data';
export type RadarStance = 'wants_nerf' | 'wants_buff' | 'divided' | 'indifferent' | 'no_data';

export type RadarTrendPoint = {
  period: string;
  /** Подпись периода по-русски («Неделя», «Баны»). */
  label: string;
  /** Проценты 0–100; `null` — нет данных, а не ноль. */
  winrate: number | null;
  popularity: number | null;
  games: number | null;
};

export type RadarStats = {
  source: 'hsguru' | 'hsreplay';
  /** Ранг и период основных чисел, по-русски. */
  rankLabel: string;
  periodLabel: string;
  winrate: number | null;
  popularity: number | null;
  /** Игры архетипа или класса; для карты — сколько раз её сыграли. */
  games: number | null;
  /** Периоды основного ранга в порядке источника. */
  trend: RadarTrendPoint[];
};

export type RadarPost = {
  source: RadarPostSource;
  kind: 'post' | 'comment' | 'tweet';
  url: string;
  author: string;
  score: number;
  comments: number | null;
  /** Перевод на русский от hs-data-api; без перевода оба `null`, и страница даёт только ссылку на обсуждение. */
  title: string | null;
  text: string | null;
  community: string | null;
  publishedAt: string | null;
  /** Пост официального аккаунта Blizzard или разработчика. */
  official: boolean;
};

export type RadarSocial = {
  mentions: number;
  reddit: number;
  x: number;
  sentiment: RadarSentiment;
  stance: RadarStance;
  summary: string | null;
  posts: RadarPost[];
};

/** Неделя до или после правки (HSReplay, Легенда); `archetype` — колода, в которой играли карту. */
export type RadarPrecedentStats = { archetype: string | null; winrate: number | null; popularity: number | null };

/** Прошлая правка Blizzard, похожая на кандидата (история патчей hs-data-api). */
export type RadarPrecedent = {
  id: string;
  /** Короткая версия патча («36.4.2»). */
  patch: string;
  date: string | null;
  name: string;
  classKey: RadarClassKey;
  direction: 'nerf' | 'buff' | 'rework' | 'neutral';
  /** Изменения строками: «Атака: 8 → 9», «Текст: «…» → «…»». */
  changes: string[];
  summary: string | null;
  /** Сколько дней набору карты было на момент правки. */
  setAgeDays: number | null;
  /** Числа карты до и после правки; `null` — их нет. */
  before: RadarPrecedentStats | null;
  after: RadarPrecedentStats | null;
  /** Чем случай похож на кандидата, по-русски. */
  similarity: string[];
  /** Модель опиралась на этот случай в выводе. */
  cited: boolean;
  cardHref: string | null;
  patchHref: string;
};

/** Закономерность решений Blizzard по истории патчей. */
export type RadarPattern = { title: string; text: string | null; count: number | null };

/** История патчей Blizzard, на которую опирается прогноз. */
export type RadarHistory = {
  summary: string | null;
  /** Сколько балансных патчей разобрано и за какой период. */
  balancePatches: number | null;
  from: string | null;
  to: string | null;
  patterns: RadarPattern[];
};

export type RadarCandidate = {
  id: string;
  kind: RadarKind;
  entity: {
    /** `cardId`, slug архетипа Стандарта или ключ класса. */
    id: string;
    dbfId: number | null;
    name: string;
    nameEn: string | null;
    classKey: RadarClassKey;
    /** Страница сущности на сайте; у класса её нет. */
    href: string | null;
  };
  /** Уверенность модели 0–100 и её значение в прошлом запуске. */
  confidence: number;
  previousConfidence: number | null;
  headline: string | null;
  verdict: string;
  reasons: string[];
  suggestedChange: string | null;
  stats: RadarStats;
  social: RadarSocial;
  /** Похожие прошлые случаи: сначала те, на которые опиралась модель. */
  precedents: RadarPrecedent[];
  firstSeenAt: string | null;
  /** Схема 2 hs-data-api: у прогонов до неё — пустые списки и `null`. */
  forecast: RadarForecast;
};

/** Варианты правки «было → станет»; `before`/`after` — числа для стоимости и характеристик. */
export type RadarPredictedChange = {
  change: string;
  field: 'cost' | 'attack' | 'health' | 'durability' | 'armor' | 'text' | 'other';
  before: number | null;
  after: number | null;
  /** Вероятность варианта, если правка будет, 0–100. */
  probability: number | null;
};

export type RadarForecast = {
  /** Цифры, на которых основан вывод. */
  keyNumbers: string[];
  /** От самого вероятного варианта. */
  predictedChanges: RadarPredictedChange[];
  metaImpact: string | null;
  /** Как часто Blizzard меняла сущности с такими же цифрами. */
  calibration: { rate: number; hits: number; samples: number } | null;
  trend: { status: 'new' | 'up' | 'down' | 'stable'; delta: number | null } | null;
  /** Уверенность по прогонам, от старых к новым, включая текущий. */
  confidenceHistory: Array<{ at: string; confidence: number }>;
};

export type RadarChangeItem = { side: 'nerfs' | 'buffs'; kind: RadarKind; name: string; confidence: number | null; delta: number | null };

/** Что изменилось с прошлого прогона. */
export type RadarChanges = {
  previousAt: string | null;
  added: RadarChangeItem[];
  removed: RadarChangeItem[];
  risen: RadarChangeItem[];
  fallen: RadarChangeItem[];
};

/** Когда вероятен следующий балансный патч: проценты 0–100. */
export type RadarTiming = { within7: number | null; within14: number | null; daysSinceLastPatch: number | null; outlook: string | null };

/** Попадания одной стороны бэктеста: сколько правок радар назвал заранее в своих первых N. */
export type RadarBacktestSide = { top: number; hits: number; actual: number; predicted: number; precision: number | null; recall: number | null };

/** Проверка радара на прошлых патчах (статистическая часть, неделя до патча). */
export type RadarBacktest = { patches: number; nerf: RadarBacktestSide[]; buff: RadarBacktestSide[] };

export type RadarReport = {
  schemaVersion: 1;
  generatedAt: string;
  model: string;
  format: 'standard';
  /** Патч, на котором считали радар, и его страница в архиве патчноутов сайта. */
  patch: { version: string; href: string } | null;
  /** Окно сбора обсуждений. */
  window: { from: string; to: string } | null;
  summary: string;
  nerfs: RadarCandidate[];
  buffs: RadarCandidate[];
  /** История патчей и закономерности Blizzard; `null` у прогонов без истории. */
  history: RadarHistory | null;
  timing: RadarTiming | null;
  changes: RadarChanges | null;
  backtest: RadarBacktest | null;
  /**
   * Ставит только сервер сайта: `true`, когда вместо hs-data-api отдана
   * встроенная демонстрационная фикстура (флаг `RADAR_FIXTURE=1`).
   */
  demo: boolean;
};

/** Как назвать архетип HSGuru на сайте: slug страницы и русское имя. */
export type RadarArchetypeNamer = (name: string) => { slug: string; label: string };
