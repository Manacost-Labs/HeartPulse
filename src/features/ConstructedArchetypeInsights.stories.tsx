import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { RankHeatmap } from './ConstructedArchetypeInsights';
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
