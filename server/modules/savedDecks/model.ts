/** Enough for a personal collection; every deck costs one image render. */
export const MAX_SAVED_DECKS = 100;
export const MAX_DECK_COMMENT_LENGTH = 500;
/** A render that has not finished by then was lost (a restart); the deck is offered a retry. */
export const RENDER_STALE_MS = 5 * 60_000;

export type SavedDeckStatus = 'pending' | 'ready' | 'failed';
export type SavedDeckFormat = 'standard' | 'wild';

export type SavedDeckRecord = {
  id: string;
  userId: string;
  deckCode: string;
  /** The owner's name for the deck (their `###` line), shown on the card. */
  deckName: string;
  /**
   * The title drawn into the image: the archetype or «Колода», never the
   * owner's text, so renders stay shared with the meta pages' cache instead
   * of one new image per invented name.
   */
  renderName: string;
  format: SavedDeckFormat;
  comment: string;
  status: SavedDeckStatus;
  imageUrl: string | null;
  previewImageUrl: string | null;
  createdAt: string;
  /** When the image state last changed; a comment edit does not move it. */
  updatedAt: string;
};

/** What the owner's page receives: no account id; image URLs as the composition maps them (the site's resource proxy). */
export type SavedDeck = {
  id: string;
  deckCode: string;
  name: string;
  format: SavedDeckFormat;
  comment: string;
  status: SavedDeckStatus;
  imageUrl: string | null;
  previewImageUrl: string | null;
  createdAt: string;
};

// The deck builder's own cap: real codes, sideboards included, stay far below it.
const DECK_CODE = /^[A-Za-z0-9+/=]{16,600}$/;

/**
 * The deck code out of what a player pastes: the bare code, or the whole text
 * the game copies (`### Name`, `#` comment lines and the code on its own
 * line). The `###` line, when present, names the deck.
 */
export function parseDeckInput(
  raw: unknown,
  decodable: (deckCode: string) => boolean = () => true,
): { deckCode: string; name: string | null } | null {
  const text = String(raw ?? '').slice(0, 20_000);
  const lines = text.split(/\r\n|\r|\n/).map(line => line.trim()).filter(Boolean);
  const heading = lines.find(line => line.startsWith('###'));
  const name = heading ? cleanText(heading.replace(/^#+\s*/, ''), 80) || null : null;
  const candidates = lines.length > 1 ? lines.filter(line => !line.startsWith('#')) : [text.replace(/\s+/g, '')];
  // Every candidate line is tried: a long word before the code must not hide it.
  const deckCode = candidates.map(line => line.replace(/\s+/g, '')).find(line => DECK_CODE.test(line) && decodable(line));
  return deckCode ? { deckCode, name } : null;
}

function cleanText(value: string, maxLength: number): string {
  return value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, maxLength);
}

/** The owner's note: plain text, line breaks kept; null when it is longer than allowed. */
export function normalizeDeckComment(raw: unknown): string | null {
  const text = cleanText(String(raw ?? '').replace(/\r\n?/g, '\n'), MAX_DECK_COMMENT_LENGTH + 1).replace(/\n{3,}/g, '\n\n');
  return text.length > MAX_DECK_COMMENT_LENGTH ? null : text;
}

export function serializeSavedDeck(record: SavedDeckRecord, now: number, imageUrl: (url: string) => string = url => url): SavedDeck {
  const stale = record.status === 'pending' && now - Date.parse(record.updatedAt) > RENDER_STALE_MS;
  return {
    id: record.id,
    deckCode: record.deckCode,
    name: record.deckName,
    format: record.format,
    comment: record.comment,
    status: stale ? 'failed' : record.status,
    imageUrl: record.imageUrl ? imageUrl(record.imageUrl) : null,
    previewImageUrl: record.previewImageUrl ? imageUrl(record.previewImageUrl) : null,
    createdAt: record.createdAt,
  };
}
