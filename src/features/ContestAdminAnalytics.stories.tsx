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
      sales: {
        donations: 2,
        postPurchases: 6,
        donationRevenueRub: 700,
        postRevenueRub: 894,
        totalRevenueRub: 1_594,
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
      sales: {
        donations: 1,
        postPurchases: 2,
        donationRevenueRub: 300,
        postRevenueRub: 298,
        totalRevenueRub: 598,
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
  sales: {
    semantics: 'exact_boosty_sales_rows',
    summary: {
      donations: 3,
      postPurchases: 8,
      uniqueBuyers: 9,
      donationRevenueRub: 1_000,
      postRevenueRub: 1_192,
      totalRevenueRub: 2_192,
    },
    buyers: [
      {
        userId: '100',
        name: 'Алексей',
        email: 'alexey@example.com',
        donations: 1,
        postPurchases: 2,
        donationRevenueRub: 500,
        postRevenueRub: 398,
        totalRevenueRub: 898,
        lastPurchaseAt: '2026-07-27T20:00:00.000Z',
      },
      {
        userId: '101',
        name: 'Мария',
        email: 'maria@example.com',
        donations: 0,
        postPurchases: 3,
        donationRevenueRub: 0,
        postRevenueRub: 447,
        totalRevenueRub: 447,
        lastPurchaseAt: '2026-07-26T12:00:00.000Z',
      },
    ],
    posts: [
      {
        postId: 'paid-guide',
        title: 'Подробный гайд по актуальной мете Арены',
        purchases: 5,
        uniqueBuyers: 5,
        revenueRub: 995,
      },
      {
        postId: 'tier-list',
        title: 'Закрытый тир-лист',
        purchases: 3,
        uniqueBuyers: 3,
        revenueRub: 197,
      },
    ],
    transactions: [
      {
        eventKey: 'sale-1',
        type: 'post_purchase',
        createdAt: '2026-07-27T20:00:00.000Z',
        amountRub: 199,
        currency: 'RUB',
        feePaid: false,
        user: { id: '100', name: 'Алексей', email: 'alexey@example.com' },
        post: { id: 'paid-guide', title: 'Подробный гайд по актуальной мете Арены' },
        targetId: '',
      },
      {
        eventKey: 'sale-2',
        type: 'donation',
        createdAt: '2026-07-27T19:00:00.000Z',
        amountRub: 500,
        currency: 'RUB',
        feePaid: false,
        user: { id: '102', name: 'Игрок Арены', email: '' },
        post: null,
        targetId: '777',
      },
    ],
    coverage: {
      latestImportAt: '2026-07-27T23:58:00.000Z',
      imports: 120,
      donationRows: 3,
      postRows: 8,
      complete: true,
    },
    reconciliationMatches: false,
    limitations: [],
  },
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
      sales: {
        ...payload.sales!,
        summary: {
          donations: 0,
          postPurchases: 0,
          uniqueBuyers: 0,
          donationRevenueRub: 0,
          postRevenueRub: 0,
          totalRevenueRub: 0,
        },
        buyers: [],
        posts: [],
        transactions: [],
      },
    },
  },
};

export const Unavailable: Story = {
  args: {
    payload: null,
    error: 'Не удалось загрузить аналитику подписок',
  },
};
