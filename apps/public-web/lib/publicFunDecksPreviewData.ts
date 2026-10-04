import { funDecksGuestPreview, type FunDeckRow, type FunDecksPayload } from '@/src/features/funDecksPreview';

type RecordValue = Record<string, unknown>;

class InvalidSelection extends Error {}

function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InvalidSelection();
  return value as RecordValue;
}

function text(value: unknown, maxLength: number): string {
  if (typeof value !== 'string' || value.length > maxLength) throw new InvalidSelection();
  return value;
}

function optionalText(value: unknown, maxLength: number): string | null {
  return value === null || value === undefined ? null : text(value, maxLength);
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new InvalidSelection();
  return value;
}

function httpsUrl(value: unknown): string | null {
  const source = optionalText(value, 500);
  try { return source && new URL(source).protocol === 'https:' ? source : null; } catch { return null; }
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new InvalidSelection();
  return value;
}

function deck(raw: unknown): FunDeckRow {
  const row = record(raw);
  const render = row.render === undefined || row.render === null ? undefined : record(row.render);
  return {
    title: text(row.title, 200), deckCode: text(row.deckCode, 400), format: text(row.format, 20),
    className: text(row.className, 40), streamer: optionalText(row.streamer, 120),
    funScore: optionalNumber(row.funScore), maxMetaSimilarity: optionalNumber(row.maxMetaSimilarity),
    nearestArchetype: optionalText(row.nearestArchetype, 160), winRate: optionalNumber(row.winRate),
    games: optionalNumber(row.games),
    reasons: Array.isArray(row.reasons) ? row.reasons.filter((reason): reason is string => typeof reason === 'string') : [],
    url: httpsUrl(row.url), firstSeenAt: optionalText(row.firstSeenAt, 64), lastSeenAt: optionalText(row.lastSeenAt, 64),
    ...(render ? { render: { imageUrl: text(render.imageUrl, 500), previewImageUrl: text(render.previewImageUrl, 500) } } : {}),
  };
}

/**
 * The guest's first view of the fun-deck selection, from the anonymous API
 * response: its summary and newest free decks only (the complete selection
 * is paid), or `null` for a response that is not a selection.
 */
export function publicFunDecksPreview(raw: unknown): FunDecksPayload | null {
  try {
    const payload = record(raw);
    const stats = record(payload.stats);
    const methodology = record(payload.methodology);
    if (!Array.isArray(payload.decks) || payload.decks.length > 1000) return null;
    return funDecksGuestPreview({
      fetchedAt: optionalText(payload.fetchedAt, 64),
      stats: { total: count(stats.total), standard: count(stats.standard), wild: count(stats.wild) },
      methodology: {
        detectorVersion: optionalText(methodology.detectorVersion, 40),
        minFunScore: optionalNumber(methodology.minFunScore) ?? 0.55,
        maxMetaSimilarity: optionalNumber(methodology.maxMetaSimilarity) ?? 0.42,
      },
      decks: payload.decks.map(deck),
    });
  } catch (error) {
    if (error instanceof InvalidSelection) return null;
    throw error;
  }
}
