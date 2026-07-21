import assert from 'node:assert/strict';
import { createHsDataParserControlClient, HsDataApiError } from '../server/hsDataParserControlClient.js';

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
assert.equal(requests[1]?.url, 'https://api.hs-manacost.ru/admin/parser-control/sections');
assert.deepEqual(JSON.parse(String(requests[1]?.init.body)), {
  expectedRevision: 2,
  sections: [
    { id: 'arena', enabled: true },
    { id: 'battlegrounds', enabled: false },
  ],
  updatedBy: 'admin-1',
});

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
