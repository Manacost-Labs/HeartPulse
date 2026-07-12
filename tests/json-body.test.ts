import assert from 'node:assert/strict';
import express from 'express';
import { createRouteAwareJsonParser, jsonLimitForBase64Binary } from '../server/jsonBody.js';

assert.equal(jsonLimitForBase64Binary(12 * 1024 * 1024), 17_039_360);
assert.ok(jsonLimitForBase64Binary(32 * 1024 * 1024) < 43 * 1024 * 1024);

const app = express();
app.use(createRouteAwareJsonParser({
  defaultLimit: 100,
  adminUploadMaxBytes: 300,
  galleryUploadMaxBytes: 600,
}));
app.post('*', (req, res) => res.json({ length: String(req.body?.value || '').length }));
app.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(Number(error?.status) || 500).json({ error: 'body rejected' });
});

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});

async function post(path: string, size: number): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return fetch(`http://127.0.0.1:${address.port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: 'x'.repeat(size) }),
  });
}

try {
  assert.equal((await post('/api/auth/login', 150)).status, 413);
  assert.equal((await post('/api/admin/uploads/image', 150)).status, 200);
  assert.equal((await post('/api/admin/gallery?source=test', 400)).status, 200);
  assert.equal((await post('/api/admin/gallery-other', 150)).status, 413);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('route-aware JSON body limit tests passed');
