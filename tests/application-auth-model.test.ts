import assert from 'node:assert/strict';
import {
  createApplicationAuthManager,
  type ApplicationAuthRepository,
  type ApplicationDeviceAuthorization,
  type ApplicationToken,
} from '../server/modules/applicationAuth/public.js';

const devices = new Map<string, ApplicationDeviceAuthorization>();
const tokens = new Map<string, ApplicationToken>();

const repository: ApplicationAuthRepository = {
  insertDevice: record => {
    if (devices.has(record.deviceCodeHash)
      || [...devices.values()].some(device => device.userCodeHash === record.userCodeHash)) return false;
    devices.set(record.deviceCodeHash, { ...record, scopes: [...record.scopes] });
    return true;
  },
  findDeviceByHash: hash => devices.get(hash) ?? null,
  findDeviceByUserCodeHash: hash => (
    [...devices.values()].find(record => record.userCodeHash === hash) ?? null
  ),
  approveDevice: (hash, userId, approvedAt) => {
    const record = devices.get(hash);
    if (!record || record.status !== 'PENDING') return false;
    devices.set(hash, { ...record, status: 'APPROVED', userId, approvedAt });
    return true;
  },
  denyDevice: (hash, deniedAt) => {
    const record = devices.get(hash);
    if (!record || record.status !== 'PENDING') return false;
    devices.set(hash, { ...record, status: 'DENIED', deniedAt });
    return true;
  },
  recordDevicePoll: (hash, polledAt, intervalSeconds) => {
    const record = devices.get(hash);
    if (!record) return false;
    devices.set(hash, { ...record, lastPolledAt: polledAt, intervalSeconds });
    return true;
  },
  issueDeviceTokens: (hash, token, consumedAt) => {
    const record = devices.get(hash);
    if (!record || record.status !== 'APPROVED') return false;
    devices.set(hash, { ...record, status: 'CONSUMED', consumedAt });
    tokens.set(token.id, { ...token, scopes: [...token.scopes] });
    return true;
  },
  findTokenByAccessHash: hash => (
    [...tokens.values()].find(record => record.accessTokenHash === hash) ?? null
  ),
  findTokenByRefreshHash: hash => (
    [...tokens.values()].find(record => record.refreshTokenHash === hash) ?? null
  ),
  rotateRefreshToken: (oldRefreshHash, next, revokedAt) => {
    const previous = [...tokens.values()].find(record => (
      record.refreshTokenHash === oldRefreshHash && !record.revokedAt
    ));
    if (!previous) return false;
    tokens.set(previous.id, { ...previous, revokedAt, replacedById: next.id });
    tokens.set(next.id, { ...next, scopes: [...next.scopes] });
    return true;
  },
  revokeTokenFamily: (familyId, revokedAt) => {
    for (const [id, record] of tokens) {
      if (record.familyId === familyId && !record.revokedAt) {
        tokens.set(id, { ...record, revokedAt });
      }
    }
  },
  revokeByRefreshHash: (hash, revokedAt) => {
    const record = [...tokens.values()].find(item => item.refreshTokenHash === hash);
    if (!record) return false;
    repository.revokeTokenFamily(record.familyId, revokedAt);
    return true;
  },
};

let now = Date.UTC(2026, 6, 29, 14, 0, 0);
let randomCounter = 0;
const userCodes = ['ABCD-EFGH', 'WXYZ-2345', 'QRST-6789'];
const manager = createApplicationAuthManager({
  repository,
  clients: [{
    id: 'manacost-tracker',
    name: 'Manacost Tracker',
    scopes: [
      'profile.read',
      'subscription.read',
      'catalog.read',
      'images.read',
      'statistics.read',
    ],
  }],
  verificationUri: 'https://arena.hs-manacost.ru/connect',
  now: () => now,
  randomId: prefix => `${prefix}_${++randomCounter}`,
  randomSecret: prefix => `${prefix}_${String(++randomCounter).padEnd(48, 'x')}`,
  randomUserCode: () => userCodes.shift() ?? 'JKLM-3456',
});

