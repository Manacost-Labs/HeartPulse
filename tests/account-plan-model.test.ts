import assert from 'node:assert/strict';
import test from 'node:test';
import { accountPlanSummary, formatPlanDate } from '../src/modules/identity/model/accountPlan';
import type { SubscriptionStatus } from '../src/modules/subscriptions/public';

const NOW = Date.parse('2026-10-21T12:00:00.000Z');

function subscription(patch: Partial<SubscriptionStatus> = {}): SubscriptionStatus {
  return { hasAccess: false, source: 'none', checkedAt: null, stale: false, message: '', boosty: {}, patreon: {}, telegram: {}, ...patch };
}

test('before the first answer the plan is pending, after a failed one it is unknown', () => {
  assert.equal(accountPlanSummary(null, false, NOW).state, 'pending');
  assert.equal(accountPlanSummary(null, true, NOW).state, 'unknown');
});

test('an active Boosty plan carries its level, monthly price and the paid-until date', () => {
  const plan = accountPlanSummary(subscription({
    hasAccess: true,
    source: 'boosty',
    boosty: { hasAccess: true, levelName: 'Мастер арены', price: 300, dates: { nextPaymentAt: '2026-11-12T09:00:00.000Z' } },
  }), true, NOW);
  assert.equal(plan.state, 'active');
  assert.equal(plan.provider, 'boosty');
  assert.equal(plan.title, 'Мастер арены');
  assert.equal(plan.price, 300);
  assert.equal(plan.renewsAt, '2026-11-12T09:00:00.000Z');
  assert.equal(plan.renewal, 'unknown');
  assert.equal(plan.statusLine, 'Boosty · оплачено до 12 нояб.');
});

test('the renewal flag decides between automatic renewal and the end of access', () => {
  const base = { hasAccess: true, levelName: 'Мастер арены', price: 300, dates: { nextPaymentAt: '2026-11-12T09:00:00.000Z' } };
  const renews = accountPlanSummary(subscription({ hasAccess: true, boosty: { ...base, willRenew: true } }), true, NOW);
  assert.equal(renews.renewal, 'auto');
  assert.equal(renews.statusLine, 'Boosty · до 12 нояб., продлится автоматически');
  const ends = accountPlanSummary(subscription({ hasAccess: true, boosty: { ...base, willRenew: false } }), true, NOW);
  assert.equal(ends.renewal, 'ends');
  assert.equal(ends.statusLine, 'Boosty · до 12 нояб., не продлится');
});

test('a past or malformed payment date is not shown as the end of access', () => {
  for (const nextPaymentAt of ['2026-10-01T00:00:00.000Z', 'soon', null]) {
    const plan = accountPlanSummary(subscription({ hasAccess: true, boosty: { hasAccess: true, dates: { nextPaymentAt } } }), true, NOW);
    assert.equal(plan.renewsAt, null);
    assert.equal(plan.statusLine, 'Boosty · подписка активна');
  }
});

test('the Boosty grace period names the time access is kept until', () => {
  const plan = accountPlanSummary(subscription({
    hasAccess: true,
    boosty: { hasAccess: true, grace: true, graceUntil: '2026-10-22T12:00:00.000Z', dates: { nextPaymentAt: '2026-11-12T09:00:00.000Z' } },
  }), true, NOW);
  assert.equal(plan.graceUntil, '2026-10-22T12:00:00.000Z');
  assert.equal(plan.statusLine, 'Boosty не отвечает · доступ сохранён до 22 окт.');
});

test('Patreon, the Telegram VIP channel and a manual grant are named without invented dates', () => {
  const patreon = accountPlanSummary(subscription({ hasAccess: true, patreon: { hasAccess: true, tierTitles: ['Gold'], highestTierAmountCents: 500 } }), true, NOW);
  assert.deepEqual([patreon.provider, patreon.title, patreon.renewsAt, patreon.statusLine], ['patreon', 'Gold', null, 'Patreon · подписка активна']);
  const telegram = accountPlanSummary(subscription({ hasAccess: true, telegram: { hasAccess: true } }), true, NOW);
  assert.deepEqual([telegram.provider, telegram.title], ['telegram', 'VIP-канал в Telegram']);
  const manual = accountPlanSummary(subscription({ hasAccess: true, source: 'manual-access', message: 'Доступ выдан администратором до 01.12.2026.' }), true, NOW);
  assert.deepEqual([manual.provider, manual.title, manual.statusLine], ['manual', 'Доступ от администрации', 'Доступ выдан администратором до 01.12.2026.']);
});

test('without access the plan says so in one line', () => {
  const plan = accountPlanSummary(subscription({ hasAccess: false }), true, NOW);
  assert.equal(plan.state, 'none');
  assert.equal(plan.provider, null);
  assert.equal(plan.statusLine, 'Без подписки');
});

test('plan dates are short, and carry the year only outside the current one', () => {
  assert.equal(formatPlanDate('2026-11-12T09:00:00.000Z', NOW), '12 нояб.');
  assert.equal(formatPlanDate('2027-01-05T09:00:00.000Z', NOW), '5 янв. 2027 г.');
});
