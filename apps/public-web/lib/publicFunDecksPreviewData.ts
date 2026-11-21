import { funDecksOpenPreview, type FunDeckOpenCard, type FunDeckOpenSideboard, type FunDeckRow, type FunDecksPayload } from '@/src/features/funDecksPreview';

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

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length <= 60).slice(0, 12) : [];
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new InvalidSelection();
  return value;
}

const CARD_ID = /^[A-Za-z0-9_]{2,80}$/;

/** The decoded card list the API sends; a line with an unusable id or name keeps its place and count, a line without a count drops the list (the deck stays with its code). */
function openCards(value: unknown): FunDeckOpenCard[] | undefined {
  if (!Array.isArray(value) || !value.length || value.length > 60) return undefined;
  try {
    return value.map(raw => {
      const card = record(raw);
      // An id the allowlist refuses never costs the deck its list: the line is printed by name, without a link.
      const id = typeof card.id === 'string' && CARD_ID.test(card.id) ? card.id : null;
      const name = typeof card.name === 'string' && card.name !== '' && card.name.length <= 120 ? card.name : null;
      const cost = card.cost === null || card.cost === undefined ? null : count(card.cost);
      const copies = count(card.count);
      if (copies < 1 || copies > 40) throw new InvalidSelection();
      return { id, name, cost, count: copies, hasPage: card.hasPage === true && id !== null && name !== null };
    });
  } catch (error) {
    if (error instanceof InvalidSelection) return undefined;
    throw error;
  }
}

/** The sideboards of a deck with a card list: each under a key card of that list, its lines read as the list's; one that does not read is left out. */
function openSideboards(value: unknown, cards: FunDeckOpenCard[] | undefined): FunDeckOpenSideboard[] | undefined {
  if (!cards || !Array.isArray(value) || !value.length || value.length > 4) return undefined;
  const boards = value.flatMap(raw => {
    const board = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as RecordValue : null;
    const keyId = typeof board?.keyId === 'string' && CARD_ID.test(board.keyId) ? board.keyId : null;
    const lines = keyId && cards.some(card => card.id === keyId) && Array.isArray(board?.cards) && board.cards.length <= 10
      ? openCards(board.cards) : undefined;
    return keyId && lines ? [{ keyId, cards: lines }] : [];
  });
  return boards.length ? boards : undefined;
}

function deck(raw: unknown): FunDeckRow {
  const row = record(raw);
  const cards = openCards(row.cards);
  const sideboards = openSideboards(row.sideboards, cards);
  const render = row.render === undefined || row.render === null ? undefined : record(row.render);
  return {
    title: text(row.title, 200), deckCode: text(row.deckCode, 400), format: text(row.format, 20),
    className: text(row.className, 40), streamer: optionalText(row.streamer, 120),
    kind: row.kind === 'off_meta' ? 'off_meta' : 'brew', ...(row.pinned === true ? { pinned: true } : {}),
    funScore: optionalNumber(row.funScore), maxMetaSimilarity: optionalNumber(row.maxMetaSimilarity),
    nearestArchetype: optionalText(row.nearestArchetype, 160), nearestArchetypeLabel: optionalText(row.nearestArchetypeLabel, 200),
    winRate: optionalNumber(row.winRate), winRateCiLow: optionalNumber(row.winRateCiLow), winRateCiHigh: optionalNumber(row.winRateCiHigh),
    variants: optionalNumber(row.variants), sourceTitle: optionalText(row.sourceTitle, 200), games: optionalNumber(row.games),
    reasons: Array.isArray(row.reasons) ? row.reasons.filter((reason): reason is string => typeof reason === 'string') : [],
    why: strings(row.why), tags: strings(row.tags),
    url: httpsUrl(row.url), firstSeenAt: optionalText(row.firstSeenAt, 64), lastSeenAt: optionalText(row.lastSeenAt, 64),
    ...(cards ? { cards } : {}),
    ...(sideboards ? { sideboards } : {}),
    ...(render ? { render: { imageUrl: text(render.imageUrl, 500), previewImageUrl: text(render.previewImageUrl, 500) } } : {}),
  };
}

/**
 * The first view of the fun-deck selection, from the anonymous API response:
 * its summary and every deck with its card list (the selection is open), field
 * by field, or `null` for a response that is not a selection.
 */
export function publicFunDecksPreview(raw: unknown): FunDecksPayload | null {
  try {
    const payload = record(raw);
    const stats = record(payload.stats);
    const methodology = record(payload.methodology);
    if (!Array.isArray(payload.decks) || payload.decks.length > 1000) return null;
    return funDecksOpenPreview({
      fetchedAt: optionalText(payload.fetchedAt, 64),
      stats: { total: count(stats.total), standard: count(stats.standard), wild: count(stats.wild) },
      methodology: {
        detectorVersion: optionalText(methodology.detectorVersion, 40),
        minFunScore: optionalNumber(methodology.minFunScore) ?? null,
        maxMetaSimilarity: optionalNumber(methodology.maxMetaSimilarity) ?? null,
        ladderMemberSim: optionalNumber(methodology.ladderMemberSim) ?? null,
      },
      decks: payload.decks.map(deck),
    });
  } catch (error) {
    if (error instanceof InvalidSelection) return null;
    throw error;
  }
}
