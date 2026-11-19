/**
 * The open slice of the Battlegrounds hero ranking as the page keeps it.
 * Express answers `GET /api/bg/heroes/public?mode=` with the whitelisted
 * projection; this parser copies field by field and caps the lists, so a
 * figure the projection should not carry (another rating range, the full
 * placement distribution, the adjusted placement) cannot reach the HTML, the
 * RSC payload (`self.__next_f`) or the page's JSON-LD even if it arrived.
 */
export const HEROES_RANKING_LIMIT = 200;
export const HEROES_RANKING_MODES = ['solo', 'duos'] as const;
export type HeroesRankingMode = typeof HEROES_RANKING_MODES[number];
const TIERS = new Set(['S', 'A', 'B', 'C', 'D', 'E', 'F']);

export type PublicBattlegroundHeroRow = {
  dbfId: number;
  name: string;
  image: string | null;
  tier: string;
  avgPlacement: number;
  top4Rate: number | null;
  pickRate: number | null;
  games: number | null;
  heroPowerName: string | null;
  bestComposition: string | null;
  keyMinions: string[];
};

export type PublicBattlegroundHeroesRanking = {
  mode: HeroesRankingMode;
  updatedAt: string | null;
  source: string;
  heroes: PublicBattlegroundHeroRow[];
};

export const heroesRankingPath = (mode: HeroesRankingMode) => `/api/bg/heroes/public?mode=${mode}`;

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, maximum = 180): string => typeof value === 'string' ? value.trim().slice(0, maximum) : '';
const percent = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value * 100) / 100 : null;

function row(value: unknown): PublicBattlegroundHeroRow | null {
  const hero = record(value);
  const dbfId = Number(hero?.dbfId);
  const name = text(hero?.name);
  const tier = text(hero?.tier, 2);
  const avg = Number(hero?.avgPlacement);
  if (!hero || !Number.isSafeInteger(dbfId) || dbfId <= 0 || !name || !TIERS.has(tier)
    || !Number.isFinite(avg) || avg < 1 || avg > 8) return null;
  const image = text(hero.image, 500);
  const games = Number(hero.games);
  return {
    dbfId, name, tier,
    image: image.startsWith('/api/public-resource/') ? image : null,
    avgPlacement: Math.round(avg * 100) / 100,
    top4Rate: percent(hero.top4Rate),
    pickRate: percent(hero.pickRate),
    games: Number.isSafeInteger(games) && games > 0 ? games : null,
    heroPowerName: text(hero.heroPowerName) || null,
    bestComposition: text(hero.bestComposition) || null,
    keyMinions: (Array.isArray(hero.keyMinions) ? hero.keyMinions : []).slice(0, 3).map(item => text(item)).filter(Boolean),
  };
}

/** `null` when the answer is not a ranking or has no heroes: the page then renders without the table. */
export function parsePublicBattlegroundHeroesRanking(raw: unknown, mode: HeroesRankingMode): PublicBattlegroundHeroesRanking | null {
  const data = record(raw);
  if (!data || data.mode !== mode || !Array.isArray(data.heroes)) return null;
  const seen = new Set<number>();
  const heroes = data.heroes.slice(0, HEROES_RANKING_LIMIT).flatMap(item => {
    const parsed = row(item);
    if (!parsed || seen.has(parsed.dbfId)) return [];
    seen.add(parsed.dbfId);
    return [parsed];
  });
  if (!heroes.length) return null;
  const updatedAt = text(data.updatedAt, 40);
  return {
    mode, heroes, source: text(data.source, 40),
    updatedAt: updatedAt && Number.isFinite(Date.parse(updatedAt)) ? updatedAt : null,
  };
}
