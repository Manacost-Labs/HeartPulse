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

/** The modes, results, formats, game types and classes the app writes; anything else is not published. */
export const REPLAY_MODES = ['Ranked', 'Casual', 'Arena', 'Brawl', 'Practice', 'Friendly', 'Battlegrounds', 'Duos', 'Mercenaries', 'Other'] as const;
export const REPLAY_RESULTS = ['Win', 'Loss', 'Tie', 'Abandoned', 'Unknown'] as const;
const FORMATS = new Set(['FT_STANDARD', 'FT_WILD', 'FT_CLASSIC', 'FT_TWIST', 'FT_UNKNOWN']);
const GAME_TYPES = new Set([
  'GT_UNKNOWN', 'GT_VS_AI', 'GT_VS_FRIEND', 'GT_TUTORIAL', 'GT_ARENA', 'GT_UNDERGROUND_ARENA', 'GT_RANKED', 'GT_CASUAL',
  'GT_TAVERNBRAWL', 'GT_TB_1P_VS_AI', 'GT_TB_2P_COOP', 'GT_FSG_BRAWL', 'GT_FSG_BRAWL_VS_FRIEND', 'GT_FSG_BRAWL_1P_VS_AI',
  'GT_FSG_BRAWL_2P_COOP', 'GT_BATTLEGROUNDS', 'GT_BATTLEGROUNDS_FRIENDLY', 'GT_BATTLEGROUNDS_AI_VS_AI',
  'GT_BATTLEGROUNDS_PLAYER_VS_AI', 'GT_BATTLEGROUNDS_DUO', 'GT_BATTLEGROUNDS_DUO_VS_AI', 'GT_BATTLEGROUNDS_DUO_FRIENDLY',
  'GT_BATTLEGROUNDS_DUO_AI_VS_AI', 'GT_PVPDR', 'GT_PVPDR_PAID', 'GT_MERCENARIES_PVP', 'GT_MERCENARIES_PVE',
  'GT_MERCENARIES_PVE_COOP', 'GT_MERCENARIES_FRIENDLY',
]);
const CLASSES = new Set(['DEATHKNIGHT', 'DEMONHUNTER', 'DRUID', 'HUNTER', 'MAGE', 'PALADIN', 'PRIEST', 'ROGUE', 'SHAMAN', 'WARLOCK', 'WARRIOR', 'NEUTRAL']);
const TRIBES = new Set(['BEAST', 'DEMON', 'DRAGON', 'ELEMENTAL', 'MECHANICAL', 'MURLOC', 'NAGA', 'PIRATE', 'QUILBOAR', 'UNDEAD', 'TOTEM', 'ALL']);
const BG_KEYWORDS = new Set(['TAUNT', 'DIVINE_SHIELD', 'POISONOUS', 'VENOMOUS', 'REBORN', 'WINDFURY', 'MEGA_WINDFURY', 'STEALTH']);

/**
 * A card id: letters and digits with an underscore (`CS2_029`, `BG24_Reward_313`), or one of the few real ids without
 * one. A word like a name is not a card id, so it cannot ride in a card's place.
 */
const CARD_ID = /^[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]{1,60}$/;
const CARD_IDS_WITHOUT_UNDERSCORE = new Set(['Mekka1', 'Mekka2', 'Mekka3', 'Mekka3e', 'Mekka4', 'Mekka4e', 'Mekka4t', 'skele11', 'skele21', 'hexfrog', 'TagTeamIceBlock']);
export function isCardId(value: unknown): value is string {
  return typeof value === 'string' && (CARD_ID.test(value) || CARD_IDS_WITHOUT_UNDERSCORE.has(value));
}

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

const clamp = (value: unknown, max: number) => (typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 0), max) : 0);
const oneOf = <T extends string>(list: readonly T[] | ReadonlySet<string>, value: unknown): value is T =>
  typeof value === 'string' && (Array.isArray(list) ? (list as readonly string[]).includes(value) : (list as ReadonlySet<string>).has(value));
const cardList = (value: unknown, max: number) => (Array.isArray(value) ? value.filter(isCardId).slice(0, max) : []);

/** The date of play without the time of day (`2026-11-01T00:00:00Z`), or nothing. */
function dateOnly(value: unknown): string | undefined {
  const match = typeof value === 'string' ? /^(\d{4}-\d{2}-\d{2})T/.exec(value) : null;
  return match ? `${match[1]}T00:00:00Z` : undefined;
}

/** A deck code is kept only when it is a deckstring (base64 of a varint list starting 0, 1). */
function deckCode(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 400 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return undefined;
  const bytes = Buffer.from(value, 'base64');
  return bytes.length > 4 && bytes[0] === 0 && bytes[1] === 1 ? value : undefined;
}

