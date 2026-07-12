import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express, { type RequestHandler } from 'express';
import {
  createAdminClassPositionRouter,
  writeClassPositionsFile,
  type ClassPositionsDocument,
} from '../server/adminClassPositionRoutes.js';

let loadFailure = false;
let saveFailure = false;
let savedDocument: ClassPositionsDocument | null = null;
const guard: RequestHandler = (request, response, next) => {
  if (request.headers['x-admin-guard'] !== 'allowed') return response.status(403).json({ error: 'forbidden' });
  return next();
};

const app = express();
app.use(express.json());
app.use('/api', createAdminClassPositionRouter({
  adminGuard: guard,
  adminAuth: request => request.headers['x-admin-auth'] === 'yes' ? { id: 'admin' } : null,
  loadPositions: () => {
    if (loadFailure) throw new Error('sensitive storage path');
    return { positions: { mage: '1' }, updatedAt: '2026-07-12T12:00:00.000Z' };
  },
  savePositions: document => {
    if (saveFailure) throw new Error('sensitive storage path');
    savedDocument = document;
  },
  setPrivateNoStore: response => { response.set('Cache-Control', 'private, no-store'); },
  now: () => new Date('2026-07-12T18:30:00.000Z'),
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const endpoint = `http://127.0.0.1:${address.port}/api/admin-class-positions`;
const authorizedHeaders = {
  'Content-Type': 'application/json',
  'X-Admin-Guard': 'allowed',
  'X-Admin-Auth': 'yes',
};

try {
  const denied = await fetch(endpoint);
  assert.equal(denied.status, 403);

  const unauthenticated = await fetch(endpoint, { headers: { 'X-Admin-Guard': 'allowed' } });
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.headers.get('cache-control'), 'private, no-store');

  const loaded = await fetch(endpoint, { headers: authorizedHeaders });
  assert.equal(loaded.status, 200);
  assert.equal(loaded.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await loaded.json(), {
    positions: { mage: '1' },
    updatedAt: '2026-07-12T12:00:00.000Z',
  });

  loadFailure = true;
  const failedLoad = await fetch(endpoint, { headers: authorizedHeaders });
  assert.equal(failedLoad.status, 500);
  assert.deepEqual(await failedLoad.json(), { error: 'Не удалось загрузить позиции классов' });
  loadFailure = false;

  for (const positions of [null, [], { mage: { row: 1 } }, { constructor: '1' }, { ['x'.repeat(81)]: '1' }, { mage: 'x'.repeat(121) }]) {
    const invalid = await fetch(endpoint, {
      method: 'POST',
      headers: authorizedHeaders,
      body: JSON.stringify({ positions }),
    });
    assert.equal(invalid.status, 400, `expected invalid positions to fail: ${JSON.stringify(positions)}`);
  }

  const tooMany = Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`class-${index}`, String(index)]));
  const tooManyResponse = await fetch(endpoint, {
    method: 'POST',
    headers: authorizedHeaders,
    body: JSON.stringify({ positions: tooMany }),
  });
  assert.equal(tooManyResponse.status, 400);

  const saved = await fetch(endpoint, {
    method: 'POST',
    headers: authorizedHeaders,
    body: JSON.stringify({ positions: { ' mage ': ' 1 ', warrior: 2, rogue: '   ', друид: 'A' } }),
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get('cache-control'), 'private, no-store');
  const expectedDocument = {
    positions: { mage: '1', warrior: '2', друид: 'A' },
    updatedAt: '2026-07-12T18:30:00.000Z',
  };
  assert.deepEqual(await saved.json(), { success: true, ...expectedDocument });
  assert.deepEqual(JSON.parse(JSON.stringify(savedDocument)), expectedDocument);

  saveFailure = true;
  const failedSave = await fetch(endpoint, {
    method: 'POST',
    headers: authorizedHeaders,
    body: JSON.stringify({ positions: { mage: '1' } }),
  });
  assert.equal(failedSave.status, 500);
  assert.deepEqual(await failedSave.json(), { error: 'Не удалось сохранить позиции классов' });
  saveFailure = false;

  const directory = mkdtempSync(join(tmpdir(), 'hs-arena-class-positions-'));
  try {
    const destination = writeClassPositionsFile(directory, expectedDocument);
    assert.equal(destination, join(directory, 'class_positions.json'));
    assert.deepEqual(JSON.parse(readFileSync(destination, 'utf8')), expectedDocument);
    assert.equal(statSync(destination).mode & 0o777, 0o640);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('admin class-position router contract tests passed');
