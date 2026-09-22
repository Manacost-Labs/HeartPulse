import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createIdentityAdapter } from '../server/modules/browserIdentity/public.ts';

function fixture() {
  const database = new DatabaseSync(':memory:');
  const key = randomBytes(32);
  let now = 1_800_000_000;
  const Adapter = createIdentityAdapter(database, key, () => now);
  return { database, key, Adapter, advance: (seconds: number) => { now += seconds; } };
}

test('payload survives adapter recreation, with opaque identifiers and encrypted claims at rest', async () => {
  const f = fixture();
  try {
    const payload = { accountId: 'private-account', grantId: 'private-grant', uid: 'private-uid' };
    await new f.Adapter('Session').upsert('secret-session', payload, 600);
    const rows = JSON.stringify(f.database.prepare('SELECT * FROM browser_identity_models').all());
    for (const secret of ['private-account', 'private-grant', 'private-uid', 'secret-session']) {
      assert.ok(!rows.includes(secret));
    }
    const Restarted = createIdentityAdapter(f.database, f.key, () => 1_800_000_001);
    assert.deepEqual(await new Restarted('Session').find('secret-session'), payload);
    assert.deepEqual(await new Restarted('Session').findByUid('private-uid'), payload);
    assert.equal(await new Restarted('AccessToken').find('secret-session'), undefined);
  } finally { f.database.close(); }
});

test('expiration is exclusive and applies to all lookup methods', async () => {
  const f = fixture();
  try {
    const adapter = new f.Adapter('DeviceCode');
    await adapter.upsert('code', { uid: 'uid', userCode: 'user-code' }, 10);
    assert.ok(await adapter.findByUserCode('user-code'));
    f.advance(10);
    assert.equal(await adapter.find('code'), undefined);
    assert.equal(await adapter.findByUid('uid'), undefined);
    assert.equal(await adapter.findByUserCode('user-code'), undefined);
    await assert.rejects(adapter.consume('code'));
  } finally { f.database.close(); }
});

test('consume preserves replay evidence through upsert', async () => {
  const f = fixture();
  try {
    const adapter = new f.Adapter('AuthorizationCode');
    await adapter.upsert('code', { grantId: 'grant' }, 60);
    await adapter.consume('code');
    assert.ok((await adapter.find('code'))?.consumed);
    await adapter.upsert('code', { grantId: 'grant' }, 60);
    assert.ok((await adapter.find('code'))?.consumed);
    await assert.rejects(adapter.consume('code'));
  } finally { f.database.close(); }
});

test('racing consume rejects replay and revokes the grant even after both callers read it', async () => {
  const f = fixture();
  try {
    const adapter = new f.Adapter('RefreshToken');
    await adapter.upsert('refresh', { grantId: 'grant' }, 60);
    await new f.Adapter('AccessToken').upsert('access', { grantId: 'grant' }, 60);
    const snapshots = await Promise.all([adapter.find('refresh'), adapter.find('refresh')]);
    assert.ok(snapshots.every((snapshot) => snapshot && !snapshot.consumed));
    const attempts = await Promise.allSettled([adapter.consume('refresh'), adapter.consume('refresh')]);
    assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(await new f.Adapter('AccessToken').find('access'), undefined);
    await assert.rejects(adapter.upsert('rotated', { grantId: 'grant' }, 60));
  } finally { f.database.close(); }
});

test('grant revocation removes all token models and prevents resurrection', async () => {
  const f = fixture();
  try {
    const access = new f.Adapter('AccessToken');
    const refresh = new f.Adapter('RefreshToken');
    await access.upsert('access', { grantId: 'grant' }, 60);
    await refresh.upsert('refresh', { grantId: 'grant' }, 600);
    await refresh.upsert('unrelated', { grantId: 'other' }, 600);
    await access.revokeByGrantId('grant');
    assert.equal(await access.find('access'), undefined);
    assert.equal(await refresh.find('refresh'), undefined);
    assert.ok(await refresh.find('unrelated'));
    await assert.rejects(refresh.upsert('replacement', { grantId: 'grant' }, 600));
  } finally { f.database.close(); }
});

test('tampered encrypted payload fails closed; invalid encryption key is rejected', async () => {
  const f = fixture();
  try {
    assert.throws(() => createIdentityAdapter(f.database, randomBytes(16)));
    const adapter = new f.Adapter('Session');
    await adapter.upsert('session', { accountId: 'private' }, 60);
    f.database.prepare("UPDATE browser_identity_models SET payload = 'tampered'").run();
    await assert.rejects(adapter.find('session'));
  } finally { f.database.close(); }
});
