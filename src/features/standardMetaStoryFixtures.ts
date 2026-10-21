import type { StandardMetaItem } from '../../shared/standardMetaContract';
import type { StandardMetaTrends } from '../../shared/standardMetaTrendsContract';

const classes = ['priest', 'shaman', 'warrior', 'demonhunter', 'warlock', 'mage', 'rogue', 'deathknight'] as const;
const buckets = ['14–30 дн.', '7–14 дн.', '3–7 дн.', '1–3 дн.', '6–24 ч', '3–6 ч', '0–3 ч'];

/** Story rows from 60% down: every ninth one is a small sample, one has no translation. */
export function metaStoryItems(count: number): StandardMetaItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `a${index}`, slug: `archetype-${index}`, archetype: `Archetype ${index + 1}`,
    archetypeLabel: index === 5 ? `Archetype ${index + 1}` : `Архетип ${index + 1}${index === 7 ? ' (Harold)' : ''}`,
    translated: index !== 5, classKey: classes[index % classes.length], winrate: Math.round((60 - index * 0.45) * 10) / 10,
    popularity: Math.max(0.1, Math.round((14 - index * 0.6) * 10) / 10),
    games: index % 9 === 4 ? 180 + index * 7 : 24000 - index * 520, turns: 7 + (index % 4) * 0.4,
    durationMinutes: 6 + (index % 3) * 0.7, climbingSpeed: Math.round((1.8 - index * 0.08) * 100) / 100,
  }));
}

export function metaStoryTrends(items: readonly StandardMetaItem[]): StandardMetaTrends {
  return {
    period: 'past_day', minGames: 100, updatedAt: '2026-10-21T00:16:43Z', buckets,
    comparison: { label: 'к пред. 2 дням', description: 'окно 1–3 дня назад' },
    items: items.map((item, index) => ({
      id: item.id,
      winrates: buckets.map((_, bucket) => (index % 7 === 3 && bucket < 3 ? null : (item.winrate ?? 50) + (bucket - 3) * (index % 2 ? 0.6 : -0.4))),
      previous: index % 11 === 5 ? null : { winrate: (item.winrate ?? 50) - (index % 3) + 0.8, popularity: (item.popularity ?? 1) * 0.9, games: 5000 },
    })),
  };
}
