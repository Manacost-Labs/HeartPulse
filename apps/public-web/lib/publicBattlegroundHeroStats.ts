/**
 * The open statistics of one hero as the page keeps them (`stats` of
 * `GET /api/bg/heroes/public/:dbfId`: the hero's row in the open ranking of the
 * base range «Топ 50%», solo and duos). The parser copies field by field, so a
 * figure the projection should not carry (another rating range, the full
 * placement distribution, the anomaly-adjusted placement, compositions with
 * metrics, patch history) cannot reach the HTML, the RSC payload
 * (`self.__next_f`) or the page's JSON-LD even if it arrived.
 */
export const HERO_STATS_MODES = ['solo', 'duos'] as const;
export type HeroStatsMode = typeof HERO_STATS_MODES[number];
const TIERS = new Set(['S', 'A', 'B', 'C', 'D', 'E', 'F']);

export type PublicBattlegroundHeroModeStats = {
  tier: string;
  avgPlacement: number;
  top4Rate: number | null;
  pickRate: number | null;
  games: number | null;
  bestComposition: string | null;
  keyMinions: string[];
  rank: number;
  of: number;
};

export type PublicBattlegroundHeroStats = {
  heroPowerName: string | null;
  updatedAt: string | null;
  source: string;
  modes: Partial<Record<HeroStatsMode, PublicBattlegroundHeroModeStats>>;
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, maximum = 180): string => typeof value === 'string' ? value.trim().slice(0, maximum) : '';
const percent = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value * 100) / 100 : null;

function modeStats(value: unknown): PublicBattlegroundHeroModeStats | null {
  const mode = record(value);
  if (!mode) return null;
  const tier = text(mode.tier, 2);
  const avg = Number(mode.avgPlacement);
  const rank = Number(mode.rank);
  const of = Number(mode.of);
  if (!TIERS.has(tier) || !Number.isFinite(avg) || avg < 1 || avg > 8
    || !Number.isSafeInteger(rank) || !Number.isSafeInteger(of) || rank < 1 || of < rank || of > 1000) return null;
  const games = Number(mode.games);
  return {
    tier, avgPlacement: Math.round(avg * 100) / 100,
    top4Rate: percent(mode.top4Rate),
    pickRate: percent(mode.pickRate),
    games: Number.isSafeInteger(games) && games > 0 ? games : null,
    bestComposition: text(mode.bestComposition) || null,
    keyMinions: (Array.isArray(mode.keyMinions) ? mode.keyMinions : []).slice(0, 3).map(item => text(item)).filter(Boolean),
    rank, of,
  };
}

/** `null` for an unrated hero, a missing or unreadable block: the page then has no figures to print. */
export function parsePublicBattlegroundHeroStats(raw: unknown): PublicBattlegroundHeroStats | null {
  const stats = record(raw);
  const modes = record(stats?.modes);
  if (!stats || !modes) return null;
  const parsed: PublicBattlegroundHeroStats['modes'] = {};
  for (const mode of HERO_STATS_MODES) {
    const value = modeStats(modes[mode]);
    if (value) parsed[mode] = value;
  }
  if (!parsed.solo && !parsed.duos) return null;
  const updatedAt = text(stats.updatedAt, 40);
  return {
    modes: parsed, heroPowerName: text(stats.heroPowerName) || null, source: text(stats.source, 40),
    updatedAt: updatedAt && Number.isFinite(Date.parse(updatedAt)) ? updatedAt : null,
  };
}

/** What a hero's page reads of the answer of `/api/bg/heroes/public/:dbfId`. */
export function publicBattlegroundHeroStatsOf(answer: unknown): PublicBattlegroundHeroStats | null {
  return parsePublicBattlegroundHeroStats(record(answer)?.stats);
}

const MODE_LABEL: Record<HeroStatsMode, string> = { solo: 'Соло', duos: 'Дуо' };
export const heroStatsModeLabel = (mode: HeroStatsMode): string => MODE_LABEL[mode];

const number = (value: number, digits: number) => value.toFixed(digits).replace('.', ',');
export const formatHeroFigure = number;

/**
 * One sentence of the facts, no hand-written text: tier, average place and the
 * best build in the first mode the hero is rated in. `null` without stats.
 */
export function heroStatsSummary(name: string, stats: PublicBattlegroundHeroStats | null): string | null {
  const mode = stats?.modes.solo ? 'solo' : stats?.modes.duos ? 'duos' : null;
  const values = mode ? stats?.modes[mode] : undefined;
  if (!mode || !values) return null;
  const parts = [`тир ${values.tier}`, `среднее место ${number(values.avgPlacement, 2)}`];
  if (values.top4Rate !== null) parts.push(`топ-4 ${number(values.top4Rate, 1)}%`);
  const build = values.bestComposition ? `, лучшая сборка «${values.bestComposition}»` : '';
  return `${name} в рейтинге «Топ 50%», ${MODE_LABEL[mode]}: ${parts.join(', ')}${build}.`;
}
