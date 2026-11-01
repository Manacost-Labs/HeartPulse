import { gunzipSync } from 'node:zlib';

/**
 * Hearthpulse replay files (`.hpr`, format 4) as players upload them from the desktop app. The app already sends a
 * sanitized copy (its `ReplayImport.Sanitize`); the server checks again and keeps only what is safe to publish:
 * - the header is rebuilt from a whitelist of `summary` fields (no ranks, no ratings, no names);
 * - every event line must be a known record of its kind, made of tokens without free text;
 * - the post-game `N`/`K` lines of a Constructed game (opponent cards the log revealed, which the player may never have
 *   seen) are dropped: a public page shows the game as the player saw it;
 * - the opponent's archetype is kept only when it is one the site knows.
 * No dependencies besides `node:zlib`, so the rules are testable on their own.
 */

export const REPLAY_MAX_COMPRESSED_BYTES = 512 * 1024;
export const REPLAY_MAX_TEXT_BYTES = 8 * 1024 * 1024;
export const REPLAY_MAX_LINES = 100_000;
export const REPLAY_MAX_LINE_LENGTH = 512;

export type ReplayKind = 'constructed' | 'battlegrounds';

export type SanitizedReplay = {
  kind: ReplayKind;
  /** The rebuilt header object (`kind`, `summary`, `truncated`, `events`). */
  header: Record<string, unknown>;
  /** The whole file as stored and served: `HPR4`, the header, the events (and a Battlegrounds `G` line). */
  text: string;
  events: number;
};

export type ReplayRejection = { code: 'TOO_LARGE' | 'NOT_A_REPLAY' | 'UNSUPPORTED_FORMAT' | 'INVALID_LINE' | 'INVALID_HEADER'; line?: number };

/** Token classes of the replay grammar (docs/match-replay.md, file formats 3 and 4). */
const NUM = /^(0|[1-9][0-9]{0,8})$/;
const REF = /^(-|[1-9][0-9]{0,6})$/;
const CARD = /^(-|[A-Za-z0-9_]{1,64})$/;
const WORD = /^[A-Z][A-Z0-9_]{0,40}$/;
const TYPE = /^(-|[A-Z][A-Z0-9_]{0,40})$/;
const SIDE = /^[LOB-]$/;
const TAG = /^[A-Z][A-Z0-9_]{0,40}=-?[A-Za-z0-9_]{1,40}$/;
const LIST = /^(-|[A-Za-z0-9_]{1,64}(,[A-Za-z0-9_]{1,64}){0,15})$/;
const ANY_REF = /^(L|O|-|[1-9][0-9]{0,6})$/;

/**
 * Each record: the token classes after its letter, and the class of any extra tokens (null: none allowed). `N`/`K`
 * (Constructed post-game) are dropped before this check. Card ids look like words, so the public page shows a card only
 * by its known name, never the raw id.
 */
type Grammar = Record<string, { fixed: RegExp[]; rest: RegExp | null }>;
const CONSTRUCTED: Grammar = {
  T: { fixed: [NUM, SIDE, NUM], rest: null },
  D: { fixed: [SIDE, NUM], rest: null },
  E: { fixed: [REF, SIDE, WORD, NUM, CARD, TYPE], rest: TAG },
  X: { fixed: [REF], rest: null },
  V: { fixed: [ANY_REF, WORD, /^-?[A-Za-z0-9_]{1,40}$/], rest: null },
  B: { fixed: [], rest: null },
  P: { fixed: [REF, REF], rest: null },
  U: { fixed: [REF, REF], rest: null },
  A: { fixed: [REF, REF], rest: null },
  C: { fixed: [WORD, CARD, LIST], rest: null },
  c: { fixed: [CARD], rest: null },
  Z: { fixed: [REF, NUM], rest: null },
  S: { fixed: [WORD], rest: null },
  R: { fixed: [WORD], rest: null },
};
const BATTLEGROUNDS: Grammar = {
  T: { fixed: [NUM, NUM], rest: null },
  F: { fixed: [NUM, NUM], rest: null },
  f: { fixed: [WORD, NUM, NUM], rest: null },
  M: { fixed: [WORD, REF], rest: REF },
  C: { fixed: [WORD, CARD, LIST], rest: null },
  c: { fixed: [CARD], rest: null },
  R: { fixed: [NUM], rest: null },
  E: { fixed: [REF, SIDE, WORD, NUM, CARD, TYPE], rest: TAG },
  X: { fixed: [REF], rest: null },
  Y: { fixed: [REF], rest: null },
  Z: { fixed: [REF, NUM], rest: null },
  V: { fixed: [ANY_REF, WORD, /^-?[0-9]{1,10}$/], rest: null },
  L: { fixed: [NUM, SIDE, CARD, NUM, NUM, NUM, NUM], rest: null },
};

function matches(grammar: Grammar, tokens: string[]): boolean {
  const rule = grammar[tokens[0]];
  if (!rule) return false;
  const args = tokens.slice(1);
  if (args.length < rule.fixed.length || (rule.rest === null && args.length > rule.fixed.length) || args.length > rule.fixed.length + 40) return false;
  return args.every((token, i) => (i < rule.fixed.length ? rule.fixed[i] : rule.rest!).test(token));
}
const POST_GAME = new Set(['N', 'K']);
/** Keys that would hold a person: dropped wherever they appear. */
const NAME_KEY = /name|battletag|account|nick|email/i;

