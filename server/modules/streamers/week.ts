import type { StreamerDeck, StreamerWeek, StreamerWeekArchetype } from './types.js';

const WEEK_ARCHETYPES = 4;

/**
 * «Чем играет за 7 дней»: колоды недели по архетипам, самые сыгранные
 * сверху. HSGuru хранит счёт колоды целиком, поэтому это игры колод,
 * сыгранных за неделю, а не только игры недели.
 */
export function streamerWeek(decks: StreamerDeck[]): StreamerWeek {
  const groups = new Map<string, StreamerWeekArchetype>();
  for (const deck of decks) {
    const key = `${deck.format}|${deck.archetype}`;
    const group = groups.get(key) ?? {
      archetype: deck.archetype, archetypeLabel: deck.archetypeLabel, classKey: deck.classKey, format: deck.format, decks: 0, wins: 0, losses: 0,
    };
    group.decks += 1;
    group.wins += deck.wins ?? 0;
    group.losses += deck.losses ?? 0;
    groups.set(key, group);
  }
  const all = [...groups.values()];
  return {
    decks: decks.length,
    wins: all.reduce((sum, group) => sum + group.wins, 0),
    losses: all.reduce((sum, group) => sum + group.losses, 0),
    archetypes: all
      .sort((left, right) => (right.wins + right.losses) - (left.wins + left.losses) || right.decks - left.decks)
      .slice(0, WEEK_ARCHETYPES),
  };
}
