import 'server-only';
import { cache } from 'react';
import { fetchPublicExpress } from './expressApi';

/** One line of the timeline: who did what, cards only by their known names. */
export type ReplayStep = { side: 'you' | 'opponent' | 'game'; text: string };
export type ReplayTurn = { turn: number; title: string; steps: ReplayStep[] };
export type PublicReplay = {
  id: string;
  kind: 'constructed' | 'battlegrounds';
  createdAt: string;
  summary: { mode: string; result: string; turns: number; placement: number; heroName: string; opponentHeroName: string;
    opponentArchetype: string; finalBoard: Array<{ name: string; attack: number; health: number; golden: boolean }> };
  turns: ReplayTurn[];
};

const REPLAY_ID = /^[0-9A-Za-z]{10}$/;
const UNKNOWN = 'неизвестная карта';

type Payload = { id: string; kind: string; createdAt: string; header: { summary?: Record<string, unknown> }; text: string; cardNames: Record<string, string> };

function isPayload(value: unknown): value is Payload {
  const fields = value as Partial<Payload> | null;
  return !!fields && typeof fields.id === 'string' && (fields.kind === 'constructed' || fields.kind === 'battlegrounds')
    && typeof fields.text === 'string' && typeof fields.createdAt === 'string' && !!fields.header && typeof fields.header === 'object'
    && !!fields.cardNames && typeof fields.cardNames === 'object';
}

/** The replay for `/replay/<id>`, or null (unknown id, deleted, or the API failed). */
export const loadPublicReplay = cache(async (id: string): Promise<PublicReplay | null> => {
  if (!REPLAY_ID.test(id)) return null;
  const response = await fetchPublicExpress(`/api/v1/replays/${encodeURIComponent(id)}`, undefined, { revalidate: 300 });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Replay temporarily unavailable');
  const payload: unknown = await response.json();
  return isPayload(payload) ? readReplay(payload) : null;
});

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** Turns the stored file into a timeline. Exported for tests. */
export function readReplay(payload: Payload): PublicReplay {
  const names = payload.cardNames;
  const name = (cardId: string | undefined) => (cardId && names[cardId]) || UNKNOWN;
  const summary = payload.header.summary ?? {};
  const board = Array.isArray(summary.finalBoard) ? summary.finalBoard as Array<Record<string, unknown>> : [];
  const lines = payload.text.split('\n').slice(2).filter(Boolean);
  const turns = payload.kind === 'battlegrounds' ? battlegroundsTurns(lines, name) : constructedTurns(lines, name);
  return {
    id: payload.id,
    kind: payload.kind as PublicReplay['kind'],
    createdAt: payload.createdAt,
    summary: {
      mode: text(summary.mode), result: text(summary.result), turns: count(summary.turns), placement: count(summary.placement),
      heroName: name(text(summary.heroCardId)), opponentHeroName: summary.opponentHeroCardId ? name(text(summary.opponentHeroCardId)) : '',
      opponentArchetype: text(summary.opponentArchetype),
      finalBoard: board.map(minion => ({ name: name(text(minion.cardId)), attack: count(minion.attack), health: count(minion.health),
        golden: minion.golden === true })),
    },
    turns,
  };
}

function constructedTurns(lines: string[], name: (id: string | undefined) => string): ReplayTurn[] {
  const cards = new Map<string, { card: string; side: string }>();
  const turns: ReplayTurn[] = [];
  let current: ReplayTurn = { turn: 0, title: 'Начало игры', steps: [] };
  const who = (side: string | undefined): ReplayStep['side'] => (side === 'L' ? 'you' : side === 'O' ? 'opponent' : 'game');
  const card = (n: string) => cards.get(n);
  for (const line of lines) {
    const [record, ...args] = line.split(' ');
    if (record === 'E' && args[4] !== '-') cards.set(args[0], { card: args[4], side: args[1] });
    else if (record === 'T') {
      if (current.steps.length) turns.push(current);
      current = { turn: Number(args[0]), title: `Ход ${Math.ceil(Number(args[0]) / 2)} · ${args[1] === 'L' ? 'вы' : 'соперник'}`, steps: [] };
    } else if (record === 'P') {
      const played = card(args[0]);
      const target = args[1] !== '-' ? card(args[1]) : undefined;
      if (played) current.steps.push({ side: who(played.side), text: `разыгрывает «${name(played.card)}»${target ? ` → «${name(target.card)}»` : ''}` });
    } else if (record === 'A') {
      const attacker = card(args[0]);
      const target = card(args[1]);
      if (attacker) current.steps.push({ side: who(attacker.side), text: `«${name(attacker.card)}» атакует${target ? ` «${name(target.card)}»` : ''}` });
    } else if (record === 'U') {
      const used = card(args[0]);
      if (used) current.steps.push({ side: who(used.side), text: `использует «${name(used.card)}»` });
    } else if (record === 'c') {
      current.steps.push({ side: 'you', text: `выбирает «${name(args[0])}»` });
    } else if (record === 'R') {
      current.steps.push({ side: 'game', text: args[0] === 'WON' ? 'Победа' : args[0] === 'LOST' ? 'Поражение' : 'Игра окончена' });
    }
  }
  if (current.steps.length) turns.push(current);
  return turns;
}

function battlegroundsTurns(lines: string[], name: (id: string | undefined) => string): ReplayTurn[] {
  const cards = new Map<string, string>();
  const turns: ReplayTurn[] = [];
  let current: ReplayTurn = { turn: 0, title: 'Выбор героя', steps: [] };
  const actions: Record<string, string> = { BUY: 'покупает', SELL: 'продаёт', PLAY: 'разыгрывает', POWER: 'сила героя:', USE: 'активирует' };
  for (const line of lines) {
    const [record, ...args] = line.split(' ');
    if (record === 'E' && args[4] !== '-') cards.set(args[0], args[4]);
    else if (record === 'T') {
      if (current.steps.length) turns.push(current);
      current = { turn: Number(args[0]), title: `Ход ${args[0]} · таверна`, steps: [] };
    } else if (record === 'M' && actions[args[0]]) {
      const card = cards.get(args[1]);
      if (card) current.steps.push({ side: 'you', text: `${actions[args[0]]} «${name(card)}»` });
    } else if (record === 'M' && (args[0] === 'REFRESH' || args[0] === 'UPGRADE')) {
      current.steps.push({ side: 'you', text: args[0] === 'REFRESH' ? 'обновляет таверну' : 'повышает уровень таверны' });
    } else if (record === 'c') {
      current.steps.push({ side: 'you', text: `выбирает «${name(args[0])}»` });
    } else if (record === 'f') {
      const result = args[0] === 'WIN' ? 'победа' : args[0] === 'LOSS' ? 'поражение' : 'ничья';
      current.steps.push({ side: 'game', text: `Бой: ${result}${args[1] !== '0' ? `, урон по вам ${args[1]}` : ''}${args[2] !== '0' ? `, урон по сопернику ${args[2]}` : ''}` });
    } else if (record === 'R') {
      current.steps.push({ side: 'game', text: `Игра окончена: ${args[0]}-е место` });
    }
  }
  if (current.steps.length) turns.push(current);
  return turns;
}