assert.throws(
  () => manager.begin({ clientId: 'unknown', scope: 'profile.read' }),
  /Invalid application authorization request/,
);
assert.throws(
  () => manager.begin({ clientId: 'manacost-tracker', scope: 'admin.write' }),
  /Invalid application authorization request/,
);

const authorization = manager.begin({
  clientId: 'manacost-tracker',
  scope: 'profile.read subscription.read images.read statistics.read',
});
assert.equal(authorization.userCode, 'ABCD-EFGH');
assert.equal(
  authorization.verificationUriComplete,
  'https://arena.hs-manacost.ru/connect?user_code=ABCD-EFGH',
);
assert.equal(authorization.expiresIn, 600);
assert.equal(authorization.interval, 5);

const pending = manager.exchangeDevice({
  clientId: 'manacost-tracker',
  deviceCode: authorization.deviceCode,
});
assert.deepEqual(pending, { ok: false, error: 'authorization_pending' });

now += 1_000;
const tooFast = manager.exchangeDevice({
  clientId: 'manacost-tracker',
  deviceCode: authorization.deviceCode,
});
assert.deepEqual(tooFast, { ok: false, error: 'slow_down' });

assert.equal(manager.approve({ userCode: 'abcd efgh', userId: 'user-1' }), true);
now += 10_000;
const issued = manager.exchangeDevice({
  clientId: 'manacost-tracker',
  deviceCode: authorization.deviceCode,
});
assert.equal(issued.ok, true);
assert.ok(issued.ok && issued.accessToken.startsWith('mca_access_'));
assert.ok(issued.ok && issued.refreshToken.startsWith('mca_refresh_'));
assert.equal(issued.ok && issued.expiresIn, 900);

const replayedDevice = manager.exchangeDevice({
  clientId: 'manacost-tracker',
  deviceCode: authorization.deviceCode,
});
assert.deepEqual(replayedDevice, { ok: false, error: 'invalid_grant' });

assert.ok(issued.ok);
const authenticated = manager.authenticate(issued.accessToken, ['profile.read', 'subscription.read']);
assert.notEqual(authenticated, null);
assert.notEqual(authenticated, 'FORBIDDEN');
assert.equal(authenticated && authenticated !== 'FORBIDDEN' && authenticated.userId, 'user-1');
assert.equal(manager.authenticate(issued.accessToken, ['catalog.read']), 'FORBIDDEN');
assert.notEqual(manager.authenticate(issued.accessToken, ['statistics.read']), 'FORBIDDEN');

const rotated = manager.refresh({
  clientId: 'manacost-tracker',
  refreshToken: issued.refreshToken,
});
assert.equal(rotated.ok, true);
assert.ok(rotated.ok && rotated.refreshToken !== issued.refreshToken);

const replayedRefresh = manager.refresh({
  clientId: 'manacost-tracker',
  refreshToken: issued.refreshToken,
});
assert.deepEqual(replayedRefresh, { ok: false, error: 'invalid_grant' });
assert.equal(
  rotated.ok ? manager.authenticate(rotated.accessToken, ['profile.read']) : null,
  null,
  'refresh reuse revokes the full token family',
);

const deniedAuthorization = manager.begin({
  clientId: 'manacost-tracker',
  scope: 'profile.read subscription.read',
});
assert.equal(manager.deny({ userCode: deniedAuthorization.userCode }), true);
assert.deepEqual(
  manager.exchangeDevice({
    clientId: 'manacost-tracker',
    deviceCode: deniedAuthorization.deviceCode,
  }),
  { ok: false, error: 'access_denied' },
);

const expiredAuthorization = manager.begin({
  clientId: 'manacost-tracker',
  scope: 'profile.read subscription.read',
});
now += 10 * 60_000 + 1;
assert.deepEqual(
  manager.exchangeDevice({
    clientId: 'manacost-tracker',
    deviceCode: expiredAuthorization.deviceCode,
  }),
  { ok: false, error: 'expired_token' },
);

console.log('application auth model contract tests passed');