function rebuildHeader(raw: unknown, knownArchetypes: ReadonlySet<string>): ({ kind: ReplayKind; summary: Record<string, unknown> } & Record<string, unknown>) | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const kind = input.kind;
  if (kind !== 'constructed' && kind !== 'battlegrounds') return null;
  const s = input.summary;
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const given = s as Record<string, unknown>;

  const summary: Record<string, unknown> = {
    mode: oneOf(REPLAY_MODES, given.mode) ? given.mode : 'Other',
    result: oneOf(REPLAY_RESULTS, given.result) ? given.result : 'Unknown',
    seconds: clamp(given.seconds, 24 * 3600),
    turns: clamp(given.turns, 999),
  };
  const set = (key: string, value: unknown) => {
    if (value !== undefined) summary[key] = value;
  };
  set('gameType', oneOf(GAME_TYPES, given.gameType) ? given.gameType : undefined);
  set('format', oneOf(FORMATS, given.format) ? given.format : undefined);
  set('startedAt', dateOnly(given.startedAt));
  set('heroCardId', isCardId(given.heroCardId) ? given.heroCardId : undefined);
  set('playerClass', oneOf(CLASSES, given.playerClass) ? given.playerClass : undefined);
  set('opponentHeroCardId', isCardId(given.opponentHeroCardId) ? given.opponentHeroCardId : undefined);
  set('opponentClass', oneOf(CLASSES, given.opponentClass) ? given.opponentClass : undefined);
  set('wentFirst', typeof given.wentFirst === 'boolean' ? given.wentFirst : undefined);
  set('deckCode', deckCode(given.deckCode));
  if (typeof given.opponentArchetype === 'string' && knownArchetypes.has(given.opponentArchetype.trim().toLowerCase())) {
    summary.opponentArchetype = given.opponentArchetype.trim();
  }
  if (kind === 'battlegrounds') {
    summary.placement = clamp(given.placement, 8);
    summary.tavernTier = clamp(given.tavernTier, 7);
    set('anomalyCardId', isCardId(given.anomalyCardId) ? given.anomalyCardId : undefined);
    summary.tribes = Array.isArray(given.tribes) ? given.tribes.filter(tribe => oneOf(TRIBES, tribe)).slice(0, 8) : [];
    summary.heroPowers = cardList(given.heroPowers, 16);
    summary.trinkets = cardList(given.trinkets, 16);
    summary.finalHand = cardList(given.finalHand, 16);
    summary.finalBoard = Array.isArray(given.finalBoard)
      ? given.finalBoard.flatMap(item => {
        const minion = item as Record<string, unknown> | null;
        if (!minion || typeof minion !== 'object' || !isCardId(minion.cardId)) return [];
        const keywords = Array.isArray(minion.keywords) ? minion.keywords.filter(keyword => oneOf(BG_KEYWORDS, keyword)) : [];
        return [{ cardId: minion.cardId, attack: clamp(minion.attack, 1_000_000), health: clamp(minion.health, 1_000_000), golden: minion.golden === true, keywords }];
      }).slice(0, 14)
      : [];
  }
  return { kind, summary, truncated: input.truncated === true };
}

// ---- Battlegrounds G line -----------------------------------------------------------------------------------------

type Minion = { cardId: string; attack: number; health: number; golden: boolean };

function minions(value: unknown): Minion[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 14) return null;
  const list: Minion[] = [];
  for (const item of value) {
    const minion = item as Record<string, unknown> | null;
    if (!minion || typeof minion !== 'object' || !isCardId(minion.cardId)) return null;
    list.push({ cardId: minion.cardId, attack: clamp(minion.attack, 1_000_000), health: clamp(minion.health, 1_000_000), golden: minion.golden === true });
  }
  return list;
}

/** A Battlegrounds `G` line rebuilt from the app's keys (rounds, lobby heroes); null when it is not one. */
function sanitizeGameLine(json: string): string | null {
  if (json.length > 2 * 1024 * 1024) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const data = parsed as Record<string, unknown>;
  const rawRounds = data.rounds ?? [];
  const rawLobby = data.lobby ?? [];
  if (!Array.isArray(rawRounds) || rawRounds.length > 200 || !Array.isArray(rawLobby) || rawLobby.length > 8) return null;

  const rounds = [];
  for (const item of rawRounds) {
    const round = item as Record<string, unknown> | null;
    if (!round || typeof round !== 'object') return null;
    const board = minions(round.board);
    const opponentBoard = minions(round.opponentBoard);
    const shop = round.shop ?? [];
    const result = round.result ?? null;
    if (!board || !opponentBoard || !Array.isArray(shop) || shop.length > 1000 || !shop.every(isCardId)
      || (round.opponentHero != null && !isCardId(round.opponentHero)) || !(result === null || oneOf(['Win', 'Loss', 'Tie'], result))) {
      return null;
    }
    rounds.push({
      turn: clamp(round.turn, 999), tier: clamp(round.tier, 7), health: clamp(round.health, 9999), board,
      ...(round.opponentHero != null ? { opponentHero: round.opponentHero } : {}), opponentBoard, shop,
      ...(result !== null ? { result } : {}), damageTaken: clamp(round.damageTaken, 9999), damageDealt: clamp(round.damageDealt, 9999),
    });
  }
  const lobby = [];
  for (const item of rawLobby) {
    const hero = item as Record<string, unknown> | null;
    if (!hero || typeof hero !== 'object' || !isCardId(hero.heroCardId)) return null;
    lobby.push({ heroCardId: hero.heroCardId, place: clamp(hero.place, 8), local: hero.local === true });
  }
  return JSON.stringify({ rounds, lobby });
}
