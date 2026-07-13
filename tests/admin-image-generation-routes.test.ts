import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import express from 'express';
import { createAdminImageGenerationRouter } from '../server/adminImageGenerationRoutes.js';

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
}

let currentChild = new FakeChild();
let throwOnRun = false;
const logs: Array<{ level: string; message: string }> = [];
const app = express();
app.use(express.json());
app.use('/api', createAdminImageGenerationRouter({
  adminGuard: (request, response, next) => request.headers['x-test-admin'] === '1'
    ? next()
    : response.status(403).json({ error: 'forbidden' }),
  adminAuth: request => request.headers['x-test-admin'] === '1' ? { id: 'admin' } : null,
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
  jobs: {
    legendaries: { script: '/fixed/script.py', output: '/fixed/output.png', publicUrl: '/generated/output.png', cwd: '/fixed' },
  },
  scriptExists: path => path === '/fixed/script.py',
  run: () => {
    if (throwOnRun) throw new Error('secret executable path');
    currentChild = new FakeChild();
    return currentChild as any;
  },
  log: (level, message) => logs.push({ level, message }),
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const request = (path: string, options: RequestInit = {}, admin = true) => fetch(`http://127.0.0.1:${address.port}/api${path}`, {
  ...options,
  headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(admin ? { 'X-Test-Admin': '1' } : {}) },
});

try {
  const denied = await request('/admin/gen-status', {}, false);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('cache-control'), 'private, no-store');

  const unsupported = await request('/admin/gen-image', { method: 'POST', body: JSON.stringify({ type: '../../shell' }) });
  assert.equal(unsupported.status, 400);
  assert.deepEqual(await unsupported.json(), { error: 'Тип генерации не поддерживается' });

  const started = await request('/admin/gen-image', { method: 'POST', body: JSON.stringify({ type: 'legendaries' }) });
  assert.equal(started.status, 200);
  assert.equal(started.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await started.json(), { message: 'Генерация запущена', outUrl: '/generated/output.png' });
  assert.deepEqual(await (await request('/admin/gen-status')).json(), { busy: true });
  assert.equal((await request('/admin/gen-image', { method: 'POST', body: '{}' })).status, 409);

  currentChild.stderr.write(`line one\n${'x'.repeat(3_000)}`);
  currentChild.emit('error', new Error('python missing'));
  currentChild.emit('close', 1);
  assert.deepEqual(await (await request('/admin/gen-status')).json(), { busy: false });
  assert.ok(logs.some(entry => entry.message.includes('process error: python missing')));
  assert.ok(logs.every(entry => !entry.message.includes('\n') && entry.message.length <= 2_020), 'subprocess logs are flattened and bounded');

  const restarted = await request('/admin/gen-image', { method: 'POST', body: '{}' });
  assert.equal(restarted.status, 200, 'an asynchronous spawn error must release the busy lock');
  currentChild.emit('close', 0);
  assert.deepEqual(await (await request('/admin/gen-status')).json(), { busy: false });

  throwOnRun = true;
  const failedStart = await request('/admin/gen-image', { method: 'POST', body: '{}' });
  assert.equal(failedStart.status, 500);
  assert.deepEqual(await failedStart.json(), { error: 'Не удалось запустить генерацию' });
  assert.deepEqual(await (await request('/admin/gen-status')).json(), { busy: false });
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('admin image generation route tests passed');
