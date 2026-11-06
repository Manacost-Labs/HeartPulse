import { gunzipSync } from 'node:zlib';

/**
 * Hearthpulse replay files (`.hpr`, format 4) as players upload them from the desktop app. The app already sends a
 * sanitized copy (its `ReplayImport.Sanitize`); the server does not trust that and applies the same rules again:
 * - every event line must match the app's grammar of its kind (records, zones, tags and card types from fixed lists);
 * - a Constructed opponent's hand and secrets are card backs (the card id is removed) and their tag changes (`V`) are
 *   dropped; the post-game `N`/`K` lines (cards the log revealed, which the player may never have seen) are dropped;
 * - in Battlegrounds, Bob's offer leaves view when the combat starts and the combat opponent by the next tavern, as
 *   on the player's screen; lines about cards out of view are dropped;
 * - the header is rebuilt field by field: modes, results, formats, game types and classes from fixed lists, card ids by
 *   their pattern, the date of play without the time, the deck code only when it decodes, the opponent's archetype
 *   only when it is one the site knows; no ranks, ratings or names;
 * - a Battlegrounds `G` line is rebuilt from the app's keys only (rounds and lobby heroes), so no name can ride along.
 * No dependencies besides `node:zlib`, so the rules are testable on their own.
 */

export const REPLAY_MAX_COMPRESSED_BYTES = 512 * 1024;
export const REPLAY_MAX_TEXT_BYTES = 8 * 1024 * 1024;
export const REPLAY_MAX_LINES = 100_000;
export const REPLAY_MAX_LINE_LENGTH = 512;

import { isCardId, rebuildHeader, sanitizeGameLine, type ReplayKind } from './replayHeader.js';

export { isCardId, REPLAY_MODES, REPLAY_RESULTS, type ReplayKind } from './replayHeader.js';

export type SanitizedReplay = {
  kind: ReplayKind;
  /** The rebuilt header object (`kind`, `summary`, `truncated`, `events`). */
  header: Record<string, unknown>;
  /** The whole file as stored and served: `HPR4`, the header, the events (and a Battlegrounds `G` line). */
  text: string;
  events: number;
};

export type ReplayRejection = { code: 'TOO_LARGE' | 'NOT_A_REPLAY' | 'UNSUPPORTED_FORMAT' | 'INVALID_LINE' | 'INVALID_HEADER'; line?: number };


// ---- Event grammar: the app's ReplayImport.ConstructedLine and BattlegroundsReplayGrammar, token for token ----------

const ID = '[1-9][0-9]{0,6}';
const ID_OR_NONE = '(?:[1-9][0-9]{0,6}|-)';
const NUMBER = '(?:0|[1-9][0-9]{0,8})';
const VALUE = `(?:-?${NUMBER}|-)`;
const SMALL = '(?:[0-9]|[1-9][0-9])';
const CARD = '[A-Za-z0-9_]{1,64}';
const TOKEN = '[A-Z][A-Z0-9_]{0,31}';
const CONSTRUCTED_TAG = '(?:ATK|HEALTH|DAMAGE|ARMOR|COST|DURABILITY|TAUNT|DIVINE_SHIELD|STEALTH|FROZEN|SILENCED|POISONOUS|WINDFURY|REBORN|LIFESTEAL|DORMANT|IMMUNE|PREMIUM|DEATHRATTLE)';
const CARD_TYPE = '(?:MINION|SPELL|WEAPON|HERO|HERO_POWER|LOCATION)';
const CONSTRUCTED_LINE = new RegExp('^(?:'
  + `T (?:0|[1-9][0-9]{0,2}) [LO-] ${NUMBER}`
  + `|D [LO] ${NUMBER}`
  + `|E ${ID} [LO] (?:PLAY|GRAVEYARD|HAND|SECRET) ${SMALL} (?:${CARD}|-) (?:${CARD_TYPE}(?: ${CONSTRUCTED_TAG}=${VALUE})*`
  + '|-(?: ORIGIN=(?:start|drawn|created|returned|stolen|coin|unknown))?)'
  + `|X ${ID}`
  + `|V ${ID} ${CONSTRUCTED_TAG} ${VALUE}`
  + `|V [LO] (?:RESOURCES|RESOURCES_USED|TEMP_RESOURCES|OVERLOAD_LOCKED|OVERLOAD_OWED) ${VALUE}`
  + `|V L (?:MULLIGAN_STATE|PLAYSTATE) ${TOKEN}`
  + '|B'
  + `|[PUA] ${ID} ${ID_OR_NONE}`
  + `|C ${TOKEN} (?:${CARD}|-) ${CARD}(?:,${CARD}){0,63}`
  + `|c ${CARD}`
  + `|Z ${ID} ${SMALL}`
  + '|S (?:BEGIN_MULLIGAN|MAIN_READY|FINAL_GAMEOVER)'
  + `|R ${TOKEN}`
  + ')$');
const POST_GAME_LINE = new RegExp(`^(?:N ${ID} ${ID}|K ${ID} ${CARD} (?:0|[1-9][0-9]{0,2}) (?:played|summoned|burned|shown) [01](?: [1-9][0-9]{0,8})?)$`);

