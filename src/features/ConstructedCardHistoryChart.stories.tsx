import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import ConstructedCardHistoryChart from './ConstructedCardHistoryChart';
import type { ConstructedCardHistoryPoint, ConstructedCardHistoryReference } from './constructedCardHistoryModel';

const NOW = Date.UTC(2026, 9, 21, 13);
const DAY = 24 * 60 * 60_000;
const empty: ConstructedCardHistoryPoint = {
  recordedAt: '', deckPopularity: null, deckWinrate: null, averageCopies: null, timesPlayed: null, winrateWhenPlayed: null,
  winrateWhenDrawn: null, keepPercentage: null, openingHandWinrate: null, averageTurnsInHand: null, averageTurnPlayed: null,
};

// Eight refreshes a day for 35 days, with the two-day upstream outage of 18–19 October.
const history = Array.from({ length: 35 * 8 }, (_, index): ConstructedCardHistoryPoint => {
  const day = index / 8;
  return {
    ...empty,
    recordedAt: new Date(NOW - 35 * DAY + index * 3 * 60 * 60_000).toISOString(),
    deckPopularity: 11.5 + Math.sin(day / 4) * 2.4 - day * 0.05,
    deckWinrate: 51.2 + Math.cos(day / 3) * 1.1,
    timesPlayed: Math.round(2400 + Math.sin(day / 5) * 600),
    winrateWhenPlayed: 54.1 + Math.sin(day / 2.5) * 1.6,
  };
}).filter(point => !point.recordedAt.startsWith('2026-10-18') && !point.recordedAt.startsWith('2026-10-19'));

const references: ConstructedCardHistoryReference[] = [
  { scope: 'class', label: 'Среднее класса «Жрец»', points: history.map(point => ({ recordedAt: point.recordedAt, deckWinrate: 50.4 + Math.sin(Date.parse(point.recordedAt) / DAY / 6) * 0.8, winrateWhenPlayed: 52.6 })) },
  { scope: 'format', label: 'Среднее формата', points: history.map(point => ({ recordedAt: point.recordedAt, deckWinrate: 50.1, winrateWhenPlayed: 51.6 })) },
];

// A card of the mini-set before and after its release (production values of BE_228).
const preRelease = { deckPopularity: 0, timesPlayed: 1 };
const released = { deckPopularity: 7.68, deckWinrate: 59.25, timesPlayed: 2748, winrateWhenPlayed: 58.98 };
const newCard = ['2026-10-20T20:38:52Z', '2026-10-20T23:31:40Z', '2026-10-21T00:37:39Z', '2026-10-21T05:01:30Z', '2026-10-21T08:36:05Z', '2026-10-21T12:35:40Z']
  .map((recordedAt, index): ConstructedCardHistoryPoint => ({ ...empty, recordedAt, ...(index < 4 ? preRelease : released) }));

const meta = {
  title: 'Cards/Statistics History',
  component: ConstructedCardHistoryChart,
  args: {
    points: history,
    trackedSince: history[0].recordedAt,
    references,
    periodLabel: 'Последний день',
    formatLabel: 'Стандарт',
    rankLabel: 'Легенда',
    days: 90,
    onDaysChange: fn(),
    loading: false,
    error: '',
    onOpenChange: fn(),
    now: NOW,
  },
  parameters: {
    docs: {
      description: {
        component:
          'История статистики карты: компактные переключатели показателя и диапазона, KPI со спарклайном, сравнение со средним класса или формата. Снимки до первой реальной выборки (меньше 100 розыгрышей) не рисуются нулями; короткая история показывается заметкой, а не графиком.',
      },
    },
  },
} satisfies Meta<typeof ConstructedCardHistoryChart>;

export default meta;

type Story = StoryObj<typeof meta>;
const open = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByText('Динамика карты'));
  return canvas;
};

export const Collapsed: Story = {};

export const LongHistory: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await open(canvasElement);
    await expect(canvas.getByRole('slider', { name: /Выбрать точку/ })).toBeVisible();
    await expect(canvas.getByRole('radio', { name: '180 дн.' })).toBeDisabled();
    await expect(canvas.getByText('данные с 16 сент')).toBeVisible();
    await expect(canvas.getByText('История')).toBeVisible();
  },
};

export const WinrateWithComparison: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await open(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'При розыгрыше' }));
    await userEvent.click(canvas.getByRole('radio', { name: 'Класс' }));
    await expect(canvas.getByText('Среднее класса «Жрец»')).toBeVisible();
    await expect(canvasElement.querySelector('.analytics-chart__reference')).not.toBeNull();
    await expect(canvasElement.querySelector('.analytics-chart__band')).not.toBeNull();
  },
};

export const NewCard: Story = {
  args: { points: newCard, trackedSince: newCard[0].recordedAt, references: [] },
  play: async ({ canvasElement }) => {
    const canvas = await open(canvasElement);
    await expect(canvas.getByText('Мало данных: карта отслеживается с 20 окт')).toBeVisible();
    await expect(canvas.queryByRole('radio', { name: '90 дн.' })).toBeNull();
    await expect(canvas.queryByRole('slider')).toBeNull();
  },
};

export const BeforeRelease: Story = {
  args: { points: newCard.slice(0, 4), trackedSince: newCard[0].recordedAt, references: [] },
};

export const Loading: Story = {
  args: { loading: true, points: [] },
  play: async ({ canvas }) => { await userEvent.click(canvas.getByText('Динамика карты')); await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем историю'); },
};

export const Unavailable: Story = {
  args: { points: [], error: 'Повторите попытку через минуту.' },
};

function ControlledHistory() {
  const [days, setDays] = useState(90);
  return (
    <ConstructedCardHistoryChart
      points={history.filter(point => Date.parse(point.recordedAt) >= NOW - days * DAY)}
      trackedSince={history[0].recordedAt}
      periodLabel="Последний день"
      formatLabel="Стандарт"
      rankLabel="Легенда"
      days={days}
      onDaysChange={setDays}
      now={NOW}
    />
  );
}

export const Interaction: Story = {
  render: () => <ControlledHistory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const disclosure = canvas.getByText('Динамика карты').closest('summary');
    await expect(disclosure).not.toBeNull();
    await userEvent.click(disclosure!);
    await expect(disclosure!.closest('details')).toHaveAttribute('open');
    const range = canvas.getByRole('radio', { name: '30 дн.' });
    const metric = canvas.getByRole('radio', { name: 'Винрейт колод' });
    await userEvent.click(range);
    await expect(range).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(metric);
    await expect(metric).toHaveAttribute('aria-checked', 'true');
    await expect(canvas.getByRole('heading', { name: 'Победы колод с картой' })).toBeVisible();
  },
};
