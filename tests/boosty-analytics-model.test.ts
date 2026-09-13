import assert from 'node:assert/strict';
import {
  analyticsQueryRange,
  defaultAnalyticsDateRange,
  formatRub,
  isBoostyArticleAnalyticsPayload,
} from '../src/features/boostyAnalyticsModel.js';

assert.deepEqual(
  defaultAnalyticsDateRange(new Date('2026-07-28T16:30:00.000Z')),
  { from: '2026-04-30', to: '2026-07-28' },
);
assert.deepEqual(
  analyticsQueryRange({ from: '2026-07-01', to: '2026-07-28' }),
  {
    from: '2026-07-01T00:00:00.000Z',
    to: '2026-07-29T00:00:00.000Z',
  },
);
assert.equal(analyticsQueryRange({ from: '2026-07-29', to: '2026-07-28' }), null);
assert.match(formatRub(1234.5), /1.?234,50/);
assert.equal(isBoostyArticleAnalyticsPayload({}), false);

const validPayload = {
  semantics: 'combined_subscription_events',
  summary: {
    newSubscriptions: 0,
    renewals: 0,
    revenueRub: 0,
    observedDecreaseRub: 0,
  },
  plans: [],
  retention: [],
  coverage: {
    baselineAt: null,
    lastAcceptedPollAt: null,
    acceptedPolls: 0,
    maxPollGapSeconds: null,
    complete: false,
  },
  articleIntervals: [],
  limitations: [],
  sourceBreakdown: [],
  sales: null,
};

assert.equal(isBoostyArticleAnalyticsPayload(validPayload), true);
assert.equal(isBoostyArticleAnalyticsPayload({ ...validPayload, sales: {} }), false);
assert.equal(isBoostyArticleAnalyticsPayload({ ...validPayload, sourceBreakdown: [{}] }), false);
assert.equal(isBoostyArticleAnalyticsPayload({ ...validPayload, articleIntervals: [{}] }), false);
const validSales = {
  semantics: 'exact_boosty_sales_rows',
  summary: {
    donations: 0,
    postPurchases: 0,
    donationRevenueRub: 0,
    postRevenueRub: 0,
    totalRevenueRub: 0,
    uniqueBuyers: 0,
  },
  buyers: [],
  posts: [],
  transactions: [],
  coverage: {
    latestImportAt: null,
    imports: 0,
    donationRows: 0,
    postRows: 0,
    complete: false,
  },
  reconciliationMatches: null,
  limitations: [],
};
assert.equal(isBoostyArticleAnalyticsPayload({ ...validPayload, sales: validSales }), true);
assert.equal(isBoostyArticleAnalyticsPayload({
  ...validPayload,
  sales: {
    ...validSales,
    buyers: [{
      userId: '1',
      name: {},
      email: '',
      donations: 0,
      postPurchases: 0,
      totalRevenueRub: 0,
    }],
  },
}), false);

console.log('Boosty analytics model tests passed');
