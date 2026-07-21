import assert from 'node:assert/strict';
import express from 'express';
import { createHsDataParserControlClient, HsDataApiError } from '../server/hsDataParserControlClient.js';
import { requestLoggingMiddleware } from '../server/observability.js';

const requests: Array<{ url: string; init: RequestInit }> = [];
const fetchImpl: typeof fetch = async (input, init = {}) => {
  requests.push({ url: String(input), init });
  return new Response(JSON.stringify({ revision: 2, sections: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

const client = createHsDataParserControlClient({
  baseUrl: 'https://api.hs-manacost.ru/',
  apiKey: 'server-secret',
  fetchImpl,
});
assert.equal(client.configured, true);
await client.getControl();
await client.updateSections({
  expectedRevision: 2,
  sections: { arena: true, battlegrounds: false },
  updatedBy: 'admin-1',
});

assert.equal(requests[0]?.url, 'https://api.hs-manacost.ru/admin/parser-control');
assert.equal(new Headers(requests[0]?.init.headers).get('x-api-key'), 'server-secret');
assert.equal(new Headers(requests[0]?.init.headers).get('x-request-id'), null);
assert.equal(requests[1]?.url, 'https://api.hs-manacost.ru/admin/parser-control/sections');
assert.deepEqual(JSON.parse(String(requests[1]?.init.body)), {
  expectedRevision: 2,
  sections: [
    { id: 'arena', enabled: true },
    { id: 'battlegrounds', enabled: false },
  ],
  updatedBy: 'admin-1',
});

const correlatedRequests: Array<{ url: string; init: RequestInit }> = [];
const correlatedClient = createHsDataParserControlClient({
  baseUrl: 'https://api.hs-manacost.ru',
  apiKey: 'server-secret',
  fetchImpl: async (input, init = {}) => {
    correlatedRequests.push({ url: String(input), init });
    return new Response(JSON.stringify({ revision: 3 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
});
const correlationApp = express();
correlationApp.use(requestLoggingMiddleware(() => {}));
correlationApp.get('/proxy', async (_request, response, next) => {
  try {
    response.json(await correlatedClient.getControl());
  } catch (error) {
    next(error);
  }
});
const correlationServer = correlationApp.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  correlationServer.once('listening', resolve);
  correlationServer.once('error', reject);
});
try {
  const address = correlationServer.address();
  assert.ok(address && typeof address === 'object');
  const response = await fetch(`http://127.0.0.1:${address.port}/proxy`, {
    headers: { 'X-Request-ID': 'browser-to-api-request' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-request-id'), 'browser-to-api-request');
  assert.equal(
    new Headers(correlatedRequests[0]?.init.headers).get('x-request-id'),
    'browser-to-api-request',
  );
} finally {
  await new Promise<void>((resolve, reject) => {
    correlationServer.close(error => error ? reject(error) : resolve());
  });
}

let calledWithoutKey = false;
const unconfigured = createHsDataParserControlClient({
  baseUrl: 'https://api.hs-manacost.ru',
  apiKey: '',
  fetchImpl: async () => {
    calledWithoutKey = true;
    return new Response('{}');
  },
});
assert.equal(unconfigured.configured, false);
await assert.rejects(
  () => unconfigured.getControl(),
  (error: unknown) => error instanceof HsDataApiError && error.status === 503,
);
assert.equal(calledWithoutKey, false, 'an unconfigured BFF must not make an unauthenticated upstream request');

const conflictClient = createHsDataParserControlClient({
  baseUrl: 'https://api.hs-manacost.ru',
  apiKey: 'server-secret',
  fetchImpl: async () => new Response(JSON.stringify({
    detail: {
      code: 'REVISION_CONFLICT',
      message: 'Настройки уже изменил другой администратор',
    },
  }), {
    status: 409,
    headers: { 'Content-Type': 'application/json' },
  }),
});
await assert.rejects(
  () => conflictClient.getControl(),
  (error: unknown) => error instanceof HsDataApiError
    && error.status === 409
    && error.message === 'Настройки уже изменил другой администратор'
    && (error as HsDataApiError & { code?: string }).code === 'REVISION_CONFLICT',
);

console.log('HS data parser control client tests passed');
