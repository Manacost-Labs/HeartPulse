/**
 * The fixed lists and the header and `G` line rebuild of uploaded replays (see sanitize.ts): split out of
 * sanitize.ts by size only; the rules are the same.
 */

export type ReplayKind = 'constructed' | 'battlegrounds';

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

export function rebuildHeader(raw: unknown, knownArchetypes: ReadonlySet<string>): ({ kind: ReplayKind; summary: Record<string, unknown> } & Record<string, unknown>) | null {
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
export function sanitizeGameLine(json: string): string | null {
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
