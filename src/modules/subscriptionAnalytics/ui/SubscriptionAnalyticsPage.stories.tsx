import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import sampleFixture from './sampleMetrics.json';
import { SubscriptionMetricsError } from '../api/subscriptionMetricsClient';
import { buildSubscriptionTiles } from '../model/subscriptionTiles';
import type { SubscriptionMetrics } from '../model/types';
import { SubscriptionAnalyticsView } from './SubscriptionAnalyticsPage';
import type { LiveSubscriptionMetrics } from './useLiveSubscriptionMetrics';

const sample = sampleFixture as unknown as SubscriptionMetrics;
const minutesAgo = (minutes: number) => Date.now() - minutes * 60_000;

/** Образец с последним опросом `pollAgeMinutes` минут назад: «свежесть» считается от текущего времени. */
function metricsWithPoll(pollAgeMinutes: number): SubscriptionMetrics {
  return { ...sample, coverage: { ...sample.coverage, lastAcceptedPollAt: new Date(minutesAgo(pollAgeMinutes)).toISOString() } };
}

function live(overrides: Partial<LiveSubscriptionMetrics> = {}, pollAgeMinutes = 2): LiveSubscriptionMetrics {
  const metrics = metricsWithPoll(pollAgeMinutes);
  return {
    metrics,
    tiles: buildSubscriptionTiles(metrics),
    loading: false,
    refreshing: false,
    error: null,
    errorKind: null,
    updatedAt: Date.now() - 42_000,
    lastPollAt: minutesAgo(pollAgeMinutes),
    stale: false,
    reload: fn(async () => {}),
    ...overrides,
  };
}

const noData: Partial<LiveSubscriptionMetrics> = { metrics: undefined, tiles: [], updatedAt: null, lastPollAt: null };

function Example({ state, initialDays = 92 }: { state: LiveSubscriptionMetrics; initialDays?: number }) {
  const [days, setDays] = useState(initialDays);
  return <SubscriptionAnalyticsView live={state} days={days} onDaysChange={setDays} />;
}

const meta = {
  title: 'Admin/Subscription analytics',
  component: Example,
  parameters: { layout: 'padded' },
  decorators: [Story => <div style={{ maxWidth: 1180, margin: '0 auto' }}><Story /></div>],
} satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SampleData: Story = {
  args: { state: live() },
  play: async ({ canvas }) => {
    const tiles = within(await canvas.findByRole('list', { name: 'Сводка за период' }));
    await expect(tiles.getByText('Платных сейчас').closest('li')).toHaveTextContent('414');
    await expect(tiles.getByText('Изменение за период').closest('li')).toHaveTextContent('+123');
    await expect(tiles.getByText('Ушли совсем').closest('li')).toHaveTextContent('79');
    await expect(canvas.getByRole('img', { name: 'Активные платные подписчики по дням' })).toBeVisible();
    await expect(canvas.getByRole('img', { name: 'Начало и окончание доступа по неделям' })).toBeVisible();
    await expect(canvas.getByTestId('unobserved-note')).toHaveTextContent('сен');
    await expect(canvas.queryByTestId('stale-warning')).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: '30 дн.' }));
    await expect(canvas.getByRole('button', { name: '30 дн.' })).toHaveAttribute('aria-pressed', 'true');
  },
};

export const Loading: Story = {
  args: { state: live({ ...noData, loading: true }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('.sa-skeleton--tile')).toHaveLength(10);
  },
};

export const SourceUnavailable: Story = {
  args: { state: live({ ...noData, error: new SubscriptionMetricsError('unavailable', 'Источник недоступен'), errorKind: 'unavailable' }) },
  play: async ({ canvas, args }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Источник аналитики недоступен');
    await userEvent.click(canvas.getByRole('button', { name: /Повторить/ }));
    await expect(args.state.reload).toHaveBeenCalled();
  },
};

export const Forbidden: Story = {
  args: { state: live({ ...noData, error: new SubscriptionMetricsError('forbidden', 'Недостаточно прав'), errorKind: 'forbidden' }) },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Недостаточно прав');
    await expect(canvas.queryByRole('button', { name: /Повторить/ })).toBeNull();
  },
};

export const StalePoll: Story = {
  args: { state: live({ stale: true }, 47) },
  play: async ({ canvas }) => {
    await expect(await canvas.findByTestId('stale-warning')).toHaveTextContent('больше 15 минут');
    await expect(canvas.getByTestId('last-poll')).toHaveTextContent('47 минут назад');
  },
};

export const UpdateFailedWithData: Story = {
  args: { state: live({ error: new SubscriptionMetricsError('unavailable', 'Источник недоступен'), errorKind: 'unavailable' }) },
  play: async ({ canvas }) => {
    await expect(await canvas.findByTestId('update-failed')).toHaveTextContent('Не удалось обновить, показаны данные от');
    await expect(canvas.getByRole('list', { name: 'Сводка за период' })).toBeVisible();
  },
};

export const RefreshingPeriod: Story = {
  args: { state: live({ refreshing: true }), initialDays: 365 },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('status')).toHaveTextContent('Обновляем');
    await expect(canvas.getByRole('list', { name: 'Сводка за период' })).toBeVisible();
  },
};

export const MissingRates: Story = {
  args: {
    state: (() => {
      const metrics = { ...metricsWithPoll(2), retention: [], months: [] };
      return live({ metrics, tiles: buildSubscriptionTiles(metrics) });
    })(),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText('нет данных').length).toBeGreaterThanOrEqual(2);
  },
};

export const Phone: Story = {
  args: { state: live() },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