const BG_TAG = '(?:ATK|HEALTH|DAMAGE|ARMOR|PREMIUM|TAUNT|DIVINE_SHIELD|REBORN|POISONOUS|VENOMOUS|WINDFURY|MEGA_WINDFURY|STEALTH|FROZEN|TECH_LEVEL)';
const BG_TABLE = '(?:HERO|HERO_POWER|MINION|BATTLEGROUND_TRINKET|BATTLEGROUND_QUEST_REWARD)';
const BG_OFFER = '(?:MINION|BATTLEGROUND_SPELL|SPELL)';
const BG_AT = ` ${SMALL} ${CARD} `;
const BATTLEGROUNDS_LINE = new RegExp('^(?:'
  + `[TF] [1-9][0-9]{0,2} ${NUMBER}`
  + `|f (?:WIN|LOSS|TIE) ${NUMBER} ${NUMBER}`
  + `|M (?:BUY|SELL|MOVE|TRIGGER) ${ID_OR_NONE}`
  + `|M (?:PLAY|POWER|USE|ATTACK) ${ID_OR_NONE} ${ID_OR_NONE}`
  + '|M (?:REFRESH|UPGRADE|FREEZE|DEATHS) -'
  + `|C (?:HERO|DISCOVER|TRINKET|QUEST) (?:${CARD}|-) ${CARD}(?:,${CARD}){0,15}`
  + `|c ${CARD}`
  + `|R ${SMALL}`
  + `|E ${ID} (?:L PLAY${BG_AT}${BG_TABLE}|L HAND${BG_AT}${BG_OFFER}|L SECRET${BG_AT}SPELL|B PLAY${BG_AT}${BG_OFFER}|O PLAY${BG_AT}${BG_TABLE})(?: ${BG_TAG}=${NUMBER})*`
  + `|[XY] ${ID}`
  + `|Z ${ID} ${SMALL}`
  + `|V ${ID} ${BG_TAG} ${NUMBER}`
  + `|V L (?:RESOURCES|RESOURCES_USED|TEMP_RESOURCES|PLAYER_TECH_LEVEL) ${NUMBER}`
  + `|L ${SMALL} [L-] ${CARD} ${SMALL} ${NUMBER} ${NUMBER} ${SMALL}`
  + ')$');

/** The card ids a line names (to check them against the card id pattern). */
function namedCards(tokens: string[]): string[] {
  switch (tokens[0]) {
    case 'E': return tokens[5] === '-' ? [] : [tokens[5]];
    case 'C': return [...(tokens[2] === '-' ? [] : [tokens[2]]), ...tokens[3].split(',')];
    case 'c': return [tokens[1]];
    case 'L': return [tokens[3]];
    default: return [];
  }
}

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

  const body = lines.slice(2);
  const result = header.kind === 'battlegrounds' ? cleanBattlegrounds(body) : cleanConstructed(body);
  if ('line' in result) return { code: 'INVALID_LINE', line: result.line + 3 };

  const rebuilt = { ...header, events: result.events.length };
  const parts = ['HPR4', JSON.stringify(rebuilt), ...result.events];
  if (result.game !== null) parts.push(`G ${result.game}`);
  return { kind: header.kind, header: rebuilt, text: parts.join('\n') + '\n', events: result.events.length };
}

type CleanBody = { events: string[]; game: string | null } | { line: number };

function checkLine(line: string, grammar: RegExp): string[] | null {
  if (line.length > REPLAY_MAX_LINE_LENGTH || !grammar.test(line)) return null;
  const tokens = line.split(' ');
  return namedCards(tokens).every(isCardId) ? tokens : null;
}

function cleanConstructed(body: string[]): CleanBody {
  const events: string[] = [];
  const hidden = new Set<string>();
  for (let index = 0; index < body.length; index++) {
    const line = body[index];
    if (POST_GAME_LINE.test(line)) continue;
    const t = checkLine(line, CONSTRUCTED_LINE);
    if (!t) return { line: index };
    if (t[0] === 'E') {
      // The opponent's hand and secrets are card backs: the id goes, and so do their tag changes.
      if (t[2] === 'O' && (t[3] === 'HAND' || t[3] === 'SECRET')) {
        hidden.add(t[1]);
        const origin = t.length > 7 && t[7].startsWith('ORIGIN=') ? ` ${t[7]}` : '';
        events.push(`E ${t[1]} O ${t[3]} ${t[4]} - -${origin}`);
        continue;
      }
      hidden.delete(t[1]);
    } else if (t[0] === 'V' && hidden.has(t[1])) {
      continue;
    } else if (t[0] === 'X') {
      hidden.delete(t[1]);
    }
    events.push(line);
  }
  return { events, game: null };
}

function cleanBattlegrounds(body: string[]): CleanBody {
  const last = body.length - 1;
  if (last < 0 || !body[last].startsWith('G ')) return { line: Math.max(last, 0) };
  const game = sanitizeGameLine(body[last].slice(2));
  if (game === null) return { line: last };

  const events: string[] = [];
  const shown = new Map<string, string>();
  let fight = false;
  let opponentInView = false;
  const leaveView = (side: string) => {
    for (const [id, owner] of [...shown]) {
      if (owner !== side) continue;
      shown.delete(id);
      events.push(`X ${id}`);
    }
  };
  for (let index = 0; index < last; index++) {
    const line = body[index];
    const t = checkLine(line, BATTLEGROUNDS_LINE);
    if (!t) return { line: index };
    switch (t[0]) {
      case 'F':
        // Bob's offer leaves view when the combat starts.
        events.push(line);
        leaveView('B');
        fight = opponentInView = true;
        continue;
      case 'f':
        fight = false;
        break;
      case 'T':
        // The combat opponent leaves view by the next tavern.
        leaveView('O');
        fight = opponentInView = false;
        break;
      case 'E':
        if ((t[2] === 'B' && fight) || (t[2] === 'O' && !opponentInView)) continue;
        shown.set(t[1], t[2]);
        break;
      case 'X':
      case 'Y':
        if (!shown.delete(t[1])) continue;
        break;
      case 'V':
      case 'Z':
        if (t[1] !== 'L' && !shown.has(t[1])) continue;
        break;
    }
    events.push(line);
  }
  return { events, game };
}

// ---- Header -------------------------------------------------------------------------------------------------------
