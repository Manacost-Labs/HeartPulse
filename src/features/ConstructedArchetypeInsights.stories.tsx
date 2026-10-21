import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { ArchetypeRadar, BuildComparison, RankHeatmap } from './ConstructedArchetypeInsights';
import real from '../../tests/fixtures/archetype-charts-real-20261021.json';
import './ConstructedArchetypes.css';

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

export const RanksHeatmap: Story = {
  render: () => <RankHeatmap matrix={matrix} />,
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText('Топ-1000').length).toBeGreaterThan(0);
  },
};

/** HSGuru slices of Quest Priest captured on 21 Oct 2026: large samples, strong colours. */
export const RanksQuestPriest: Story = {
  render: () => <section className="archetype-insight archetype-ranks"><RankHeatmap matrix={real.archetypes['Quest Priest'].ranks} /></section>,
  play: async ({ canvasElement, canvas }) => {
    const cell = canvasElement.querySelector<HTMLElement>('[data-cell="0-1"]');
    if (!cell) throw new Error('the heatmap has no cell 0-1');
    cell.focus();
    await waitFor(() => expect(canvasElement.querySelector('.archetype-rank-grid__card')).not.toBeNull());
    const card = canvasElement.querySelector('.archetype-rank-grid__card');
    if (!card) throw new Error('focus did not open the cell card');
    await expect(card).toHaveTextContent('Алмаз 1–4 · 3 дня');
    await expect(card).toHaveTextContent(/Игр: 24\s856/);
    await expect(card).toHaveTextContent('95% интервал');
    const box = cell.getBoundingClientRect();
    const tip = card.getBoundingClientRect();
    await expect(tip.bottom <= box.top || tip.top >= box.bottom).toBe(true);
    await expect(canvas.getAllByText('Топ-1000').length).toBeGreaterThan(0);
  },
};

/** Zee Shaman on the same day: thin samples in high ranks stay pale. */
export const RanksSmallSamples: Story = {
  render: () => <section className="archetype-insight archetype-ranks"><RankHeatmap matrix={real.archetypes['Zee Shaman'].ranks} /></section>,
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
