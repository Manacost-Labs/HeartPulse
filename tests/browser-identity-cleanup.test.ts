import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createIdentityAdapter } from '../server/modules/browserIdentity/public.ts';
import { cleanupIdentityStorage } from '../server/modules/browserIdentity/cleanup.ts';
import { initializeIdentityStorage } from '../server/modules/browserIdentity/schema.ts';

test('cleanup deletes at most 500 expired unconsumed rows per table at exact unit cutoffs', () => {
  const db = new DatabaseSync(':memory:');
  try {
    initializeIdentityStorage(db);
    const now = 1_800_000_000_000;
    const seconds = Math.floor(now / 1_000);
    const insertModel = db.prepare(`INSERT INTO browser_identity_models
      (model, id_hash, payload, expires_at, consumed) VALUES (?, ?, 'opaque', ?, ?)`);
    for (let index = 0; index < 501; index += 1) insertModel.run('Session', `expired-${index}`, seconds, null);
    insertModel.run('Session', 'fresh', seconds + 1, null);
    insertModel.run('Session', 'persistent', null, null);
    insertModel.run('Session', 'consumed', seconds, seconds - 1);
    const insertBinding = db.prepare(`INSERT INTO browser_identity_session_bindings
      (grant_hash, payload, expires_at) VALUES (?, 'opaque', ?)`);
    for (let index = 0; index < 501; index += 1) insertBinding.run(`binding-${index}`, now);
    insertBinding.run('binding-fresh', now + 1);

    assert.deepEqual(cleanupIdentityStorage(db, now), { models: 500, bindings: 500 });
    assert.equal(db.prepare('SELECT count(*) AS value FROM browser_identity_models WHERE expires_at = ? AND consumed IS NULL').get(seconds).value, 1);
    assert.equal(db.prepare("SELECT count(*) AS value FROM browser_identity_models WHERE id_hash IN ('fresh', 'persistent', 'consumed')").get().value, 3);
    assert.equal(db.prepare('SELECT count(*) AS value FROM browser_identity_session_bindings WHERE expires_at = ?').get(now).value, 1);
    assert.equal(db.prepare("SELECT count(*) AS value FROM browser_identity_session_bindings WHERE grant_hash = 'binding-fresh'").get().value, 1);
  } finally { db.close(); }
});

test('cleanup retains replay and revocation evidence, including a late upsert', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    let seconds = 1_800_000_000;
    const Adapter = createIdentityAdapter(db, randomBytes(32), () => seconds);
    const refresh = new Adapter('RefreshToken');
    await refresh.upsert('consumed-only', { grantId: 'still-live-grant' }, 1);
    await refresh.consume('consumed-only');
    await refresh.upsert('refresh', { grantId: 'grant' }, 1);
    await refresh.consume('refresh');
    await assert.rejects(refresh.consume('refresh'));
    seconds += 2;
    cleanupIdentityStorage(db, seconds * 1_000);
    // A late write cannot erase consumed state after expiry housekeeping.
    await refresh.upsert('consumed-only', { grantId: 'still-live-grant' }, 60);
    await assert.rejects(refresh.consume('consumed-only'));
    await assert.rejects(refresh.upsert('late-consumed', { grantId: 'still-live-grant' }, 60));
    await assert.rejects(refresh.upsert('late', { grantId: 'grant' }, 60));
    assert.equal(db.prepare('SELECT count(*) AS value FROM browser_identity_revoked_grants').get().value, 2);
  } finally { db.close(); }
});
