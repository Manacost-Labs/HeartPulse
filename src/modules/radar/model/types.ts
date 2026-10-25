/**
 * Типы ответа `/api/radar` для страницы. Источник правды — проверка ответа
 * в server/modules/radar/contract.ts: клиент получает уже проверенные данные
 * и не может импортировать код сервера, поэтому типы повторены здесь.
 * `tests/radar.test.ts` присваивает один тип другому, так что расхождение
 * ломает `npm run lint` (docs/specs/nerf-buff-radar.md).
 */

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
  title: string | null;
  text: string;
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

export type RadarPrecedentStats = { winrate: number | null; popularity: number | null };

/** Прошлая правка Blizzard, похожая на кандидата (история патчей hs-data-api). */
export type RadarPrecedent = {
  id: string;
  /** Короткая версия патча («36.4.2»). */
  patch: string;
  date: string | null;
  name: string;
  classKey: RadarClassKey;
  direction: 'nerf' | 'buff' | 'rework' | 'neutral';
  /** Изменения строками: «Атака: 8 → 9». */
  changes: string[];
  summary: string | null;
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
};

export type RadarSource = { id: string; label: string; items: number | null };

export type RadarReport = {
  schemaVersion: 1;
  generatedAt: string;
  model: string;
  format: 'standard';
  /** Патч, на котором считали радар, и его страница в архиве патчноутов сайта. */
  patch: { version: string; href: string } | null;
  /** Окно сбора обсуждений. */
  window: { from: string; to: string } | null;
  sources: RadarSource[];
  summary: string;
  nerfs: RadarCandidate[];
  buffs: RadarCandidate[];
  /** Закономерности Blizzard; пусто, пока hs-data-api их не считает. */
  patterns: RadarPattern[];
  /**
   * Ставит только сервер сайта: `true`, когда вместо hs-data-api отдана
   * встроенная демонстрационная фикстура (флаг `RADAR_FIXTURE=1`).
   */
  demo: boolean;
};
