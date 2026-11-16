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
    await expect(canvas.getAllByTestId('partial-week-note')).toHaveLength(2);
    await expect(canvas.getByRole('heading', { name: 'Тарифы' })).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Переходы между тарифами' })).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Денежная оценка (не выручка)' })).toBeVisible();
    await expect(canvas.getByTestId('base-value-takeaway')).toHaveTextContent('Средний тариф снизился: 207 ₽ → 193 ₽');
    await expect(within(canvas.getByRole('region', { name: 'Таблица: Тарифы' })).getByRole('cell', { name: /^199\s₽\/мес$/ })).toBeVisible();
    await expect(canvas.getByTestId('retention-small')).toHaveTextContent('21 человек');
    await expect(canvas.getByTestId('retention-unknown')).toHaveTextContent('59,3 %');
    await expect(canvas.getByTestId('partial-months-note')).toHaveTextContent('август 2026 и ноябрь 2026');
    await expect(canvas.getByTestId('unavailable-list')).toHaveTextContent('Чистая выручка недоступна');
    await expect(within(canvas.getByRole('region', { name: 'Таблица: Перерывы в опросах' })).getByText('96,5 ч')).toBeVisible();
    await expect(within(canvas.getByRole('region', { name: 'Таблица: Перерывы в опросах' })).getByText('114 ч')).toBeVisible();
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
    await expect(await within(await canvas.findByTestId('live-status')).findByRole('status')).toHaveTextContent('Обновляем');
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

/** Худшие данные: нет долей и оттока, неизвестные цены, пустые таблицы, незнакомые коды и ни одного перерыва. */
export const EdgeData: Story = {
  args: {
    state: (() => {
      const metrics: SubscriptionMetrics = {
        ...metricsWithPoll(2),
        plans: [{ planName: 'Очень длинное название тарифа для проверки переноса строки', priceRub: null, start: 0, current: 3, starts: 3, ends: 0, switchIn: 0, switchOut: 0 }],
        planTransitions: [],
        retention: [
          { days: 30, eligible: 0, evaluated: 0, retained: 0, unknown: 0, rate: null, lowerBound: null, upperBound: null },
          { days: 60, eligible: 12, evaluated: 0, retained: 0, unknown: 12, rate: null, lowerBound: 0, upperBound: 100 },
          { days: 90, eligible: 8, evaluated: 8, retained: 3, unknown: 0, rate: 37.5, lowerBound: 37.5, upperBound: 37.5 },
        ],
        months: sample.months.map(month => ({ ...month, churnRate: null, estimatedArppuRub: null })),
        originalBaseRetention: { initial: 0, retained: 0, rate: null },
        freeConversion: { initialFree: 0, everConverted: 0, stillPaid: 0, rate: null },
        nominalTariffValue: {
          start: { subscribers: 0, tariffValueRub: 0, averageTariffRub: null, unknownPrices: 0 },
          end: { subscribers: 3, tariffValueRub: 0, averageTariffRub: null, unknownPrices: 3 },
        },
        coverage: { ...sample.coverage, gaps: [], maxPollGapSeconds: null },
        unavailable: ['something_new'],
        limitations: ['something_new'],
      };
      return live({ metrics, tiles: buildSubscriptionTiles(metrics) });
    })(),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText('пока рано считать').length).toBe(2);
    await expect(canvas.getByTestId('no-gaps')).toBeVisible();
    await expect(canvas.getByText('За период смен тарифа среди платных подписчиков не было.')).toBeVisible();
    await expect(canvas.queryByTestId('base-value-takeaway')).toBeNull();
    await expect(canvas.getAllByText('нет данных').length).toBeGreaterThanOrEqual(4);
  },
};

export const Phone: Story = {
  args: { state: live() },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
