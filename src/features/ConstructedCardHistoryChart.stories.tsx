import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import ConstructedCardHistoryChart from './ConstructedCardHistoryChart';
import type { ConstructedCardHistoryPoint } from './constructedCardHistoryModel';

const history = Array.from({ length: 14 }, (_, index): ConstructedCardHistoryPoint => ({
  recordedAt: new Date(Date.UTC(2026, 6, index + 1, 10)).toISOString(),
  deckPopularity: 8.2 + index * 0.21 + Math.sin(index) * 0.35,
  deckWinrate: 51.1 + index * 0.08 + Math.cos(index) * 0.3,
  averageCopies: 1.42,
  timesPlayed: 4200 + index * 360,
  winrateWhenPlayed: 53.4 + index * 0.12 + Math.sin(index / 2) * 0.4,
  winrateWhenDrawn: 52.8,
  keepPercentage: 41.2,
  openingHandWinrate: 51.9,
  averageTurnsInHand: 2.7,
  averageTurnPlayed: 4.8,
}));

const meta = {
  title: 'Cards/Statistics History',
  component: ConstructedCardHistoryChart,
  args: {
    points: history,
    periodLabel: 'Последние 7 дней',
    days: 90,
    onDaysChange: fn(),
    loading: false,
    error: '',
  },
  parameters: {
    docs: {
      description: {
        component:
          'Адаптивная история статистики карты: переключает показатель, диапазон и явно объясняет состояние накопления данных.',
      },
    },
  },
} satisfies Meta<typeof ConstructedCardHistoryChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Loading: Story = {
  args: { loading: true, points: [] },
};

export const Accumulating: Story = {
  args: { points: history.slice(0, 1) },
};

export const Unavailable: Story = {
  args: { points: [], error: 'Повторите попытку через минуту.' },
};

function ControlledHistory() {
  const [days, setDays] = useState(90);
  return (
    <ConstructedCardHistoryChart
      points={history}
      periodLabel="Последние 7 дней"
      days={days}
      onDaysChange={setDays}
    />
  );
}

export const Interaction: Story = {
  render: () => <ControlledHistory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const range = canvas.getByRole('button', { name: '30 дн.' });
    const metric = canvas.getByRole('button', { name: 'Винрейт колод' });
    await userEvent.click(range);
    await expect(range).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(metric);
    await expect(metric).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByText('Победы колод с картой. Обновляется вместе со статистикой выбранного периода.')).toBeVisible();
  },
};
