import assert from 'node:assert/strict';
import {
  addBoundedAuthSession,
  authTokenCandidates,
  cookieValues,
  type AuthSessionRecord,
} from '../server/authSessions.js';

const now = Date.parse('2026-07-14T00:00:00.000Z');
const day = 24 * 60 * 60 * 1000;
const session = (
  tokenHash: string,
  userId: string,
  email: string,
  expiresInDays: number,
): AuthSessionRecord => ({
  tokenHash,
  userId,
  email,
  expiresAt: now + expiresInDays * day,
  createdAt: new Date(now).toISOString(),
});

const existing = [
  session('device-a', 'user-1', 'member@example.com', 20),
  session('other-user', 'user-2', 'other@example.com', 20),
  session('expired', 'user-3', 'expired@example.com', -1),
];

const withSecondDevice = addBoundedAuthSession({
  sessions: existing,
  session: session('device-b', 'user-1', 'member@example.com', 30),
  now,
  maxSessionsPerUser: 3,
});
assert.deepEqual(
  withSecondDevice.map(item => item.tokenHash).sort(),
  ['device-a', 'device-b', 'other-user'],
  'a login on a second device must preserve the first active session and remove expired sessions only',
);

const capped = addBoundedAuthSession({
  sessions: [
    session('oldest', 'user-1', 'member@example.com', 10),
    session('middle', 'user-1', 'member@example.com', 20),
    session('newest', 'user-1', 'member@example.com', 25),
  ],
  session: session('current', 'user-1', 'member@example.com', 30),
  now,
  maxSessionsPerUser: 3,
});
assert.deepEqual(
  capped.map(item => item.tokenHash),
  ['newest', 'middle', 'current'],
  'the per-user safety cap must evict only the oldest session',
);

const legacyEmailSession = addBoundedAuthSession({
  sessions: [{ ...session('legacy', '', 'member@example.com', 20), userId: undefined }],
  session: session('current', 'user-1', 'member@example.com', 30),
  now,
  maxSessionsPerUser: 3,
});
assert.equal(legacyEmailSession.length, 2, 'legacy sessions without a user id must remain associated by email');

assert.deepEqual(
  cookieValues('theme=dark; manacost_auth_token=stale; manacost_auth_token=current', 'manacost_auth_token'),
  ['stale', 'current'],
  'all same-name cookies must be preserved so a stale legacy cookie cannot hide a valid session',
);

assert.deepEqual(
  authTokenCandidates({
    authorization: 'Bearer api-token',
    cookieHeader: 'manacost_auth_token=stale; manacost_auth_token=current',
    cookieName: 'manacost_auth_token',
    bodyToken: 'body-token',
  }),
  ['api-token', 'stale', 'current', 'body-token'],
  'authentication must validate every available token in deterministic priority order',
);

console.log('auth session lifetime and multi-device contract tests passed');
