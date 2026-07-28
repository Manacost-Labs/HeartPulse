import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import {
  ContestAdminAnalyticsView,
  type BoostyArticleAnalyticsPayload,
} from './ContestAdminAnalytics';
import './contests.css';

const payload: BoostyArticleAnalyticsPayload = {
  semantics: 'combined_subscription_events',
  from: '2026-07-01T00:00:00.000Z',
  to: '2026-07-28T00:00:00.000Z',
  summary: {
    newSubscriptions: 12,
    renewals: 31,
    revenueRub: 8_743.4,
    observedDecreaseRub: -175.72,
  },
  plans: [
    { planId: '199', planName: 'Алмаз', newSubscriptions: 8, renewals: 24, revenueRub: 6_280.8, source: 'boosty' },
    { planId: 'tribute-199', planName: 'Алмаз', newSubscriptions: 4, renewals: 7, revenueRub: 2_462.6, source: 'tribute' },
  ],
  retention: [
    { days: 7, eligible: 12, evaluated: 12, retained: 10, unknown: 0, rate: 83.3 },
    { days: 30, eligible: 8, evaluated: 8, retained: 6, unknown: 0, rate: 75 },
    { days: 60, eligible: 4, evaluated: 3, retained: 2, unknown: 1, rate: 66.7 },
    { days: 90, eligible: 0, evaluated: 0, retained: 0, unknown: 0, rate: null },
  ],
  coverage: {
    baselineAt: '2026-07-01T00:00:00.000Z',
    lastAcceptedPollAt: '2026-07-27T23:58:00.000Z',
    acceptedPolls: 18_417,
    maxPollGapSeconds: 240,
    complete: true,
  },
  articleIntervals: [
    {
      article: {
        id: '6316',
        title: 'Ни одна живая душа не минует Бездну! Мета-отчёт Аметистовой крепости',
        url: 'https://kolodahearthstone.ru/example/',
        publishedAt: '2026-07-20T10:00:00.000Z',
      },
      from: '2026-07-20T10:00:00.000Z',
      to: '2026-07-27T17:06:51.000Z',
      metrics: {
        newSubscriptions: 7,
        renewals: 16,
        revenueRub: 4_576.2,
        observedDecreaseRub: 0,
      },
      plans: [
        { planId: '199', planName: 'Алмаз', newSubscriptions: 5, renewals: 12, revenueRub: 3_460.2, source: 'boosty' },
        { planId: 'tribute-199', planName: 'Алмаз', newSubscriptions: 2, renewals: 4, revenueRub: 1_116, source: 'tribute' },
      ],
    },
    {
      article: {
        id: '6261',
        title: 'Лучшие колоды после балансного патча',
        url: 'https://kolodahearthstone.ru/example-2/',
        publishedAt: '2026-07-27T17:06:51.000Z',
      },
      from: '2026-07-27T17:06:51.000Z',
      to: '2026-07-28T00:00:00.000Z',
      metrics: {
        newSubscriptions: 1,
        renewals: 2,
        revenueRub: 527.16,
        observedDecreaseRub: -175.72,
      },
      plans: [
        { planId: '199', planName: 'Алмаз', newSubscriptions: 1, renewals: 2, revenueRub: 527.16, source: 'boosty' },
      ],
    },
  ],
  generatedAt: '2026-07-28T00:00:00.000Z',
  limitations: [],
  sourceBreakdown: [
    {
      id: 'boosty',
      label: 'Boosty',
      semantics: 'observed_cumulative_delta',
      summary: {
        newSubscriptions: 8,
        renewals: 24,
        revenueRub: 6_280.8,
        observedDecreaseRub: -175.72,
      },
      retention: [
        { days: 30, eligible: 5, evaluated: 5, retained: 4, unknown: 0, rate: 80 },
      ],
      coverage: {
        baselineAt: '2026-07-01T00:00:00.000Z',
        lastAcceptedPollAt: '2026-07-27T23:58:00.000Z',
        acceptedPolls: 18_417,
        maxPollGapSeconds: 240,
        complete: true,
      },
    },
    {
      id: 'tribute',
      label: 'Tribute',
      semantics: 'exact_webhook_events',
      summary: {
        newSubscriptions: 4,
        renewals: 7,
        revenueRub: 2_462.6,
        observedDecreaseRub: 0,
      },
      retention: [
        { days: 30, eligible: 3, evaluated: 3, retained: 2, unknown: 0, rate: 66.7 },
      ],
      coverage: {
        baselineAt: '2026-07-10T00:00:00.000Z',
        lastAcceptedPollAt: '2026-07-27T22:00:00.000Z',
        acceptedPolls: 11,
        maxPollGapSeconds: null,
        complete: true,
      },
    },
  ],
};

const meta = {
  title: 'Admin/Boosty Article Analytics',
  component: ContestAdminAnalyticsView,
  args: {
    payload,
    loading: false,
    error: '',
    range: { from: '2026-07-01', to: '2026-07-27' },
    onRangeChange: fn(),
    onReload: fn(),
  },
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ContestAdminAnalyticsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Loading: Story = {
  args: { loading: true },
};

export const Empty: Story = {
  args: {
    payload: {
      ...payload,
      summary: { newSubscriptions: 0, renewals: 0, revenueRub: 0, observedDecreaseRub: 0 },
      plans: [],
      retention: [],
      articleIntervals: [],
    },
  },
};

export const Unavailable: Story = {
  args: {
    payload: null,
    error: 'Не удалось загрузить аналитику подписок',
  },
};