/** A summary string: an id, a class, a mode, a date, a deck code - never free text. */
const SUMMARY_TEXT = /^[A-Za-z0-9_.:+/=\-]{0,120}$/;
const SUMMARY_FIELDS = new Set([
  'mode', 'gameType', 'format', 'startedAt', 'seconds', 'heroCardId', 'playerClass', 'opponentHeroCardId', 'opponentClass',
  'result', 'turns', 'wentFirst', 'deckCode', 'placement', 'tavernTier', 'anomalyCardId', 'tribes', 'heroPowers',
  'trinkets', 'finalBoard', 'finalHand',
]);

/** Gunzips with a ceiling (a gzip bomb stops at the limit), then checks the text. */
export function sanitizeReplayUpload(compressed: Buffer, knownArchetypes: ReadonlySet<string>): SanitizedReplay | ReplayRejection {
  if (compressed.length < 1 || compressed.length > REPLAY_MAX_COMPRESSED_BYTES) return { code: 'TOO_LARGE' };
  let text: string;
  try {
    text = gunzipSync(compressed, { maxOutputLength: REPLAY_MAX_TEXT_BYTES }).toString('utf8');
  } catch (error) {
    return { code: (error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE' ? 'TOO_LARGE' : 'NOT_A_REPLAY' };
  }

  return sanitizeReplayText(text, knownArchetypes);
}

export function sanitizeReplayText(text: string, knownArchetypes: ReadonlySet<string>): SanitizedReplay | ReplayRejection {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length < 2) return { code: 'NOT_A_REPLAY' };
  if (lines[0] !== 'HPR4') return { code: /^HPR\d+$/.test(lines[0]) ? 'UNSUPPORTED_FORMAT' : 'NOT_A_REPLAY' };
  if (lines.length > REPLAY_MAX_LINES + 3) return { code: 'TOO_LARGE' };

  let rawHeader: unknown;
  try {
    rawHeader = JSON.parse(lines[1]);
  } catch {
    return { code: 'INVALID_HEADER' };
  }
  const header = rebuildHeader(rawHeader, knownArchetypes);
  if (!header) return { code: 'INVALID_HEADER' };

  const grammar = header.kind === 'battlegrounds' ? BATTLEGROUNDS : CONSTRUCTED;
  const body: string[] = [];
  let game: string | null = null;
  for (let index = 2; index < lines.length; index++) {
    const line = lines[index];
    if (line.length > REPLAY_MAX_LINE_LENGTH && !(header.kind === 'battlegrounds' && line.startsWith('G '))) {
      return { code: 'INVALID_LINE', line: index + 1 };
    }
    const tokens = line.split(' ');
    const record = tokens[0];
    if (header.kind === 'constructed' && POST_GAME.has(record)) continue;
    if (header.kind === 'battlegrounds' && record === 'G') {
      if (game !== null || index !== lines.length - 1) return { code: 'INVALID_LINE', line: index + 1 };
      game = sanitizeGameLine(line.slice(2));
      if (game === null) return { code: 'INVALID_LINE', line: index + 1 };
      continue;
    }
    if (!matches(grammar, tokens)) {
      return { code: 'INVALID_LINE', line: index + 1 };
    }
    body.push(line);
  }

  const rebuilt = { ...header, events: body.length };
  const parts = ['HPR4', JSON.stringify(rebuilt), ...body];
  if (game !== null) parts.push(`G ${game}`);
  return { kind: header.kind, header: rebuilt, text: parts.join('\n') + '\n', events: body.length };
}

function rebuildHeader(raw: unknown, knownArchetypes: ReadonlySet<string>): ({ kind: ReplayKind } & Record<string, unknown>) | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const kind = input.kind;
  if (kind !== 'constructed' && kind !== 'battlegrounds') return null;
  const summaryInput = input.summary;
  if (!summaryInput || typeof summaryInput !== 'object' || Array.isArray(summaryInput)) return null;

  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(summaryInput as Record<string, unknown>)) {
    if (!SUMMARY_FIELDS.has(key)) continue;
    const clean = cleanValue(value, 0);
    if (clean !== undefined) summary[key] = clean;
  }
  const archetype = (summaryInput as Record<string, unknown>).opponentArchetype;
  if (typeof archetype === 'string' && knownArchetypes.has(archetype.trim().toLowerCase())) {
    summary.opponentArchetype = archetype.trim();
  }
  return { kind, summary, truncated: input.truncated === true };
}

/** Numbers, booleans, null and id-like strings, in arrays and objects up to a small depth; anything else is dropped. */
function cleanValue(value: unknown, depth: number): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return SUMMARY_TEXT.test(value) ? value : undefined;
  if (depth >= 4) return undefined;
  if (Array.isArray(value)) {
    return value.slice(0, 64).map(item => cleanValue(item, depth + 1)).filter(item => item !== undefined);
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 64)) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key) || NAME_KEY.test(key)) continue;
      const clean = cleanValue(item, depth + 1);
      if (clean !== undefined) result[key] = clean;
    }
    return result;
  }
  return undefined;
}

/** A Battlegrounds `G` line (rounds and lobby): only numbers, booleans and id-like strings survive; null when not JSON. */
function sanitizeGameLine(json: string): string | null {
  if (json.length > 2 * 1024 * 1024) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    return JSON.stringify(cleanGame(parsed, 0));
  } catch {
    return null;
  }
}

function cleanGame(value: unknown, depth: number): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return SUMMARY_TEXT.test(value) ? value : null;
  if (depth >= 8) return null;
  if (Array.isArray(value)) return value.slice(0, 1000).map(item => cleanGame(item, depth + 1));
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      // Names never: the app sends none, and a key like these would carry one.
      if (/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key) && !NAME_KEY.test(key)) result[key] = cleanGame(item, depth + 1);
    }
    return result;
  }
  return null;
}
