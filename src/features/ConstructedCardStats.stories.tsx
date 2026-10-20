import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { LockedStatsPanel, PendingStatsRows, StatsRows } from './ConstructedCardStats';
import './StandardCards.css';

// The card statistics panel while access is checked or a subscriber's
// statistics are on their way: the same rows with loading values, no lock.
const meta = {
  title: 'Constructed cards/Statistics rows',
  component: StatsRows,
  decorators: [
    Story => (
      <div className="constructed-card-detail__statistics" style={{ width: 'min(420px, calc(100vw - 32px))', padding: 16 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    stats: {
      deckPopularity: 12.4, deckWinrate: 54.2, averageCopies: 1.9, timesPlayed: 48210, winrateWhenPlayed: 55.8,
      winrateWhenDrawn: 53.6, keepPercentage: 47.1, openingHandWinrate: 52.9, averageTurnsInHand: 2.1, averageTurnPlayed: 4.6,
    },
  },
} satisfies Meta<typeof StatsRows>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};

export const Pending: Story = {
  render: () => <PendingStatsRows />,
  play: async ({ canvasElement }) => {
    const rows = canvasElement.querySelector('dl');
    await expect(rows?.getAttribute('aria-busy')).toBe('true');
    await expect(canvasElement.textContent).not.toContain('Алмаз');
  },
};

// The access check failed: the rows wait for a retry, with no lock.
export const AccessUnavailable: Story = {
  render: () => <LockedStatsPanel statsAccessLoading={false} statsAccessUnavailable authUser={{}}
    onRefreshSubscription={async () => null} />,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).toContain('Повторить проверку');
    await expect(canvasElement.textContent).not.toContain('Алмаз');
  },
};
