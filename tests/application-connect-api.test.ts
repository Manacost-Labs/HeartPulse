import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ApplicationConnectApiError,
  createApplicationConnectApi,
} from '../src/modules/applicationConnect/api/client.js';

test('application connect client preserves inspect request and validates its response', async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  const controller = new AbortController();
  const api = createApplicationConnectApi(async (input, init) => {
    requests.push({ input: String(input), init });
    return new Response(JSON.stringify({
      authorization: {
        clientId: 'tracker',
        clientName: 'Manacost Tracker',
        scopes: ['profile.read'],
        expiresAt: 1_800_000_000_000,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  const authorization = await api.inspect('ABCD-2345', controller.signal);

  assert.deepEqual(authorization, {
    clientId: 'tracker',
    clientName: 'Manacost Tracker',
    scopes: ['profile.read'],
    expiresAt: 1_800_000_000_000,
  });
  assert.deepEqual(requests, [{
    input: '/api/v1/oauth/device/authorization?user_code=ABCD-2345',
    init: { credentials: 'same-origin', cache: 'no-store', signal: controller.signal },
  }]);
});

test('application connect client keeps stable inspect errors for rejected and invalid payloads', async () => {
  const rejected = createApplicationConnectApi(async () => new Response(JSON.stringify({
    error: { code: 'AUTHORIZATION_NOT_FOUND' },
  }), { status: 404 }));
  await assert.rejects(rejected.inspect('ABCD-2345'), (error: unknown) => {
    assert.ok(error instanceof ApplicationConnectApiError);
    assert.equal(error.code, 'AUTHORIZATION_NOT_FOUND');
    assert.equal(error.message, 'Код не найден, уже использован или истёк. Запросите новый код в приложении.');
    return true;
  });

  const malformed = createApplicationConnectApi(async () => new Response(JSON.stringify({
    authorization: { clientId: 'tracker' },
  }), { status: 200 }));
  await assert.rejects(
    malformed.inspect('ABCD-2345'),
    /Не удалось проверить код\. Повторите попытку\./,
  );
});

test('application connect client preserves decision request, CSRF header and login error', async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  const api = createApplicationConnectApi(async (input, init) => {
    requests.push({ input: String(input), init });
    return new Response(JSON.stringify({ error: { code: 'LOGIN_REQUIRED' } }), { status: 401 });
  });

  await assert.rejects(api.decide('ABCD-2345', 'approve'), (error: unknown) => {
    assert.ok(error instanceof ApplicationConnectApiError);
    assert.equal(error.code, 'LOGIN_REQUIRED');
    assert.equal(error.message, 'Войдите в аккаунт Manacost, чтобы продолжить.');
    return true;
  });
  assert.deepEqual(requests, [{
    input: '/api/v1/oauth/device/approve',
    init: {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Request': '1' },
      body: JSON.stringify({ user_code: 'ABCD-2345', decision: 'approve' }),
    },
  }]);
});
