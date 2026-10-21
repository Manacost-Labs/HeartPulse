import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { ArchetypeRadar, BuildComparison, RankHeatmap, WinrateBandChart } from './ConstructedArchetypeInsights';
import './ConstructedArchetypes.css';

const history = Array.from({ length: 12 }, (_, index) => ({
  recordedAt: new Date(Date.UTC(2026, 9, 10 + index)).toISOString(),
  winrate: 52 + Math.sin(index / 2) * 2 + index * 0.2,
  popularity: 8 + index * 0.1,
  // Games accumulate through a period: the first slices are small, so their band is wide.
  games: 120 * (index + 1) ** 2,
}));

const periods = [['past_day', 'Сутки'], ['past_3_days', '3 дня'], ['past_week', 'Неделя'], ['past_2_weeks', '2 недели'], ['past_30_days', '30 дней'], ['black_empire', 'Тёмная империя']];
const ranks = [['diamond', 'Алмаз 1–4'], ['diamond_legend', 'Алмаз — Легенда'], ['legend', 'Легенда'], ['top_5k', 'Топ-5000'], ['top_legend', 'Топ-1000']];
const matrix = {
  ranks: ranks.map(([id, label]) => ({ id, label })),
  periods: periods.map(([id, label]) => ({ id, label })),
  cells: ranks.flatMap(([rank], row) => periods.map(([period], column) => ({
    rank,
    period,
    winrate: rank === 'top_legend' && period === 'past_day' ? null : 51 + row * 0.9 + column * 0.7,
    games: rank === 'top_legend' && period === 'past_day' ? null : 3_000 - row * 400,
  }))),
  updatedAt: '2026-10-21T08:00:00.000Z',
};

const catalogItems = [
  { slug: 'quest-priest', archetypeLabel: 'Квест Жрец', winrate: 64.5, popularity: 19.8, durationMinutes: 7.7, turns: 8.7, climbingSpeed: 2.26 },
  { slug: 'c-thun-warlock', archetypeLabel: "К'тун Чернокнижник", winrate: 60, popularity: 10.2, durationMinutes: 8, turns: 8.9, climbingSpeed: 1.4 },
  { slug: 'pure-paladin', archetypeLabel: 'Чистый Паладин', winrate: 52.4, popularity: 2.9, durationMinutes: 7.9, turns: 8.9, climbingSpeed: 0.4 },
  { slug: 'summoner-mage', archetypeLabel: 'Манашторм Маг', winrate: 48.8, popularity: 1.9, durationMinutes: 8.9, turns: 9.2, climbingSpeed: 0.1 },
];

const builds = [
  { deckCode: 'AAECAStoryBuildOne', games: 8_578, winrate: 64.2 },
  { deckCode: 'AAECAStoryBuildTwo', games: 8_465, winrate: 65.1 },
];

const resolved: Record<string, { cost: number; count: number }[]> = {
  AAECAStoryBuildOne: [{ cost: 1, count: 11 }, { cost: 2, count: 4 }, { cost: 3, count: 6 }, { cost: 4, count: 4 }, { cost: 5, count: 2 }, { cost: 7, count: 3 }],
  AAECAStoryBuildTwo: [{ cost: 1, count: 11 }, { cost: 2, count: 6 }, { cost: 3, count: 3 }, { cost: 4, count: 6 }, { cost: 5, count: 2 }, { cost: 8, count: 2 }],
};

const meta = {
  title: 'Archetype detail/VaryloUI insights',
  parameters: { layout: 'padded' },
  decorators: [Story => <div className="archetypes-page archetype-detail-page" style={{ maxWidth: 1092 }}><Story /></div>],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const WinrateBand: Story = {
  render: () => <WinrateBandChart history={history} />,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.archetype-band-chart svg')).not.toBeNull();
  },
};

export const RanksHeatmap: Story = {
  render: () => <RankHeatmap matrix={matrix} />,
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText('Топ-1000').length).toBeGreaterThan(0);
  },
};

export const EmptyRanks: Story = {
  render: () => <RankHeatmap matrix={{ ...matrix, cells: matrix.cells.map(cell => ({ ...cell, winrate: null, games: null })) }} />,
};

export const Radar: Story = {
  render: () => <ArchetypeRadar item={catalogItems[0]} items={catalogItems} />,
};

export const BuildsSideBySide: Story = {
  render: () => <BuildComparison builds={builds} format="standard" archetype="Quest Priest" />,
  beforeEach: () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname !== '/api/deck/resolve') return original(input, init);
      return new Response(JSON.stringify({ ok: true, cards: resolved[url.searchParams.get('code') ?? ''] ?? [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    return () => { globalThis.fetch = original; };
  },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText('Карт за 7+ маны')).toBeVisible());
  },
};
