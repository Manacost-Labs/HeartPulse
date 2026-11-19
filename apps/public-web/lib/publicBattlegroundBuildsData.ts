/**
 * The open slice of the Battlegrounds builds as the page keeps it. Express
 * answers `GET /api/bg/tier-lists/public?list=` with the whitelisted
 * projection; this parser copies field by field and caps the lists, so a
 * figure the projection should not carry (sample sizes, first-place and top-four
 * shares, other rating ranges, trinkets, fork analysis) cannot reach the HTML,
 * the RSC payload (`self.__next_f`) or the page's JSON-LD even if it arrived.
 */
export const BUILDS_LISTS = ['compositions', 'strategies'] as const;
export type BuildsList = typeof BUILDS_LISTS[number];
export const BUILDS_LIMIT = 60;
const TIERS = ['S', 'A', 'B', 'C', 'D'] as const;
export type BuildTier = typeof TIERS[number];

export type PublicBuildCard = { dbfId: number; name: string; image: string | null };

export type PublicBuildRow = {
  key: string;
  tier: BuildTier;
  title: string;
  description: string | null;
  difficulty: string | null;
  archetype: string | null;
  avgPlacement: number | null;
  popularity: number | null;
  coreCards: PublicBuildCard[];
  additionalCards: PublicBuildCard[];
};

export type PublicBattlegroundBuilds = {
  list: BuildsList;
  updatedAt: string | null;
  source: string;
  builds: PublicBuildRow[];
};

export const buildsPath = (list: BuildsList) => `/api/bg/tier-lists/public?list=${list}`;

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, maximum = 400): string => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maximum) : '';
const number = (value: unknown, minimum: number, maximum: number, digits: number): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
    ? Number(value.toFixed(digits)) : null;

function cards(value: unknown, maximum: number): PublicBuildCard[] {
  const seen = new Set<number>();
  const out: PublicBuildCard[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    const card = record(item);
    const dbfId = Number(card?.dbfId);
    const name = text(card?.name, 120);
    if (!card || !Number.isSafeInteger(dbfId) || dbfId <= 0 || !name || seen.has(dbfId)) continue;
    seen.add(dbfId);
    const image = text(card.image, 500);
    out.push({ dbfId, name, image: image.startsWith('/api/public-resource/') ? image : null });
    if (out.length === maximum) break;
  }
  return out;
}

function row(value: unknown): PublicBuildRow | null {
  const build = record(value);
  const key = text(build?.key, 100);
  const title = text(build?.title, 160);
  const tier = TIERS.find(item => item === build?.tier);
  const coreCards = cards(build?.coreCards, 6);
  if (!build || !/^[A-Za-z0-9_.#-]+$/.test(key) || !title || !tier || !coreCards.length) return null;
  return {
    key, tier, title, coreCards,
    description: text(build.description) || null,
    difficulty: text(build.difficulty, 40) || null,
    archetype: text(build.archetype, 80) || null,
    avgPlacement: number(build.avgPlacement, 1, 8, 2),
    popularity: number(build.popularity, 0, 100, 1),
    additionalCards: cards(build.additionalCards, 8).filter(card => !coreCards.some(core => core.dbfId === card.dbfId)),
  };
}

/** `null` when the answer is not the list asked for or has no build: the page then renders without it. */
export function parsePublicBattlegroundBuilds(raw: unknown, list: BuildsList): PublicBattlegroundBuilds | null {
  const data = record(raw);
  if (!data || data.list !== list || !Array.isArray(data.builds)) return null;
  const seen = new Set<string>();
  const builds = data.builds.slice(0, BUILDS_LIMIT).flatMap(item => {
    const parsed = row(item);
    if (!parsed || seen.has(parsed.key)) return [];
    seen.add(parsed.key);
    return [parsed];
  });
  if (!builds.length) return null;
  const updatedAt = text(data.updatedAt, 40);
  return {
    list, builds, source: text(data.source, 40),
    updatedAt: updatedAt && Number.isFinite(Date.parse(updatedAt)) ? updatedAt : null,
  };
}
