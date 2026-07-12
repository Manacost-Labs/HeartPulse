import assert from 'node:assert/strict';
import { referralClickFromRow } from '../server/referrals.js';

const first = referralClickFromRow({
  id: 41,
  referral_id: 'referral-1',
  slug: 'summer',
  clicked_at: '2026-07-12T12:00:00.000Z',
  user_agent: 'Test browser',
  referrer: 'https://example.com',
  landing_path: '/contests',
});
const second = referralClickFromRow({
  id: 42,
  referral_id: 'referral-1',
  slug: 'summer',
  clicked_at: '2026-07-12T12:00:00.000Z',
});

assert.deepEqual(first, {
  id: '41',
  referralId: 'referral-1',
  slug: 'summer',
  clickedAt: '2026-07-12T12:00:00.000Z',
  userAgent: 'Test browser',
  referrer: 'https://example.com',
  landingPath: '/contests',
});
assert.equal(second.id, '42');
assert.notEqual(first.id, second.id, 'separate clicks need separate stable UI identities');
assert.deepEqual(referralClickFromRow({}), {
  id: '',
  referralId: '',
  slug: '',
  clickedAt: '',
  userAgent: '',
  referrer: '',
  landingPath: '',
});

console.log('referral click mapping tests passed');
