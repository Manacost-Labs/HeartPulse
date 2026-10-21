import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { CardStatsPanel, type ConstructedCardStat } from './ConstructedArchetypeCardStats';
import './ConstructedArchetypes.css';
import './ConstructedArchetypeAnalysis.css';

const CARDS = [
  { id: 'END_025', name: 'Вечный огненный разряд', cost: 3, rarity: 'COMMON' },
  { id: 'JAIL_912', name: 'Гадалка', cost: 7, rarity: 'EPIC' },
  { id: 'CATA_308', name: 'Триумф Медива', cost: 5, rarity: 'RARE' },
  { id: 'TLC_817', name: 'Достичь равновесия', cost: 1, rarity: 'LEGENDARY' },
];

// Eighteen cards: a first page of fifteen, «show all», and a muted card whose
// mulligan sample is below a hundred games while its draw sample is not.
const cardStats: ConstructedCardStat[] = Array.from({ length: 18 }, (_, index) => {
  const card = CARDS[index % CARDS.length];
  return {
    cardId: card.id,
    dbfId: 100_000 + index,
    cardName: card.name,
    cost: card.cost,
    rarity: card.rarity,
    artwork: '/wallpaper/home-paladin-hero-720.avif',
    mulliganImpact: 6.6 - index * 0.8,
    mulliganCount: index === 0 ? 40 : 3_700 - index * 150,
    drawnImpact: 3.3 - index * 0.4,
    drawnCount: 17_000 - index * 600,
    keptImpact: index === 2 ? null : -0.4 + index * 0.3,
    keptCount: index === 2 ? null : 2_200 - index * 120,
  };
});

const meta = {
  title: 'Archetype detail/Mulligan table',
  component: CardStatsPanel,
  parameters: { layout: 'fullscreen' },
  args: {
    analysis: {
      state: 'ok',
      cardStatsUpdatedAt: '2026-10-21T01:56:00.000Z',
      sourceUrls: { cards: 'https://www.hsguru.com/card-stats?archetype=Quest+Priest' },
      cardStats,
    },
  },
  decorators: [Story => <div className="archetypes-page archetype-detail-page" style={{ maxWidth: 1440, marginInline: 'auto' }}><Story /></div>],
} satisfies Meta<typeof CardStatsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('columnheader', { name: 'Муллиган' })).toHaveAttribute('aria-sort', 'descending');
    await expect(canvasElement.querySelectorAll('.constructed-card-stats__table tbody tr')).toHaveLength(15);
    await expect(canvasElement.querySelector('.constructed-card-stats__table .card-stat-row[data-low-sample]')).not.toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Показать все 18 карт' }));
    await expect(canvasElement.querySelectorAll('.constructed-card-stats__table tbody tr')).toHaveLength(18);
  },
};

export const Phone: Story = {
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  parameters: { viewport: { defaultViewport: 'mobile2' } },
};

export const Empty: Story = {
  args: { analysis: { state: 'partial', cardStatsUpdatedAt: null, sourceUrls: { cards: '' }, cardStats: [] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/HSGuru не вернул статистику карт/)).toBeVisible();
  },
};
