import assert from 'node:assert/strict';
import {
  formatRub,
  moneyCaveats,
  moneyRange,
  moneySummary,
  planShare,
  revenueBuckets,
  type MoneyPayload,
} from '../src/modules/adminCrm/ui/moneyModel.js';

const payload: MoneyPayload = {
  from: '2026-09-01T00:00:00.000Z',
  to: '2026-09-08T00:00:00.000Z',
  summary: { newSubscriptions: 2, renewals: 3, revenueRub: 2500, observedDecreaseRub: 250 },
  plans: [
    { planId: 'm', planName: 'Мастер', newSubscriptions: 1, renewals: 1, revenueRub: 500, source: 'boosty' },
    { planId: 'l', planName: 'Легенда', newSubscriptions: 1, renewals: 2, revenueRub: 2000, source: 'boosty' },
  ],
  observations: [
    { observedAt: '2026-09-01T10:00:00.000Z', type: 'new_subscription', amountRub: 500, planName: 'Легенда', source: 'boosty' },
    { observedAt: '2026-09-01T12:00:00.000Z', type: 'observed_renewal', amountRub: 500, planName: 'Легенда', source: 'boosty' },
    { observedAt: '2026-09-03T12:00:00.000Z', type: 'observed_decrease', amountRub: 250, planName: 'Мастер', source: 'boosty' },
    { observedAt: '2026-09-07T23:59:00.000Z', type: 'observed_renewal', amountRub: 1500, planName: 'Легенда', source: 'tribute' },
    { observedAt: '2026-10-01T00:00:00.000Z', type: 'observed_renewal', amountRub: 999, planName: 'вне периода', source: 'boosty' },
  ],
  retention: [],
  coverage: { lastAcceptedPollAt: '2026-09-07T23:00:00.000Z', complete: true },
  limitations: [],
  sales: {
    summary: { donations: 1, postPurchases: 1, totalRevenueRub: 700, uniqueBuyers: 2 },
    buyers: [],
    observations: [
      { observedAt: '2026-09-02T09:00:00.000Z', type: 'donation', amountRub: 500, postTitle: '' },
      { observedAt: '2026-09-02T10:00:00.000Z', type: 'post_purchase', amountRub: 200, postTitle: 'Гайд' },
    ],
    coverage: { latestImportAt: '2026-09-07T00:00:00.000Z', complete: true },
  },
  generatedAt: '2026-09-08T00:00:00.000Z',
};

assert.equal(formatRub(1234.4), `${(1234).toLocaleString('ru-RU')} ₽`);
assert.deepEqual(moneyRange(30, new Date('2026-09-30T15:20:00.000Z')), { from: '2026-09-01T00:00:00.000Z', to: '2026-09-30T15:20:00.000Z' });
// A 30-day range starting on a day boundary yields exactly 30 daily buckets.
assert.equal(revenueBuckets({ ...payload, ...moneyRange(30, new Date('2026-09-30T15:20:00.000Z')) }).length, 30);

const summary = moneySummary(payload);
assert.equal(summary.totalRub, 3200);
assert.equal(summary.subscriptionRub, 2500);
assert.equal(summary.salesRub, 700);
assert.equal(summary.averagePaymentRub, 500);
assert.equal(summary.buyers, 2);
assert.equal(moneySummary({ ...payload, summary: { ...payload.summary, newSubscriptions: 0, renewals: 0 }, sales: null }).averagePaymentRub, null);

// A 7-day period is bucketed by day; every day exists even without payments, decreases are excluded.
const daily = revenueBuckets(payload);
assert.equal(daily.length, 7);
assert.deepEqual(daily.map(bucket => [bucket.start.slice(0, 10), bucket.subscriptionRub, bucket.salesRub]), [
  ['2026-09-01', 1000, 0], ['2026-09-02', 0, 700], ['2026-09-03', 0, 0], ['2026-09-04', 0, 0],
  ['2026-09-05', 0, 0], ['2026-09-06', 0, 0], ['2026-09-07', 1500, 0],
]);
// 90 days are bucketed by Monday-based weeks, a year by month.
const weekly = revenueBuckets({ ...payload, from: '2026-07-01T00:00:00.000Z', to: '2026-09-29T00:00:00.000Z' });
assert.equal(weekly[0].start, '2026-06-29T00:00:00.000Z');
assert.ok(weekly.every(bucket => new Date(bucket.start).getUTCDay() === 1));
const monthly = revenueBuckets({ ...payload, from: '2025-09-29T00:00:00.000Z', to: '2026-09-29T00:00:00.000Z' });
assert.equal(monthly.length, 13);
assert.equal(monthly.find(bucket => bucket.start.startsWith('2026-09'))?.subscriptionRub, 2500);
assert.deepEqual(revenueBuckets({ ...payload, from: 'bad' }), []);

assert.deepEqual(planShare(payload.plans).map(plan => [plan.planName, plan.share]), [['Легенда', 0.8], ['Мастер', 0.2]]);
assert.deepEqual(planShare([]), []);

assert.deepEqual(moneyCaveats(payload), []);
const caveats = moneyCaveats({ ...payload, coverage: { ...payload.coverage, complete: false }, sales: null, limitations: ['Tribute временно недоступен'] });
assert.equal(caveats.length, 3);
assert.match(caveats[0], /пропуски опроса Boosty/);
assert.match(caveats.join(' '), /донаты и платные посты/);

const manySales = Array.from({ length: 500 }, () => ({ observedAt: '2026-09-02T09:00:00.000Z', type: 'donation' as const, amountRub: 1, postTitle: '' }));
assert.match(moneyCaveats({ ...payload, sales: { ...payload.sales!, observations: manySales } }).join(' '), /первые 500 операций/);

console.log('admin money model: ok');
