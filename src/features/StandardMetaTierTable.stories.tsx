import type { Meta, StoryObj } from '@storybook/react-vite';
import StandardMetaTierTable from './StandardMetaTierTable';
import type { StandardMetaItem } from '../../shared/standardMetaContract';
import type { StandardMetaTrends } from '../../shared/standardMetaTrendsContract';

const classes = ['priest', 'shaman', 'warrior', 'demonhunter', 'warlock', 'mage'] as const;
const items: StandardMetaItem[] = Array.from({ length: 81 }, (_, index) => ({
  id: `a${index}`, slug: `archetype-${index}`, archetype: `Archetype ${index + 1}`, archetypeLabel: `Архетип ${index + 1}`,
  translated: true, classKey: classes[index % classes.length], winrate: 58 - index * 0.17, popularity: Math.max(0.1, 14 - index * 0.4),
  games: index % 9 === 4 ? 180 + index : 9000 - index * 90, turns: 8, durationMinutes: 7, climbingSpeed: 0.4,
}));
const buckets = ['14–30 дн.', '7–14 дн.', '3–7 дн.', '1–3 дн.', '6–24 ч', '3–6 ч', '0–3 ч'];
const trends: StandardMetaTrends = {
  period: 'past_day', minGames: 100, updatedAt: '2026-10-21T00:16:43Z', buckets,
  comparison: { label: 'к пред. 2 дням', description: 'окно 1–3 дня назад' },
  items: items.map((item, index) => ({
    id: item.id,
    winrates: buckets.map((_, bucket) => (index % 7 === 3 && bucket < 3 ? null : (item.winrate ?? 50) + (bucket - 3) * (index % 2 ? 0.6 : -0.4))),
    previous: index % 11 === 5 ? null : { winrate: (item.winrate ?? 50) - (index % 3) + 0.8, popularity: (item.popularity ?? 1) * 0.9, games: 5000 },
  })),
};
const meta = {
  title: 'Meta/Tier table', component: StandardMetaTierTable,
  args: { items, format: 'standard', rank: 'diamond_legend', rankLabel: 'Алмаз — Легенда', formatLabel: 'Стандарт',
    period: 'past_day', periodLabel: 'Сутки', minGames: 100, loadTrends: true, initialTrends: trends },
  decorators: [Story => <div style={{ maxWidth: 1092, padding: 12, background: '#f3e2bd' }}><Story /></div>],
} satisfies Meta<typeof StandardMetaTierTable>;
export default meta;
type Story = StoryObj<typeof meta>;
export const WithTrends: Story = {};
export const NoPreviousWindow: Story = { args: { period: 'past_30_days', periodLabel: '30 дней', initialTrends: { ...trends, period: 'past_30_days', comparison: null, items: trends.items.map(item => ({ ...item, previous: null })) } } };
export const GuestTopThree: Story = { args: { items: items.slice(0, 3), loadTrends: false, initialTrends: null } };
