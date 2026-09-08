import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import express from 'express';
import { registerBrowserIdentity } from '../server/app/registerBrowserIdentity.js';
import { startIdentityCleanup } from '../server/modules/browserIdentity/cleanupLifecycle.js';
import { initializeIdentityStorage } from '../server/modules/browserIdentity/schema.js';

test('disabled identity composition never opens the canonical database', () => {
  const result = registerBrowserIdentity({ app: express(), authCookieName: 'canonical',
    getDatabase: () => { throw new Error('Must not open database'); }, environment: {} });
  assert.equal(result, undefined);
});

test('cleanup lifecycle performs a bounded tick and stop cancels future ticks', context => {
  context.mock.timers.enable({ apis: ['setInterval'] });
  const db = new DatabaseSync(':memory:');
  initializeIdentityStorage(db);
  const insert = () => db.exec("INSERT INTO browser_identity_session_bindings VALUES ('expired', 'opaque', 1)");
  const lifecycle = startIdentityCleanup(db);
  try {
    insert();
    context.mock.timers.tick(60_000);
    assert.equal(db.prepare('SELECT count(*) AS n FROM browser_identity_session_bindings').get().n, 0);
    lifecycle.stop();
    insert();
    context.mock.timers.tick(120_000);
    assert.equal(db.prepare('SELECT count(*) AS n FROM browser_identity_session_bindings').get().n, 1);
  } finally { lifecycle.stop(); db.close(); context.mock.timers.reset(); }
});
