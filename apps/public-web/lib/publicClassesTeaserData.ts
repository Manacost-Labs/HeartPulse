/**
 * The open slice of the Arena class ranking as the page keeps it. Express
 * answers `GET /api/winrates/public-teaser` with the whitelisted projection;
 * this parser copies field by field, rounds the winrate to 0.1 again and caps
 * the list, so a figure the projection should not carry (a winrate with more
 * digits, wins, a breakdown by period) cannot reach the HTML, the RSC payload
 * (`self.__next_f`) or the page's JSON-LD even if it arrived.
 */
export const CLASSES_TEASER_PATH = '/api/winrates/public-teaser';
export const CLASSES_TEASER_MAX_CLASSES = 20;

export type PublicClassesTeaserClass = { place: number; id: string; name: string; winrate: number; sample: number | null };
export type PublicClassesSampleUnit = 'drafts' | 'games';
export type PublicClassesTeaser = {
  updatedAt: string | null; source: string;
  /** What `sample` counts; an unknown unit drops the sample, so a draft is never called a game. */
  sampleUnit: PublicClassesSampleUnit | null;
  classes: PublicClassesTeaserClass[];
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

/** The order is the projection's: the place is the position in the list, not a figure taken from the answer. */
function classRow(value: unknown, index: number): PublicClassesTeaserClass[] {
  const row = record(value);
  const id = text(row?.id);
  const name = text(row?.name);
  const winrate = typeof row?.winrate === 'number' ? row.winrate : Number.NaN;
  if (!id || !name || !Number.isFinite(winrate) || winrate < 0 || winrate > 100) return [];
  const sample = typeof row?.sample === 'number' && Number.isInteger(row.sample) && row.sample > 0 ? row.sample : null;
  return [{ place: index + 1, id, name, winrate: Math.round(winrate * 10) / 10, sample }];
}

/** `null` when the answer is not a teaser or has no classes: the page then renders without the slice. */
export function parsePublicClassesTeaser(raw: unknown): PublicClassesTeaser | null {
  const data = record(raw);
  if (!data || !Array.isArray(data.classes)) return null;
  const classes = data.classes.slice(0, CLASSES_TEASER_MAX_CLASSES).flatMap(classRow)
    .map((item, index) => ({ ...item, place: index + 1 }));
  if (!classes.length) return null;
  const updatedAt = text(data.updatedAt);
  const sampleUnit = data.sampleUnit === 'drafts' || data.sampleUnit === 'games' ? data.sampleUnit : null;
  return {
    updatedAt: updatedAt && Number.isFinite(Date.parse(updatedAt)) ? updatedAt : null,
    source: text(data.source),
    sampleUnit,
    classes: sampleUnit ? classes : classes.map(item => ({ ...item, sample: null })),
  };
}
