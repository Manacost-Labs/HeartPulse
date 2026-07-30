import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  APPLICATION_AUTH_TABLES_SQL,
  createSqliteApplicationAuthRepository,
  type ApplicationDeviceAuthorization,
  type ApplicationToken,
} from '../server/modules/applicationAuth/public.js';

const database = new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys = ON; CREATE TABLE users (id TEXT PRIMARY KEY);');
database.exec(APPLICATION_AUTH_TABLES_SQL);
database.prepare('INSERT INTO users (id) VALUES (?)').run('user-1');

const repository = createSqliteApplicationAuthRepository(() => database);
const device: ApplicationDeviceAuthorization = {
  deviceCodeHash: 'device-hash',
  userCodeHash: 'user-code-hash',
  clientId: 'manacost-tracker',
  scopes: ['profile.read', 'subscription.read'],
  status: 'PENDING',
  userId: null,
  createdAt: 1_000,
  expiresAt: 601_000,
  intervalSeconds: 5,
  lastPolledAt: null,
  approvedAt: null,
  deniedAt: null,
  consumedAt: null,
};
assert.equal(repository.insertDevice(device), true);
assert.equal(repository.insertDevice(device), false);
assert.deepEqual(repository.findDeviceByHash(device.deviceCodeHash)?.scopes, device.scopes);
assert.equal(repository.findDeviceByUserCodeHash(device.userCodeHash)?.clientId, device.clientId);
assert.equal(repository.recordDevicePoll(device.deviceCodeHash, 2_000, 10), true);
assert.equal(repository.findDeviceByHash(device.deviceCodeHash)?.intervalSeconds, 10);
assert.equal(repository.approveDevice(device.deviceCodeHash, 'user-1', 3_000), true);

const token: ApplicationToken = {
  id: 'token-1',
  familyId: 'family-1',
  clientId: device.clientId,
  userId: 'user-1',
  scopes: device.scopes,
  accessTokenHash: 'access-1',
  refreshTokenHash: 'refresh-1',
  accessExpiresAt: 903_000,
  refreshExpiresAt: 2_000_000,
  createdAt: 3_000,
  revokedAt: null,
  replacedById: null,
};
assert.equal(repository.issueDeviceTokens(device.deviceCodeHash, token, 3_000), true);
assert.equal(repository.issueDeviceTokens(device.deviceCodeHash, token, 3_000), false);
assert.equal(repository.findTokenByAccessHash('access-1')?.userId, 'user-1');
assert.equal(repository.findTokenByRefreshHash('refresh-1')?.familyId, 'family-1');

const next: ApplicationToken = {
  ...token,
  id: 'token-2',
  accessTokenHash: 'access-2',
  refreshTokenHash: 'refresh-2',
  createdAt: 4_000,
  accessExpiresAt: 904_000,
};
assert.equal(repository.rotateRefreshToken('refresh-1', next, 4_000), true);
assert.equal(repository.rotateRefreshToken('refresh-1', { ...next, id: 'token-3' }, 5_000), false);
assert.equal(repository.findTokenByRefreshHash('refresh-1')?.replacedById, 'token-2');
assert.equal(repository.revokeByRefreshHash('refresh-2', 6_000), true);
assert.equal(repository.findTokenByAccessHash('access-2')?.revokedAt, 6_000);

database.close();
console.log('application auth SQLite repository tests passed');
