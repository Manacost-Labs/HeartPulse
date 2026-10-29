import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { useState } from 'react';
import {
  CardStatsRows, LockedStatsPanel, PendingStatsRows, STATISTICS_FORMATS, StatisticsControls, StatisticsHead,
} from './ConstructedCardStatistics';
import './StandardCards.css';

// The card statistics panel while access is checked or a subscriber's
// statistics are on their way: the same rows with loading values, no lock.
const meta = {
  title: 'Constructed cards/Statistics rows',
  component: CardStatsRows,
  // The block lays itself out by its own width, so a story picks one: 420px by default, a desktop column with `statsWidth`.
  decorators: [
    (Story, { parameters }) => (
      <div className="constructed-cards">
        <div className="constructed-card-detail__statistics" style={{ width: `min(${parameters.statsWidth ?? 420}px, calc(100vw - 32px))`, padding: 16 }}>
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    stats: {
      deckPopularity: 12.4, deckWinrate: 54.2, averageCopies: 1.9, timesPlayed: 48210, winrateWhenPlayed: 55.8,
      winrateWhenDrawn: 53.6, keepPercentage: 47.1, openingHandWinrate: 52.9, averageTurnsInHand: 2.1, averageTurnPlayed: 4.6,
    },
  },
} satisfies Meta<typeof CardStatsRows>;
export default meta;
type Story = StoryObj<typeof meta>;

// Narrow column: one metric per row, the value at the right.
export const Loaded: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).toContain('Винрейт колод с картой');
    await expect(canvasElement.textContent).toContain('Доля побед колод, в которых есть карта');
    await expect(canvasElement.textContent).toContain('48\u00a0210');
  },
};

// A wide column, as beside the card art on a desktop: three metrics per row, no metric cut off.
export const Wide: Story = {
  parameters: { statsWidth: 720 },
  play: async ({ canvasElement }) => {
    const block = canvasElement.querySelector('.constructed-card-detail__statistics');
    await expect(block && block.scrollWidth <= block.clientWidth).toBe(true);
  },
};

// The format switch lays out as many segments as formats it is given, level with both selects.
function ControlsDemo({ formatIds }: { formatIds: Array<keyof typeof STATISTICS_FORMATS | 'arena'> }) {
  const [format, setFormat] = useState('standard');
  const [rank, setRank] = useState('legend');
  const [period, setPeriod] = useState('1d');
  const formats = formatIds.map(id => (id === 'arena' ? { id, label: 'Арена', icon: '/assets/card-format-wild-128.webp' } : STATISTICS_FORMATS[id]));
  return <>
    <StatisticsHead rankLabel="Легенда" scope="Стандарт · Последний день" note="обновлено 29.10.2026, 05:03" />
    <StatisticsControls formats={formats} format={format} onFormatChange={setFormat}
      rank={rank} rankOptions={[{ value: 'legend', label: 'Легенда' }, { value: 'diamond', label: 'Алмаз' }]} onRankChange={setRank}
      period={period} periodOptions={[{ value: '1d', label: 'Последний день' }, { value: '7d', label: '7 дней' }]} onPeriodChange={setPeriod} />
  </>;
}

export const Controls: Story = {
  render: () => <ControlsDemo formatIds={['standard', 'wild']} />,
  parameters: { statsWidth: 720 },
  play: async ({ canvasElement }) => {
    const heights = [...canvasElement.querySelectorAll('.constructed-card-detail__statistics-format, .constructed-cards__filter-trigger')]
      .map(element => Math.round(element.getBoundingClientRect().height));
    await expect(heights).toEqual([46, 46, 46]);
  },
};

// A third format only adds an option: three equal segments on a wide column and on a phone.
export const ControlsThreeFormats: Story = {
  render: () => <ControlsDemo formatIds={['standard', 'wild', 'arena']} />,
  play: async ({ canvasElement }) => {
    const segments = [...canvasElement.querySelectorAll('.constructed-card-detail__statistics-format button')];
    await expect(segments).toHaveLength(3);
    const widths = segments.map(segment => Math.round(segment.getBoundingClientRect().width));
    await expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    await expect(segments.every(segment => segment.scrollWidth <= segment.clientWidth)).toBe(true);
  },
};

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
