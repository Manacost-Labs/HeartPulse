import assert from 'node:assert/strict';
import express from 'express';
import {
  createApplicationAuthManager,
  createApplicationAuthRouter,
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
    devices.set(record.deviceCodeHash, record);
    return true;
  },
  findDeviceByHash: hash => devices.get(hash) ?? null,
  findDeviceByUserCodeHash: hash => [...devices.values()].find(row => row.userCodeHash === hash) ?? null,
  approveDevice: (hash, userId, approvedAt) => {
    const row = devices.get(hash);
    if (!row || row.status !== 'PENDING') return false;
    devices.set(hash, { ...row, status: 'APPROVED', userId, approvedAt });
    return true;
  },
  denyDevice: (hash, deniedAt) => {
    const row = devices.get(hash);
    if (!row || row.status !== 'PENDING') return false;
    devices.set(hash, { ...row, status: 'DENIED', deniedAt });
    return true;
  },
  recordDevicePoll: (hash, lastPolledAt, intervalSeconds) => {
    const row = devices.get(hash);
    if (!row) return false;
    devices.set(hash, { ...row, lastPolledAt, intervalSeconds });
    return true;
  },
  issueDeviceTokens: (hash, token, consumedAt) => {
    const row = devices.get(hash);
    if (!row || row.status !== 'APPROVED') return false;
    devices.set(hash, { ...row, status: 'CONSUMED', consumedAt });
    tokens.set(token.id, token);
    return true;
  },
  findTokenByAccessHash: hash => [...tokens.values()].find(row => row.accessTokenHash === hash) ?? null,
  findTokenByRefreshHash: hash => [...tokens.values()].find(row => row.refreshTokenHash === hash) ?? null,
  rotateRefreshToken: (hash, next, revokedAt) => {
    const previous = [...tokens.values()].find(row => row.refreshTokenHash === hash && !row.revokedAt);
    if (!previous) return false;
    tokens.set(previous.id, { ...previous, revokedAt, replacedById: next.id });
    tokens.set(next.id, next);
    return true;
  },
  revokeTokenFamily: (familyId, revokedAt) => {
    for (const [id, row] of tokens) {
      if (row.familyId === familyId && !row.revokedAt) tokens.set(id, { ...row, revokedAt });
    }
  },
  revokeByRefreshHash: (hash, revokedAt) => {
    const row = [...tokens.values()].find(token => token.refreshTokenHash === hash);
    if (!row) return false;
    repository.revokeTokenFamily(row.familyId, revokedAt);
    return true;
  },
};

let random = 0;
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
  randomId: prefix => `${prefix}_${++random}`,
  randomSecret: prefix => `${prefix}_${String(++random).padEnd(48, 'x')}`,
  randomUserCode: () => 'WXYZ-2345',
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/api/v1', createApplicationAuthRouter({
  manager,
  userAuth: request => request.headers['x-user'] === 'yes' ? { id: 'user-1', name: 'Игрок' } : null,
  userId: user => user.id,
  resolveUser: userId => userId === 'user-1' ? { id: userId, name: 'Игрок' } : null,
  serializeUser: user => ({ id: user.id, name: user.name }),
  readSubscription: () => ({
    hasAccess: true,
    source: 'boosty',
    entitlements: { standard: true },
  }),
  emptySubscription: () => ({ hasAccess: false, source: 'none', entitlements: {} }),
  setPrivateNoStore: response => {
    response.set('Cache-Control', 'private, no-store');
    response.set('Pragma', 'no-cache');
  },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}/api/v1`;

try {
  const startedResponse = await fetch(`${origin}/oauth/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: 'manacost-tracker',
      scope: 'profile.read subscription.read catalog.read images.read statistics.read',
    }),
  });
  assert.equal(startedResponse.status, 200);
  assert.equal(startedResponse.headers.get('cache-control'), 'private, no-store');
  const started = await startedResponse.json() as Record<string, any>;
  assert.equal(started.user_code, 'WXYZ-2345');
  assert.equal(started.verification_uri, 'https://arena.hs-manacost.ru/connect');
  assert.match(started.device_code, /^mca_device_/);

  const anonymousInspection = await fetch(
    `${origin}/oauth/device/authorization?user_code=WXYZ-2345`,
  );
  assert.equal(anonymousInspection.status, 401);

  const inspection = await fetch(
    `${origin}/oauth/device/authorization?user_code=WXYZ-2345`,
    { headers: { 'X-User': 'yes' } },
  );
  assert.equal(inspection.status, 200);
  const inspected = await inspection.json() as Record<string, any>;
  assert.equal(inspected.authorization.clientId, 'manacost-tracker');
  assert.equal(inspected.authorization.clientName, 'Manacost Tracker');
  assert.deepEqual(
    inspected.authorization.scopes,
    ['profile.read', 'subscription.read', 'catalog.read', 'images.read', 'statistics.read'],
  );
  assert.equal(typeof inspected.authorization.expiresAt, 'number');

  const approval = await fetch(`${origin}/oauth/device/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User': 'yes' },
    body: JSON.stringify({ user_code: 'WXYZ-2345', decision: 'approve' }),
  });
  assert.equal(approval.status, 200);
  assert.deepEqual(await approval.json(), { approved: true });

  const tokenResponse = await fetch(`${origin}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: 'manacost-tracker',
      device_code: started.device_code,
    }),
  });
  assert.equal(tokenResponse.status, 200);
  assert.equal(tokenResponse.headers.get('pragma'), 'no-cache');
  const token = await tokenResponse.json() as Record<string, any>;
  assert.equal(token.token_type, 'Bearer');
  assert.match(token.access_token, /^mca_access_/);
  assert.match(token.refresh_token, /^mca_refresh_/);
  assert.equal(token.expires_in, 900);

  const meResponse = await fetch(`${origin}/me`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  assert.equal(meResponse.status, 200);
  assert.deepEqual(await meResponse.json(), {
    user: { id: 'user-1', name: 'Игрок' },
    subscription: {
      hasAccess: true,
      source: 'boosty',
      entitlements: { standard: true },
    },
  });

  const refreshResponse = await fetch(`${origin}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: 'manacost-tracker',
      refresh_token: token.refresh_token,
    }),
  });
  assert.equal(refreshResponse.status, 200);
  const refreshed = await refreshResponse.json() as Record<string, any>;
  assert.notEqual(refreshed.refresh_token, token.refresh_token);

  const revoked = await fetch(`${origin}/oauth/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: refreshed.refresh_token }),
  });
  assert.equal(revoked.status, 200);

  const revokedMe = await fetch(`${origin}/me`, {
    headers: { Authorization: `Bearer ${refreshed.access_token}` },
  });
  assert.equal(revokedMe.status, 401);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('application auth route contract tests passed');
