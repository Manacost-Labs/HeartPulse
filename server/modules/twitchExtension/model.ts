import { gzipSync } from 'node:zlib';

/** The request body the desktop app may send; bigger bodies are refused before validation. */
export const TWITCH_STATE_MAX_BODY_BYTES = 16 * 1024;
/** Twitch Extension PubSub refuses a message above 5 KB; the whole envelope must fit. */
export const TWITCH_PUBSUB_MAX_MESSAGE_BYTES = 5 * 1024;
/** One message per second per channel is the PubSub budget of an extension. */
export const TWITCH_STATE_MIN_INTERVAL_MS = 1_000;
/** A viewer who opens the stream later gets the last envelope only while it is this fresh. */
export const TWITCH_SNAPSHOT_TTL_MS = 30 * 60_000;

const FORMATS = ['standard', 'wild', 'twist', 'classic', 'casual', 'other'] as const;
const MAX_CARDS = 80;
const CARD_ID = /^[A-Za-z0-9_]{1,64}$/;

export type TwitchDeckFormat = typeof FORMATS[number];

export type TwitchDeckCard = {
  id: string;
  dbf: number;
  cost: number;
  name: string;
  left: number;
  total: number;
};

/**
 * What a viewer may see. Rebuilt field by field from the validated input, so
 * a field the app might add later (a hand, the deck order, the opponent) is
 * never forwarded until this type allows it.
 */
export type TwitchStreamState =
  | { mode: 'none' }
  | {
    mode: 'constructed';
    deck: {
      name: string | null;
      hero: string | null;
      format: TwitchDeckFormat;
      left: number;
      cards: TwitchDeckCard[];
    };
    game?: { turn: number };
  };

export type TwitchStateInput = { v: 1; seq: number; state: TwitchStreamState };

type Validation = { ok: true; value: TwitchStateInput } | { ok: false; field: string };

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);
const isInt = (value: unknown, min: number, max: number): value is number => (
  Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max
);
const text = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
};

function validateCard(value: unknown): TwitchDeckCard | null {
  if (!isRecord(value)) return null;
  const name = text(value.name, 80);
  if (typeof value.id !== 'string' || !CARD_ID.test(value.id) || !name
    || !isInt(value.dbf, 0, 10_000_000) || !isInt(value.cost, 0, 99)
    || !isInt(value.left, 0, 30) || !isInt(value.total, 0, 30)) return null;
  return { id: value.id, dbf: value.dbf, cost: value.cost, name, left: value.left, total: value.total };
}

/** Validates the app's `POST twitch/state` body against the contract in docs/specs/twitch-extension.md. */
export function validateTwitchState(body: unknown): Validation {
  if (!isRecord(body)) return { ok: false, field: 'body' };
  if (body.v !== 1) return { ok: false, field: 'v' };
  if (!isInt(body.seq, 0, Number.MAX_SAFE_INTEGER)) return { ok: false, field: 'seq' };
  if (body.mode === 'none') return { ok: true, value: { v: 1, seq: body.seq, state: { mode: 'none' } } };
  if (body.mode !== 'constructed') return { ok: false, field: 'mode' };

  const deck = body.deck;
  if (!isRecord(deck)) return { ok: false, field: 'deck' };
  const name = deck.name === null ? null : text(deck.name, 100);
  if (name === null && deck.name !== null) return { ok: false, field: 'deck.name' };
  const hero = deck.hero === null ? null : (typeof deck.hero === 'string' && CARD_ID.test(deck.hero) ? deck.hero : undefined);
  if (hero === undefined) return { ok: false, field: 'deck.hero' };
  if (!FORMATS.includes(deck.format as TwitchDeckFormat)) return { ok: false, field: 'deck.format' };
  if (!isInt(deck.left, 0, 100)) return { ok: false, field: 'deck.left' };
  if (!Array.isArray(deck.cards) || deck.cards.length > MAX_CARDS) return { ok: false, field: 'deck.cards' };
  const cards: TwitchDeckCard[] = [];
  for (const input of deck.cards) {
    const card = validateCard(input);
    if (!card) return { ok: false, field: 'deck.cards' };
    cards.push(card);
  }

  let game: { turn: number } | undefined;
  if (body.game !== undefined && body.game !== null) {
    if (!isRecord(body.game) || !isInt(body.game.turn, 0, 999)) return { ok: false, field: 'game.turn' };
    game = { turn: body.game.turn };
  }
  return {
    ok: true,
    value: {
      v: 1,
      seq: body.seq,
      state: {
        mode: 'constructed',
        deck: { name, hero, format: deck.format as TwitchDeckFormat, left: deck.left, cards },
        ...(game ? { game } : {}),
      },
    },
  };
}

/**
 * The PubSub message and the snapshot body: `z` is the gzip of the state JSON
 * (without `v`/`seq`) in base64; `at` is the site's receive time for debugging.
 */
export function buildTwitchEnvelope(input: TwitchStateInput, receivedAt: number): string {
  const z = gzipSync(Buffer.from(JSON.stringify(input.state), 'utf8')).toString('base64');
  return JSON.stringify({ v: 1, seq: input.seq, at: receivedAt, z });
}
