import type { Meta, StoryObj } from '@storybook/react-vite';
import { AdminMoneyPage } from './AdminMoneyPage';
import type { MoneyPayload } from './moneyModel';

// Invented workshop data; not real revenue.
const NOW = new Date('2026-09-29T12:00:00.000Z');
const day = (offset: number, hour = 12) => new Date(Date.UTC(2026, 8, 29 - offset, hour)).toISOString();
const observations = Array.from({ length: 30 }, (_, index) => ({
  observedAt: day(index),
  type: index % 5 === 0 ? 'new_subscription' : 'observed_renewal',
  amountRub: [500, 250, 500, 1000, 250][index % 5] * (1 + (index % 3)),
  planName: index % 2 ? 'Мастер' : 'Легенда',
  source: (index % 7 === 0 ? 'tribute' : 'boosty') as 'boosty' | 'tribute',
}));

const payload: MoneyPayload = {
  from: new Date(NOW.getTime() - 30 * 86_400_000).toISOString(),
  to: NOW.toISOString(),
  summary: { newSubscriptions: 74, renewals: 312, revenueRub: 268_900, observedDecreaseRub: 3_750 },
  plans: [
    { planId: 'legend', planName: 'Легенда · 500 ₽', newSubscriptions: 41, renewals: 180, revenueRub: 201_000, source: 'boosty' },
    { planId: 'master', planName: 'Мастер · 250 ₽', newSubscriptions: 29, renewals: 118, revenueRub: 53_750, source: 'boosty' },
    { planId: 'vip', planName: 'Telegram VIP', newSubscriptions: 4, renewals: 14, revenueRub: 14_150, source: 'tribute' },
  ],
  observations,
  retention: [
    { days: 30, eligible: 120, evaluated: 110, retained: 78, unknown: 10, rate: 0.709 },
    { days: 60, eligible: 96, evaluated: 90, retained: 55, unknown: 6, rate: 0.611 },
    { days: 90, eligible: 70, evaluated: 70, retained: 38, unknown: 0, rate: 0.543 },
  ],
  coverage: { lastAcceptedPollAt: NOW.toISOString(), complete: true },
  limitations: [],
  sales: {
    summary: { donations: 41, postPurchases: 17, totalRevenueRub: 43_500, uniqueBuyers: 36 },
    buyers: [
      { userId: 'b1', name: 'arena_wizard', email: '', donations: 6, postPurchases: 2, totalRevenueRub: 12_400, lastPurchaseAt: day(2) },
      { userId: 'b2', name: 'igrok_7731', email: '', donations: 3, postPurchases: 1, totalRevenueRub: 6_000, lastPurchaseAt: day(5) },
      { userId: 'b3', name: 'hs_tavern', email: '', donations: 2, postPurchases: 3, totalRevenueRub: 4_750, lastPurchaseAt: day(9) },
    ],
    observations: Array.from({ length: 12 }, (_, index) => ({
      observedAt: day(index * 2, 18), type: (index % 3 ? 'donation' : 'post_purchase') as 'donation' | 'post_purchase', amountRub: 300 + index * 150, postTitle: 'Гайд по арене',
    })),
    transactions: [
      { eventKey: 't1', type: 'donation', createdAt: day(0, 10), amountRub: 1000, user: { id: 'b1', name: 'arena_wizard', email: '' }, post: null },
      { eventKey: 't2', type: 'post_purchase', createdAt: day(1, 15), amountRub: 199, user: { id: 'b4', name: 'deck_master', email: '' }, post: { id: 'p1', title: 'Тир-лист арены после патча' } },
    ],
    coverage: { latestImportAt: day(0, 11), complete: true },
  },
  generatedAt: NOW.toISOString(),
};

const meta = {
  title: 'Admin/CRM/Money',
  component: AdminMoneyPage,
  parameters: { layout: 'padded' },
  args: { client: { money: async () => payload }, now: () => NOW },
} satisfies Meta<typeof AdminMoneyPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LastThirtyDays: Story = {};
export const PartialData: Story = {
  args: {
    client: {
      money: async () => ({
        ...payload,
        coverage: { ...payload.coverage, complete: false },
        sales: null,
        limitations: ['Tribute временно недоступен: показаны только данные Boosty.'],
      }),
    },
  },
};
export const Empty: Story = {
  args: {
    client: {
      money: async () => ({ ...payload, summary: { newSubscriptions: 0, renewals: 0, revenueRub: 0, observedDecreaseRub: 0 }, plans: [], observations: [], retention: [], sales: null }),
    },
  },
};
export const LoadError: Story = {
  args: { client: { money: async () => { throw new Error('Не удалось загрузить аналитику подписок'); } } },
};
